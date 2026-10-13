/**
 * HÜE Prisma › Formatos — pintar una medida en un <canvas> del navegador: el fondo limpio que llena la medida y,
 * encima, cada pieza donde la dejó `acomodar`. Las sombras de una pieza viajan como un mapa que se pinta en
 * "multiplicar" (blanco = no cambia nada), igual que en Photoshop. Sólo navegador (usa `document`).
 */
import type { Acomodo, MaestroCaja } from "@/lib/prisma/formatos/acomodo";
import type { MaestroListo } from "@/lib/prisma/formatos/listo";
import type { Caja } from "@/lib/prisma/formatos/psd";

/** Un maestro con sus píxeles ya subidos a lienzos (los arreglos grandes del worker se sueltan). */
export type MaestroPintable = MaestroCaja & {
  avisos: string[];
  fondo: HTMLCanvasElement;
  /** Uno por pieza, en el mismo orden que `piezas`. */
  capas: { caja: Caja; color: HTMLCanvasElement; sombra: HTMLCanvasElement | null }[];
};

function lienzo(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) throw new Error("Este navegador no dejó crear el lienzo.");
  x.imageSmoothingQuality = "high";
  return [c, x];
}

function dePixeles(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const [c, x] = lienzo(w, h);
  x.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

export function aPintable(ma: MaestroListo): MaestroPintable {
  return {
    nombre: ma.nombre,
    w: ma.w,
    h: ma.h,
    avisos: ma.avisos,
    piezas: ma.piezas.map((p) => ({ nombre: p.nombre, rol: p.rol, solido: p.solido, letraMinPx: p.letraMinPx })),
    fondo: dePixeles(ma.fondo, ma.w, ma.h),
    capas: ma.piezas.map((p) => ({ caja: p.caja, color: dePixeles(p.rgba, p.caja.w, p.caja.h), sombra: p.oscurece ? dePixeles(p.oscurece, p.caja.w, p.caja.h) : null })),
  };
}

/** Suelta la memoria de un lienzo YA (sin esperar al recolector: Safari la retiene y tiene un tope global). */
const vaciar = (c: HTMLCanvasElement) => void (c.width = c.height = 0);

/** Al cambiar de PSD: los lienzos del anterior ya no se van a pintar. */
export function soltarLienzos(ma: MaestroPintable): void {
  vaciar(ma.fondo);
  for (const c of ma.capas) {
    vaciar(c.color);
    if (c.sombra) vaciar(c.sombra);
  }
}

/** Pega `src` en la caja de destino. Reducir a menos de la mitad de un solo paso deja dientes y texto roto: se baja
 *  por mitades (cada paso intermedio se suelta al terminar) y el último tramo lo da `drawImage`. */
function pegar(x: CanvasRenderingContext2D, src: HTMLCanvasElement, dx: number, dy: number, dw: number, dh: number): void {
  let c = src;
  while (c.width >= dw * 2 && c.height >= dh * 2 && c.width > 1 && c.height > 1) {
    const [m, mx] = lienzo(Math.max(1, Math.round(c.width / 2)), Math.max(1, Math.round(c.height / 2)));
    mx.drawImage(c, 0, 0, m.width, m.height);
    if (c !== src) vaciar(c);
    c = m;
  }
  x.drawImage(c, dx, dy, dw, dh);
  if (c !== src) vaciar(c);
}

/** Lanza si el navegador no da lienzo (se quedó sin memoria): quien llama lo enseña; nunca queda una vista en blanco
 *  que parezca buena. */
export function pintar(destino: HTMLCanvasElement, ma: MaestroPintable, a: Acomodo, W: number, H: number): void {
  destino.width = W;
  destino.height = H;
  const x = destino.getContext("2d");
  if (!x) throw new Error("Este navegador no dejó crear el lienzo.");
  x.imageSmoothingQuality = "high";
  // Fondo: llena la medida, donde lo dejó el acomodo (amarrado a los bordes por si el redondeo lo corre 1 px).
  const bw = Math.ceil(ma.w * a.fondo.k), bh = Math.ceil(ma.h * a.fondo.k);
  pegar(x, ma.fondo, Math.min(0, Math.max(W - bw, Math.round(a.fondo.x))), Math.min(0, Math.max(H - bh, Math.round(a.fondo.y))), bw, bh);
  // Piezas de abajo hacia arriba (así vienen). `q` es la caja de la parte SÓLIDA; la capa trae además su sombra.
  for (const q of a.puestas) {
    const capa = ma.capas[q.pieza], solido = ma.piezas[q.pieza].solido;
    const dw = Math.max(1, Math.round(capa.caja.w * q.k)), dh = Math.max(1, Math.round(capa.caja.h * q.k));
    const dx = Math.round(q.x - (solido.x - capa.caja.x) * q.k), dy = Math.round(q.y - (solido.y - capa.caja.y) * q.k);
    if (capa.sombra) {
      x.globalCompositeOperation = "multiply";
      pegar(x, capa.sombra, dx, dy, dw, dh);
      x.globalCompositeOperation = "source-over";
    }
    pegar(x, capa.color, dx, dy, dw, dh);
  }
}
