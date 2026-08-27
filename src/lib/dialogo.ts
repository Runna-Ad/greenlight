// Parseo del diálogo para la vista del cliente.
//
// Pedro: lo que se escriba entre paréntesis marca QUIÉN habla (actor, narrador…)
// y en la vista del cliente sale en negritas, seccionado, separando cada
// intervención. Ejemplo:
//   "(Actor) Me encanta como sabe"  →  Actor: "Me encanta como sabe"
//
// Función pura (sin React) para poder probarla con el harness node.

export type SegmentoDialogo = {
  /** Quién habla (lo que iba entre paréntesis), o null si no se indicó. */
  quien: string | null;
  /** Lo que dice. */
  texto: string;
};

import type { RangoNegrita } from "./negrita";

/**
 * Los rangos [start,end) de los LOCUTORES en un texto LIMPIO de diálogo —cada
 * "(Quién)"— para pintarlos en negrita SIN reformatear el texto (así los offsets y
 * la cita de las correcciones siguen siendo válidos). Es la MISMA convención que
 * `parseDialogo`: cada "(…)" marca quién habla. Incluye los paréntesis en el rango.
 * Sólo tiene sentido para el campo de diálogo.
 */
export function rangosLocutor(limpio: string): RangoNegrita[] {
  const rangos: RangoNegrita[] = [];
  const re = /\([^)]+\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpio)) !== null) {
    rangos.push({ start: m.index, end: m.index + m[0].length });
  }
  return rangos;
}

// Un locutor con DOS PUNTOS al inicio de una línea ("Actor: texto", "Narrador:",
// "Actriz V.O: ...") se trata como "(Actor) texto" — así el diálogo del deck del
// equipo (que usa dos puntos) sale en negritas aunque no venga entre paréntesis,
// incluso en tareas ya importadas antes de que el importador lo normalizara.
// El rótulo antes del ":" debe ser un cue (capitalizado, corto) para no confundir
// una línea de diálogo con dos puntos ("Y le dije: hola") con un locutor.
const CUE_COLON = /^([\p{Lu}][\p{L}.]*(?:\s+[\p{Lu}\d][\p{L}.]*){0,3}(?:\s*\([^)]+\))?)\s*:\s*(.*)$/u;

function parenizarLocutores(dialogo: string): string {
  return dialogo
    .split("\n")
    .map((linea) => {
      const m = linea.match(CUE_COLON);
      if (!m) return linea;
      const quien = m[1].replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
      const resto = m[2].trim();
      return resto ? `(${quien}) ${resto}` : `(${quien})`;
    })
    .join("\n");
}

/**
 * Parte el diálogo en intervenciones. Cada "(Quien) texto" es una intervención;
 * el texto antes del primer paréntesis (si lo hay) queda como intervención sin
 * "quien". Funciona con varias intervenciones en una línea o en varias. También
 * acepta el formato con dos puntos ("Actor: texto"), que se normaliza a paréntesis.
 */
export function parseDialogo(dialogo: string | null | undefined): SegmentoDialogo[] {
  const t = parenizarLocutores((dialogo ?? "").trim());
  if (!t) return [];

  const segmentos: SegmentoDialogo[] = [];
  // Texto antes del primer "(" — diálogo sin quién.
  const primerParen = t.indexOf("(");
  if (primerParen === -1) {
    return [{ quien: null, texto: t }];
  }
  const preludio = t.slice(0, primerParen).trim();
  if (preludio) segmentos.push({ quien: null, texto: preludio });

  // Cada "(quien) hasta el próximo (" es una intervención.
  const re = /\(([^)]+)\)\s*([^(]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    segmentos.push({ quien: m[1].trim(), texto: m[2].trim() });
  }
  return segmentos;
}
