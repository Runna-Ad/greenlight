// Negrita en el copy — lógica pura (sin React, sin imports de servidor ni alias
// `@/`) para probarse con el harness de node y para poder importarse desde el
// bundle del cliente sin arrastrar dependencias pesadas.
//
// El copy del guión puede traer marcadores markdown `**negrita**` (vienen
// LITERALES en el texto pegado del deck — no es formato rico de Google Docs).
// `limpiarPegado` (guion.ts) ya NO los borra: los conserva dentro del campo, y
// aquí los convertimos en runs para pintarlos en <strong> en las vistas de
// lectura/cliente. Las cajas de edición (textarea) muestran los `**` tal cual —
// un textarea no puede pintar media-línea en negrita.

/** Un tramo de texto: `fuerte` = iba entre `**…**` (se pinta en negrita). */
export type RunNegrita = { texto: string; fuerte: boolean };

// Pares `**…**` en UNA línea (`.` no cruza saltos, así una negrita no atraviesa
// renglones — como en markdown). Lazy (`.+?`) para que `**a** **b**` sean dos
// runs, no uno. Un `*` SUELTO (p. ej. "CASHBACK*") no forma par y sobrevive como
// texto normal.
const NEGRITA_RE = /\*\*(.+?)\*\*/g;

/**
 * Parte un texto en runs normal/negrita según los pares `**…**`. Reconstruir con
 * `runs.map(r => r.texto).join("")` — salvo que quita los marcadores `**` de los
 * runs fuertes — devuelve el texto sin marcadores. Nunca pierde contenido: lo que
 * no está entre `**…**` en par queda como run normal (incluye un `*` suelto).
 */
export function partirNegrita(texto: string): RunNegrita[] {
  const s = texto ?? "";
  const runs: RunNegrita[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(NEGRITA_RE); // instancia fresca: lastIndex propio
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) runs.push({ texto: s.slice(last, m.index), fuerte: false });
    runs.push({ texto: m[1], fuerte: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ texto: s.slice(last), fuerte: false });
  return runs;
}

/**
 * Quita los marcadores de negrita `**` de un texto (deja el `*` suelto intacto).
 * Se usa ANTES de mandar copy a H.Ü.E (ortografía / validador): la IA y sus
 * guardarraíles de conteo de `*` deben ver el copy limpio, no los marcadores.
 */
export const sinNegrita = (s: string | null | undefined): string =>
  (s ?? "").replace(/\*\*(.+?)\*\*/g, "$1");

/** Un rango [start, end) —en coordenadas del texto LIMPIO— que iba en negrita. */
export type RangoNegrita = { start: number; end: number };

/**
 * Quita los marcadores `**` y devuelve el texto LIMPIO + los rangos que quedaron en
 * negrita, EN COORDENADAS DEL TEXTO LIMPIO. Para superficies que anclan por offset
 * (las correcciones de CampoLectura): el DOM muestra el texto sin `**` y la negrita
 * se aplica POR RANGO. Así el texto que el usuario ve y selecciona, los offsets de la
 * corrección, la cita y los resaltados viven todos en UN mismo espacio — y un
 * resaltado NUNCA parte un par `**` (no hay marcadores que partir). `.texto` es
 * idéntico a `sinNegrita` (mismo regex); esta variante además reporta los rangos.
 */
export function desmarcarNegrita(texto: string): { texto: string; negritas: RangoNegrita[] } {
  const s = texto ?? "";
  let out = "";
  let last = 0;
  const negritas: RangoNegrita[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out += s.slice(last, m.index); // texto normal antes del par
    const start = out.length;
    out += m[1]; // el contenido, sin los **
    negritas.push({ start, end: out.length });
    last = m.index + m[0].length;
  }
  out += s.slice(last);
  return { texto: out, negritas };
}
