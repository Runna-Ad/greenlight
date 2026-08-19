// Cálculo PURO de la Evaluación por especialista (sin React ni Supabase), para
// probarlo con el harness de node y compartirlo entre el loader y la UI.
//
// El modelo (decidido con Pedro): por TAREA y por CRITERIO es BINARIO. Si una
// tarea tuvo ≥1 cambio de tipo X → 0 en X; si no tuvo ninguno → 10 en X. El
// puntaje del especialista en X = promedio de sus tareas (= regla de 3:
// tareas_limpias_de_X ÷ tareas_totales × 10). El overall = media de los criterios.
//
// UNIDAD DE PERIODO = la TAREA APROBADA (completed_at dentro del mes). Una tarea
// se aprueba UNA sola vez y completed_at es inmutable → el reporte de un mes es
// REPRODUCIBLE y no hay doble conteo si una tarea rebota entre meses (se cuenta en
// el mes en que se aprobó, con TODAS sus correcciones ya finales). Es exactamente
// "el tiempo que tardan en completar una tarea, donde el lead la aprueba".
//
// Datos hacia adelante: los cambios sin categoría (legacy / cliente / campo entero
// sin tipo) NO ponen 0 en ningún criterio (categoria null no matchea), pero SÍ
// cuentan como cambios para rondas/cambios-por-ronda — eran cambios reales.

import { CRITERIOS_PUNTUABLES, GRUPO_LABEL, type CategoriaCambio, type GrupoCriterio } from "./tipos-cambio.ts";

export type Track = "real" | "normal";

export type MiembroInput = { id: string; name: string; color: string; track: Track };
/** Asignación de un miembro a una idea (con su rol en esa tarea y cuándo). */
export type AsignacionInput = { ideaId: string; memberId: string; esLead: boolean; assignedAt: string | null };
/** Una corrección interna (kind='correction_request') con su tipo y ronda. */
export type CorreccionInput = { ideaId: string; categoria: string | null; ronda: number | null };
export type IdeaInput = { id: string; completedAt: string | null };
/** Ventana del reporte [desde, hasta) en ISO; `hasta` exclusivo. */
export type Periodo = { desde: string; hasta: string };

export type ScoreCriterio = {
  slug: CategoriaCambio;
  label: string;
  grupo: GrupoCriterio;
  grupoLabel: string;
  /** 0–10, o null si no hay tareas evaluables (sin dato). */
  score: number | null;
  /** Cuántas de las tareas evaluables tuvieron ≥1 cambio de este tipo. */
  tareasConCambio: number;
};

export type EvalMiembro = {
  memberId: string;
  name: string;
  color: string;
  track: Track;
  /** Tareas evaluables en el periodo (aprobadas dentro del mes). */
  tareas: number;
  scorePorCriterio: ScoreCriterio[];
  /** Media de los criterios (null si no hay tareas). */
  overall: number | null;
  /** Promedio de rondas de cambios por tarea (una tarea sin cambios = 0 rondas). */
  rondasPorTarea: number | null;
  /** Cambios por ronda (total cambios ÷ total rondas); null si no hubo rondas. */
  cambiosPorRonda: number | null;
  /** Mediana asignación→aprobación en días; null si nada. */
  cicloMedianoDias: number | null;
};

// Compara instantes por su valor numérico, no como cadenas: los ISO de la app
// (`.toISOString()` → "…Z") y los de PostgREST ("…+00:00") NO ordenan igual como
// texto en el borde exacto del mes. Date.parse los normaliza.
const enRango = (at: string, p: Periodo): boolean => {
  const t = Date.parse(at);
  return t >= Date.parse(p.desde) && t < Date.parse(p.hasta);
};

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Evalúa a cada miembro de `miembros` (ya filtrados por el equipo visible) sobre
 * el `periodo`. Una tarea es evaluable para un miembro si él es asignado NO-lead
 * de esa idea y la idea fue APROBADA (completed_at) dentro del periodo.
 */
export function evaluarEquipo(
  miembros: MiembroInput[],
  asignaciones: AsignacionInput[],
  correcciones: CorreccionInput[],
  ideas: IdeaInput[],
  periodo: Periodo,
): EvalMiembro[] {
  // idea → set de rondas con ≥1 corrección, conteo total, y categorías presentes.
  const corrPorIdea = new Map<string, { rondas: Set<number>; total: number; cats: Set<string> }>();
  for (const c of correcciones) {
    const e = corrPorIdea.get(c.ideaId) ?? { rondas: new Set<number>(), total: 0, cats: new Set<string>() };
    e.total += 1;
    if (c.ronda != null) e.rondas.add(c.ronda);
    if (c.categoria) e.cats.add(c.categoria);
    corrPorIdea.set(c.ideaId, e);
  }

  // idea → completed_at, SÓLO si se aprobó dentro del periodo.
  const completadaEnP = new Map<string, string>();
  for (const i of ideas) {
    if (i.completedAt && enRango(i.completedAt, periodo)) completadaEnP.set(i.id, i.completedAt);
  }

  // miembro → sus asignaciones NO-lead (ideaId → assignedAt).
  const tareasDeMiembro = new Map<string, Map<string, string | null>>();
  for (const a of asignaciones) {
    if (a.esLead) continue;
    const m = tareasDeMiembro.get(a.memberId) ?? new Map<string, string | null>();
    m.set(a.ideaId, a.assignedAt);
    tareasDeMiembro.set(a.memberId, m);
  }

  return miembros.map((mem) => {
    const suyas = tareasDeMiembro.get(mem.id) ?? new Map<string, string | null>();
    const ideaIds = [...suyas.keys()].filter((id) => completadaEnP.has(id));
    const tareas = ideaIds.length;

    // Puntaje por criterio (crudo para promediar, redondeado para mostrar).
    let sumaRaw = 0;
    const scorePorCriterio: ScoreCriterio[] = CRITERIOS_PUNTUABLES.map((crit) => {
      const conCambio = ideaIds.filter((id) => corrPorIdea.get(id)?.cats.has(crit.slug)).length;
      const raw = tareas ? ((tareas - conCambio) / tareas) * 10 : null;
      if (raw != null) sumaRaw += raw;
      return {
        slug: crit.slug,
        label: crit.label,
        grupo: crit.grupo,
        grupoLabel: GRUPO_LABEL[crit.grupo],
        score: raw == null ? null : round1(raw),
        tareasConCambio: conCambio,
      };
    });
    // Se promedia lo CRUDO y se redondea UNA vez (evita doble redondeo).
    const overall = tareas ? round1(sumaRaw / CRITERIOS_PUNTUABLES.length) : null;

    let totalRondas = 0;
    let totalCambios = 0;
    const ciclos: number[] = [];
    for (const id of ideaIds) {
      const c = corrPorIdea.get(id);
      if (c) {
        totalRondas += c.rondas.size;
        totalCambios += c.total;
      }
      const comp = completadaEnP.get(id);
      const asig = suyas.get(id);
      if (comp && asig) {
        const dias = (Date.parse(comp) - Date.parse(asig)) / 86_400_000;
        if (dias >= 0) ciclos.push(dias);
      }
    }

    const mCiclo = mediana(ciclos);
    return {
      memberId: mem.id,
      name: mem.name,
      color: mem.color,
      track: mem.track,
      tareas,
      scorePorCriterio,
      overall,
      rondasPorTarea: tareas ? round1(totalRondas / tareas) : null,
      cambiosPorRonda: totalRondas ? round1(totalCambios / totalRondas) : null,
      cicloMedianoDias: mCiclo == null ? null : round1(mCiclo),
    };
  });
}
