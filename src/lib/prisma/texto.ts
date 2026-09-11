/** Texto de una persona → una sola línea sin caracteres de control ni de formato invisibles
 *  (`\p{Cc}` = tab, saltos, NUL…; `\p{Cf}` = zero-width, bidi, TAG chars — el vehículo clásico
 *  de una instrucción escondida). Se aplica al interpolar y al guardar. */
export const plano = (s: string): string => s.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim();

/** Lo mismo, para texto que va DENTRO de una cerca del prompt (<winner>, <change>, <notes>…):
 *  además quita los ángulos, así el texto no puede cerrar la cerca y fingir instrucciones. */
export const cercado = (s: string): string => plano(s.replace(/[<>]/g, " "));

/** Para un prompt YA compilado que entra como ejemplar (<winner>): conserva los saltos de línea
 *  — en Sora es una lista de tomas y en Veo un JSON; la ESTRUCTURA es justo la lección — pero
 *  quita ángulos, controles e invisibles línea por línea. */
export const cercadoMultilinea = (s: string): string =>
  s
    .replace(/[<>]/g, " ")
    .split(/\r?\n/)
    .map((l) => plano(l))
    .filter(Boolean)
    .join("\n");
