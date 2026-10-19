"use client";

import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, CircleCheck, Download, Eraser, FileImage, FileUp, FlipHorizontal2, Folder, Languages, Layers, Loader2, Lock, Maximize2, Move, RotateCcw, Sparkles, Type, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { useLang } from "@/components/prisma/use-lang";
import { CANALES, LETRA_MIN_PX, MEDIDAS_EQUIPO, elegirMaestro, es916, nombreSalida, sePuedeVoltear, zonaCanal, type Canal, type Edicion, type Lado } from "@/lib/prisma/formatos/acomodo";
import { revisarMedida, type ArregloContraste, type CopiaEnFondo, type EleccionContraste, type InfoContraste } from "@/lib/prisma/formatos/revisar";
import { COSTO_COPIA_IA_USD, DERIVA_IA_REVISAR, FONDO_IA_MAX_BYTES, PIEZA_IA_MAX, PIEZA_IA_MAX_BYTES, RECORTE_IA_MAX, buscarGemela, pegarRellenoIA, quitarGemela, recorteParaIA, type Gemela } from "@/lib/prisma/formatos/gemela";
import { FP, FP_APLANADA, FP_ERROR, FP_FAMILIA, FP_PAPEL, FX, rellenar } from "@/lib/prisma/formatos/copy";
import { LADO_MAX, LADO_MIN, leerMedidas, limpiarNombre } from "@/lib/prisma/formatos/geometria";
import { EDITABLE_MAX_BYTES, EDITABLE_MAX_MS, LEER_MAX_MS, MEDIDAS_MAX, MESAS_MAX, medidasQueCaben, type MaestroListo, type MensajePsdMedida, type MensajeWorker, type MesaDescartada, type MesaElegible, type PedidoPsdMedida, type PedidoWorker } from "@/lib/prisma/formatos/listo";
import { PSD_ARCHIVO_MAX } from "@/lib/prisma/formatos/adelgazar";
import type { MotivoPsd } from "@/lib/prisma/formatos/psd";
import { etiquetaPieza, nombreDeGuia, type Rol } from "@/lib/prisma/formatos/roles";
import { colaVacia, enCola, pintar } from "./pintar";
import { Franjas, VistaGrande } from "./vista-grande";
import { EXTENSIONES_FUENTE, cargarFuentes, elegirFuentes, fuentesRecordadas, olvidarFuentes, recordarFuentes, revisarTextos, textoEscrito, type ArchivoFuente, type Escritura, type Tipografias } from "./escritura";
import { tipografiasDelPsd } from "@/app/(app)/prisma/tipografias-actions";
import { EditorMedida, edicionGuardada, guardarEdicion } from "./editor-medida";
import { COLUMNAS, ChipEstado, FOCO, FORMAS, NOMBRE_FORMA, PastillasCanal, PastillasMedidas, clave, etiqueta, formaDe, type Medida, type MedidaLista } from "./ajustes";

/**
 * HÜE Prisma › Formatos, puerta PSD. El anuncio llega en Photoshop: un Web Worker lo lee y lo separa en fondo
 * limpio + piezas, y cada medida se pinta aquí mismo en un <canvas>. Nada se sube ni se guarda y no hay costo, salvo
 * un caso que la persona pide con un botón: «Rellenar con IA» manda a Gemini un recorte del fondo y la pieza (la ruta
 * /api/prisma/formatos/copia). Lo que decide DÓNDE va cada pieza es `acomodo.ts` (probado aparte); esta pantalla sólo
 * lo enseña.
 */

type Falla = { clave: keyof typeof FP_ERROR; detalle?: string };
/** `psdOriginal`: el archivo tal cual, para armar el PSD editable de cada medida (se vuelve a leer entero al pedirlo). */
type Leido = { archivo: string; psdOriginal: Blob; maestros: MaestroListo[]; descartadas: MesaDescartada[]; avisos: string[] };
/** Un maestro como se acomoda y se pinta: con el papel elegido en cada carpeta y, si se aprobó, sin la copia del fondo. */
type MaestroVista = MaestroListo & { copia?: CopiaEnFondo | null; fondoOriginal?: Uint8ClampedArray };
/** Cómo se quitó: gratis (espejo) o con la IA (lo que costó y cuánto cambió lo de alrededor). */
type Quitada = { pieza: number; fondo: Uint8ClampedArray } & ({ metodo: "espejo" } | { metodo: "ia"; costoUsd: number | null; deriva: number | null });

/** El último `MaestroVista` armado para cada maestro y con qué: si no cambió nada de ESE maestro, se devuelve el mismo
 *  objeto y sus tarjetas no se vuelven a pintar (quitar la copia de una mesa no repinta las de otra). */
const vistas = new WeakMap<MaestroListo, { q: Quitada | null; g: Gemela | null; v: MaestroVista }>();
/** Lo más que la pantalla espera a la IA (la ruta le da 150 s, más subir y bajar). */
const IA_ESPERA_MS = 170_000;
/** Cuánto se ignora otra activación de «Quitar del fondo» / «Deshacer» (Enter sostenido). El doble clic se ignora
 *  aparte, por `detail`: su segundo clic puede llegar más tarde que esto si el primero tuvo ocupada la página. */
const COPIA_PAUSA_MS = 400;
const SIN_TIPOS: Tipografias = new Map();

const CLAVE_ERROR: Record<MotivoPsd | "desconocido", keyof typeof FP_ERROR> = { "no-soportado": "noSoportado", "demasiado-grande": "grande", "sin-aplanado": "sinAplanado", "sin-fondo": "sinFondo", desconocido: "desconocido" };
/** Alto máximo con el que se ENSEÑA una medida (la descarga va siempre a tamaño real). Con 360 caben cinco
 *  verticales en una fila a 1440 px; para verla grande está «Editar». */
const VISTA_ALTO_MAX = 360;
/** La lista de DiDi, como pastillas (Pedro, 2026-10-15: "we have them pre loaded those are tied to didi"). */
const LISTA_DIDI: MedidaLista[] = leerMedidas(MEDIDAS_EQUIPO).medidas.map((m) => ({ ...m, propia: false }));
/** Avisos que se arreglan una sola vez arriba, en «En varias medidas»: en la tarjeta van en una línea corta. */
const AVISO_CORTO = { copia: FP.avisoCopiaCorto, retoque: FP.avisoRetoqueCorto } as const;
/** El nombre de la mesa se acorta ANTES de ponerle la medida: así la medida nunca se corta y dos medidas no chocan. */
const NOMBRE_MESA_MAX = 100;
const NOMBRE_ZIP_MAX = 80;
const SOLTAR_URL_MS = 10_000;
/** Escritorio e iPad: 36 px con mouse, 44 px con dedo. */
const BOTON = "min-h-9 pointer-coarse:min-h-11";
/** Al llegar con Tab, lo de las tarjetas no queda debajo de la barra pegajosa de resultados (y la de la app). */
const BAJO_BARRA = "scroll-mt-40";
/** Los botones de cada tarjeta, más bajos (van cuatro en una tarjeta angosta). */
const BOTON_TARJETA = cn("h-8 px-2 text-xs pointer-coarse:h-11", BAJO_BARRA);
/**
 * De qué acomodo automático es una edición: el lado del HERO y la zona del canal mueven las piezas, así que entran en
 * la clave. El contraste no: sus arreglos dejan las piezas donde están (la sombra se pinta detrás, «Mover fondo» mueve
 * sólo el fondo) y la edición guarda sólo piezas, así que vale con cualquiera (Pedro, 2026-10-15: "after editing it
 * doesnt let me switch between contrast options"). Antes del 2026-10-15 la clave llevaba ":fondo" con ese arreglo:
 * se sigue leyendo (CONTEXTO_VIEJO) para no perder lo que se editó así.
 */
const contextoEdicion = (m: Medida, lado: Lado | undefined, canal: Canal | null) => {
  const z = zonaCanal(canal, m.w, m.h);
  return `${lado ?? "derecha"}:${z ? `${z.top},${z.right},${z.bottom},${z.left}` : "-"}`;
};
const CONTEXTO_VIEJO = ":fondo";
/** El nombre de entrega del equipo (el de la mesa con la medida nueva), limpio para ser nombre de archivo. */
const archivoDe = (ma: MaestroListo, m: Medida) => `${nombreSalida({ nombre: limpiarNombre(ma.nombre, NOMBRE_MESA_MAX), w: ma.w, h: ma.h }, m.w, m.h)}.png`;
const sinExtension = (archivo: string) => archivo.replace(/\.psd$/i, "");

const aPng = (lienzo: HTMLCanvasElement): Promise<Blob> =>
  new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("toBlob"))), "image/png"));

/** Un RGBA como PNG de a lo más `bytes`: se achica (lado mayor desde `max`, ×0.75 cada vez) hasta que quepa. Si ni a
 *  256 px cabe, va así y la ruta dice que es demasiado grande. */
async function pngQueQuepa(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number, max: number, bytes: number): Promise<Blob> {
  for (let lado = max; ; lado = Math.round(lado * 0.75)) {
    const b = await aPng(lienzoDe(rgba, w, h, lado));
    if (b.size <= bytes || lado <= 256) return b;
  }
}
/** Un RGBA en un lienzo; si su lado mayor pasa de `max`, reducido (con el suavizado del navegador). */
function lienzoDe(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number, max = Infinity): HTMLCanvasElement {
  // Sin contexto (el navegador se quedó sin memoria de lienzos) se corta aquí: nunca se manda una imagen en blanco.
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const origen = c.getContext("2d");
  if (!origen) throw new Error("sin 2d");
  origen.putImageData(new ImageData(rgba, w, h), 0, 0);
  const k = Math.min(1, max / Math.max(w, h));
  if (k === 1) return c;
  const r = document.createElement("canvas");
  r.width = Math.max(1, Math.round(w * k));
  r.height = Math.max(1, Math.round(h * k));
  const ctx = r.getContext("2d");
  if (!ctx) throw new Error("sin 2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, r.width, r.height);
  c.width = c.height = 0; // suelta la memoria del lienzo grande ya
  return r;
}
/** El rectángulo `c` de un RGBA de ancho W. */
function recortarRgba(rgba: Uint8ClampedArray, W: number, c: { x: number; y: number; w: number; h: number }): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) out.set(rgba.subarray(((c.y + y) * W + c.x) * 4, ((c.y + y) * W + c.x + c.w) * 4), y * c.w * 4);
  return out;
}
/** Una imagen (lo que devolvió la IA) en RGBA de exactamente w × h. */
async function aRgba(imagen: Blob, w: number, h: number): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(imagen);
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sin 2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } finally {
    bmp.close();
  }
}
/** Un error que ya trae el mensaje para el diseñador (el de la ruta). */
class ErrorDeRuta extends Error {}
const usd = (v: number, decimales: number) => `US$${v.toFixed(decimales)}`;

function descargar(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), SOLTAR_URL_MS);
}

/** Los PSD editables se arman de uno en uno: cada uno lee el archivo entero (s33: 61 MB) y escribe otro casi igual;
 *  doce clics seguidos en doce tarjetas no deben pedir 1.4 GB de golpe. Lo pesado de la página (la imagen aplanada,
 *  las sombras) también se arma en su turno, no al hacer clic. */
let colaPsd: Promise<unknown> = Promise.resolve();
/** Archivos con los que el PSD editable ya falló o tardó: los demás clics van directo al de capas planas (sin volver a
 *  esperar el tope de tiempo por cada medida). Abrir el PSD otra vez lo vuelve a intentar. */
const sinEditable = new WeakSet<Blob>();
/** Avisos de capas aplanadas o a revisar ya enseñados por archivo: son los mismos en cada medida, así que sólo el
 *  primero se queda hasta cerrarlo; los repetidos se van solos. */
const notasVistas = new WeakMap<Blob, Set<string>>();
function enFilaPsd<T>(trabajo: () => Promise<T>): Promise<T> {
  const turno = colaPsd.then(trabajo, trabajo);
  colaPsd = turno.catch(() => undefined);
  return turno;
}

/** Una falla del worker del PSD editable, con su código (el tiempo agotado y lo inesperado son "otro"). */
class FallaPsd extends Error {
  codigo: Extract<MensajePsdMedida, { tipo: "error" }>["codigo"];
  constructor(codigo: FallaPsd["codigo"], detalle: string) {
    super(detalle);
    this.codigo = codigo;
  }
}

/** Arma el PSD editable de una medida en su propio worker (psd-medida.worker.ts): la página no se congela, y si tarda
 *  más de EDITABLE_MAX_MS se mata. `alArrancar` recibe con qué cancelarlo si la tarjeta se va: mata el worker y
 *  termina en null (así la fila sigue con la siguiente medida). */
function psdEditableEnWorker(pedido: PedidoPsdMedida, transferir: Transferable[], alArrancar: (cancelar: () => void) => void): Promise<Extract<MensajePsdMedida, { tipo: "listo" }> | null> {
  return new Promise((ok, mal) => {
    const worker = new Worker(new URL("./psd-medida.worker.ts", import.meta.url), { type: "module" });
    let reloj = 0;
    const fin = () => {
      window.clearTimeout(reloj);
      worker.terminate();
    };
    const fallar = (detalle: string) => {
      fin();
      mal(new FallaPsd("otro", detalle));
    };
    reloj = window.setTimeout(() => fallar(`el PSD editable tardó más de ${EDITABLE_MAX_MS / 1000} s`), EDITABLE_MAX_MS);
    worker.onmessage = (e: MessageEvent<MensajePsdMedida>) => {
      fin();
      if (e.data.tipo === "listo") ok(e.data);
      else mal(new FallaPsd(e.data.codigo, e.data.detalle));
    };
    worker.onerror = (e) => fallar(e.message || "el worker del PSD falló");
    worker.onmessageerror = () => fallar("la respuesta del worker del PSD no se pudo leer");
    alArrancar(() => {
      fin();
      ok(null);
    });
    try {
      worker.postMessage(pedido, transferir);
    } catch (err) {
      fallar(err instanceof Error ? err.message : String(err));
    }
  });
}


const SOLTAR_NIVELES = 4;
/** Archivos que sirven (la carpeta de tipografías trae ~20) y entradas recorridas en total, para no andar sin fin. */
const SOLTAR_ARCHIVOS_MAX = 500;
const SOLTAR_ENTRADAS_MAX = 5000;
const SIRVE = /\.(psd|otf|ttf)$/i;

/**
 * Los archivos de lo que se soltó, entrando a las carpetas. Lo soltado suelto entra siempre (un PNG dice "no es un
 * PSD"); de adentro de una carpeta, sólo .psd/.otf/.ttf. Un archivo ilegible se salta, no tumba la carpeta.
 */
async function archivosDe(entradas: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  let vistas = 0;
  const lleno = () => out.length >= SOLTAR_ARCHIVOS_MAX || vistas >= SOLTAR_ENTRADAS_MAX;
  const andar = async (e: FileSystemEntry, nivel: number): Promise<void> => {
    if (lleno()) return;
    vistas++;
    if (e.isFile) {
      if (nivel > 0 && !SIRVE.test(e.name)) return;
      try {
        out.push(await new Promise<File>((ok, mal) => (e as FileSystemFileEntry).file(ok, mal)));
      } catch (err) {
        console.error("[formatos-psd] soltar", e.name, err);
      }
      return;
    }
    if (!e.isDirectory || nivel >= SOLTAR_NIVELES) return;
    const lector = (e as FileSystemDirectoryEntry).createReader();
    while (!lleno()) {
      let lote: FileSystemEntry[];
      try {
        lote = await new Promise<FileSystemEntry[]>((ok, mal) => lector.readEntries(ok, mal));
      } catch (err) {
        return console.error("[formatos-psd] soltar", e.name, err);
      }
      if (!lote.length) return;
      for (const x of lote) await andar(x, nivel + 1);
    }
  };
  for (const e of entradas) await andar(e, 0);
  return out;
}

/** Lo más que se espera a Greenlight por cada archivo: después se dice y se pueden soltar. */
const GREENLIGHT_MS = 20_000;
/** Y al pedido: el servidor puede buscar en Google (12 s), y los pedidos al servidor van en fila (uno nuevo, p. ej. al
 *  cambiar de cliente, espera a que termine el anterior). */
const PEDIDO_MS = 45_000;

/** Lo que pasó al cargar tipografías. `de` = vinieron de Greenlight (de qué clientes); `greenlightNo` = no se pudieron traer. */
type NotaFuentes = { nuevas: number; malas: string[]; vacio?: boolean; fallo?: boolean; de?: string; greenlightNo?: boolean };
const notaMala = (n: NotaFuentes) => !!n.fallo || !!n.vacio || !!n.greenlightNo || (!n.nuevas && n.malas.length > 0);
const NOMBRES_MAX = 6;
/** El nombre de una capa de texto es su texto (el legal mide 60+ letras): se acorta, y entero va en el `title`. */
const CAPA_MAX = 48;
const corto = (s: string) => (s.length > CAPA_MAX ? `${s.slice(0, CAPA_MAX - 1)}…` : s);
/** Una lista de nombres que puede ser larga: los primeros y "+N". */
const unos = (xs: string[]) => `${xs.slice(0, NOMBRES_MAX).join(", ")}${xs.length > NOMBRES_MAX ? ` +${xs.length - NOMBRES_MAX}` : ""}`;
function textoNotaFuentes(n: NotaFuentes, lang: Lang): string {
  if (n.greenlightNo) return tx(FP.textoGreenlightNo, lang);
  if (n.fallo) return tx(FP.textoFallo, lang);
  if (n.vacio) return tx(FP.textoNinguna, lang);
  const cargadas = n.nuevas === 1 ? tx(FP.textoCargadaUna, lang) : n.nuevas ? rellenar(tx(FP.textoCargadas, lang), { n: n.nuevas }) : n.malas.length ? "" : tx(FP.textoYaEstaban, lang);
  return [n.de ? rellenar(tx(FP.textoDeGreenlight, lang), { c: n.de }) : "", cargadas, n.malas.length ? rellenar(tx(FP.textoMalas, lang), { f: unos(n.malas) }) : ""].filter(Boolean).join(" ");
}

/** Sin PSD: la misma lista vacía siempre (una nueva en cada pintado rehacía los acomodos). */
const SIN_MAESTROS: MaestroListo[] = [];

/** Lo que se puede elegir para una carpeta fuera de la guía. BACKGROUND no: el fondo se arma al leer el PSD (una
 *  carpeta "Fondo" o "BG" ya se reconoce sola). "" = sin papel. */
const PAPELES = ["HERO", "TITULO", "SUBTITULO", "CTA", "BRAND", "FOOTER", ""] as const;

/** "DiDiSans-Pro-Bold es / … son sólo para anuncios de DiDi: elige DiDi arriba". */
const textoAjenas = (a: { cliente: string; nombres: string[] }, lang: Lang) => rellenar(tx(a.nombres.length === 1 ? FP.textoAjena : FP.textoAjenas, lang), { f: unos(a.nombres), c: a.cliente });

/** Lo que tapa el canal, en palabras: % donde la cifra es de guías (aprox.), px donde la dio el equipo (TikTok). */
function cifrasCanal(c: Canal, lang: Lang): string {
  const { pct: p, px } = CANALES[c];
  const v = (x: number, lado: number) => (px ? `${Math.round((x / 100) * lado)} px` : `≈${Math.round(x)} %`);
  const partes = [
    p.top ? `${tx(FP.zonaArriba, lang)} ${v(p.top, 1920)}` : "",
    p.bottom ? `${tx(FP.zonaAbajo, lang)} ${v(p.bottom, 1920)}` : "",
    p.left && p.left === p.right ? `${tx(FP.zonaLados, lang)} ${v(p.left, 1080)}` : p.right ? `${tx(FP.zonaDerecha, lang)} ${v(p.right, 1080)}` : "",
  ].filter(Boolean);
  return rellenar(tx(FP.zonaCifras, lang), { z: `${partes.join(", ")}${px ? ` ${tx(FP.zonaDe1080, lang)}` : ""}` });
}

const ARREGLOS: ArregloContraste[] = ["original", "fondo", "sombra"];
const NOMBRE_ARREGLO = { original: FP.contrasteOriginal, fondo: FP.contrasteFondo, sombra: FP.contrasteSombra } as const;
const porciento = (v: number) => `${Math.round(v * 100)} %`;

/**
 * El contraste de una medida donde el texto se pierde (Pedro, 2026-10-15: "can we do both and let the user decide?"):
 * qué hizo la plataforma, en una frase, y los tres caminos con cuánto se pierde en cada uno. Elegir el automático
 * vuelve a "auto" (si la plataforma cambia de opinión, la medida la sigue).
 */
function ContrasteMedida({ info, ma, medida, editada, lang, alElegir }: { info: InfoContraste; ma: MaestroVista; medida: Medida; editada: boolean; lang: Lang; alElegir: (m: Medida, e: EleccionContraste) => void }) {
  const p = info.piezas.map((i) => etiquetaPieza(ma.piezas[i])).join(", ");
  const antes = porciento(info.perdida.original ?? 0), ahora = info.perdida[info.usado];
  const nota =
    info.usado === "sombra"
      ? rellenar(tx(FP.contrasteNotaSombra, lang), { p, antes, ahora: porciento(ahora ?? 0) })
      : info.usado === "fondo"
        ? rellenar(tx(FP.contrasteNotaFondo, lang), { p, antes, ahora: porciento(ahora ?? 0) }) + (info.fondoSacaHero ? tx(FP.contrasteFlota, lang) : "")
        : info.auto === "original"
          ? rellenar(tx(FP.contrasteNinguno, lang), { p, antes })
          : rellenar(tx(FP.contrasteSinArreglo, lang), { p, antes });
  // En la tarjeta va en UNA línea (rediseño B19); la frase completa y los tres caminos se abren con un clic.
  const linea =
    info.usado === "original"
      ? rellenar(tx(FP.contrasteLineaSin, lang), { a: antes })
      : rellenar(tx(FP.contrasteLinea, lang), { o: tx(NOMBRE_ARREGLO[info.usado], lang).toLowerCase(), a: antes, b: porciento(ahora ?? 0) });
  return (
    <details className="group mt-2 rounded-md border border-border">
      <summary className={cn("flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground hover:bg-secondary/60 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden", FOCO, BAJO_BARRA)}>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        <span className="min-w-0">
          {linea}
          <span className="sr-only"> ({etiqueta(medida)})</span>
        </span>
      </summary>
      <div className="border-t border-border p-2">
        <p className="text-sm text-foreground">{nota}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{tx(FP.contrasteOpciones, lang)}</p>
        <div role="group" aria-label={rellenar(tx(FP.contrasteGrupo, lang), { m: etiqueta(medida) })} className="mt-1 flex flex-wrap gap-1.5">
          {ARREGLOS.map((a) => {
            const L = info.perdida[a], elegido = info.usado === a;
            return (
              <Button
                key={a}
                variant={elegido ? "secondary" : "outline"}
                size="sm"
                aria-pressed={elegido}
                disabled={L === null}
                onClick={() => alElegir(medida, a === info.auto ? "auto" : a)}
                className={cn("min-h-9 pointer-coarse:min-h-11", BAJO_BARRA, elegido && "font-semibold")}
              >
                {elegido && <CircleCheck className="size-3.5" aria-hidden="true" />}
                {tx(NOMBRE_ARREGLO[a], lang)}
                {L !== null && <span className="font-normal text-muted-foreground">{porciento(L)}</span>}
                {a === info.auto && <span className="font-normal text-muted-foreground">· {tx(FP.contrasteAuto, lang)}</span>}
              </Button>
            );
          })}
        </div>
        {/* Los % se miden con el acomodo automático: con piezas movidas a mano pueden cambiar (el aviso de la tarjeta sí
          mide lo editado). */}
      {editada && <p className="mt-1 text-xs text-muted-foreground">{tx(FP.contrasteEditadaNota, lang)}</p>}
      </div>
    </details>
  );
}

const TarjetaMedida = memo(function TarjetaMedida({
  maestros,
  medida,
  lado,
  canal,
  escritura,
  tipos,
  lang,
  alVoltear,
  registrar,
  edicion,
  alEditar,
  contraste: eleccion,
  alContraste,
  psdOriginal,
}: {
  maestros: MaestroVista[];
  medida: Medida;
  lado: Lado;
  canal: Canal | null;
  escritura: Escritura | null;
  tipos: Tipografias;
  lang: Lang;
  alVoltear: (m: Medida, a: Lado) => void;
  registrar: (k: string, lienzo: HTMLCanvasElement | null) => void;
  /** Lo que se movió a mano en esta medida (editor-medida.tsx); null = el acomodo automático. */
  edicion: Edicion | null;
  alEditar: (m: Medida) => void;
  /** El arreglo de contraste elegido para esta medida ("auto": el de la plataforma). */
  contraste: EleccionContraste;
  alContraste: (m: Medida, e: EleccionContraste) => void;
  /** El PSD tal cual se abrió, para armar el PSD editable de esta medida; null = sólo el de capas planas. */
  psdOriginal: Blob | null;
}) {
  const { w, h } = medida;
  const k = clave(medida);
  // La zona del canal también acomoda (en 9:16 de otra forma las piezas la evitan), luego el contraste y la edición
  // encima: lo mismo que usa el resumen.
  const { maestro, acomodo, contraste } = useMemo(
    () => revisarMedida(maestros, w, h, { heroLado: lado, zona: zonaCanal(canal, w, h), contraste: eleccion, edicion }),
    [maestros, w, h, lado, canal, eleccion, edicion],
  );
  const guia = zonaCanal(canal, w, h);
  const nombreCanal = canal ? CANALES[canal].nombre : "";
  const ma = maestros[maestro];
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [noPinto, setNoPinto] = useState(false);
  // Cuántas veces se pintó bien: la vista grande no se abre antes de la primera (copiaría un lienzo en blanco) y se
  // vuelve a copiar si la tarjeta cambia con ella abierta.
  const [pintadas, setPintadas] = useState(0);
  // Pinta (en su turno de la fila) y, SÓLO si salió bien, se anota para la descarga: una vista que espera turno o
  // que no se pudo pintar nunca va al ZIP ni se queda en blanco con una palomita al lado.
  useEffect(() => {
    const l = lienzo.current;
    if (!l) return;
    registrar(k, null);
    const cancelar = enCola(() => {
      let bien = true;
      try {
        pintar(l, ma, acomodo, w, h, { texto: textoEscrito(escritura, maestro, ma, tipos) });
      } catch (err) {
        console.error("[formatos-psd] pintar", err);
        bien = false;
      }
      registrar(k, bien ? l : null);
      setNoPinto(!bien);
      if (bien) setPintadas((n) => n + 1);
    });
    return () => {
      cancelar();
      registrar(k, null);
    };
  }, [ma, maestro, acomodo, w, h, k, registrar, escritura, tipos]);

  const letra = acomodo.letras.length ? Math.min(...acomodo.letras.map((l) => l.px)) : null;
  // «Pieza repetida» y «fondo retocado» se arreglan UNA vez arriba (en «En varias medidas»): aquí, una línea corta
  // y una sola vez aunque el motor los diga por cada pieza. Los demás avisos son de esta medida y van completos.
  const cortos = [...new Set(acomodo.avisos.flatMap((v) => (v.tipo === "copia" || v.tipo === "retoque" ? [v.tipo] : [])))];
  const propios = acomodo.avisos.filter((v) => v.tipo !== "copia" && v.tipo !== "retoque");
  const nAvisos = acomodo.avisos.length + (noPinto ? 1 : 0);
  // Editada a mano, voltear movería sólo lo que no se tocó: se vuelve al automático desde el editor. La misma regla
  // que «Voltear todas» (`acomodo.editada`).
  const volteable = sePuedeVoltear(acomodo.familia) && !acomodo.editada;
  const franja = rellenar(tx(FP.zonaFranja, lang), { c: nombreCanal });
  const bajar = async () => {
    try {
      if (lienzo.current && !noPinto) descargar(await aPng(lienzo.current), archivoDe(ma, medida));
    } catch (err) {
      console.error("[formatos-psd] png", err);
      toast.error(tx(FP.bajarFallo, lang));
    }
  };
  // La medida como PSD EDITABLE (psd-editable.ts): las capas del original movidas a esta medida, armadas en un worker y
  // de una en una (`enFilaPsd`). Si no se puede (archivo muy pesado, falla o tarda), sale el de capas planas de antes
  // (psd-salida.ts) y se dice por qué. Se baja lo que la tarjeta mostraba al hacer clic. Las librerías se cargan al
  // hacer clic, no con la página.
  const [psdEstado, setPsdEstado] = useState<"fila" | "armando" | null>(null);
  const cancelarPsd = useRef<(() => void) | null>(null);
  /** La tarjeta sigue en la página: si se fue mientras esperaba turno o armaba, no se arranca ni se baja nada. */
  const enPagina = useRef(true);
  useEffect(() => {
    enPagina.current = true;
    return () => {
      enPagina.current = false;
      cancelarPsd.current?.();
    };
  }, []);
  const bajarPsd = async () => {
    if (psdEstado) return;
    setPsdEstado("fila");
    const m = etiqueta(medida), id = `psd-${k}`;
    const nombre = archivoDe(ma, medida).replace(/\.png$/, ".psd");
    try {
      const texto = textoEscrito(escritura, maestro, ma, tipos);
      let motivo: string;
      if (!psdOriginal || !ma.origen) motivo = tx(FP.psdPlanoSinOriginal, lang);
      else if (psdOriginal.size > EDITABLE_MAX_BYTES) motivo = rellenar(tx(FP.psdPlanoPesado, lang), { mb: String(Math.round(psdOriginal.size / 1e6)), max: String(EDITABLE_MAX_BYTES / 1e6) });
      else if (sinEditable.has(psdOriginal)) motivo = tx(FP.psdPlanoFallo, lang);
      else {
        const archivo = psdOriginal, origen = ma.origen;
        try {
          const r = await enFilaPsd(async () => {
            if (!enPagina.current) return null;
            // Otra medida en la fila ya falló con este archivo: ésta no vuelve a esperar al worker.
            if (sinEditable.has(archivo)) throw new FallaPsd("otro", "este archivo ya falló en otra medida");
            setPsdEstado("armando");
            const [{ armarMedida, halosEnMedida }, { planDeMedida, retoqueDeFondo }] = await Promise.all([import("@/lib/prisma/formatos/nitido"), import("@/lib/prisma/formatos/psd-editable")]);
            // Un cuadro para que se vea «Armando…» antes del trabajo pesado. En una pestaña de fondo no se pinta nada (y el
            // navegador estira los relojes a 1 s): ahí no se espera.
            if (!document.hidden)
              await new Promise<void>((ok) => {
                const cuadro = requestAnimationFrame(() => {
                  clearTimeout(reloj);
                  setTimeout(ok, 0);
                });
                const reloj = setTimeout(() => {
                  cancelAnimationFrame(cuadro);
                  ok();
                }, 100);
              });
            if (!enPagina.current) return null;
            const sombras = new Set(acomodo.sombras ?? []);
            const halos = acomodo.puestas.flatMap((q) => (sombras.has(q.pieza) ? halosEnMedida(ma, q).map((capa) => ({ nombre: ma.piezas[q.pieza].nombre, capa })) : []));
            const retoque = ma.fondoOriginal ? retoqueDeFondo(ma.fondoOriginal, ma.fondo, ma.w, ma.h, acomodo.fondo, w, h) : null;
            const compuesto = armarMedida(ma, acomodo, w, h, { texto });
            const pedido: PedidoPsdMedida = { archivo, plan: planDeMedida({ piezas: ma.piezas, origen }, acomodo, w, h), extras: { compuesto, halos, retoque } };
            // Lo pintado aquí cruza al worker sin copiarse (son arreglos nuevos: nada más los usa).
            const transferir = [compuesto.buffer, ...halos.map((x) => x.capa.rgba.buffer), ...(retoque ? [retoque.rgba.buffer] : [])] as ArrayBuffer[];
            return psdEditableEnWorker(pedido, transferir, (c) => (cancelarPsd.current = c));
          });
          if (!r || !enPagina.current) return;
          descargar(r.archivo, nombre);
          // Las aplanadas llevan su porqué; las de revisar, no (la frase ya dice que son los filtros inteligentes).
          const lista = (aplanada: boolean) => unos(r.notas.filter((x) => x.aplanada === aplanada).map((x) => `«${corto(x.capa || tx(FP.capaSinNombre, lang))}»${aplanada ? ` (${tx(FP_APLANADA[x.motivo], lang)})` : ""}`));
          if (!r.notas.length) toast.success(rellenar(tx(FP.psdListo, lang), { m }), { id, duration: 10_000 });
          else {
            // Es lo único que dice qué no quedó editable o qué revisar: el primero de cada archivo se queda hasta que la
            // persona lo cierre.
            const aplanadas = r.notas.some((x) => x.aplanada), revisar = r.notas.some((x) => !x.aplanada);
            const texto = [aplanadas ? rellenar(tx(FP.psdAplanadas, lang), { m, capas: lista(true) }) : rellenar(tx(FP.psdListo, lang), { m }), ...(revisar ? [rellenar(tx(FP.psdRevisar, lang), { capas: lista(false) })] : [])].join(" ");
            const vistas = notasVistas.get(archivo) ?? new Set<string>(), clave = JSON.stringify(r.notas);
            notasVistas.set(archivo, vistas);
            if (vistas.has(clave)) toast.warning(texto, { id, duration: 10_000 });
            else {
              vistas.add(clave);
              toast.warning(texto, { id, duration: Infinity, closeButton: true });
            }
          }
          return;
        } catch (err) {
          if (!enPagina.current) return;
          console.error("[formatos-psd] psd editable", err);
          const codigo = err instanceof FallaPsd ? err.codigo : "otro";
          // Un tope es de ESTA medida (otra, más chica, puede salir); lo demás es del archivo: no se vuelve a esperar.
          if (codigo !== "topes") sinEditable.add(archivo);
          motivo = tx({ topes: FP.psdPlanoTopes, archivo: FP.psdPlanoArchivo, inseguro: FP.psdPlanoInseguro, formato: FP.psdPlanoFormato, otro: FP.psdPlanoFallo }[codigo], lang);
        } finally {
          cancelarPsd.current = null;
        }
      }
      // También en la fila y de una en una: si el archivo falló con doce medidas esperando, las doce de capas planas no
      // se arman seguidas sin soltar la página (cada vuelta deja pintar antes de la siguiente).
      const plano = await enFilaPsd(async () => {
        if (!enPagina.current) return null;
        setPsdEstado("armando");
        await new Promise((ok) => setTimeout(ok, 0));
        const [{ writePsdUint8Array }, { psdDeMedida }] = await Promise.all([import("ag-psd"), import("@/lib/prisma/formatos/psd-salida")]);
        if (!enPagina.current) return null;
        return new Blob([writePsdUint8Array(psdDeMedida(ma, acomodo, w, h, { texto }), { noBackground: true }) as BlobPart], { type: "image/vnd.adobe.photoshop" });
      });
      if (!plano || !enPagina.current) return;
      descargar(plano, nombre);
      // Se queda hasta cerrarlo: el archivo se llama igual que uno editable y éste es el único aviso de que no lo es.
      toast.warning(rellenar(tx(FP.psdPlano, lang), { m, motivo }), { id, duration: Infinity, closeButton: true });
    } catch (err) {
      console.error("[formatos-psd] psd", err);
      if (enPagina.current) toast.error(rellenar(tx(FP.bajarPsdFallo, lang), { m }), { id, duration: 10_000 });
    } finally {
      if (enPagina.current) setPsdEstado(null);
    }
  };
  return (
    // `@container`: los botones van en dos columnas si la tarjeta es angosta (vertical) y en fila si es ancha (banner).
    <li className="@container flex flex-col rounded-xl border border-border bg-card p-2.5">
      {/* La vista abre la vista grande (vista-grande.tsx). Todo el recuadro es el botón: con el ratón o con el dedo, y el
          ícono de la esquina se ve siempre (en iPad no hay hover que lo descubra). */}
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={noPinto || pintadas === 0}
            aria-label={`${rellenar(tx(FP.verGrandeAria, lang), { m: etiqueta(medida) })}${guia ? rellenar(tx(FP.lienzoGuia, lang), { c: nombreCanal }) : ""}`}
            className={cn("group relative flex w-full cursor-zoom-in justify-center rounded-lg bg-secondary/60 p-2 transition-colors hover:bg-secondary disabled:cursor-default", FOCO, BAJO_BARRA)}
          >
            {/* El contenedor fija el tamaño a la vista; las franjas de la guía van encima, nunca dentro del lienzo. */}
            <span className="relative block" style={{ width: `min(100%, ${Math.round(Math.min(w, (VISTA_ALTO_MAX * w) / h))}px)`, aspectRatio: `${w} / ${h}` }}>
              <canvas ref={lienzo} aria-hidden="true" className="block size-full rounded-sm" />
              {guia && <Franjas guia={guia} w={w} h={h} texto={franja} />}
            </span>
            {!noPinto && pintadas > 0 && (
              <span aria-hidden="true" className="absolute top-1 right-1 rounded-md bg-background/85 p-1 text-foreground shadow-sm ring-1 ring-border group-hover:bg-background">
                <Maximize2 className="size-3.5" />
              </span>
            )}
          </button>
        </DialogTrigger>
        <VistaGrande fuente={lienzo} version={pintadas} w={w} h={h} nombre={etiqueta(medida)} lang={lang}>
          {guia && <Franjas guia={guia} w={w} h={h} texto={franja} />}
        </VistaGrande>
      </Dialog>
      {/* El encabezado lleva sólo la medida (así se oye en la lista de encabezados); el estado va al lado, en palabras
          (no sólo color): «Listo» o cuántos avisos tiene. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <h4 className="text-sm font-semibold text-foreground tabular-nums">{etiqueta(medida)}</h4>
        {nAvisos > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-warning/50 bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium">
            <AlertTriangle className="size-3 text-status-warning" aria-hidden="true" /> {nAvisos === 1 ? tx(FP.avisoUno, lang) : rellenar(tx(FP.avisosN, lang), { n: nAvisos })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-completed/40 bg-status-completed/8 px-1.5 py-0.5 text-xs font-medium">
            <CircleCheck className="size-3 text-status-completed" aria-hidden="true" /> {tx(FP.listo, lang)}
          </span>
        )}
        {acomodo.editada && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium">
            <Move className="size-3" aria-hidden="true" /> {tx(FP.editada, lang)}
            <span className="sr-only">: {tx(FP.editadaTitulo, lang)}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {tx(FP_FAMILIA[acomodo.familia], lang)}
        {maestros.length > 1 && <> · {rellenar(tx(FP.deMesa, lang), { m: `${ma.w}×${ma.h}` })}</>}
        {volteable && <> · {tx(lado === "izquierda" ? FP.heroIzquierda : FP.heroDerecha, lang)}</>}
        {letra !== null && <> · {rellenar(tx(FP.letra, lang), { px: letra.toFixed(1) })}</>}
      </p>
      {noPinto && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> {tx(FP.noPinto, lang)}
        </p>
      )}
      {contraste && <ContrasteMedida info={contraste} ma={ma} medida={medida} editada={!!acomodo.editada} lang={lang} alElegir={alContraste} />}
      {(propios.length > 0 || cortos.length > 0) && (
        // Los avisos los escribe el motor (acomodo.ts), en español: marcados así cuando la pantalla está en inglés.
        <ul lang={lang === "en" ? "es" : undefined} className="mt-2 space-y-1 text-xs leading-snug text-foreground">
          {propios.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> <span className="min-w-0">{v.texto}</span>
            </li>
          ))}
          {cortos.map((t) => (
            <li key={t} lang={lang} className="flex items-start gap-1.5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> <span className="min-w-0">{tx(AVISO_CORTO[t], lang)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Los botones al pie de la tarjeta (mt-auto): en una fila de tarjetas quedan a la misma altura. */}
      <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2.5 @[22rem]:flex @[22rem]:flex-wrap">
        <Button variant="outline" className={BOTON_TARJETA} data-editar={k} onClick={() => alEditar(medida)} disabled={noPinto} aria-label={rellenar(tx(FP.editarAria, lang), { m: etiqueta(medida) })}>
          <Move className="size-3.5" aria-hidden="true" /> {tx(FP.editar, lang)}
        </Button>
        {volteable && (
          <Button variant="outline" className={BOTON_TARJETA} onClick={() => alVoltear(medida, lado === "izquierda" ? "derecha" : "izquierda")} aria-label={rellenar(tx(FP.voltearAria, lang), { m: etiqueta(medida) })}>
            <FlipHorizontal2 className="size-3.5" aria-hidden="true" /> {tx(FP.voltear, lang)}
          </Button>
        )}
        <Button variant="outline" className={BOTON_TARJETA} onClick={() => void bajar()} disabled={noPinto} aria-label={rellenar(tx(FP.bajarPngAria, lang), { m: etiqueta(medida) })}>
          <Download className="size-3.5" aria-hidden="true" /> {tx(FP.bajarPng, lang)}
        </Button>
        <Button
          variant="outline"
          className={BOTON_TARJETA}
          onClick={() => void bajarPsd()}
          // Ocupado no lo saca del Tab (el foco no se pierde) ni lo atenúa: `bajarPsd` ignora otro clic mientras arma.
          disabled={noPinto}
          aria-disabled={psdEstado ? true : undefined}
          aria-label={psdEstado ? `${rellenar(tx(FP.bajarPsdAria, lang), { m: etiqueta(medida) })}: ${tx(psdEstado === "fila" ? FP.bajarPsdEnFila : FP.bajarPsdHaciendo, lang)}` : rellenar(tx(FP.bajarPsdAria, lang), { m: etiqueta(medida) })}
          title={tx(FP.bajarPsdTitulo, lang)}
        >
          {psdEstado ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Layers className="size-3.5" aria-hidden="true" />}
          {psdEstado ? tx(psdEstado === "fila" ? FP.bajarPsdEnFila : FP.bajarPsdHaciendo, lang) : tx(FP.bajarPsd, lang)}
        </Button>
      </div>
    </li>
  );
});

/** Un cliente para elegir arriba: decide qué tipografías exclusivas puede usar el anuncio. */
export type ClientePsd = { id: string; nombre: string };

/** `iaCopia`: el respaldo con IA de «Quitar del fondo» está encendido en el servidor (proveedor.ts). */
export function FormatosPsd({ planaActiva, clientes, iaCopia }: { planaActiva: boolean; clientes: ClientePsd[]; iaCopia: boolean }) {
  const [lang, setLang] = useLang();
  /** "" = Sin cliente: sólo las tipografías que sirven para todos. */
  const [cliente, setCliente] = useState("");
  /** El cliente elegido AHORA, para lo que termina tarde (una respuesta de otro cliente no carga nada). */
  const clienteVigente = useRef("");
  /** Las tipografías que llegaron por ser exclusivas de un cliente (nombre → cliente): se sueltan al cambiar de cliente. */
  const deExclusiva = useRef(new Map<string, string>());
  /** El papel que se eligió para cada carpeta fuera de la guía ("CARD" → HERO), de qué PSD. Sin elegir, el que adivinó
   *  el lector (roles.ts). null = sin papel. */
  const [papeles, setPapeles] = useState<{ leido: Leido; mapa: Map<string, Rol | null> } | null>(null);
  /** Las copias del HERO que la persona aprobó quitar del fondo, por maestro (índice), de qué PSD: el fondo ya rellenado. */
  const [sinCopia, setSinCopia] = useState<{ leido: Leido; mapa: Map<number, Quitada> } | null>(null);
  /** Lo que se editó a mano en ESTE PSD, por medida («WxH»); null = se volvió al automático (manda sobre lo guardado). */
  const [ediciones, setEdiciones] = useState<{ leido: Leido; mapa: Map<string, Edicion | null> } | null>(null);
  /** La medida abierta en el editor. */
  const [editando, setEditando] = useState<Medida | null>(null);
  /** Cuándo se quitó o devolvió la última copia (ver COPIA_PAUSA_MS). */
  const ultimaCopia = useRef(0);
  /** La copia que está borrando la IA ahora (de qué PSD y qué maestro): una a la vez, y su botón espera. */
  const [conIA, setConIA] = useState<{ leido: Leido; i: number } | null>(null);
  /** El pedido a la IA en curso: se cancela al cambiar de PSD o al salir de la pantalla. */
  const pedidoIA = useRef<AbortController | null>(null);
  /** Tras quitar con IA, el foco va al botón de esa copia (el de la IA desaparece). */
  const enfocarCopia = useRef<number | null>(null);
  /** Lo que le falta al PSD pero es exclusivo de OTRO cliente (de qué PSD y con qué cliente elegido se preguntó). */
  const [ajenas, setAjenas] = useState<{ leido: Leido; cliente: string; lista: { cliente: string; nombres: string[] }[] } | null>(null);
  const [leido, setLeido] = useState<Leido | null>(null);
  const [avance, setAvance] = useState<{ mesa: number; de: number } | null>(null);
  const [falla, setFalla] = useState<Falla | null>(null);
  const [over, setOver] = useState(false);
  /** Las medidas del panel, en orden: la lista de DiDi y las agregadas a mano. */
  const [lista, setLista] = useState<MedidaLista[]>(LISTA_DIDI);
  /** Las que se apagaron con un clic («WxH»): siguen en el panel, no salen en los resultados. */
  const [apagadas, setApagadas] = useState<ReadonlySet<string>>(() => new Set());
  /** Las que salen: prendidas y dentro del tope por anuncio. El objeto de cada medida es el mismo de `lista`, así una
   *  tarjeta no se vuelve a pintar porque se prendió o apagó otra. */
  const { caben: medidas, fuera: sinLugar } = useMemo(() => medidasQueCaben(lista.filter((m) => !apagadas.has(clave(m)))), [lista, apagadas]);
  const [lados, setLados] = useState<Record<string, Lado>>({});
  /** El arreglo de contraste que la persona eligió por medida; sin entrada, el que elige la plataforma. */
  const [contrastes, setContrastes] = useState<Record<string, EleccionContraste>>({});
  /** Canal contra el que se revisa la zona segura. Sin canal no se marca nada (nadie ve una franja sin nombre). */
  const [canal, setCanal] = useState<Canal | null>(null);
  /** Tipografías cargadas (nombre PostScript → cómo pedirla). Vacío = el texto va como imagen. */
  const [tipos, setTipos] = useState<Tipografias>(() => new Map());
  /** Qué pasó al cargar tipografías (se escribe al pintar: así sigue el idioma de la pantalla). */
  const [notaFuentes, setNotaFuentes] = useState<NotaFuentes | null>(null);
  /** Cuántas cargas de tipografías van en curso (soltadas, del botón y de Greenlight pueden cruzarse). */
  const [cargandoFuentes, setCargandoFuentes] = useState(0);
  /** Ya se cargaron las recordadas en este navegador: sólo entonces se sabe qué le falta de verdad a un PSD. */
  const [recordadasListas, setRecordadasListas] = useState(false);
  /** Pedidos a Greenlight en curso (un PSD leído encima de otro puede cruzarlos). */
  const [trayendo, setTrayendo] = useState(0);
  /** El PSD al que ya se le resolvió el pedido (o no le faltaba nada): hasta entonces no se dice "Faltan". */
  const [resueltoPara, setResueltoPara] = useState<Leido | null>(null);
  /** A qué PSD (y con qué cliente) ya se le pidieron: una vez por PSD y cliente; si Greenlight no las tiene, no se
   *  vuelve a preguntar hasta cambiar de PSD o de cliente. */
  const pedidasPara = useRef<{ l: Leido; c: string } | null>(null);
  /** Sube al "Olvidar": el mismo PSD con el mismo cliente vuelve a pedir lo que le falta. */
  const [otraVez, setOtraVez] = useState(0);
  /** Lo vigente para lo que termina tarde (tras esperar a la red): el PSD en pantalla y las tipografías cargadas. */
  const leidoVigente = useRef<Leido | null>(null);
  const tiposVigentes = useRef<Tipografias>(new Map());
  /** La última prueba de los textos: de qué PSD y con qué tipografías se hizo (ver el efecto que la corre). */
  const [prueba, setPrueba] = useState<{ leido: Leido; tipos: Tipografias; e: Escritura | null } | null>(null);
  const entradaFuentes = useRef<HTMLInputElement>(null);
  const botonAgregar = useRef<HTMLButtonElement>(null);
  const [zipeando, setZipeando] = useState(false);
  /** Lo último que pasó, para lectores de pantalla. `n` cambia cuando el mismo texto se repite (si no, no se anuncia). */
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null);
  /** El PSD trae muchas mesas: la persona elige cuáles leer (el worker espera, con el reloj en pausa). */
  const [eleccion, setEleccion] = useState<{ mesas: MesaElegible[]; marcadas: number[] } | null>(null);
  /** `armar` vuelve a poner el reloj que mata al worker (se pausa mientras alguien elige mesas). */
  const trabajo = useRef<{ worker: Worker; reloj: number; armar: () => void } | null>(null);
  /** Cada lectura toma un turno: lo que llegue de un turno viejo (otro archivo, cancelar) se ignora. */
  const turno = useRef(0);
  const vivo = useRef(true);
  const lienzos = useRef(new Map<string, HTMLCanvasElement>());
  const tituloResultado = useRef<HTMLHeadingElement>(null);
  const tituloElegir = useRef<HTMLHeadingElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  /** El cuadro de subida vuelve a existir (cambiar PSD, cancelar, error): el foco regresa a él, no al tope de la página. */
  const volverASubir = useRef(false);
  /** Tras "Leer las marcadas" el elegidor se va: el foco pasa a "Cancelar" de la lectura. */
  const irACancelar = useRef(false);
  const botonCancelar = useRef<HTMLButtonElement>(null);

  const soltar = useCallback(() => {
    if (!trabajo.current) return;
    trabajo.current.worker.terminate();
    window.clearTimeout(trabajo.current.reloj);
    trabajo.current = null;
  }, []);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      soltar();
      pedidoIA.current?.abort();
    };
  }, [soltar]);
  const anunciar = useCallback((t: string) => setAviso((p) => ({ texto: t, n: p?.texto === t ? p.n + 1 : 0 })), []);

  const leyendo = avance !== null;
  const eligiendo = eleccion !== null;
  const usables = leido?.maestros ?? SIN_MAESTROS;
  const elegidos = papeles?.leido === leido ? papeles.mapa : null;
  /** Los maestros con el papel elegido en cada carpeta. Sólo cambia `rol`, y sólo en los maestros que traen esa carpeta. */
  const conPapel = useMemo(
    () =>
      elegidos
        ? usables.map((m) => (m.piezas.some((p) => elegidos.has(p.nombre)) ? { ...m, piezas: m.piezas.map((p) => (elegidos.has(p.nombre) ? { ...p, rol: elegidos.get(p.nombre) ?? null } : p)) } : m))
        : usables,
    [usables, elegidos],
  );
  /** Si el fondo de cada maestro trae pintada una copia de su HERO (se mide con el fondo original, siempre). Es una
   *  ayuda: si algo raro del PSD la rompe, la pantalla sigue sin ella. */
  const copias = useMemo(
    () =>
      conPapel.map((m) => {
        try {
          return buscarGemela(m);
        } catch (err) {
          console.error("[formatos-psd] buscar copia", err);
          return null;
        }
      }),
    [conPapel],
  );
  /** Lo de ahora para lo que termina tarde (la respuesta de la IA): las copias y el idioma de la pantalla. */
  const copiasVigentes = useRef(copias);
  const langVigente = useRef(lang);
  useEffect(() => {
    copiasVigentes.current = copias;
    langVigente.current = lang;
  }, [copias, lang]);
  const quitadas = sinCopia?.leido === leido ? sinCopia.mapa : null;
  /** El maestro cuya copia está borrando la IA en ESTE PSD (null si ninguno). */
  const iaEnCurso = conIA && conIA.leido === leido ? conIA.i : null;
  /** Lo quitado de un maestro sigue valiendo sólo si su copia es la misma pieza (si la persona cambió el papel de las
   *  carpetas, el HERO puede ser otro: entonces se vuelve a ofrecer en vez de dejar un retoque viejo). */
  const quitadaDe = (i: number): Quitada | null => {
    const q = quitadas?.get(i), g = copias[i];
    return q && g && q.pieza === g.pieza ? q : null;
  };
  /** Lo que acomoda y pinta cada medida: con su papel y, donde se aprobó, con el fondo sin la copia. */
  const maestrosVista = useMemo<MaestroVista[]>(
    () =>
      conPapel.map((m, i) => {
        const q = quitadas?.get(i), g = copias[i] ?? null;
        const vale = q && g && q.pieza === g.pieza ? q : null;
        const antes = vistas.get(m);
        if (antes && antes.q === vale && antes.g === g) return antes.v;
        const v: MaestroVista = vale ? { ...m, fondo: vale.fondo, fondoOriginal: m.fondo, copia: { pieza: vale.pieza, quitada: true } } : g ? { ...m, copia: { pieza: g.pieza, quitada: false } } : m;
        vistas.set(m, { q: vale, g, v });
        return v;
      }),
    [conPapel, copias, quitadas],
  );
  /** Lo que enseña «Pieza repetida en el fondo»: cada maestro con copia, quitada o no. */
  const copiasVista = conPapel.flatMap((m, i) => {
    const g = copias[i];
    return g ? [{ i, m, nombre: m.piezas[g.pieza]?.nombre ?? "", parecido: g.parecido, quitada: quitadaDe(i) }] : [];
  });
  const deMesa = (m: MaestroListo) => (usables.length > 1 ? rellenar(tx(FP.copiaDeMesa, lang), { m: `${m.w}×${m.h}` }) : "");
  // Quitar la copia sólo cuando la persona lo pide (Pedro: avisar y sugerir; si lo aprueba, se rellena), y poder deshacerlo.
  // `cuando` = la hora del clic (event.timeStamp): un segundo clic muy seguido no deshace lo que el primero hizo.
  const quitarCopia = (i: number, cuando: number) => {
    const m = conPapel[i], g = copias[i];
    if (!leido || !m || !g || cuando - ultimaCopia.current < COPIA_PAUSA_MS) return;
    let fondo: Uint8ClampedArray;
    try {
      fondo = quitarGemela(m, g);
    } catch (err) {
      console.error("[formatos-psd] quitar copia", err);
      toast.error(tx(FP.copiaFallo, lang));
      return;
    }
    ultimaCopia.current = cuando;
    setSinCopia((antes) => ({ leido, mapa: new Map([...(antes?.leido === leido ? antes.mapa : []), [i, { pieza: g.pieza, fondo, metodo: "espejo" }]]) }));
    anunciar(rellenar(tx(FP.copiaQuitadaAviso, lang), { p: m.piezas[g.pieza]?.nombre ?? "", m: deMesa(m) }));
  };
  // El respaldo: si el relleno gratis no quedó bien, la IA vuelve a borrar la copia. Se le manda SÓLO un recorte del
  // fondo original y la pieza; de lo que vuelve se pega únicamente el hueco (gemela.ts › pegarRellenoIA).
  const rellenarConIA = async (i: number) => {
    const m = conPapel[i], g = copias[i], l = leido;
    if (!l || !m || !g || (conIA && conIA.leido === l)) return;
    const recorte = recorteParaIA(m, g);
    const p = m.piezas[g.pieza];
    if (!recorte || !p) return void toast.error(tx(FP.copiaIaNoCabe, lang));
    const ctrl = new AbortController();
    pedidoIA.current?.abort();
    pedidoIA.current = ctrl;
    setConIA({ leido: l, i });
    anunciar(tx(FP.copiaIaTrabajando, lang));
    try {
      const c = recorte.caja;
      const form = new FormData();
      form.set("fondo", await pngQueQuepa(recortarRgba(m.fondo, m.w, c), c.w, c.h, RECORTE_IA_MAX, FONDO_IA_MAX_BYTES), "fondo.png");
      const rgbaPieza = p.rgba.buffer instanceof ArrayBuffer ? (p.rgba as Uint8ClampedArray<ArrayBuffer>) : new Uint8ClampedArray(p.rgba);
      form.set("pieza", await pngQueQuepa(rgbaPieza, p.caja.w, p.caja.h, PIEZA_IA_MAX, PIEZA_IA_MAX_BYTES), "pieza.png");
      form.set("aspect", recorte.aspect);
      const res = await fetch("/api/prisma/formatos/copia", { method: "POST", body: form, signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(IA_ESPERA_MS)]) });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw typeof e?.error === "string" ? new ErrorDeRuta(e.error) : new Error(`HTTP ${res.status}`);
      }
      const costo = res.headers.get("x-costo-usd"), costoUsd = costo && Number.isFinite(Number(costo)) ? Number(costo) : null;
      const ia = await aRgba(await res.blob(), c.w, c.h);
      // Mientras la IA trabajaba pudo cambiar el PSD o el papel de las carpetas: lo que vuelve ya no es de éste.
      if (!vivo.current) return;
      if (leidoVigente.current !== l || copiasVigentes.current[i]?.pieza !== g.pieza) return void toast.info(tx(FP.copiaIaDescartada, langVigente.current));
      const pegado = pegarRellenoIA(m, g, c, ia);
      if (!pegado) throw new Error("pegado");
      setSinCopia((antes) => ({ leido: l, mapa: new Map([...(antes?.leido === l ? antes.mapa : []), [i, { pieza: g.pieza, fondo: pegado.fondo, metodo: "ia", costoUsd, deriva: pegado.deriva }]]) }));
      enfocarCopia.current = i;
      const t = langVigente.current;
      anunciar(rellenar(tx(FP.copiaIaAviso, t), { p: p.nombre, m: deMesa(m) }) + (pegado.deriva !== null && pegado.deriva > DERIVA_IA_REVISAR ? ` ${tx(FP.copiaIaDeriva, t)}` : ""));
    } catch (err) {
      // Cancelado porque cambió el PSD o se salió de la pantalla: nada que decir.
      if (ctrl.signal.aborted || !vivo.current) return;
      console.error("[formatos-psd] copia con IA", err);
      toast.error(err instanceof ErrorDeRuta ? err.message : tx(FP.copiaIaFallo, langVigente.current), { duration: 10_000 });
    } finally {
      if (pedidoIA.current === ctrl) pedidoIA.current = null;
      if (vivo.current) setConIA((ahora) => (ahora?.leido === l && ahora.i === i ? null : ahora));
    }
  };
  // Tras quitar con IA, el botón de la IA desaparece: el foco pasa al de «Deshacer» de esa misma copia.
  useEffect(() => {
    if (enfocarCopia.current === null) return;
    document.getElementById(`psd-copia-btn-${enfocarCopia.current}`)?.focus();
    enfocarCopia.current = null;
  });
  const devolverCopia = (i: number, nombre: string, cuando: number) => {
    const m = conPapel[i];
    if (!leido || !m || cuando - ultimaCopia.current < COPIA_PAUSA_MS) return;
    ultimaCopia.current = cuando;
    setSinCopia((antes) => {
      const mapa = new Map(antes?.leido === leido ? antes.mapa : []);
      mapa.delete(i);
      return { leido, mapa };
    });
    anunciar(rellenar(tx(FP.copiaDevueltaAviso, lang), { p: nombre, m: deMesa(m) }));
  };
  /** Las carpetas cuyo nombre no es de la guía, con el papel que tienen ahora (una vez cada nombre, en orden). */
  const fueraDeGuia = [...new Map(maestrosVista.flatMap((m) => m.piezas).filter((p) => !nombreDeGuia(p.nombre)).map((p) => [p.nombre, p.rol] as const))];
  const elegirPapel = (nombre: string, rol: Rol | null) => {
    if (!leido) return;
    setPapeles((antes) => ({ leido, mapa: new Map([...(antes?.leido === leido ? antes.mapa : []), [nombre, rol]]) }));
  };
  // Al terminar de leer, el foco va al resultado; al volver al cuadro de subida, al cuadro.
  useEffect(() => {
    if (leido?.maestros.length) tituloResultado.current?.focus();
  }, [leido]);
  useEffect(() => {
    if (eligiendo) tituloElegir.current?.focus();
  }, [eligiendo]);
  useEffect(() => {
    if (!volverASubir.current || leyendo || eligiendo || usables.length) return;
    volverASubir.current = false;
    entrada.current?.focus();
  });
  useEffect(() => {
    if (!irACancelar.current || !leyendo || eligiendo) return;
    irACancelar.current = false;
    botonCancelar.current?.focus();
  });
  const totalTextos = usables.reduce((t, m) => t + m.piezas.reduce((u, p) => u + p.textos.length, 0), 0);

  /** Lo elegido para el PSD anterior se suelta junto con él (no sólo se esconde): cada fondo retocado pesa como la mesa. */
  const soltarElegido = () => {
    setPapeles(null);
    setSinCopia(null);
    setAjenas(null);
    pedidoIA.current?.abort();
    setConIA(null);
  };
  const cambiarPsd = () => {
    volverASubir.current = true;
    setLeido(null);
    soltarElegido();
    setAviso(null);
  };
  const cancelar = () => {
    turno.current++;
    soltar();
    volverASubir.current = true;
    setAvance(null);
    setEleccion(null);
  };

  const abrir = async (file: File) => {
    const mio = ++turno.current;
    const vigente = () => vivo.current && mio === turno.current;
    soltar();
    setFalla(null);
    setLeido(null);
    soltarElegido();
    setLados({});
    setContrastes({});
    setAviso(null);
    setNotaFuentes(null);
    setEleccion(null);
    const fallar = (f: Falla) => {
      volverASubir.current = true;
      setAvance(null);
      setEleccion(null);
      setFalla(f);
    };
    // El peso y la firma se revisan ANTES de abrir el archivo. El archivo NO se carga aquí: el worker lo lee a
    // pedazos y se salta lo que no usa (un PSD de 1 GB hecho de objetos inteligentes cabe).
    if (file.size > PSD_ARCHIVO_MAX) return fallar({ clave: "pesado" });
    setAvance({ mesa: 0, de: 0 }); // antes del primer await: el cuadro se cierra a otro archivo desde ya
    try {
      const cabeza = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (!vigente()) return;
      if (!(cabeza[0] === 0x38 && cabeza[1] === 0x42 && cabeza[2] === 0x50 && cabeza[3] === 0x53)) return fallar({ clave: "noEsPsd" });
    } catch (err) {
      console.error("[formatos-psd] leer archivo", err);
      if (vigente()) fallar({ clave: "desconocido" });
      return;
    }
    if (!vigente()) return;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./psd.worker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      return fallar({ clave: "desconocido" });
    }
    // Sólo el worker vigente puede cerrar la lectura: uno viejo no pisa ni mata al nuevo.
    const cerrar = (f: Falla | null): boolean => {
      if (trabajo.current?.worker !== worker) return false;
      soltar();
      if (f) fallar(f);
      return true;
    };
    const t = { worker, reloj: 0, armar: () => (t.reloj = window.setTimeout(() => cerrar({ clave: "tardo" }), LEER_MAX_MS)) };
    trabajo.current = t;
    t.armar();
    worker.onerror = (e) => {
      console.error("[formatos-psd] worker", e.message);
      cerrar({ clave: "desconocido" });
    };
    worker.onmessageerror = () => cerrar({ clave: "desconocido" });
    worker.onmessage = (e: MessageEvent<MensajeWorker>) => {
      const m = e.data;
      if (trabajo.current?.worker !== worker) return;
      if (m.tipo === "avance") return setAvance({ mesa: m.mesa, de: m.de });
      if (m.tipo === "elegir") {
        // Mientras la persona elige, el reloj no corre: no es la librería la que tarda.
        window.clearTimeout(t.reloj);
        setAvance(null);
        setEleccion({ mesas: m.mesas, marcadas: m.sugeridas });
        return;
      }
      if (m.tipo === "error") {
        console.error("[formatos-psd]", m.detalle);
        return void cerrar({ clave: CLAVE_ERROR[m.motivo], detalle: m.motivo === "desconocido" ? undefined : m.detalle });
      }
      // El worker ya entregó (sus píxeles cruzaron sin copiarse): se suelta.
      cerrar(null);
      // Un PSD sin mesas de trabajo no trae nombre de mesa: el del archivo hace de nombre de entrega.
      const maestros = m.maestros.map((x) => (x.nombre ? x : { ...x, nombre: sinExtension(file.name) }));
      setLeido({ archivo: file.name, psdOriginal: file, maestros, descartadas: m.descartadas, avisos: m.avisos });
      if (maestros.length) setAvance(null);
      else fallar({ clave: "ningunaMesa" });
    };
    try {
      worker.postMessage({ tipo: "leer", archivo: file } satisfies PedidoWorker);
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      cerrar({ clave: "desconocido" });
    }
  };

  const marcar = (i: number) => {
    if (!eleccion) return;
    const ya = eleccion.marcadas.includes(i);
    const marcadas = ya ? eleccion.marcadas.filter((x) => x !== i) : [...eleccion.marcadas, i];
    if (marcadas.length > MESAS_MAX) return;
    setEleccion({ ...eleccion, marcadas });
    // Al llegar al tope las demás casillas se apagan: se dice por qué.
    if (!ya && marcadas.length === MESAS_MAX) anunciar(rellenar(tx(FP.elegirTope, lang), { max: MESAS_MAX }));
  };
  const leerElegidas = () => {
    const t = trabajo.current;
    if (!eleccion?.marcadas.length) return void anunciar(tx(FP.elegirNinguna, lang));
    if (!t) return;
    try {
      t.worker.postMessage({ tipo: "mesas", indices: eleccion.marcadas } satisfies PedidoWorker);
    } catch (err) {
      console.error("[formatos-psd] worker", err);
      soltar();
      volverASubir.current = true;
      setEleccion(null);
      return setFalla({ clave: "desconocido" });
    }
    t.armar();
    irACancelar.current = true;
    setAvance({ mesa: 0, de: eleccion.marcadas.length });
    setEleccion(null);
  };

  // Tipografías: las que se recordaron en este navegador se cargan solas; las nuevas se suman y se recuerdan.
  useEffect(() => {
    void (async () => {
      try {
        const recordadas = await fuentesRecordadas();
        if (!recordadas.length) return;
        const r = await cargarFuentes(recordadas, new Map());
        if (vivo.current) setTipos((antes) => new Map([...r.mapa, ...antes]));
      } finally {
        if (vivo.current) setRecordadasListas(true);
      }
    })();
  }, []);
  /** `extra` = lo que también hay que decirle al lector de pantalla (p. ej. "es sólo para anuncios de DiDi"). */
  const avisarFuentes = (n: NotaFuentes, extra = "") => {
    setNotaFuentes(n);
    const texto = textoNotaFuentes(n, lang);
    anunciar([texto, extra].filter(Boolean).join(" "));
    // Sin el detalle de tipografías a la vista (aún no hay PSD, o no trae textos) la nota sale como aviso flotante. Un
    // problema, siempre: con PSD el detalle vive en un chip cerrado y nadie lo vería.
    if (!totalTextos || notaMala(n)) (notaMala(n) ? toast.error : toast.success)(texto);
  };
  /** `greenlight` = vinieron de Greenlight: `de` (los clientes, para la nota), los que no bajaron y si siguen
   *  valiendo al terminar de cargar (otro PSD u otro cliente elegido mientras tanto: no se suman). */
  const agregarFuentes = async (archivos: File[], greenlight?: { de: string; noBajaron: string[]; vigente: () => boolean; extra: string }) => {
    const de = greenlight?.de;
    const extra = greenlight?.extra ?? "";
    // Los topes van ANTES de leer: una carpeta de fuentes del sistema o un archivo enorme no llegan a memoria.
    const { usar, omitidas: fuera } = elegirFuentes(archivos);
    const omitidas = [...fuera, ...(greenlight?.noBajaron ?? [])];
    if (!usar.length) return avisarFuentes(omitidas.length ? { nuevas: 0, malas: omitidas, de } : { nuevas: 0, malas: [], vacio: true }, extra);
    setCargandoFuentes((n) => n + 1);
    try {
      const datos: ArchivoFuente[] = [];
      for (const f of usar) datos.push({ nombre: f.name, datos: await f.arrayBuffer() });
      // Las vigentes (no las de cuando empezó: pudieron soltarse u olvidarse otras mientras se leía).
      const r = await cargarFuentes(datos, tiposVigentes.current);
      if (!vivo.current || (greenlight && !greenlight.vigente())) return;
      // Funcional: dos tandas casi juntas (o la de las recordadas) se suman, no se pisan. Sólo lo NUEVO: `r.mapa` es
      // una copia de cuando empezó y traería de vuelta lo que mientras tanto se soltó (otro cliente, "Olvidar").
      if (r.nuevas.length) setTipos((antes) => new Map([...antes, ...r.nuevas.flatMap((n) => { const c = r.mapa.get(n); return c ? [[n, c] as const] : []; })]));
      // Las que vienen de Greenlight NO se guardan en el navegador: son letra con licencia del cliente y se vuelven
      // a pedir (con sesión) en cada pestaña. Las que la persona soltó, sí: son sus archivos.
      if (de === undefined) void recordarFuentes(r.buenas);
      avisarFuentes({ nuevas: r.nuevas.length, malas: [...r.malas, ...omitidas], de }, extra);
    } catch (err) {
      console.error("[formatos-psd] tipografías", err);
      if (vivo.current) avisarFuentes({ nuevas: 0, malas: [], fallo: true });
    } finally {
      if (vivo.current) setCargandoFuentes((n) => n - 1);
    }
  };
  const olvidar = () => {
    setTipos(new Map());
    deExclusiva.current.clear();
    setNotaFuentes(null);
    // También se van las que trajo Greenlight: se vuelven a pedir para el PSD en pantalla.
    pedidasPara.current = null;
    setResueltoPara(null);
    setOtraVez((n) => n + 1);
    anunciar(tx(FP.textoOlvidadas, lang));
    void olvidarFuentes().then((bien) => bien || toast.error(tx(FP.textoNoOlvido, lang)));
    // Este botón desaparece: el foco pasa a "Agregar tipografías" (si no, cae al tope de la página).
    botonAgregar.current?.focus();
  };

  // Un PSD soltado FUERA del cuadro haría que el navegador lo abra o lo descargue y se pierda la pantalla: la
  // página entera recibe el archivo.
  const alSoltar = useEffectEvent((e: DragEvent) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    setOver(false);
    // Las carpetas se recorren (la de tipografías llega así). Las entradas se toman YA: después del evento ya no existen.
    const entradas = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.() ?? null).filter((x): x is FileSystemEntry => !!x);
    const sueltos = [...e.dataTransfer.files];
    void (async () => {
      const archivos = entradas.length ? await archivosDe(entradas) : sueltos;
      const fuentes = archivos.filter((f) => EXTENSIONES_FUENTE.test(f.name));
      if (fuentes.length) void agregarFuentes(fuentes);
      const psd = archivos.find((f) => /\.psd$/i.test(f.name));
      if (psd) return void (leyendo || abrir(psd));
      if (fuentes.length || !archivos.length) return;
      // Ni PSD ni tipografías (un .zip de fuentes, un .woff2): con resultados en pantalla no se pierden por eso; en el
      // cuadro de subida, el archivo dice por qué no sirve ("no es un PSD").
      if (usables.length || leyendo) return void toast.error(tx(FP.soltarNoSirve, lang));
      void abrir(archivos[0]);
    })();
  });

  useEffect(() => {
    const sobre = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const suelta = (e: DragEvent) => alSoltar(e);
    window.addEventListener("dragover", sobre);
    window.addEventListener("drop", suelta);
    return () => {
      window.removeEventListener("dragover", sobre);
      window.removeEventListener("drop", suelta);
    };
  }, []);

  // Las medidas en pastillas (rediseño B19): prender o apagar con un clic, agregar a mano (una o la lista del cliente
  // pegada tal cual), borrar las agregadas y volver a la lista de DiDi.
  // Cada cambio se anuncia (el lector de pantalla oye qué pasó y cuántas quedan prendidas).
  const alternarMedida = (k: string) => {
    const apagar = !apagadas.has(k);
    const luego = new Set(apagadas);
    if (apagar) luego.add(k);
    else luego.delete(k);
    // Funcional: dos clics antes de que la página se repinte se suman (el anuncio usa la cuenta de este clic).
    setApagadas((a) => {
      const n = new Set(a);
      if (!n.delete(k)) n.add(k);
      return n;
    });
    const r = rellenar(tx(FP.medidasPrendidas, lang), { n: lista.filter((m) => !luego.has(clave(m))).length, t: lista.length });
    anunciar(rellenar(tx(apagar ? FP.medidaApagada : FP.medidaPrendida, lang), { m: k.replace("x", "×"), r }));
  };
  const quitarMedida = (k: string) => {
    setLista((l) => l.filter((m) => clave(m) !== k));
    setApagadas((a) => new Set([...a].filter((x) => x !== k)));
    anunciar(rellenar(tx(FP.medidaQuitada, lang), { m: k.replace("x", "×") }));
  };
  const restablecerMedidas = () => {
    setLista(LISTA_DIDI);
    setApagadas(new Set());
    anunciar(tx(FP.medidasRestablecidas, lang));
  };
  /** `soloEstas`: las pegadas quedan prendidas y todas las demás se apagan (lo que antes hacía «Usar estas medidas»).
   *  Devuelve lo que hay que enseñar junto al campo (null = todo bien). */
  const agregarMedidas = (texto: string, soloEstas: boolean): { mal: boolean; texto: string } | null => {
    const r = leerMedidas(texto);
    const limites = r.fuera.length ? rellenar(tx(FP.listaFuera, lang), { min: LADO_MIN, max: LADO_MAX, m: r.fuera.join(", ") }) : "";
    if (!r.medidas.length) return { mal: true, texto: limites || tx(FX.pegarNada, lang) };
    const ya = new Set(lista.map(clave));
    const nuevas = r.medidas.filter((m) => !ya.has(clave(m))).map((m) => ({ ...m, propia: true }));
    const pedidas = new Set(r.medidas.map(clave));
    const todas = [...lista, ...nuevas];
    const apagadasLuego = soloEstas ? new Set(todas.map(clave).filter((k) => !pedidas.has(k))) : new Set([...apagadas].filter((k) => !pedidas.has(k)));
    setLista(todas);
    setApagadas(apagadasLuego);
    const { fuera } = medidasQueCaben(todas.filter((m) => !apagadasLuego.has(clave(m))));
    const hecho = soloEstas
      ? rellenar(tx(FP.soloEstasHecho, lang), { n: pedidas.size })
      : nuevas.length === 1
        ? tx(FP.agregadaUna, lang)
        : nuevas.length
          ? rellenar(tx(FP.agregadas, lang), { n: nuevas.length })
          : tx(FP.agregadasYa, lang);
    const notas = [fuera ? rellenar(tx(FP.listaTope, lang), { n: fuera, max: MEDIDAS_MAX }) : "", limites].filter(Boolean).join(" ");
    anunciar([hecho, notas].filter(Boolean).join(" "));
    return notas ? { mal: false, texto: notas } : null;
  };

  const registrar = useCallback((k: string, l: HTMLCanvasElement | null) => {
    if (l) lienzos.current.set(k, l);
    else lienzos.current.delete(k);
  }, []);
  const voltear = useCallback(
    (m: Medida, a: Lado) => {
      setLados((p) => ({ ...p, [clave(m)]: a }));
      anunciar(`${etiqueta(m)}: ${tx(a === "izquierda" ? FP.heroIzquierda : FP.heroDerecha, lang)}`);
    },
    [anunciar, lang],
  );
  const elegirContraste = useCallback((m: Medida, e: EleccionContraste) => setContrastes((p) => ({ ...p, [clave(m)]: e })), []);

  // Cada texto se prueba contra Photoshop con las tipografías cargadas; sólo los que coinciden se vuelven a escribir.
  // La prueba va FUERA del pintado de la pantalla (dibuja en un canvas; si algo falla no la tumba). Mientras
  // corre, las tarjetas siguen con la prueba anterior del MISMO PSD y sus tipografías: nada se repinta dos veces.
  useEffect(() => {
    const l = leido;
    if (!l?.maestros.length) return;
    const reloj = window.setTimeout(() => {
      let e: Escritura | null = null;
      try {
        if (tipos.size) e = revisarTextos(l.maestros, tipos);
      } catch (err) {
        console.error("[formatos-psd] probar textos", err);
      }
      if (vivo.current) setPrueba({ leido: l, tipos, e });
    }, 0);
    return () => window.clearTimeout(reloj);
  }, [leido, tipos]);
  const vigente = prueba && prueba.leido === leido ? prueba : null;
  const escritura = vigente?.e ?? null;
  const tiposEscritos = vigente?.tipos ?? SIN_TIPOS;
  const probando = tipos.size > 0 && vigente?.tipos !== tipos;
  const revisiones = escritura?.revisiones ?? [];
  const escritos = revisiones.filter((r) => r.ok).length;
  const faltanFuentes = useMemo(
    () => [...new Set((leido?.maestros ?? []).flatMap((m) => m.piezas.flatMap((p) => p.textos.flatMap((t) => t.texto.tramos.map((r) => r.fuente)))))].filter((f) => f && !tipos.has(f)),
    [leido, tipos],
  );
  // Lo que le falta al PSD se pide a Greenlight UNA vez por PSD y cliente: las que un admin guardó en Admin › Marcas
  // (las exclusivas, sólo si se eligió su cliente) y, si no están, las gratuitas de Google Fonts. Espera a las
  // recordadas en este navegador (con ellas casi nunca falta nada y no se pregunta). Llegan por el mismo camino que
  // soltarlas: mismos topes y misma prueba contra Photoshop (pero éstas no se recuerdan en el navegador).
  const pedirTipografias = useEffectEvent(async (l: Leido, c: string) => {
    if (pedidasPara.current?.l === l && pedidasPara.current.c === c) return;
    pedidasPara.current = { l, c };
    if (!faltanFuentes.length) return setResueltoPara(l);
    // Lo que termina tarde sólo cuenta si ese PSD sigue en pantalla con el mismo cliente (otro PSD u otro cliente
    // hacen su propio pedido).
    const sigue = () => vivo.current && leidoVigente.current === l && clienteVigente.current === c;
    setTrayendo((n) => n + 1);
    try {
      const r = await Promise.race([
        tipografiasDelPsd(faltanFuentes, c || null),
        new Promise<never>((_, no) => window.setTimeout(() => no(new Error("Greenlight no respondió")), PEDIDO_MS)),
      ]);
      if (!sigue()) return;
      if (!r.ok) return avisarFuentes({ nuevas: 0, malas: [], greenlightNo: true });
      setAjenas(r.ajenas.length ? { leido: l, cliente: c, lista: r.ajenas } : null);
      const extra = r.ajenas.map((a) => textoAjenas(a, lang)).join(" ");
      if (!r.tipografias.length) return void (extra && anunciar(extra));
      // Cada archivo por su lado: uno que falle (enlace vencido, red) no tumba a los demás; se nombra.
      const bajadas = await Promise.allSettled(
        r.tipografias.map(async (t) => {
          const res = await fetch(t.url, { signal: AbortSignal.timeout(GREENLIGHT_MS) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          // El nombre lleva la extensión de sus bytes (la que revisa elegirFuentes), aunque al subirlo no la trajera.
          return new File([await res.blob()], t.archivo.toLowerCase().endsWith(`.${t.ext}`) ? t.archivo : `${t.archivo}.${t.ext}`);
        }),
      );
      if (!sigue()) return;
      const archivos = bajadas.flatMap((b) => (b.status === "fulfilled" ? [b.value] : []));
      const fallaron = r.tipografias.filter((_, i) => bajadas[i].status === "rejected").map((t) => t.archivo);
      if (fallaron.length) console.error("[formatos-psd] tipografías de Greenlight que no bajaron", fallaron, bajadas.filter((b) => b.status === "rejected"));
      const de = [...new Set(r.tipografias.map((t) => t.cliente).filter(Boolean))].join(", ");
      if (!archivos.length) return avisarFuentes({ nuevas: 0, malas: [], greenlightNo: true });
      // Las exclusivas se anotan ANTES de cargarlas (sólo los nombres que no había): si se cambia de cliente mientras
      // cargan, el cambio ya las encuentra y las suelta.
      for (const [i, t] of r.tipografias.entries()) {
        if (!t.exclusivaDe || bajadas[i].status !== "fulfilled") continue;
        for (const n of t.nombres) if (!tiposVigentes.current.has(n)) deExclusiva.current.set(n, t.exclusivaDe);
      }
      await agregarFuentes(archivos, { de, noBajaron: fallaron, vigente: sigue, extra });
    } catch (err) {
      console.error("[formatos-psd] tipografías de Greenlight", err);
      if (sigue()) avisarFuentes({ nuevas: 0, malas: [], greenlightNo: true });
    } finally {
      if (vivo.current) {
        setTrayendo((n) => n - 1);
        setResueltoPara((p) => (leidoVigente.current === l && clienteVigente.current === c ? l : p));
      }
    }
  });
  /**
   * Cambiar de cliente: se sueltan las tipografías que llegaron por ser exclusivas de OTRO cliente (DiDi Sans Pro deja
   * de usarse si ya no es DiDi) y se vuelve a pedir lo que le falte al PSD en pantalla, ahora con el cliente nuevo.
   */
  const elegirCliente = (c: string) => {
    clienteVigente.current = c;
    setCliente(c);
    const fuera = [...deExclusiva.current].filter(([, de]) => de !== c).map(([n]) => n);
    if (fuera.length) {
      for (const n of fuera) deExclusiva.current.delete(n);
      setTipos((antes) => new Map([...antes].filter(([n]) => !fuera.includes(n))));
      setNotaFuentes(null);
      anunciar(rellenar(tx(FP.clienteSoltadas, lang), { f: unos(fuera) }));
    }
    setResueltoPara(null);
    setAjenas(null);
  };
  // Lo que falta y es exclusivo de OTRO cliente se dice aparte ("elige DiDi arriba"); pedírselo a un admin no sirve.
  const deOtroCliente = (ajenas?.leido === leido && ajenas.cliente === cliente ? ajenas.lista : [])
    .map((a) => ({ cliente: a.cliente, nombres: a.nombres.filter((n) => faltanFuentes.includes(n)) }))
    .filter((a) => a.nombres.length);
  const faltanOtras = faltanFuentes.filter((n) => !deOtroCliente.some((a) => a.nombres.includes(n)));
  useEffect(() => {
    leidoVigente.current = leido;
    tiposVigentes.current = tipos;
  }, [leido, tipos]);
  useEffect(() => {
    const l = leido;
    if (!l?.maestros.length || !recordadasListas) return;
    // Fuera del efecto (como la prueba de textos): el aviso de "trayendo" no se pinta en el mismo paso.
    const reloj = window.setTimeout(() => void pedirTipografias(l, cliente), 0);
    return () => window.clearTimeout(reloj);
  }, [leido, recordadasListas, cliente, otraVez]);
  // El mismo texto suele venir en varias mesas: una línea por texto y motivo, con las medidas de sus mesas.
  const comoImagen = [
    ...revisiones
      .filter((r) => !r.ok && !r.faltan.length)
      .reduce((g, r) => {
        const ma = leido?.maestros[r.maestro];
        const mesa = ma ? `${ma.w}×${ma.h}` : "";
        const k = `${r.capa}\n${r.motivo}`;
        const v = g.get(k);
        if (!v) g.set(k, { capa: r.capa, motivo: r.motivo, mesas: [mesa] });
        else if (!v.mesas.includes(mesa)) v.mesas.push(mesa);
        return g;
      }, new Map<string, { capa: string; motivo: string | null; mesas: string[] }>())
      .values(),
  ];

  // Lo editado de cada medida (con el lado y el canal de ahora): lo de esta sesión y, si no, lo que quedó guardado en
  // este navegador de este mismo PSD. La sesión se guarda por medida + contexto; la vista, por medida.
  const edicionesVista = useMemo(() => {
    const mapa = new Map<string, Edicion | null>();
    const deSesion = ediciones?.leido === leido ? ediciones.mapa : null;
    if (!leido || !maestrosVista.length) return mapa;
    for (const m of medidas) {
      const ctx = contextoEdicion(m, lados[clave(m)], canal), c = `${clave(m)}:${ctx}`;
      const ma = maestrosVista[elegirMaestro(maestrosVista, m.w, m.h)];
      if (deSesion?.has(c)) mapa.set(clave(m), deSesion.get(c) ?? null);
      else mapa.set(clave(m), edicionGuardada(leido.archivo, ma, m.w, m.h, ctx) ?? edicionGuardada(leido.archivo, ma, m.w, m.h, ctx + CONTEXTO_VIEJO));
    }
    return mapa;
  }, [ediciones, leido, maestrosVista, medidas, lados, canal]);
  const abrirEditor = useCallback((m: Medida) => setEditando(m), []);
  const guardarEditada = (m: Medida, ed: Edicion | null) => {
    const l = leido;
    setEditando(null);
    if (!l || !maestrosVista.length) return;
    const ctx = contextoEdicion(m, lados[clave(m)], canal), ma = maestrosVista[elegirMaestro(maestrosVista, m.w, m.h)];
    const guardada = guardarEdicion(l.archivo, ma, m.w, m.h, ctx, ed);
    // Lo guardado con la clave vieja se borra: si no, «Volver al automático» lo dejaría volver a aparecer.
    guardarEdicion(l.archivo, ma, m.w, m.h, ctx + CONTEXTO_VIEJO, null);
    setEdiciones((antes) => ({ leido: l, mapa: new Map([...(antes?.leido === l ? antes.mapa : []), [`${clave(m)}:${ctx}`, ed]]) }));
    if (!guardada && ed) return void toast.warning(rellenar(tx(FP.editorSoloSesion, lang), { m: etiqueta(m) }));
    anunciar(rellenar(tx(ed ? FP.editorGuardado : FP.editorAutoHecho, lang), { m: etiqueta(m) }));
  };
  // Lo que el editor necesita, calculado una vez por medida abierta (no en cada pintada de la página: una zona o un
  // texto nuevos lo harían repintar la vista entera).
  const paraEditor = useMemo(() => {
    if (!editando || !leido || !maestrosVista.length) return null;
    const m = editando, mi = elegirMaestro(maestrosVista, m.w, m.h), zona = zonaCanal(canal, m.w, m.h);
    return {
      m,
      mi,
      zona,
      // Con su arreglo de contraste: el editor parte de lo que se ve en la tarjeta (fondo movido o sombra incluidos).
      auto: revisarMedida(maestrosVista, m.w, m.h, { heroLado: lados[clave(m)], zona, contraste: contrastes[clave(m)] }).acomodo,
      texto: textoEscrito(escritura, mi, maestrosVista[mi], tiposEscritos),
    };
  }, [editando, leido, maestrosVista, canal, lados, contrastes, escritura, tiposEscritos]);

  // El mismo acomodo y los mismos avisos que cada tarjeta (`revisarMedida` guarda lo ya hecho): aquí sirven para el
  // resumen, el legal y los nombres del ZIP.
  const filas = useMemo(
    () =>
      maestrosVista.length
        ? medidas.map((m) => ({
            m,
            ...revisarMedida(maestrosVista, m.w, m.h, { heroLado: lados[clave(m)], zona: zonaCanal(canal, m.w, m.h), contraste: contrastes[clave(m)], edicion: edicionesVista.get(clave(m)) ?? null }),
          }))
        : [],
    [maestrosVista, medidas, lados, canal, contrastes, edicionesVista],
  );
  const porRevisar = filas.filter((f) => f.acomodo.avisos.length).length;
  const volteables = filas.filter((f) => sePuedeVoltear(f.acomodo.familia) && !f.acomodo.editada);
  const n916 = medidas.filter((m) => es916(m.w, m.h)).length;
  const elegirCanal = (v: Canal | null) => {
    setCanal(v);
    if (v) anunciar(n916 ? rellenar(tx(FP.zonaMarcadas, lang), { c: CANALES[v].nombre, n: n916 }) : tx(FP.zonaSin916, lang));
  };
  // El legal es obligatorio (CAT de una tarjeta) y nunca se quita: las medidas donde queda chico se dicen junto al ZIP,
  // no sólo en su tarjeta.
  const legalChico = filas
    .filter((f) => f.acomodo.letras.some((l) => maestrosVista[f.maestro]?.piezas[l.pieza]?.rol === "FOOTER" && l.px < LETRA_MIN_PX))
    .map((f) => etiqueta(f.m));
  const voltearTodas = () => {
    setLados((p) => ({ ...p, ...Object.fromEntries(volteables.map((f) => [clave(f.m), p[clave(f.m)] === "izquierda" ? "derecha" : "izquierda"])) }));
    anunciar(rellenar(tx(FP.voltearTodasHecho, lang), { n: volteables.length }));
  };
  const notasArchivo = leido ? [...leido.descartadas.map((d) => rellenar(tx(FP.mesaNoUsada, lang), { n: d.nombre || tx(FP.sinNombre, lang), m: d.motivos.join(" · ") })), ...leido.avisos, ...usables.flatMap((m) => m.avisos.map((a) => `${m.w}×${m.h}: ${a}`))] : [];

  const bajarZip = async () => {
    if (!leido || zipeando || !filas.length) return;
    setZipeando(true);
    try {
      // Las vistas se pintan una por vuelta (al abrir, al voltear, al sumar tipografías): se espera a la última.
      await colaVacia();
      if (!vivo.current) return;
      const con = filas.map((f) => ({ nombre: archivoDe(leido.maestros[f.maestro], f.m), lienzo: lienzos.current.get(clave(f.m)) }));
      const faltan = con.filter((c) => !c.lienzo).length;
      // Un ZIP incompleto que diga "listo" es peor que no entregarlo.
      if (faltan) return void toast.error(rellenar(tx(FP.zipIncompleto, lang), { n: faltan }));
      // `toBlob` toma la foto del lienzo al llamarse: se piden TODAS en este mismo instante, antes de esperar a
      // ninguna, así un volteo o un cambio de lista a media descarga no mezcla estados.
      const pngs = await Promise.all(con.map((c) => aPng(c.lienzo as HTMLCanvasElement)));
      const archivos: Record<string, Uint8Array> = {};
      for (const [i, c] of con.entries()) {
        let nombre = c.nombre;
        for (let n = 2; nombre in archivos; n++) nombre = c.nombre.replace(/\.png$/, `-${n}.png`);
        archivos[nombre] = new Uint8Array(await pngs[i].arrayBuffer());
      }
      if (!vivo.current) return;
      // PNG ya viene comprimido: se guarda tal cual.
      descargar(new Blob([zipSync(archivos, { level: 0 }) as BlobPart], { type: "application/zip" }), `${limpiarNombre(sinExtension(leido.archivo), NOMBRE_ZIP_MAX)}_formatos.zip`);
      toast.success(tx(FX.zipListo, lang));
    } catch (err) {
      console.error("[formatos-psd] zip", err);
      toast.error(tx(FP.bajarFallo, lang));
    } finally {
      setZipeando(false);
    }
  };

  const notasTxt = notasArchivo.length === 1 ? tx(FP.notasUna, lang) : notasArchivo.length ? rellenar(tx(FP.notasN, lang), { n: notasArchivo.length }) : "";
  const resumen = filas.length
    ? [porRevisar ? rellenar(tx(FP.resumenRevisar, lang), { n: filas.length, r: porRevisar }) : rellenar(tx(FP.resumenOk, lang), { n: filas.length }), notasTxt].filter(Boolean).join(" · ")
    : "";
  const textoAvance = avance && avance.de > 0 && avance.mesa > 0 ? rellenar(tx(FP.leyendoMesa, lang), { m: avance.mesa, n: avance.de }) : tx(FP.leyendo, lang);
  /** El motor y el archivo hablan español: con la pantalla en inglés esos textos se marcan como español. */
  const delMotor = lang === "en" ? "es" : undefined;

  /** El cliente decide qué tipografías exclusivas se pueden usar. `conAyuda`: la explicación a la vista (sin PSD) o
   *  sólo para lector de pantalla y al pasar el mouse (en el panel, donde ya se entiende). */
  const selectorCliente = (conAyuda: boolean) =>
    clientes.length > 0 && (
      <div className={conAyuda ? "mb-4" : "flex items-center gap-2"}>
        <label htmlFor="psd-cliente" className={cn("text-sm font-medium text-foreground", conAyuda && "block")}>
          {tx(FP.cliente, lang)}
        </label>
        <select
          id="psd-cliente"
          value={cliente}
          onChange={(e) => elegirCliente(e.target.value)}
          aria-describedby="psd-cliente-ayuda"
          title={conAyuda ? undefined : tx(FP.clienteAyuda, lang)}
          className={cn(
            "h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:text-base",
            conAyuda ? "mt-1 block w-full max-w-xs" : "min-w-36",
          )}
        >
          <option value="">{tx(FP.sinCliente, lang)}</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <p id="psd-cliente-ayuda" className={conAyuda ? "mt-1 max-w-2xl text-xs text-muted-foreground" : "sr-only"}>
          {tx(FP.clienteAyuda, lang)}
        </p>
      </div>
    );

  // Tipografías en un chip (Pedro: "if we already selected didi it should just said didis typofrafies loaded"). Mientras
  // se traen o se prueban, lo dice; si falta alguna, en ámbar; si no, "cargadas" y cuántos textos salen nítidos.
  const nombreCliente = clientes.find((c) => c.id === cliente)?.nombre ?? "";
  const tiposOcupado = trayendo > 0 || cargandoFuentes > 0 || probando || (faltanFuentes.length > 0 && resueltoPara !== leido);
  const nitidos = rellenar(tx(FP.tiposNitidos, lang), { n: escritos, m: totalTextos });
  const chipTipos: { tono: "ok" | "aviso" | "neutro"; icono: ReactNode; texto: string } = tiposOcupado
    ? { tono: "neutro", icono: <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />, texto: tx(trayendo > 0 ? FP.textoTrayendo : cargandoFuentes > 0 ? FP.textoCargando : FP.textoProbando, lang) }
    : faltanFuentes.length > 0
      ? {
          tono: "aviso",
          icono: <AlertTriangle className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" />,
          texto: [faltanFuentes.length === 1 ? tx(FP.tiposFaltaUna, lang) : rellenar(tx(FP.tiposFaltan, lang), { n: faltanFuentes.length }), tipos.size ? nitidos : ""].filter(Boolean).join(" · "),
        }
      : !tipos.size
        ? { tono: "neutro", icono: <Type className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />, texto: tx(FP.tiposSin, lang) }
        : { tono: "ok", icono: <CircleCheck className="size-3.5 shrink-0 text-status-completed" aria-hidden="true" />, texto: `${nombreCliente ? rellenar(tx(FP.tiposDe, lang), { c: nombreCliente }) : tx(FP.tiposCargadas, lang)} · ${nitidos}` };
  /** Las piezas repetidas que se ven en alguna medida prendida, con en cuántas (antes de quitarla: dos veces; después:
   *  el relleno). Una ya quitada se queda aunque no se vea, para poder deshacerla. */
  const copiasEnVista = copiasVista.flatMap((c) => {
    const n = filas.filter((f) => f.maestro === c.i && f.acomodo.avisos.some((a) => a.tipo === "copia" || a.tipo === "retoque")).length;
    return n || c.quitada ? [{ ...c, n }] : [];
  });
  /** ¿Queda algo por hacer en «En varias medidas»? (Si todo se arregló, el panel se queda, sin el ámbar.) */
  const variasPendiente = copiasEnVista.some((c) => !c.quitada) || legalChico.length > 0;

  return (
    <div lang={lang} className="prisma-root mx-auto max-w-7xl">
      {/* Un solo anuncio para lectores de pantalla: el avance de la lectura, lo último que se hizo, o el resumen. Al
          abrirse el elegidor el foco ya lee su título: aquí no se repite. */}
      {paraEditor && (
        <EditorMedida
          key={`${clave(paraEditor.m)}:${paraEditor.mi}`}
          ma={maestrosVista[paraEditor.mi]}
          W={paraEditor.m.w}
          H={paraEditor.m.h}
          auto={paraEditor.auto}
          inicial={edicionesVista.get(clave(paraEditor.m)) ?? null}
          zona={paraEditor.zona}
          nombre={etiqueta(paraEditor.m)}
          texto={paraEditor.texto}
          lang={lang}
          alGuardar={(ed) => guardarEditada(paraEditor.m, ed)}
          alCerrar={() => setEditando(null)}
        />
      )}
      <p role="status" className="sr-only">
        {leyendo ? textoAvance : aviso ? `${aviso.texto}${aviso.n % 2 ? "​" : ""}` : eligiendo ? "" : resumen}
      </p>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/prisma" className={cn("mb-2 inline-flex min-h-9 items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11", FOCO)}>
            <ArrowLeft className="size-4" aria-hidden="true" /> {tx(FX.volver, lang)}
          </Link>
          <h1 className="font-heading text-[34px] font-bold leading-none tracking-tight text-foreground md:text-[44px]">
            HÜE <span className="p-spectrum-text">{tx(FX.titulo, lang)}</span>
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">{tx(FP.tagline, lang)}</p>
        </div>
        <button
          type="button"
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          lang={lang === "es" ? "en" : "es"}
          className={cn("inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary pointer-coarse:min-h-11", FOCO)}
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          <Languages className="size-3.5" aria-hidden="true" /> {lang === "es" ? "EN" : "ES"}
        </button>
      </div>

      {/* Sin PSD el cliente va arriba del cuadro (con su ayuda a la vista); con PSD, en el panel de ajustes. */}
      {(eleccion || !usables.length) && selectorCliente(true)}

      {eleccion ? (
        <section className="p-enter max-w-2xl" aria-labelledby="psd-elegir-titulo">
          <div className="rounded-2xl border border-border bg-card/50 px-5 py-5">
            <h2 id="psd-elegir-titulo" ref={tituloElegir} tabIndex={-1} className="text-base font-medium text-foreground outline-none">
              {rellenar(tx(FP.elegirTitulo, lang), { n: eleccion.mesas.length })}
            </h2>
            <p id="psd-elegir-ayuda" className="text-sm text-muted-foreground">
              {rellenar(tx(FP.elegirAyuda, lang), { max: MESAS_MAX })}
            </p>
            <fieldset className="mt-3" aria-describedby="psd-elegir-ayuda">
              <legend className="sr-only">{tx(FP.elegirLeyenda, lang)}</legend>
              <ul className="max-h-96 space-y-0.5 overflow-y-auto">
                {eleccion.mesas.map((m, i) => {
                  const on = eleccion.marcadas.includes(i);
                  return (
                    <li key={i}>
                      <label className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-secondary/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 pointer-coarse:min-h-11">
                        {/* Nombre explícito: el texto de la etiqueta pega el nombre y la medida ("…_A540×960"). */}
                        <input
                          type="checkbox"
                          lang={m.nombre ? delMotor : undefined}
                          aria-label={`${m.nombre || tx(FP.sinNombre, lang)}, ${etiqueta(m)}`}
                          className={cn("size-4 shrink-0 accent-primary", FOCO)}
                          checked={on}
                          disabled={!on && eleccion.marcadas.length >= MESAS_MAX}
                          onChange={() => marcar(i)}
                        />
                        <span lang={delMotor} className="min-w-0 break-words text-sm text-foreground">
                          {m.nombre || tx(FP.sinNombre, lang)}
                        </span>
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{etiqueta(m)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            {!eleccion.marcadas.length && (
              <p id="psd-elegir-ninguna" className="mt-3 flex items-center gap-1.5 text-sm text-foreground">
                <AlertTriangle className="size-4 shrink-0 text-status-warning" aria-hidden="true" /> {tx(FP.elegirNinguna, lang)}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {/* aria-disabled, no disabled: el botón conserva el foco y dice por qué no hace nada. */}
              <Button
                size="lg"
                className={cn(BOTON, "aria-disabled:cursor-not-allowed aria-disabled:opacity-60")}
                onClick={leerElegidas}
                aria-disabled={!eleccion.marcadas.length || undefined}
                aria-describedby={eleccion.marcadas.length ? undefined : "psd-elegir-ninguna"}
              >
                <FileUp className="size-4" aria-hidden="true" /> {rellenar(tx(FP.elegirLeer, lang), { n: eleccion.marcadas.length })}
              </Button>
              <Button variant="outline" size="lg" className={BOTON} onClick={cancelar}>
                <X className="size-4" aria-hidden="true" /> {tx(FP.cancelar, lang)}
              </Button>
            </div>
          </div>
        </section>
      ) : !usables.length ? (
        <section className="p-enter max-w-2xl space-y-3" aria-label={tx(FP.subir, lang)}>
          {/* <label>, no <button>: mismo patrón que la puerta de imagen plana (el input de archivo vive adentro).
              El archivo soltado lo recibe la página entera (arriba); aquí sólo se pinta el "suéltalo". */}
          <label
            onDragOver={() => setOver(true)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-dashed px-5 py-8 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              over ? "border-primary bg-primary/8" : "border-border bg-card/50 hover:border-primary",
              leyendo && "cursor-wait",
            )}
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              {leyendo ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <FileUp className="size-5" aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span id="psd-subir-titulo" className="block text-base font-medium text-foreground">
                {leyendo ? textoAvance : tx(FP.subir, lang)}
              </span>
              <span id="psd-subir-ayuda" className="block text-sm text-muted-foreground">
                {leyendo ? tx(FP.leyendoAyuda, lang) : `${tx(FP.subirAyuda, lang)} ${tx(FP.subirTipos, lang)}`}
              </span>
            </span>
            <input
              ref={entrada}
              type="file"
              accept=".psd,image/vnd.adobe.photoshop"
              className="sr-only"
              aria-labelledby="psd-subir-titulo"
              aria-describedby={falla ? "psd-subir-ayuda psd-subir-error" : "psd-subir-ayuda"}
              disabled={leyendo}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) void abrir(archivo);
              }}
            />
          </label>
          {leyendo && (
            <Button ref={botonCancelar} variant="outline" size="lg" className={BOTON} onClick={cancelar}>
              <X className="size-4" aria-hidden="true" /> {tx(FP.cancelar, lang)}
            </Button>
          )}
          {falla && (
            <div id="psd-subir-error" role="alert" className="flex items-start gap-1.5 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p>{tx(FP_ERROR[falla.clave], lang)}</p>
                {/* El detalle suele traer el "Qué hacer": se lee con el mismo peso que el error, no como nota al pie. */}
                {falla.detalle && (
                  <p lang={delMotor} className="mt-1 break-words text-sm text-foreground">
                    {falla.detalle}
                  </p>
                )}
                {notasArchivo.map((n, i) => (
                  <p key={i} lang={delMotor} className="mt-0.5 break-words text-xs text-muted-foreground">
                    {n}
                  </p>
                ))}
              </div>
            </div>
          )}
          {planaActiva && (
            <Link href="/prisma/formatos" className={cn("inline-flex min-h-9 items-center rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-coarse:min-h-11", FOCO)}>
              {tx(FP.planaLink, lang)}
            </Link>
          )}
        </section>
      ) : (
        <div className="space-y-4">
          {/* Ajustes (rediseño B19): todo lo que cambia el resultado, arriba y en un solo panel que se lee de un vistazo.
              Antes era una columna de 300 px con su propio scroll donde la mitad quedaba escondida. */}
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <FileImage className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 text-sm">
                  <span className="font-medium break-all text-foreground">{leido?.archivo}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {usables.length === 1 ? tx(FP.mesasUna, lang) : rellenar(tx(FP.mesas, lang), { n: usables.length })}: {usables.map((m) => `${m.w}×${m.h}`).join(", ")}
                  </span>
                </p>
                <Button variant="outline" className={BOTON_TARJETA} onClick={cambiarPsd}>
                  <FileUp className="size-3.5" aria-hidden="true" /> {tx(FP.cambiar, lang)}
                </Button>
              </div>
              {selectorCliente(false)}
            </div>
            <div className="py-3">
              <PastillasMedidas lista={lista} apagadas={apagadas} sinLugar={sinLugar} lang={lang} alAlternar={alternarMedida} alQuitar={quitarMedida} alAgregar={agregarMedidas} alRestablecer={restablecerMedidas} />
            </div>
            <div className="py-3">
              <PastillasCanal canal={canal} n916={n916} detalle={canal && n916 ? cifrasCanal(canal, lang) : ""} lang={lang} alElegir={elegirCanal} />
            </div>
            {(totalTextos > 0 || fueraDeGuia.length > 0 || notasArchivo.length > 0) && (
              <div className="flex flex-wrap gap-2 py-3">
                {totalTextos > 0 && (
                  <ChipEstado
                    tono={chipTipos.tono}
                    icono={chipTipos.icono}
                    titulo="psd-texto-titulo"
                    lang={lang}
                    detalle={
                      <div>
                        <h2 id="psd-texto-titulo" className="text-sm font-semibold text-foreground">
                          {tx(FP.textoTitulo, lang)}
                        </h2>
                        {/* Vivo: al sumar tipografías el resultado cambia aquí, y se anuncia. */}
                        <p aria-live="polite" className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                          {(probando || trayendo > 0) && <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                          {trayendo > 0 ? tx(FP.textoTrayendo, lang) : probando ? tx(FP.textoProbando, lang) : tipos.size ? rellenar(tx(FP.textoEstado, lang), { n: escritos, m: totalTextos }) : tx(FP.textoSinFuentes, lang)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{tx(FP.textoAyuda, lang)}</p>
                        {faltanOtras.length > 0 && !trayendo && resueltoPara === leido && (
                          <p className="mt-1 break-words text-xs text-foreground">
                            {tx(FP.textoFaltan, lang)} {unos(faltanOtras)}. <span className="text-muted-foreground">{tx(FP.textoFaltanAdmin, lang)}</span>
                          </p>
                        )}
                        {!trayendo &&
                          resueltoPara === leido &&
                          deOtroCliente.map((a) => (
                            <p key={a.cliente} className="mt-1 flex items-start gap-1.5 break-words text-xs text-foreground">
                              <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              {textoAjenas(a, lang)}
                            </p>
                          ))}
                        {comoImagen.length > 0 && (
                          <>
                            <p id="psd-texto-imagen" className="mt-2 text-xs font-medium text-foreground">
                              {tx(FP.textoComoImagen, lang)}
                            </p>
                            <ul aria-labelledby="psd-texto-imagen" className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-foreground">
                              {comoImagen.map((r, i) => (
                                <li key={i} className="break-words">
                                  <span lang={delMotor} title={r.capa.length > CAPA_MAX ? r.capa : undefined}>
                                    «{corto(r.capa)}»
                                  </span>{" "}
                                  ({rellenar(tx(r.mesas.length > 1 ? FP.textoMesas : FP.textoMesa, lang), { m: r.mesas.join(", ") })}): <span lang={delMotor}>{r.motivo}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {notaFuentes && (
                          <p role={notaMala(notaFuentes) ? "alert" : undefined} className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
                            {notaMala(notaFuentes) && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />} {textoNotaFuentes(notaFuentes, lang)}
                          </p>
                        )}
                        <Button
                          ref={botonAgregar}
                          variant="outline"
                          size="lg"
                          className={cn("mt-2 w-full aria-disabled:cursor-wait", BOTON)}
                          onClick={() => cargandoFuentes > 0 || entradaFuentes.current?.click()}
                          aria-disabled={cargandoFuentes > 0 || undefined}
                          aria-busy={cargandoFuentes > 0}
                        >
                          {cargandoFuentes > 0 ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Type className="size-4" aria-hidden="true" />}
                          {tx(cargandoFuentes > 0 ? FP.textoCargando : FP.textoAgregar, lang)}
                        </Button>
                        {tipos.size > 0 && (
                          <button type="button" onClick={olvidar} className={cn("mt-2 min-h-9 w-full cursor-pointer rounded-md text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground pointer-coarse:min-h-11", FOCO)}>
                            {tx(FP.textoOlvidar, lang)}
                          </button>
                        )}
                      </div>
                    }
                  >
                    {chipTipos.texto}
                  </ChipEstado>
                )}
                {fueraDeGuia.length > 0 && (
                  <ChipEstado
                    // Ámbar hasta que la persona revise alguna; ya revisadas, la palomita y la palabra lo dicen (no sólo el color).
                    tono={elegidos?.size ? "neutro" : "aviso"}
                    icono={elegidos?.size ? <CircleCheck className="size-3.5 shrink-0 text-status-completed" aria-hidden="true" /> : <Folder className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" />}
                    titulo="psd-carpetas-titulo"
                    lang={lang}
                    detalle={
                      <fieldset aria-describedby="psd-carpetas-ayuda">
                        <legend id="psd-carpetas-titulo" className="text-sm font-semibold text-foreground">{tx(FP.carpetasTitulo, lang)}</legend>
                        <p id="psd-carpetas-ayuda" className="mt-0.5 text-xs text-muted-foreground">
                          {tx(FP.carpetasAyuda, lang)}
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {fueraDeGuia.map(([nombre, rol], i) => (
                            <li key={nombre} className="flex items-center gap-2">
                              <label htmlFor={`psd-carpeta-${i}`} className="min-w-0 flex-1 truncate text-sm text-foreground" title={nombre}>
                                <span lang={delMotor}>«{nombre}»</span>
                              </label>
                              <select
                                id={`psd-carpeta-${i}`}
                                value={rol ?? ""}
                                onChange={(e) => elegirPapel(nombre, (e.target.value || null) as Rol | null)}
                                className="h-9 w-44 shrink-0 cursor-pointer rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:text-base"
                              >
                                {PAPELES.map((p) => (
                                  <option key={p} value={p}>
                                    {tx(FP_PAPEL[p || "NINGUNO"], lang)}
                                  </option>
                                ))}
                              </select>
                            </li>
                          ))}
                        </ul>
                      </fieldset>
                    }
                  >
                    {fueraDeGuia.length === 1 ? tx(FP.carpetasChipUna, lang) : rellenar(tx(FP.carpetasChip, lang), { n: fueraDeGuia.length })}
                    {elegidos?.size ? tx(FP.carpetasRevisadas, lang) : ""}
                  </ChipEstado>
                )}
                {notasArchivo.length > 0 && (
                  <ChipEstado
                    tono="aviso"
                    icono={<AlertTriangle className="size-3.5 shrink-0 text-status-warning" aria-hidden="true" />}
                    titulo="psd-notas"
                    lang={lang}
                    detalle={
                      <div>
                        <h2 id="psd-notas" className="text-sm font-semibold text-foreground">
                          {tx(FP.avisosDelArchivo, lang)}
                        </h2>
                        <ul aria-labelledby="psd-notas" lang={delMotor} className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                          {notasArchivo.map((n, i) => (
                            <li key={i} className="break-words">
                              {n}
                            </li>
                          ))}
                        </ul>
                      </div>
                    }
                  >
                    {notasTxt}
                  </ChipEstado>
                )}
              </div>
            )}
          </div>
          {/* Fuera del Popover: así el botón «Agregar tipografías» lo encuentra aunque el detalle se cierre y se abra. */}
          <input
            ref={entradaFuentes}
            type="file"
            multiple
            accept=".otf,.ttf,font/otf,font/ttf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const archivos = [...(e.target.files ?? [])];
              e.target.value = "";
              if (archivos.length) void agregarFuentes(archivos);
            }}
          />

          {/* Lo que se repite en varias medidas se arregla UNA vez aquí (antes, el aviso salía en 11 de 12 tarjetas y el
              botón vivía en la columna de la izquierda). */}
          {(copiasEnVista.length > 0 || legalChico.length > 0) && (
            <section aria-labelledby="psd-varias" className={cn("rounded-xl border px-4 py-3", variasPendiente ? "border-status-warning/40 bg-status-warning/5" : "border-border bg-card")}>
              <h2 id="psd-varias" className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {variasPendiente ? <AlertTriangle className="size-4 shrink-0 text-status-warning" aria-hidden="true" /> : <CircleCheck className="size-4 shrink-0 text-status-completed" aria-hidden="true" />}
                {tx(FP.enVarias, lang)}
                <span className="sr-only">: {tx(variasPendiente ? FP.enVariasPendiente : FP.enVariasListo, lang)}</span>
              </h2>
              <ul className="divide-y divide-border">
                {copiasEnVista.map((c) => {
                  const q = c.quitada;
                  const estimado = `≈ ${usd(COSTO_COPIA_IA_USD, 3)}`;
                  const v = {
                    p: c.nombre,
                    m: deMesa(c.m),
                    pct: String(Math.round(c.parecido * 100)),
                    n: String(c.n),
                    t: String(filas.length),
                    c: q?.metodo === "ia" && q.costoUsd !== null ? usd(q.costoUsd, 3) : estimado,
                    e: estimado,
                  };
                  const trabajando = iaEnCurso === c.i;
                  const g = copias[c.i];
                  // La IA se ofrece desde el principio, junto al gratis (Pedro, 2026-10-15: "i didnt see the ai button
                  // anywhere": sólo salía después de quitar la copia), si cabe un recorte para mandarle.
                  const conBotonIA = iaCopia && !!g && recorteParaIA(c.m, g) !== null;
                  return (
                    <li key={c.i} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-2.5">
                      <div className="min-w-0 flex-1 basis-80">
                        <p className="text-xs font-medium text-muted-foreground">{tx(FP.copiaTitulo, lang)}</p>
                        <p className="break-words text-sm text-foreground">{rellenar(tx(!q ? FP.copiaTexto : q.metodo === "ia" ? FP.copiaQuitadaIA : FP.copiaQuitada, lang), v)}</p>
                        {q?.metodo === "ia" && q.deriva !== null && q.deriva > DERIVA_IA_REVISAR && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> {tx(FP.copiaIaDeriva, lang)}
                          </p>
                        )}
                        {conBotonIA && (
                          <p id={`psd-copia-ia-${c.i}`} className="mt-1 text-xs text-muted-foreground">
                            {rellenar(tx(FP.copiaIaAyuda, lang), v)}
                            {trabajando ? ` ${tx(FP.copiaIaEspera, lang)}` : iaEnCurso !== null ? ` ${tx(FP.copiaIaOtra, lang)}` : ""}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">{tx(FP.copiaAyuda, lang)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <Button
                          id={`psd-copia-btn-${c.i}`}
                          variant={q ? "outline" : "default"}
                          size="lg"
                          className={cn(BOTON, FOCO)}
                          disabled={trabajando}
                          onClick={(e) => {
                            // El segundo clic de un doble clic (detail 2) llega cuando el botón ya cambió: desharía lo que el primero hizo.
                            if (e.detail > 1) return;
                            if (q) devolverCopia(c.i, c.nombre, e.timeStamp);
                            else quitarCopia(c.i, e.timeStamp);
                          }}
                        >
                          {q ? <Undo2 className="size-4" aria-hidden="true" /> : <Eraser className="size-4" aria-hidden="true" />} {tx(q ? FP.copiaDevolver : FP.copiaQuitar, lang)}
                          {/* El nombre que oye el lector empieza con lo que dice el botón (así también lo encuentra el control por voz). */}
                          <span className="sr-only">{rellenar(tx(q ? FP.copiaDevolverSr : FP.copiaQuitarSr, lang), v)}</span>
                        </Button>
                        {conBotonIA && (
                          <Button
                            variant="secondary"
                            size="lg"
                            className={cn(BOTON, FOCO)}
                            aria-disabled={iaEnCurso !== null}
                            aria-busy={trabajando}
                            aria-describedby={`psd-copia-ia-${c.i}`}
                            onClick={(e) => {
                              if (e.detail > 1 || iaEnCurso !== null) return;
                              void rellenarConIA(c.i);
                            }}
                          >
                            {trabajando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}{" "}
                            {trabajando ? tx(FP.copiaIaTrabajando, lang) : rellenar(tx(!q ? FP.copiaIaDirecto : q.metodo === "ia" ? FP.copiaIaOtraVez : FP.copiaIa, lang), v)}
                            <span className="sr-only">{rellenar(tx(FP.copiaQuitarSr, lang), v)}</span>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {/* El legal es obligatorio (CAT de una tarjeta) y nunca se quita: dónde queda chico se dice aquí, no sólo en su tarjeta. */}
                {legalChico.length > 0 && (
                  <li className="flex items-start gap-1.5 py-2.5 text-sm text-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
                    {legalChico.length === 1
                      ? rellenar(tx(FP.legalChicoUna, lang), { m: legalChico[0], px: LETRA_MIN_PX })
                      : rellenar(tx(FP.legalChico, lang), { n: legalChico.length, m: legalChico.join(", "), px: LETRA_MIN_PX })}
                  </li>
                )}
              </ul>
            </section>
          )}

          <section aria-labelledby="psd-resultado" className="min-w-0">
            {/* Pegajosa bajo la barra de la app (h-16): el ZIP y «Voltear todas» siguen a la mano al bajar por las tarjetas. */}
            <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/90 py-2 backdrop-blur-sm">
              <div className="min-w-0">
                <h2 id="psd-resultado" ref={tituloResultado} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
                  {tx(FX.resultados, lang)}
                </h2>
                {resumen && <p className="text-sm text-muted-foreground">{resumen}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {volteables.length > 0 && (
                  <Button variant="outline" size="lg" className={BOTON} onClick={voltearTodas}>
                    <FlipHorizontal2 className="size-4" aria-hidden="true" /> {tx(FP.voltearTodas, lang)}
                  </Button>
                )}
                {filas.length > 0 && (
                  // aria-disabled, no disabled: un botón con foco que se deshabilita suelta el foco al tope de la página.
                  <Button size="lg" className={cn(BOTON, "aria-disabled:opacity-60")} onClick={() => void bajarZip()} aria-disabled={zipeando || undefined} aria-busy={zipeando}>
                    {zipeando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                    {zipeando ? tx(FX.armandoZip, lang) : rellenar(tx(FX.bajarZipN, lang), { n: filas.length })}
                  </Button>
                )}
              </div>
            </div>
            {!medidas.length ? (
              <div role="status" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {tx(FP.medidasNinguna, lang)}
                <Button
                  variant="outline"
                  size="lg"
                  className={BOTON}
                  onClick={() => {
                    restablecerMedidas();
                    // Este botón desaparece con las tarjetas de vuelta: el foco pasa al título de resultados.
                    tituloResultado.current?.focus();
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden="true" /> {tx(FP.medidasRestablecer, lang)}
                </Button>
              </div>
            ) : (
              // Agrupadas por forma, como las pastillas de arriba; dentro de cada grupo, en el orden de la lista.
              FORMAS.map((f) => {
                const grupo = medidas.filter((m) => formaDe(m.w, m.h) === f);
                if (!grupo.length) return null;
                return (
                  <div key={f} className="mb-6">
                    <h3 id={`psd-grupo-${f}`} className="mb-2 text-base font-semibold text-foreground">
                      {tx(NOMBRE_FORMA[f], lang)} <span className="font-normal text-muted-foreground tabular-nums">({grupo.length})</span>
                    </h3>
                    <ul className={cn("grid gap-3", COLUMNAS[f])}>
                      {grupo.map((m) => (
                        <TarjetaMedida key={clave(m)} maestros={maestrosVista} medida={m} lado={lados[clave(m)] ?? "derecha"} canal={canal} escritura={escritura} tipos={tiposEscritos} lang={lang} alVoltear={voltear} registrar={registrar} edicion={edicionesVista.get(clave(m)) ?? null} alEditar={abrirEditor} contraste={contrastes[clave(m)] ?? "auto"} alContraste={elegirContraste} psdOriginal={leido?.psdOriginal ?? null} />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}
    </div>
  );
}
