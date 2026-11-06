// Reglas de la casa para el corrector de H.Ü.E (deterministas, se prueban sin IA).

/** ¿La sugerencia sólo le pone tilde a "solo" (solo → sólo)? Se compara con la tilde
 *  quitada: si quedan iguales y la sugerencia trae más "sólo" que el original, es eso. */
export function agregaTildeASolo(original: string, sugerencia: string): boolean {
  const sinTilde = (s: string) => s.replace(/([sS])[óÓ]([lL][oO])/g, (_m, a: string, b: string) => `${a}o${b}`);
  const cuenta = (s: string) => (s.match(/s[óÓ]lo/gi) ?? []).length;
  return sinTilde(original).toLowerCase() === sinTilde(sugerencia).toLowerCase() && cuenta(sugerencia) > cuenta(original);
}
