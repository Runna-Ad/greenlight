// Guardarraíl del chequeo de ortografía/gramática de H.Ü.E (es-MX).
//
// Un "fix" propuesto por la IA se acepta SÓLO si NO toca los datos fact-shaped:
// la MISMA secuencia de dígitos y el MISMO conteo de signos de legal/oferta
// (* % $) que el original. Las LETRAS sí cambian —ese ES el arreglo (acento,
// ortografía, concordancia)— pero un número, un precio o un asterisco de legal
// jamás deben cambiar por un "corrector".
//
// Distinto de `sinInventar` (guion.ts): aquel exige SUBMULTISET de letras (el
// extractor sólo selecciona/reordena). Aquí las letras se corrigen, pero
// números y legales quedan intactos, y el cambio de longitud está acotado para
// que un fix sea un ARREGLO, no una reescritura. El humano hace clic para
// aplicar (compuerta final) y, al aplicar, el `original` debe seguir presente en
// el campo (best-effort anchor).

const normaliza = (s: string): string =>
  (s ?? "")
    .replace(/[""„‟″]/g, '"')
    .replace(/[''‚‛′]/g, "'")
    .replace(/…/g, "...")
    .replace(/[–—―]/g, "-");

// Tokens numéricos CON sus separadores internos (. ,) — NO el run de dígitos
// pelado. Así "1.5" ≠ "15" y "$60,000" ≠ "$60.000": mover/quitar un punto o una
// coma cambia el VALOR aunque los dígitos sean los mismos, y eso NUNCA es un
// arreglo de ortografía (sería un cambio de cifra disfrazado de "puntuación").
const numeros = (s: string): string => (s.match(/\d[\d.,]*\d|\d/g) ?? []).join(" ");
const conteoSigno = (s: string, c: string): number => s.split(c).length - 1;

/**
 * ¿Es seguro aplicar este fix de ortografía/gramática?
 *
 * - no vacío y DISTINTO del original (un fix que no cambia nada no es fix);
 * - MISMA secuencia de dígitos (protege $60,000, 6%, fechas, "3 x 1"…);
 * - MISMO conteo de * % $ (protege el legal/oferta: "CASHBACK*", "hasta 6%");
 * - es un ARREGLO acotado, no una reescritura (cambio de longitud limitado) y el
 *   fragmento no es un párrafo entero (los errores se marcan a nivel palabra/frase).
 */
export function fixSeguro(original: string, sugerencia: string): boolean {
  const o = normaliza(original);
  const s = normaliza(sugerencia);
  if (!o.trim() || !s.trim()) return false;
  if (o === s) return false;
  // Un fragmento con error es palabra/frase corta, nunca un párrafo entero.
  if (o.length > 160) return false;
  // Números (con separadores) y legales: intactos.
  if (numeros(o) !== numeros(s)) return false;
  for (const c of ["*", "%", "$"]) if (conteoSigno(o, c) !== conteoSigno(s, c)) return false;
  // Arreglo, no reescritura: la longitud cambia poco.
  if (Math.abs(s.length - o.length) > Math.max(12, o.length * 0.5)) return false;
  return true;
}
