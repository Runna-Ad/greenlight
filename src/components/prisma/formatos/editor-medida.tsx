"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { aplicarEdicion, topesPieza, type Acomodo, type Edicion, type Zona } from "@/lib/prisma/formatos/acomodo";
import { armarFondo, armarMedida, type TextoEscrito } from "@/lib/prisma/formatos/nitido";
import { avisosDePixeles } from "@/lib/prisma/formatos/revisar";
import { etiquetaPieza } from "@/lib/prisma/formatos/roles";
import { FP, rellenar } from "@/lib/prisma/formatos/copy";
import { DIALOGO_GRANDE, Franjas } from "./vista-grande";
import type { MaestroListo } from "@/lib/prisma/formatos/listo";

/**
 * HÜE Prisma › Formatos, puerta PSD — el editor de UNA medida (Pedro, 2026-10-15: "an edit button that opens that
 * specific size asset and you can only either move the elements around and or resize them and the save your changes").
 * Sólo mueve y cambia de tamaño piezas (sin deformarlas); el fondo no se toca. La vista se pinta con el mismo
 * `armarMedida` que la tarjeta, pero al tamaño de la pantalla, para que arrastrar no se trabe; la tarjeta vuelve a
 * pintar a tamaño real al guardar. Lo que se guarda es la `Edicion` (sólo lo que cambió); `aplicarEdicion` la revisa.
 */

type Pos = { x: number; y: number; k: number };
type Esquina = "nw" | "ne" | "sw" | "se";
type Modo = "mover" | Esquina;
/** `vivo`: ya pasó el umbral; antes de eso un clic sólo elige la pieza (el pulso de la mano no la mueve). */
type Arrastre = { pieza: number; modo: Modo; px: number; py: number; inicio: Pos; vivo: boolean; puntero: number };

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
/** En iPad (dedo) los botones del pie miden 44 px; con ratón, los de siempre. */
const DEDO = "pointer-coarse:h-11";
/** Espera tras el último cambio para leerlo en voz alta (un arrastre no dicta cada píxel). */
const ANUNCIO_MS = 500;

const igual = (a: Pos, b: Pos) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.k / b.k - 1) < 0.002;
/** Sólo las piezas que quedaron distintas del automático: eso es lo hecho a mano (y lo que se guarda). */
function soloCambios(pos: Record<number, Pos>, deAuto: Record<number, Pos>, puestas: Acomodo["puestas"]): Record<number, Pos> {
  const ed: Record<number, Pos> = {};
  for (const q of puestas) if (pos[q.pieza] && deAuto[q.pieza] && !igual(pos[q.pieza], deAuto[q.pieza])) ed[q.pieza] = pos[q.pieza];
  return ed;
}
const CURSOR: Record<Modo, string> ={ mover: "cursor-grabbing", nw: "cursor-nwse-resize", se: "cursor-nwse-resize", ne: "cursor-nesw-resize", sw: "cursor-nesw-resize" };

export function EditorMedida({
  ma,
  W,
  H,
  auto,
  inicial,
  zona,
  nombre,
  texto,
  lang,
  alGuardar,
  alCerrar,
}: {
  ma: MaestroListo;
  W: number;
  H: number;
  /** El acomodo automático de esta medida (sin edición): de ahí arranca y a eso vuelve «Volver al automático». */
  auto: Acomodo;
  inicial: Edicion | null;
  zona: Zona | null;
  /** El texto vuelto a escribir con la tipografía, como en la tarjeta. */
  texto?: TextoEscrito;
  /** «1080×1920», para el título y los avisos. */
  nombre: string;
  lang: Lang;
  alGuardar: (ed: Edicion | null) => void;
  alCerrar: () => void;
}) {
  const deAuto = useMemo(() => Object.fromEntries(auto.puestas.map((q) => [q.pieza, { x: q.x, y: q.y, k: q.k }])) as Record<number, Pos>, [auto]);
  const [pos, setPos] = useState<Record<number, Pos>>(() => ({ ...deAuto, ...(inicial ?? {}) }));
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
  const editado = useMemo(() => {
    const a = aplicarEdicion(ma, auto, soloCambios(pos, deAuto, auto.puestas), W, H, zona);
    if (a === auto) return a; // `auto` ya trae los suyos
    try {
      return { ...a, avisos: [...a.avisos, ...avisosDePixeles(ma, a, W, H)] };
    } catch (err) {
      console.error("[editor-medida] avisos de píxeles", err);
      return a;
    }
  }, [ma, auto, deAuto, pos, W, H, zona]);
  const tira = W / H >= TIRA;
  /** El ancho de la vista en pantalla: lo más grande que cabe en el marco con la forma de la medida. Sale de una sola
   *  medición (la del marco): con dos, el primer cuadro se pintaba al tamaño equivocado y luego otra vez. */
  const anchoCss = caja.w > 0 && caja.h > 0 ? Math.floor(Math.min(caja.w, (caja.h * W) / H)) : 0;
  const e = anchoCss > 0 ? anchoCss / W : 0;
  const cambiada = (i: number) => !!pos[i] && !!deAuto[i] && !igual(pos[i], deAuto[i]);
  const hayCambios = auto.puestas.some((q) => cambiada(q.pieza));
  // Distinto de como se abrió (lo automático más lo ya guardado): eso es lo que se perdería al cerrar.
  const sinGuardar = auto.puestas.some((q) => {
    const antes = inicial?.[q.pieza] ?? deAuto[q.pieza];
    return !!pos[q.pieza] && !!antes && !igual(pos[q.pieza], antes);
  });

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
      const chico: Acomodo = {
        ...editado,
        puestas: editado.puestas.map((q) => ({ ...q, k: q.k * s, x: q.x * s, y: q.y * s, w: q.w * s, h: q.h * s })),
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

  const solido = (i: number) => ma.piezas[i].solido;
  const poner = (i: number, p: Pos) => setPos((antes) => ({ ...antes, [i]: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, k: Math.round(p.k * 10000) / 10000 } }));
  /** Los mismos topes que `aplicarEdicion`: lo que se ve al arrastrar es lo que se guarda. */
  const topes = (i: number) => topesPieza(solido(i), W, H);
  /** Cambia el tamaño alrededor del centro (teclado). */
  const crecer = (i: number, f: number) => {
    const p = pos[i], s = solido(i), t = topes(i);
    const k = Math.min(t.max, Math.max(t.min, p.k * f));
    poner(i, { k, x: p.x + (s.w * (p.k - k)) / 2, y: p.y + (s.h * (p.k - k)) / 2 });
  };

  const enfocar = (i: number) => (document.querySelector(`[data-pieza="${i}"]`) as HTMLElement | null)?.focus({ preventScroll: true });

  const empezar = (ev: PointerEvent<HTMLElement>, i: number, m: Modo) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    setSel(i);
    const boton = ev.currentTarget.closest("[data-pieza]") as HTMLElement | null;
    // Con el foco en la pieza, las flechas y + / − siguen sobre ella después del clic.
    boton?.focus({ preventScroll: true });
    boton?.setPointerCapture(ev.pointerId);
    arrastre.current = { pieza: i, modo: m, px: ev.clientX, py: ev.clientY, inicio: pos[i], vivo: false, puntero: ev.pointerId };
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
    const dx = (ev.clientX - a.px) / e, dy = (ev.clientY - a.py) / e, s = solido(a.pieza), p0 = a.inicio;
    if (a.modo === "mover") {
      let x = p0.x + dx, y = p0.y + dy;
      const w = s.w * p0.k, h = s.h * p0.k;
      // Imán al centro de la medida, para centrar sin contar píxeles (con Alt, sin imán).
      const ix = !ev.altKey && Math.abs(x + w / 2 - W / 2) < IMAN_PX, iy = !ev.altKey && Math.abs(y + h / 2 - H / 2) < IMAN_PX;
      if (ix) x = W / 2 - w / 2;
      if (iy) y = H / 2 - h / 2;
      setIman({ x: ix, y: iy });
      poner(a.pieza, { x, y, k: p0.k });
      return;
    }
    // Esquina: la contraria se queda quieta y la pieza crece o se achica sin deformarse.
    const w0 = s.w * p0.k, h0 = s.h * p0.k;
    const oeste = a.modo === "nw" || a.modo === "sw", norte = a.modo === "nw" || a.modo === "ne";
    const ax = oeste ? p0.x + w0 : p0.x, ay = norte ? p0.y + h0 : p0.y;
    const qx = (oeste ? p0.x : p0.x + w0) + dx, qy = (norte ? p0.y : p0.y + h0) + dy;
    const t = topes(a.pieza);
    const k = Math.min(t.max, Math.max(t.min, Math.max(Math.abs(qx - ax) / s.w, Math.abs(qy - ay) / s.h)));
    poner(a.pieza, { k, x: oeste ? ax - s.w * k : ax, y: norte ? ay - s.h * k : ay });
  };
  function soltar() {
    arrastre.current = null;
    setIman({ x: false, y: false });
    setModo(null);
    setArrastrando(false);
  }
  /** Esc a medio arrastre: la pieza vuelve a donde estaba al empezar. */
  const cancelarArrastre = () => {
    const a = arrastre.current;
    if (!a) return false;
    poner(a.pieza, a.inicio);
    soltar();
    return true;
  };
  const tecla = (ev: KeyboardEvent<HTMLElement>, i: number) => {
    // Cmd/Ctrl + / − es el zoom del navegador y Alt + flecha es atrás/adelante: no son de la pieza.
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const paso = ev.shiftKey ? PASO_LARGO : PASO, p = pos[i];
    const flechas: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
    const f = flechas[ev.key];
    if (f) {
      ev.preventDefault();
      poner(i, { ...p, x: p.x + f[0], y: p.y + f[1] });
    } else if (ev.key === "+" || ev.key === "=") {
      // «+» casi siempre lleva Mayús: aquí Mayús no cambia el paso.
      ev.preventDefault();
      crecer(i, CRECE);
    } else if (ev.key === "-" || ev.key === "_") {
      ev.preventDefault();
      crecer(i, 1 / CRECE);
    }
  };

  const guardar = () => {
    const ed = soloCambios(pos, deAuto, auto.puestas);
    alGuardar(Object.keys(ed).length ? ed : null);
  };

  // Lo que se lee de la pieza elegida (también para el lector de pantalla).
  const estado = (() => {
    if (sel === null || !pos[sel] || !deAuto[sel]) return "";
    const p = pos[sel], l = ma.piezas[sel].letraMinPx;
    return rellenar(tx(FP.editorEstado, lang), {
      p: etiquetaPieza(ma.piezas[sel]),
      x: Math.round(p.x),
      y: Math.round(p.y),
      t: Math.round((p.k / deAuto[sel].k) * 100),
      l: typeof l === "number" && l > 0 ? rellenar(tx(FP.editorLetra, lang), { px: (l * p.k).toFixed(1) }) : "",
    });
  })();
  // Lo que oye el lector de pantalla: lo mismo más cuántos avisos hay, medio segundo después del último cambio.
  const dicho = estado && estado + rellenar(tx(FP.editorAvisosN, lang), { n: editado.avisos.length });
  useEffect(() => {
    const t = setTimeout(() => setAnuncio(dicho), ANUNCIO_MS);
    return () => clearTimeout(t);
  }, [dicho]);
  const pctX = (v: number) => `${(v / W) * 100}%`, pctY = (v: number) => `${(v / H) * 100}%`;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent
        // Casi toda la pantalla, para que quepa la medida grande: alto fijo y cada parte en su renglón (la vista se
        // lleva lo que sobra). `lang`: el diálogo sale fuera de la página y no hereda el idioma.
        lang={lang}
        className={cn(DIALOGO_GRANDE, "grid-rows-[auto_minmax(0,1fr)_auto]")}
        // Esc suelta primero un arrastre a medias; con cambios sin guardar, ni Esc ni un clic afuera cierran
        // (Cancelar y la X sí: son a propósito).
        onEscapeKeyDown={(ev) => {
          if (cancelarArrastre()) return ev.preventDefault();
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
        <div className={cn("grid min-h-0 gap-4 grid-rows-[minmax(0,1fr)_auto]", !tira && "lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-1")}>
          <div ref={marco} className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60 p-2">
            <div className="relative touch-none select-none" style={{ width: anchoCss || undefined, aspectRatio: `${W} / ${H}` }}>
              <canvas ref={lienzo} aria-hidden="true" className="block size-full rounded-sm" />
              {zona && <Franjas guia={zona} w={W} h={H} />}
              {iman.x && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary" />}
              {iman.y && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary" />}
              {editado.puestas.map((q) => {
                const elegida = sel === q.pieza;
                // Media esquina (px de pantalla): 24 px para agarrarla; en una pieza chica, 16, para que quede centro.
                const m = q.w * e < PIEZA_CHICA_PX || q.h * e < PIEZA_CHICA_PX ? 8 : 12;
                return (
                  <button
                    key={q.pieza}
                    type="button"
                    data-pieza={q.pieza}
                    aria-describedby="editor-ayuda"
                    aria-label={rellenar(tx(FP.editorPiezaAria, lang), { p: etiquetaPieza(ma.piezas[q.pieza]) })}
                    className={cn(
                      "absolute rounded-[2px] outline-hidden",
                      elegida && modo ? CURSOR[modo] : "cursor-grab",
                      // La elegida va al frente: sus esquinas se agarran aunque otra pieza la tape en parte. Las demás,
                      // con orilla blanca y oscura, para verse sobre un cielo claro o un fondo oscuro.
                      elegida ? "z-20 ring-2 ring-primary" : "shadow-[0_0_0_2px_rgb(0_0_0/0.3)] ring-1 ring-white/80 hover:ring-2 hover:ring-primary/70",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    )}
                    style={{ left: pctX(q.x), top: pctY(q.y), width: pctX(q.w), height: pctY(q.h) }}
                    onFocus={() => setSel(q.pieza)}
                    onPointerDown={(ev) => empezar(ev, q.pieza, "mover")}
                    onPointerMove={mover}
                    onPointerUp={soltar}
                    onPointerCancel={soltar}
                    onLostPointerCapture={soltar}
                    onKeyDown={(ev) => tecla(ev, q.pieza)}
                  >
                    {elegida &&
                      ESQUINAS.map((c) => (
                        <span
                          key={c}
                          aria-hidden="true"
                          onPointerDown={(ev) => empezar(ev, q.pieza, c)}
                          className={cn("absolute flex items-center justify-center", c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize")}
                          style={{ width: 2 * m, height: 2 * m, [c[0] === "n" ? "top" : "bottom"]: -m, [c[1] === "w" ? "left" : "right"]: -m }}
                        >
                          <span className="size-3 rounded-[2px] border border-primary bg-background" />
                        </span>
                      ))}
                  </button>
                );
              })}
            </div>
          </div>
          <div className={cn("grid max-h-48 min-h-0 min-w-0 content-start gap-3 overflow-y-auto text-sm md:grid-cols-3", !tira && "lg:max-h-none lg:grid-cols-1")}>
            <div className="flex flex-col gap-3">
              <p id="editor-ayuda" className="text-muted-foreground">
                {tx(FP.editorAyuda, lang)}
              </p>
              {/* A la vista, al momento; al lector de pantalla, medio segundo después del último cambio (abajo). */}
              <p className="min-h-10 text-foreground">{estado}</p>
              <p role="status" className="sr-only">
                {anuncio}
              </p>
              {noPinto && <p role="alert" className="text-foreground">{tx(FP.editorNoPinto, lang)}</p>}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">{tx(FP.editorPiezas, lang)}</h3>
              <ul className="mt-1 space-y-1">
                {auto.puestas.map((q) => {
                  const p = pos[q.pieza], cambio = cambiada(q.pieza);
                  const n = etiquetaPieza(ma.piezas[q.pieza]);
                  return (
                    <li key={q.pieza} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-current={sel === q.pieza || undefined}
                        className={cn(
                          "min-h-9 min-w-0 flex-1 truncate rounded-md border-l-2 pointer-coarse:min-h-11 border-transparent px-2 text-left hover:bg-secondary",
                          sel === q.pieza && "border-primary bg-secondary font-medium",
                        )}
                        onClick={() => enfocar(q.pieza)}
                      >
                        {n}{" "}
                        {p && (
                          <span className="text-muted-foreground">
                            · {Math.round((p.k / deAuto[q.pieza].k) * 100)} %{cambio && ` · ${tx(FP.editorCambiada, lang)}`}
                          </span>
                        )}
                      </button>
                      {cambio && (
                        // Al volver, el foco pasa a la pieza: este botón desaparece y el teclado no se pierde.
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            poner(q.pieza, deAuto[q.pieza]);
                            enfocar(q.pieza);
                          }}
                          aria-label={rellenar(tx(FP.editorPiezaAutoAria, lang), { p: n })}
                          title={tx(FP.editorPiezaAuto, lang)}
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  );
                })}
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
          <Button variant="ghost" className={DEDO} disabled={!hayCambios} onClick={() => setPos({ ...deAuto })}>
            <RotateCcw className="size-4" aria-hidden="true" /> {tx(FP.editorAuto, lang)}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <span role="status" className={cn("text-xs", escNegado ? "font-medium text-foreground" : "text-muted-foreground")}>
              {sinGuardar ? tx(escNegado ? FP.editorSinGuardarEsc : FP.editorSinGuardar, lang) : ""}
            </span>
            <Button variant="outline" className={DEDO} onClick={alCerrar}>
              {tx(FP.editorCancelar, lang)}
            </Button>
            <Button className={DEDO} onClick={guardar}>
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

/** La edición que se guardó en este navegador para esa medida de ese PSD; null si no hay o si el PSD ya no es igual. */
export function edicionGuardada(archivo: string, ma: MaestroListo, W: number, H: number, contexto: string): Edicion | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveGuardada(archivo, ma, W, H, contexto)) ?? "null") as { huella?: unknown; ed?: unknown } | null;
    if (!v || v.huella !== huella(ma) || !v.ed || typeof v.ed !== "object") return null;
    const ed: Record<number, Pos> = {};
    for (const [i, p] of Object.entries(v.ed as Record<string, Partial<Pos> | null>)) {
      const n = Number(i);
      if (!Number.isInteger(n) || n < 0 || n >= ma.piezas.length || !p) continue;
      const { x, y, k } = p;
      if (typeof x === "number" && typeof y === "number" && typeof k === "number" && [x, y, k].every(Number.isFinite) && k > 0) ed[n] = { x, y, k };
    }
    return Object.keys(ed).length ? ed : null;
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
    if (ed) localStorage.setItem(k, JSON.stringify({ huella: huella(ma), ed }));
    else localStorage.removeItem(k);
    return true;
  } catch (err) {
    console.error("[editor-medida] guardar", err);
    return false;
  }
}
