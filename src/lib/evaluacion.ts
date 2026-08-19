// Cálculo PURO de la Evaluación por especialista (sin React ni Supabase), para
// probarlo con el harness de node y compartirlo entre el loader y la UI.
//
// MODELO (decidido con Pedro):
// - Por TAREA y por CRITERIO es BINARIO: si una tarea tuvo ≥1 cambio de tipo X en
//   una sección que ESA persona escribió → 0 en X para esa tarea; si no → 10. El
//   puntaje del especialista en X = promedio de sus tareas.
// - ATRIBUCIÓN POR AUTOR (fase 2.5): un cambio se le cuenta a quien REALMENTE
//   escribió la sección corregida (no a todos los asignados). Así una tarea
//   co-asignada se reparte bien: el cambio en el Plano 2 es de quien escribió el
//   Plano 2. La autoría sale de `field_edits` (quién guardó cada campo, y cuándo).
// - UNIDAD DE PERIODO = la TAREA APROBADA (completed_at dentro del mes): inmutable
//   → el reporte de un mes es reproducible y una tarea que rebota entre meses no
//   se cuenta doble.
//
// Cambios SIN autor (contenido importado que nadie editó por la app, o sin
// identidad) NO penalizan a nadie — mejor no atribuir que culpar al que no fue.

import { CRITERIOS_PUNTUABLES, GRUPO_LABEL, type CategoriaCambio, type GrupoCriterio } from "./tipos-cambio.ts";

export type Track = "real" | "normal";

export type MiembroInput = { id: string; name: string; color: string; track: Track };
/** Quién AUTORÓ (editó ≥1 campo de) una idea. */
export type AutoriaInput = { ideaId: string; memberId: string };
/** Una edición de un campo: quién y cuándo (de field_edits). */
export type EditInput = {
  ideaId: string;
  tabla: string;
  filaId: string | null;
  campo: string;
  memberId: string;
  at: string;
};
/** Una corrección interna con su destino y cuándo se pidió (para atribuir autor). */
export type CorreccionInput = {
  ideaId: string;
  categoria: string | null;
  ronda: number | null;
  tabla: string | null;
  filaId: string | null;
  campo: string | null;
  createdAt: string;
};
/** Una corrección ya atribuida a su autor (o null si no se pudo). */
export type CorreccionAtribuida = {
  ideaId: string;
  categoria: string | null;
  ronda: number | null;
  autorId: string | null;
};
export type AsignacionInput = { ideaId: string; memberId: string; assignedAt: string | null };
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
  /** Tareas evaluables (aprobadas en el mes) que esta persona AUTORÓ. */
  tareas: number;
  scorePorCriterio: ScoreCriterio[];
  overall: number | null;
  rondasPorTarea: number | null;
  cambiosPorRonda: number | null;
  cicloMedianoDias: number | null;
};

// Compara instantes por valor numérico (los ISO de la app "…Z" y los de PostgREST
// "…+00:00" NO ordenan igual como texto en el borde exacto del mes).
const enRango = (at: string, p: Periodo): boolean => {
  const t = Date.parse(at);
  return t >= Date.parse(p.desde) && t < Date.parse(p.hasta);
};

const claveCampo = (tabla: string | null, filaId: string | null, campo: string | null): string =>
  `${tabla ?? ""}|${filaId ?? ""}|${campo ?? ""}`;

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Atribuye cada corrección a QUIEN escribió la sección corregida: la última
 * edición de ese campo con `at <= createdAt` de la corrección (quien escribió la
 * versión que el revisor marcó). Las ediciones posteriores (rework) no cambian la
 * atribución de una corrección ya creada. `autorId=null` si no hay edición previa.
 */
export function atribuirAutor(
  correcciones: CorreccionInput[],
  edits: EditInput[],
): CorreccionAtribuida[] {
  const porCampo = new Map<string, { at: number; memberId: string }[]>();
  for (const e of edits) {
    const k = claveCampo(e.tabla, e.filaId, e.campo);
    (porCampo.get(k) ?? porCampo.set(k, []).get(k)!).push({ at: Date.parse(e.at), memberId: e.memberId });
  }
  return correcciones.map((c) => {
    const t = Date.parse(c.createdAt);
    const lista = porCampo.get(claveCampo(c.tabla, c.filaId, c.campo)) ?? [];
    let autorId: string | null = null;
    let mejor = -Infinity;
    for (const e of lista) {
      if (e.at <= t && e.at > mejor) {
        mejor = e.at;
        autorId = e.memberId;
      }
    }
    return { ideaId: c.ideaId, categoria: c.categoria, ronda: c.ronda, autorId };
  });
}

/**
 * Evalúa a cada miembro de `miembros` (ya filtrados por el equipo visible) sobre
 * el `periodo`. Una tarea es evaluable para un miembro si él AUTORÓ ≥1 sección y
 * la idea fue APROBADA (completed_at) dentro del periodo. Un criterio le pone 0 en
 * una tarea sólo si hay un cambio de ese tipo en una sección que ÉL escribió.
 */
export function evaluarEquipo(
  miembros: MiembroInput[],
  autoria: AutoriaInput[],
  correcciones: CorreccionAtribuida[],
  asignaciones: AsignacionInput[],
  ideas: IdeaInput[],
  periodo: Periodo,
): EvalMiembro[] {
  const completadaEnP = new Map<string, string>();
  for (const i of ideas) {
    if (i.completedAt && enRango(i.completedAt, periodo)) completadaEnP.set(i.id, i.completedAt);
  }

  // miembro → tareas que AUTORÓ (dentro de las aprobadas en el periodo).
  const tareasAutor = new Map<string, Set<string>>();
  for (const a of autoria) {
    if (!completadaEnP.has(a.ideaId)) continue;
    (tareasAutor.get(a.memberId) ?? tareasAutor.set(a.memberId, new Set<string>()).get(a.memberId)!).add(
      a.ideaId,
    );
  }

  // miembro → ideaId → assignedAt (para el ciclo).
  const asigDe = new Map<string, Map<string, string | null>>();
  for (const a of asignaciones) {
    (asigDe.get(a.memberId) ?? asigDe.set(a.memberId, new Map<string, string | null>()).get(a.memberId)!).set(
      a.ideaId,
      a.assignedAt,
    );
  }

  // miembro → ideaId → {cats, rondas, total} de las correcciones EN SUS secciones.
  const corrDe = new Map<string, Map<string, { cats: Set<string>; rondas: Set<number>; total: number }>>();
  for (const c of correcciones) {
    if (!c.autorId || !completadaEnP.has(c.ideaId)) continue;
    const byIdea = corrDe.get(c.autorId) ?? corrDe.set(c.autorId, new Map()).get(c.autorId)!;
    const e = byIdea.get(c.ideaId) ?? { cats: new Set<string>(), rondas: new Set<number>(), total: 0 };
    e.total += 1;
    if (c.ronda != null) e.rondas.add(c.ronda);
    if (c.categoria) e.cats.add(c.categoria);
    byIdea.set(c.ideaId, e);
  }

  return miembros.map((mem) => {
    const ideaIds = [...(tareasAutor.get(mem.id) ?? new Set<string>())];
    const tareas = ideaIds.length;
    const misCorr = corrDe.get(mem.id) ?? new Map<string, { cats: Set<string>; rondas: Set<number>; total: number }>();
    const asig = asigDe.get(mem.id) ?? new Map<string, string | null>();

    let sumaRaw = 0;
    const scorePorCriterio: ScoreCriterio[] = CRITERIOS_PUNTUABLES.map((crit) => {
      const conCambio = ideaIds.filter((id) => misCorr.get(id)?.cats.has(crit.slug)).length;
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
    const overall = tareas ? round1(sumaRaw / CRITERIOS_PUNTUABLES.length) : null;

    let totalRondas = 0;
    let totalCambios = 0;
    const ciclos: number[] = [];
    for (const id of ideaIds) {
      const c = misCorr.get(id);
      if (c) {
        totalRondas += c.rondas.size;
        totalCambios += c.total;
      }
      const comp = completadaEnP.get(id);
      const a = asig.get(id);
      if (comp && a) {
        const dias = (Date.parse(comp) - Date.parse(a)) / 86_400_000;
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
