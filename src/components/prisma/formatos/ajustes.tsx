"use client";

import { Fragment, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { AlertTriangle, Check, ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { tx, type Lang } from "@/lib/prisma/copy";
import { CANALES, type Canal } from "@/lib/prisma/formatos/acomodo";
import { FP, rellenar } from "@/lib/prisma/formatos/copy";
import { MEDIDAS_MAX } from "@/lib/prisma/formatos/listo";

/**
 * HÜE Prisma › Formatos: la barra de ajustes de arriba (rediseño B19, Pedro 2026-10-15: las medidas "as pills … you can
 * click them on and off … add more sizes manually"; los canales "pills with the channel name and color"). Aquí sólo se
 * pinta y se avisa: el estado vive en formatos-psd.tsx.
 *
 * Forma de cada cosa (una regla para toda la página): lo que se prende y se apaga es pastilla redonda; lo que abre un
 * detalle (chips de estado) y los botones son de esquina chica; las tarjetas, de esquina grande. Es para escritorio y
 * iPad (Pedro: "no smaller"): con dedo (`pointer-coarse`) todo lo que se toca mide 44 px.
 */

export type Medida = { w: number; h: number };
/** Una medida del panel: las de la lista de DiDi y las que la persona agregó (`propia`, ésas se pueden borrar). */
export type MedidaLista = Medida & { propia: boolean };
export const clave = (m: Medida) => `${m.w}x${m.h}`;
export const etiqueta = (m: Medida) => `${m.w}×${m.h}`;

/** La forma de una medida, para agruparla igual en las pastillas y en los resultados. Un cuadrado cae en «Horizontal». */
export type Forma = "vertical" | "horizontal" | "banner";
export const FORMAS: readonly Forma[] = ["vertical", "horizontal", "banner"];
export const formaDe = (w: number, h: number): Forma => (w / h < 0.95 ? "vertical" : w / h < 3 ? "horizontal" : "banner");
export const NOMBRE_FORMA = { vertical: FP.formaVertical, horizontal: FP.formaHorizontal, banner: FP.formaBanner } as const;
/** Lo menos que mide una tarjeta de cada forma (una horizontal angosta no se puede juzgar); caben las que quepan. */
export const COLUMNAS: Record<Forma, string> = {
  vertical: "grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]",
  horizontal: "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]",
  banner: "grid-cols-[repeat(auto-fill,minmax(24rem,1fr))]",
};

export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const PASTILLA = cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors pointer-coarse:h-11", FOCO);
/** Prendida: tinte de la marca y borde, más la palomita (el color no es la única señal). Mismo peso de letra prendida
 *  y apagada: si cambiara, la pastilla crecería y las de al lado brincarían al hacer clic. */
const PRENDIDA = "border-primary/50 bg-primary/10 text-foreground";
const APAGADA = "border-border bg-card text-muted-foreground";

function PastillaMedida({ m, on, lang, alAlternar, alQuitar }: { m: MedidaLista; on: boolean; lang: Lang; alAlternar: (k: string) => void; alQuitar: (k: string) => void }) {
  const k = clave(m);
  // Apagada lleva «+» y prendida la palomita: mismo ancho, así las de al lado no brincan al hacer clic.
  const contenido = (
    <>
      {on ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Plus className="size-3.5 shrink-0" aria-hidden="true" />}
      {etiqueta(m)}
    </>
  );
  if (!m.propia) {
    return (
      <button type="button" aria-pressed={on} onClick={() => alAlternar(k)} className={cn(PASTILLA, on ? cn(PRENDIDA, "hover:bg-primary/15") : cn(APAGADA, "hover:border-primary/40 hover:text-foreground"))}>
        {contenido}
      </button>
    );
  }
  // Una agregada a mano: borde punteado (no es de la lista de DiDi) y su «×» para borrarla (dos botones, cada uno con
  // su nombre; con dedo la «×» crece a 44 px de ancho).
  return (
    <span className={cn("inline-flex h-8 items-center rounded-full border border-dashed text-sm font-medium transition-colors pointer-coarse:h-11", on ? PRENDIDA : APAGADA)}>
      <button type="button" aria-pressed={on} onClick={() => alAlternar(k)} className={cn("inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full pr-1 pl-3 tabular-nums hover:text-foreground", FOCO)}>
        {contenido}
      </button>
      <button
        type="button"
        onClick={() => alQuitar(k)}
        aria-label={rellenar(tx(FP.medidaQuitarAria, lang), { m: etiqueta(m) })}
        className={cn("inline-flex h-full cursor-pointer items-center rounded-r-full pr-2.5 pl-1 text-muted-foreground hover:text-foreground pointer-coarse:min-w-11 pointer-coarse:justify-center", FOCO)}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

type Nota = { mal: boolean; texto: string };

/** «Agregar medida»: una o la lista del cliente pegada tal cual (la lee `leerMedidas`, como antes el cuadro de texto).
 *  `ref` = el botón que la abre: a él vuelve el foco cuando se borra una pastilla (la que tenía el foco desaparece). */
function AgregarMedida({ lang, alAgregar, ref }: { lang: Lang; alAgregar: (texto: string, soloEstas: boolean) => Nota | null; ref?: Ref<HTMLButtonElement> }) {
  const id = useId();
  const campo = useRef<HTMLTextAreaElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState<Nota | null>(null);
  const usar = (soloEstas: boolean) => {
    const r = alAgregar(texto, soloEstas);
    setNota(r);
    if (!r?.mal) setTexto("");
    // Con un error el foco vuelve al campo (marcado como inválido); sin nada que decir se cierra (lo hecho se anuncia
    // en la página); con una nota, se queda abierto para leerla.
    if (r?.mal) campo.current?.focus();
    if (!r) setAbierto(false);
  };
  return (
    <Popover
      open={abierto}
      onOpenChange={(o) => {
        setAbierto(o);
        if (!o) setNota(null);
      }}
    >
      <PopoverTrigger asChild>
        <button ref={ref} type="button" className={cn(PASTILLA, "w-fit border-dashed border-border bg-transparent text-foreground hover:border-primary hover:text-primary")}>
          <Plus className="size-3.5 shrink-0" aria-hidden="true" /> {tx(FP.agregarMedida, lang)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-labelledby={`${id}-titulo`} lang={lang} className="w-80 gap-0 p-3 text-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            usar(false);
          }}
        >
          <label id={`${id}-titulo`} htmlFor={`${id}-campo`} className="text-sm font-medium text-foreground">
            {tx(FP.agregarMedida, lang)}
          </label>
          <p id={`${id}-ayuda`} className="mt-0.5 text-xs text-muted-foreground">
            {tx(FP.agregarAyuda, lang)} {tx(FP.agregarSoloAyuda, lang)}
          </p>
          {/* Un textarea, no un input: al pegar una lista en varios renglones, un input se come los saltos y junta las medidas. */}
          <textarea
            ref={campo}
            id={`${id}-campo`}
            rows={3}
            maxLength={2000}
            value={texto}
            placeholder="300×600"
            spellCheck={false}
            onChange={(e) => {
              setTexto(e.target.value);
              setNota(null);
            }}
            onKeyDown={(e) => {
              // Enter agrega y Mayús+Enter hace renglón. Con dedo no (el teclado del iPad no tiene Mayús+Enter: ahí
              // Enter hace renglón y se agrega con el botón), ni mientras se compone una letra con acento.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia("(pointer: coarse)").matches) {
                e.preventDefault();
                usar(false);
              }
            }}
            aria-invalid={nota?.mal || undefined}
            aria-describedby={nota ? `${id}-ayuda ${id}-nota` : `${id}-ayuda`}
            className="mt-2 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:text-base"
          />
          {nota && (
            <p id={`${id}-nota`} role={nota.mal ? "alert" : "status"} className="mt-1 flex items-start gap-1.5 text-xs text-foreground">
              {nota.mal && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />} {nota.texto}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button type="submit" size="sm" className="pointer-coarse:h-11">
              {tx(FP.agregarBoton, lang)}
            </Button>
            <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => usar(true)}>
              {tx(FP.agregarSoloEstas, lang)}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Las medidas en pastillas, agrupadas por forma: clic para prender o apagar, «Agregar medida» para sumar. */
export function PastillasMedidas({
  lista,
  apagadas,
  sinLugar,
  lang,
  alAlternar,
  alQuitar,
  alAgregar,
  alRestablecer,
}: {
  lista: readonly MedidaLista[];
  apagadas: ReadonlySet<string>;
  /** Prendidas que no caben (tope de medidas o de píxeles por anuncio): no salen en los resultados. */
  sinLugar: number;
  lang: Lang;
  alAlternar: (k: string) => void;
  alQuitar: (k: string) => void;
  /** Lo que hay que enseñar junto al campo; null = todo bien (se cierra). */
  alAgregar: (texto: string, soloEstas: boolean) => Nota | null;
  alRestablecer: () => void;
}) {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const agregar = useRef<HTMLButtonElement>(null);
  const prendidas = lista.filter((m) => !apagadas.has(clave(m))).length;
  const propias = lista.filter((m) => m.propia).length;
  const cambiada = apagadas.size > 0 || propias > 0;
  // El botón con el foco desaparece al usarlo (la «×» de su pastilla; «Volver a la lista» cuando ya no hay cambios): el
  // foco pasa a algo que sigue ahí, no al tope de la página.
  const quitar = (k: string) => {
    alQuitar(k);
    agregar.current?.focus();
  };
  const restablecer = () => {
    alRestablecer();
    titulo.current?.focus();
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="text-sm font-semibold text-foreground outline-none">
          {tx(FP.medidasTitulo, lang)}
        </h2>
        <p className="text-xs text-muted-foreground">
          {tx(FP.medidasDeDidi, lang)}
          {propias ? rellenar(tx(FP.medidasMas, lang), { n: propias }) : ""}, {rellenar(tx(FP.medidasPrendidas, lang), { n: prendidas, t: lista.length })}. {tx(FP.medidasAyuda, lang)}
        </p>
        {cambiada && (
          <button type="button" onClick={restablecer} className={cn("inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground pointer-coarse:min-h-11", FOCO)}>
            <RotateCcw className="size-3" aria-hidden="true" /> {tx(FP.medidasRestablecer, lang)}
          </button>
        )}
      </div>
      <div className="mt-2 grid items-start gap-x-3 gap-y-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
        {FORMAS.map((f) => {
          const grupo = lista.filter((m) => formaDe(m.w, m.h) === f);
          if (!grupo.length) return null;
          return (
            <Fragment key={f}>
              {/* El rótulo se alinea con el centro del primer renglón de pastillas (32 px, o 44 con dedo). */}
              <span id={`${id}-${f}`} className="text-xs text-muted-foreground sm:pt-2 pointer-coarse:sm:pt-3.5">
                {tx(NOMBRE_FORMA[f], lang)}
              </span>
              <div role="group" aria-labelledby={`${id}-titulo ${id}-${f}`} className="flex flex-wrap gap-1.5">
                {grupo.map((m) => (
                  <PastillaMedida key={clave(m)} m={m} on={!apagadas.has(clave(m))} lang={lang} alAlternar={alAlternar} alQuitar={quitar} />
                ))}
              </div>
            </Fragment>
          );
        })}
        <span aria-hidden="true" className="hidden sm:block" />
        <AgregarMedida ref={agregar} lang={lang} alAgregar={alAgregar} />
      </div>
      {sinLugar > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" aria-hidden="true" /> {rellenar(tx(FP.listaTope, lang), { n: sinLugar, max: MEDIDAS_MAX })}
        </p>
      )}
    </div>
  );
}

/** El color de cada app (tokens --plat-*: cambian solos en modo oscuro). Sólo el punto lleva color: el texto, no. */
const COLOR_CANAL: Record<Canal, string> = {
  "ig-stories": "var(--plat-ig)",
  "ig-reels": "var(--plat-ig)",
  "fb-stories": "var(--plat-fb)",
  "fb-reels": "var(--plat-fb)",
  tiktok: "var(--plat-tt)",
};

/** El canal en pastillas: uno a la vez («Ninguno» = no se marca nada). `detalle` = lo que tapa el elegido. */
export function PastillasCanal({ canal, n916, detalle, lang, alElegir }: { canal: Canal | null; n916: number; detalle: string; lang: Lang; alElegir: (c: Canal | null) => void }) {
  const id = useId();
  const opciones: (Canal | null)[] = [null, ...(Object.keys(CANALES) as Canal[])];
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-sm font-semibold text-foreground">
          {tx(FP.canal, lang)}
        </h2>
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {n916 ? rellenar(tx(FP.canalAyuda, lang), { n: n916 }) : tx(FP.zonaSin916, lang)}
        </p>
      </div>
      <div role="group" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-ayuda`} className="mt-2 flex flex-wrap gap-1.5">
        {opciones.map((c) => {
          const on = canal === c;
          return (
            <button key={c ?? "ninguno"} type="button" aria-pressed={on} onClick={() => alElegir(c)} className={cn(PASTILLA, on ? cn(PRENDIDA, "hover:bg-primary/15") : cn(APAGADA, "hover:border-primary/40 hover:text-foreground"))}>
              {/* El lugar de la palomita se guarda aunque no esté: elegir otro canal no mueve las demás pastillas. */}
              <Check className={cn("size-3.5 shrink-0", !on && "invisible")} aria-hidden="true" />
              {c && <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: COLOR_CANAL[c] }} />}
              {c ? CANALES[c].nombre : tx(FP.zonaNinguno, lang)}
            </button>
          );
        })}
      </div>
      {detalle && <p className="mt-1.5 text-xs text-foreground">{detalle}</p>}
    </div>
  );
}

export type Tono = "ok" | "aviso" | "neutro";
const TONO: Record<Tono, string> = {
  ok: "border-status-completed/40 bg-status-completed/8",
  aviso: "border-status-warning/50 bg-status-warning/10",
  neutro: "border-border bg-card",
};

/**
 * Un estado en una línea (tipografías, carpetas, notas del archivo) que abre su detalle al hacer clic, en vez de la
 * tarjeta grande de antes. El texto va en tinta normal y el color sólo en el borde, el fondo y el ícono (contraste AA).
 * `titulo` = el id del encabezado de adentro: le pone nombre al cuadro que se abre (si no, el lector dice "diálogo").
 */
export function ChipEstado({ tono, icono, titulo, lang, children, detalle }: { tono: Tono; icono: ReactNode; titulo: string; lang: Lang; children: ReactNode; detalle: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-left text-sm text-foreground transition-colors hover:border-primary/50 data-[state=open]:border-primary/60 pointer-coarse:min-h-11",
            FOCO,
            TONO[tono],
          )}
        >
          {icono}
          <span className="min-w-0">{children}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      {/* El cuadro se pinta fuera de la página (portal): lleva su propio idioma para que el lector lo pronuncie bien. */}
      <PopoverContent align="start" aria-labelledby={titulo} lang={lang} className="max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(26rem,calc(100vw-2rem))] gap-0 overflow-y-auto p-3 text-sm">
        {detalle}
      </PopoverContent>
    </Popover>
  );
}
