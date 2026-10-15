/**
 * HÜE Prisma › Formatos — UNA medida como PSD con capas, para que diseño la termine a mano sólo donde haga falta
 * (Pedro, 2026-10-15: "give them the option to download that specific size as a psd with the available layers").
 *
 * Opción 1 (la que se eligió): una carpeta por pieza, con el nombre de la carpeta del PSD original, y adentro la
 * pieza ya a su tamaño y lugar, más sus sombras en "multiplicar" (las del PSD y la de contraste de HÜE, que se pueden
 * apagar). El fondo va entero en BACKGROUND, más grande que la medida si así quedó, para poder recorrerlo. El texto
 * va como imagen (la pieza se lee aplanada); para cambiar la copia está el PSD maestro.
 *
 * Puro: arma el objeto que escribe `ag-psd` (sólo sus tipos aquí, para no meter la librería en el paquete de la
 * página: quien lo baja la importa al hacer clic). Corre igual en Node y en el navegador.
 */
import type { Layer, Psd } from "ag-psd";
import type { Acomodo } from "./acomodo.ts";
import { armarMedida, capasDeMedida, type CapaSalida, type MaestroDatos, type TextoEscrito } from "./nitido.ts";

type MaestroConNombres = MaestroDatos & { piezas: (MaestroDatos["piezas"][number] & { nombre: string })[] };

/** Nombre de la carpeta del fondo, el de la guía de diseño de DiDi. */
export const CARPETA_FONDO = "BACKGROUND";
export const CAPA_SOMBRA_CONTRASTE = "Sombra de contraste (HÜE)";

const capa = (name: string, c: CapaSalida, extra: Partial<Layer> = {}): Layer => ({
  name,
  left: c.x,
  top: c.y,
  // `ag-psd` sólo lee width, height y data.
  imageData: { width: c.w, height: c.h, data: c.rgba } as ImageData,
  ...extra,
});

/** El documento PSD de la medida W × H: lo mismo que la tarjeta, en capas. `children` va de abajo hacia arriba. */
export function psdDeMedida(ma: MaestroConNombres, a: Acomodo, W: number, H: number, op: { texto?: TextoEscrito } = {}): Psd {
  const { fondo, piezas } = capasDeMedida(ma, a, W, H, op);
  return {
    width: W,
    height: H,
    // La imagen aplanada (miniatura y programas que no leen capas): la misma que la tarjeta y el PNG.
    imageData: { width: W, height: H, data: armarMedida(ma, a, W, H, op) } as ImageData,
    children: [
      { name: CARPETA_FONDO, opened: true, children: [capa("Fondo", fondo)] },
      ...piezas.map(({ pieza, halo, sombra, color }): Layer => {
        const nombre = ma.piezas[pieza].nombre;
        return {
          name: nombre,
          opened: true,
          children: [
            ...(halo ? [capa(CAPA_SOMBRA_CONTRASTE, halo, { blendMode: "multiply" })] : []),
            ...(sombra ? [capa(`${nombre} · sombra`, sombra, { blendMode: "multiply" })] : []),
            capa(nombre, color),
          ],
        };
      }),
    ],
  };
}
