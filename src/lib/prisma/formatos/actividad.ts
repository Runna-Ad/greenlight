/**
 * Admin › Actividad (0091) — lo PURO y compartido: la lista cerrada de acciones, el saneo de lo que manda el navegador,
 * el reintento que no pierde gasto y el rango de fechas. Sin imports para que corra igual en navegador, servidor y pruebas.
 */
export const ACCIONES_ACTIVIDAD = ["psd_abierto", "descarga_zip", "descarga_png", "descarga_psd", "edicion", "error", "trabajo_recuperado", "trabajo_borrado"] as const;
export type AccionActividad = (typeof ACCIONES_ACTIVIDAD)[number];
export const esAccionActividad = (v: unknown): v is AccionActividad => typeof v === "string" && (ACCIONES_ACTIVIDAD as readonly string[]).includes(v);

export const ARCHIVO_MAX = 200;
export const DETALLE_MAX = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que el navegador manda a `anotarActividad`. La persona NO va aquí: la pone el servidor con la sesión. */
export type EventoActividad = { accion: AccionActividad; archivo?: string | null; cliente?: string | null; detalle?: string | null };

/** Una línea, sin caracteres de control y con tope por carácter real (como `char_length`). Vacío = null. */
export function textoCorto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // También los invisibles y los que voltean el texto: un nombre no debe verse distinto de lo que es.
  const limpio = v.replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ").trim();
  return limpio ? Array.from(limpio).slice(0, max).join("").trim() : null;
}
export const clienteValido = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v.trim()) ? v.trim().toLowerCase() : null);

/** El cuerpo de la ruta → la fila a guardar. null = la acción no está en la lista. Lo demás opcional inválido se ignora. */
export function leerEvento(cuerpo: unknown): { accion: AccionActividad; archivo: string | null; client_id: string | null; detalle: string | null } | null {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return null;
  const c = cuerpo as Record<string, unknown>;
  if (!esAccionActividad(c.accion)) return null;
  return { accion: c.accion, archivo: textoCorto(c.archivo, ARCHIVO_MAX), client_id: clienteValido(c.cliente), detalle: textoCorto(c.detalle, DETALLE_MAX) };
}

/** De qué archivo y cliente vino un gasto: campos opcionales del form de las rutas de IA. */
export function origenDeGasto(form: { get(k: string): unknown }): { archivo: string | null; client_id: string | null } {
  return { archivo: textoCorto(form.get("archivo"), ARCHIVO_MAX), client_id: clienteValido(form.get("cliente")) };
}

export type ErrorDb = { code?: string; message?: string } | null;
/** Inserta y, si el cliente ya no existe (23503), reintenta UNA vez sin él: el registro nunca se pierde por eso. */
export async function insertarConCliente<F extends { client_id?: string | null }>(insertar: (fila: F) => PromiseLike<{ error: ErrorDb }>, fila: F): Promise<{ error: ErrorDb }> {
  const r = await insertar(fila);
  if (r.error?.code === "23503" && fila.client_id) return insertar({ ...fila, client_id: null });
  return r;
}

/** ¿El fallo es porque 0091 todavía no está aplicada? (la preview comparte la base real: el código puede llegar antes). */
export const faltaLa0091 = (e: ErrorDb): boolean => /^(PGRST204|PGRST205|PGRST202|42703|42P01|42883|23514)$/.test(e?.code ?? "");
/** La misma llamada como se anotaba antes de 0091. El tope diario suma filas: una llamada sin anotar se lo saltaría. */
export function gastoSin0091<R extends string>(f: { ruta: R | "fondo_ampliar" | "rellenar_hueco"; modelo: string; usd: number | null; member_id: string }) {
  return { ruta: f.ruta === "fondo_ampliar" || f.ruta === "rellenar_hueco" ? ("tamano" as const) : f.ruta, modelo: f.modelo, usd: f.usd, member_id: f.member_id };
}

// ── Rango de la pantalla ──
export const RANGOS_ACTIVIDAD = [
  { id: "hoy", etiqueta: "Hoy" },
  { id: "7d", etiqueta: "7 días" },
  { id: "30d", etiqueta: "30 días" },
  { id: "mes", etiqueta: "Este mes" },
] as const;
export type RangoActividad = (typeof RANGOS_ACTIVIDAD)[number]["id"];
export const esRangoActividad = (v: unknown): v is RangoActividad => RANGOS_ACTIVIDAD.some((r) => r.id === v);

/** Fechas incluyentes en hora de México, las que entiende la base (0088, 0091). */
export function rangoFechas(rango: RangoActividad, ahora = new Date()): { desde: string; hasta: string } {
  const hasta = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
  if (rango === "hoy") return { desde: hasta, hasta };
  if (rango === "mes") return { desde: `${hasta.slice(0, 8)}01`, hasta };
  const dias = rango === "7d" ? 6 : 29;
  const d = new Date(`${hasta}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return { desde: d.toISOString().slice(0, 10), hasta };
}

// ── Pantalla ──
const FRASES: Record<string, string> = {
  movimiento: "movió",
  cambio_pedido: "pidió un cambio en",
  cambio_resuelto: "resolvió un cambio en",
  respuesta: "respondió un cambio en",
  prompt: "creó un prompt",
  variante: "pidió una variante de prompt",
  refinado: "refinó un prompt",
  resultado: "subió un resultado",
  lote: "subió una imagen plana",
  psd_abierto: "abrió un PSD",
  descarga_zip: "descargó un ZIP",
  descarga_png: "descargó un PNG",
  descarga_psd: "descargó un PSD",
  edicion: "editó una medida",
  error: "tuvo un error",
  trabajo_recuperado: "recuperó trabajo guardado",
  trabajo_borrado: "borró trabajo guardado",
};
const FRASES_IA: Record<string, string> = {
  tamano: "generó un tamaño con IA",
  copia: "rellenó una copia con IA",
  fondo_plano: "rehízo un fondo con IA",
  leer: "leyó una imagen con IA",
  fondo_ampliar: "amplió un fondo con IA",
  rellenar_hueco: "rellenó un hueco con IA",
};
export function fraseActividad(tipo: string, ruta?: string | null): string {
  if (tipo === "ia") return (ruta && FRASES_IA[ruta]) || "usó la IA";
  return FRASES[tipo] ?? tipo;
}

/** Dinero para la tabla. null = nada con costo conocido: se ve como «–», nunca US$0.00. */
export function dineroActividad(n: number | null): string {
  if (n === null) return "–";
  if (n > 0 && n < 0.01) return "<US$0.01";
  return `US$${n.toFixed(2)}`;
}
