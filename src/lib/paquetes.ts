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

/** Qué es una idea, con el mismo criterio que su ícono (contentType): «Images» = imagen,
 *  «Copies» = copy; el resto es video de su equipo (Real o Normal). null = video sin equipo. */
type ClaseIdea = "real" | "normal" | "imagen" | "copy";
function claseDeIdea(t: { track: string | null; tipoAsset?: string | null }): ClaseIdea | null {
  const tipo = (t.tipoAsset ?? "").trim();
  if (tipo === "Images") return "imagen";
  if (tipo === "Copies") return "copy";
  if (t.track === "real") return "real";
  if (t.track === "normal") return "normal";
  return null;
}
const NOMBRE_CLASE: Record<ClaseIdea, [string, string]> = {
  real: ["video real", "videos real"],
  normal: ["video normal", "videos normal"],
  imagen: ["imagen", "imágenes"],
  copy: ["copy", "copies"],
};
const ORDEN_CLASES: ClaseIdea[] = ["real", "normal", "imagen", "copy"];

/** "1 pieza" / "4 piezas". */
export function textoPiezas(n: number): string {
  return `${n} ${n === 1 ? "pieza" : "piezas"}`;
}

export type ConteoPaquete = {
  ideas: number;
  /** Los archivos a entregar: un «Nombre de archivo» = una pieza (tamaño × plataforma × duración). */
  piezas: number;
  /** "3 ideas: 2 videos real · 1 video normal". */
  lineaIdeas: string;
  /** "6 piezas: 2 videos real · 4 videos normal". Un copy no genera archivos: nunca sale aquí. */
  lineaPiezas: string;
};

/**
 * Los dos conteos de un paquete (Pedro 2026-11-20): IDEAS (cada tarea) y PIEZAS (cada nombre
 * de archivo de esas tareas), los dos desglosados por tipo. `piezas` de cada tarea = sus filas
 * en `assets`, la misma lista que el equipo ve en «Nombres de archivos».
 */
export function conteoPaquete(
  tareas: { track: string | null; tipoAsset?: string | null; piezas?: number | null }[],
): ConteoPaquete {
  const ideas: Record<ClaseIdea, number> = { real: 0, normal: 0, imagen: 0, copy: 0 };
  const piezas: Record<ClaseIdea, number> = { real: 0, normal: 0, imagen: 0, copy: 0 };
  let totalPiezas = 0;
  for (const t of tareas) {
    const n = Math.max(0, t.piezas ?? 0);
    totalPiezas += n;
    const c = claseDeIdea(t);
    if (!c) continue;
    ideas[c]++;
    piezas[c] += n;
  }
  const linea = (total: number, cuenta: Record<ClaseIdea, number>, nombre: [string, string]) => {
    const partes = ORDEN_CLASES.filter((c) => cuenta[c] > 0)
      .map((c) => `${cuenta[c]} ${NOMBRE_CLASE[c][cuenta[c] === 1 ? 0 : 1]}`);
    const cabeza = `${total} ${nombre[total === 1 ? 0 : 1]}`;
    return partes.length ? `${cabeza}: ${partes.join(" · ")}` : cabeza;
  };
  return {
    ideas: tareas.length,
    piezas: totalPiezas,
    lineaIdeas: linea(tareas.length, ideas, ["idea", "ideas"]),
    lineaPiezas: linea(totalPiezas, piezas, ["pieza", "piezas"]),
  };
}

/** Las piezas de una fila de `ideas` leída con `assets(count)` (PostgREST trae `[{ count }]`). */
export function piezasDeFila(r: { assets?: { count: number }[] | null }): number {
  return r.assets?.[0]?.count ?? 0;
}

/** "Real" / "Normal" para un track (null si no es ninguno). */
export function nombreTrack(track: string | null | undefined): "Real" | "Normal" | null {
  return track === "real" ? "Real" : track === "normal" ? "Normal" : null;
}

/**
 * La etiqueta de un brief en las pantallas del EQUIPO (fase 2, Pedro 2026-11-13). Real y
 * Normal del mismo día son dos pestañas con la misma fecha: sin el track, Entregas y
 * Performance decían "Brief 30/10" dos veces. Con fecha → "Brief 30/10 · Real"; sin fecha,
 * el nombre propio del brief (o su código). `track` null → sólo "Brief 30/10".
 * Una sola fuente: Entregas, Performance, la tarea y la Papelera la usan igual.
 */
export function etiquetaBrief(b: {
  brief_date: string | null;
  brief_name?: string | null;
  code?: string | null;
  track?: string | null;
}): string {
  const md = b.brief_date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const base = md ? `Brief ${md[3]}/${md[2]}` : b.brief_name?.trim() || b.code?.trim() || "Brief";
  const t = nombreTrack(b.track);
  return t ? `${base} · ${t}` : base;
}

/** "LT AfterBF · Brief 30/10 · Real": de qué paquete y pestaña es una tarea. Sin paquete,
 *  sólo la del brief. */
export function etiquetaTarea(
  b: Parameters<typeof etiquetaBrief>[0],
  paquete: string | null | undefined,
): string {
  const p = paquete?.trim();
  return p ? `${p} · ${etiquetaBrief(b)}` : etiquetaBrief(b);
}

/**
 * El link de la carpeta de Google Drive de un paquete (0100, Pedro 2026-11-19). Sólo un link:
 * el cliente lo abre para revisar que sus archivos estén, en orden y bien nombrados.
 * Vacío = quitarlo. Tiene que ser https (lo mismo exige la base). Un link que no es de
 * Google Drive se acepta con aviso: a veces se comparte por otro lado.
 */
export function limpiarLinkDrive(
  raw: string | null | undefined,
): { ok: true; url: string | null; aviso: string | null } | { ok: false; error: string } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, url: null, aviso: null };
  if (s.length > 2000) return { ok: false, error: "El link es demasiado largo." };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "Eso no es un link. Copia el link de la carpeta desde Google Drive." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "El link tiene que empezar con https://" };
  if (u.username || u.password) return { ok: false, error: "El link no puede llevar usuario ni contraseña." };
  const drive = u.hostname === "drive.google.com" || u.hostname === "docs.google.com";
  return { ok: true, url: u.toString(), aviso: drive ? null : "Guardado, pero no es un link de Google Drive." };
}
