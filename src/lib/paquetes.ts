// Brief › PAQUETE › Tarea (0097, Pedro 2026-11-12). Lógica pura: sin base ni `server-only`,
// para probarse en scripts/test-lib.mjs.
//
// Un paquete es un grupo de tareas del mismo tema dentro de un brief (columna "Package Name"
// del sheet). Lleva fecha de entrega (la pone un admin). La fecha del BRIEF es la más lejana
// de sus paquetes. Un paquete está entregado cuando todas sus tareas están Greenlit; entonces
// se compara el día de la entrega con su fecha.

import { greenlitDeBundle } from "./bundle.ts";

/** La zona horaria de los días de entrega (DiDi y el equipo trabajan en hora de México). */
export const ZONA_ENTREGAS = "America/Mexico_City";

/** La clave que identifica a un paquete dentro de su brief: sin acentos, espacios ni
 *  mayúsculas. "LT AfterBF" y "LT After BF" son el mismo paquete. DEBE dar lo mismo que
 *  produccion.paquete_clave() (0097); scripts/test-db.mjs prueba los mismos casos. */
export function claveDePaquete(nombre: string | null | undefined): string {
  // La MISMA lista de acentos que el translate() de SQL, letra por letra: con NFD un "ā"
  // daría "a" aquí y nada en SQL, y la tarea se quedaría sin su paquete.
  const DE = "áàâäãéèêëíìîïóòôöõúùûüñç";
  const A = "aaaaaeeeeiiiiooooouuuunc";
  return [...(nombre ?? "").toLowerCase()]
    .map((c) => { const i = DE.indexOf(c); return i >= 0 ? A[i] : c; })
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

/** Lo que el CLIENTE recibe de un paquete. Se arma en el servidor: el navegador del cliente
 *  nunca recibe los días de retraso ni la fecha de un paquete que se entregó tarde. */
export type PaquetePortal = {
  id: string;
  nombre: string;
  nota: { texto: string; tono: TonoEntrega } | null;
  /** Su fecha, sólo si el cliente puede verla (no entregado, o entregado a tiempo/antes). */
  fechaVisible: string | null;
  entregado: boolean;
};

export function paqueteParaCliente(p: {
  id: string; nombre: string; fechaEntrega: string | null; entregadoEl: string | null; diasAntes: number | null;
}): PaquetePortal {
  const tarde = p.diasAntes !== null && p.diasAntes < 0;
  return {
    id: p.id,
    nombre: p.nombre,
    nota: notaEntrega({ entregadoEl: p.entregadoEl, diasAntes: p.diasAntes }, p.fechaEntrega, "cliente"),
    fechaVisible: tarde ? null : p.fechaEntrega,
    entregado: !!p.entregadoEl,
  };
}

/** `dateSort` del sync (20261030) → "2026-10-30" para `briefs.brief_date`. */
export function fechaDeDateSort(dateSort: number | null): string | null {
  if (!dateSort) return null;
  const s = String(dateSort);
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** El día (YYYY-MM-DD) de un instante, en hora de México. */
export function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_ENTREGAS, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

/** "2026-11-20" → "20/11". */
export function ddmm(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Días entre dos fechas YYYY-MM-DD (b − a). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}

/** La fecha del brief: la más lejana de sus paquetes con fecha. null si ninguno tiene. */
export function fechaDelBrief(fechas: (string | null)[]): string | null {
  let max: string | null = null;
  for (const f of fechas) if (f && (!max || f > max)) max = f;
  return max;
}

export type EntregaPaquete = {
  /** Día (México) en que se entregó la ÚLTIMA tarea, si ya están todas Greenlit. */
  entregadoEl: string | null;
  /** fecha − entregado, en días: >0 antes, 0 a tiempo, <0 tarde. null sin fecha o sin entregar. */
  diasAntes: number | null;
};

/** ¿Ya se entregó el paquete, y cuánto antes o después de su fecha? Entregado = todas sus
 *  tareas vivas Greenlit (la misma regla que un brief: greenlitDeBundle). Si se reabre una
 *  tarea, deja de estar entregado solo. */
export function entregaDePaquete(
  tareas: { status: string; delivered_at: string | null }[],
  fechaEntrega: string | null,
): EntregaPaquete {
  const ultima = greenlitDeBundle(tareas as Parameters<typeof greenlitDeBundle>[0]);
  if (!ultima) return { entregadoEl: null, diasAntes: null };
  const dia = diaLocal(ultima);
  return { entregadoEl: dia, diasAntes: fechaEntrega ? diasEntre(dia, fechaEntrega) : null };
}

export type TonoEntrega = "antes" | "a_tiempo" | "tarde" | "pendiente";

/**
 * El texto de la fecha de un paquete. Pedro (2026-11-12): si se entregó antes, se anota
 * "la fecha era X y se entregó Y". Si se entregó TARDE, el equipo lo ve ("3 días tarde")
 * pero el cliente sólo ve el día de entrega.
 */
export function notaEntrega(
  e: EntregaPaquete,
  fechaEntrega: string | null,
  para: "cliente" | "equipo",
): { texto: string; tono: TonoEntrega } | null {
  if (!e.entregadoEl) {
    return fechaEntrega ? { texto: `Fecha ${ddmm(fechaEntrega)}`, tono: "pendiente" } : null;
  }
  const entregado = `Entregado ${ddmm(e.entregadoEl)}`;
  if (!fechaEntrega || e.diasAntes === null) return { texto: entregado, tono: "a_tiempo" };
  const fecha = `fecha ${ddmm(fechaEntrega)}`;
  const n = Math.abs(e.diasAntes);
  const dias = `${n} ${n === 1 ? "día" : "días"}`;
  if (e.diasAntes > 0) return { texto: `${entregado} · ${fecha} (${dias} antes)`, tono: "antes" };
  if (e.diasAntes === 0) return { texto: `${entregado} · ${fecha} (a tiempo)`, tono: "a_tiempo" };
  if (para === "cliente") return { texto: entregado, tono: "a_tiempo" };
  return { texto: `${entregado} · ${fecha} (${dias} tarde)`, tono: "tarde" };
}

/** Cuántas piezas de cada equipo: "2 real · 1 normal" (sólo los que tienen piezas). */
export function desgloseTracks(tareas: { track: string | null; tipoAsset?: string | null }[]): string {
  // Las imágenes y los copies se cuentan aparte (Pedro 2026-11-12): "3 real · 2 normal · 1 imagen".
  // Mismo criterio que el ícono (contentType): «Images» = imagen, «Copies» = copy; el resto es
  // video y va por su equipo.
  let real = 0, normal = 0, imagen = 0, copy = 0;
  for (const t of tareas) {
    const tipo = (t.tipoAsset ?? "").trim();
    if (tipo === "Images") imagen++;
    else if (tipo === "Copies") copy++;
    else if (t.track === "real") real++;
    else if (t.track === "normal") normal++;
  }
  return [
    real ? `${real} real` : null,
    normal ? `${normal} normal` : null,
    imagen ? `${imagen} ${imagen === 1 ? "imagen" : "imágenes"}` : null,
    copy ? `${copy} ${copy === 1 ? "copy" : "copies"}` : null,
  ].filter(Boolean).join(" · ");
}
