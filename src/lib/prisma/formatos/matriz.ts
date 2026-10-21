/**
 * HÜE Prisma › Formatos — la matriz de producción de Pedro (2026-10-21, B25): de qué medida sale cada una, para que lo
 * que la persona edita a mano en una medida se pueda copiar a sus hermanas ("based on this table it matches a rule to
 * suggest if you want to apply those same changes to the other available size or sizes"; opción 2). Puro.
 *
 * Tres maneras de copiar, según la fila:
 *   - «igual»: la misma forma (escala directa: 1080×1920 ↔ 720×1280, 640×100 ↔ 320×50, y cualquier medida libre con la
 *     misma forma). Todo × el factor: el mismo acomodo, más chico o más grande. No hace falta revisarla.
 *   - «proporcional»: forma parecida (reencuadre leve, misma lógica). Cada pieza con su centro en el mismo punto
 *     relativo y su escala × el factor menor (para que quepa). Se revisa.
 *   - «estirar»: la misma anchura relativa con más alto (expansión vertical: 1080×1920 → 720×1600, "mantener bloque
 *     superior… legales hacia zona inferior"). Escala × el factor del eje que cambió menos; en el otro, lo de la mitad de
 *     arriba se queda a la misma distancia (escalada) del borde de arriba y lo de abajo, del de abajo. Se revisa.
 */
import { topesPieza, type Edicion, type PosicionPieza } from "./acomodo.ts";
import { MATRIZ, mismaForma, type ModoCopia } from "./tabla-matriz.ts";

export type { ModoCopia } from "./tabla-matriz.ts";
type Lados = { w: number; h: number };

const clave = (m: Lados) => `${m.w}x${m.h}`;

/**
 * A qué medidas (de `activas`) se le ofrece copiar lo editado en `de`, y cómo: las de la misma forma (las dos
 * direcciones: editar 720×1280 también ofrece 1080×1920) y sus hijas en la matriz. En el orden de `activas`.
 */
export function hermanas<M extends Lados>(de: Lados, activas: readonly M[]): { m: M; modo: ModoCopia }[] {
  const out: { m: M; modo: ModoCopia }[] = [];
  for (const m of activas) {
    if (clave(m) === clave(de)) continue;
    const fila = MATRIZ[clave(m)];
    if (mismaForma(m, de)) out.push({ m, modo: "igual" });
    else if (fila?.base === clave(de)) out.push({ m, modo: fila.modo });
  }
  return out;
}

/** De cada pieza del maestro: su parte sólida (con ella se sabe cuánto mide a su escala) y su caja con sombras (los
 *  topes de tamaño, como en `aplicarEdicion`). */
type PiezaCopia = { solido: Lados; caja?: Lados };

/**
 * Lo editado en la medida `de` llevado a la medida `a`. Las piezas (en px de la medida) se mueven según `modo`; lo que
 * es relativo a la pieza o del maestro (partes, orden de capas, textos quitados) va tal cual. La escala nueva se
 * recorta a los topes de `a` ANTES de ubicar la pieza (si no, `aplicarEdicion` la agrandaba desde su esquina: en 320×50
 * una pieza chica llega al mínimo). `espejo`: el HERO va del otro lado en `a` (se volteó una de las dos): lo editado se
 * refleja de izquierda a derecha, como el automático. Marca de dónde vino.
 */
export function copiarEdicion(ed: Edicion, piezasMa: readonly PiezaCopia[], de: Lados, a: Lados, modo: ModoCopia, espejo = false): Edicion {
  const fx = a.w / de.w, fy = a.h / de.h, f = Math.min(fx, fy);
  /**
   * Dónde empieza la pieza en un eje de `a` (`lado`/`lado2`: lo que mide en `de` y en `a`). Proporcional: su centro en
   * el mismo punto relativo. En el eje que creció más que `f` (estirar): pegada al borde más cercano a su distancia × f
   * (arriba si su centro cae en la mitad de arriba o justo en medio; abajo si no). En el otro: su centro × f.
   */
  const eje = (pos: number, lado: number, lado2: number, total: number, total2: number, crece: boolean) =>
    modo === "proporcional"
      ? ((pos + lado / 2) / total) * total2 - lado2 / 2
      : !crece
        ? (pos + lado / 2) * f - lado2 / 2
        : pos + lado / 2 <= total / 2
          ? pos * f
          : total2 - lado2 - (total - pos - lado) * f;
  const piezas: Record<number, PosicionPieza> = {};
  for (const [i, p] of Object.entries(ed.piezas)) {
    const s = piezasMa[Number(i)];
    if (!s) continue;
    const t = topesPieza(s.solido, a.w, a.h, s.caja), k = Math.min(t.max, Math.max(t.min, p.k * f));
    const w = s.solido.w * p.k, h = s.solido.h * p.k, w2 = s.solido.w * k, h2 = s.solido.h * k;
    const x = eje(p.x, w, w2, de.w, a.w, fx > f), y = eje(p.y, h, h2, de.h, a.h, fy > f);
    piezas[Number(i)] = { x: espejo ? a.w - x - w2 : x, y, k };
  }
  return { ...ed, piezas, copiaDe: { w: de.w, h: de.h } };
}
