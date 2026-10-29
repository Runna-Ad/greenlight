/**
 * HÜE Prisma › Formatos, imagen plana — el recorte exacto de cada objeto que se quedó pegado al fondo, como la
 * «selección de objeto» de Photoshop, DENTRO de la plataforma (Pedro, 2026-10-29: "rather reverse engineer whatever
 * we need ... to build the tools in platform"; nada de pagar otro servicio). Un modelo abierto de segmentación
 * (SlimSAM, Apache-2.0, ~39 MB) corre aquí mismo con transformers.js: en el navegador al pedir «Rehacer el fondo con
 * IA», y en Node en la batería (scripts/bateria-formatos.mjs). Cada objeto se pide con puntos dentro de su caja de la
 * lectura y puntos justo afuera.
 *
 * Por qué hace falta: soltar lo pegado por diferencia con el fondo de la IA dejaba la pantalla oscura del tablero LED
 * transparente (se veía el estadio) y las piezas se llevaban pedazos del vecino (preview, 2026-10-29).
 */
import type { Caja } from "@/lib/prisma/formatos/psd";
import type { Imagen } from "@/lib/prisma/formatos/plano";

/** El modelo: los pesos se bajan una vez de Hugging Face (público, sin cuenta ni llave) y el navegador los guarda. */
const MODELO_RECORTE = "Xenova/slimsam-77-uniform";
/** Dónde se pica dentro de la caja (fracciones de su ancho y alto) y cuánto afuera de ella. */
const DENTRO = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const;
const FUERA = 0.05;

type Sam = { modelo: { get_image_embeddings: (x: unknown) => Promise<Record<string, unknown>>; (x: unknown): Promise<{ pred_masks: unknown; iou_scores: { data: ArrayLike<number> } }> }; procesador: { (img: unknown, op?: unknown): Promise<Record<string, unknown> & { original_sizes: unknown; reshaped_input_sizes: unknown }>; post_process_masks: (m: unknown, o: unknown, r: unknown) => Promise<{ data: ArrayLike<number | boolean> }[]> }; RawImage: new (d: Uint8ClampedArray, w: number, h: number, c: number) => unknown };
let cargando: Promise<Sam> | null = null;
/** El modelo, una vez por página (o por proceso). */
function sam(): Promise<Sam> {
  cargando ??= (async () => {
    const t = await import("@huggingface/transformers");
    const [modelo, procesador] = await Promise.all([t.SamModel.from_pretrained(MODELO_RECORTE, { dtype: "fp32" }), t.AutoProcessor.from_pretrained(MODELO_RECORTE)]);
    return { modelo, procesador, RawImage: t.RawImage } as unknown as Sam;
  })().catch((err) => {
    cargando = null; // otro intento la próxima vez
    throw err;
  });
  return cargando;
}

/**
 * La máscara (W × H, 1 = del objeto) de cada caja: el modelo mira la imagen UNA vez y luego cada objeto por sus
 * puntos. Un objeto que el modelo no ve (máscara vacía) no sale en el resultado: quien llama se queda con lo de antes.
 */
export async function recortarObjetos(img: Imagen, cajas: readonly { id: string; caja: Caja }[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (!cajas.length) return out;
  const { modelo, procesador, RawImage } = await sam();
  const { w: W, h: H } = img, rgb = new Uint8ClampedArray(W * H * 3);
  for (let k = 0; k < W * H; k++) { rgb[k * 3] = img.rgba[k * 4]; rgb[k * 3 + 1] = img.rgba[k * 4 + 1]; rgb[k * 3 + 2] = img.rgba[k * 4 + 2]; }
  const imagen = new RawImage(rgb, W, H, 3);
  const vista = await modelo.get_image_embeddings(await procesador(imagen));
  const dentroDe = (v: number, max: number) => Math.min(max - 1, Math.max(0, v));
  for (const { id, caja: c } of cajas) {
    const dentro = DENTRO.map(([u, v]) => [c.x + u * c.w, c.y + v * c.h]);
    const fuera = [[c.x - FUERA * c.w, c.y + c.h / 2], [c.x + c.w * (1 + FUERA), c.y + c.h / 2], [c.x + c.w / 2, c.y - FUERA * c.h], [c.x + c.w / 2, c.y + c.h * (1 + FUERA)]].map(([x, y]) => [dentroDe(x, W), dentroDe(y, H)]);
    const entrada = await procesador(imagen, { input_points: [[[...dentro, ...fuera]]], input_labels: [[[...dentro.map(() => 1), ...fuera.map(() => 0)]]] });
    const salida = await modelo({ ...entrada, ...vista });
    const [m] = await procesador.post_process_masks(salida.pred_masks, entrada.original_sizes, entrada.reshaped_input_sizes);
    // De sus 3 propuestas, la mejor según el modelo... siempre que se parezca a la caja de la lectura: con una barra
    // delgada sobre la tarjeta, el modelo a veces recortaba la TARJETA y salía dos veces (rocas, 2026-10-29). Si
    // ninguna se parece, no hay recorte: queda lo de antes, y la revisión avisa si sale con huecos.
    const iou = Array.from(salida.iou_scores.data), orden = iou.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
    for (const p of orden) {
      const base = p * W * H, mk = new Uint8Array(W * H);
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let k = 0; k < W * H; k++) if (m.data[base + k]) { mk[k] = 1; const x = k % W, y = (k / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0 || cajasParecidas({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, c) < RECORTE_PARECIDO_MIN) continue;
      out.set(id, mk);
      break;
    }
  }
  return out;
}

/** Lo que tiene que parecerse la caja del recorte a la de la lectura (intersección / unión) para usarlo. */
export const RECORTE_PARECIDO_MIN = 0.6;
/** Intersección / unión de dos cajas (0-1). */
export function cajasParecidas(a: Caja, b: Caja): number {
  const i = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return i / (a.w * a.h + b.w * b.h - i);
}
