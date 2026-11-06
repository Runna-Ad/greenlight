/** Las URLs de un texto (http(s):// o www.), sin la puntuación final, sin repetir. */
export function urlsDe(texto: string): string[] {
  const vistas = new Set<string>();
  for (const m of (texto ?? "").match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) ?? []) {
    const url = m.replace(/[.,;:)\]]+$/, "");
    if (url) vistas.add(url);
  }
  return [...vistas];
}
