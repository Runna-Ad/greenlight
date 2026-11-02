/**
 * HÜE Prisma › Formatos — la matriz de producción de Pedro (2026-10-21) como datos: qué medida sale de cuál y cómo.
 * Sin imports, para que `acomodo.ts` y `matriz.ts` (que importa `acomodo.ts`) la lean sin un ciclo. Puro.
 */

/** Cómo se lleva una medida de la matriz a otra (B25, `matriz.ts`): idéntica a escala, proporcional o estirada. */
export type ModoCopia = "igual" | "proporcional" | "estirar";
/**
 * La matriz de producción de Pedro (2026-10-21): cada medida hija, su base y cómo se le copia lo editado en la base
 * (B25, `matriz.ts`). Las «igual» además se ACOMODAN a escala de su base (B26, `acomodar`: 320×50 = 640×100 × 0.5).
 * 876×324 no tiene hermanas.
 */
export const MATRIZ: Readonly<Record<string, { base: string; modo: ModoCopia }>> = {
  "720x1280": { base: "1080x1920", modo: "igual" },
  "720x1600": { base: "1080x1920", modo: "estirar" },
  "768x1024": { base: "1200x1500", modo: "proporcional" },
  "1200x627": { base: "1280x720", modo: "proporcional" },
  "320x250": { base: "600x500", modo: "proporcional" },
  "320x50": { base: "640x100", modo: "igual" },
};

/** Medidas donde la matriz pide otro orden que el script del equipo (de izquierda a derecha). Manda el script y se
 *  dice en una nota (B26, Pedro 2026-10-21). */
export const DISTINTO_DEL_SCRIPT: Readonly<Record<string, string>> = { "876x324": "texto · HERO · beneficios y botón" };

/** La medida de la que la matriz saca ésta a escala directa (320×50 ← 640×100), o null. */
export function baseAEscala(W: number, H: number): { w: number; h: number } | null {
  const fila = MATRIZ[`${W}x${H}`];
  if (fila?.modo !== "igual") return null;
  const [w, h] = fila.base.split("x").map(Number);
  return { w, h };
}

/** Hasta dónde dos medidas tienen «la misma forma» (|ln| de la razón de proporciones): medio por ciento. */
const MISMA_FORMA = 0.005;
/** ¿La misma forma? Una copia de lo editado (B25, `matriz.ts`) sale idéntica a escala; con otra forma, se revisa. */
export const mismaForma = (a: { w: number; h: number }, b: { w: number; h: number }): boolean => Math.abs(Math.log(a.w / a.h / (b.w / b.h))) < MISMA_FORMA;
