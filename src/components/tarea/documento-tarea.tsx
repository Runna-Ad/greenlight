"use client";

import {
  CirclePlay,
  Type,
  Headphones,
  Presentation,
  Scissors,
  Lightbulb,
  MessagesSquare,
  Clapperboard,
  Trash2,
  Plus,
  Clock,
} from "lucide-react";
import type { ComponentType } from "react";

import { Campo } from "./campo";
import { ReferenciasPlano, type RefVista } from "./referencias-plano";
import { Linkify } from "@/components/ui/linkify";
import { parseDialogo } from "@/lib/dialogo";
import { readTimeS } from "@/lib/plantilla";
import type { PlanoVista, EstaticoVista } from "./preview-slide";

export type ModoDoc = "editable" | "lectura";

/** Íconos de cada campo — del mockup de Pedro. */
const IconoAccion = CirclePlay;
const IconoCopy = Type;
const IconoSfx = Headphones;
const IconoGfx = Presentation;
const IconoEdicion = Scissors;
const IconoRefe = Lightbulb;
const IconoDialogo = MessagesSquare;
const IconoPlano = Clapperboard;

type PH = {
  titulo: string;
  accion: string;
  copy_in: string;
  sfx: string;
  gfx: string;
  edicion: string;
  dialogo: string;
};

type PHEstatico = {
  copy_titulo: string;
  copy_subtitulo: string;
  copy_cta: string;
  legales_extra: string;
  referencia_nota: string;
};

/**
 * EL DOCUMENTO — una sola vista que se ve como el slide del cliente.
 *
 * `modo="editable"` (agencia): cada campo es editable EN SU LUGAR (Campo inline,
 * con autoguardado + correcciones); los campos vacíos se muestran como afordancia
 * para llenarlos. `modo="lectura"` ("ver como cliente"): sólo lo que está lleno,
 * de sólo lectura — así la agencia edita exactamente lo que verá el cliente.
 */
export function DocumentoTarea({
  modo,
  esEstatico,
  planos,
  estatico,
  refsPorPlano,
  refsEstatico,
  ph,
  phEstatico,
  soloLectura,
  onEditarPlano,
  onEditarEstatico,
  onNuevoPlano,
  onQuitarPlano,
}: {
  modo: ModoDoc;
  esEstatico: boolean;
  planos: PlanoVista[];
  estatico: EstaticoVista | null;
  refsPorPlano: Record<string, RefVista[]>;
  refsEstatico: RefVista[];
  ph: PH;
  phEstatico: PHEstatico;
  soloLectura: boolean;
  onEditarPlano: (id: string, campo: keyof PlanoVista, valor: string) => void;
  onEditarEstatico: (campo: keyof EstaticoVista, valor: string) => void;
  onNuevoPlano: () => void;
  onQuitarPlano: (id: string) => void;
}) {
  const lectura = modo === "lectura";

  if (esEstatico && estatico) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <EncabezadoPlano titulo="Estático" />
        <div className="grid gap-x-6 gap-y-3 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <CampoDoc modo={modo} icono={IconoCopy} label="Título" tabla="estaticos" filaId={estatico.id}
              campo="copy_titulo" grupo="Estático" valor={estatico.copy_titulo} placeholder={phEstatico.copy_titulo}
              rows={2} soloLectura={soloLectura} onCambio={(v) => onEditarEstatico("copy_titulo", v)} />
            <CampoDoc modo={modo} icono={IconoCopy} label="Subtítulo" tabla="estaticos" filaId={estatico.id}
              campo="copy_subtitulo" grupo="Estático" valor={estatico.copy_subtitulo} placeholder={phEstatico.copy_subtitulo}
              rows={3} soloLectura={soloLectura} onCambio={(v) => onEditarEstatico("copy_subtitulo", v)} />
            <CampoDoc modo={modo} icono={IconoCopy} label="Botón CTA" tabla="estaticos" filaId={estatico.id}
              campo="copy_cta" grupo="Estático" valor={estatico.copy_cta} placeholder={phEstatico.copy_cta}
              rows={1} soloLectura={soloLectura} onCambio={(v) => onEditarEstatico("copy_cta", v)} />
            <CampoDoc modo={modo} icono={IconoEdicion} label="Legales" tabla="estaticos" filaId={estatico.id}
              campo="legales_extra" grupo="Estático" valor={estatico.legales_extra} placeholder={phEstatico.legales_extra}
              rows={2} soloLectura={soloLectura} />
            <CampoDoc modo={modo} icono={IconoRefe} label="Nota de diseño" tabla="estaticos" filaId={estatico.id}
              campo="referencia_nota" grupo="Estático" valor={estatico.referencia_nota} placeholder={phEstatico.referencia_nota}
              rows={3} soloLectura={soloLectura} onCambio={(v) => onEditarEstatico("referencia_nota", v)} />
          </div>
          <RefsDoc modo={modo} owner={{ tipo: "estatico", id: estatico.id }} refs={refsEstatico}
            soloImagenes etiqueta="Imágenes de referencia" soloLectura={soloLectura} />
        </div>
      </div>
    );
  }

  // ── Video (planos) ──
  const planosVisibles = lectura
    ? planos.filter((p) => planoTieneContenido(p, refsPorPlano[p.id] ?? []))
    : planos;

  return (
    <div className="space-y-3">
      {planosVisibles.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {lectura ? "Todavía no hay nada que mostrar." : "Todavía no hay planos. Agrega el primero para empezar."}
        </p>
      )}

      {planosVisibles.map((p) => {
        const refs = refsPorPlano[p.id] ?? [];
        return (
          <div key={p.id} className="gl-enter overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {/* Encabezado del plano — el "PLANO N" a todo lo ancho. En editable el
                título es editable en su lugar; en lectura es sólo el rótulo. */}
            <div className="flex items-center gap-2 bg-secondary px-3 py-1.5">
              {/* En lectura el encabezado ES el título (ya trae "Plano N - escena");
                  en editable es sólo "Plano N" y el título se edita como campo
                  (primera fila) para conservar autoguardado + correcciones. */}
              {lectura ? (
                <span className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground">
                  {p.titulo?.trim() || `Plano ${p.orden}`}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Plano {p.orden}
                </span>
              )}
              {!lectura && (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="size-3" /> {readTimeS(p.dialogo)}s
                </span>
              )}
              {!lectura && !soloLectura && (
                <button
                  onClick={() => onQuitarPlano(p.id)}
                  aria-label={`Borrar plano ${p.orden}`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-status-corrections"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>

            {/* Cuerpo: motion a la izquierda, diálogo a la derecha */}
            <div className="grid gap-x-6 gap-y-2 p-3 md:grid-cols-2">
              <div className="space-y-2">
                {!lectura && (
                  <CampoDoc modo={modo} icono={IconoPlano} label="Plano" tabla="planos" filaId={p.id}
                    campo="titulo" grupo={`Plano ${p.orden}`} valor={p.titulo} placeholder={ph.titulo}
                    rows={1} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "titulo", v)} />
                )}
                <CampoDoc modo={modo} icono={IconoAccion} label="Acción" tabla="planos" filaId={p.id}
                  campo="accion" grupo={`Plano ${p.orden}`} valor={p.accion} placeholder={ph.accion}
                  rows={2} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "accion", v)} />
                <CampoDoc modo={modo} icono={IconoCopy} label="Copy in" tabla="planos" filaId={p.id}
                  campo="copy_in" grupo={`Plano ${p.orden}`} valor={p.copy_in} placeholder={ph.copy_in}
                  rows={2} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "copy_in", v)} />
                <CampoDoc modo={modo} icono={IconoSfx} label="SFX" tabla="planos" filaId={p.id}
                  campo="sfx" grupo={`Plano ${p.orden}`} valor={p.sfx} placeholder={ph.sfx}
                  rows={1} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "sfx", v)} />
                <CampoDoc modo={modo} icono={IconoGfx} label="GFX" tabla="planos" filaId={p.id}
                  campo="gfx" grupo={`Plano ${p.orden}`} valor={p.gfx} placeholder={ph.gfx}
                  rows={1} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "gfx", v)} />
                <CampoDoc modo={modo} icono={IconoEdicion} label="Edición" tabla="planos" filaId={p.id}
                  campo="edicion" grupo={`Plano ${p.orden}`} valor={p.edicion} placeholder={ph.edicion}
                  rows={1} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "edicion", v)} />
              </div>

              <div className="min-w-0">
                {lectura ? (
                  <DialogoLectura label="Diálogos" texto={p.dialogo} />
                ) : (
                  <CampoDoc modo={modo} icono={IconoDialogo} label="Diálogos" tono="orange" tabla="planos" filaId={p.id}
                    campo="dialogo" grupo={`Plano ${p.orden}`} valor={p.dialogo} placeholder={ph.dialogo}
                    rows={6} soloLectura={soloLectura} onCambio={(v) => onEditarPlano(p.id, "dialogo", v)} />
                )}
              </div>
            </div>

            {/* Referencias dockeadas al fondo del plano. Editable: siempre (dropzone).
                Lectura: sólo si hay algo. */}
            {(!lectura || refs.length > 0) && (
              <div className="border-t border-border px-3 pb-3 pt-2">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <IconoRefe className="size-3.5" /> Referencias
                </p>
                <RefsDoc modo={modo} owner={{ tipo: "plano", id: p.id }} refs={refs} soloLectura={soloLectura} />
              </div>
            )}
          </div>
        );
      })}

      {!lectura && !soloLectura && (
        <button
          onClick={onNuevoPlano}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/50 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:text-foreground"
        >
          <Plus className="size-4" /> Agregar plano
        </button>
      )}
    </div>
  );
}

/** Un campo del documento: editable (Campo inline) o de lectura (oculto si vacío). */
function CampoDoc({
  modo,
  icono,
  label,
  tabla,
  filaId,
  campo,
  grupo,
  valor,
  placeholder,
  rows,
  soloLectura,
  onCambio,
  tono = "blue",
}: {
  modo: ModoDoc;
  icono: ComponentType<{ className?: string }>;
  label: string;
  tabla: "planos" | "estaticos";
  filaId: string;
  campo: string;
  grupo: string;
  valor: string | null;
  placeholder?: string;
  rows?: number;
  soloLectura: boolean;
  onCambio?: (valor: string) => void;
  /** Color del ícono para separar visualmente las dos secciones: la columna de
   *  motion va en AZUL, la de diálogos en NARANJA (como las plecas del deck). */
  tono?: "blue" | "orange";
}) {
  const Icono = icono;
  const colorIcono = tono === "orange" ? "text-deck-orange" : "text-deck-blue";
  if (modo === "lectura") {
    if (!valor?.trim()) return null;
    return (
      <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-2">
        <span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-muted-foreground">
          <Icono className={`size-3.5 shrink-0 ${colorIcono}`} />
          <span className="whitespace-nowrap">{label}</span>
        </span>
        <div className="px-1.5 py-1 text-[13px] leading-relaxed text-foreground">
          <Linkify>{valor}</Linkify>
        </div>
      </div>
    );
  }
  return (
    <Campo
      inline
      icono={<Icono className={`size-3.5 shrink-0 ${colorIcono}`} />}
      tabla={tabla}
      filaId={filaId}
      campo={campo}
      grupoCorreccion={grupo}
      label={label}
      valorInicial={valor}
      placeholder={placeholder}
      rows={rows}
      soloLectura={soloLectura}
      onCambio={onCambio}
    />
  );
}

/** El diálogo en lectura: (Quien) → **Quien:** "texto", como lo ve el cliente. */
function DialogoLectura({
  label,
  texto,
}: {
  label: string;
  texto: string | null;
}) {
  const segmentos = parseDialogo(texto);
  if (segmentos.length === 0) return null;
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-x-2">
      <span className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-muted-foreground">
        <IconoDialogo className="size-3.5 shrink-0 text-deck-orange" />
        <span className="whitespace-nowrap">{label}</span>
      </span>
      <div className="space-y-1.5 px-1.5 py-1 text-[13px] leading-relaxed text-foreground">
        {segmentos.map((s, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {s.quien && <b>{s.quien}: </b>}
            {s.quien ? <>&ldquo;{s.texto}&rdquo;</> : s.texto}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Referencias del plano/estático — dropzone en editable, miniaturas en lectura. */
function RefsDoc({
  modo,
  owner,
  refs,
  soloImagenes,
  etiqueta,
  soloLectura,
}: {
  modo: ModoDoc;
  owner: { tipo: "plano" | "estatico"; id: string };
  refs: RefVista[];
  soloImagenes?: boolean;
  etiqueta?: string;
  soloLectura: boolean;
}) {
  // En lectura: sólo lectura de miniaturas (sin dropzone). En editable: dropzone
  // salvo que la tarea esté bloqueada (soloLectura de estado).
  return (
    <ReferenciasPlano
      owner={owner}
      refs={refs}
      soloImagenes={soloImagenes}
      etiqueta={etiqueta}
      soloLectura={modo === "lectura" || soloLectura}
    />
  );
}

function EncabezadoPlano({ titulo }: { titulo: string }) {
  return (
    <div className="bg-secondary px-3 py-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</span>
    </div>
  );
}

function planoTieneContenido(p: PlanoVista, refs: RefVista[]): boolean {
  return Boolean(
    p.titulo?.trim() ||
      p.accion?.trim() ||
      p.copy_in?.trim() ||
      p.sfx?.trim() ||
      p.gfx?.trim() ||
      p.edicion?.trim() ||
      p.dialogo?.trim() ||
      refs.length > 0,
  );
}
