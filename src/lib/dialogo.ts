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

/**
 * Parte el diálogo en intervenciones. Cada "(Quien) texto" es una intervención;
 * el texto antes del primer paréntesis (si lo hay) queda como intervención sin
 * "quien". Funciona con varias intervenciones en una línea o en varias.
 */
export function parseDialogo(dialogo: string | null | undefined): SegmentoDialogo[] {
  const t = (dialogo ?? "").trim();
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
