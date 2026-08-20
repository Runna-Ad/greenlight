// Cálculo PURO de la Evaluación por especialista (sin React ni Supabase), para
// probarlo con el harness de node y compartirlo entre el loader y la UI.
//
// MODELO (decidido con Pedro; v2 2026-08-20 = dos ejes):
// - CALIDAD = promedio de 9 criterios BINARIOS por tarea (8 de contenido + "Resolución"):
//   si una tarea tuvo ≥1 cambio de tipo X en una sección que ESA persona escribió → 0 en X
//   para esa tarea; si no → 10. "Resolución" = 0 si alguna nota suya tuvo un rework fallido
//   (el lead aplicó la sugerencia de H.Ü.E sobre una nota ya atendida = su arreglo fue malo).
// - EFICIENCIA = de rondas/tarea + cambios/ronda (curvas ajustables; menos = mejor).
// - OVERALL = 0.70·Calidad + 0.30·Eficiencia.
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

import { CRITERIOS_PUNTUABLES, GRUPO_LABEL, type GrupoCriterio } from "./tipos-cambio.ts";

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
  /** Rework fallido: el lead aplicó la sugerencia de H.Ü.E sobre esta nota YA atendida
   *  (hue_aplicado_at set && atendido_at set) → el arreglo del especialista fue incompleto. */
  reworkFallido: boolean;
};
/** Una corrección ya atribuida a su autor (o null si no se pudo). */
export type CorreccionAtribuida = {
  ideaId: string;
  categoria: string | null;
  ronda: number | null;
  autorId: string | null;
  reworkFallido: boolean;
};
export type AsignacionInput = { ideaId: string; memberId: string; assignedAt: string | null };
export type IdeaInput = { id: string; completedAt: string | null };
/** Ventana del reporte [desde, hasta) en ISO; `hasta` exclusivo. */
export type Periodo = { desde: string; hasta: string };

export type ScoreCriterio = {
  /** slug de un tipo de cambio, o "resolucion" (criterio sintético de proceso). */
  slug: string;
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
  /** Promedio de los 9 criterios binarios (8 de contenido + Resolución). 0–10. */
  calidad: number | null;
  /** De rondas + cambios/ronda (curvas ajustables abajo). 0–10. */
  eficiencia: number | null;
  /** Nota global = PESO_CALIDAD·Calidad + PESO_EFICIENCIA·Eficiencia. 0–10. */
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
const clamp10 = (x: number) => Math.max(0, Math.min(10, x));

// Eficiencia — curvas AJUSTABLES (defaults; calibrar con datos reales). Menos rondas y
// menos cambios por ronda = mejor. Overall = PESO_CALIDAD·Calidad + PESO_EFICIENCIA·Eficiencia.
const RONDA_IDEAL = 1; // 1 ronda por tarea = 10
const RONDA_PENAL = 3; // −3 por cada ronda promedio extra (2→7, 3→4, 4→1)
const CAMBIOS_IDEAL = 2; // ≤2 cambios/ronda = 10
const CAMBIOS_PENAL = 2; // −2 por cada cambio/ronda extra (3→8, 5→4, 7→0)
const PESO_CALIDAD = 0.7;
const PESO_EFICIENCIA = 0.3;

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
    return { ideaId: c.ideaId, categoria: c.categoria, ronda: c.ronda, autorId, reworkFallido: c.reworkFallido };
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

  // miembro → ideaId → {cats, rondas, total, reworkFallido} de las correcciones EN SUS secciones.
  type CorrIdea = { cats: Set<string>; rondas: Set<number>; total: number; reworkFallido: boolean };
  const corrDe = new Map<string, Map<string, CorrIdea>>();
  for (const c of correcciones) {
    if (!c.autorId || !completadaEnP.has(c.ideaId)) continue;
    const byIdea = corrDe.get(c.autorId) ?? corrDe.set(c.autorId, new Map()).get(c.autorId)!;
    const e = byIdea.get(c.ideaId) ?? { cats: new Set<string>(), rondas: new Set<number>(), total: 0, reworkFallido: false };
    e.total += 1;
    if (c.ronda != null) e.rondas.add(c.ronda);
    if (c.categoria) e.cats.add(c.categoria);
    if (c.reworkFallido) e.reworkFallido = true;
    byIdea.set(c.ideaId, e);
  }

  return miembros.map((mem) => {
    const ideaIds = [...(tareasAutor.get(mem.id) ?? new Set<string>())];
    const tareas = ideaIds.length;
    const misCorr = corrDe.get(mem.id) ?? new Map<string, CorrIdea>();
    const asig = asigDe.get(mem.id) ?? new Map<string, string | null>();

    // Los 8 criterios de CONTENIDO (binarios por tarea): 0 si hubo ≥1 nota de ese tipo
    // en una sección que ÉL escribió, 10 si no.
    let sumaContent = 0;
    const scorePorCriterio: ScoreCriterio[] = CRITERIOS_PUNTUABLES.map((crit) => {
      const conCambio = ideaIds.filter((id) => misCorr.get(id)?.cats.has(crit.slug)).length;
      const raw = tareas ? ((tareas - conCambio) / tareas) * 10 : null;
      if (raw != null) sumaContent += raw;
      return {
        slug: crit.slug,
        label: crit.label,
        grupo: crit.grupo,
        grupoLabel: GRUPO_LABEL[crit.grupo],
        score: raw == null ? null : round1(raw),
        tareasConCambio: conCambio,
      };
    });

    // Criterio SINTÉTICO "Resolución de cambios" (binario por tarea): 0 si alguna nota del
    // autor en esa tarea tuvo un rework fallido (el lead aplicó H.Ü.E sobre una nota ya
    // atendida), 10 si no. Se cuenta como un 9º criterio de Calidad.
    const conFallo = ideaIds.filter((id) => misCorr.get(id)?.reworkFallido).length;
    const resolRaw = tareas ? ((tareas - conFallo) / tareas) * 10 : null;
    scorePorCriterio.push({
      slug: "resolucion",
      label: "Resolución de cambios",
      grupo: "proceso",
      grupoLabel: GRUPO_LABEL.proceso,
      score: resolRaw == null ? null : round1(resolRaw),
      tareasConCambio: conFallo,
    });

    // Calidad = promedio de los 9 criterios binarios (8 de contenido + Resolución).
    const calidadRaw = tareas ? (sumaContent + (resolRaw ?? 0)) / (CRITERIOS_PUNTUABLES.length + 1) : null;

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
    // Raw (sin redondear) para las curvas de Eficiencia; el display se redondea aparte.
    const rondasRaw = tareas ? totalRondas / tareas : null;
    const cambiosRaw = totalRondas ? totalCambios / totalRondas : null;
    // Eficiencia: sub-nota por rondas y por cambios/ronda (curvas ajustables). Una tarea
    // sin rondas (0 notas) puntúa 10 en ambas → Eficiencia 10.
    const scoreRondas = rondasRaw == null ? null : clamp10(10 - Math.max(0, rondasRaw - RONDA_IDEAL) * RONDA_PENAL);
    const scoreCambios = cambiosRaw == null ? 10 : clamp10(10 - Math.max(0, cambiosRaw - CAMBIOS_IDEAL) * CAMBIOS_PENAL);
    const eficienciaRaw = tareas ? ((scoreRondas ?? 10) + scoreCambios) / 2 : null;

    const overall =
      calidadRaw == null || eficienciaRaw == null
        ? null
        : round1(PESO_CALIDAD * calidadRaw + PESO_EFICIENCIA * eficienciaRaw);

    return {
      memberId: mem.id,
      name: mem.name,
      color: mem.color,
      track: mem.track,
      tareas,
      scorePorCriterio,
      calidad: calidadRaw == null ? null : round1(calidadRaw),
      eficiencia: eficienciaRaw == null ? null : round1(eficienciaRaw),
      overall,
      rondasPorTarea: rondasRaw == null ? null : round1(rondasRaw),
      cambiosPorRonda: cambiosRaw == null ? null : round1(cambiosRaw),
      cicloMedianoDias: mCiclo == null ? null : round1(mCiclo),
    };
  });
}
