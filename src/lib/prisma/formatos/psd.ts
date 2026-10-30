/**
 * HÜE Prisma › Formatos — puerta PSD: leer un Photoshop y despiezarlo (puro: sin sharp ni DOM; corre igual en
 * Node, en el navegador y en un Web Worker).
 *
 * Los anuncios del equipo llegan en PSD con las carpetas de la guía de diseño: BRAND / TITULO / SUBTITULO / CTA /
 * HERO / FOOTER / BACKGROUND, una mesa de trabajo por medida. De ahí sale un MAESTRO por mesa: un fondo limpio y
 * cada carpeta como una pieza suelta que se puede mover y escalar.
 *
 * Por qué NO se pintan las capas una por una: en un PSD real (ajustes con recorte, modos de fusión, color overlay,
 * objetos inteligentes) eso difiere de Photoshop en ~30 % de los píxeles. Las siluetas y posiciones sí coinciden;
 * el color no. Entonces:
 *   1. silueta de cada pieza = el alfa de sus capas en modo normal (con su máscara), más el contorno si lo trae
 *   2. color de cada pieza   = la copia aplanada que Photoshop guarda en el archivo, "des-mezclada" de lo que
 *      tiene detrás en los bordes suavizados:  F = (C − D·(1−α)) / α
 *   3. fondo limpio          = nuestro pintado de BACKGROUND (con sus modos de fusión) + la diferencia contra
 *      Photoshop donde ninguna pieza lo tapa, extendida con suavidad por debajo de las piezas
 *   4. sombras (capas que oscurecen, sombras paralelas) = cuánto oscurecen lo de atrás (C/D), y viajan con su pieza
 * Las piezas se resuelven de ABAJO hacia ARRIBA y "lo de atrás" (D) es lo ya armado: así rearmarlas en su lugar
 * devuelve el anuncio de Photoshop aunque una pieza toque a otra.
 *
 * Archivos ajenos: primero se lee sólo la ESTRUCTURA, se revisan los límites, y los píxeles se decodifican capa
 * por capa cuando se piden (un PSD puede declarar medidas enormes sin traer datos).
 */
import { readPsd, getLayerImageData, getLayerMaskImageData, getCompositeImageData, initializeCanvas, type Layer } from "ag-psd";
import { MAL_FORMADO, PSD_BYTES_MAX } from "./listo.ts";
import { textoDe, type TextoCapa, type TextoPsdCrudo } from "./textos.ts";
import { CAPA_DEBAJO_FONDO, ROLES, desenvolver, esDelFondo, nombreDeCapa, rolDe, type Rol } from "./roles.ts";
import type { PegadoAlFondo } from "./acomodo.ts";

/** Sólo se LEEN por índice. (La librería tipa también 16 y 32 bits; aquí siempre son 8: `leerPsd` rechaza lo demás.) */
type Pixeles = { data: ArrayLike<number>; width: number; height: number };

// Fuera del hilo principal del navegador (Node, Web Worker) no hay <canvas>: la librería sólo necesita de dónde
// sacar un búfer de píxeles. Con `useRawData` nunca dibuja en un canvas.
if (typeof document === "undefined") {
  initializeCanvas(
    () => {
      throw new Error("psd: sin canvas (se lee con useRawData)");
    },
    (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as unknown as ImageData,
  );
}

/** Los reales rondan 70 MB. */
export { PSD_BYTES_MAX };

/** Versión 1 en la cabecera ("8BPS" + 00 01); la 2 es un PSB (documento grande), que no se lee. */
export const esVersionPsd = (cab: Uint8Array): boolean => cab.length >= 6 && cab[4] === 0 && cab[5] === 1;
export const ES_PSB = "Es un PSB (documento grande), no un PSD. Qué hacer: guarda una copia sólo con las mesas de trabajo que necesitas, como PSD.";
/** El detalle cuando ag-psd lanza uno de MAL_FORMADO (sus mensajes, en inglés técnico, no le dicen nada a la persona). */
export const PSD_MAL_FORMADO = "El archivo no sigue el formato PSD exactamente (puede estar dañado o incompleto) y no se deja leer con seguridad.";
/** Los modos de color que ag-psd no lee, con el nombre que da en su error ("Color mode not supported: CMYK"). Un PSD
 *  de imprenta llega en CMYK. */
const MODOS_SIN_LEER: Record<string, string> = { CMYK: "CMYK", lab: "Lab", multichannel: "multicanal", duotone: "duotono" };
export const noEsRgb = (modo: string): string =>
  `El PSD está en ${MODOS_SIN_LEER[modo] ?? "un modo de color que no es RGB"} y Formatos sólo lee RGB. Qué hacer: guarda una copia en RGB (en Photoshop: Imagen › Modo › Color RGB) y elige esa copia aquí.`;
export const noEs8Bits = (bits: number): string =>
  `El PSD está en ${bits} bits por canal y Formatos sólo lee 8. Qué hacer: guarda una copia en 8 bits (en Photoshop: Imagen › Modo › 8 bits/canal) y elige esa copia aquí.`;
/** El mismo mensaje lo dan el worker (antes de juntar los bytes) y `leerPsd`: un solo texto. */
export const pesaDemasiado = (mb: number, nota: string): string =>
  `Sus capas pesan ${mb} MB (máximo ${Math.round(PSD_BYTES_MAX / 1e6)})${nota}. Qué hacer: guarda una copia sólo con las mesas de trabajo que necesitas y sin capas ocultas.`;
/** El tope del formato PSD. Un archivo con una docena de mesas en fila pasa fácil de 12 000 px de ancho. */
export const PSD_LADO_MAX = 30_000;
/** La copia aplanada se decodifica entera (4 bytes por píxel): 60 MP = 240 MB. */
export const PSD_LIENZO_MAX_PX = 60_000_000;
/** Una capa (o su máscara) se decodifica entera aunque sólo un pedazo caiga en la mesa. */
export const PSD_CAPA_MAX_PX = 48_000_000;
export const PSD_CAPAS_MAX = 600;
/** Una mesa más grande que esto no se despieza (varios búferes de 12 bytes por píxel). */
export const MESA_MAX_PX = 12_000_000;
/** Cada carpeta de primer nivel es una pieza y cuesta un búfer del tamaño de la mesa: la guía pide 6. */
export const PIEZAS_MAX = 40;
/** Tope de memoria de un despiece: ≈ 60 bytes por píxel de la mesa + 15 por pieza (8 de trabajo y, si su caja
 *  abarca toda la mesa, 7 del resultado). */
export const DESPIECE_MAX_BYTES = 2_000_000_000;
/** Lo más lejos que se busca una sombra paralela, resplandor o contorno alrededor de su capa. */
export const HALO_MAX_PX = 200;
/** Diferencia de canal (0-255) que ya se nota a simple vista. */
export const TOLERANCIA = 12;
// Umbrales de "¿puedo confiar en este despiece?". Son criterio, no física.
export const FONDO_FIEL_MAX_PCT = 10;
export const REARMADO_MAX_PCT = 2;
export const TAPADA_MAX_PCT = 2;
/** Una capa de BACKGROUND con lo sólido (alfa > 50 %) entre estos % de la mesa parece un elemento, no fondo. */
export const FONDO_ELEMENTO_MIN_PCT = 20;
export const FONDO_ELEMENTO_MAX_PCT = 90;
/** Lo de una pieza que otra de más arriba tapa (sólido) se rellena con su color de alrededor (como en las partes):
 *  en el PSD no se ve y sólo asoma si una de las dos se mueve. Arriba de esto ya no queda de dónde sacar el color. */
export const RELLENO_MAX_PCT = 50;
/** Lo que cuesta abrir una pieza en partes, en bytes por píxel de la caja de todo lo que toca: lo fijo (lo de atrás, lo
 *  des-mezclado, quién tapa a quién, la prueba del rearmado) y lo de cada parte (su silueta, su sombra, su color de
 *  trabajo y su relleno, y lo que se queda: color, sombra y base). */
const PARTES_BYTES_PX = 40;
const PARTES_BYTES_PX_PARTE = 44;
/** Lo que puede costar abrir UNA pieza en partes, y todas las de una mesa (lo que se quedan las ya abiertas más lo que
 *  cuesta la que sigue). Más: la pieza se mueve entera, con aviso. */
export const PARTES_MAX_BYTES = 400_000_000;
export const PARTES_MESA_MAX_BYTES = 600_000_000;
/** Partes por pieza, como mucho (una carpeta con más subcarpetas se mueve entera, con aviso). */
export const PARTES_MAX = 12;

// Los papeles de las carpetas viven en roles.ts (chico: también lo usa la pantalla, sin cargar ag-psd).
export { ROLES, rolDe, type Rol };

export type MotivoPsd = "no-soportado" | "demasiado-grande" | "sin-aplanado" | "sin-fondo";
export class ErrorPsd extends Error {
  motivo: MotivoPsd;
  constructor(motivo: MotivoPsd, mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

export type Caja = { x: number; y: number; w: number; h: number };
export type MesaPsd = { nombre: string } & Caja;
export type TipoCapa = "texto" | "objeto inteligente" | "ajuste" | "forma" | "píxeles";
export type MascaraPsd = { left: number; top: number; right: number; bottom: number; defecto: number; pixeles: () => Pixeles | undefined };
/** Un efecto de capa que pinta FUERA de sus píxeles: sombra paralela, resplandor exterior o contorno. `dx`/`dy`: hacia
 *  dónde se corre (la sombra paralela, por su distancia y ángulo); `radio` es lo que se extiende desde ahí. */
export type Halo = { tipo: "sombra" | "luz" | "contorno"; radio: number; fuerza: number; dx?: number; dy?: number };
export type CapaPsd = {
  nombre: string;
  tipo: TipoCapa;
  left: number;
  top: number;
  w: number;
  h: number;
  opacidad: number;
  /** "Relleno" de Photoshop (0-1): baja los píxeles de la capa pero no sus efectos. */
  relleno: number;
  mezcla: string;
  halos: Halo[];
  /** Tiene algún efecto de capa encendido (también los que pintan por dentro: contorno interior, degradado…). */
  conEfectos: boolean;
  recorte: boolean;
  mesa: number;
  /** La carpeta de primer nivel dentro de la mesa (o la capa misma si está suelta). */
  pieza: string;
  /** Cuál es esa carpeta: su lugar entre los hijos de la mesa (contando los ocultos); −1 = capa suelta en la mesa. Dos
   *  carpetas con el mismo nombre son una sola pieza, pero no la misma carpeta. */
  carpeta: number;
  /** La subcarpeta de la carpeta de su pieza en la que está (su lugar entre los hijos de esa carpeta, contando los
   *  ocultos, y su nombre): una PARTE de la pieza. null = capa suelta dentro de la carpeta (las sueltas van juntas). */
  parte: { hijo: number; nombre: string } | null;
  /** Dónde está en el árbol de su mesa: su lugar entre los hijos de cada carpeta, desde la mesa (contando los ocultos).
   *  Con esto el PSD editable encuentra ESTA capa aunque otra se llame igual. */
  ruta: number[];
  mascara: MascaraPsd | null;
  /** Capas de texto: el tamaño de su letra más chica, en px del lienzo (ya con la escala de la capa). */
  letraPx: number | null;
  /** Capas de texto: lo necesario para volver a escribirlas (transform en px del LIENZO). */
  texto: TextoCapa | null;
  pixeles: () => Pixeles | undefined;
};
export type DocPsd = {
  w: number;
  h: number;
  mesas: MesaPsd[];
  /** Sólo las visibles, de abajo hacia arriba. */
  capas: CapaPsd[];
  avisos: string[];
  /** false = guardado sin "Maximizar compatibilidad": la copia aplanada es un relleno, no el anuncio. */
  aplanadoReal: boolean | undefined;
  aplanado: () => Pixeles | undefined;
};

const tipoDe = (l: Layer): TipoCapa => (l.text ? "texto" : l.placedLayer ? "objeto inteligente" : l.adjustment ? "ajuste" : l.vectorFill || l.vectorMask ? "forma" : "píxeles");

function letraDe(l: Layer): number | null {
  const t = l.text;
  if (!t) return null;
  const tr = t.transform ?? [1, 0, 0, 1, 0, 0];
  const escala = Math.hypot(tr[2] ?? 0, tr[3] ?? 1) || 1;
  const tams = [t.style?.fontSize, ...(t.styleRuns ?? []).map((r) => r.style?.fontSize)].filter((v): v is number => typeof v === "number" && v > 0);
  return tams.length ? Math.min(...tams) * escala : null;
}

const hayEfectos = (l: Layer): boolean =>
  !!l.effects && !l.effects.disabled &&
  Object.entries(l.effects).some(([k, v]) => k !== "scale" && k !== "disabled" && !!v && (Array.isArray(v) ? v.some((e) => e?.enabled !== false) : (v as { enabled?: boolean }).enabled !== false));

/** Un resplandor aclara: no se mide como sombra. Su zona sólo se aparta del fondo limpio. */
const FUERZA_LUZ = 0.03;

/** A lo más un halo por tipo (el de mayor alcance). `fuerza` = cuánto oscurece como mucho (la opacidad del efecto).
 *  `anguloGlobal`: el de «Usar luz global» del documento (grados). */
function halosDe(l: Layer, anguloGlobal: number): Halo[] {
  const fx = l.effects;
  if (!fx || fx.disabled) return [];
  const escala = fx.scale ?? 1;
  const px = (u: { value: number } | undefined) => Math.max(0, (u?.value ?? 0) * escala) || 0;
  const cero = (v: number | undefined) => Math.min(1, Math.max(FUERZA_LUZ, v ?? 0.75)) || FUERZA_LUZ;
  const crudos: Halo[] = [];
  // La sombra paralela es la capa corrida `distance` en contra de la luz (el ángulo dice de dónde viene: 90° = de arriba,
  // la sombra baja) y desenfocada `size` (SPAPTOYBOX, 2026-10-30: contarla `distance + size` parejo en todas direcciones
  // hacía que la del botón "oscureciera" el legal de abajo y de los lados, y la mesa se descartaba).
  for (const s of fx.dropShadow ?? []) {
    if (s.enabled === false) continue;
    const ang = ((s.useGlobalLight ? anguloGlobal : (s.angle ?? anguloGlobal)) * Math.PI) / 180, d = px(s.distance);
    const dx = Math.round(-Math.cos(ang) * d) || 0, dy = Math.round(Math.sin(ang) * d) || 0;
    // Una "sombra" que aclara (en trama o sobreexponer, o clara en modo normal) es un resplandor corrido: no oscurece.
    const col = s.color && "r" in s.color ? s.color : null;
    const aclara = (s.blendMode && s.blendMode !== "normal" && !OSCURECE.has(s.blendMode)) || (col !== null && (col.r + col.g + col.b) / 3 > 127);
    crudos.push(aclara ? { tipo: "luz", radio: px(s.size), fuerza: FUERZA_LUZ, dx, dy } : { tipo: "sombra", radio: px(s.size), fuerza: cero(s.opacity), dx, dy });
  }
  if (fx.outerGlow && fx.outerGlow.enabled !== false) crudos.push({ tipo: "luz", radio: px(fx.outerGlow.size), fuerza: FUERZA_LUZ });
  for (const s of fx.stroke ?? []) if (s.enabled !== false && s.position !== "inside") crudos.push({ tipo: "contorno", radio: s.position === "center" ? px(s.size) / 2 : px(s.size), fuerza: 1 });
  const out: Halo[] = [];
  for (const h of crudos) {
    const radio = Math.min(HALO_MAX_PX, Math.ceil(h.radio) + 1); // +1: el suavizado del borde
    const ya = out.find((o) => o.tipo === h.tipo);
    if (!ya) out.push({ ...h, radio });
    else if ((ya.dx ?? 0) === (h.dx ?? 0) && (ya.dy ?? 0) === (h.dy ?? 0)) { ya.radio = Math.max(ya.radio, radio); ya.fuerza = Math.max(ya.fuerza, h.fuerza); }
    else {
      // Dos sombras corridas distinto: una sola, sin correr, que alcanza a las dos (como antes, a lo más).
      const alcance = (o: Halo) => Math.hypot(o.dx ?? 0, o.dy ?? 0) + o.radio;
      Object.assign(ya, { radio: Math.min(HALO_MAX_PX, Math.ceil(Math.max(alcance(ya), alcance({ ...h, radio })))), fuerza: Math.max(ya.fuerza, h.fuerza), dx: 0, dy: 0 });
    }
  }
  return out;
}

/** Los nombres vienen del archivo y acaban en pantalla: sin caracteres de control ni de dirección de texto, y
 *  con tope de largo. (Quien los pinte: siempre como texto, nunca como HTML.) */
const limpio = nombreDeCapa;

/**
 * Lee la estructura (sin decodificar píxeles) y revisa los límites.
 *
 * Un PSD hecho con mala intención todavía puede colgar a la librería DENTRO de esta llamada (bloques de patrones,
 * tablas RLE): quien la use tiene que correrla en un Web Worker y matarlo si se pasa de tiempo. Nunca en el hilo
 * principal ni en el servidor.
 */
export function leerPsd(entrada: ArrayBuffer | Uint8Array): DocPsd {
  // Una vista que no abarca todo su ArrayBuffer (un Buffer chico de Node sale de un pozo compartido) se copia:
  // la librería acota sus lecturas por el búfer de abajo, no por la vista.
  if (entrada.byteLength > PSD_BYTES_MAX) throw new ErrorPsd("demasiado-grande", pesaDemasiado(Math.round(entrada.byteLength / 1e6), ""));
  const buf = ArrayBuffer.isView(entrada) && (entrada.byteOffset !== 0 || entrada.byteLength !== entrada.buffer.byteLength) ? new Uint8Array(entrada) : entrada;
  const cab = ArrayBuffer.isView(buf) ? buf : new Uint8Array(buf, 0, Math.min(6, buf.byteLength));
  if (cab.length < 6 || cab[0] !== 0x38 || cab[1] !== 0x42 || cab[2] !== 0x50 || cab[3] !== 0x53) throw new ErrorPsd("no-soportado", "El archivo no es un PSD");
  if (!esVersionPsd(cab)) throw new ErrorPsd("no-soportado", ES_PSB);
  let psd;
  try {
    // totalMemoryLimit: con useRawData lo único que se decodifica al leer son los patrones del documento.
    // `strict`: un dato que dice medir más de lo que queda del archivo (un canal, o algo dentro de un bloque de una capa)
    // ya no reserva hasta 100 MB vacíos por cada uno: ag-psd lanza antes. Dentro de un bloque de una capa, ag-psd se
    // salta ese bloque y sigue; en lo demás, el archivo no se lee. Los 5 PSD de prueba dan el mismo árbol que sin strict.
    psd = readPsd(buf, { useRawData: true, useRawThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 64 * 1024 * 1024, strict: true });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    const modo = /^Color mode not supported: (.*)$/.exec(detalle);
    throw new ErrorPsd("no-soportado", modo ? noEsRgb(modo[1]) : MAL_FORMADO.test(detalle) ? PSD_MAL_FORMADO : `No se pudo leer el PSD: ${detalle}`);
  }
  if (!(psd.width > 0 && psd.height > 0)) throw new ErrorPsd("no-soportado", "El PSD no declara medidas");
  if (psd.width > PSD_LADO_MAX || psd.height > PSD_LADO_MAX || psd.width * psd.height > PSD_LIENZO_MAX_PX) throw new ErrorPsd("demasiado-grande", `El lienzo mide ${psd.width}×${psd.height}: más de ${PSD_LIENZO_MAX_PX / 1e6} millones de píxeles en total. Qué hacer: guarda una copia sólo con las mesas de trabajo que necesitas, o acércalas entre sí.`);
  const bits = psd.bitsPerChannel ?? 8;
  if (bits !== 8) throw new ErrorPsd("no-soportado", noEs8Bits(bits));

  const avisos: string[] = [];
  const mesas: MesaPsd[] = [];
  const capas: CapaPsd[] = [];
  const anguloGlobal = psd.imageResources?.globalAngle ?? 120; // el de Photoshop si el archivo no lo trae
  let vistas = 0;
  // `nivel`: 0 = en la mesa (una carpeta aquí es una pieza), 1 = dentro de la carpeta de una pieza (una subcarpeta aquí
  // es una parte), 2 = más adentro (se queda en su parte).
  type Ctx = { mesa: number; pieza: string | null; carpeta: number; parte: CapaPsd["parte"]; nivel: number; ruta: number[] };
  /** Las capas de primer nivel de una mesa, con las envolturas abiertas (`desenvolver`). */
  const primerNivel = (hijos: Layer[] | undefined, mesa: string): Layer[] | undefined => {
    const des = desenvolver(hijos ?? []);
    if (!des) return hijos;
    const donde = mesa ? `La mesa «${mesa}»` : "El PSD";
    avisos.push(`${donde} traía las carpetas de la guía dentro de ${des.abiertas.map((n) => `«${n}»`).join(", ")}: se leyeron desde ahí.`);
    if (des.debajo) avisos.push(`${donde}: lo que está debajo de su fondo (${des.debajo.children?.length ?? 0} capa(s) o carpeta(s)) va con el fondo, en «${CAPA_DEBAJO_FONDO}»; ninguna de sus capas se mueve sola.`);
    return des.capas;
  };
  const andar = (nodos: Layer[] | undefined, opPadre: number, ctx: Ctx) => {
    for (const [hijoN, l] of (nodos ?? []).entries()) {
      if (l.hidden) continue;
      if (++vistas > PSD_CAPAS_MAX) throw new ErrorPsd("demasiado-grande", `Más de ${PSD_CAPAS_MAX} capas visibles. Qué hacer: borra las que no se usan o acopla las carpetas que no son de la guía.`);
      const nombre = limpio(l.name);
      const opacidad = opPadre * (l.opacity ?? 1);
      if (l.children) {
        let hijo = ctx;
        if (l.artboard?.rect) {
          const r = l.artboard.rect;
          const x = Math.round(r.left), y = Math.round(r.top);
          mesas.push({ nombre, x, y, w: Math.round(r.right) - x, h: Math.round(r.bottom) - y });
          hijo = { mesa: mesas.length - 1, pieza: null, carpeta: -1, parte: null, nivel: 0, ruta: [] };
          andar(primerNivel(l.children, nombre), opacidad, hijo);
          continue;
        } else {
          hijo = { ...ctx, ruta: [...ctx.ruta, hijoN] };
          if (ctx.nivel === 0) hijo = { ...hijo, pieza: nombre, carpeta: hijoN, nivel: 1 };
          else if (ctx.nivel === 1) hijo = { ...hijo, parte: { hijo: hijoN, nombre }, nivel: 2 };
          const raro = [
            ...((l.opacity ?? 1) < 1 ? ["opacidad"] : []),
            ...(l.blendMode && l.blendMode !== "pass through" && l.blendMode !== "normal" ? [`fusión ${l.blendMode}`] : []),
            ...(l.mask && !l.mask.disabled ? ["máscara"] : []),
          ];
          if (raro.length) avisos.push(`La carpeta «${nombre}» usa ${raro.join(", ")} propia: no se aplica igual que en Photoshop.`);
        }
        andar(l.children, opacidad, hijo);
        continue;
      }
      const w = (l.right ?? 0) - (l.left ?? 0);
      const h = (l.bottom ?? 0) - (l.top ?? 0);
      if (!(w >= 0 && h >= 0) || w > PSD_LADO_MAX || h > PSD_LADO_MAX || w * h > PSD_CAPA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La capa «${nombre}» mide ${w}×${h} (máximo ${PSD_CAPA_MAX_PX / 1e6} millones de píxeles). Qué hacer: recórtala al tamaño de su mesa.`);
      const k = l.mask && !l.mask.disabled ? l.mask : null;
      const mw = (k?.right ?? 0) - (k?.left ?? 0), mh = (k?.bottom ?? 0) - (k?.top ?? 0);
      if (!(mw >= 0 && mh >= 0) || mw > PSD_LADO_MAX || mh > PSD_LADO_MAX || mw * mh > PSD_CAPA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La máscara de «${nombre}» mide ${mw}×${mh} (máximo ${PSD_CAPA_MAX_PX / 1e6} millones de píxeles). Qué hacer: recórtala al tamaño de su mesa.`);
      // Máscara "ocultar todo" sin pintar: Photoshop no dibuja nada de esa capa.
      if (k && !(mw > 0 && mh > 0) && (k.defaultColor ?? 255) === 0) continue;
      // Canales en ZIP: se inflan enteros antes de mirar la medida (bomba de descompresión). Photoshop guarda
      // los de 8 bits en crudo o RLE.
      if (l.rawData?.channels.some((ch) => Number(ch.compression) >= 2)) throw new ErrorPsd("no-soportado", `La capa «${nombre}» viene comprimida en ZIP`);
      capas.push({
        nombre, tipo: tipoDe(l), left: l.left ?? 0, top: l.top ?? 0, w, h, opacidad, relleno: l.fillOpacity ?? 1,
        mezcla: l.blendMode ?? "normal", halos: halosDe(l, anguloGlobal), conEfectos: hayEfectos(l), recorte: !!l.clipping, mesa: ctx.mesa, pieza: ctx.pieza ?? nombre,
        carpeta: ctx.pieza === null ? -1 : ctx.carpeta, parte: ctx.parte, ruta: [...ctx.ruta, hijoN],
        mascara: k && mw > 0 && mh > 0 ? { left: k.left ?? 0, top: k.top ?? 0, right: k.right ?? 0, bottom: k.bottom ?? 0, defecto: k.defaultColor ?? 255, pixeles: () => getLayerMaskImageData(l) } : null,
        letraPx: letraDe(l),
        texto: l.text ? textoDe(l.text as TextoPsdCrudo) : null,
        pixeles: () => (w > 0 && h > 0 ? getLayerImageData(l) : undefined),
      });
    }
  };
  // Sin mesas de trabajo, el documento entero es la mesa: también se abren sus envolturas.
  const conMesas = (ls: Layer[] | undefined): boolean => (ls ?? []).some((l) => !l.hidden && !!l.children && (!!l.artboard?.rect || conMesas(l.children)));
  andar(conMesas(psd.children) ? psd.children : primerNivel(psd.children, ""), 1, { mesa: -1, pieza: null, carpeta: -1, parte: null, nivel: 0, ruta: [] });

  if (!mesas.length) {
    // Sin mesas de trabajo: el lienzo entero es el anuncio.
    mesas.push({ nombre: "", x: 0, y: 0, w: psd.width, h: psd.height });
    for (const c of capas) c.mesa = 0;
  } else {
    const sueltas = capas.filter((c) => c.mesa < 0).length;
    if (sueltas) avisos.push(`${sueltas} capa(s) fuera de las mesas de trabajo: se ignoran.`);
  }
  let copia: Pixeles | undefined | null = null; // la librería la decodifica entera en cada llamada
  return {
    w: psd.width, h: psd.height, mesas, capas: capas.filter((c) => c.mesa >= 0), avisos,
    aplanadoReal: psd.imageResources?.versionInfo?.hasRealMergedData,
    aplanado: () => (copia === null ? (copia = getCompositeImageData(psd)) : copia),
  };
}

// ── Despiece ──────────────────────────────────────────────────────────────

export type PiezaPsd = {
  nombre: string;
  rol: Rol | null;
  /** Imagen plana: va sobre algo que se quedó pintado en el fondo (el texto de un botón de foto): no entra en el
   *  acomodo, va donde caiga su lugar del fondo, a la escala del fondo. */
  anclada?: boolean;
  /** Todo lo que la pieza pinta u oscurece, en px de la mesa. `rgba` y `oscurece` miden caja.w × caja.h. */
  caja: Caja;
  /** Sólo lo sólido (alfa > 50 %): la caja que manda para acomodar. */
  solido: Caja;
  rgba: Uint8ClampedArray;
  /** RGB: cuánto oscurece lo que tenga debajo (255 = nada). null si la pieza no trae sombras. */
  oscurece: Uint8ClampedArray | null;
  /** % de sus píxeles que la sombra de otra pieza de más arriba oscurece (esa sombra se queda pintada en ella). */
  tapadaPct: number;
  /** % de sus píxeles que otra pieza de más arriba tapa (sólido): ahí no se sabe su color y se rellenó con el de al lado
   *  (se ve si una de las dos se mueve). Falta = 0. */
  rellenoPct?: number;
  /** El tamaño de su letra más chica en px de la mesa; null si no trae capas de texto. */
  letraMinPx: number | null;
  /** Sus capas de texto (de abajo hacia arriba), para volver a escribirlas a la medida final. */
  textos: TextoPieza[];
  /** La pieza SIN sus textos (RGBA, caja.w × caja.h): lo que queda debajo de las letras. Sólo si TODOS sus textos
   *  se pueden intentar redibujar; si no, null y la pieza va entera como imagen. */
  base: Uint8ClampedArray | null;
  /** Sus partes (`partesDe`), de abajo hacia arriba, si sale de UNA carpeta con 2 o más. Sólo para moverlas a mano: sin
   *  edición la pieza se pinta entera, como siempre. */
  partes?: PartePsd[];
  /** Con partes: su carpeta (`CapaPsd.carpeta`), para encontrarla en el PSD editable sin depender del nombre. */
  carpeta?: number;
};
/**
 * Una PARTE de una pieza: una subcarpeta de su carpeta, o sus capas sueltas juntas (Pedro, 2026-10-19: "Parts inside a
 * piece" y "One part together"). Se pinta como una pieza: sus campos miden igual (px de la mesa).
 */
export type PartePsd = Pick<PiezaPsd, "caja" | "solido" | "rgba" | "oscurece" | "letraMinPx" | "textos" | "base"> & {
  /** El de su subcarpeta; el de las sueltas son sus capas, juntas. */
  nombre: string;
  /** Su subcarpeta: su lugar entre los hijos de la carpeta de la pieza (contando los ocultos). null = las sueltas. */
  hijo: number | null;
  /** % de sus píxeles que otra parte de la misma pieza le tapa: ahí no se sabe su color y se rellenó con el de al lado
   *  (se ve si la parte de encima se mueve). */
  rellenoPct: number;
  /** Las partes (índices en `partes` de su pieza) que le tapan algo: el relleno sólo se ve si ella o una de éstas se
   *  mueve, o si una de éstas pasa debajo de ella. */
  tapadaPor: number[];
};
/** Una capa de texto de una pieza: su texto (transform en px de la MESA), y su tinta en Photoshop para la prueba. */
export type TextoPieza = {
  capa: string;
  texto: TextoCapa;
  /** Opacidad × relleno de la capa (0-1). */
  opacidad: number;
  /** Dónde está su tinta en Photoshop, en px de la mesa, y su alfa ahí (sin la opacidad), w × h; vacío si tiene
   *  motivo (no se va a probar). */
  caja: Caja;
  alfa: Uint8ClampedArray;
  /** Por qué NO se redibuja (null = se intenta, y decide la prueba en la página). */
  motivo: string | null;
  /** Su capa en el árbol de la mesa (`CapaPsd.ruta`). */
  ruta: number[];
  /** Cuánto puede diferir de su tinta al probarlo (`compararAlfa`); sin esto, `TEXTO_DIF_MAX`. Un texto de una imagen
   *  plana (B28) lleva `TEXTO_DIF_MAX_PLANO`: su letra la dibujó otro programa, no Photoshop con el archivo. */
  difMax?: number;
  /** Se escribe sin compararlo con su tinta: el legal de una imagen plana (B30), que va en un solo tamaño aunque la
   *  imagen mezclara dos (`capaDeLegal`). */
  sinPrueba?: boolean;
  /** Sólo si se le cambiaron las letras en el editor (`cambiarTextos`): las del PSD y su tinta nueva a la escala del
   *  maestro (RGBA sin premultiplicar, en px de la mesa), para la capa del PSD editable. */
  cambio?: { de: string; tinta: { x: number; y: number; w: number; h: number; rgba: Uint8ClampedArray } | null };
};
/** De dónde salió un maestro, para volver a las capas del PSD original (psd-editable.ts): qué mesa (en el orden de
 *  `doc.mesas`), su caja en el documento y si se leyó reducida (`s` < 1: 1 px del original = s px del maestro). */
export type Origen = {
  mesa: number; x: number; y: number; w: number; h: number; s: number;
  /** Las piezas de primer nivel que la persona eligió como fondo, en una mesa sin carpeta de fondo (nombres). */
  fondo?: string[];
};
export type MaestroPsd = {
  nombre: string;
  w: number;
  h: number;
  origen: Origen;
  /** Fondo limpio: RGB, w × h. */
  fondo: Uint8ClampedArray;
  /** De abajo hacia arriba. */
  piezas: PiezaPsd[];
  /** % del fondo visible donde nuestro pintado no coincide con Photoshop NI con una corrección suave de color
   *  (0-100). Alto = la textura no coincide y, bajo las piezas, el fondo es una estimación. */
  fondoDistintoPct: number;
  /** Rearmar todo en su lugar vs la copia aplanada (0-100). */
  rearmadoDistintoPct: number;
  /** Con qué gamma mezcló Photoshop el TEXTO con lo de abajo (ver `TEXTO_GAMMAS`): el texto vuelto a escribir se
   *  mezcla igual. */
  textoGamma: number;
  avisos: string[];
  /** Imagen plana: lo que se quedó pintado en el fondo (`medirPlanoFijo`). */
  pegados?: readonly PegadoAlFondo[];
};

const OSCURECE = new Set(["multiply", "darken", "linear burn", "color burn", "darker color"]);
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Modos de fusión por canal (B = lo de abajo, S = la capa; 0-1). Los que no están aquí se pintan como normal. */
const FUSION: Record<string, (B: number, S: number) => number> = {
  multiply: (B, S) => B * S,
  screen: (B, S) => 1 - (1 - B) * (1 - S),
  darken: (B, S) => Math.min(B, S),
  lighten: (B, S) => Math.max(B, S),
  overlay: (B, S) => (B <= 0.5 ? 2 * B * S : 1 - 2 * (1 - B) * (1 - S)),
  "hard light": (B, S) => (S <= 0.5 ? 2 * B * S : 1 - 2 * (1 - B) * (1 - S)),
  "soft light": (B, S) => (S <= 0.5 ? B - (1 - 2 * S) * B * (1 - B) : B + (2 * S - 1) * ((B <= 0.25 ? ((16 * B - 12) * B + 4) * B : Math.sqrt(B)) - B)),
  "color dodge": (B, S) => (S >= 1 ? 1 : Math.min(1, B / (1 - S))),
  "color burn": (B, S) => (S <= 0 ? 0 : Math.max(0, 1 - (1 - B) / S)),
  "linear dodge": (B, S) => Math.min(1, B + S),
  "linear burn": (B, S) => Math.max(0, B + S - 1),
  "linear light": (B, S) => Math.min(1, Math.max(0, B + 2 * S - 1)),
  "vivid light": (B, S) => (S <= 0.5 ? (S <= 0 ? 0 : Math.max(0, 1 - (1 - B) / (2 * S))) : S >= 1 ? 1 : Math.min(1, B / (2 * (1 - S)))),
  "pin light": (B, S) => (S <= 0.5 ? Math.min(B, 2 * S) : Math.max(B, 2 * S - 1)),
  difference: (B, S) => Math.abs(B - S),
  exclusion: (B, S) => B + S - 2 * B * S,
};
const FUSION_ENTERA = new Set(["normal", "lighter color", "darker color"]);

/** Recorre los píxeles de una capa que caen en la mesa: índice en la mesa, alfa efectiva (opacidad, máscara y,
 *  si se pide, relleno) y dónde está su color en `data`. No decodifica nada si la capa no toca la mesa. */
function porPixel(c: CapaPsd, m: MesaPsd, conRelleno: boolean, fn: (i: number, alfa: number, data: Pixeles["data"], s: number) => void): void {
  const y0 = Math.max(0, m.y - c.top), y1 = Math.min(c.h, m.y + m.h - c.top);
  const x0 = Math.max(0, m.x - c.left), x1 = Math.min(c.w, m.x + m.w - c.left);
  const peso = c.opacidad * (conRelleno ? c.relleno : 1);
  if (y0 >= y1 || x0 >= x1 || !(peso > 0)) return;
  const img = c.pixeles();
  if (!img || img.width !== c.w || img.height !== c.h) return;
  const mk = c.mascara;
  const mkW = mk ? mk.right - mk.left : 0;
  const mkPx = mk?.pixeles();
  const mkImg = mk && mkPx && mkPx.width === mkW && mkPx.height === mk.bottom - mk.top ? mkPx : undefined;
  for (let y = y0; y < y1; y++) {
    const Y = y + c.top;
    for (let x = x0; x < x1; x++) {
      const s = (y * c.w + x) * 4;
      let a = (img.data[s + 3] / 255) * peso;
      if (!(a > 0)) continue;
      if (mk) {
        const X = x + c.left;
        const dentro = mkImg && X >= mk.left && X < mk.right && Y >= mk.top && Y < mk.bottom;
        a *= (dentro ? mkImg.data[((Y - mk.top) * mkW + (X - mk.left)) * 4] : mk.defecto) / 255;
        if (!(a > 0)) continue;
      }
      fn((Y - m.y) * m.w + (x + c.left - m.x), a, img.data, s);
    }
  }
}

/** La misma capa, decodificando sus píxeles (y su máscara) una sola vez. */
function conCache(c: CapaPsd): CapaPsd {
  return { ...c, pixeles: una(c.pixeles), mascara: c.mascara && { ...c.mascara, pixeles: una(c.mascara.pixeles) } };
}

/** La zona de un halo, corrida a donde cae (la sombra paralela, `Halo.dx/dy`). */
const correr = <T extends Caja>(g: T | null, hl: Halo): T | null => (g && (hl.dx || hl.dy) ? { ...g, x: g.x + (hl.dx ?? 0), y: g.y + (hl.dy ?? 0) } : g);

/** Cuánto pesa un halo a `d` px de la silueta (0 = encima). Una sombra se desvanece hacia la orilla de su desenfoque:
 *  a lo lejos ya no se ve (SPAPTOYBOX, 2026-10-30: la orilla de la del botón contaba como si oscureciera el legal). Nunca
 *  baja de lo que marca la zona (0.02): la zona en sí no cambia. Contorno y resplandor, parejos. */
const pesoHalo = (hl: Halo, d: number) => (hl.tipo === "sombra" ? Math.max(0.021, hl.fuerza * Math.min(1, (hl.radio + 1 - d) / (hl.radio + 1))) : hl.fuerza);

/** La silueta de una capa engordada `r` px (cuadrado), con la distancia de cada píxel a ella (`lejos`). Para lo que sus
 *  efectos pintan fuera de ella. La caja sale en px de la mesa y puede asomarse fuera: una capa estacionada junto a la
 *  mesa todavía le echa sombra. */
function engordar(c: CapaPsd, m: MesaPsd, r: number): (Caja & { on: Uint8Array; lejos: Uint16Array }) | null {
  const v: MesaPsd = { nombre: m.nombre, x: m.x - r, y: m.y - r, w: m.w + 2 * r, h: m.h + 2 * r }; // la mesa, con margen r
  const x = Math.max(0, c.left - v.x - r), y = Math.max(0, c.top - v.y - r);
  const w = Math.min(v.w, c.left - v.x + c.w + r) - x, h = Math.min(v.h, c.top - v.y + c.h + r) - y;
  if (w <= 0 || h <= 0) return null;
  const on = new Uint8Array(w * h);
  let alguno = false;
  porPixel(c, v, false, (i, a) => {
    if (a > 0.02) { on[(((i / v.w) | 0) - y) * w + ((i % v.w) - x)] = 1; alguno = true; }
  });
  if (!alguno) return null;
  // Distancia "de tablero" (los 8 vecinos a 1) en dos barridas: de arriba a la izquierda y de abajo a la derecha. Lo que
  // queda a r o menos es la misma silueta engordada en cuadrado de siempre.
  const tope = r + 1;
  const lejos = new Uint16Array(w * h).fill(tope);
  for (let j = 0; j < w * h; j++) if (on[j]) lejos[j] = 0;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) {
      const j = yy * w + xx;
      let d = lejos[j];
      if (!d) continue;
      if (xx > 0) d = Math.min(d, lejos[j - 1] + 1);
      if (yy > 0) {
        d = Math.min(d, lejos[j - w] + 1);
        if (xx > 0) d = Math.min(d, lejos[j - w - 1] + 1);
        if (xx < w - 1) d = Math.min(d, lejos[j - w + 1] + 1);
      }
      lejos[j] = Math.min(d, tope);
    }
  for (let yy = h - 1; yy >= 0; yy--)
    for (let xx = w - 1; xx >= 0; xx--) {
      const j = yy * w + xx;
      let d = lejos[j];
      if (!d) continue;
      if (xx < w - 1) d = Math.min(d, lejos[j + 1] + 1);
      if (yy < h - 1) {
        d = Math.min(d, lejos[j + w] + 1);
        if (xx < w - 1) d = Math.min(d, lejos[j + w + 1] + 1);
        if (xx > 0) d = Math.min(d, lejos[j + w - 1] + 1);
      }
      lejos[j] = Math.min(d, tope);
    }
  for (let j = 0; j < w * h; j++) on[j] = lejos[j] <= r ? 1 : 0;
  return { x: x - r, y: y - r, w, h, on, lejos };
}

/** Rellena los huecos (peso 0) de un campo RGB suave a partir de lo conocido: pirámide "push-pull". */
function rellenar(val: Float32Array, peso: Uint8Array, w: number, h: number): void {
  if (w <= 2 && h <= 2) {
    // Arriba de la pirámide: lo que siga hueco toma el promedio de lo conocido (no cero).
    const n = w * h;
    const med = [0, 0, 0];
    let sabidos = 0;
    for (let i = 0; i < n; i++) if (peso[i]) { sabidos++; for (let k = 0; k < 3; k++) med[k] += val[i * 3 + k]; }
    if (sabidos) for (let i = 0; i < n; i++) if (!peso[i]) for (let k = 0; k < 3; k++) val[i * 3 + k] = med[k] / sabidos;
    return;
  }
  const w2 = Math.ceil(w / 2), h2 = Math.ceil(h / 2);
  const v2 = new Float32Array(w2 * h2 * 3);
  const n2 = new Uint32Array(w2 * h2);
  let huecos = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!peso[i]) { huecos = true; continue; }
      const j = (y >> 1) * w2 + (x >> 1);
      v2[j * 3] += val[i * 3]; v2[j * 3 + 1] += val[i * 3 + 1]; v2[j * 3 + 2] += val[i * 3 + 2];
      n2[j]++;
    }
  if (!huecos) return;
  const p2 = new Uint8Array(w2 * h2);
  for (let j = 0; j < w2 * h2; j++)
    if (n2[j]) { v2[j * 3] /= n2[j]; v2[j * 3 + 1] /= n2[j]; v2[j * 3 + 2] /= n2[j]; p2[j] = 1; }
  rellenar(v2, p2, w2, h2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (peso[i]) continue;
      const fx = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2));
      const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(w2 - 1, xa + 1), yb = Math.min(h2 - 1, ya + 1), tx = fx - xa, ty = fy - ya;
      for (let k = 0; k < 3; k++) {
        const a = v2[(ya * w2 + xa) * 3 + k], b = v2[(ya * w2 + xb) * 3 + k], c = v2[(yb * w2 + xa) * 3 + k], d = v2[(yb * w2 + xb) * 3 + k];
        val[i * 3 + k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      }
    }
}

const a8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
/** Debajo de esto, "cuánto oscurece" no se puede medir (dividir entre casi cero): se deja sin oscurecer. */
const NEGRO = 8 / 255;

/**
 * Llena lo `desconocido` de un campo suave (w × h, un canal) con lo que lo rodea, sin escalones: cada punto queda en
 * el promedio de sus vecinos (Laplace), resuelto de grueso a fino para que converja rápido. Lo conocido no se toca.
 */
export function rellenarSuave(v: Float32Array, desconocido: Uint8Array, w: number, h: number): void {
  let conocidos = 0, suma = 0;
  for (let i = 0; i < w * h; i++) if (!desconocido[i]) { suma += v[i]; conocidos++; }
  if (!conocidos) return;
  let prev: Float32Array | null = null, pw = 0, ph = 0;
  for (const [f, vueltas] of [[8, 300], [4, 150], [2, 60], [1, 30]] as const) {
    const cw = Math.ceil(w / f), ch = Math.ceil(h / f);
    const val = new Float32Array(cw * ch), fijo = new Uint8Array(cw * ch), cuenta = new Float32Array(cw * ch);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (desconocido[i]) continue;
        const k = Math.floor(y / f) * cw + Math.floor(x / f);
        val[k] += v[i];
        cuenta[k]++;
      }
    for (let k = 0; k < cw * ch; k++) {
      if (cuenta[k]) { val[k] /= cuenta[k]; fijo[k] = 1; }
      else val[k] = prev ? prev[Math.min(ph - 1, Math.floor(k / cw) >> 1) * pw + Math.min(pw - 1, (k % cw) >> 1)] : suma / conocidos;
    }
    for (let n = 0; n < vueltas; n++)
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const k = y * cw + x;
          if (fijo[k]) continue;
          let t = 0, c = 0;
          if (x > 0) { t += val[k - 1]; c++; }
          if (x < cw - 1) { t += val[k + 1]; c++; }
          if (y > 0) { t += val[k - cw]; c++; }
          if (y < ch - 1) { t += val[k + cw]; c++; }
          val[k] = t / c;
        }
    prev = val; pw = cw; ph = ch;
  }
  for (let i = 0; i < w * h; i++) if (desconocido[i] && prev) v[i] = prev[i];
}

// ── Mesas enormes: se leen reducidas ─────────────────────────────────────

/** Lo que una función de píxeles promete: decodificar (o reducir) UNA vez, la primera vez que se pide. */
function una<T>(fn: () => T): () => T {
  let hecho = false;
  let valor: T | undefined;
  return () => {
    if (!hecho) { valor = fn(); hecho = true; }
    return valor as T;
  };
}

/**
 * Reducir por ÁREA: cada píxel nuevo es el promedio exacto de lo que cubre del original (sin dientes ni moiré).
 * `x0, y0` = dónde cae, en px del original, la esquina del píxel nuevo (0, 0); `invX, invY` = px del original por
 * px nuevo (≥ 1: sólo reduce). Lo que cae fuera del original vale `fuera`. Con `premult`, el color se promedia
 * pesado por su alfa (un borde transparente no oscurece la orilla). Va fila por fila del original: en memoria sólo
 * hay dos filas nuevas a la vez, nunca una copia en flotantes del tamaño de la capa.
 */
export function promediarArea(src: Pixeles, x0: number, y0: number, invX: number, invY: number, dw: number, dh: number, fuera: readonly [number, number, number, number], premult: boolean): Pixeles {
  if (!(invX >= 1 && invY >= 1 && dw > 0 && dh > 0)) throw new Error("promediarArea: sólo reduce");
  const { width: W, height: H, data } = src;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const fa = fuera[3] / 255;
  const fueraP = premult ? [fuera[0] * fa, fuera[1] * fa, fuera[2] * fa, fuera[3]] : [...fuera];
  // Por cada columna nueva: qué columnas del original toca y con cuánto de su ancho.
  const ini = new Int32Array(dw + 1);
  const cols: number[] = [], pesos: number[] = [];
  for (let X = 0; X < dw; X++) {
    ini[X] = cols.length;
    const a = x0 + X * invX, b = a + invX;
    for (let i = Math.floor(a); i < b; i++) {
      const w = Math.min(b, i + 1) - Math.max(a, i);
      if (w > 1e-12) { cols.push(i); pesos.push(w); }
    }
  }
  ini[dw] = cols.length;
  const n = dw * 4;
  const fila = new Float64Array(n);
  const acc = new Float64Array(n * 2); // la fila nueva en curso y la siguiente (una fila del original toca 2 como mucho)
  const area = invX * invY;
  const escribir = (Y: number) => {
    for (let X = 0; X < dw; X++) {
      const k = X * 4, o = (Y * dw + X) * 4, al = acc[k + 3];
      out[o + 3] = Math.round(al / area);
      if (premult) {
        if (al > 0) for (let c = 0; c < 3; c++) out[o + c] = Math.round(acc[k + c] / (al / 255));
      } else for (let c = 0; c < 3; c++) out[o + c] = Math.round(acc[k + c] / area);
    }
    acc.copyWithin(0, n);
    acc.fill(0, n);
  };
  let Y = 0;
  const jFin = Math.ceil(y0 + dh * invY - 1e-9);
  for (let j = Math.floor(y0); j < jFin && Y < dh; j++) {
    fila.fill(0);
    const dentroY = j >= 0 && j < H;
    for (let X = 0; X < dw; X++) {
      const k = X * 4;
      for (let t = ini[X]; t < ini[X + 1]; t++) {
        const i = cols[t], w = pesos[t];
        if (!dentroY || i < 0 || i >= W) { fila[k] += fueraP[0] * w; fila[k + 1] += fueraP[1] * w; fila[k + 2] += fueraP[2] * w; fila[k + 3] += fueraP[3] * w; continue; }
        const s = (j * W + i) * 4, a = premult ? data[s + 3] / 255 : 1;
        fila[k] += data[s] * a * w; fila[k + 1] += data[s + 1] * a * w; fila[k + 2] += data[s + 2] * a * w; fila[k + 3] += data[s + 3] * w;
      }
    }
    for (let T = Y; T <= Y + 1 && T < dh; T++) {
      const c = y0 + T * invY;
      const w = Math.min(c + invY, j + 1) - Math.max(c, j);
      if (w <= 1e-12) continue;
      const base = (T - Y) * n;
      for (let k = 0; k < n; k++) acc[base + k] += fila[k] * w;
    }
    // Una fila nueva está completa cuando ya pasó todo lo que la cubre.
    while (Y < dh && y0 + (Y + 1) * invY <= j + 1 + 1e-9) escribir(Y++);
  }
  while (Y < dh) escribir(Y++);
  return { data: out, width: dw, height: dh };
}

/**
 * Una mesa más grande que `maxPx` se lee REDUCIDA en vez de rechazarse (las medidas de entrega son de 2 MP como
 * mucho): un documento nuevo con sólo esa mesa en (0, 0), sus capas y su copia aplanada ya a escala. Cada capa se
 * reduce al pedirla, una sola vez. La mesa tiene que caber en el lienzo (quien llama ya lo revisó).
 */
export function reducirMesa(doc: DocPsd, mesa: number, maxPx: number = MESA_MAX_PX): { doc: DocPsd; w: number; h: number } {
  const m = doc.mesas[mesa];
  const s = Math.sqrt(maxPx / (m.w * m.h));
  const w = Math.max(1, Math.floor(m.w * s)), h = Math.max(1, Math.floor(m.h * s));
  const invX = m.w / w, invY = m.h / h;
  // Una capa de afuera todavía le puede echar sombra a la mesa: se conserva un margen del alcance de un halo.
  const caja = (l: number, t: number, r: number, b: number) => {
    const x0 = Math.max(-HALO_MAX_PX, Math.floor((l - m.x) / invX)), y0 = Math.max(-HALO_MAX_PX, Math.floor((t - m.y) / invY));
    const x1 = Math.min(w + HALO_MAX_PX, Math.ceil((r - m.x) / invX)), y1 = Math.min(h + HALO_MAX_PX, Math.ceil((b - m.y) / invY));
    return { x0, y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  };
  const capas = doc.capas
    .filter((c) => c.mesa === mesa)
    .map((c): CapaPsd => {
      const k = caja(c.left, c.top, c.left + c.w, c.top + c.h);
      const mk = c.mascara;
      const km = mk && caja(mk.left, mk.top, mk.right, mk.bottom);
      return {
        ...c,
        mesa: 0, left: k.x0, top: k.y0, w: k.w, h: k.h,
        halos: c.halos.map((hl) => ({ ...hl, radio: Math.min(HALO_MAX_PX, Math.ceil(hl.radio / Math.min(invX, invY)) + 1), ...(hl.dx || hl.dy ? { dx: Math.round((hl.dx ?? 0) / invX), dy: Math.round((hl.dy ?? 0) / invY) } : {}) })),
        letraPx: c.letraPx === null ? null : c.letraPx / invY,
        // El texto, a la misma escala: del lienzo a la mesa reducida (que queda en 0, 0).
        texto: c.texto && { ...c.texto, transform: [c.texto.transform[0] / invX, c.texto.transform[1] / invY, c.texto.transform[2] / invX, c.texto.transform[3] / invY, (c.texto.transform[4] - m.x) / invX, (c.texto.transform[5] - m.y) / invY] },
        pixeles: una(() => {
          const img = c.pixeles();
          return img && k.w > 0 && k.h > 0 ? promediarArea(img, m.x + k.x0 * invX - c.left, m.y + k.y0 * invY - c.top, invX, invY, k.w, k.h, [0, 0, 0, 0], true) : undefined;
        }),
        mascara: mk && km && km.w > 0 && km.h > 0
          ? {
              left: km.x0, top: km.y0, right: km.x0 + km.w, bottom: km.y0 + km.h, defecto: mk.defecto,
              pixeles: una(() => {
                const img = mk.pixeles();
                return img ? promediarArea(img, m.x + km.x0 * invX - mk.left, m.y + km.y0 * invY - mk.top, invX, invY, km.w, km.h, [mk.defecto, mk.defecto, mk.defecto, 255], false) : undefined;
              }),
            }
          : null,
      };
    });
  const aplanado = una(() => {
    const ap = doc.aplanado();
    return ap ? promediarArea(ap, m.x, m.y, invX, invY, w, h, [255, 255, 255, 255], false) : undefined;
  });
  return { doc: { w, h, mesas: [{ nombre: m.nombre, x: 0, y: 0, w, h }], capas, avisos: [], aplanadoReal: doc.aplanadoReal, aplanado }, w, h };
}

/**
 * Una mesa → fondo limpio + piezas. Lanza SIEMPRE ErrorPsd (nunca otro error) cuando el anuncio tiene que ir por
 * la vía plana: sin copia aplanada, sin carpeta BACKGROUND, demasiado grande o datos que no se pueden leer.
 * Una mesa de más de `mesaMaxPx` se lee reducida a ese tamaño, con aviso.
 */
export function despiezar(doc: DocPsd, mesa: number, op: { mesaMaxPx?: number; fondo?: readonly string[] } = {}): MaestroPsd {
  try {
    const fondo = op.fondo?.length ? { fondo: [...op.fondo] } : {};
    const m = doc.mesas[mesa];
    if (!m) throw new ErrorPsd("no-soportado", `No existe la mesa ${mesa}`);
    if (![m.x, m.y, m.w, m.h].every(Number.isInteger) || !(m.w > 0 && m.h > 0) || m.x < 0 || m.y < 0 || m.x + m.w > doc.w || m.y + m.h > doc.h) throw new ErrorPsd("no-soportado", `La mesa «${m.nombre}» se sale del lienzo`);
    const max = op.mesaMaxPx ?? MESA_MAX_PX;
    if (m.w * m.h <= max) return { ...despiezarMesa(doc, mesa, op.fondo), origen: { mesa, x: m.x, y: m.y, w: m.w, h: m.h, s: 1, ...fondo } };
    const r = reducirMesa(doc, mesa, max);
    const ma = { ...despiezarMesa(r.doc, 0, op.fondo), origen: { mesa, x: m.x, y: m.y, w: m.w, h: m.h, s: r.w / m.w, ...fondo } };
    ma.avisos.unshift(`La mesa mide ${m.w}×${m.h}: se leyó reducida a ${r.w}×${r.h} (las medidas de entrega son más chicas).`);
    return ma;
  } catch (err) {
    if (err instanceof ErrorPsd) throw err;
    throw new ErrorPsd("no-soportado", `No se pudieron leer las capas del PSD: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** ¿La mesa trae fondo? Sin él no se puede separar: la página pregunta cuál de sus piezas es (`piezasDeMesa`). */
export const tieneFondo = (doc: DocPsd, mesa: number, fondo?: readonly string[]) => doc.capas.some((c) => c.mesa === mesa && esDelFondo(c.pieza, fondo));

/** Lo que se puede elegir como fondo: las piezas de primer nivel de la mesa (carpetas y capas sueltas), de ABAJO hacia
 *  arriba, con cuántas capas visibles trae cada una. */
export function piezasDeMesa(doc: DocPsd, mesa: number): { nombre: string; carpeta: boolean; capas: number }[] {
  const out = new Map<string, { nombre: string; carpeta: boolean; capas: number }>();
  for (const c of doc.capas) {
    if (c.mesa !== mesa) continue;
    const p = out.get(c.pieza) ?? { nombre: c.pieza, carpeta: false, capas: 0 };
    p.carpeta ||= c.carpeta >= 0;
    p.capas++;
    out.set(c.pieza, p);
  }
  return [...out.values()];
}

function despiezarMesa(doc: DocPsd, mesa: number, elegido?: readonly string[]): Omit<MaestroPsd, "origen"> {
  const m = doc.mesas[mesa];
  const N = m.w * m.h;
  if (N > MESA_MAX_PX) throw new ErrorPsd("demasiado-grande", `La mesa «${m.nombre}» mide ${m.w}×${m.h}`);
  const capas = doc.capas.filter((c) => c.mesa === mesa);
  const delFondo = capas.filter((c) => esDelFondo(c.pieza, elegido));
  if (!capas.length) throw new ErrorPsd("sin-fondo", `La mesa «${m.nombre}» no tiene capas visibles`);
  if (!delFondo.length) throw new ErrorPsd("sin-fondo", `La mesa «${m.nombre}» no tiene carpeta de fondo (BACKGROUND, Fondo o BG) y no se eligió cuál es`);
  // Cada carpeta de primer nivel cuesta un búfer del tamaño de la mesa: se cuenta ANTES de reservar nada.
  const nPiezas = new Set(capas.filter((c) => !esDelFondo(c.pieza, elegido)).map((c) => c.pieza)).size;
  if (nPiezas > PIEZAS_MAX || N * (60 + 15 * nPiezas) > DESPIECE_MAX_BYTES) throw new ErrorPsd("demasiado-grande", `La mesa «${m.nombre}» tiene ${nPiezas} carpetas o capas sueltas de primer nivel (máximo ${PIEZAS_MAX}). Qué hacer: mete las capas sueltas en las carpetas de la guía.`);
  const ap = doc.aplanadoReal === false ? undefined : doc.aplanado();
  if (!ap || ap.width !== doc.w || ap.height !== doc.h) throw new ErrorPsd("sin-aplanado", "El PSD no trae copia aplanada: guardarlo con «Maximizar compatibilidad».");
  const avisos: string[] = [];

  // La copia aplanada de Photoshop, recortada a la mesa (RGB 0-1). Su cuarto canal se ignora: Photoshop ya
  // guarda el color sobre blanco, y ese canal puede ser una selección guardada en vez de transparencia.
  const C = new Float32Array(N * 3);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const q = ((y + m.y) * doc.w + (x + m.x)) * 4, i = (y * m.w + x) * 3;
      C[i] = ap.data[q] / 255; C[i + 1] = ap.data[q + 1] / 255; C[i + 2] = ap.data[q + 2] / 255;
    }

  // Siluetas: por pieza, alfa de lo sólido y zona de lo que oscurece.
  type Trabajo = { nombre: string; alfa: Float32Array; sombra: Float32Array | null };
  const trabajos: Trabajo[] = [];
  /** Donde cae algo que OSCURECE (una sombra paralela o una capa en multiplicar), no un resplandor: ahí el fondo de
   *  verdad nunca es más oscuro que lo que se ve. */
  const oscurecido = new Uint8Array(N);
  for (let c of capas) {
    if (esDelFondo(c.pieza, elegido) || c.recorte || c.tipo === "ajuste") continue; // recortadas y ajustes sólo cambian color
    let t = trabajos.find((x) => x.nombre === c.pieza);
    if (!t) trabajos.push((t = { nombre: c.pieza, alfa: new Float32Array(N), sombra: null }));
    const { alfa } = t;
    const etiqueta = `«${c.pieza} / ${c.nombre}»`;
    // El Relleno baja los píxeles de la capa pero NO sus efectos: una capa al 0 % con contorno interior o
    // degradado sigue viéndose entera. Con efectos, la silueta es la forma completa.
    const conRelleno = !c.conEfectos;
    if (c.halos.length) c = conCache(c); // sus píxeles se leen una vez por halo
    if (c.mezcla === "normal") {
      porPixel(c, m, conRelleno, (i, a) => { alfa[i] = a + alfa[i] * (1 - a); });
    } else if (OSCURECE.has(c.mezcla)) {
      // En todos estos modos el BLANCO no hace nada: una capa de sombra suele ser un rectángulo opaco, blanco
      // salvo donde oscurece. Lo que cuenta es cuánto se aleja del blanco, no su alfa.
      const sombra = (t.sombra ??= new Float32Array(N));
      porPixel(c, m, conRelleno, (i, a, data, s) => {
        const fuerza = a * (1 - Math.min(data[s], data[s + 1], data[s + 2]) / 255);
        if (fuerza > sombra[i]) sombra[i] = fuerza;
        if (fuerza > 0.02) oscurecido[i] = 1;
      });
    } else {
      avisos.push(`${etiqueta} usa fusión ${c.mezcla}: ese efecto no viaja con la pieza.`);
    }
    // Lo que sus efectos pintan FUERA de la capa: el contorno es parte de la silueta; la sombra paralela y el
    // resplandor son zona "tocada" (si no, se quedarían pintados en el fondo limpio).
    for (const hl of c.halos) {
      const g = correr(engordar(c, m, hl.radio), hl);
      if (!g) continue;
      const destino = hl.tipo === "contorno" ? alfa : (t.sombra ??= new Float32Array(N));
      for (let yy = Math.max(0, -g.y); yy < Math.min(g.h, m.h - g.y); yy++)
        for (let xx = Math.max(0, -g.x); xx < Math.min(g.w, m.w - g.x); xx++) {
          const i = (yy + g.y) * m.w + (xx + g.x), f = pesoHalo(hl, g.lejos[yy * g.w + xx]);
          if (g.on[yy * g.w + xx] && hl.tipo === "sombra") oscurecido[i] = 1;
          if (g.on[yy * g.w + xx] && f > destino[i]) destino[i] = f;
        }
      if (hl.tipo === "luz") avisos.push(`${etiqueta} tiene resplandor exterior: no viaja con la pieza.`);
    }
    if (c.relleno < 1 && c.conEfectos) avisos.push(`${etiqueta} usa Relleno al ${Math.round(c.relleno * 100)} % con efectos: revisar esa pieza.`);
  }

  // Fondo: nuestro pintado de BACKGROUND, con sus modos de fusión.
  const guia = new Float32Array(N * 3).fill(1);
  for (const c of delFondo) {
    if (c.tipo === "ajuste") continue;
    let solidos = 0;
    const f = FUSION[c.mezcla];
    if (!f && !FUSION_ENTERA.has(c.mezcla)) avisos.push(`Fondo: fusión ${c.mezcla} pintada como normal.`);
    const modo = c.mezcla;
    porPixel(c, m, true, (i, a, data, s) => {
      if (a > 0.5) solidos++;
      const d = i * 3;
      const br = guia[d], bg = guia[d + 1], bb = guia[d + 2];
      let r = data[s] / 255, g = data[s + 1] / 255, b = data[s + 2] / 255;
      if (f) { r = f(br, r); g = f(bg, g); b = f(bb, b); }
      else if (modo === "lighter color") { if (lum(br, bg, bb) > lum(r, g, b)) { r = br; g = bg; b = bb; } }
      else if (modo === "darker color") { if (lum(br, bg, bb) < lum(r, g, b)) { r = br; g = bg; b = bb; } }
      guia[d] = br + (r - br) * a; guia[d + 1] = bg + (g - bg) * a; guia[d + 2] = bb + (b - bb) * a;
    });
    // El fondo debe ser sólo fondo (Pedro, 2026-10-28: "a rule of thumb should be always separate all the elements if
    // possible and the background should be only the bg"). Una capa de BACKGROUND que tapa buena parte del anuncio,
    // pero no todo, casi siempre es un producto o una persona (el iPhone de DiDi venía como foto en BACKGROUND): se
    // queda pintado y no se acomoda. Las de casi todo el lienzo son fondos; las tenues (luces, sombras) no llegan.
    const pct = (solidos / N) * 100;
    // Lo de debajo del fondo (`desenvolver`) va tapado: no tiene caso pedir que se recorte.
    if (pct >= FONDO_ELEMENTO_MIN_PCT && pct < FONDO_ELEMENTO_MAX_PCT && c.pieza !== CAPA_DEBAJO_FONDO)
      avisos.push(`«${rolDe(c.pieza) === "BACKGROUND" ? "BACKGROUND" : c.pieza} / ${c.nombre}» tapa el ${Math.round(pct)} % del anuncio: si es un producto o una persona, recórtalo de su fondo y ponlo en HERO (el fondo sólo debe ser fondo). Así como está, se queda pintado y no se acomoda en las medidas.`);
  }

  // Dónde se VE el fondo: fuera de toda pieza y de sus sombras, con 3 px de holgura para los bordes suavizados.
  const visible = new Uint8Array(N).fill(1);
  for (const t of trabajos) for (let i = 0; i < N; i++) if (t.alfa[i] > 0.02 || (t.sombra && t.sombra[i] > 0.02)) visible[i] = 0;
  for (let paso = 0; paso < 3; paso++) {
    const prev = visible.slice();
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x;
        if (prev[i] && ((x > 0 && !prev[i - 1]) || (x < m.w - 1 && !prev[i + 1]) || (y > 0 && !prev[i - m.w]) || (y < m.h - 1 && !prev[i + m.w]))) visible[i] = 0;
      }
  }
  // La diferencia contra Photoshop donde el fondo se ve. Su parte SUAVE (un tinte, un ajuste de color que no
  // pintamos) se extiende bien por debajo de las piezas; su parte FINA (textura que no coincide) no. Se mide
  // sólo la fina: lo que queda al quitarle el promedio de su bloque de 16 px.
  const resto = new Float32Array(N * 3);
  const BLOQUE = 16;
  const bw = Math.ceil(m.w / BLOQUE), bh = Math.ceil(m.h / BLOQUE);
  const suma = new Float32Array(bw * bh * 3);
  const cuenta = new Uint32Array(bw * bh);
  let nVisible = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!visible[i]) continue;
      nVisible++;
      const j = ((y / BLOQUE) | 0) * bw + ((x / BLOQUE) | 0);
      for (let k = 0; k < 3; k++) { resto[i * 3 + k] = C[i * 3 + k] - guia[i * 3 + k]; suma[j * 3 + k] += resto[i * 3 + k]; }
      cuenta[j]++;
    }
  if (!nVisible) throw new ErrorPsd("sin-fondo", `En la mesa «${m.nombre}» las piezas tapan todo el fondo`);
  let guiaMal = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      if (!visible[i]) continue;
      const j = ((y / BLOQUE) | 0) * bw + ((x / BLOQUE) | 0);
      for (let k = 0; k < 3; k++)
        if (!(Math.abs(resto[i * 3 + k] - suma[j * 3 + k] / cuenta[j]) * 255 <= TOLERANCIA)) { guiaMal++; break; }
    }
  rellenar(resto, visible, m.w, m.h);
  // Desde aquí `D` es "lo de atrás": empieza siendo el fondo limpio y cada pieza se le va sumando.
  const D = guia;
  const fondo = new Uint8ClampedArray(N * 3);
  for (let i = 0; i < N * 3; i++) { D[i] = Math.min(1, Math.max(0, guia[i] + resto[i])); fondo[i] = Math.round(D[i] * 255); }
  // Donde sólo cae la sombra de una pieza (ninguna pinta ahí), Photoshop deja ver el fondo YA oscurecido: el fondo de
  // verdad nunca es más oscuro que eso (una sombra sólo oscurece). Un estimado más oscuro (SPAPTOYBOX, 2026-10-30: las
  // sombras de las capas del BACKGROUND, que no se pintan, se corrían a la zona de los halos) se sube a lo que se ve.
  // Sólo en zonas de sombra: no en un resplandor (aclara: subirlo pegaría la luz al fondo) ni en la orilla de 3 px.
  const pinta = new Uint8Array(N);
  for (const t of trabajos) for (let i = 0; i < N; i++) if (t.alfa[i] > 0.02) pinta[i] = 1;
  for (let i = 0; i < N; i++) {
    if (visible[i] || pinta[i] || !oscurecido[i]) continue;
    for (let c = 0; c < 3; c++) if (D[i * 3 + c] < C[i * 3 + c]) { D[i * 3 + c] = C[i * 3 + c]; fondo[i * 3 + c] = Math.round(C[i * 3 + c] * 255); }
  }

  // tope[i] = la pieza de MÁS ARRIBA que pinta sólido ahí (−1 = ninguna): para saber qué le tapan a cada una.
  const K = trabajos.length;
  const tope = new Int8Array(N).fill(-1);
  for (let k = K - 1; k >= 0; k--) { const al = trabajos[k].alfa; for (let i = 0; i < N; i++) if (tope[i] < 0 && al[i] > 0.05) tope[i] = k; }
  const ultima = new Int8Array(N).fill(-1); // la última pieza sólida ya armada ahí
  const propios = new Uint32Array(K), ajenos = new Uint32Array(K), cubiertos = new Uint32Array(K);
  const contado = new Uint8Array(N); // un píxel de una pieza cuenta como "oscurecido por otra" una sola vez
  const armadas: (PiezaPsd | null)[] = [];
  // Abrir una pieza en partes nunca tumba el despiece: si algo falla o no cuadra, la pieza se mueve entera, con aviso.
  const entera = (nombre: string, porque: string) => avisos.push(`«${nombre}» se mueve entera en el editor: ${porque}.`);
  let partesRetenidas = 0; // bytes de las partes ya abiertas en esta mesa (se quedan hasta el final)
  for (let k = 0; k < K; k++) {
    const t = trabajos[k];
    // Sus partes: lo de atrás ANTES de pintar esta pieza, en la caja de todo lo que toca (con eso se des-mezcla cada
    // parte, `partesDe`). Sólo si la pieza sale de UNA carpeta con 2 o más grupos.
    const deLaPieza = capas.filter((c) => c.pieza === t.nombre);
    const grupos = gruposDe(deLaPieza);
    let atras: Atras | null = null;
    if (grupos) {
      let bx0 = m.w, by0 = m.h, bx1 = -1, by1 = -1;
      for (let i = 0; i < N; i++)
        if (t.alfa[i] > 0.02 || (t.sombra && t.sombra[i] > 0.02)) {
          const x = i % m.w, y = (i / m.w) | 0;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      const caja = { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
      const pico = caja.w * caja.h * (PARTES_BYTES_PX + PARTES_BYTES_PX_PARTE * grupos.length);
      // bx1 < 0: no pinta nada en esta mesa, no hay partes que abrir.
      if (bx1 >= 0 && grupos.length > PARTES_MAX) entera(t.nombre, `tiene más de ${PARTES_MAX} subcarpetas`);
      else if (bx1 >= 0 && (pico > PARTES_MAX_BYTES || partesRetenidas + pico > PARTES_MESA_MAX_BYTES)) entera(t.nombre, "es demasiado grande para abrirla en partes");
      else if (bx1 >= 0)
        try {
          const Da = new Float32Array(caja.w * caja.h * 3);
          for (let yy = 0; yy < caja.h; yy++) Da.set(D.subarray(((yy + caja.y) * m.w + caja.x) * 3, ((yy + caja.y) * m.w + caja.x + caja.w) * 3), yy * caja.w * 3);
          atras = { caja, D: Da };
        } catch (err) {
          console.warn("[psd] no se pudo guardar lo de atrás para abrir en partes", t.nombre, err);
          entera(t.nombre, "no se pudo abrir en partes");
        }
    }
    const osc = t.sombra ? new Uint8ClampedArray(N * 3).fill(255) : null;
    let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1, sx0 = m.w, sy0 = m.h, sx1 = -1, sy1 = -1;
    for (let i = 0; i < N; i++) {
      const a = t.alfa[i];
      let toca = a > 0.02;
      if (toca) {
        propios[k]++;
        if (tope[i] > k) cubiertos[k]++;
      } else {
        t.alfa[i] = 0;
        // Lo que oscurece, sólo donde ninguna pieza de más arriba lo tapa.
        if (osc && t.sombra && t.sombra[i] > 0.02 && tope[i] <= k) {
          // Cae sobre una pieza de abajo: esa sombra se queda pintada en ella. Sólo cuenta si se nota.
          if (ultima[i] >= 0 && !contado[i] && t.sombra[i] * 255 > TOLERANCIA) { contado[i] = 1; ajenos[ultima[i]]++; }
          for (let c = 0; c < 3; c++) {
            const d = D[i * 3 + c];
            const v = d < NEGRO ? 1 : Math.min(1, C[i * 3 + c] / d);
            osc[i * 3 + c] = Math.round(v * 255);
            if (v < 0.985) toca = true;
            D[i * 3 + c] = d * v;
          }
        }
      }
      if (!toca) continue;
      const x = i % m.w, y = (i / m.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (a > 0.5) { if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    }
    // Lo que su sombra oscurece DETRÁS de una pieza de más arriba no se ve en el PSD: quedaba en blanco (sin sombra) y
    // en otra medida, donde esa pieza se corre, asomaba con su forma (Pedro, 2026-10-15: en 768×1024 se veía la
    // silueta de la tarjeta, más clara, en la sombra del título). Se llena con la sombra de alrededor.
    if (osc && t.sombra) {
      let bx0 = m.w, by0 = m.h, bx1 = -1, by1 = -1;
      for (let i = 0; i < N; i++)
        if (t.sombra[i] > 0.02 && tope[i] > k && !(t.alfa[i] > 0)) {
          const x = i % m.w, y = (i / m.w) | 0;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      if (bx1 >= 0) {
        bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1); bx1 = Math.min(m.w - 1, bx1 + 1); by1 = Math.min(m.h - 1, by1 + 1);
        const w = bx1 - bx0 + 1, h = by1 - by0 + 1, oculto = new Uint8Array(w * h), canal = new Float32Array(w * h);
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            const i = (yy + by0) * m.w + xx + bx0;
            if (t.sombra[i] > 0.02 && tope[i] > k && !(t.alfa[i] > 0)) oculto[yy * w + xx] = 1;
          }
        for (let c = 0; c < 3; c++) {
          for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) canal[yy * w + xx] = osc[((yy + by0) * m.w + xx + bx0) * 3 + c];
          rellenarSuave(canal, oculto, w, h);
          for (let yy = 0; yy < h; yy++)
            for (let xx = 0; xx < w; xx++) if (oculto[yy * w + xx]) osc[((yy + by0) * m.w + xx + bx0) * 3 + c] = Math.round(canal[yy * w + xx]);
        }
        for (let yy = 0; yy < h; yy++)
          for (let xx = 0; xx < w; xx++) {
            if (!oculto[yy * w + xx]) continue;
            const i = (yy + by0) * m.w + xx + bx0, x = xx + bx0, y = yy + by0;
            if (Math.min(osc[i * 3], osc[i * 3 + 1], osc[i * 3 + 2]) >= 0.985 * 255) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
      }
    }
    if (x1 < 0) { armadas.push(null); continue; } // carpeta sin nada pintado en esta mesa
    const caja = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    const rgba = new Uint8ClampedArray(caja.w * caja.h * 4);
    const oscurece = osc ? new Uint8ClampedArray(caja.w * caja.h * 3) : null;
    // Su color sale de la copia aplanada menos lo de atrás. Donde otra pieza de más arriba la tapa, la copia trae el color
    // de ESA: ahí se rellena con el de alrededor (un SUBTITULO con su recuadro detrás de la tarjeta del HERO, 2026-10-28).
    const F = new Float32Array(caja.w * caja.h * 3), sabe = new Uint8Array(caja.w * caja.h);
    let tapados = 0, suyos = 0;
    for (let yy = 0; yy < caja.h; yy++)
      for (let xx = 0; xx < caja.w; xx++) {
        const i = (yy + caja.y) * m.w + (xx + caja.x), j = yy * caja.w + xx, a = t.alfa[i];
        if (oscurece && osc) { oscurece[j * 3] = osc[i * 3]; oscurece[j * 3 + 1] = osc[i * 3 + 1]; oscurece[j * 3 + 2] = osc[i * 3 + 2]; }
        if (!(a > 0)) continue;
        suyos++;
        if (tope[i] > k) { tapados++; continue; }
        sabe[j] = 1;
        for (let c = 0; c < 3; c++) F[j * 3 + c] = Math.min(1, Math.max(0, (C[i * 3 + c] - D[i * 3 + c] * (1 - a)) / a));
      }
    if (tapados && tapados < suyos) rellenar(F, sabe, caja.w, caja.h);
    for (let yy = 0; yy < caja.h; yy++)
      for (let xx = 0; xx < caja.w; xx++) {
        const i = (yy + caja.y) * m.w + (xx + caja.x), j = yy * caja.w + xx, a = t.alfa[i];
        if (!(a > 0)) continue;
        for (let c = 0; c < 3; c++) {
          // Toda tapada (no queda de dónde rellenar): su color es el que se ve ahí.
          const f = sabe[j] || tapados < suyos ? F[j * 3 + c] : Math.min(1, Math.max(0, (C[i * 3 + c] - D[i * 3 + c] * (1 - a)) / a));
          rgba[j * 4 + c] = Math.round(f * 255);
          D[i * 3 + c] = f * a + D[i * 3 + c] * (1 - a);
        }
        rgba[j * 4 + 3] = a8(a);
        if (a > 0.05) ultima[i] = k;
      }
    const pieza: PiezaPsd = {
      nombre: t.nombre, rol: rolDe(t.nombre), caja, solido: sx1 < 0 ? caja : { x: sx0, y: sy0, w: sx1 - sx0 + 1, h: sy1 - sy0 + 1 },
      rgba, oscurece, tapadaPct: 0,
      letraMinPx: letraMinDe(deLaPieza),
      textos: [], base: null,
    };
    // Un texto se mide una vez: la pieza y su parte comparten el mismo (así la página sabe que es el mismo).
    const tintas = new Map<CapaPsd, TextoPieza | null>();
    Object.assign(pieza, textosDe(deLaPieza, m, pieza, tintas));
    if (grupos && atras)
      try {
        const partes = partesDe(deLaPieza, grupos, m, pieza, D, atras, tintas);
        // La prueba de las partes, como la del maestro: pintadas una sobre otra encima de lo de atrás tienen que dar la
        // pieza. Si no (un relleno donde la de encima casi no tapa), moverlas dejaría ver algo que no es del PSD.
        const distinto = partes ? partesDistintasPct(atras, pieza, partes) : 0;
        if (partes && distinto > REARMADO_MAX_PCT) entera(t.nombre, `sus partes, juntas, no dan la pieza (${distinto.toFixed(1)} % distinto)`);
        else if (partes) {
          pieza.partes = partes;
          pieza.carpeta = deLaPieza[0].carpeta;
          partesRetenidas += partes.reduce((s, q) => s + q.rgba.byteLength + (q.oscurece?.byteLength ?? 0) + (q.base?.byteLength ?? 0), 0);
        }
      } catch (err) {
        console.warn("[psd] no se pudo abrir en partes", t.nombre, err);
        entera(t.nombre, "no se pudo abrir en partes");
      }
    armadas.push(pieza);
  }
  const piezas: PiezaPsd[] = [];
  armadas.forEach((p, k) => {
    if (!p) return;
    p.tapadaPct = propios[k] ? Math.min(100, (ajenos[k] / propios[k]) * 100) : 0;
    p.rellenoPct = propios[k] ? Math.min(100, (cubiertos[k] / propios[k]) * 100) : 0;
    if (p.tapadaPct > TAPADA_MAX_PCT) avisos.push(`«${p.nombre}» queda ${p.tapadaPct.toFixed(1)} % oscurecida por la sombra de otra pieza: ahí su color no es confiable.`);
    if (p.rellenoPct > RELLENO_MAX_PCT) avisos.push(`«${p.nombre}» queda ${p.rellenoPct.toFixed(1)} % tapada por otra pieza: no queda de dónde sacar su color.`);
    else if (p.rellenoPct > TAPADA_MAX_PCT) avisos.push(`«${p.nombre}» tiene ${p.rellenoPct.toFixed(1)} % tapado por otra pieza: ahí se rellenó con su color de alrededor (se nota sólo si una de las dos se mueve).`);
    piezas.push(p);
  });

  const maestro: Omit<MaestroPsd, "origen"> = { nombre: m.nombre, w: m.w, h: m.h, fondo, piezas, fondoDistintoPct: (guiaMal / nVisible) * 100, rearmadoDistintoPct: 0, textoGamma: gammaDeTexto(capas, m, C), avisos };
  const otra = rearmar(maestro);
  let mal = 0;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++)
      if (!(Math.abs(otra[i * 3 + k] - C[i * 3 + k] * 255) <= TOLERANCIA)) { mal++; break; }
  }
  maestro.rearmadoDistintoPct = (mal / N) * 100;
  return maestro;
}

/** Por qué una capa de texto no se puede redibujar aunque su texto sí se entienda (null = se puede intentar).
 *  `tapaLetras`: si esa capa de encima pinta de verdad sobre las letras (sin saberlo, las cajas que se tocan bastan). */
function motivoCapa(c: CapaPsd, encima: CapaPsd[], tapaLetras: (o: CapaPsd) => boolean = () => true): string | null {
  if (c.mezcla !== "normal") return `fusión ${c.mezcla}`;
  if (c.conEfectos) return "efectos de capa";
  if (c.mascara) return "máscara";
  if (c.recorte) return "recortada a otra capa";
  if (encima[0]?.recorte) return "otra capa recortada a ella";
  // Una capa que NO es texto encima de sus letras: al quitar las letras no se sabría qué hay debajo de esa.
  const toca = (o: CapaPsd) => o.left < c.left + c.w && o.left + o.w > c.left && o.top < c.top + c.h && o.top + o.h > c.top;
  // Que las cajas se toquen no basta: un recuadro de sólo contorno (B30, «Rectangle 6» alrededor del subtítulo de DiDi)
  // rodea las letras sin pintarles encima.
  const tapa = encima.find((o) => !o.texto && o.tipo !== "ajuste" && toca(o) && tapaLetras(o));
  return tapa ? `«${tapa.nombre}» está encima` : null;
}

/** Alrededor de las letras, lo que cuenta como «encima» de ellas (px): el margen que se rellena y uno más. */
const TAPA_MARGEN = 2;
/**
 * ¿La capa `o` pinta sobre las letras de `c` (su tinta en `caja`, px de la mesa, con un margen)? Con sus píxeles a la
 * mano; si no los hay, o tiene efectos de capa (pintan fuera de sus píxeles: sombra, resplandor), sí: no se sabe.
 */
function pintaSobre(o: CapaPsd, c: CapaPsd, caja: { x: number; y: number; w: number; h: number }, m: MesaPsd): boolean {
  if (o.conEfectos || o.halos.length) return true;
  const img = o.pixeles();
  if (!img || img.width !== o.w || img.height !== o.h) return true;
  const X0 = caja.x - TAPA_MARGEN, Y0 = caja.y - TAPA_MARGEN, W = caja.w + 2 * TAPA_MARGEN, H = caja.h + 2 * TAPA_MARGEN;
  const tinta = new Uint8Array(W * H);
  porPixel(c, m, false, (i, a) => {
    if (a <= 0.02) return;
    const x = (i % m.w) - X0, y = ((i / m.w) | 0) - Y0;
    for (let dy = -TAPA_MARGEN; dy <= TAPA_MARGEN; dy++)
      for (let dx = -TAPA_MARGEN; dx <= TAPA_MARGEN; dx++) {
        const u = x + dx, v = y + dy;
        if (u >= 0 && u < W && v >= 0 && v < H) tinta[v * W + u] = 1;
      }
  });
  let pinta = false;
  porPixel(o, m, true, (i, a) => {
    if (pinta || a <= 0.02) return;
    const x = (i % m.w) - X0, y = ((i / m.w) | 0) - Y0;
    if (x >= 0 && x < W && y >= 0 && y < H && tinta[y * W + x]) pinta = true;
  });
  return pinta;
}

/** Alrededor de cada letra se rellena también este margen: su borde suavizado trae color de la letra. */
const LETRA_MARGEN = 1;
/** Tinta de un texto más grande que esto (px de la mesa) no se prueba: va como imagen. Un titular grande ocupa ~0.5 MP. */
export const TEXTO_CAJA_MAX_PX = 4_000_000;
/** Alfa menor a esto tras rellenar es ruido del borde: se borra (si no, queda un fantasma del texto). */
const FANTASMA = 0.04;

/**
 * Las dos formas en que Photoshop mezcla el TEXTO con lo de abajo: la normal (1) o en gamma 1.45, si está activo
 * «Blend Text Colors Using Gamma» en sus Ajustes de color. Con 1.45 la orilla de una letra oscura sale más clara y
 * un texto con opacidad también: en el PSD real del equipo el legal (al 60 %) sale 146 donde la mezcla normal da
 * 131, y 1.45 reproduce los píxeles de sus seis textos a 0.2-1.5 niveles (la normal, a 1.4-11).
 */
export const TEXTO_GAMMAS = [1, 1.45] as const;
/** Si no hay orillas que medir: la del PSD real del equipo. */
const TEXTO_GAMMA_OMISION = 1.45;
/** Orillas mínimas para decidir, y cuántas bastan. */
const GAMMA_MUESTRAS_MIN = 50;
const GAMMA_MUESTRAS_MAX = 20_000;

/**
 * Cuál de las dos mezclas usó Photoshop en esta mesa: la que mejor reproduce su copia aplanada (`C`, RGB 0-1) en
 * las orillas de los textos (alfa entre 0.15 y 0.85). Lo de abajo de cada orilla = el píxel más cercano de la
 * misma fila, a 3 px o menos, donde esa capa no tiene tinta.
 */
function gammaDeTexto(capas: CapaPsd[], m: MesaPsd, C: Float32Array): number {
  const err = TEXTO_GAMMAS.map(() => 0);
  let n = 0;
  for (const c of capas) {
    if (n >= GAMMA_MUESTRAS_MAX) break;
    if (!c.texto || c.mezcla !== "normal" || c.conEfectos || c.recorte || c.w * c.h > TEXTO_CAJA_MAX_PX) continue;
    // Alfa efectiva de la capa en SU caja (0 = sin tinta o fuera de la mesa) y su color.
    const alfa = new Float32Array(c.w * c.h);
    const color: { px: Pixeles["data"] | null } = { px: null };
    porPixel(c, m, true, (_i, a, data, s) => { alfa[s / 4] = a; color.px = data; });
    const px = color.px;
    if (!px) continue;
    for (let j = 0; j < alfa.length && n < GAMMA_MUESTRAS_MAX; j++) {
      const a = alfa[j];
      if (a < 0.15 || a > 0.85) continue;
      const x = j % c.w, y = (j / c.w) | 0;
      const X = x + c.left - m.x, Y = y + c.top - m.y;
      let abajo = -1;
      for (let d = 1; d <= 3 && abajo < 0; d++)
        for (const xx of [x - d, x + d]) {
          const XX = xx + c.left - m.x;
          if (abajo >= 0 || XX < 0 || XX >= m.w) continue;
          if (xx < 0 || xx >= c.w || alfa[y * c.w + xx] === 0) abajo = Y * m.w + XX;
        }
      if (abajo < 0) continue;
      const i = Y * m.w + X;
      TEXTO_GAMMAS.forEach((g, k) => {
        for (let q = 0; q < 3; q++) {
          const mezcla = Math.pow(a * Math.pow(px[j * 4 + q] / 255, g) + (1 - a) * Math.pow(C[abajo * 3 + q], g), 1 / g);
          err[k] += Math.abs(mezcla - C[i * 3 + q]);
        }
      });
      n++;
    }
  }
  if (n < GAMMA_MUESTRAS_MIN) return TEXTO_GAMMA_OMISION;
  return TEXTO_GAMMAS[err.indexOf(Math.min(...err))];
}

/**
 * Los textos de una pieza y la pieza SIN ellos. Todo lo que tocan las letras (más un margen) se rellena con lo
 * que hay alrededor: en el PSD real las letras van sobre transparente o sobre un color liso (botón, píldora), y
 * "des-mezclar" el borde suavizado dejaba un fantasma claro de cada letra. `capas` = las de esa pieza, de abajo
 * hacia arriba.
 */
/** Una capa de texto como `TextoPieza`: su tinta en Photoshop (caja y alfa, sin la opacidad de la capa) dentro de la
 *  mesa, y por qué no se redibujaría. `encima`: las capas de su pieza que van arriba de ella. null = no pinta nada aquí. */
function tintaDe(c: CapaPsd & { texto: TextoCapa }, encima: CapaPsd[], m: MesaPsd): TextoPieza | null {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  porPixel(c, m, false, (i, a) => {
    if (a <= 0.02) return;
    const x = i % m.w, y = (i / m.w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  });
  if (x1 < 0) return null;
  const caja = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  // Una tinta enorme no es un texto que valga probar en el navegador (y congelaría la página al compararla).
  const motivo = c.texto.motivo ?? motivoCapa(c, encima, (o) => pintaSobre(o, c, caja, m)) ?? (caja.w * caja.h > TEXTO_CAJA_MAX_PX ? "texto demasiado grande para probarlo" : null);
  const alfa = new Uint8ClampedArray(motivo ? 0 : caja.w * caja.h);
  const peso = c.opacidad || 1;
  if (!motivo)
    porPixel(c, m, false, (i, a) => {
      const x = (i % m.w) - x0, y = ((i / m.w) | 0) - y0;
      if (x >= 0 && x < caja.w && y >= 0 && y < caja.h) alfa[y * caja.w + x] = Math.round((a / peso) * 255);
    });
  const tr = c.texto.transform;
  return { capa: c.nombre, texto: { ...c.texto, transform: [tr[0], tr[1], tr[2], tr[3], tr[4] - m.x, tr[5] - m.y] }, opacidad: c.opacidad * c.relleno, caja, alfa, motivo, ruta: c.ruta };
}

/** `tintas`: lo ya medido de cada capa de texto (la pieza y sus partes comparten el mismo objeto; el de la pieza, que
 *  mira todo lo que va encima en la carpeta, es el más estricto). */
function textosDe(capas: CapaPsd[], m: MesaPsd, p: Pick<PiezaPsd, "caja" | "rgba">, tintas: Map<CapaPsd, TextoPieza | null>): Pick<PiezaPsd, "textos" | "base"> {
  const { x: cx, y: cy, w: cw, h: ch } = p.caja;
  const textos: TextoPieza[] = [];
  const hueco = new Uint8Array(cw * ch);
  let todas = true;
  for (let k = capas.length - 1; k >= 0; k--) {
    const c = capas[k];
    if (!c.texto) continue;
    let tp = tintas.get(c);
    if (tp === undefined) tintas.set(c, (tp = tintaDe(c as CapaPsd & { texto: TextoCapa }, capas.slice(k + 1), m)));
    if (!tp) continue; // capa de texto sin nada pintado en esta mesa
    textos.push(tp);
    if (tp.motivo) { todas = false; continue; }
    porPixel(c, m, true, (i, a) => {
      const x = (i % m.w) - cx, y = ((i / m.w) | 0) - cy;
      if (a > 0.02 && x >= 0 && x < cw && y >= 0 && y < ch) hueco[y * cw + x] = 1;
    });
  }
  textos.reverse();
  if (!textos.length || !todas) return { textos, base: null };
  // Margen alrededor de las letras (su borde suavizado) y relleno con lo de al lado, premultiplicado.
  const sabe = new Uint8Array(cw * ch).fill(1);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      if (!hueco[y * cw + x]) continue;
      for (let yy = Math.max(0, y - LETRA_MARGEN); yy <= Math.min(ch - 1, y + LETRA_MARGEN); yy++)
        for (let xx = Math.max(0, x - LETRA_MARGEN); xx <= Math.min(cw - 1, x + LETRA_MARGEN); xx++) sabe[yy * cw + xx] = 0;
    }
  const color = new Float32Array(cw * ch * 3), alfaB = new Float32Array(cw * ch * 3);
  for (let j = 0; j < cw * ch; j++) {
    const a = p.rgba[j * 4 + 3] / 255;
    for (let q = 0; q < 3; q++) color[j * 3 + q] = (p.rgba[j * 4 + q] / 255) * a;
    alfaB[j * 3] = a;
  }
  rellenar(color, sabe, cw, ch);
  rellenar(alfaB, sabe, cw, ch);
  const base = new Uint8ClampedArray(cw * ch * 4);
  for (let j = 0; j < cw * ch; j++) {
    const a = Math.min(1, Math.max(0, alfaB[j * 3]));
    if (a < FANTASMA) continue;
    for (let q = 0; q < 3; q++) base[j * 4 + q] = Math.round(Math.min(1, Math.max(0, color[j * 3 + q] / a)) * 255);
    base[j * 4 + 3] = Math.round(a * 255);
  }
  return { textos, base };
}

const letraMinDe = (capas: CapaPsd[]): number | null => capas.reduce<number | null>((min, c) => (c.letraPx !== null && (min === null || c.letraPx < min) ? c.letraPx : min), null);

// ── Partes de una pieza ──────────────────────────────────────────────────

/** Las capas de una parte, antes de des-mezclarla. */
type Grupo = { hijo: number | null; nombre: string; capas: CapaPsd[] };
/** Lo de atrás ANTES de pintar una pieza (RGB 0-1) en una caja (px de la mesa) que cubre la de la pieza. */
type Atras = { caja: Caja; D: Float32Array };
/** Largo del nombre de la parte de las capas sueltas (son sus nombres, juntos). */
const NOMBRE_SUELTAS_MAX = 60;

/**
 * Las partes de una pieza, sin píxeles: sus capas por subcarpeta directa de su carpeta, y las sueltas juntas, en el
 * orden de su primera capa. Lo más hondo se queda en su parte. Sólo cuenta un grupo que pinta algo (no sólo ajustes o
 * recortadas). null si la pieza no sale de UNA carpeta (dos con el mismo nombre son una pieza, pero sus subcarpetas no
 * se pueden emparejar) o si no hay al menos dos grupos.
 */
function gruposDe(capas: CapaPsd[]): Grupo[] | null {
  const carpeta = capas[0]?.carpeta ?? -1;
  if (carpeta < 0 || capas.some((c) => c.carpeta !== carpeta)) return null;
  const porHijo = new Map<number, Grupo>();
  for (const c of capas) {
    const h = c.parte?.hijo ?? -1;
    let g = porHijo.get(h);
    if (!g) porHijo.set(h, (g = { hijo: c.parte?.hijo ?? null, nombre: c.parte?.nombre ?? "", capas: [] }));
    g.capas.push(c);
  }
  const grupos = [...porHijo.values()].filter((g) => g.capas.some((c) => !c.recorte && c.tipo !== "ajuste"));
  for (const g of grupos) {
    if (g.hijo !== null) continue;
    const n = [...new Set(g.capas.filter((c) => c.tipo !== "ajuste").map((c) => c.nombre))].join(" + ");
    g.nombre = n.length > NOMBRE_SUELTAS_MAX ? `${n.slice(0, NOMBRE_SUELTAS_MAX - 1)}…` : n;
  }
  return grupos.length >= 2 ? grupos : null;
}

/**
 * Cada parte de una pieza ya armada, con su propio color (Pedro, 2026-10-19: "Fill and warn"). Dentro de la caja de la
 * pieza: la silueta de cada parte sale de sus capas, y su color se des-mezcla de la pieza ya pintada (`D`, lo de atrás
 * después de ella) sobre lo de atrás de antes (`atras`) más las partes de abajo, igual que las piezas sobre el fondo.
 * Donde otra parte le pinta encima (la capa de más arriba en ese píxel es de otra parte) su color no se sabe: se
 * rellena con el de alrededor y se mide (`rellenoPct`) para avisar si se mueve. Una parte nunca hace inservible el
 * maestro. Las sombras de la pieza se reparten: cada píxel de sombra es de la parte que más oscurece ahí. undefined si
 * al final no quedan 2 partes que pinten algo.
 */
function partesDe(capas: CapaPsd[], grupos: Grupo[], m: MesaPsd, p: PiezaPsd, D: Float32Array, atras: Atras, tintas: Map<CapaPsd, TextoPieza | null>): PartePsd[] | undefined {
  const { x: cx, y: cy, w: cw, h: ch } = p.caja, n = cw * ch, G = grupos.length;
  const local = (X: number, Y: number) => (X >= cx && X < cx + cw && Y >= cy && Y < cy + ch ? (Y - cy) * cw + (X - cx) : -1);
  const deGrupo = new Map(grupos.flatMap((g, j) => g.capas.map((c) => [c, j] as const)));
  const alfas = grupos.map(() => new Float32Array(n));
  const sombras: (Float32Array | null)[] = grupos.map(() => null);
  // La parte de la capa de MÁS ARRIBA que pinta sólido en cada píxel (−1 = ninguna): en el orden de las capas, no
  // en el de las partes (las sueltas pueden ir arriba y abajo de una subcarpeta).
  const tope = new Int8Array(n).fill(-1);
  for (let c of capas) {
    const j = deGrupo.get(c);
    if (j === undefined || c.recorte || c.tipo === "ajuste") continue;
    const al = alfas[j];
    if (c.halos.length) c = conCache(c);
    // Las mismas reglas que la silueta de la pieza (`despiezarMesa`).
    const conRelleno = !c.conEfectos;
    if (c.mezcla === "normal")
      porPixel(c, m, conRelleno, (i, a) => {
        const l = local(i % m.w, (i / m.w) | 0);
        if (l < 0) return;
        al[l] = a + al[l] * (1 - a);
        if (a > 0.05) tope[l] = j;
      });
    else if (OSCURECE.has(c.mezcla)) {
      const so = (sombras[j] ??= new Float32Array(n));
      porPixel(c, m, conRelleno, (i, a, data, s) => {
        const l = local(i % m.w, (i / m.w) | 0);
        const fuerza = a * (1 - Math.min(data[s], data[s + 1], data[s + 2]) / 255);
        if (l >= 0 && fuerza > so[l]) so[l] = fuerza;
      });
    }
    for (const hl of c.halos) {
      const g = correr(engordar(c, m, hl.radio), hl);
      if (!g) continue;
      const destino = hl.tipo === "contorno" ? al : (sombras[j] ??= new Float32Array(n));
      for (let yy = 0; yy < g.h; yy++)
        for (let xx = 0; xx < g.w; xx++) {
          const l = local(xx + g.x, yy + g.y), f = pesoHalo(hl, g.lejos[yy * g.w + xx]);
          if (l < 0 || !g.on[yy * g.w + xx] || !(f > destino[l])) continue;
          destino[l] = f;
          if (hl.tipo === "contorno" && hl.fuerza > 0.05) tope[l] = j;
        }
    }
  }

  // De abajo hacia arriba: cada parte sobre lo de atrás de antes más las partes de abajo (`Dp`).
  const Dp = new Float32Array(n * 3);
  for (let yy = 0; yy < ch; yy++)
    for (let xx = 0; xx < cw; xx++) {
      const s = ((yy + cy - atras.caja.y) * atras.caja.w + (xx + cx - atras.caja.x)) * 3, d = (yy * cw + xx) * 3;
      Dp[d] = atras.D[s]; Dp[d + 1] = atras.D[s + 1]; Dp[d + 2] = atras.D[s + 2];
    }
  const enMesa = (l: number) => ((((l / cw) | 0) + cy) * m.w + (l % cw) + cx) * 3;
  const colores: Uint8ClampedArray[] = [], rellenos: number[] = [], tapadoras: Set<number>[] = [];
  for (let j = 0; j < G; j++) {
    const al = alfas[j], F = new Float32Array(n * 3), sabe = new Uint8Array(n), por = new Set<number>();
    let propios = 0, tapados = 0;
    for (let l = 0; l < n; l++) {
      const a = al[l];
      if (!(a > 0.02)) { al[l] = 0; continue; }
      propios++;
      const P = enMesa(l);
      // Toda tapada (no queda de dónde rellenar): su color es el que se ve ahí.
      const otra = tope[l] >= 0 && tope[l] !== j;
      if (otra) { tapados++; por.add(tope[l]); }
      for (let q = 0; q < 3; q++) F[l * 3 + q] = Math.min(1, Math.max(0, otra ? D[P + q] : (D[P + q] - Dp[l * 3 + q] * (1 - a)) / a));
      if (!otra) sabe[l] = 1;
    }
    // Lo que no se sabe toma el color de alrededor (también fuera de la parte: ahí no se usa).
    if (tapados && tapados < propios) rellenar(F, sabe, cw, ch);
    const rgba = new Uint8ClampedArray(n * 4);
    for (let l = 0; l < n; l++) {
      const a = al[l];
      if (!(a > 0)) continue;
      for (let q = 0; q < 3; q++) {
        rgba[l * 4 + q] = Math.round(F[l * 3 + q] * 255);
        Dp[l * 3 + q] = F[l * 3 + q] * a + Dp[l * 3 + q] * (1 - a);
      }
      rgba[l * 4 + 3] = a8(a);
    }
    colores.push(rgba);
    rellenos.push(propios ? (tapados / propios) * 100 : 0);
    tapadoras.push(por);
  }

  // Cada píxel de sombra de la pieza, a la parte que más oscurece ahí.
  const duena = new Int8Array(n).fill(-1);
  const osc = p.oscurece;
  if (osc)
    for (let l = 0; l < n; l++) {
      if (Math.min(osc[l * 3], osc[l * 3 + 1], osc[l * 3 + 2]) >= 255) continue;
      let mejor = -1, f = 0.02;
      for (let j = 0; j < G; j++) {
        const v = sombras[j]?.[l] ?? 0;
        if (v > f) { f = v; mejor = j; }
      }
      duena[l] = mejor;
    }

  const partes: PartePsd[] = [];
  const lugar = new Map<number, number>(); // grupo → su índice en `partes` (las que no pintan nada no quedan)
  for (let j = 0; j < G; j++) {
    const al = alfas[j];
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, sx0 = cw, sy0 = ch, sx1 = -1, sy1 = -1;
    for (let l = 0; l < n; l++) {
      const toca = al[l] > 0 || (duena[l] === j && osc !== null && Math.min(osc[l * 3], osc[l * 3 + 1], osc[l * 3 + 2]) < 0.985 * 255);
      if (!toca) continue;
      const x = l % cw, y = (l / cw) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (al[l] > 0.5) { if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    }
    if (x1 < 0) continue; // no pinta nada en esta mesa
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const caja = { x: cx + x0, y: cy + y0, w, h };
    const rgba = new Uint8ClampedArray(w * h * 4);
    let oscurece: Uint8ClampedArray | null = null;
    for (let yy = 0; yy < h; yy++) {
      const desde = (yy + y0) * cw + x0;
      rgba.set(colores[j].subarray(desde * 4, (desde + w) * 4), yy * w * 4);
      if (!osc) continue;
      for (let xx = 0; xx < w; xx++) {
        const l = desde + xx;
        if (duena[l] !== j) continue;
        oscurece ??= new Uint8ClampedArray(w * h * 3).fill(255);
        oscurece.set(osc.subarray(l * 3, l * 3 + 3), (yy * w + xx) * 3);
      }
    }
    const g = grupos[j];
    const parte: PartePsd = {
      nombre: g.nombre, hijo: g.hijo, caja, solido: sx1 < 0 ? caja : { x: cx + sx0, y: cy + sy0, w: sx1 - sx0 + 1, h: sy1 - sy0 + 1 },
      rgba, oscurece, letraMinPx: letraMinDe(g.capas), textos: [], base: null, rellenoPct: rellenos[j], tapadaPor: [],
    };
    Object.assign(parte, textosDe(g.capas, m, parte, tintas));
    lugar.set(j, partes.length);
    partes.push(parte);
  }
  // Una parte que tapa a otra pinta algo ahí (alfa > 0.05): siempre queda en `partes`.
  for (const [j, i] of lugar) partes[i].tapadaPor = [...tapadoras[j]].flatMap((o) => lugar.get(o) ?? []);
  return partes.length >= 2 ? partes : undefined;
}

/** % de los píxeles que toca la pieza en que sus partes, pintadas una sobre otra encima de lo de atrás, no dan la pieza
 *  (más de TOLERANCIA en un canal, como mide el maestro). */
function partesDistintasPct(atras: Atras, p: PiezaPsd, partes: PartePsd[]): number {
  const c = p.caja, n = c.w * c.h, fondo = new Uint8ClampedArray(n * 3);
  for (let yy = 0; yy < c.h; yy++)
    for (let xx = 0; xx < c.w; xx++) {
      const s = ((yy + c.y - atras.caja.y) * atras.caja.w + (xx + c.x - atras.caja.x)) * 3, d = (yy * c.w + xx) * 3;
      for (let q = 0; q < 3; q++) fondo[d + q] = Math.round(atras.D[s + q] * 255);
    }
  const aqui = (b: Pick<PiezaPsd, "caja" | "rgba" | "oscurece">) => ({ ...b, caja: { ...b.caja, x: b.caja.x - c.x, y: b.caja.y - c.y } });
  const entera = rearmar({ w: c.w, h: c.h, fondo, piezas: [aqui(p)] });
  const juntas = rearmar({ w: c.w, h: c.h, fondo, piezas: partes.map(aqui) });
  let tocados = 0, mal = 0;
  for (let j = 0; j < n; j++) {
    const o = p.oscurece;
    if (!(p.rgba[j * 4 + 3] > 0) && !(o && Math.min(o[j * 3], o[j * 3 + 1], o[j * 3 + 2]) < 255)) continue;
    tocados++;
    for (let q = 0; q < 3; q++)
      if (!(Math.abs(entera[j * 3 + q] - juntas[j * 3 + q]) <= TOLERANCIA)) { mal++; break; }
  }
  return tocados ? (mal / tocados) * 100 : 0;
}

/** Arma el anuncio con cada pieza en su lugar (RGB, w × h). Es la prueba del despiece: tiene que salir el de
 *  Photoshop. */
export function rearmar(ma: Pick<MaestroPsd, "w" | "h" | "fondo"> & { piezas: readonly Pick<PiezaPsd, "caja" | "rgba" | "oscurece">[] }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(ma.fondo);
  for (const p of ma.piezas) {
    for (let yy = 0; yy < p.caja.h; yy++)
      for (let xx = 0; xx < p.caja.w; xx++) {
        const d = ((yy + p.caja.y) * ma.w + (xx + p.caja.x)) * 3, j = yy * p.caja.w + xx, a = p.rgba[j * 4 + 3] / 255;
        for (let k = 0; k < 3; k++) {
          const base = p.oscurece ? (out[d + k] * p.oscurece[j * 3 + k]) / 255 : out[d + k];
          out[d + k] = Math.round(base + (p.rgba[j * 4 + k] - base) * a);
        }
      }
  }
  return out;
}

/** ¿Se puede usar este despiece, o el anuncio va por la vía plana? Con los motivos, para mostrarlos. */
export function despieceUsable(ma: MaestroPsd): { ok: boolean; motivos: string[] } {
  const motivos = [
    ...(ma.rearmadoDistintoPct > REARMADO_MAX_PCT ? [`al rearmarlo difiere de Photoshop en ${ma.rearmadoDistintoPct.toFixed(1)} % de los píxeles`] : []),
    ...(ma.fondoDistintoPct > FONDO_FIEL_MAX_PCT ? [`el fondo no se pudo reconstruir con certeza (${ma.fondoDistintoPct.toFixed(1)} % distinto)`] : []),
    ...ma.piezas.filter((p) => p.tapadaPct > TAPADA_MAX_PCT).map((p) => `«${p.nombre}» está oscurecida por la sombra de otra pieza`),
    ...ma.piezas.filter((p) => (p.rellenoPct ?? 0) > RELLENO_MAX_PCT).map((p) => `«${p.nombre}» está casi toda tapada por otra pieza`),
    ...(ma.piezas.length ? [] : ["no hay piezas fuera del fondo"]),
  ];
  return { ok: motivos.length === 0, motivos };
}
