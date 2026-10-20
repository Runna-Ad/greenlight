"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FolderClosed, FolderOpen, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import {
  aplicarEdicion,
  cambiadasDeCapa,
  leerEdicion,
  ordenDePartes,
  ordenarPuestas,
  parteSinTocar,
  ponerPartes,
  topesParte,
  topesPieza,
  RELLENO_AVISO_PCT,
  type Acomodo,
  type Edicion,
  type Zona,
} from "@/lib/prisma/formatos/acomodo";
import { armarFondo, armarMedida, type TextoEscrito } from "@/lib/prisma/formatos/nitido";
import { avisosDePixeles } from "@/lib/prisma/formatos/revisar";
import { etiquetaPieza } from "@/lib/prisma/formatos/roles";
import { FP, rellenar } from "@/lib/prisma/formatos/copy";
import { DIALOGO_GRANDE, Franjas } from "./vista-grande";
import type { MaestroListo } from "@/lib/prisma/formatos/listo";
import { claveTexto, type CambiosTexto, type PiezaCambiada } from "@/lib/prisma/formatos/cambios-texto";
import { TEXTO_CAMBIADO_MAX } from "@/lib/prisma/formatos/textos";

/**
 * HÜE Prisma › Formatos, puerta PSD — el editor de UNA medida (Pedro, 2026-10-15: "an edit button that opens that
 * specific size asset and you can only either move the elements around and or resize them and the save your changes").
 * Mueve y cambia de tamaño piezas (sin deformarlas) y cambia qué va encima de qué (Pedro, 2026-10-19: "re arrenge
 * layers to move whats on top of what"); el fondo no se toca. Una pieza con subcarpetas se ABRE (doble clic o Enter) y
 * cada parte se mueve sola, pegada a su pieza, y cambia de capa sólo dentro de ella (Pedro, 2026-10-19: "Double-click
 * to open", "Yes, parts stay attached", "Only inside its piece"); Esc o un clic fuera la cierra. La vista se pinta con
 * el mismo `armarMedida` que la tarjeta, pero al tamaño de la pantalla, para que arrastrar no se trabe; la tarjeta
 * vuelve a pintar a tamaño real al guardar. Lo que se guarda es la `Edicion` (sólo lo que cambió); `aplicarEdicion` la
 * revisa.
 */

type Pos = { x: number; y: number; k: number };
type Esquina = "nw" | "ne" | "sw" | "se";
type Modo = "mover" | Esquina;
/** Qué se arrastra: una pieza, o una parte de la pieza abierta (`parte`). `inicio`: su lugar en la medida al empezar.
 *  `vivo`: ya pasó el umbral; antes de eso un clic sólo la elige (el pulso de la mano no la mueve). */
type Arrastre = { pieza: number; parte: number | null; modo: Modo; px: number; py: number; inicio: Pos; vivo: boolean; puntero: number };
/** Lugares de las partes, relativos a su pieza (`PosicionParte`), y su orden: por pieza. */
type Rels = Record<number, Record<number, Pos>>;
type OrdenesP = Record<number, number[]>;

const ESQUINAS: Esquina[] = ["nw", "ne", "sw", "se"];
/** Píxeles (ancho × alto) con los que se pinta la vista, como mucho: más sólo hace lento el arrastre. Va por área y
 *  no por lado para que una tira (320×50 a todo lo ancho) salga nítida en pantalla Retina sin costar más que un
 *  cuadrado. */
const VISTA_PX = 1400 * 1400;
/** Desde esta forma (ancho ÷ alto) la medida es una tira (banners, 876×324): el panel va abajo y la vista usa todo
 *  el ancho del editor. Con el panel al lado, un 320×50 quedaba en 790×123 px y las piezas se enciman. */
const TIRA = 2;
/** A cuántos px (de la medida) del centro una pieza se queda pegada al centro mientras se arrastra. */
const IMAN_PX = 6;
/** A qué escala se pinta la vista a medio arrastre (medido con s33: 75-97 ms la vista completa, la mitad con el fondo
 *  ya hecho bastante menos); al soltar se pinta nítida. */
const ESCALA_ARRASTRE = 0.5;
/** Pasos del teclado: flechas (px de la medida; con Mayús, el largo) y + / − (factor de tamaño). */
const PASO = 1, PASO_LARGO = 10, CRECE = 1.02;
/** Px de pantalla que tiene que recorrer el ratón para que un clic se vuelva arrastre. */
const UMBRAL_PX = 3;
/** Debajo de esto (px de pantalla) la pieza es chica y sus esquinas se achican, para que quede de dónde arrastrarla. */
const PIEZA_CHICA_PX = 48;
/** Un solo tamaño de botón, como en la página (pasada de diseño B23): 36 px y letra de 13 px; 44 px con dedo. */
const BOTON = "h-9 text-[13px] pointer-coarse:h-11";
/** Espera tras el último cambio para leerlo en voz alta (un arrastre no dicta cada píxel). */
const ANUNCIO_MS = 500;
/** Espera tras la última letra para volver a escribir la vista (canvas, píxeles y el acomodo): teclear no se traba. */
const ESPERA_TEXTO_MS = 200;

const igual = (a: Pos, b: Pos) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k / b.k - 1) < 0.002;
const redondo = (p: Pos): Pos => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, k: Math.round(p.k * 10000) / 10000 });
/** Sólo las piezas que quedaron distintas del automático: eso es lo hecho a mano (y lo que se guarda). */
function soloCambios(pos: Record<number, Pos>, deAuto: Record<number, Pos>, puestas: Acomodo["puestas"]): Record<number, Pos> {
  const ed: Record<number, Pos> = {};
  for (const q of puestas) if (pos[q.pieza] && deAuto[q.pieza] && !igual(pos[q.pieza], deAuto[q.pieza])) ed[q.pieza] = pos[q.pieza];
  return ed;
}
/** El orden de las capas, si es distinto del automático (si no, nada que guardar). */
const ordenSiCambio = (orden: readonly number[], deAuto: readonly number[]) => (orden.some((p, i) => p !== deAuto[i]) ? orden : undefined);
/** De las partes, sólo lo que quedó distinto del maestro: sus lugares y los órdenes que cambiaron. */
function partesCambiadas(ma: MaestroListo, rels: Rels, ordenes: OrdenesP): Pick<Edicion, "partes" | "ordenPartes"> {
  const partes: Rels = {};
  for (const [i, r] of Object.entries(rels))
    for (const [j, v] of Object.entries(r)) if (!igual(v, parteSinTocar(ma.piezas[+i], +j))) (partes[+i] ??= {})[+j] = v;
  const ordenPartes: OrdenesP = {};
  for (const [i, o] of Object.entries(ordenes)) if (o.some((p, k) => p !== k)) ordenPartes[+i] = o;
  return { ...(Object.keys(partes).length ? { partes } : {}), ...(Object.keys(ordenPartes).length ? { ordenPartes } : {}) };
}
/** Una copia sin la llave `k`. */
function sin<T>(o: Record<number, T>, k: number): Record<number, T> {
  const r = { ...o };
  delete r[k];
  return r;
}
/** Los mismos textos cambiados (mismas llaves, mismas letras). */
function igualesCambios(a: CambiosTexto, b: CambiosTexto): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => b[k] === a[k]);
}
/** Los textos quitados, sin piezas vacías y en orden (así dos iguales se comparan como iguales). */
function normalSin(s: Readonly<Record<number, readonly number[]>> | undefined): Record<number, number[]> {
  const r: Record<number, number[]> = {};
  for (const [i, t] of Object.entries(s ?? {})) if (t.length) r[+i] = [...new Set(t)].sort((a, b) => a - b);
  return r;
}
const CURSOR: Record<Modo, string> = { mover: "cursor-grabbing", nw: "cursor-nwse-resize", se: "cursor-nwse-resize", ne: "cursor-nesw-resize", sw: "cursor-nesw-resize" };

export function EditorMedida({
  original,
  W,
  H,
  derivar,
  cambios,
  motivoTexto,
  piezaEscrita,
  nMedidas,
  inicial,
  zona,
  nombre,
  lang,
  alGuardar,
  alCerrar,
}: {
  /** El maestro del PSD, sin textos cambiados: con él se reconoce cada texto (`claveTexto`) y se lee lo del PSD. */
  original: MaestroListo;
  W: number;
  H: number;
  /** El maestro con esos textos cambiados, cómo se escriben (como en la tarjeta) y el acomodo automático de esta medida
   *  con ellos: de ahí arranca y a eso vuelve «Volver al automático». */
  derivar: (cambios: CambiosTexto) => { ma: MaestroListo; texto?: TextoEscrito; auto: Acomodo };
  /** Los textos cambiados del anuncio al abrir (todas las medidas). */
  cambios: CambiosTexto;
  /** Por qué el texto `j` de una pieza no se cambia aquí (null = sí se puede). */
  motivoTexto: (pieza: number, j: number) => string | null;
  /** Si la página escribe los textos de esa pieza (para quitar uno y dejar los demás). */
  piezaEscrita: (pieza: number) => boolean;
  /** Cuántas medidas hay (un texto cambia en todas). */
  nMedidas: number;
  inicial: Edicion | null;
  zona: Zona | null;
  /** «1080×1920», para el título y los avisos. */
  nombre: string;
  lang: Lang;
  alGuardar: (ed: Edicion | null, cambios: CambiosTexto) => void;
  alCerrar: () => void;
}) {
  /** Los textos cambiados aquí (del anuncio entero): se ven en la vista y, al guardar, en todas las medidas. */
  const [cambiosLocal, setCambiosLocal] = useState<CambiosTexto>(cambios);
  // Volver a escribir el maestro con las letras nuevas (canvas, píxeles y el acomodo otra vez) no se puede cortar a la
  // mitad: la vista se escribe cuando la persona deja de teclear un momento, y mientras tanto lo dice.
  const [cambiosVista, setCambiosVista] = useState<CambiosTexto>(cambios);
  useEffect(() => {
    if (cambiosVista === cambiosLocal) return;
    const t = setTimeout(() => setCambiosVista(cambiosLocal), ESPERA_TEXTO_MS);
    return () => clearTimeout(t);
  }, [cambiosLocal, cambiosVista]);
  const actualizando = cambiosVista !== cambiosLocal;
  const { ma, auto, texto } = useMemo(() => derivar(cambiosVista), [derivar, cambiosVista]);
  /** Lo último hecho con un texto (quitar, volver a poner, volver al original), para el lector de pantalla. */
  const [dichoTexto, setDichoTexto] = useState("");
  const mismosTextos = igualesCambios(cambiosLocal, cambios);
  /** Los textos quitados en ESTA medida, por pieza (sólo piezas con alguno). */
  const [sinTexto, setSinTexto] = useState<Record<number, number[]>>(() => normalSin(inicial?.sinTexto));
  const deAuto = useMemo(() => Object.fromEntries(auto.puestas.map((q) => [q.pieza, { x: q.x, y: q.y, k: q.k }])) as Record<number, Pos>, [auto]);
  /** Qué va encima de qué (índices, de abajo hacia arriba): el automático y el que se abrió (con lo guardado). */
  const ordenAuto = useMemo(() => auto.puestas.map((q) => q.pieza), [auto]);
  const ordenInicial = useMemo(() => ordenarPuestas(auto.puestas, inicial?.orden).map((q) => q.pieza), [auto, inicial]);
  /** Sólo las piezas que la persona movió (las demás siguen al automático: un texto que crece lo cambia). */
  const [pos, setPos] = useState<Record<number, Pos>>(() => ({ ...(inicial?.piezas ?? {}) }));
  const posDe = (i: number): Pos | undefined => pos[i] ?? deAuto[i];
  /** El orden que eligió la persona (o el guardado); null = el automático. Si un texto cambia qué piezas entran, el
   *  orden se rehace sobre las de ahora (no queda un orden de piezas que ya no están). */
  const [ordenElegido, setOrdenElegido] = useState<readonly number[] | null>(() => inicial?.orden ?? null);
  const orden = useMemo(() => ordenarPuestas(auto.puestas, ordenElegido ?? undefined).map((q) => q.pieza), [auto, ordenElegido]);
  // Las partes: lo que se abrió (con lo guardado). Los órdenes, completos (de abajo hacia arriba) por pieza.
  const relsInicial = useMemo((): Rels => Object.fromEntries(Object.entries(inicial?.partes ?? {}).map(([i, r]) => [i, { ...r }])), [inicial]);
  const ordenesInicial = useMemo((): OrdenesP => Object.fromEntries(Object.entries(inicial?.ordenPartes ?? {}).map(([i, o]) => [i, ordenDePartes(ma.piezas[+i], o)])), [inicial, ma]);
  const [rels, setRels] = useState<Rels>(relsInicial);
  const [ordenesP, setOrdenesP] = useState<OrdenesP>(ordenesInicial);
  /** Lo que la persona cambió de capa al editar (piezas, y partes por pieza): si dos de al lado cambian de lugar, la
   *  marca «otra capa» va en la que movió. */
  const [movidasCapa, setMovidasCapa] = useState<ReadonlySet<number>>(() => new Set());
  const [movidasCapaP, setMovidasCapaP] = useState<Record<number, ReadonlySet<number>>>({});
  /** La pieza abierta en partes (null = se mueven piezas enteras) y la parte elegida dentro de ella. */
  const [abierta, setAbierta] = useState<number | null>(null);
  const [selParte, setSelParte] = useState<number | null>(null);
  /** Tras subir o bajar una capa, o abrir o cerrar una pieza, a qué volver el foco (el renglón o la pieza cambian de
   *  lugar y el foco se pierde). `clave`: "pieza" o "pieza.parte"; "carpeta": el botón que abre y cierra sus partes. */
  const reenfocar = useRef<{ clave: string; donde: "pieza" | "subir" | "bajar" | "carpeta" } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [iman, setIman] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  /** El espacio libre para la vista (ancho y alto): la medida se ajusta a él sin deformarse, sea alta o una tira
   *  (Pedro, 2026-10-15: "the edit window should open a canvas that can accommodate the size its editing"). */
  const [caja, setCaja] = useState({ w: 0, h: 0 });
  const [noPinto, setNoPinto] = useState(false);
  const [modo, setModo] = useState<Modo | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  /** Se apretó Esc con cambios sin guardar: el pie lo explica en vez de sólo marcarlo. */
  const [escNegado, setEscNegado] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  /** El fondo ya remuestreado por tamaño de vista: no cambia mientras se edita. */
  const fondos = useRef(new Map<string, Float32Array>());

  // Lo que se ve y se revisa: el automático con lo que ya se movió, con las mismas reglas que la tarjeta y en el mismo
  // orden que `revisarMedida` (acomodo, edición, avisos de píxeles: ~1 ms). Sólo lo que cambió cuenta como hecho a
  // mano; dos piezas sin tocar que se enciman se siguen avisando.
  const conPartes = useMemo(() => partesCambiadas(ma, rels, ordenesP), [ma, rels, ordenesP]);
  const edicion = useMemo(
    (): Edicion => ({
      piezas: soloCambios(pos, deAuto, auto.puestas),
      orden: ordenSiCambio(orden, ordenAuto),
      ...conPartes,
      ...(Object.keys(sinTexto).length ? { sinTexto } : {}),
    }),
    [pos, deAuto, auto, orden, ordenAuto, conPartes, sinTexto],
  );
  const editado = useMemo(() => {
    const a = aplicarEdicion(ma, auto, edicion, W, H, zona);
    if (a === auto) return a; // `auto` ya trae los suyos
    try {
      return { ...a, avisos: [...a.avisos, ...avisosDePixeles(ma, a, W, H)] };
    } catch (err) {
      console.error("[editor-medida] avisos de píxeles", err);
      return a;
    }
  }, [ma, auto, edicion, W, H, zona]);
  const tira = W / H >= TIRA;
  /** El ancho de la vista en pantalla: lo más grande que cabe en el marco con la forma de la medida. Sale de una sola
   *  medición (la del marco): con dos, el primer cuadro se pintaba al tamaño equivocado y luego otra vez. */
  const anchoCss = caja.w > 0 && caja.h > 0 ? Math.floor(Math.min(caja.w, (caja.h * W) / H)) : 0;
  const e = anchoCss > 0 ? anchoCss / W : 0;
  const cambiada = (i: number) => !!pos[i] && !!deAuto[i] && !igual(pos[i], deAuto[i]);
  const hayCambios = auto.puestas.some((q) => cambiada(q.pieza)) || !!edicion.orden || !!conPartes.partes || !!conPartes.ordenPartes || !!edicion.sinTexto;
  // Distinto de como se abrió (lo automático más lo ya guardado): eso es lo que se perdería al cerrar.
  const partesAlAbrir = useMemo(() => JSON.stringify(partesCambiadas(ma, relsInicial, ordenesInicial)), [ma, relsInicial, ordenesInicial]);
  const sinAlAbrir = useMemo(() => JSON.stringify(normalSin(inicial?.sinTexto)), [inicial]);
  const sinGuardar =
    !mismosTextos ||
    JSON.stringify(sinTexto) !== sinAlAbrir ||
    orden.some((p, i) => p !== ordenInicial[i]) ||
    JSON.stringify(conPartes) !== partesAlAbrir ||
    auto.puestas.some((q) => {
      const antes = inicial?.piezas[q.pieza] ?? deAuto[q.pieza], p = posDe(q.pieza);
      return !!p && !!antes && !igual(p, antes);
    });
  /** De arriba (al frente) hacia abajo, como el panel de capas de Photoshop. */
  const capas = [...editado.puestas].reverse();
  const capaDe = (i: number) => capas.findIndex((q) => q.pieza === i);
  /** Las que la persona cambió de capa (no las que sólo se recorrieron un lugar por eso). */
  const deOtraCapa = useMemo(() => cambiadasDeCapa(orden, ordenAuto, movidasCapa), [orden, ordenAuto, movidasCapa]);

  // ── Partes ──
  const tienePartes = (i: number) => (ma.piezas[i]?.partes?.length ?? 0) >= 2;
  const hayPartes = ma.piezas.some((_, i) => tienePartes(i));
  const puestaDe = (i: number) => editado.puestas.find((q) => q.pieza === i);
  const ordenPartesDe = (i: number) => ordenesP[i] ?? ordenDePartes(ma.piezas[i], undefined);
  /** Dónde está cada parte de la pieza en la medida, en su orden (de abajo hacia arriba); también sin tocar. */
  const partesPuestas = (i: number) => {
    const q = puestaDe(i);
    return q ? (ponerPartes(ma.piezas[i], q, edicion, W, H)?.puestas ?? []) : [];
  };
  const relDe = (i: number, j: number) => rels[i]?.[j] ?? parteSinTocar(ma.piezas[i], j);
  const parteCambiada = (i: number, j: number) => !!rels[i]?.[j] && !igual(rels[i][j], parteSinTocar(ma.piezas[i], j));
  const partesTocadas = (i: number) => !!conPartes.partes?.[i] || !!conPartes.ordenPartes?.[i];

  // El espacio libre para la vista, desde que el diálogo la pone (y cada vez que cambia la ventana).
  const marco = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([r]) => setCaja({ w: r.contentRect.width, h: r.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pinta la vista (una vez por cuadro de pantalla, por mucho que se mueva el ratón). A medio arrastre, a la mitad y
  // con el fondo ya hecho, para que siga al ratón; al soltar, nítida.
  useEffect(() => {
    const l = lienzo.current;
    if (!l || anchoCss <= 0) return;
    const id = requestAnimationFrame(() => {
      const s = Math.min((anchoCss * (window.devicePixelRatio || 1)) / W, Math.sqrt(VISTA_PX / (W * H))) * (arrastrando ? ESCALA_ARRASTRE : 1);
      const Wd = Math.max(1, Math.round(W * s)), Hd = Math.max(1, Math.round(H * s));
      const chica = <T extends { k: number; x: number; y: number; w: number; h: number }>(q: T): T => ({ ...q, k: q.k * s, x: q.x * s, y: q.y * s, w: q.w * s, h: q.h * s });
      const chico: Acomodo = {
        ...editado,
        puestas: editado.puestas.map((q) => ({ ...chica(q), ...(q.partes ? { partes: q.partes.map(chica) } : {}) })),
        fondo: { k: editado.fondo.k * s, x: editado.fondo.x * s, y: editado.fondo.y * s },
      };
      try {
        const cf = `${Wd}x${Hd}:${chico.fondo.k}:${chico.fondo.x}:${chico.fondo.y}`;
        let fondo = fondos.current.get(cf);
        if (!fondo) {
          // Uno nítido y uno de arrastre por tamaño de ventana: si la ventana cambia mucho, se empieza de nuevo.
          if (fondos.current.size >= 4) fondos.current.clear();
          fondos.current.set(cf, (fondo = armarFondo(ma, chico, Wd, Hd)));
        }
        const px = armarMedida(ma, chico, Wd, Hd, { fondo, texto });
        if (l.width !== Wd || l.height !== Hd) {
          l.width = Wd;
          l.height = Hd;
        }
        const c = l.getContext("2d");
        if (!c) throw new Error("sin 2d");
        c.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, Wd, Hd), 0, 0);
        setNoPinto(false);
      } catch (err) {
        console.error("[editor-medida] pintar", err);
        setNoPinto(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editado, ma, W, H, anchoCss, arrastrando, texto]);

  /** La parte sólida de una pieza (`parte` null) o de una de sus partes. */
  const solido = (i: number, j: number | null) => (j === null ? ma.piezas[i].solido : (ma.piezas[i].partes?.[j]?.solido ?? ma.piezas[i].solido));
  /** Dónde está en la medida: la esquina de su parte sólida y su escala. */
  const lugarDe = (i: number, j: number | null): Pos => {
    const p = posDe(i) ?? { x: 0, y: 0, k: 1 };
    if (j === null) return p;
    const pp = partesPuestas(i).find((x) => x.parte === j);
    return pp ? { x: pp.x, y: pp.y, k: pp.k } : p;
  };
  /** Pone una pieza, o una parte (se guarda relativa a su pieza: así va pegada a ella), en un lugar de la medida. */
  const poner = (i: number, j: number | null, p: Pos) => {
    if (j === null) {
      // De vuelta en su lugar automático (Esc a medio arrastre, flechas de ida y vuelta): vuelve a seguirlo.
      const r = redondo(p);
      return setPos((antes) => (deAuto[i] && igual(r, deAuto[i]) ? sin(antes, i) : { ...antes, [i]: r }));
    }
    const q = puestaDe(i);
    if (!q) return;
    const rel = redondo({ x: (p.x - q.x) / q.k, y: (p.y - q.y) / q.k, k: p.k / q.k });
    setRels((antes) => ({ ...antes, [i]: { ...antes[i], [j]: rel } }));
  };
  /** Los mismos topes que `aplicarEdicion`: lo que se ve al arrastrar es lo que se guarda. */
  const topes = (i: number, j: number | null) =>
    j === null ? topesPieza(solido(i, null), W, H, ma.piezas[i].caja) : topesParte(solido(i, j), puestaDe(i)?.k ?? 1, W, H, ma.piezas[i].partes?.[j]?.caja);
  /** Cambia el tamaño alrededor del centro (teclado). */
  const crecer = (i: number, j: number | null, f: number) => {
    const p = lugarDe(i, j), s = solido(i, j), t = topes(i, j);
    const k = Math.min(t.max, Math.max(t.min, p.k * f));
    poner(i, j, { k, x: p.x + (s.w * (p.k - k)) / 2, y: p.y + (s.h * (p.k - k)) / 2 });
  };

  const enfocar = (i: number) => (document.querySelector(`[data-pieza="${i}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  const enfocarParte = (i: number, j: number) => (document.querySelector(`[data-parte="${i}.${j}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
  /** Sube (+1, más al frente) o baja (−1, más atrás) una capa: cambia de lugar con la de al lado. La pieza queda elegida,
   *  así el estado (y el lector de pantalla) dice en qué capa quedó. */
  const cambiarCapa = (i: number, paso: 1 | -1, donde: "pieza" | "subir" | "bajar") => {
    const j = orden.indexOf(i), k = j + paso;
    // Ya hasta arriba o hasta abajo: no cambia nada (y no queda un foco pendiente para el siguiente cambio).
    if (j < 0 || k < 0 || k >= orden.length) return;
    reenfocar.current = { clave: `${i}`, donde };
    setSel(i);
    setSelParte(null);
    // Mover de capa otra pieza cierra la abierta: el lienzo y la lista hablan de la misma pieza.
    if (abierta !== null && abierta !== i) setAbierta(null);
    const nuevo = [...orden];
    [nuevo[j], nuevo[k]] = [nuevo[k], nuevo[j]];
    setOrdenElegido(nuevo);
    setMovidasCapa((m) => new Set(m).add(i));
  };
  /** Lo mismo con una parte, sólo dentro de su pieza. */
  const cambiarCapaParte = (i: number, parte: number, paso: 1 | -1, donde: "pieza" | "subir" | "bajar") => {
    const o = ordenPartesDe(i), j = o.indexOf(parte), k = j + paso;
    if (j < 0 || k < 0 || k >= o.length) return;
    reenfocar.current = { clave: `${i}.${parte}`, donde };
    setSel(i);
    setSelParte(parte);
    const nuevo = [...o];
    [nuevo[j], nuevo[k]] = [nuevo[k], nuevo[j]];
    setOrdenesP((antes) => ({ ...antes, [i]: nuevo }));
    setMovidasCapaP((m) => ({ ...m, [i]: new Set(m[i]).add(parte) }));
  };
  /** Abre una pieza en partes: el foco pasa a su parte de más al frente, o se queda en el botón de la lista que la abrió
   *  (`foco` "carpeta"). */
  const abrir = (i: number, foco: "parte" | "carpeta" = "parte") => {
    if (!tienePartes(i)) return;
    const o = ordenPartesDe(i), frente = o[o.length - 1];
    reenfocar.current = foco === "carpeta" ? { clave: `${i}`, donde: "carpeta" } : { clave: `${i}.${frente}`, donde: "pieza" };
    setSel(i);
    setSelParte(frente);
    setAbierta(i);
  };
  /** Cierra la pieza abierta; el foco vuelve a ella, a `luego` (otra pieza que se eligió en la lista) o al botón de la
   *  lista que la cerró. */
  const cerrar = (luego: number | null = abierta, foco: "pieza" | "carpeta" = "pieza") => {
    if (abierta === null || luego === null) return;
    reenfocar.current = { clave: `${luego}`, donde: foco };
    setSel(luego);
    setSelParte(null);
    setAbierta(null);
  };
  /** Elegir una pieza desde la lista: la abierta pasa el foco a su parte elegida (no se cierra); si había otra abierta,
   *  se cierra primero. */
  const elegirPieza = (i: number) => {
    if (abierta !== i) return abierta !== null ? cerrar(i) : enfocar(i);
    const o = ordenPartesDe(i);
    enfocarParte(i, selParte ?? o[o.length - 1]);
  };
  // Al subir o bajar, el renglón se mueve en la lista (React lo saca y lo vuelve a poner): el foco vuelve a su botón;
  // si ese ya no se puede (llegó arriba o abajo del todo), al otro del mismo renglón, y desde la pieza, a la pieza. Al
  // abrir o cerrar una pieza, a su parte o a la pieza. Antes de pintar, para que no haya un cuadro sin foco.
  useLayoutEffect(() => {
    const r = reenfocar.current;
    if (!r) return;
    reenfocar.current = null;
    if (r.donde === "carpeta") return void document.querySelector<HTMLElement>(`[data-carpeta="${r.clave}"]`)?.focus();
    const boton = (d: string) => document.querySelector<HTMLButtonElement>(`[data-capa="${r.clave}"][data-mover="${d}"]:not(:disabled)`);
    const b = r.donde === "pieza" ? null : (boton(r.donde) ?? boton(r.donde === "subir" ? "bajar" : "subir"));
    if (b) return b.focus();
    const [i, j] = r.clave.split(".").map(Number);
    if (j === undefined || Number.isNaN(j)) enfocar(i);
    else enfocarParte(i, j);
  }, [orden, ordenesP, abierta]);
  // Al elegir una pieza con texto, sus textos se ven (en una tira el panel es bajo y quedaban abajo del todo).
  useEffect(() => {
    if (sel !== null && original.piezas[sel]?.textos.length) document.querySelector("section[aria-labelledby='editor-textos']")?.scrollIntoView({ block: "nearest" });
  }, [sel, original]);
  // Al abrir una pieza, la lista de sus partes se ve (en el panel con scroll podía quedar abajo).
  useEffect(() => {
    if (abierta !== null) document.getElementById(`editor-partes-${abierta}`)?.scrollIntoView({ block: "nearest" });
  }, [abierta]);

  const empezar = (ev: PointerEvent<HTMLElement>, i: number, j: number | null, m: Modo) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    setSel(i);
    setSelParte(j);
    const boton = ev.currentTarget.closest(j === null ? "[data-pieza]" : "[data-parte]") as HTMLElement | null;
    // Con el foco en la pieza, las flechas y + / − siguen sobre ella después del clic.
    boton?.focus({ preventScroll: true });
    boton?.setPointerCapture(ev.pointerId);
    arrastre.current = { pieza: i, parte: j, modo: m, px: ev.clientX, py: ev.clientY, inicio: lugarDe(i, j), vivo: false, puntero: ev.pointerId };
    setModo(m);
  };
  const mover = (ev: PointerEvent<HTMLElement>) => {
    const a = arrastre.current;
    // Sólo el dedo o ratón que empezó; si el botón ya no está apretado (se perdió el soltar), se suelta aquí.
    if (!a || e <= 0 || ev.pointerId !== a.puntero) return;
    if (ev.buttons === 0) return soltar();
    if (!a.vivo) {
      if (Math.hypot(ev.clientX - a.px, ev.clientY - a.py) < UMBRAL_PX) return;
      a.vivo = true;
      setArrastrando(true);
    }
    const dx = (ev.clientX - a.px) / e, dy = (ev.clientY - a.py) / e, s = solido(a.pieza, a.parte), p0 = a.inicio;
    if (a.modo === "mover") {
      let x = p0.x + dx, y = p0.y + dy;
      const w = s.w * p0.k, h = s.h * p0.k;
      // Imán al centro de la medida, para centrar sin contar píxeles (con Alt, sin imán).
      const ix = !ev.altKey && Math.abs(x + w / 2 - W / 2) < IMAN_PX, iy = !ev.altKey && Math.abs(y + h / 2 - H / 2) < IMAN_PX;
      if (ix) x = W / 2 - w / 2;
      if (iy) y = H / 2 - h / 2;
      setIman({ x: ix, y: iy });
      poner(a.pieza, a.parte, { x, y, k: p0.k });
      return;
    }
    // Esquina: la contraria se queda quieta y la pieza crece o se achica sin deformarse.
    const w0 = s.w * p0.k, h0 = s.h * p0.k;
    const oeste = a.modo === "nw" || a.modo === "sw", norte = a.modo === "nw" || a.modo === "ne";
    const ax = oeste ? p0.x + w0 : p0.x, ay = norte ? p0.y + h0 : p0.y;
    const qx = (oeste ? p0.x : p0.x + w0) + dx, qy = (norte ? p0.y : p0.y + h0) + dy;
    const t = topes(a.pieza, a.parte);
    const k = Math.min(t.max, Math.max(t.min, Math.max(Math.abs(qx - ax) / s.w, Math.abs(qy - ay) / s.h)));
    poner(a.pieza, a.parte, { k, x: oeste ? ax - s.w * k : ax, y: norte ? ay - s.h * k : ay });
  };
  function soltar() {
    arrastre.current = null;
    setIman({ x: false, y: false });
    setModo(null);
    setArrastrando(false);
  }
  /** Esc a medio arrastre: la pieza (o la parte) vuelve a donde estaba al empezar. */
  const cancelarArrastre = () => {
    const a = arrastre.current;
    if (!a) return false;
    poner(a.pieza, a.parte, a.inicio);
    soltar();
    return true;
  };
  const tecla = (ev: KeyboardEvent<HTMLElement>, i: number, j: number | null) => {
    // La capa: ] y [ como Photoshop (allá con Cmd; aquí sin, porque Cmd+[ es «atrás» en el navegador). Van antes de
    // revisar Alt porque en teclado español [ y ] SE escriben con Option (Mac) o AltGr (Windows: Ctrl+Alt). Re Pág /
    // Av Pág hacen lo mismo en cualquier teclado. Una parte cambia de capa sólo dentro de su pieza.
    const capa = ev.key === "]" || ev.key === "PageUp" ? 1 : ev.key === "[" || ev.key === "PageDown" ? -1 : 0;
    if (capa && !ev.metaKey && !(ev.ctrlKey && !ev.altKey)) {
      ev.preventDefault();
      if (j === null) cambiarCapa(i, capa, "pieza");
      else cambiarCapaParte(i, j, capa, "pieza");
      return;
    }
    // Cmd/Ctrl + / − es el zoom del navegador y Alt + flecha es atrás/adelante: no son de la pieza.
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === "Enter" && j === null && tienePartes(i)) {
      ev.preventDefault();
      abrir(i);
      return;
    }
    const paso = ev.shiftKey ? PASO_LARGO : PASO, p = lugarDe(i, j);
    const flechas: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
    const f = flechas[ev.key];
    if (f) {
      ev.preventDefault();
      poner(i, j, { ...p, x: p.x + f[0], y: p.y + f[1] });
    } else if (ev.key === "+" || ev.key === "=") {
      // «+» casi siempre lleva Mayús: aquí Mayús no cambia el paso.
      ev.preventDefault();
      crecer(i, j, CRECE);
    } else if (ev.key === "-" || ev.key === "_") {
      ev.preventDefault();
      crecer(i, j, 1 / CRECE);
    }
  };

  // Los textos, sólo si cambiaron (el MISMO objeto si no: la página no vuelve a escribir todas las medidas).
  const guardar = () =>
    alGuardar(Object.keys(edicion.piezas).length || edicion.orden || edicion.partes || edicion.ordenPartes || edicion.sinTexto ? edicion : null, mismosTextos ? cambios : cambiosLocal);

  // La pieza abierta: sus partes en la medida (de abajo hacia arriba) y su nombre.
  const abiertaQ = abierta === null ? undefined : puestaDe(abierta);
  const partesAbierta = abierta !== null && abiertaQ ? partesPuestas(abierta) : [];
  const nombrePieza = (i: number) => etiquetaPieza(ma.piezas[i]);
  /** El nombre de su subcarpeta (las sueltas lo dicen; una sin nombre, su número). */
  const nombreParte = (i: number, j: number) => {
    const d = ma.piezas[i].partes?.[j];
    const n = d?.nombre ? `«${d.nombre}»` : rellenar(tx(FP.editorParteN, lang), { n: j + 1 });
    return d?.hijo === null ? rellenar(tx(FP.editorSueltas, lang), { q: n }) : n;
  };
  /** «Iconos» de Legales: en palabras (el lector de pantalla no lee bien «›»). */
  const parteDe = (i: number, j: number) => rellenar(tx(FP.editorParteDe, lang), { q: nombreParte(i, j), p: nombrePieza(i) });
  /** La capa de una parte dentro de su pieza, desde el frente (0 = la de más al frente). */
  const capaParte = (i: number, j: number) => {
    const o = ordenPartesDe(i);
    return o.length - 1 - o.indexOf(j);
  };

  // ── Textos ──
  /** Los textos de una pieza tal como vienen del PSD (con ellos se reconoce cada uno en todas las medidas). */
  const textosDe = (i: number) => original.piezas[i]?.textos ?? [];
  const textoCambio = (i: number) => textosDe(i).some((tp) => cambiosLocal[claveTexto(tp)] !== undefined);
  /** Quitar un texto pide volver a escribir la pieza sin él: hace falta su base y, si le quedan otros, escribirlos. */
  const sePuedeQuitar = (i: number) => !!original.piezas[i]?.base && (textosDe(i).length === 1 || piezaEscrita(i));
  const escribirTexto = (tp: (typeof original.piezas)[number]["textos"][number], v: string) => {
    const k = claveTexto(tp);
    // Volver a las letras del PSD es no tener cambio (no un cambio igual al original).
    setCambiosLocal((antes) => {
      if (v === tp.texto.texto) {
        if (!(k in antes)) return antes;
        const r = { ...antes };
        delete r[k];
        return r;
      }
      return { ...antes, [k]: v };
    });
  };
  /** Una frase con un motivo que escribe el motor (siempre en español): el motivo, marcado como tal para el lector. */
  const delMotor = (plantilla: string, motivo: string): ReactNode => {
    const [antes, despues = ""] = plantilla.split("{m}");
    return (
      <>
        {antes}
        <span lang={lang === "en" ? "es" : undefined}>{motivo}</span>
        {despues}
      </>
    );
  };
  const quitarTexto = (i: number, j: number) =>
    setSinTexto((antes) => {
      const t = antes[i] ?? [], r = { ...antes };
      if (t.includes(j)) {
        const quedan = t.filter((x) => x !== j);
        if (quedan.length) r[i] = quedan;
        else delete r[i];
      } else r[i] = [...t, j].sort((a, b) => a - b);
      return r;
    });

  // Lo que se lee de la pieza (o la parte) elegida (también para el lector de pantalla).
  const estado = (() => {
    const p = sel === null ? undefined : posDe(sel);
    if (sel === null || !p || !deAuto[sel]) return "";
    const letraDe = (l: number | null | undefined, k: number) => (typeof l === "number" && l > 0 ? rellenar(tx(FP.editorLetra, lang), { px: (l * k).toFixed(1) }) : "");
    if (abierta === sel && selParte !== null) {
      const d = ma.piezas[sel].partes?.[selParte], pp = partesAbierta.find((x) => x.parte === selParte);
      if (!d || !pp) return "";
      return (
        rellenar(tx(FP.editorEstadoParte, lang), { p: parteDe(sel, selParte), x: Math.round(pp.x), y: Math.round(pp.y), t: Math.round(relDe(sel, selParte).k * 100), l: letraDe(d.letraMinPx, pp.k) }) +
        rellenar(tx(FP.editorParteCapa, lang), { n: capaParte(sel, selParte) + 1, m: ordenPartesDe(sel).length })
      );
    }
    return rellenar(tx(FP.editorEstado, lang), {
      p: nombrePieza(sel),
      x: Math.round(p.x),
      y: Math.round(p.y),
      t: Math.round((p.k / deAuto[sel].k) * 100),
      l: letraDe(ma.piezas[sel].letraMinPx, p.k),
    }) + rellenar(tx(FP.editorCapa, lang), { n: capaDe(sel) + 1, m: capas.length });
  })();
  // Lo que oye el lector de pantalla: lo mismo más cuántos avisos hay, medio segundo después del último cambio.
  const dicho = estado && estado + rellenar(tx(FP.editorAvisosN, lang), { n: editado.avisos.length });
  useEffect(() => {
    const t = setTimeout(() => setAnuncio(dicho), ANUNCIO_MS);
    return () => clearTimeout(t);
  }, [dicho]);
  const pctX = (v: number) => `${(v / W) * 100}%`, pctY = (v: number) => `${(v / H) * 100}%`;

  /** El marco que se arrastra: una pieza (`j` null) o una parte de la pieza abierta. Una función, no un componente: un
   *  componente definido aquí se volvería a montar en cada cuadro (y perdería el foco y el arrastre). */
  const marcoDe = (i: number, j: number | null, q: { x: number; y: number; w: number; h: number }, z: number, oculta = false) => {
    const elegida = sel === i && (j === null ? abierta !== i && selParte === null : selParte === j);
    // Media esquina (px de pantalla): 24 px para agarrarla; en una pieza chica, 16, para que quede centro.
    const m = q.w * e < PIEZA_CHICA_PX || q.h * e < PIEZA_CHICA_PX ? 8 : 12;
    const conP = j === null && tienePartes(i);
    const etiqueta =
      j === null
        ? rellenar(tx(FP.editorPiezaAria, lang), { p: nombrePieza(i), n: capaDe(i) + 1, m: capas.length }) +
          (conP ? rellenar(tx(FP.editorConPartesAria, lang), { n: ordenPartesDe(i).length }) : "")
        : rellenar(tx(FP.editorParteAria, lang), { p: nombrePieza(i), q: nombreParte(i, j), n: capaParte(i, j) + 1, m: ordenPartesDe(i).length });
    return (
      <button
        key={j === null ? i : `${i}.${j}`}
        type="button"
        {...(j === null ? { "data-pieza": i } : { "data-parte": `${i}.${j}` })}
        aria-describedby={j !== null ? "editor-ayuda-partes" : conP ? "editor-ayuda editor-ayuda-partes" : "editor-ayuda"}
        aria-label={etiqueta}
        // Con una pieza abierta, las demás no se tocan ni se enfocan (siguen en la página, apagadas).
        inert={oculta || undefined}
        title={conP ? tx(FP.editorAbrirTitulo, lang) : undefined}
        className={cn(
          "absolute rounded-[2px] outline-hidden",
          elegida && modo ? CURSOR[modo] : "cursor-grab",
          // La elegida va al frente: sus esquinas se agarran aunque otra pieza la tape en parte. Las demás,
          // con orilla blanca y oscura, para verse sobre un cielo claro o un fondo oscuro.
          elegida ? "ring-2 ring-primary" : "shadow-[0_0_0_2px_rgb(0_0_0/0.3)] ring-1 ring-white/80 hover:ring-2 hover:ring-primary/70",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "motion-safe:transition-opacity",
          oculta && "pointer-events-none opacity-0",
        )}
        // Encima, la que está más al frente (un clic donde dos se enciman agarra la de adelante).
        style={{ left: pctX(q.x), top: pctY(q.y), width: pctX(q.w), height: pctY(q.h), zIndex: elegida ? 1000 : z }}
        onFocus={() => {
          // El foco en otra pieza (Tab o la lista) cierra la abierta.
          if (j === null && abierta !== null && abierta !== i) setAbierta(null);
          setSel(i);
          setSelParte(j);
        }}
        onDoubleClick={j === null ? () => abrir(i) : undefined}
        // Un «clic» sin ratón (lector de pantalla, Espacio) abre la pieza como el doble clic.
        onClick={j === null ? (ev) => ev.detail === 0 && abrir(i) : undefined}
        onPointerDown={(ev) => empezar(ev, i, j, "mover")}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
        onKeyDown={(ev) => tecla(ev, i, j)}
      >
        {elegida &&
          ESQUINAS.map((c) => (
            <span
              key={c}
              aria-hidden="true"
              onPointerDown={(ev) => empezar(ev, i, j, c)}
              className={cn("absolute flex items-center justify-center", c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize")}
              style={{ width: 2 * m, height: 2 * m, [c[0] === "n" ? "top" : "bottom"]: -m, [c[1] === "w" ? "left" : "right"]: -m }}
            >
              <span className="size-3 rounded-[2px] border border-primary bg-background" />
            </span>
          ))}
      </button>
    );
  };

  /** Los botones de un renglón de la lista (una pieza, o una parte de la abierta): volver a su lugar (si cambió; si no,
   *  su lugar queda vacío y los renglones no brincan), más al frente y más atrás. */
  const botonesCapa = (i: number, j: number | null, n: string, cambio: boolean, arriba: boolean, abajo: boolean) => (
    <>
      {/* Al volver, el foco pasa a la pieza: este botón se esconde y el teclado no se pierde. */}
      <Button
        variant="ghost"
        size="icon-lg"
        className={cn(!cambio && "invisible")}
        disabled={!cambio}
        onClick={() => {
          if (j === null) {
            // Vuelve a seguir al automático (también si un texto lo cambia).
            setPos((antes) => sin(antes, i));
            // Sus partes también vuelven a su lugar y orden en la pieza.
            setRels((antes) => sin(antes, i));
            setOrdenesP((antes) => sin(antes, i));
            return elegirPieza(i);
          }
          setRels((antes) => ({ ...antes, [i]: sin(antes[i] ?? {}, j) }));
          enfocarParte(i, j);
        }}
        aria-label={rellenar(tx(j === null ? FP.editorPiezaAutoAria : FP.editorParteAutoAria, lang), { p: n })}
        title={tx(j !== null ? FP.editorParteAuto : tienePartes(i) ? FP.editorPiezaAutoPartes : FP.editorPiezaAuto, lang)}
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        data-capa={j === null ? `${i}` : `${i}.${j}`}
        data-mover="subir"
        disabled={arriba}
        onClick={() => (j === null ? cambiarCapa(i, 1, "subir") : cambiarCapaParte(i, j, 1, "subir"))}
        aria-label={rellenar(tx(FP.editorSubirAria, lang), { p: n })}
        title={tx(FP.editorSubir, lang)}
      >
        <ChevronUp className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-lg"
        data-capa={j === null ? `${i}` : `${i}.${j}`}
        data-mover="bajar"
        disabled={abajo}
        onClick={() => (j === null ? cambiarCapa(i, -1, "bajar") : cambiarCapaParte(i, j, -1, "bajar"))}
        aria-label={rellenar(tx(FP.editorBajarAria, lang), { p: n })}
        title={tx(FP.editorBajar, lang)}
      >
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </Button>
    </>
  );

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent
        // Casi toda la pantalla, para que quepa la medida grande: alto fijo y cada parte en su renglón (la vista se
        // lleva lo que sobra). `lang`: el diálogo sale fuera de la página y no hereda el idioma.
        lang={lang}
        // La X de cerrar, del mismo alto que los demás botones (36 px).
        className={cn(DIALOGO_GRANDE, "grid-rows-[auto_minmax(0,1fr)_auto] [&>[data-slot=dialog-close]]:size-9")}
        // Esc suelta primero un arrastre a medias, luego cierra la pieza abierta; con cambios sin guardar, ni Esc ni un
        // clic afuera cierran (Cancelar y la X sí: son a propósito).
        onEscapeKeyDown={(ev) => {
          if (cancelarArrastre()) return ev.preventDefault();
          // En un cuadro de texto, Esc no cierra la pieza abierta (ni le quita el foco a lo que se escribe).
          if (abierta !== null && !(ev.target instanceof HTMLTextAreaElement)) {
            ev.preventDefault();
            return cerrar();
          }
          if (!sinGuardar) return;
          ev.preventDefault();
          setEscNegado(true);
        }}
        onInteractOutside={(ev) => {
          if (sinGuardar || arrastre.current) ev.preventDefault();
        }}
        // El diálogo no tiene disparador propio: el foco vuelve al «Editar» de esta medida (por su marca, no por
        // "lo que tenía el foco": Safari no enfoca un botón al hacerle clic).
        onCloseAutoFocus={(ev) => {
          const editar = document.querySelector<HTMLElement>(`[data-editar="${W}x${H}"]`);
          if (!editar) return;
          ev.preventDefault();
          editar.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">{rellenar(tx(FP.editorTitulo, lang), { m: nombre })}</DialogTitle>
          <DialogDescription className="text-sm">{tx(FP.editorDescripcion, lang)}</DialogDescription>
        </DialogHeader>
        {/* Medida alta o cuadrada: el panel a la derecha (desde lg). Tira, o pantalla angosta: el panel abajo, más bajo y
            en columnas, y la vista con todo el ancho. */}
        <div className={cn("grid min-h-0 gap-4 grid-rows-[minmax(0,1fr)_auto]", !tira && "lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-1")}>
          <div
            ref={marco}
            className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60 p-2"
            // Un clic fuera de las partes (en la vista o en su margen) cierra la pieza abierta, y el foco queda en ella: sin
            // `preventDefault` el navegador lo pasaba al diálogo y las flechas ya no la movían (el de mousedown, para el
            // navegador que enfoca ahí). Las partes no llegan aquí: su arrastre se queda con el clic.
            onPointerDown={(ev) => {
              if (abierta === null) return;
              ev.preventDefault();
              cerrar();
            }}
            onMouseDown={(ev) => !(ev.target as HTMLElement).closest("button") && ev.preventDefault()}
          >
            {abierta !== null && (
              // Qué está abierta y cómo se sale, sobre la vista, donde se está mirando.
              <div
                className="absolute left-3 top-3 z-[1001] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md border border-primary/40 bg-popover/95 py-1 pl-2 pr-1 text-xs text-foreground shadow-sm"
                onPointerDown={(ev) => ev.stopPropagation()}
              >
                <span className="truncate">{rellenar(tx(FP.editorAbierta, lang), { p: nombrePieza(abierta) })}</span>
                <Button variant="outline" size="xs" className={BOTON} onClick={() => cerrar()}>
                  {tx(FP.editorCerrar, lang)}
                </Button>
              </div>
            )}
            <div className="relative touch-none select-none" style={{ width: anchoCss || undefined, aspectRatio: `${W} / ${H}` }}>
              <canvas ref={lienzo} aria-hidden="true" className="block size-full rounded-sm" />
              {zona && <Franjas guia={zona} w={W} h={H} />}
              {iman.x && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary" />}
              {iman.y && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary" />}
              {/* En el orden del maestro (el del Tab no cambia al reordenar, y React no mueve los botones, que perderían el
                  foco): lo que va encima de qué lo dice su capa. */}
              {[...editado.puestas]
                .sort((x, y) => x.pieza - y.pieza)
                .map((q) => {
                  // Si al volver a escribir un texto la pieza ya no se abre en partes, se ve entera.
                  if (abierta !== q.pieza || !partesAbierta.length) return marcoDe(q.pieza, null, q, capas.length - capaDe(q.pieza), abierta !== null && abierta !== q.pieza);
                  // La pieza abierta: un marco punteado alrededor de sus partes y un marco por parte.
                  const x0 = Math.min(...partesAbierta.map((p) => p.x)), y0 = Math.min(...partesAbierta.map((p) => p.y));
                  const x1 = Math.max(...partesAbierta.map((p) => p.x + p.w)), y1 = Math.max(...partesAbierta.map((p) => p.y + p.h));
                  return (
                    <Fragment key={q.pieza}>
                      {/* Doble orilla (clara y del color de marca) para verse sobre un fondo claro o uno oscuro. */}
                      <span aria-hidden="true" className="pointer-events-none absolute rounded-[3px] border-2 border-dashed border-primary shadow-[0_0_0_1px_rgb(255_255_255/0.85),inset_0_0_0_1px_rgb(255_255_255/0.85)]" style={{ left: pctX(x0 - 4 / (e || 1)), top: pctY(y0 - 4 / (e || 1)), width: pctX(x1 - x0 + 8 / (e || 1)), height: pctY(y1 - y0 + 8 / (e || 1)), zIndex: 999 }} />
                      {[...partesAbierta]
                        .sort((a, b) => a.parte - b.parte)
                        .map((pp) => marcoDe(q.pieza, pp.parte, pp, 999 - capaParte(q.pieza, pp.parte)))}
                    </Fragment>
                  );
                })}
            </div>
          </div>
          <div className={cn("grid max-h-48 min-h-0 min-w-0 content-start gap-3 overflow-y-auto text-sm md:grid-cols-3", !tira && "lg:max-h-none lg:grid-cols-1")}>
            <div className="flex flex-col gap-3">
              {/* La ayuda en una línea que se abre (B23): antes eran ~100 palabras grises antes de «Textos» y «Capas».
                  Cerrada sigue siendo la descripción de cada pieza (el lector la lee al llegar a ella). */}
              <details className="group">
                <summary className="-mx-1.5 flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                  {tx(FP.editorComoSeUsa, lang)}
                </summary>
                <div className="mt-1 space-y-2">
                  <p id="editor-ayuda" className="text-muted-foreground">
                    {tx(FP.editorAyuda, lang)}
                  </p>
                  {hayPartes && (
                    <p id="editor-ayuda-partes" className="text-muted-foreground">
                      {tx(FP.editorAyudaPartes, lang)}
                    </p>
                  )}
                </div>
              </details>
              {/* A la vista, al momento; al lector de pantalla, medio segundo después del último cambio (abajo). Con una
                  pieza abierta el estado es más largo (pieza y parte): más alto, para que el panel no brinque. */}
              <p className={cn("text-foreground", abierta !== null ? "min-h-[5rem]" : "min-h-[3.75rem]")}>{estado}</p>
              {/* El doble clic no se adivina: elegida una pieza con partes, el botón lo dice. */}
              {sel !== null && abierta === null && tienePartes(sel) && (
                <Button variant="outline" size="sm" className={cn(BOTON, "self-start")} onClick={() => abrir(sel)}>
                  <FolderOpen className="size-3.5" aria-hidden="true" /> {tx(FP.editorAbrir, lang)}
                </Button>
              )}
              {sel !== null && textosDe(sel).length > 0 && (
                <section aria-labelledby="editor-textos" aria-busy={actualizando || undefined} className="flex flex-col gap-3 rounded-lg border border-border p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 id="editor-textos" className="text-xs font-semibold text-foreground">
                      {tx(FP.editorTextos, lang)}
                    </h3>
                    {actualizando && <span className="text-xs text-muted-foreground">{tx(FP.editorTextoActualizando, lang)}</span>}
                  </div>
                  {(ma.piezas[sel] as PiezaCambiada | undefined)?.textoSinEscribir && (
                    <p className="flex items-start gap-1 text-xs text-foreground">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" />
                      <span>{delMotor(tx(FP.editorTextoSinEscribir, lang), (ma.piezas[sel] as PiezaCambiada).textoSinEscribir ?? "")}</span>
                    </p>
                  )}
                  {textosDe(sel).map((tp, j, todos) => {
                    const k = claveTexto(tp), no = motivoTexto(sel, j), quitado = sinTexto[sel]?.includes(j) ?? false;
                    const valor = cambiosLocal[k] ?? tp.texto.texto, puede = sePuedeQuitar(sel);
                    const id = `editor-texto-${sel}-${j}`;
                    // Por su pieza (la capa de texto de Photoshop se llama como sus primeras palabras): entera, al pasar el ratón.
                    const nombre = todos.length > 1 ? rellenar(tx(FP.editorTextoDeN, lang), { j: j + 1, n: todos.length, c: nombrePieza(sel) }) : rellenar(tx(FP.editorTextoDe, lang), { c: nombrePieza(sel) });
                    const porQueNo = puede ? null : tx(original.piezas[sel]?.base ? FP.editorTextoNoQuitar : FP.editorTextoNoQuitarBase, lang);
                    const vacio = !no && !valor.trim();
                    return (
                      <div key={`${sel}.${j}`} role="group" aria-labelledby={`${id}-nombre`} className="flex flex-col gap-1">
                        <label id={`${id}-nombre`} htmlFor={id} title={tp.capa} className="text-xs text-foreground">
                          {nombre}
                        </label>
                        {/* Sin poder cambiarse, se lee igual (sólo lectura, no apagado: el lector de pantalla lo dice). */}
                        <textarea
                          id={id}
                          value={valor}
                          readOnly={!!no}
                          maxLength={TEXTO_CAMBIADO_MAX}
                          rows={4}
                          aria-describedby={`${id}-nota`}
                          onChange={(ev) => escribirTexto(tp, ev.target.value)}
                          className={cn(
                            "min-h-16 w-full resize-y rounded-md border border-muted-foreground/60 bg-background px-2 py-1 text-sm text-foreground",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
                            no && "bg-secondary/60",
                            quitado && "opacity-60",
                          )}
                        />
                        <p id={`${id}-nota`} className={cn("text-xs", vacio ? "text-foreground" : "text-muted-foreground")}>
                          {no ? delMotor(tx(FP.editorTextoNo, lang), no) : vacio ? tx(FP.editorTextoVacio, lang) : nMedidas === 1 ? tx(FP.editorTextoUna, lang) : rellenar(tx(FP.editorTextoTodas, lang), { n: nMedidas })}
                          {quitado && <> {tx(FP.editorTextoQuitado, lang)}</>}
                          {porQueNo && !quitado && <> {porQueNo}</>}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {/* aria-disabled, no disabled: sigue en el Tab y su nota dice por qué no. */}
                          <Button
                            variant="outline"
                            size="xs"
                            className={cn(BOTON, "aria-disabled:opacity-50")}
                            aria-disabled={(!quitado && !puede) || undefined}
                            aria-label={`${tx(quitado ? FP.editorTextoPoner : FP.editorTextoQuitar, lang)}: ${nombre}`}
                            aria-describedby={`${id}-nota`}
                            onClick={() => {
                              if (!quitado && !puede) return;
                              quitarTexto(sel, j);
                              setDichoTexto(rellenar(tx(quitado ? FP.editorTextoPuestoDicho : FP.editorTextoQuitadoDicho, lang), { c: nombre }));
                            }}
                          >
                            {tx(quitado ? FP.editorTextoPoner : FP.editorTextoQuitar, lang)}
                          </Button>
                          {cambiosLocal[k] !== undefined && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className={BOTON}
                              aria-label={`${tx(FP.editorTextoOriginal, lang)}: ${nombre}`}
                              onClick={() => {
                                // Este botón se va al volver al original: el foco pasa a su cuadro de texto.
                                document.getElementById(id)?.focus();
                                escribirTexto(tp, tp.texto.texto);
                                setDichoTexto(rellenar(tx(FP.editorTextoOriginalDicho, lang), { c: nombre }));
                              }}
                            >
                              <RotateCcw className="size-3" aria-hidden="true" /> {tx(FP.editorTextoOriginal, lang)}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
              <p role="status" className="sr-only">
                {dichoTexto}
              </p>
              <p role="status" className="sr-only">
                {anuncio}
              </p>
              {noPinto && <p role="alert" className="text-foreground">{tx(FP.editorNoPinto, lang)}</p>}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">{tx(FP.editorPiezas, lang)}</h3>
              <ul className="mt-1 space-y-1">
                {capas.map((q, c) => {
                  const p = posDe(q.pieza), cambio = cambiada(q.pieza);
                  const n = nombrePieza(q.pieza);
                  const conP = tienePartes(q.pieza), abiertaAqui = abierta === q.pieza, tocadas = partesTocadas(q.pieza);
                  // Lo que cambió, en su propio renglón: en un panel angosto no se corta.
                  const marcas = p
                    ? [
                        `${Math.round((p.k / deAuto[q.pieza].k) * 100)} %`,
                        ...(cambio ? [tx(FP.editorCambiada, lang)] : []),
                        ...(deOtraCapa.has(q.pieza) ? [tx(FP.editorOtraCapa, lang)] : []),
                        ...(tocadas ? [tx(FP.editorPartesCambiadas, lang)] : []),
                        ...(textoCambio(q.pieza) ? [tx(FP.editorTextoCambiado, lang)] : []),
                        ...(sinTexto[q.pieza] ? [tx(FP.editorSinTextoMarca, lang)] : []),
                      ].join(" · ")
                    : "";
                  const ordenP = ordenPartesDe(q.pieza);
                  const otrasCapaP = abiertaAqui ? cambiadasDeCapa(ordenP, ordenDePartes(ma.piezas[q.pieza], undefined), movidasCapaP[q.pieza]) : new Set<number>();
                  return (
                    <li key={q.pieza}>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          aria-current={(sel === q.pieza && selParte === null) || undefined}
                          className={cn(
                            "min-h-9 min-w-0 flex-1 rounded-md border-l-2 pointer-coarse:min-h-11 border-transparent px-2 py-0.5 text-left hover:bg-secondary",
                            sel === q.pieza && selParte === null && "border-primary bg-secondary font-medium",
                          )}
                          // Un nombre largo se recorta: entero, al pasar el ratón.
                          title={marcas ? `${n} · ${marcas}` : n}
                          onClick={() => elegirPieza(q.pieza)}
                        >
                          <span className="block truncate">{n}</span>
                          {marcas && <span className="block text-xs font-normal text-muted-foreground">{marcas}</span>}
                        </button>
                        {conP && (
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            data-carpeta={q.pieza}
                            aria-expanded={abiertaAqui}
                            aria-controls={abiertaAqui ? `editor-partes-${q.pieza}` : undefined}
                            aria-label={rellenar(tx(FP.editorPartesDe, lang), { p: n })}
                            title={tx(abiertaAqui ? FP.editorCerrar : FP.editorAbrir, lang)}
                            onClick={() => (abiertaAqui ? cerrar(q.pieza, "carpeta") : abrir(q.pieza, "carpeta"))}
                          >
                            {abiertaAqui ? <FolderOpen className="size-3.5" aria-hidden="true" /> : <FolderClosed className="size-3.5" aria-hidden="true" />}
                          </Button>
                        )}
                        {botonesCapa(q.pieza, null, n, cambio || tocadas, c === 0, c === capas.length - 1)}
                      </div>
                      {abiertaAqui && (
                        // Las partes de la pieza abierta, también de arriba (al frente) hacia abajo, sólo entre ellas.
                        <ul id={`editor-partes-${q.pieza}`} aria-label={rellenar(tx(FP.editorPartesDe, lang), { p: n })} className="ml-3 mt-1 space-y-1 border-l border-border pl-2">
                          {[...ordenP].reverse().map((j, cp) => {
                            const cambioP = parteCambiada(q.pieza, j);
                            const relleno = (ma.piezas[q.pieza].partes?.[j]?.rellenoPct ?? 0) > RELLENO_AVISO_PCT;
                            const marcasP = [
                              rellenar(tx(FP.editorParteTam, lang), { t: Math.round(relDe(q.pieza, j).k * 100) }),
                              ...(cambioP ? [tx(FP.editorCambiada, lang)] : []),
                              ...(otrasCapaP.has(j) ? [tx(FP.editorOtraCapa, lang)] : []),
                            ].join(" · ");
                            return (
                              <li key={j} className="flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  aria-current={(sel === q.pieza && selParte === j) || undefined}
                                  className={cn(
                                    "min-h-9 min-w-0 flex-1 rounded-md border-l-2 border-transparent px-2 py-0.5 text-left hover:bg-secondary",
                                    sel === q.pieza && selParte === j && "border-primary bg-secondary font-medium",
                                  )}
                                  title={`${nombreParte(q.pieza, j)} · ${marcasP}`}
                                  onClick={() => enfocarParte(q.pieza, j)}
                                >
                                  <span className="block truncate">{nombreParte(q.pieza, j)}</span>
                                  <span className="block text-xs font-normal text-muted-foreground">
                                    {marcasP}
                                    {relleno && (
                                      <>
                                        {" · "}
                                        <span title={tx(FP.editorRellenoTitulo, lang)}>{tx(FP.editorRelleno, lang)}</span>
                                      </>
                                    )}
                                  </span>
                                </button>
                                {botonesCapa(q.pieza, j, parteDe(q.pieza, j), cambioP, cp === 0, cp === ordenP.length - 1)}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {/* El fondo no es una capa que se mueva: va siempre hasta atrás (lo dice la lista, como en Photoshop). */}
                <li className="px-2 py-1 text-muted-foreground">{tx(FP.editorFondoCapa, lang)}</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border bg-secondary/50 p-2">
              <h3 className="text-xs font-semibold text-foreground">{tx(FP.editorAvisos, lang)}</h3>
              {editado.avisos.length ? (
                // Los avisos los escribe el motor, en español.
                <ul lang={lang === "en" ? "es" : undefined} className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">
                  {editado.avisos.map((v, i) => (
                    <li key={i}>{v.texto}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">{tx(FP.editorSinAvisos, lang)}</p>
              )}
            </div>
          </div>
        </div>
        {/* El último renglón del diálogo: con muchas piezas o avisos se desplaza el panel, y Guardar y Cancelar se
            quedan a la vista. */}
        <DialogFooter className="-mx-4 -mb-4 gap-2 border-t border-border bg-popover px-4 py-3 sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            className={BOTON}
            disabled={!hayCambios}
            onClick={() => {
              setPos({});
              setSinTexto({});
              setOrdenElegido(null);
              setRels({});
              setOrdenesP({});
              setMovidasCapa(new Set());
              setMovidasCapaP({});
              // Este botón se apaga (ya no hay cambios): el foco pasa a «Guardar» en vez de perderse.
              document.querySelector<HTMLElement>("[data-editor-guardar]")?.focus();
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" /> {tx(FP.editorAuto, lang)}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <span role="status" className={cn("text-xs", escNegado ? "font-medium text-foreground" : "text-muted-foreground")}>
              {sinGuardar ? tx(escNegado ? FP.editorSinGuardarEsc : FP.editorSinGuardar, lang) : ""}
            </span>
            <Button variant="outline" className={BOTON} onClick={alCerrar}>
              {tx(FP.editorCancelar, lang)}
            </Button>
            <Button className={BOTON} data-editor-guardar onClick={guardar}>
              {tx(FP.editorGuardar, lang)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lo guardado: se queda en este navegador (el PSD tampoco se sube) ─────────────────────────────────────────

/**
 * Una edición son lugares en px sobre UN acomodo automático: el lado del HERO y la zona del canal lo cambian, así
 * que van en la clave (`contexto`). Con otro lado u otro canal la medida se ve en automático, no mezclada.
 */
const GUARDADA = "hue-formatos-edicion:v2";
const claveGuardada = (archivo: string, ma: MaestroListo, W: number, H: number, contexto: string) => `${GUARDADA}:${archivo}:${ma.w}x${ma.h}:${W}x${H}:${contexto}`;
/** Las carpetas de la mesa (y su papel), para saber que la edición guardada es de ESTE PSD y no de otro con el mismo nombre. */
const huella = (ma: MaestroListo) => ma.piezas.map((p) => `${p.nombre}|${p.rol ?? "-"}|${p.solido.w}x${p.solido.h}`).join("\u0000");
/** Las partes de cada pieza, aparte: lo guardado antes de que hubiera partes (o con otras subcarpetas) sigue valiendo
 *  para las piezas, y lo de sus partes se descarta. */
const huellaPartes = (ma: MaestroListo) => ma.piezas.map((p) => (p.partes ?? []).map((q) => `${q.hijo ?? "-"}|${q.solido.w}x${q.solido.h}`).join(",")).join("\u0000");

/** La edición que se guardó en este navegador para esa medida de ese PSD; null si no hay o si el PSD ya no es igual. */
export function edicionGuardada(archivo: string, ma: MaestroListo, W: number, H: number, contexto: string): Edicion | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveGuardada(archivo, ma, W, H, contexto)) ?? "null") as { huella?: unknown; partes?: unknown; ed?: unknown } | null;
    if (!v || v.huella !== huella(ma)) return null;
    let ed = v.ed;
    if (ed && typeof ed === "object" && v.partes !== huellaPartes(ma)) {
      const { partes, ordenPartes } = ed as { partes?: unknown; ordenPartes?: unknown };
      // Las subcarpetas del PSD cambiaron: lo de las piezas sigue, lo de sus partes no se adivina (queda rastro).
      if (partes || ordenPartes) console.warn("[editor-medida] el PSD cambió sus subcarpetas: lo guardado de las partes se descarta");
      ed = { ...ed, partes: undefined, ordenPartes: undefined };
    }
    return leerEdicion(ed, ma.piezas);
  } catch (err) {
    // Navegador sin almacenamiento o dato roto: la medida sale en automático, pero queda rastro.
    console.warn("[editor-medida] leer lo guardado", err);
    return null;
  }
}

/**
 * Guarda (o, con null, borra) la edición de esa medida en este navegador. false = el navegador no dejó: la edición
 * sigue en esta sesión, pero al recargar se pierde (quien llama lo dice).
 */
export function guardarEdicion(archivo: string, ma: MaestroListo, W: number, H: number, contexto: string, ed: Edicion | null): boolean {
  try {
    const k = claveGuardada(archivo, ma, W, H, contexto);
    if (ed) localStorage.setItem(k, JSON.stringify({ huella: huella(ma), partes: huellaPartes(ma), ed }));
    else localStorage.removeItem(k);
    return true;
  } catch (err) {
    console.error("[editor-medida] guardar", err);
    return false;
  }
}

/** Lo que dicen los textos cambiados es del ANUNCIO (todas sus medidas y mesas), no de una medida: aparte, por PSD. */
const TEXTOS = "hue-formatos-textos:v1";
/** Cuántos textos cambiados se leen de lo guardado, como mucho (un PSD real trae unos pocos). */
const TEXTOS_GUARDADOS_MAX = 200;

/** Los textos cambiados que se guardaron en este navegador para ese PSD (vacío si no hay o si el dato no sirve). */
export function textosGuardados(archivo: string): CambiosTexto {
  try {
    const v = JSON.parse(localStorage.getItem(`${TEXTOS}:${archivo}`) ?? "null") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>).slice(0, TEXTOS_GUARDADOS_MAX))
      // Una clave de verdad es «capa\nletras» (`claveTexto`); otra cosa no se lee.
      if (typeof t === "string" && t.length <= TEXTO_CAMBIADO_MAX && k.includes("\n") && k.length <= 2 * TEXTO_CAMBIADO_MAX) out[k] = t;
    return out;
  } catch (err) {
    console.warn("[editor-medida] leer los textos guardados", err);
    return {};
  }
}

/** Guarda (o, vacío, borra) los textos cambiados de ese PSD. false = el navegador no dejó (siguen en esta sesión). */
export function guardarTextos(archivo: string, cambios: CambiosTexto): boolean {
  try {
    const k = `${TEXTOS}:${archivo}`;
    if (Object.keys(cambios).length) localStorage.setItem(k, JSON.stringify(cambios));
    else localStorage.removeItem(k);
    return true;
  } catch (err) {
    console.error("[editor-medida] guardar los textos", err);
    return false;
  }
}
