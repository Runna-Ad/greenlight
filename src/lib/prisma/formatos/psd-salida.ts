/**
 * HÜE Prisma › Formatos — UNA medida como PSD con capas, para que diseño la termine a mano sólo donde haga falta
 * (Pedro, 2026-10-15: "give them the option to download that specific size as a psd with the available layers").
 *
 * Opción 1 (la que se eligió): una carpeta por pieza, con el nombre de la carpeta del PSD original, y adentro la
 * pieza ya a su tamaño y lugar, más sus sombras en "multiplicar" (las del PSD y la de contraste de HÜE, que se pueden
 * apagar). El fondo va entero en BACKGROUND, más grande que la medida si así quedó, para poder recorrerlo. El texto
 * va como imagen (la pieza se lee aplanada); para cambiar la copia está el PSD maestro.
 *
 * De una IMAGEN PLANA (B28) no hay PSD original que mover: con `vivos`, cada texto que se reescribió con la
 * tipografía del cliente va como capa de TEXTO VIVO encima de su parte (que va sin letras), para que el PSD siga
 * editable como pide la regla de Pedro del 2026-10-19. Quien lo escribe pasa `invalidateTextLayers`: Photoshop lo
 * vuelve a dibujar al abrir; hasta entonces se ve la tinta que dibujamos.
 *
 * Puro: arma el objeto que escribe `ag-psd` (sólo sus tipos aquí, para no meter la librería en el paquete de la
 * página: quien lo baja la importa al hacer clic). Corre igual en Node y en el navegador.
 */
import type { Layer, LayerTextData, Psd, TextStyle } from "ag-psd";
import type { Acomodo } from "./acomodo.ts";
import { armarMedida, capasDeMedida, type CapaSalida, type CapasPieza, type MaestroDatos, type TextoEscrito, type TextosVivos } from "./nitido.ts";
import type { TextoCapa, TramoTexto } from "./textos.ts";

type MaestroConNombres = MaestroDatos & { piezas: (MaestroDatos["piezas"][number] & { nombre: string; partes?: readonly { nombre: string }[] })[] };

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

/** Un tramo como estilo de Photoshop: lo mismo que lee `textoDe` (textos.ts), de vuelta. */
const estiloDe = (r: TramoTexto): TextStyle => ({
  font: { name: r.fuente },
  fontSize: r.tam,
  fillColor: { r: r.color[0], g: r.color[1], b: r.color[2] },
  tracking: r.track,
  autoLeading: r.interlineado === null,
  ...(r.interlineado !== null ? { leading: r.interlineado } : {}),
  baselineShift: r.subir,
  fontCaps: r.mayusculas ? 2 : 0,
});

/** Un `TextoCapa` como capa de texto de Photoshop (punto, o párrafo si trae su caja). */
export function textoDePsd(t: TextoCapa): LayerTextData {
  return {
    // ag-psd escribe "\n" como el salto de párrafo de Photoshop.
    text: t.texto,
    transform: [...t.transform],
    antiAlias: "smooth",
    style: estiloDe(t.tramos[0]),
    styleRuns: t.tramos.map((r) => ({ length: r.n, style: estiloDe(r) })),
    paragraphStyle: { justification: t.alineacion },
    ...(t.caja ? { shapeType: "box" as const, boxBounds: [...t.caja] } : {}),
  };
}

/** Una capa sin nada pintado (la base de un texto suelto, sin sus letras) no se escribe. */
const vacia = (c: CapaSalida) => {
  for (let i = 3; i < c.rgba.length; i += 4) if (c.rgba[i]) return false;
  return true;
};
/** Nombre de una capa de texto, como lo pone Photoshop: sus primeras letras. */
const nombreDeTexto = (texto: string) => texto.replace(/\s+/g, " ").trim().slice(0, 60);

/** El documento PSD de la medida W × H: lo mismo que la tarjeta, en capas. `children` va de abajo hacia arriba. */
export function psdDeMedida(ma: MaestroConNombres, a: Acomodo, W: number, H: number, op: { texto?: TextoEscrito; vivos?: TextosVivos } = {}): Psd {
  const { fondo, piezas } = capasDeMedida(ma, a, W, H, op);
  // Una pieza abierta en el editor trae una capa por parte (seguidas): van juntas en la carpeta de su pieza.
  const carpetas: CapasPieza[][] = [];
  for (const c of piezas) {
    const ultima = carpetas.at(-1);
    if (ultima && ultima[0].pieza === c.pieza) ultima.push(c);
    else carpetas.push([c]);
  }
  return {
    width: W,
    height: H,
    // La imagen aplanada (miniatura y programas que no leen capas): la misma que la tarjeta y el PNG.
    imageData: { width: W, height: H, data: armarMedida(ma, a, W, H, op) } as ImageData,
    children: [
      { name: CARPETA_FONDO, opened: true, children: [capa("Fondo", fondo)] },
      ...carpetas.map((capas): Layer => {
        const p = ma.piezas[capas[0].pieza];
        return {
          name: p.nombre,
          opened: true,
          // Las sombras de contraste primero, debajo de todas sus partes (como `armarMedida`).
          children: [
            ...capas.flatMap(({ halo }) => (halo ? [capa(CAPA_SOMBRA_CONTRASTE, halo, { blendMode: "multiply" })] : [])),
            ...capas.flatMap(({ parte, sombra, color, textos }) => {
              const nombre = (parte !== null && p.partes?.[parte]?.nombre) || p.nombre;
              return [
                ...(sombra ? [capa(`${nombre} · sombra`, sombra, { blendMode: "multiply" })] : []),
                ...(textos?.length && vacia(color) ? [] : [capa(nombre, color)]),
                ...(textos ?? []).map((t) => capa(nombreDeTexto(t.texto.texto) || t.nombre, t.capa, { text: textoDePsd(t.texto), ...(t.oculto ? { hidden: true } : {}) })),
              ];
            }),
          ],
        };
      }),
    ],
  };
}
