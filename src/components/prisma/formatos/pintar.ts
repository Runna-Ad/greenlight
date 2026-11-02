/**
 * HÜE Prisma › Formatos — pintar una medida en un <canvas> del navegador. Los píxeles los arma `armarMedida`
 * (filtro propio: nítido al reducir y igual en todos los navegadores); aquí sólo se ponen en el lienzo, de una
 * medida a la vez para que la página no se congele mientras pinta las doce. Sólo navegador (usa `document`).
 */
import type { Acomodo } from "@/lib/prisma/formatos/acomodo";
import type { MaestroListo } from "@/lib/prisma/formatos/listo";
import { armarMedida, type TextoEscrito } from "@/lib/prisma/formatos/nitido";

/** Lanza si el navegador no da lienzo (se quedó sin memoria): quien llama lo enseña; nunca queda una vista en blanco
 *  que parezca buena. */
export function pintar(destino: HTMLCanvasElement, ma: MaestroListo, a: Acomodo, W: number, H: number, op: { texto?: TextoEscrito } = {}): void {
  const px = armarMedida(ma, a, W, H, op);
  destino.width = W;
  destino.height = H;
  const x = destino.getContext("2d");
  if (!x) throw new Error("Este navegador no dejó crear el lienzo.");
  x.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
}

// Cada medida tarda 25-150 ms en armarse: se pintan en fila, una por vuelta, y entre una y otra la página atiende
// clics y teclas.
const cola: { fn: () => void; vivo: boolean }[] = [];
let corriendo = false;
const alVaciarse: (() => void)[] = [];
function siguiente(): void {
  const t = cola.shift();
  if (!t) {
    corriendo = false;
    for (const ok of alVaciarse.splice(0)) ok();
    return;
  }
  try {
    if (t.vivo) t.fn();
  } finally {
    setTimeout(siguiente, 0);
  }
}
/** Pone `fn` en la fila de pintado. Devuelve cómo cancelarla (si la tarjeta se va antes de pintarse). */
export function enCola(fn: () => void): () => void {
  const t = { fn, vivo: true };
  cola.push(t);
  if (!corriendo) {
    corriendo = true;
    setTimeout(siguiente, 0);
  }
  return () => {
    t.vivo = false;
  };
}
/** Se cumple cuando ya no queda ninguna medida esperando turno (el ZIP espera esto antes de tomar las fotos). */
export const colaVacia = (): Promise<void> => (corriendo ? new Promise((ok) => alVaciarse.push(ok)) : Promise.resolve());
