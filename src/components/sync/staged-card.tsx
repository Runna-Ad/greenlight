"use client";

import { ChevronDown, Sparkles, Pencil, AlertCircle, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChipSelect } from "@/components/intake/chip-select";
import { type PoolMember } from "@/components/intake/task-card";
import type { SheetRow } from "@/lib/sheet-sync";
import { missingBloqueante, requiredFor, faltaLead } from "@/lib/required";
import { puedeSerLead } from "@/lib/roles";
import {
  ENTREGA,
  FORMATO,
  GENERO,
  MARCA,
  PLATAFORMA,
  PLATAFORMA_LABEL,
  TAMANO,
  TIPO_ASSET,
  type Track,
} from "@/lib/vocab";

export type StagedRow = {
  key: string;
  rowNumber: number;
  status: "new" | "updated" | "unchanged";
  data: SheetRow;
  tab: string;
  label: string;
  track: "real" | "normal" | null;
};

// Los obligatorios dependen del Tipo de Asset y viven en src/lib/required.ts
// (una lista fija exigía Naming y # Idea a las filas de Copies, que
// legítimamente no los tienen — habría bloqueado trabajo real).

// Sheet cells hold multi-values as "a, b, c".
const toList = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const fromList = (v: string[]) => v.join(", ");

export function StagedCard({
  row,
  edits,
  included,
  expanded,
  pool,
  onToggleIncluded,
  onToggleExpanded,
  onEdit,
  onResetField,
}: {
  row: StagedRow;
  edits: Partial<SheetRow>;
  included: boolean;
  expanded: boolean;
  /** Pool VIVO de asignables (lead + creative) por track — reemplaza vocab.ts. */
  pool: PoolMember[];
  onToggleIncluded: () => void;
  onToggleExpanded: () => void;
  onEdit: (field: keyof SheetRow, value: string) => void;
  onResetField: (field: keyof SheetRow) => void;
}) {
  // Effective value = the lead's edit if she made one, else what the sheet says.
  const val = (f: keyof SheetRow) => edits[f] ?? row.data[f] ?? "";
  const isEdited = (f: keyof SheetRow) => edits[f] !== undefined;
  const track: Track = row.track ?? "real";
  // Se recalcula con las ediciones de la lead: corregir el campo desbloquea la
  // fila en vivo, sin tener que volver a sincronizar.
  const effective = { ...row.data, ...edits } as SheetRow;
  // `missing` = SÓLO lo que BLOQUEA (sin la Asignación). Un lead faltante no bloquea:
  // se crea sin responsable y se marca "sin lead" para asignarlo después (Pedro).
  const missing = missingBloqueante(effective);
  const sinLead = faltaLead(effective);
  const required = requiredFor(effective["Tipo de Asset"]);
  const isRequired = (f: keyof SheetRow) => required.includes(f as never);

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border transition-colors",
        included ? "border-border bg-card" : "border-border/60 bg-card/40",
      )}
    >
      {/* ── Collapsed summary: what she scans ── */}
      <div className="flex items-start gap-3 p-3.5">
        <input
          type="checkbox"
          checked={included}
          onChange={onToggleIncluded}
          disabled={missing.length > 0}
          title={
            missing.length > 0
              ? `Falta ${missing.join(", ")}. Ábrela y complétala para poder crearla.`
              : undefined
          }
          aria-label={`Incluir ${val("Naming") || "tarea"}`}
          className="mt-1 size-4 shrink-0 accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
        />

        <div className={cn("min-w-0 flex-1", !included && "opacity-55")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
              {val("Naming") || <span className="italic text-status-corrections">sin naming</span>}
            </span>
            {val("# Idea") && (
              <Badge variant="secondary" className="font-mono text-[10px]">{val("# Idea")}</Badge>
            )}
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
            {/* "nueva" en morado de marca, no verde: el verde queda sólo para "Aprobado" (Pedro). */}
            {row.status === "new" ? (
              <Badge className="gap-0.5 bg-primary text-[10px] text-primary-foreground">
                <Sparkles className="size-2.5" /> nueva
              </Badge>
            ) : (
              <Badge className="gap-0.5 bg-status-progress text-[10px] text-white">
                <Pencil className="size-2.5" /> actualizada
              </Badge>
            )}
          </div>

          {/* Concepto is the human-readable "what is this" — give it room */}
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {val("Concepto") || "Sin concepto"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {val("Marca") && <Chip tone="marca">{val("Marca")}</Chip>}
            {val("Tipo de Asset") && <Chip tone="tipo">{val("Tipo de Asset")}</Chip>}
            {val("Formato") && <Chip>{val("Formato")}</Chip>}
            {toList(val("Tamaño")).map((t) => (
              <Chip key={t} mono>{t}</Chip>
            ))}
            {toList(val("Plataforma")).map((p) => (
              <Chip key={p} mono>{p}</Chip>
            ))}
            {val("Duración") && <Chip mono>{val("Duración")}</Chip>}
            {toList(val("Asignación")).map((n) => (
              <Chip key={n} tone="person">{n}</Chip>
            ))}
          </div>

          {missing.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-status-corrections">
              <AlertCircle className="size-3.5 shrink-0" />
              No se puede crear: falta {missing.join(" · ")}
            </p>
          )}
          {sinLead && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <AlertCircle className="size-3.5 shrink-0" />
              Sin lead — se creará igual, sin responsable; asígnalo después en la tarea.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Cerrar detalle" : "Abrir para editar"}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* ── Expanded: an editor, not a read-only dump ── */}
      {expanded && (
        <div className="space-y-5 border-t border-border bg-secondary/25 px-4 py-4">
          <Section title="Entrega">
            <Grid>
              <Picker label="# Entrega" required={isRequired("# Entrega")} options={ENTREGA} value={val("# Entrega")} edited={isEdited("# Entrega")}
                onChange={(v) => onEdit("# Entrega", v[0] ?? "")} onReset={() => onResetField("# Entrega")} />
              <Picker label="Marca" required={isRequired("Marca")} options={MARCA} value={val("Marca")} edited={isEdited("Marca")}
                onChange={(v) => onEdit("Marca", v[0] ?? "")} onReset={() => onResetField("Marca")} />
            </Grid>
            {/* El sheet trae al LEAD (uno). Picker de UN solo lead, del pool de
                Leads (rol `lead`) de este track. Los especialistas se asignan en la
                tarea (Rünna tools). */}
            {/* El lead NO es obligatorio para sincronizar: si falta, la tarea se crea
                sin responsable (se asigna después). Por eso required={false}. */}
            <Picker
              label="Lead (opcional)" required={false}
              options={pool.filter((p) => puedeSerLead(p, track)).map((p) => ({ value: p.name, color: p.color }))}
              value={val("Asignación")} edited={isEdited("Asignación")}
              onChange={(v) => onEdit("Asignación", v[0] ?? "")} onReset={() => onResetField("Asignación")}
            />
            <Grid cols={3}>
              <Text label="Mes" value={val("Mes")} mono edited={isEdited("Mes")}
                onChange={(v) => onEdit("Mes", v)} onReset={() => onResetField("Mes")} />
              <Text label="Entrega final" value={val("Entrega final")} edited={isEdited("Entrega final")}
                onChange={(v) => onEdit("Entrega final", v)} onReset={() => onResetField("Entrega final")} />
              <Text label="Brief Name" value={val("Brief Name")} edited={isEdited("Brief Name")}
                onChange={(v) => onEdit("Brief Name", v)} onReset={() => onResetField("Brief Name")} />
            </Grid>
          </Section>

          <Section title="Especificaciones">
            <Grid cols={3}>
              <Picker label="Tipo de Asset" required={isRequired("Tipo de Asset")} options={TIPO_ASSET[track]} value={val("Tipo de Asset")}
                edited={isEdited("Tipo de Asset")} onChange={(v) => onEdit("Tipo de Asset", v[0] ?? "")}
                onReset={() => onResetField("Tipo de Asset")} />
              <Picker label="Formato" options={FORMATO[track]} value={val("Formato")} edited={isEdited("Formato")}
                onChange={(v) => onEdit("Formato", v[0] ?? "")} onReset={() => onResetField("Formato")} />
              <Picker label="Género" options={GENERO} value={val("Género")} edited={isEdited("Género")}
                onChange={(v) => onEdit("Género", v[0] ?? "")} onReset={() => onResetField("Género")} />
            </Grid>
            <Picker label="Tamaño" multi required={isRequired("Tamaño")} options={TAMANO} value={val("Tamaño")} edited={isEdited("Tamaño")}
              onChange={(v) => onEdit("Tamaño", fromList(v))} onReset={() => onResetField("Tamaño")} />
            <Picker
              label="Plataforma" multi required={isRequired("Plataforma")}
              options={PLATAFORMA.map((p) => ({ value: p, label: `${p} · ${PLATAFORMA_LABEL[p]}` }))}
              value={val("Plataforma")} edited={isEdited("Plataforma")}
              onChange={(v) => onEdit("Plataforma", fromList(v))} onReset={() => onResetField("Plataforma")}
            />
            <Grid cols={4}>
              <Text label="Duración" value={val("Duración")} mono required={isRequired("Duración")} edited={isEdited("Duración")}
                onChange={(v) => onEdit("Duración", v)} onReset={() => onResetField("Duración")} />
              <Text label="# Idea" value={val("# Idea")} mono required={isRequired("# Idea")} edited={isEdited("# Idea")}
                onChange={(v) => onEdit("# Idea", v.toUpperCase())} onReset={() => onResetField("# Idea")} />
              <Text label="Versión" value={val("Versión")} mono edited={isEdited("Versión")}
                onChange={(v) => onEdit("Versión", v.toUpperCase())} onReset={() => onResetField("Versión")} />
              <Text label="Naming" value={val("Naming")} mono required={isRequired("Naming")} edited={isEdited("Naming")}
                onChange={(v) => onEdit("Naming", v.toUpperCase())} onReset={() => onResetField("Naming")} />
            </Grid>
          </Section>

          <Section title="Contenido">
            <Area label="Concepto" value={val("Concepto")} rows={2} required={isRequired("Concepto")} edited={isEdited("Concepto")}
              onChange={(v) => onEdit("Concepto", v)} onReset={() => onResetField("Concepto")} />
            <Area label="Comentarios Leads" value={val("Comentarios Leads")} rows={4}
              edited={isEdited("Comentarios Leads")} onChange={(v) => onEdit("Comentarios Leads", v)}
              onReset={() => onResetField("Comentarios Leads")} />
            <Grid>
              <Area label="Selling Points" value={val("Selling Points")} rows={3} edited={isEdited("Selling Points")}
                onChange={(v) => onEdit("Selling Points", v)} onReset={() => onResetField("Selling Points")} />
              <Area label="Referencias" value={val("Referencias")} rows={3} edited={isEdited("Referencias")}
                onChange={(v) => onEdit("Referencias", v)} onReset={() => onResetField("Referencias")} />
            </Grid>
            <Area label="Peloteo" value={val("Peloteo")} rows={2} edited={isEdited("Peloteo")}
              onChange={(v) => onEdit("Peloteo", v)} onReset={() => onResetField("Peloteo")} />
          </Section>

          <p className="border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            Origen: <span className="font-mono">{row.tab}</span> · fila {row.rowNumber}
            {" · "}Editar aquí no cambia el Google Sheet.
          </p>
        </div>
      )}
    </li>
  );
}

// ── presentation helpers ──────────────────────────────────────

function Chip({
  children,
  mono,
  tone,
}: {
  children: React.ReactNode;
  mono?: boolean;
  tone?: "marca" | "tipo" | "person";
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] leading-4",
        mono && "font-mono",
        tone === "person" && "bg-primary/10 font-medium text-primary",
        tone === "marca" && "bg-type-real/12 font-medium text-type-real",
        tone === "tipo" && "bg-type-normal/12 font-medium text-type-normal",
        !tone && "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

/** Label above value — mixed-length fields never rag when the label owns its line. */
function Field({
  label,
  required,
  edited,
  empty,
  onReset,
  children,
}: {
  label: string;
  required?: boolean;
  edited?: boolean;
  empty?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        {required && empty && (
          <span className="text-[10px] font-semibold text-status-corrections">obligatorio</span>
        )}
        {edited && (
          <button
            type="button"
            onClick={onReset}
            title="Restaurar el valor del sheet"
            className="ml-auto flex items-center gap-0.5 text-[10px] text-primary hover:underline"
          >
            <Undo2 className="size-2.5" /> editado
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

const inputCx = (opts: { mono?: boolean; invalid?: boolean; edited?: boolean }) =>
  cn(
    "w-full rounded-md border bg-background px-2.5 py-1.5 text-[13px] outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring",
    opts.mono && "font-mono",
    opts.invalid ? "border-status-corrections" : opts.edited ? "border-primary/50" : "border-input",
  );

function Text({
  label, value, onChange, onReset, mono, required, edited,
}: {
  label: string; value: string; onChange: (v: string) => void; onReset: () => void;
  mono?: boolean; required?: boolean; edited?: boolean;
}) {
  const empty = !value.trim();
  return (
    <Field label={label} required={required} edited={edited} empty={empty} onReset={onReset}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={required ? "Obligatorio" : "—"}
        aria-label={label}
        className={inputCx({ mono, invalid: required && empty, edited })}
      />
    </Field>
  );
}

function Area({
  label, value, onChange, onReset, rows = 3, edited, required,
}: {
  label: string; value: string; onChange: (v: string) => void; onReset: () => void;
  rows?: number; edited?: boolean; required?: boolean;
}) {
  const empty = !value.trim();
  return (
    <Field label={label} required={required} empty={empty} edited={edited} onReset={onReset}>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        aria-label={label}
        className={cn(inputCx({ edited, invalid: required && empty }), "resize-y leading-relaxed")}
      />
    </Field>
  );
}

function Picker({
  label, options, value, onChange, onReset, multi, required, edited,
}: {
  label: string;
  options: (string | { value: string; label?: string; color?: string })[];
  value: string;
  onChange: (v: string[]) => void;
  onReset: () => void;
  multi?: boolean;
  required?: boolean;
  edited?: boolean;
}) {
  const selected = toList(value);
  return (
    <Field label={label} required={required} edited={edited} empty={selected.length === 0} onReset={onReset}>
      <ChipSelect
        ariaLabel={label}
        options={options}
        selected={selected}
        multi={multi}
        onChange={(updater) => onChange(updater(selected))}
      />
    </Field>
  );
}
