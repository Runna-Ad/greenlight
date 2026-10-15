/**
 * HÜE Prisma › Formatos — lo que se revisa en cada medida mirando los PÍXELES, además del acomodo (que sólo ve cajas).
 * Puro: sólo arreglos; corre igual en Node y en el navegador.
 *
 * 1. Contraste (Pedro, 2026-10-14): una pieza de texto que en el original se lee puede caer, en otra medida, sobre un
 *    fondo de su mismo tono (s33, 876×324: letras de nube blancas sobre nubes blancas). Se mide qué parte de la pieza
 *    queda casi igual que lo que tiene atrás, y se avisa sólo si es mucho Y bastante peor que en el original: lo que el
 *    diseñador ya dejó así en su maestro no se marca.
 * 2. La copia del HERO pintada en el fondo (`gemela.ts`): se avisa en las medidas donde se ve (la pieza ya no la tapa)
 *    y, si se quitó, en las que se ve el relleno.
 *
 * Una sola entrada, `revisarMedida`, para la tarjeta de cada medida y para el resumen de la pantalla: los dos cuentan
 * los mismos avisos.
 */
import { acomodar, aplicarEdicion, elegirMaestro, type Acomodo, type AvisoAcomodo, type Edicion, type Lado, type MaestroCaja, type Zona } from "./acomodo.ts";
import type { Caja, Rol } from "./psd.ts";
import { etiquetaPieza } from "./roles.ts";

type PiezaRevisable = MaestroCaja["piezas"][number] & { caja: Caja; rgba: Uint8ClampedArray };
/** La copia del HERO en el fondo de un maestro: de qué pieza, y si ya se quitó. */
export type CopiaEnFondo = { pieza: number; quitada: boolean };
export type MaestroRevisable = MaestroCaja & { fondo: Uint8ClampedArray; piezas: PiezaRevisable[]; copia?: CopiaEnFondo | null };

/** Las piezas cuyo contraste se mide: las de texto y la marca. */
const SE_MIDE = new Set<Rol | null>(["TITULO", "SUBTITULO", "CTA", "FOOTER", "BRAND"]);
// Criterio, no física: calibrado con los dos PSD reales (s33 y APGIANTCARDUGC, 2026-10-14) y se afina con más.
/** Un punto de la pieza "se pierde" si su brillo y su color quedan así de cerca de lo que tiene atrás. */
const CONTRASTE_MIN = 1.4;
const DISTANCIA_MIN = 60;
/** Se avisa desde esta parte perdida... */
export const PERDIDA_AVISO = 0.3;
/** ...si además es al menos esto peor que en el original. */
export const PERDIDA_PEOR = 0.15;
/** Puntos que se miran por pieza (en rejilla) y los mínimos para opinar. */
const PUNTOS = 6000;
const PUNTOS_MIN = 50;
/** Desde dónde un punto es de la pieza (su parte casi opaca). */
const ALFA_PIEZA = 0.6;
/** La copia "queda debajo" de la pieza si las dos caen a menos de esto (px de la medida, o esta parte de su lado). */
const COPIA_TOLERANCIA_PX = 2;
const COPIA_TOLERANCIA = 0.01;

/** sRGB (0-255) → luz lineal, de tabla: se pide miles de veces por medida. */
const LINEAL = Float64Array.from({ length: 256 }, (_, c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const lineal = (c: number) => LINEAL[Math.min(255, Math.max(0, Math.round(c)))];
const brillo = (r: number, g: number, b: number) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);

/** Índice (RGBA) del píxel de `w × h` que cae bajo el punto (X, Y) de la medida, puesto a escala k con su esquina en
 *  (ox, oy). Fuera: −1, o la orilla si `orilla` (el fondo, que siempre cubre). */
function pixel(w: number, h: number, k: number, ox: number, oy: number, X: number, Y: number, orilla: boolean): number {
  let u = Math.floor((X + 0.5 - ox) / k), v = Math.floor((Y + 0.5 - oy) / k);
  if (orilla) {
    u = Math.min(w - 1, Math.max(0, u));
    v = Math.min(h - 1, Math.max(0, v));
  } else if (u < 0 || v < 0 || u >= w || v >= h) return -1;
  return (v * w + u) * 4;
}

/** Esquina de la caja completa de una pieza puesta (la parte sólida queda donde dijo el acomodo), como en nitido.ts. */
const esquina = (p: PiezaRevisable, q: Acomodo["puestas"][number]) => [q.x - (p.solido.x - p.caja.x) * q.k, q.y - (p.solido.y - p.caja.y) * q.k] as const;

/** Por cada pieza medible que quedó puesta: qué parte de ella (0-1) se pierde contra lo que tiene atrás. */
export function perdidas(ma: MaestroRevisable, a: Acomodo, W: number, H: number): Map<number, number> {
  const out = new Map<number, number>();
  // La esquina de cada pieza puesta, una vez (no por punto).
  const esquinas = a.puestas.map((q) => esquina(ma.piezas[q.pieza], q));
  const completa = (p: PiezaRevisable) => p.rgba.length >= p.caja.w * p.caja.h * 4;
  a.puestas.forEach((q, n) => {
    const p = ma.piezas[q.pieza];
    if (!SE_MIDE.has(p.rol) || !completa(p)) return;
    const [ox, oy] = esquinas[n];
    const paso = Math.max(1, Math.sqrt((q.w * q.h) / PUNTOS));
    let puntos = 0, perdidos = 0;
    for (let y = Math.max(0, q.y); y < Math.min(H, q.y + q.h); y += paso)
      for (let x = Math.max(0, q.x); x < Math.min(W, q.x + q.w); x += paso) {
        const X = Math.floor(x), Y = Math.floor(y);
        const i = pixel(p.caja.w, p.caja.h, q.k, ox, oy, X, Y, false);
        if (i < 0 || p.rgba[i + 3] / 255 < ALFA_PIEZA) continue;
        // Lo de atrás: el fondo y, encima, las piezas que van debajo de ésta.
        const f = pixel(ma.w, ma.h, a.fondo.k, a.fondo.x, a.fondo.y, X, Y, true);
        let r = ma.fondo[f], g = ma.fondo[f + 1], b = ma.fondo[f + 2];
        for (let m = 0; m < n; m++) {
          const qq = a.puestas[m], pp = ma.piezas[qq.pieza], [px, py] = esquinas[m];
          // Fuera de su caja completa no tapa nada: ni se busca el píxel.
          if (X < px - 1 || Y < py - 1 || X > px + pp.caja.w * qq.k + 1 || Y > py + pp.caja.h * qq.k + 1 || !completa(pp)) continue;
          const j = pixel(pp.caja.w, pp.caja.h, qq.k, px, py, X, Y, false);
          if (j < 0) continue;
          const al = pp.rgba[j + 3] / 255;
          r = pp.rgba[j] * al + r * (1 - al);
          g = pp.rgba[j + 1] * al + g * (1 - al);
          b = pp.rgba[j + 2] * al + b * (1 - al);
        }
        const al = p.rgba[i + 3] / 255;
        const R = p.rgba[i] * al + r * (1 - al), G = p.rgba[i + 1] * al + g * (1 - al), B = p.rgba[i + 2] * al + b * (1 - al);
        const y1 = brillo(R, G, B), y2 = brillo(r, g, b);
        puntos++;
        if ((Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05) < CONTRASTE_MIN && Math.hypot(R - r, G - g, B - b) < DISTANCIA_MIN) perdidos++;
      }
    if (puntos >= PUNTOS_MIN) out.set(q.pieza, perdidos / puntos);
  });
  return out;
}

/** Lo perdido en el ORIGINAL (el maestro a su medida), una vez por maestro. */
const enOriginal = new WeakMap<MaestroRevisable, Map<number, number>>();
function perdidasDelOriginal(ma: MaestroRevisable): Map<number, number> {
  let v = enOriginal.get(ma);
  if (!v) enOriginal.set(ma, (v = perdidas(ma, acomodar(ma, ma.w, ma.h), ma.w, ma.h)));
  return v;
}

/** ¿En esta medida se ve la parte del fondo donde está (o estaba) la copia? Se ve si cae dentro de la medida y la
 *  pieza ya no está justo encima de ella, del mismo tamaño. */
export function seVeLaCopia(ma: MaestroRevisable, a: Acomodo, W: number, H: number): boolean {
  const c = ma.copia;
  if (!c) return false;
  const p = ma.piezas[c.pieza];
  const k = a.fondo.k;
  // Dónde cae, en esta medida, el lugar de la pieza en el fondo (en el maestro, la copia está justo ahí).
  const fx = a.fondo.x + p.caja.x * k, fy = a.fondo.y + p.caja.y * k;
  if (fx + p.caja.w * k <= 0 || fy + p.caja.h * k <= 0 || fx >= W || fy >= H) return false;
  const q = a.puestas.find((x) => x.pieza === c.pieza);
  if (!q) return true;
  const [ox, oy] = esquina(p, q);
  const tol = Math.max(COPIA_TOLERANCIA_PX, COPIA_TOLERANCIA * Math.max(W, H));
  return Math.abs(ox - fx) > tol || Math.abs(oy - fy) > tol || Math.abs(q.k - k) * Math.max(p.caja.w, p.caja.h) > tol;
}

/** Los avisos de píxeles de una medida ya acomodada. */
export function avisosDePixeles(ma: MaestroRevisable, a: Acomodo, W: number, H: number): AvisoAcomodo[] {
  const avisos: AvisoAcomodo[] = [];
  const nom = (i: number) => etiquetaPieza(ma.piezas[i]);
  if (ma.copia && seVeLaCopia(ma, a, W, H)) {
    const n = nom(ma.copia.pieza);
    avisos.push(
      ma.copia.quitada
        ? { tipo: "retoque", texto: `Fondo retocado: donde estaba pintado ${n} ahora hay un relleno. Revisa que se vea bien; si no, «Deshacer» en «Pieza repetida en el fondo».` }
        : { tipo: "copia", texto: `Se ve dos veces ${n}: el fondo ya lo trae pintado y aquí la carpeta no queda encima. Se puede quitar en «Pieza repetida en el fondo».` },
    );
  }
  const antes = perdidasDelOriginal(ma);
  for (const [i, v] of perdidas(ma, a, W, H)) {
    const ref = antes.get(i) ?? 0;
    if (v >= PERDIDA_AVISO && v - ref >= PERDIDA_PEOR)
      avisos.push({ tipo: "contraste", texto: `${nom(i)} se pierde en el fondo: el ${Math.round(v * 100)} % queda casi del mismo tono que lo de atrás (en el original, ${Math.round(ref * 100)} %). Revisar que se lea.` });
  }
  return avisos;
}

/** Hechas, por maestro (el objeto): la tarjeta y el resumen piden la misma medida y no se calcula dos veces; y si sólo
 *  cambia OTRO maestro, ésta devuelve lo mismo y su tarjeta no se vuelve a pintar. */
const hechas = new WeakMap<MaestroRevisable, Map<string, { maestro: number; acomodo: Acomodo }>>();

/** Para la clave de la caché: la misma edición da la misma firma (números redondeados, piezas en orden). */
const firma = (ed: Edicion | null | undefined) =>
  ed ? Object.keys(ed).map(Number).sort((a, b) => a - b).map((i) => `${i}@${ed[i].x.toFixed(2)},${ed[i].y.toFixed(2)},${ed[i].k.toFixed(4)}`).join(";") : "-";

/**
 * Una medida completa: de qué maestro sale, su acomodo y TODOS sus avisos (los del acomodo y los de píxeles).
 * `edicion`: lo que la persona movió a mano en ESTA medida (va sobre el acomodo automático; se revisa todo igual).
 */
export function revisarMedida(maestros: readonly MaestroRevisable[], W: number, H: number, op: { heroLado?: Lado; zona?: Zona | null; edicion?: Edicion | null } = {}): { maestro: number; acomodo: Acomodo } {
  const maestro = elegirMaestro([...maestros], W, H);
  if (maestro < 0) throw new Error("revisarMedida: sin maestros");
  const ma = maestros[maestro];
  // Sin lado es "derecha" (acomodo.ts): la misma clave para los dos, o la medida se calcula dos veces.
  const lado: Lado = op.heroLado === "izquierda" ? "izquierda" : "derecha";
  let porMedida = hechas.get(ma);
  if (!porMedida) hechas.set(ma, (porMedida = new Map()));
  // La zona del canal mueve piezas (acomodo.ts): entra en la clave, o al cambiar de canal se queda el acomodo viejo.
  const z = op.zona ?? undefined;
  const clave = `${maestro}:${W}x${H}:${lado}:${z ? `${z.top},${z.right},${z.bottom},${z.left}` : "-"}:${firma(op.edicion)}`;
  const ya = porMedida.get(clave);
  if (ya) return ya;
  const auto = acomodar(ma, W, H, { heroLado: lado, zona: z });
  const acomodo = op.edicion ? aplicarEdicion(ma, auto, op.edicion, W, H, z) : auto;
  // Los avisos de píxeles son una ayuda: si algo raro del PSD los rompe, la medida sale igual, sin ellos.
  let extra: AvisoAcomodo[] = [];
  try {
    extra = avisosDePixeles(ma, acomodo, W, H);
  } catch (err) {
    console.error("[formatos] avisos de píxeles", err);
  }
  const r = { maestro, acomodo: { ...acomodo, avisos: [...acomodo.avisos, ...extra] } };
  porMedida.set(clave, r);
  return r;
}
