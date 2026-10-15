"use client";

/**
 * La vista grande de una medida (Pedro, 2026-10-15: "if you click a card it opens real size so you can see it bigger
 * or at least on its real size"). Copia el lienzo de la tarjeta, que ya está a tamaño real y es el mismo que baja como
 * PNG: no se vuelve a pintar nada. Dos modos: ajustada a la pantalla (crece si la medida es chica) y tamaño real
 * (100 %, con desplazamiento si no cabe).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AlertTriangle, CircleCheck, X } from "lucide-react";
import { DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import type { Zona } from "@/lib/prisma/formatos/acomodo";
import { FP, rellenar } from "@/lib/prisma/formatos/copy";
import { FOCO } from "./ajustes";

const pct = (v: number, de: number) => `${(v / de) * 100}%`;
/** Desde este aumento (en píxeles de la pantalla, no de la página) los píxeles se ven como cuadritos, lo que de
 *  verdad trae el PNG, en vez de borrosos. En Retina, «Tamaño real» ya es 2. */
const PIXELES_DESDE = 2;
/** Los diálogos grandes de Formatos (este y el editor): casi toda la pantalla, para que quepa la medida. */
export const DIALOGO_GRANDE = "h-[calc(100dvh-2rem)] sm:max-w-[min(1600px,calc(100%-2rem))]";

/** Las franjas de la zona segura del canal, encima de la vista (nunca dentro del lienzo ni del PNG). Sin `texto`,
 *  sólo la raya (el editor). No atrapan el ratón: debajo se arrastran piezas o se abre la vista. */
export function Franjas({ guia, w, h, texto }: { guia: Zona; w: number; h: number; texto?: string }) {
  return (
    <>
      {guia.top > 0 && (
        <span aria-hidden="true" className="p-zona pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center" style={{ height: pct(guia.top, h) }}>
          {texto && <span className="p-zona-texto">{texto}</span>}
        </span>
      )}
      {guia.bottom > 0 && (
        <span aria-hidden="true" className="p-zona pointer-events-none absolute inset-x-0 bottom-0 flex items-start justify-center" style={{ height: pct(guia.bottom, h) }}>
          {texto && <span className="p-zona-texto">{texto}</span>}
        </span>
      )}
      {/* Los costados van ENTRE las franjas de arriba y abajo: las esquinas no se rayan dos veces. */}
      {guia.left > 0 && <span aria-hidden="true" className="p-zona pointer-events-none absolute left-0" style={{ top: pct(guia.top, h), bottom: pct(guia.bottom, h), width: pct(guia.left, w) }} />}
      {guia.right > 0 && <span aria-hidden="true" className="p-zona pointer-events-none absolute right-0" style={{ top: pct(guia.top, h), bottom: pct(guia.bottom, h), width: pct(guia.right, w) }} />}
    </>
  );
}

/** El lienzo de la tarjeta copiado al abrir, y otra vez cada vez que la tarjeta se vuelve a pintar (`version`: llegan
 *  las tipografías o cambia algo con el diálogo abierto). Vive dentro del diálogo: se arma cada vez que se abre. */
function Copia({ fuente, version, pixeles, lang }: { fuente: RefObject<HTMLCanvasElement | null>; version: number; pixeles: boolean; lang: Lang }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [mal, setMal] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const l = lienzo.current, f = fuente.current;
      if (!l || !f) return;
      try {
        l.width = f.width;
        l.height = f.height;
        // Sin contexto (el iPad se quedó sin memoria de lienzos) se dice: nunca una vista en blanco que parezca buena.
        const c = l.getContext("2d");
        if (!c) throw new Error("sin 2d");
        c.drawImage(f, 0, 0);
        setMal(false);
      } catch (err) {
        console.error("[vista-grande] copiar", err);
        setMal(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [fuente, version]);
  // Al cerrar se suelta la memoria de la copia ya (Safari tarda en soltar un lienzo que ya no está en la página).
  useEffect(() => {
    const l = lienzo.current;
    return () => {
      if (l) l.width = l.height = 0;
    };
  }, []);
  return (
    <>
      <canvas ref={lienzo} aria-hidden="true" className={cn("block size-full", mal && "invisible")} style={{ imageRendering: pixeles ? "pixelated" : undefined }} />
      {mal && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center gap-1.5 p-2 text-sm text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" /> {tx(FP.noPinto, lang)}
        </p>
      )}
    </>
  );
}

type Modo = "ajustar" | "real";

type Props = {
  /** El lienzo de la tarjeta (ya pintado a w × h). */
  fuente: RefObject<HTMLCanvasElement | null>;
  /** Cuántas veces se ha pintado la tarjeta: al cambiar, se vuelve a copiar. */
  version: number;
  w: number;
  h: number;
  nombre: string;
  lang: Lang;
  /** Lo que va encima de la imagen (las franjas del canal). */
  children?: ReactNode;
};

/** El contenido del diálogo; el `<Dialog>` y su disparador (la vista de la tarjeta) viven en la tarjeta. */
export function VistaGrande(props: Props) {
  return (
    // Sin la X de la esquina (28 px, difícil al dedo y con «Cerrar» fijo en español): «Cerrar» va junto al zoom.
    <DialogContent lang={props.lang} showCloseButton={false} className={cn(DIALOGO_GRANDE, "grid-rows-[auto_minmax(0,1fr)]")}>
      <Contenido {...props} />
    </DialogContent>
  );
}

/** Se arma cada vez que se abre el diálogo: siempre empieza ajustada a la pantalla. */
function Contenido({ fuente, version, w, h, nombre, lang, children }: Props) {
  const [modo, setModo] = useState<Modo>("ajustar");
  // El espacio libre para la imagen: con él se calcula el aumento que la hace caber.
  const [caja, setCaja] = useState({ w: 0, h: 0 });
  const marco = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([r]) => setCaja({ w: r.contentRect.width, h: r.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const medida = caja.w > 0 && caja.h > 0;
  const ajuste = medida ? Math.min(caja.w / w, caja.h / h) : 0;
  const escala = modo === "real" ? 1 : ajuste;
  // A tamaño real y más grande que la ventana: el recuadro se desplaza, y entonces entra al Tab (flechas).
  const desborda = modo === "real" && medida && (w > caja.w || h > caja.h);
  const titulo = rellenar(tx(FP.lienzoAria, lang), { m: nombre });
  const opciones: { m: Modo; texto: string }[] = [
    // Antes de medir no hay porcentaje que decir (sería «0 %»).
    { m: "ajustar", texto: medida ? rellenar(tx(FP.vistaAjustar, lang), { p: Math.round(ajuste * 100) }) : tx(FP.vistaAjustarSolo, lang) },
    { m: "real", texto: tx(FP.vistaReal, lang) },
  ];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base tabular-nums">{titulo}</DialogTitle>
        <DialogDescription className="text-sm">{tx(FP.vistaDescripcion, lang)}</DialogDescription>
        <div role="group" aria-label={tx(FP.vistaZoom, lang)} className="mt-1 flex flex-wrap gap-1.5">
          {opciones.map(({ m, texto }) => (
            <Button
              key={m}
              variant={modo === m ? "secondary" : "outline"}
              size="sm"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={cn("min-h-9 tabular-nums pointer-coarse:min-h-11", modo === m && "font-semibold")}
            >
              {modo === m && <CircleCheck className="size-3.5" aria-hidden="true" />}
              {texto}
            </Button>
          ))}
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="ml-auto min-h-9 pointer-coarse:min-h-11">
              <X className="size-3.5" aria-hidden="true" /> {tx(FP.vistaCerrar, lang)}
            </Button>
          </DialogClose>
        </div>
      </DialogHeader>
      {/* `m-auto` dentro de un flex centra la imagen cuando cabe y, cuando no, la deja desplazarse completa (centrarla
          con place-items cortaría la orilla de arriba y la de la izquierda). */}
      <div ref={marco} role="region" aria-label={titulo} tabIndex={desborda ? 0 : undefined} className={cn("flex min-h-0 overflow-auto rounded-lg bg-secondary/60 p-2", FOCO)}>
        <div className="relative m-auto shrink-0" style={{ width: Math.floor(w * escala), height: Math.floor(h * escala) }}>
          <Copia fuente={fuente} version={version} lang={lang} pixeles={escala * (window.devicePixelRatio || 1) >= PIXELES_DESDE} />
          {children}
        </div>
      </div>
    </>
  );
}
