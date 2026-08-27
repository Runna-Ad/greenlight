"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, UserRoundX, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui/pill";
import { ROLE_LABEL, type ViewRole } from "@/lib/roles";
import { ROLES_ASIGNABLES, type MiembroRow, type RolAsignable } from "@/lib/equipo";
import { crearMiembro, guardarMiembro, eliminarMiembro } from "@/app/(app)/admin/actions";

const rolLabel = (r: string) => ROLE_LABEL[r as ViewRole] ?? r;

export function EquipoTab({ inicial }: { inicial: MiembroRow[] }) {
  const [miembros, setMiembros] = useState<MiembroRow[]>(inicial);
  const [confirmar, setConfirmar] = useState<MiembroRow | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<MiembroRow | null>(null);
  const [agregando, setAgregando] = useState(false);

  async function borrar(m: MiembroRow) {
    const r = await eliminarMiembro(m.id);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo borrar.");
      return;
    }
    setMiembros((ms) => ms.filter((x) => x.id !== m.id));
    toast.success(`${m.name} eliminado.`);
  }

  async function guardar(id: string, patch: Partial<MiembroRow>) {
    const prev = miembros.find((m) => m.id === id);
    // Espejo del invariante del server (track ↔ rol): al cambiar el rol a global se
    // limpia el track localmente; al pasar de global a doer sin track, default normal.
    // Así la UI no muestra un estado imposible entre el guardado y el revalidate.
    const local: Partial<MiembroRow> = { ...patch };
    if ("role" in patch) {
      const esGlobal = patch.role === "admin" || patch.role === "master";
      if (esGlobal) local.track = null;
      else if (prev && prev.track == null) local.track = "normal";
    }
    setMiembros((ms) => ms.map((m) => (m.id === id ? { ...m, ...local } : m)));
    const r = await guardarMiembro(id, patch);
    if (!r.ok) {
      if (prev) setMiembros((ms) => ms.map((m) => (m.id === id ? prev : m)));
      toast.error(r.error ?? "No se pudo guardar.");
    }
  }

  // Desactivar: si tiene carga, se confirma; si no, directo. Reactivar es directo.
  function alternarActivo(m: MiembroRow, next: boolean) {
    if (!next && m.carga > 0) setConfirmar(m);
    else guardar(m.id, { active: next });
  }

  // Admin/master son GLOBALES (track null): van a su propio grupo, no a Real/Normal
  // — si no, se caían de ambas columnas y desaparecían de la lista. (Pedro 2026-08-21.)
  const global = miembros.filter((m) => m.track == null);
  const real = miembros.filter((m) => m.track === "real");
  const normal = miembros.filter((m) => m.track === "normal");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {miembros.filter((m) => m.active).length} activos · {miembros.length} en total
        </p>
        <Button type="button" size="sm" onClick={() => setAgregando(true)}>
          <Plus /> Agregar persona
        </Button>
      </div>

      <Grupo titulo="Vista global · Admins y Master" miembros={global} guardar={guardar} onActivo={alternarActivo} onBorrar={setConfirmarBorrar} />
      <Grupo titulo="Equipo Real" miembros={real} guardar={guardar} onActivo={alternarActivo} onBorrar={setConfirmarBorrar} />
      <Grupo titulo="Equipo Normal" miembros={normal} guardar={guardar} onActivo={alternarActivo} onBorrar={setConfirmarBorrar} />

      {/* Confirmar desactivación de alguien con carga */}
      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Desactivar a {confirmar?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tiene <strong className="text-foreground">{confirmar?.carga} tarea{confirmar?.carga === 1 ? "" : "s"} activa{confirmar?.carga === 1 ? "" : "s"}</strong>. No se borran, pero ya no
            se le podrá asignar trabajo. Puedes reactivarla cuando quieras.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmar) guardar(confirmar.id, { active: false });
                setConfirmar(null);
              }}
            >
              <UserRoundX /> Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar BORRADO (hard delete) */}
      <Dialog open={!!confirmarBorrar} onOpenChange={(o) => !o && setConfirmarBorrar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Borrar a {confirmarBorrar?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se elimina de forma permanente. Si ya tiene historial en tareas, no se podrá
            borrar — mejor desactívala. Un admin no puede borrar a otro admin: sólo el
            Master Builder.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmarBorrar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const m = confirmarBorrar;
                setConfirmarBorrar(null);
                if (m) borrar(m);
              }}
            >
              <Trash2 /> Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgregarPersona
        open={agregando}
        onOpenChange={setAgregando}
        onCreado={(m) => setMiembros((ms) => [...ms, m])}
      />
    </div>
  );
}

function Grupo({
  titulo,
  miembros,
  guardar,
  onActivo,
  onBorrar,
}: {
  titulo: string;
  miembros: MiembroRow[];
  guardar: (id: string, patch: Partial<MiembroRow>) => void;
  onActivo: (m: MiembroRow, next: boolean) => void;
  onBorrar: (m: MiembroRow) => void;
}) {
  if (miembros.length === 0) return null;
  return (
    <section className="mb-6">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <div className="space-y-2">
        {miembros.map((m) => (
          <MiembroCard key={m.id} m={m} guardar={guardar} onActivo={onActivo} onBorrar={onBorrar} />
        ))}
      </div>
    </section>
  );
}

function MiembroCard({
  m,
  guardar,
  onActivo,
  onBorrar,
}: {
  m: MiembroRow;
  guardar: (id: string, patch: Partial<MiembroRow>) => void;
  onActivo: (m: MiembroRow, next: boolean) => void;
  onBorrar: (m: MiembroRow) => void;
}) {
  // El rol actual puede no estar en la lista corta (p.ej. un valor viejo): se
  // agrega para no perderlo del selector.
  const roles: string[] = ROLES_ASIGNABLES.includes(m.role as RolAsignable)
    ? [...ROLES_ASIGNABLES]
    : [m.role, ...ROLES_ASIGNABLES];
  // admin/master son globales: no tienen track (vista de todos los equipos).
  const esGlobal = m.role === "admin" || m.role === "master";
  // Un LEAD puede tener grant multi-track (Real, Normal o ambos); un creative es
  // single-track. El grant efectivo cae al track home si aún no se ha otorgado nada.
  const esLead = m.role === "lead";
  const tracksLead =
    m.lead_tracks && m.lead_tracks.length ? m.lead_tracks : m.track ? [m.track] : [];

  return (
    <div
      className={cn(
        "gl-card rounded-xl border border-border bg-card p-3",
        !m.active && "opacity-55",
      )}
    >
      {/* fila 1: identidad + carga + activo */}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={m.color}
          onChange={(e) => guardar(m.id, { color: e.target.value })}
          aria-label={`Color de ${m.name}`}
          title="Color"
          className="size-7 shrink-0 cursor-pointer rounded-full border border-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
          style={{ backgroundColor: m.color }}
        />
        <InlineText
          value={m.name}
          onSave={(v) => v.trim() && guardar(m.id, { name: v.trim() })}
          className="min-w-0 flex-1 font-medium"
          ariaLabel="Nombre"
        />
        {m.es_lead && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Lead
          </span>
        )}
        <Pill color={m.color} title="Tareas activas asignadas" className="shrink-0">
          {m.carga} activa{m.carga === 1 ? "" : "s"}
        </Pill>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch checked={m.active} onCheckedChange={(v) => onActivo(m, v)} aria-label="Activo" />
          Activo
        </label>
        <button
          type="button"
          onClick={() => onBorrar(m)}
          aria-label={`Borrar a ${m.name}`}
          title="Borrar persona"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* fila 2: controles */}
      <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Rol">
          <select
            value={m.role}
            onChange={(e) => guardar(m.id, { role: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {roles.map((r) => (
              <option key={r} value={r}>{rolLabel(r)}</option>
            ))}
          </select>
        </Campo>
        <Campo label={esLead ? "Tracks" : "Track"} hint={esLead ? "uno o ambos" : undefined}>
          {esGlobal ? (
            <span
              className="flex h-8 items-center rounded-md border border-dashed border-border px-2 text-sm text-muted-foreground"
              title="Admin/Master ven todos los equipos — no se acotan a un track"
            >
              Global · sin track
            </span>
          ) : esLead ? (
            // El lead puede trabajar Real, Normal o AMBOS: multi-select del grant.
            <TrackMultiSelect value={tracksLead} onChange={(ts) => guardar(m.id, { lead_tracks: ts })} />
          ) : (
            <select
              value={m.track ?? "normal"}
              onChange={(e) => guardar(m.id, { track: e.target.value as "real" | "normal" })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="real">Real</option>
              <option value="normal">Normal</option>
            </select>
          )}
        </Campo>
        <Campo label="Email">
          <InlineText
            value={m.email ?? ""}
            onSave={(v) => guardar(m.id, { email: v })}
            placeholder="correo@…"
            ariaLabel="Email"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </Campo>
        <Campo label="Slack" hint="member ID">
          <InlineText
            value={m.slack_user_id ?? ""}
            onSave={(v) => guardar(m.id, { slack_user_id: v })}
            placeholder="U01234…"
            ariaLabel="Slack member ID"
            className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm"
          />
        </Campo>
        {/* "Puede ser lead" se ELIMINÓ: ser lead se deriva del ROL (Dept Head /
            Lead). El badge "Lead" de arriba y la corona de Workload salen de ahí. */}
        <label className="flex items-center gap-2 text-sm text-foreground" title="Recibe emails de notificación (in-app siempre le llega)">
          <Switch checked={m.notify_email} onCheckedChange={(v) => guardar(m.id, { notify_email: v })} aria-label="Recibe emails" />
          Recibe emails
        </label>
      </div>
    </div>
  );
}

// Grant de tracks de un LEAD: Real / Normal / ambos. Requiere ≥1 (no se puede dejar
// a un lead sin ningún track — no podría ver ni asignar nada).
function TrackMultiSelect({
  value,
  onChange,
}: {
  value: ("real" | "normal")[];
  onChange: (tracks: ("real" | "normal")[]) => void;
}) {
  const has = (t: "real" | "normal") => value.includes(t);
  const toggle = (t: "real" | "normal") => {
    const next = has(t) ? value.filter((x) => x !== t) : [...value, t];
    if (!next.length) return; // un lead necesita al menos un track
    onChange(next);
  };
  const chip = (t: "real" | "normal", label: string) => (
    <button
      type="button"
      onClick={() => toggle(t)}
      aria-pressed={has(t)}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm transition-colors",
        has(t)
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:border-primary",
      )}
    >
      {has(t) && <Check className="size-3.5" />}
      {label}
    </button>
  );
  return (
    <div className="flex gap-1.5" role="group" aria-label="Tracks del lead">
      {chip("real", "Real")}
      {chip("normal", "Normal")}
    </div>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && <span className="ml-1 font-normal normal-case">· {hint}</span>}
      </span>
      {children}
    </div>
  );
}

// Texto editable inline: guarda al salir/Enter, sólo si cambió.
function InlineText({
  value,
  onSave,
  placeholder,
  className,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [v, setV] = useState(value);
  // Baseline = último valor externo. Si la prop cambia (p.ej. un revert tras un
  // guardado fallido), se re-sincroniza en render — patrón oficial de React,
  // sin useEffect (evita renders en cascada).
  const [base, setBase] = useState(value);
  if (value !== base) {
    setBase(value);
    setV(value);
  }
  const commit = () => {
    if (v !== base) {
      onSave(v);
      setBase(v);
    }
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setV(base);
          e.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        "bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

function AgregarPersona({
  open,
  onOpenChange,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreado: (m: MiembroRow) => void;
}) {
  const [name, setName] = useState("");
  const [track, setTrack] = useState<"real" | "normal">("real");
  const [role, setRole] = useState<RolAsignable>("creative");
  const [color, setColor] = useState("#775cbf");
  const [email, setEmail] = useState("");
  const [slack, setSlack] = useState("");
  const [guardando, setGuardando] = useState(false);
  // admin/master son globales: sin track (el server lo pone null de todos modos).
  const esGlobalNuevo = role === "admin" || role === "master";

  const reset = () => {
    setName(""); setTrack("real"); setRole("creative");
    setColor("#775cbf"); setEmail(""); setSlack("");
  };

  const crear = async () => {
    setGuardando(true);
    const r = await crearMiembro({
      name, track, role, color,
      email: email || undefined,
      slack_user_id: slack || undefined,
    });
    setGuardando(false);
    if (r.ok && r.miembro) {
      onCreado(r.miembro);
      toast.success(`${r.miembro.name} agregado`);
      reset();
      onOpenChange(false);
    } else {
      toast.error(r.error ?? "No se pudo crear.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar persona</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 block">Nombre</Label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
                autoFocus
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Color"
              className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block">Track</Label>
              {esGlobalNuevo ? (
                <span
                  className="flex h-9 items-center rounded-md border border-dashed border-border px-2 text-sm text-muted-foreground"
                  title="Admin/Master ven todos los equipos — no se acotan a un track"
                >
                  Global · sin track
                </span>
              ) : (
                <select value={track} onChange={(e) => setTrack(e.target.value as "real" | "normal")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="real">Real</option>
                  <option value="normal">Normal</option>
                </select>
              )}
            </div>
            <div>
              <Label className="mb-1 block">Rol</Label>
              <select value={role} onChange={(e) => setRole(e.target.value as RolAsignable)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {ROLES_ASIGNABLES.map((r) => (
                  <option key={r} value={r}>{rolLabel(r)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Email <span className="text-muted-foreground">(opcional)</span></Label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@…"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <Label className="mb-1 block">Slack member ID <span className="text-muted-foreground">(opcional)</span></Label>
            <input value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="U01234…"
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!name.trim() || guardando} onClick={crear}>
            {guardando ? "Agregando…" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
