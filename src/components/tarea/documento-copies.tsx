"use client";

import { useState } from "react";
import { Plus, Trash2, Minus, FileText, Type, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { useAutoguardado } from "./campo";
import { CampoLectura } from "./campo-lectura";
import { useWorkspaceView } from "./workspace-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextoRico } from "@/components/ui/linkify";
import { keyCampo } from "@/lib/correcciones";
import { cn } from "@/lib/utils";
import {
  agregarTema,
  borrarTema,
  guardarCuota,
  agregarCopy,
  borrarCopy,
  guardarCampo,
  type TablaGuardable,
} from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { PLACEHOLDER_COPY } from "@/lib/plantilla";
import type { CopyTema, Copy } from "@/lib/database.types";

type CopyRow = Pick<Copy, "id" | "headline" | "descripcion" | "orden">;
export type TemaRow = Pick<CopyTema, "id" | "tema" | "cuota" | "orden"> & { copies: CopyRow[] };

/**
 * Plantilla "Copies": temas con cuota. El lead define TEMAS (cada uno con su CUOTA de
 * cuántos copies); el copy llena, por tema, copies {headline, descripción}, con un
 * contador X/cuota.
 *
 * Dos modos, igual que DocumentoTarea:
 *  - "editable" (Vista editor): cada campo autoguarda por `guardarCampo`; el estado
 *    local sólo lleva la ESTRUCTURA (temas/copies añadidos/borrados + la cuota).
 *  - "lectura" (Vista cliente / portal): sólo lo lleno, de sólo lectura, con
 *    `CampoLectura` — así el REVISOR ve/gestiona los cambios anclados del cliente y el
 *    CLIENTE ancla los suyos (los Copies son un entregable al cliente, 0046 + portal).
 * El modo se deriva de `verCliente` (el toggle de la barra inferior); el portal siembra
 * verCliente=true, así reusa la misma vista de lectura que el revisor.
 */
export function DocumentoCopies({
  ideaId,
  temasIniciales,
  soloLectura,
}: {
  ideaId: string;
  temasIniciales: TemaRow[];
  soloLectura: boolean;
}) {
  const [temas, setTemas] = useState<TemaRow[]>(temasIniciales);
  const [creando, setCreando] = useState(false);
  const { verCliente } = useWorkspaceView();
  const modo = verCliente ? "lectura" : "editable";

  // ── Vista cliente / portal: sólo lectura, con correcciones ancladas ──
  if (modo === "lectura") return <CopiesLectura temas={temas} />;

  const nuevoTema = async () => {
    setCreando(true);
    const res = await agregarTema(ideaId);
    setCreando(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTemas((p) => [...p, { id: res.tema.id, tema: res.tema.tema, cuota: res.tema.cuota, orden: res.tema.orden, copies: [] }]);
  };

  const patchTema = (temaId: string, fn: (t: TemaRow) => TemaRow) =>
    setTemas((p) => p.map((t) => (t.id === temaId ? fn(t) : t)));

  return (
    <div className="space-y-4">
      {!soloLectura && (
        <div className="flex items-center justify-between">
          <p className="gl-eyebrow">Copies · temas con cuota</p>
          <Button size="sm" variant="outline" onClick={nuevoTema} disabled={creando}>
            <Plus className="size-3.5" /> Agregar tema
          </Button>
        </div>
      )}

      {temas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 size-5" />
          {soloLectura
            ? "Sin temas todavía."
            : "El lead define los temas y cuántos copies por tema. Agrega el primero para empezar."}
        </div>
      ) : (
        temas.map((t) => (
          <TemaCard
            key={t.id}
            tema={t}
            soloLectura={soloLectura}
            onPatch={(fn) => patchTema(t.id, fn)}
            onQuitar={() => setTemas((p) => p.filter((x) => x.id !== t.id))}
          />
        ))
      )}
    </div>
  );
}

/**
 * La vista de SÓLO LECTURA de los Copies (Vista cliente + portal). Cada tema es una
 * tarjeta con su nombre de rótulo; dentro, cada copy con contenido muestra
 * headline/descripción con `CampoLectura` (el cliente ancla cambios; el revisor los
 * ve/gestiona). Se ocultan temas y copies vacíos — el cliente sólo ve lo que se
 * escribió (mismo criterio que el guión: campo vacío = no se pinta).
 */
function CopiesLectura({ temas }: { temas: TemaRow[] }) {
  // Un copy "tiene contenido" si su headline o su descripción no están vacíos; un tema
  // se muestra si tiene al menos un copy con contenido.
  const tieneContenido = (c: CopyRow) => Boolean(c.headline?.trim() || c.descripcion?.trim());
  const visibles = temas.filter((t) => t.copies.some(tieneContenido));

  if (visibles.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-2 size-5" />
        Todavía no hay copies que mostrar.
      </div>
    );

  return (
    <div className="space-y-3">
      {visibles.map((t) => {
        const nombreTema = t.tema?.trim() || "Tema";
        return (
          <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="bg-secondary px-3 py-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-foreground">{nombreTema}</h3>
            </div>
            <div className="space-y-3 p-3">
              {t.copies.map((c, i) => {
                if (!tieneContenido(c)) return null;
                // "Copy N" = posición en la lista COMPLETA (igual que el editor), NO en la
                // filtrada — así el número coincide entre Vista editor, Vista cliente y el
                // label guardado del pin (reap: evita el drift de numeración por copies vacíos).
                const n = i + 1;
                const grupo = `${nombreTema} · Copy ${n}`;
                return (
                  <div key={c.id} className="rounded-lg border border-border bg-card p-2.5">
                    <span className="mb-1.5 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                      Copy {n}
                    </span>
                    <div className="space-y-1.5">
                      {c.headline?.trim() && (
                        <CampoLectura
                          tabla="copies"
                          filaId={c.id}
                          campo="headline"
                          label="Headline"
                          grupo={grupo}
                          valor={c.headline}
                          icono={<Type className="size-3.5 shrink-0 text-deck-blue" />}
                          pretty={
                            <div className="px-1.5 py-1 text-[13px] font-medium leading-relaxed text-foreground">
                              <TextoRico>{c.headline}</TextoRico>
                            </div>
                          }
                        />
                      )}
                      {c.descripcion?.trim() && (
                        <CampoLectura
                          tabla="copies"
                          filaId={c.id}
                          campo="descripcion"
                          label="Descripción"
                          grupo={grupo}
                          valor={c.descripcion}
                          icono={<AlignLeft className="size-3.5 shrink-0 text-deck-orange" />}
                          pretty={
                            <div className="px-1.5 py-1 text-[13px] leading-relaxed text-foreground">
                              <TextoRico>{c.descripcion}</TextoRico>
                            </div>
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TemaCard({
  tema,
  soloLectura,
  onPatch,
  onQuitar,
}: {
  tema: TemaRow;
  soloLectura: boolean;
  onPatch: (fn: (t: TemaRow) => TemaRow) => void;
  onQuitar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  // Qué copy está pidiendo confirmación de borrado (id) — uno a la vez.
  const [confirmandoCopy, setConfirmandoCopy] = useState<string | null>(null);
  const cumplida = tema.copies.length >= tema.cuota;

  const setCuota = async (n: number) => {
    const clamp = Math.max(0, Math.min(999, n));
    const prev = tema.cuota;
    onPatch((t) => ({ ...t, cuota: clamp })); // optimista
    const res = await guardarCuota(tema.id, clamp);
    if (!res.ok) {
      toast.error(res.error);
      onPatch((t) => ({ ...t, cuota: prev })); // revierte si el server rechazó (reap M4)
    }
  };

  const nuevoCopy = async () => {
    const res = await agregarCopy(tema.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onPatch((t) => ({ ...t, copies: [...t.copies, { id: res.copy.id, headline: res.copy.headline, descripcion: res.copy.descripcion, orden: res.copy.orden }] }));
  };

  const quitarCopy = async (copyId: string) => {
    const res = await borrarCopy(copyId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onPatch((t) => ({ ...t, copies: t.copies.filter((c) => c.id !== copyId) }));
  };

  const quitarTema = async () => {
    const res = await borrarTema(tema.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onQuitar();
  };

  return (
    <div className="gl-card space-y-3 p-3">
      {/* Cabecera del tema: nombre + cuota + contador + borrar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[180px] flex-1">
          <CampoCopy
            tabla="copies_temas"
            filaId={tema.id}
            campo="tema"
            label="Tema"
            valorInicial={tema.tema}
            placeholder="Nombre del tema (p. ej. Ahorro, Rapidez…)"
            rows={1}
            soloLectura={soloLectura}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cuota</span>
          {soloLectura ? (
            <span className="text-sm font-semibold text-foreground">{tema.cuota}</span>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCuota(tema.cuota - 1)}
                aria-label="Bajar cuota"
                className="grid size-6 place-items-center rounded border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Minus className="size-3" />
              </button>
              <span className="w-6 text-center text-sm font-semibold text-foreground">{tema.cuota}</span>
              <button
                type="button"
                onClick={() => setCuota(tema.cuota + 1)}
                aria-label="Subir cuota"
                className="grid size-6 place-items-center rounded border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Plus className="size-3" />
              </button>
            </div>
          )}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              cumplida ? "bg-[color-mix(in_srgb,var(--greenlight)_20%,transparent)] text-[color:var(--greenlight-ink)]" : "bg-secondary text-secondary-foreground",
            )}
            title="Copies escritos / cuota"
          >
            {tema.copies.length} / {tema.cuota}
          </span>
        </div>

        {!soloLectura &&
          (confirmando ? (
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-muted-foreground">¿Borrar tema y sus copies?</span>
              <button type="button" onClick={quitarTema} className="rounded px-2 py-0.5 font-bold text-white" style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}>
                Sí
              </button>
              <button type="button" autoFocus onClick={() => setConfirmando(false)} className="rounded border border-border px-2 py-0.5 font-medium text-foreground hover:bg-background">
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label="Borrar tema"
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-status-corrections"
            >
              <Trash2 className="size-4" />
            </button>
          ))}
      </div>

      {/* Copies del tema */}
      <div className="space-y-2">
        {tema.copies.map((c, i) => (
          <div key={c.id} className="rounded-lg border border-border bg-card p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">Copy {i + 1}</span>
              {/* Confirmación en línea, igual que "Borrar tema": borraba al primer clic. */}
              {!soloLectura &&
                (confirmandoCopy === c.id ? (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-muted-foreground">¿Borrar copy {i + 1}?</span>
                    <button type="button" onClick={() => { setConfirmandoCopy(null); quitarCopy(c.id); }} className="rounded px-2 py-0.5 font-bold text-white" style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}>
                      Sí
                    </button>
                    <button type="button" autoFocus onClick={() => setConfirmandoCopy(null)} className="rounded border border-border px-2 py-0.5 font-medium text-foreground hover:bg-background">
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmandoCopy(c.id)}
                    aria-label={`Borrar copy ${i + 1}`}
                    className="ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-status-corrections"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ))}
            </div>
            <div className="grid gap-2">
              <CampoCopy tabla="copies" filaId={c.id} campo="headline" label="Headline" valorInicial={c.headline} placeholder={PLACEHOLDER_COPY.headline} rows={1} soloLectura={soloLectura} />
              <CampoCopy tabla="copies" filaId={c.id} campo="descripcion" label="Descripción" valorInicial={c.descripcion} placeholder={PLACEHOLDER_COPY.descripcion} rows={2} soloLectura={soloLectura} />
            </div>
          </div>
        ))}

        {!soloLectura && (
          <Button size="sm" variant="ghost" onClick={nuevoCopy} className="w-full border border-dashed border-border text-muted-foreground hover:text-foreground">
            <Plus className="size-3.5" /> Agregar copy
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Campo con autoguardado para Copies (modo editor) — reusa `useAutoguardado` SIN el
 * andamiaje de correcciones de `Campo` (las correcciones de copies se ven/gestionan en
 * la Vista cliente vía `CampoLectura`, no aquí). Textarea controlado. Ancla
 * `data-campo-key` para que "Ver campo" del panel de correcciones salte también en
 * modo editor (igual que `Campo`).
 */
function CampoCopy({
  tabla,
  filaId,
  campo,
  label,
  valorInicial,
  placeholder,
  rows = 2,
  soloLectura,
}: {
  tabla: TablaGuardable;
  filaId: string;
  campo: string;
  label: string;
  valorInicial: string | null;
  placeholder?: string;
  rows?: number;
  soloLectura?: boolean;
}) {
  const g = useAutoguardado(valorInicial, (ant, nue) => guardarCampo(tabla, filaId, campo, ant, nue));
  return (
    <label className="block scroll-mt-24" data-campo-key={keyCampo(tabla, filaId, campo)}>
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {/* Estado de autoguardado en una región viva (no hay botón de guardar). (reap 2026-08-26) */}
        <span role="status" aria-live="polite">
          {g.estado === "guardando" && <span className="text-[10px] text-muted-foreground">Guardando…</span>}
          {g.estado === "guardado" && (
            <span className="text-[10px]" style={{ color: "var(--greenlight-ink)" }}>Guardado</span>
          )}
          {g.estado === "error" && g.conflicto === null && (
            <span className="text-[10px] text-status-corrections">No se guardó</span>
          )}
        </span>
      </div>
      <Textarea
        value={g.valor}
        onChange={(e) => g.alEscribir(e.target.value)}
        onBlur={g.alSalir}
        rows={rows}
        readOnly={soloLectura}
        placeholder={placeholder}
      />
      {g.conflicto !== null && (
        <div className="mt-1 rounded-md border border-status-progress/40 bg-[color-mix(in_srgb,var(--status-progress)_10%,transparent)] p-2 text-[11px]">
          <p className="mb-1 text-foreground">Alguien más cambió este campo. Valor actual:</p>
          <p className="mb-1.5 whitespace-pre-wrap font-mono text-muted-foreground">{g.conflicto || "(vacío)"}</p>
          <div className="flex gap-2">
            <button type="button" onClick={g.quedarme} className="rounded bg-primary px-2 py-0.5 font-medium text-primary-foreground">
              Quedarme con lo mío
            </button>
            <button type="button" onClick={g.tomarSuyo} className="rounded border border-border px-2 py-0.5 font-medium text-foreground">
              Tomar lo suyo
            </button>
          </div>
        </div>
      )}
    </label>
  );
}
