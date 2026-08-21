"use client";

import { ChevronDown, Copy, Trash2, AlertCircle, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChipSelect } from "./chip-select";
import { CopyFieldButton, MultiCopyButton, type PickCard } from "./copy-to-picker";
import {
  DURACION,
  ENTREGA,
  FORMATO,
  GENERO,
  MARCA,
  PLACEHOLDER,
  PLATAFORMA,
  PLATAFORMA_LABEL,
  TAMANO,
  TIPO_ASSET,
  type Track,
} from "@/lib/vocab";
import { camposLlenos, combosDeTarjeta, nombresDeTarjeta, type TaskDraft } from "@/lib/intake-crear";

type ChipKey =
  | "entrega" | "asignacion" | "marca" | "plataforma"
  | "tipoAsset" | "formato" | "tamano" | "genero" | "duracion";
type TextKey =
  | "comentariosLeads" | "peloteo" | "concepto" | "sellingPoints"
  | "referencias" | "numIdea" | "version" | "naming";

export type PoolMember = { name: string; color: string; track: Track };

export function TaskCard({
  task,
  index,
  track,
  pool,
  expanded,
  onToggle,
  onChip,
  onText,
  onCopy,
  onCopyFields,
  onDuplicate,
  onRemove,
  cards,
  lastTargets,
  mes,
  blocked,
  ideaRepetida,
}: {
  task: TaskDraft;
  index: number;
  track: Track;
  /** Pool VIVO de asignables (lead + creative) por track — reemplaza vocab.ts. */
  pool: PoolMember[];
  expanded: boolean;
  onToggle: () => void;
  onChip: (key: ChipKey, updater: (prev: string[]) => string[]) => void;
  onText: (key: TextKey, value: string) => void;
  onCopy: (key: keyof TaskDraft, targetIds: string[]) => void;
  onCopyFields: (keys: (keyof TaskDraft)[], targetIds: string[]) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  cards: PickCard[];
  lastTargets: string[];
  mes: string;
  blocked?: string[];
  ideaRepetida?: boolean;
}) {
  const combos = combosDeTarjeta(task);
  const nombres = nombresDeTarjeta(task, mes);
  const titulo = task.numIdea.trim() || `Tarea ${index + 1}`;
  const hasProblem = (blocked && blocked.length > 0) || ideaRepetida;

  // Botón "copiar a…" preconfigurado para un campo de ESTA tarjeta.
  const copyBtn = (key: keyof TaskDraft, label: string) => (
    <CopyFieldButton
      sourceId={task.id}
      cards={cards}
      srcMarca={task.marca[0] ?? ""}
      srcTipo={task.tipoAsset[0] ?? ""}
      lastTargets={lastTargets}
      fieldLabel={label}
      onCopy={(ids) => onCopy(key, ids)}
    />
  );

  const chip = (
    key: ChipKey,
    label: string,
    options: React.ComponentProps<typeof ChipSelect>["options"],
    opts?: { multi?: boolean; hint?: string },
  ) => (
    <div>
      <FieldHead label={label} hint={opts?.hint} copy={copyBtn(key, label)} />
      <ChipSelect
        ariaLabel={label}
        multi={opts?.multi}
        options={options}
        selected={task[key]}
        onChange={(updater) => onChip(key, updater)}
      />
    </div>
  );

  return (
    <section
      className={cn(
        "gl-card overflow-hidden rounded-xl border bg-card",
        hasProblem ? "border-status-corrections/60" : "border-border",
      )}
    >
      {/* Cabecera colapsada — resumen a golpe de vista */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{titulo}</span>
          {task.tipoAsset[0] && (
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              {task.tipoAsset[0]}
            </span>
          )}
          {task.marca[0] && (
            <span className="shrink-0 text-[11px] text-muted-foreground">{task.marca[0]}</span>
          )}
          <span className="truncate text-[13px] text-muted-foreground">
            {task.concepto || task.naming || "—"}
          </span>
          {hasProblem && <AlertCircle className="ml-auto size-4 shrink-0 text-status-corrections" />}
          <span className={cn("shrink-0 text-[11px] text-muted-foreground", hasProblem && "ml-1")}>
            {combos.length} entregable{combos.length === 1 ? "" : "s"}
          </span>
        </button>
        <MultiCopyButton
          sourceId={task.id}
          cards={cards}
          srcMarca={task.marca[0] ?? ""}
          srcTipo={task.tipoAsset[0] ?? ""}
          campos={camposLlenos(task)}
          lastTargets={lastTargets}
          onCopy={onCopyFields}
        />
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Duplicar tarjeta" title="Duplicar tarjeta (todos los campos)" onClick={onDuplicate}>
          <Copy />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar tarjeta" title="Eliminar tarjeta" onClick={onRemove} className="text-muted-foreground hover:text-status-corrections">
          <Trash2 />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {hasProblem && (
            <p className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--status-corrections)_10%,transparent)] p-2.5 text-xs text-status-corrections">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {ideaRepetida && <>Este <strong># Idea</strong> está repetido en el brief. </>}
                {blocked && blocked.length > 0 && <>Falta: {blocked.join(" · ")}</>}
              </span>
            </p>
          )}

          {/* Identidad */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label="# Idea" value={task.numIdea} onChange={(v) => onText("numIdea", v.toUpperCase())} placeholder="A1 · su identidad" mono />
            <TextField label="Naming" value={task.naming} onChange={(v) => onText("naming", v.toUpperCase())} placeholder={PLACEHOLDER.naming} mono copy={copyBtn("naming", "Naming")} />
            <TextField label="Versión" value={task.version} onChange={(v) => onText("version", v.toUpperCase())} placeholder={PLACEHOLDER.version} mono copy={copyBtn("version", "Versión")} />
            {chip("marca", "Marca", MARCA)}
          </div>

          {/* Entrega + gente */}
          {chip("entrega", "# Entrega", ENTREGA)}
          {chip("asignacion", "Asignación", pool.filter((p) => p.track === track).map((p) => ({ value: p.name, color: p.color })), { multi: true, hint: "Lead + especialistas de este track" })}

          {/* Especificaciones */}
          <div className="grid gap-4 sm:grid-cols-2">
            {chip("tipoAsset", "Tipo de Asset", TIPO_ASSET[track])}
            {chip("formato", "Formato", FORMATO[track])}
          </div>
          {chip("plataforma", "Plataforma", PLATAFORMA.map((p) => ({ value: p, label: `${p} · ${PLATAFORMA_LABEL[p]}` })), { multi: true, hint: "EC = extra channel" })}
          <div className="grid gap-4 sm:grid-cols-2">
            {chip("tamano", "Tamaño", TAMANO, { multi: true, hint: "Puede ser más de uno" })}
            {chip("genero", "Género", GENERO)}
          </div>
          {chip("duracion", "Duración", DURACION, { multi: true, hint: "Cada duración genera su propio nombre de archivo" })}

          {/* Contenido */}
          <TextField label="Concepto" value={task.concepto} onChange={(v) => onText("concepto", v)} placeholder={PLACEHOLDER.concepto} copy={copyBtn("concepto", "Concepto")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AreaField label="Comentarios Leads" value={task.comentariosLeads} onChange={(v) => onText("comentariosLeads", v)} copy={copyBtn("comentariosLeads", "Comentarios Leads")} />
            <AreaField label="Peloteo (notas)" value={task.peloteo} onChange={(v) => onText("peloteo", v)} placeholder={PLACEHOLDER.peloteo} copy={copyBtn("peloteo", "Peloteo")} />
            <AreaField label="Selling Points" value={task.sellingPoints} onChange={(v) => onText("sellingPoints", v)} placeholder={PLACEHOLDER.selling_points} copy={copyBtn("sellingPoints", "Selling Points")} />
            <AreaField label="Referencias" value={task.referencias} onChange={(v) => onText("referencias", v)} placeholder={PLACEHOLDER.referencias} copy={copyBtn("referencias", "Referencias")} />
          </div>

          {/* Entregables (WYSIWYG con lo que se creará) */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FileStack className="size-3.5" />
              {combos.length === 0
                ? "Sin entregables aún (elige Tamaño y Plataforma)"
                : `Se crearán ${nombres.length} entregable${nombres.length === 1 ? "" : "s"}`}
            </p>
            {nombres.length > 0 && (
              <ul className="space-y-1">
                {nombres.map((n) => (
                  <li key={n} className="overflow-x-auto whitespace-nowrap rounded-md bg-[#2d2b55] px-3 py-1.5 font-mono text-[12px] text-[#d9d2f0]">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── helpers de campo ──
function FieldHead({ label, hint, copy }: { label: string; hint?: string; copy?: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Label className="text-sm">{label}</Label>
      {copy}
      {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, mono, hint, copy,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; hint?: string; copy?: React.ReactNode;
}) {
  return (
    <div>
      <FieldHead label={label} hint={hint} copy={copy} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

function AreaField({
  label, value, onChange, placeholder, copy,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; copy?: React.ReactNode;
}) {
  return (
    <div>
      <FieldHead label={label} copy={copy} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[68px] w-full resize-y rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
