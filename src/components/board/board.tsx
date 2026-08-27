"use client";

import { memo, useCallback, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { Files, Plus, X, GripVertical, Users, Crown, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  ALLOWED_TRANSITIONS,
  KANBAN_STATUSES,
  STATUS_LABEL,
  STATUS_TOKEN,
  canMove,
  type AssetStatus,
} from "@/lib/brand";
import { moveTask, asignarTarea } from "@/app/(app)/[cliente]/tablero/actions";
import {
  DEFAULT_ROLE,
  canAssign,
  canMoveStatus,
  canOverrideStatus,
  type ViewRole,
} from "@/lib/roles";
import { contentType, canales } from "@/lib/iconos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Pill, type PillStatus } from "@/components/ui/pill";

export type Member = {
  id: string;
  name: string;
  color: string;
  track: "real" | "normal";
  /** Rol REAL del miembro (track_members.role). El picker sólo hace asignable al
   *  `lead` (como Lead) y al `creative` (como Especialista) del track de la tarea;
   *  admin/master no son "doers", así que quedan fuera por rol. */
  role: string;
};

export type Task = {
  id: string;
  code: string | null;
  status: AssetStatus;
  track: "real" | "normal";
  naming_base: string | null;
  concepto: string | null;
  tipo_asset: string | null;
  formato_code: string | null;
  duracion: string[] | null;
  tamanos: string[] | null;
  plataformas: string[] | null;
  marca: string | null;
  marca_logo_url: string | null;
  brief_id: string;
  brief_title: string | null;
  file_count: number;
  members: { id: string; name: string; color: string }[];
  /** Asignados partidos por es_lead (los expone board_tasks: `leads` / `team`).
   *  El picker usa `leads[0]` como el Lead actual y `team` como Especialistas —
   *  así editar no pierde al lead ni degrada a nadie a Especialista por error. */
  leads: { id: string; name: string; color: string }[];
  team: { id: string; name: string; color: string }[];
  /** Cuándo se hizo Greenlit (delivered). Sólo lo trae el loader para tareas delivered;
   *  la columna Greenlit muestra únicamente las de ≤7 días (el resto va a Entregas). */
  deliveredAt?: string | null;
  /** in_corrections con cambios del cliente sin resolver — cancha del lead; se oculta al
   *  especialista y en la tarjeta se marca "Sin especialista"/aviso al lead. */
  clientChangesPending?: boolean;
};

export type BriefOption = { id: string; title: string | null; tab: string | null };

const ALL = "__todas__";

// El tablero re-etiqueta y re-colorea las columnas del ciclo cliente (propio del board,
// sin tocar STATUS_LABEL/STATUS_TOKEN globales que usan otras vistas): interno
// "Listo para enviar" (teal, NO verde — el verde es sólo para aprobado/Greenlit),
// "Con Cliente" (azul --status-published) y "Greenlit" (verde neón del logo).
const BOARD_LABEL: Partial<Record<AssetStatus, string>> = {
  completed: "Listo para enviar",
  published: "Con Cliente",
  delivered: "Greenlit",
};
/** Label del tablero: el propio (Con Cliente/Greenlit/Listo para enviar) o el global. */
const boardLabel = (s: AssetStatus): string => BOARD_LABEL[s] ?? STATUS_LABEL[s];
// Acentos propios (hex, para que <Pill color> mida el contraste). published no se
// sobreescribe: su token --status-published ya es azul. Sólo completed→teal, delivered→neón.
const BOARD_ACCENT: Partial<Record<AssetStatus, string>> = {
  completed: "#0d9488", // teal — acción pendiente (listo para enviar), no aprobado
  delivered: "#00e676", // verde neón del logo — Greenlit
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;
/** ¿Greenlit hace ≤7 días? Las más viejas salen del board y viven en Entregas-archivo. */
function esGreenlitReciente(t: Task): boolean {
  return !!t.deliveredAt && Date.now() - new Date(t.deliveredAt).getTime() <= MS_7D;
}

// Referencia estable para columnas sin tarjetas: evita crear un [] nuevo por
// render, que rompería el React.memo de <Column>.
const EMPTY_TASKS: Task[] = [];

/**
 * The sheet's people colours are NOT all pastel — Sebas is #666666, Mony a
 * mid purple. Used as a text background they failed contrast badly (2.3:1 and
 * 3.7:1), and for the mid tones no text colour fixes it: neither white nor
 * dark navy clears 4.5:1 on #8e7cc3.
 *
 * So the colour identifies, it doesn't carry the text: a light tint behind
 * normal foreground text, plus a solid dot in the true colour. Stays legible
 * whatever colour someone picks later in admin.
 */
const chipStyle = (color: string) => ({
  backgroundColor: `color-mix(in srgb, ${color} 26%, var(--card))`,
  borderColor: `color-mix(in srgb, ${color} 55%, var(--card))`,
});

export function Board({
  cliente,
  tasks: initialTasks,
  members,
  briefs,
  role = DEFAULT_ROLE,
  soyId = null,
}: {
  cliente: string;
  tasks: Task[];
  members: Member[];
  briefs: BriefOption[];
  role?: ViewRole;
  /** Quién dice ser quien mira, para saber cuáles son "sus" tareas. */
  soyId?: string | null;
}) {
  const mayMove = canMoveStatus(role);
  const mayOverride = canOverrideStatus(role);
  const mayAssign = canAssign(role);

  const [tasks, setTasks] = useState(initialTasks);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [, startTransition] = useTransition();

  // ── filters ──
  const [fPersona, setFPersona] = useState(ALL);
  const [fBrief, setFBrief] = useState(ALL);
  const [fPlataforma, setFPlataforma] = useState(ALL);
  const [fMarca, setFMarca] = useState(ALL);

  const plataformas = useMemo(
    () => [...new Set(tasks.flatMap((t) => t.plataformas ?? []))].filter(Boolean).sort(),
    [tasks],
  );
  const marcas = useMemo(
    () => [...new Set(tasks.map((t) => t.marca).filter(Boolean) as string[])].sort(),
    [tasks],
  );

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (fPersona === ALL || t.members.some((m) => m.id === fPersona)) &&
          (fBrief === ALL || t.brief_id === fBrief) &&
          (fPlataforma === ALL || (t.plataformas ?? []).includes(fPlataforma)) &&
          (fMarca === ALL || t.marca === fMarca),
      ),
    [tasks, fPersona, fBrief, fPlataforma, fMarca],
  );

  // Agrupa las tarjetas visibles por columna UNA sola vez por render. Así cada
  // <Column> recibe su propio array (misma referencia mientras `visible` no
  // cambie) y su React.memo puede saltarse el re-render — antes se hacía un
  // visible.filter(...) inline por columna, creando un array nuevo cada vez.
  // La columna Greenlit (delivered) sólo lista las de ≤7 días (el resto vive en
  // Entregas-archivo); las demás columnas, todo su estado.
  const tasksByStatus = useMemo(() => {
    const map = new Map<AssetStatus, Task[]>();
    for (const status of KANBAN_STATUSES) map.set(status, []);
    for (const t of visible) {
      if (t.status === "delivered" && !esGreenlitReciente(t)) continue;
      map.get(t.status)?.push(t);
    }
    return map;
  }, [visible]);

  const filtersOn = [fPersona, fBrief, fPlataforma, fMarca].some((f) => f !== ALL);
  const clearFilters = () => {
    setFPersona(ALL);
    setFBrief(ALL);
    setFPlataforma(ALL);
    setFMarca(ALL);
  };

  const sensors = useSensors(
    // A small distance keeps a click-to-open-popover from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /** Optimistic move; the DB is still the authority, so revert on error.
   *  useCallback: su identidad estable deja que <Column>/<TaskCard> memoizados
   *  se salten el re-render (se pasa como onMove). */
  const applyMove = useCallback(
    (task: Task, to: AssetStatus) => {
      if (task.status === to || !mayMove) return;
      const from = task.status;
      const esOverride = !canMove(from, to);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: to } : t)));

      startTransition(async () => {
        const res = await moveTask(
          cliente,
          task.id,
          to,
          esOverride ? `${boardLabel(from)} → ${boardLabel(to)} fuera del flujo` : undefined,
        );
        if (!res.ok) {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: from } : t)));
          toast.error(res.error ?? "No se pudo mover la tarea.");
        } else if (esOverride) {
          toast.success(`Movida fuera del flujo — queda registrada.`);
        }
      });
    },
    [cliente, mayMove],
  );

  const onDragStart = useCallback(
    (e: DragStartEvent) => setDragging(tasks.find((t) => t.id === e.active.id) ?? null),
    [tasks],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const task = dragging;
      setDragging(null);
      if (!task || !e.over) return;
      applyMove(task, e.over.id as AssetStatus);
    },
    [dragging, applyMove],
  );

  // Asignar en el tablero = MISMA regla que el task section: un Lead (rol `lead`)
  // + Especialistas (rol `creative`), atados al track de la tarea, vía `asignarTarea`
  // (re-valida rol+track+activo en el SERVIDOR). Antes iba por `setAssignees`, que no
  // validaba nada y metía a todos como Especialista (es_lead=false). (Pedro)
  const applyAssignees = useCallback(
    (task: Task, leadId: string | null, especialistaIds: string[]) => {
      const before = { members: task.members, leads: task.leads, team: task.team };
      const chip = (id: string) => {
        const m = members.find((x) => x.id === id);
        return m ? { id: m.id, name: m.name, color: m.color } : null;
      };
      const leadChip = leadId ? chip(leadId) : null;
      const teamChips = especialistaIds.map(chip).filter(Boolean) as Task["team"];
      const nextLeads = leadChip ? [leadChip] : [];
      const nextMembers = [...nextLeads, ...teamChips];

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, members: nextMembers, leads: nextLeads, team: teamChips } : t,
        ),
      );

      startTransition(async () => {
        const res = await asignarTarea(task.id, leadId, especialistaIds);
        if (!res.ok) {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...before } : t)));
          toast.error(res.error ?? "No se pudo guardar la asignación.");
        }
      });
    },
    [members],
  );

  // Aviso agregado "Sin lead": tareas con especialistas pero sin lead responsable.
  // Sólo para quien asigna (lead/admin/master) — el especialista no puede arreglarlo.
  const sinLeadN = mayAssign
    ? visible.filter((t) => t.team.length > 0 && t.leads.length === 0).length
    : 0;

  return (
    <div>
      {sinLeadN > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-[13px] text-status-warning">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <b className="font-semibold">{sinLeadN}</b> tarea{sinLeadN === 1 ? "" : "s"} con
            especialistas pero <b className="font-semibold">sin lead responsable</b> — asígnales un
            lead antes de que se trabajen (revisa/aprueba/enruta los cambios del cliente).
          </span>
        </div>
      )}
      <FilterBar
        members={members}
        briefs={briefs}
        plataformas={plataformas}
        marcas={marcas}
        fPersona={fPersona}
        fBrief={fBrief}
        fPlataforma={fPlataforma}
        fMarca={fMarca}
        setFPersona={setFPersona}
        setFBrief={setFBrief}
        setFPlataforma={setFPlataforma}
        setFMarca={setFMarca}
        onClear={filtersOn ? clearFilters : undefined}
        showing={visible.length}
        total={tasks.length}
      />

      {/* A stable id is required: without it dnd-kit numbers its a11y description
          element from a module counter, which lands on a different value during
          SSR than on the client and hydration fails ("DndDescribedBy-1" vs "-0"). */}
      <DndContext
        id="tablero"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        {/* Columns stack vertically below lg — the board must never scroll
            horizontally on a narrow screen (Pedro, 2026-07-30). */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-2">
          {KANBAN_STATUSES.map((status) => (
            <Column
              key={status}
              cliente={cliente}
              status={status}
              // Slice ya agrupado (ver tasksByStatus): la columna Greenlit
              // (delivered) trae SÓLO las de ≤7 días; las más viejas viven en
              // Entregas-archivo. Referencia estable → React.memo puede saltar.
              tasks={tasksByStatus.get(status) ?? EMPTY_TASKS}
              members={mayAssign ? members : undefined}
              dragging={dragging}
              mayOverride={mayOverride}
              role={role}
              soyId={soyId}
              onAssign={applyAssignees}
              onMove={mayMove ? applyMove : undefined}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging ? <CardBody cliente={cliente} task={dragging} dragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Column
// ─────────────────────────────────────────────────────────────
const Column = memo(function Column({
  cliente,
  status,
  tasks,
  members,
  dragging,
  mayOverride,
  role,
  soyId,
  onAssign,
  onMove,
}: {
  cliente: string;
  status: AssetStatus;
  tasks: Task[];
  members?: Member[];
  dragging: Task | null;
  mayOverride: boolean;
  role: ViewRole;
  soyId: string | null;
  onAssign: (t: Task, leadId: string | null, especialistaIds: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const token = STATUS_TOKEN[status];
  // Label y acento propios del tablero (Con Cliente / Greenlit / Listo para enviar);
  // el resto cae a los globales.
  const accent = BOARD_ACCENT[status] ?? `var(--status-${token})`;
  const label = boardLabel(status);

  // While dragging, say up front which columns this card can reach. The DB
  // enforces it either way; showing it beats an error toast after the drop.
  // A lead reaches everywhere — the move is logged as an override.
  const reachable =
    !dragging || mayOverride || canMove(dragging.status, status);
  const fueraDeFlujo =
    dragging && mayOverride && !canMove(dragging.status, status);
  const isSource = dragging?.status === status;

  // Auto-colapso (estilo Trello): una columna VACÍA se pliega a una tira delgada para
  // ahorrar espacio horizontal. Durante un drag se expande (para poder soltar ahí).
  const collapsed = tasks.length === 0 && !dragging;
  if (collapsed) {
    return (
      <div
        className="flex w-full shrink-0 items-center gap-2 rounded-lg border border-t-[3px] border-border bg-secondary/25 px-3 py-2 lg:w-11 lg:flex-col lg:justify-start lg:px-0 lg:py-3"
        style={{ borderTopColor: accent }}
        title={`${label} · 0`}
      >
        <span
          className="text-[13px] font-semibold lg:tracking-wide lg:[writing-mode:vertical-rl]"
          style={{ color: `color-mix(in srgb, ${accent} 78%, #000)` }}
        >
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground lg:mt-1">0</span>
      </div>
    );
  }

  return (
    <div
      className={`w-full transition-opacity lg:w-72 lg:shrink-0 ${
        dragging && !reachable ? "opacity-35" : "opacity-100"
      }`}
    >
      <div
        className="flex items-center justify-between rounded-t-lg border-t-[3px] px-3 py-2"
        style={{
          borderColor: accent,
          backgroundColor: `color-mix(in srgb, ${accent} 8%, var(--card))`,
        }}
      >
        <span
          className="text-sm font-semibold"
          style={{ color: `color-mix(in srgb, ${accent} 78%, #000)` }}
        >
          {label}
        </span>
        {BOARD_ACCENT[status] ? (
          <Pill color={accent} fill="solid" className="text-[11px]">
            {tasks.length}
          </Pill>
        ) : (
          <Pill status={token as PillStatus} className="text-[11px]">
            {tasks.length}
          </Pill>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[120px] space-y-2 rounded-b-lg border border-t-0 p-2 transition-colors ${
          isOver && reachable && !isSource
            ? "border-primary bg-primary/5 ring-2 ring-primary/30"
            : "border-border bg-secondary/25"
        }`}
      >
        {dragging && !isSource && reachable && fueraDeFlujo && (
          <p className="mb-1 rounded bg-status-warning/15 px-2 py-1 text-center text-[10px] font-medium text-status-warning">
            Fuera del flujo · queda registrado
          </p>
        )}
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {dragging && reachable && !isSource ? "Suelta aquí" : "Sin tarjetas"}
          </p>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id}
              cliente={cliente}
              task={t}
              members={members}
              mayOverride={mayOverride}
              role={role}
              soyId={soyId}
              onAssign={onAssign}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────
const TaskCard = memo(function TaskCard({
  cliente,
  task,
  members,
  mayOverride,
  role,
  soyId,
  onAssign,
  onMove,
}: {
  cliente: string;
  task: Task;
  members?: Member[];
  mayOverride: boolean;
  role: ViewRole;
  soyId: string | null;
  onAssign: (t: Task, leadId: string | null, especialistaIds: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
}) {
  // "Con Cliente" (published) queda DRAG-LOCKED: la tarjeta no se arrastra hacia
  // adelante — el cliente la mueve desde el portal (aprobar / pedir cambios). Sí se
  // puede SOLTAR una tarjeta EN esta columna (= enviar a cliente) porque el drop-target
  // es la columna, no la tarjeta; y el lead conserva el menú "Mover" para overrides.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !onMove || task.status === "published",
  });

  // dnd-kit ya memoiza `listeners` y `attributes`; el spread creaba un objeto
  // nuevo por render que rompía el React.memo de <CardBody>. Lo fijamos aquí.
  // Sin grip de arrastre en "Con Cliente" (drag-locked); el menú "Mover" (onMove) sí sigue.
  const handleProps = useMemo<Record<string, unknown> | undefined>(
    () =>
      onMove && task.status !== "published" ? { ...listeners, ...attributes } : undefined,
    [onMove, task.status, listeners, attributes],
  );

  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <CardBody
        cliente={cliente}
        task={task}
        members={members}
        mayOverride={mayOverride}
        role={role}
        soyId={soyId}
        onAssign={onAssign}
        onMove={onMove}
        handleProps={handleProps}
      />
    </div>
  );
});

const CardBody = memo(function CardBody({
  cliente,
  task,
  members,
  mayOverride,
  onAssign,
  onMove,
  handleProps,
  dragging,
}: {
  cliente: string;
  task: Task;
  members?: Member[];
  mayOverride?: boolean;
  /** role/soyId ya no se usan aquí (se quitaron los botones del tablero: el
      trabajo se empuja arrastrando o desde el workspace), pero se dejan en el
      tipo por si vuelven — los padres los siguen pasando sin costo. */
  role?: ViewRole;
  soyId?: string | null;
  onAssign?: (t: Task, leadId: string | null, especialistaIds: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
  handleProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const typeToken = task.track === "real" ? "real" : "normal";
  const tipo = contentType(task.tipo_asset);
  const IconoTipo = tipo.icon;
  const enCorrecciones = task.status === "in_corrections";
  const targets = ALLOWED_TRANSITIONS[task.status];
  // Todo lo demás sólo aparece para quien puede sacar la tarea del flujo.
  const fueraDeFlujo = mayOverride
    ? KANBAN_STATUSES.filter((s) => s !== task.status && !targets.includes(s))
    : [];

  return (
    <article
      className={`relative rounded-lg border bg-card p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        enCorrecciones
          ? "border-status-corrections ring-1 ring-[color-mix(in_srgb,var(--status-corrections)_35%,transparent)]"
          : "border-border"
      } ${dragging ? "rotate-1 scale-[1.03] shadow-lg" : ""}`}
    >
      {/* Toda la tarjeta abre la tarea: un link estirado por debajo. Los
          controles (asa de arrastre, gente, Mover) van con `relative z-10` para
          quedar por encima y seguir siendo clicables. */}
      <Link
        href={`/${cliente}/tareas/${task.id}`}
        aria-label={`Abrir ${task.naming_base ?? "tarea"}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {enCorrecciones && (
        <p className="mb-1.5 rounded bg-[color-mix(in_srgb,var(--status-corrections)_12%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-corrections">
          Cambios pedidos
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {/* Only the handle starts a drag, so the chips below stay clickable. */}
        <button
          {...handleProps}
          aria-label="Arrastrar tarea"
          className="relative z-10 -ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        {/* La MARCA en lugar del código A2/B1: si tiene logo, SÓLO el logo (más
            grande, sin repetir el nombre); si no, el nombre como pastilla. */}
        {task.marca_logo_url ? (
          // Logo por card → un <img> plano es más ligero que next/image; el
          // archivo ya es chico y público.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={task.marca_logo_url}
            alt={task.marca ?? "Marca"}
            className="h-9 w-auto max-w-[132px] object-contain object-left"
          />
        ) : task.marca ? (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
            {task.marca}
          </span>
        ) : null}
        {/* Tipo (real/animado/estático) + conteo de archivos van a la DERECHA,
            para dejarle todo el ancho de la izquierda al logo de la marca. */}
        <span
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
          title={tipo.label}
          style={{
            color: `var(--type-${typeToken})`,
            backgroundColor: `color-mix(in srgb, var(--type-${typeToken}) 12%, transparent)`,
          }}
        >
          <IconoTipo className="size-3" />
          {task.track}
        </span>

        {/* Files this ONE task delivers — a count, never separate cards. */}
        <span
          className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
          title={`${(task.tamanos ?? []).join(", ")} × ${(task.plataformas ?? []).join(", ")}`}
        >
          <Files className="size-2.5" />
          {task.file_count}
        </span>
      </div>

      {/* Toda la tarjeta es el link (arriba); el título es sólo texto para no
          anidar un <a> dentro de otro. */}
      <p className="mt-1.5 font-mono text-[11px] font-semibold text-foreground">
        {task.naming_base ?? "Abrir tarea"}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
        {task.concepto ?? "Sin concepto"}
      </p>

      {/* Los CANALES a los que va la pieza (Google / Facebook / TikTok), cada uno
          en su color — más útil de un vistazo que tipo/formato/duración. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {canales(task.plataformas ?? []).map((c) => (
          <span
            key={c.code}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              color: c.color,
              backgroundColor: `color-mix(in srgb, ${c.color} 14%, transparent)`,
            }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {/* Sin botones de flujo aquí: en el tablero el trabajo se empuja
          arrastrando (o con "Mover"), y el auto-move + la barra del workspace
          los hacían redundantes. (Decisión de Pedro.) */}

      {/* people + the no-drag way to change status (mobile, keyboard).
          relative z-10: por encima del link estirado, para seguir clicables. */}
      <div className="relative z-10 mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
        {members && onAssign ? (
          <AssignPicker task={task} members={members} onAssign={onAssign} />
        ) : (
          <PeopleChips members={task.members} />
        )}

        {/* Aviso "Sin lead": tiene especialistas pero NADIE marcado como lead. Toda
            tarea necesita un lead responsable (revisa/aprueba/enruta los cambios del
            cliente). Sólo para quien asigna (mayAssign → members presente). (Pedro) */}
        {members && task.team.length > 0 && task.leads.length === 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded border border-status-warning/40 bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-warning"
            title="Sin lead responsable — asígnale uno"
          >
            <AlertTriangle className="size-2.5" /> Sin lead
          </span>
        )}

        {onMove && (targets.length > 0 || fueraDeFlujo.length > 0) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-1.5 text-[10px] text-muted-foreground"
              >
                Mover
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1">
              {targets.length > 0 && (
                <>
                  <p className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Mover a
                  </p>
                  {targets.map((to) => (
                    <button
                      key={to}
                      onClick={() => onMove(task, to)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `var(--status-${STATUS_TOKEN[to]})` }}
                      />
                      {boardLabel(to)}
                    </button>
                  ))}
                </>
              )}

              {/* Separado a propósito: sacar una tarea del flujo no debe ser un
                  clic indistinguible de seguirlo. Queda registrado con motivo. */}
              {fueraDeFlujo.length > 0 && (
                <>
                  <p className="mt-1 border-t border-border px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-status-warning">
                    Fuera del flujo · queda registrado
                  </p>
                  {fueraDeFlujo.map((to) => (
                    <button
                      key={to}
                      onClick={() => onMove(task, to)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-status-warning/10"
                    >
                      <span
                        className="size-2 rounded-full opacity-60"
                        style={{ backgroundColor: `var(--status-${STATUS_TOKEN[to]})` }}
                      />
                      {boardLabel(to)}
                    </button>
                  ))}
                </>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </article>
  );
});

function MemberChip({ name, color, lead }: { name: string; color: string; lead?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium text-foreground"
      style={chipStyle(color)}
    >
      {lead ? (
        <Crown className="size-2 shrink-0" style={{ color }} />
      ) : (
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      {name}
    </span>
  );
}

function PeopleChips({ members }: { members: { id: string; name: string; color: string }[] }) {
  if (!members.length)
    return <span className="text-[10px] text-muted-foreground">Sin asignar</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {members.map((m) => (
        <MemberChip key={m.id} name={m.name} color={m.color} />
      ))}
    </div>
  );
}

/**
 * Picker de asignación del tablero — PARIDAD con el task section: un Lead (rol
 * `lead`) y Especialistas (rol `creative`), ambos del TRACK de la tarea. Los pools
 * salen de `members` filtrando por track+rol, así admin/master no aparecen (no son
 * "doers"). Controlado por `task` (lee leads/team en cada render) y auto-guarda cada
 * cambio vía `onAssign` → `asignarTarea`, que re-valida rol+track+activo en el
 * SERVIDOR. Antes era una lista plana por `setAssignees` sin validar, que metía a
 * todos como Especialista aunque fueran Lead. (Pedro)
 */
function AssignPicker({
  task,
  members,
  onAssign,
}: {
  task: Task;
  members: Member[];
  onAssign: (t: Task, leadId: string | null, especialistaIds: string[]) => void;
}) {
  const leadsPool = members.filter((m) => m.track === task.track && m.role === "lead");
  const espPool = members.filter((m) => m.track === task.track && m.role === "creative");
  const leadId = task.leads[0]?.id ?? null;
  const teamIds = new Set(task.team.map((m) => m.id));

  const pickLead = (id: string | null) => onAssign(task, id, [...teamIds]);
  const toggleEsp = (id: string) => {
    const next = new Set(teamIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onAssign(task, leadId, [...next]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-secondary"
          aria-label="Asignar personas"
        >
          {task.members.length ? (
            <span className="flex flex-wrap gap-1">
              {task.leads.map((m) => (
                <MemberChip key={m.id} name={m.name} color={m.color} lead />
              ))}
              {task.team.map((m) => (
                <MemberChip key={m.id} name={m.name} color={m.color} />
              ))}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Plus className="size-3" /> Asignar
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-60 p-1.5">
        <p className="flex items-center gap-1.5 px-1 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Users className="size-3" />
          Asignación · {task.track}
        </p>

        <p className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lead <span className="font-normal normal-case text-muted-foreground/60">· uno</span>
        </p>
        {leadsPool.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground/70">No hay Leads en este track.</p>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <button
                onClick={() => pickLead(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
              >
                <Radio activo={leadId === null} />
                Sin lead
              </button>
            </li>
            {leadsPool.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => pickLead(l.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                >
                  <Radio activo={leadId === l.id} />
                  <Crown className="size-3 shrink-0" style={{ color: l.color }} /> {l.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Especialistas <span className="font-normal normal-case text-muted-foreground/60">· varios</span>
        </p>
        {espPool.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground/70">
            No hay Especialistas en este track.
          </p>
        ) : (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {espPool.map((e) => {
              const on = teamIds.has(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => toggleEsp(e.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center rounded border"
                      style={{ borderColor: e.color }}
                    >
                      {on && <Check className="size-3" style={{ color: e.color }} />}
                    </span>
                    <span className="flex-1">{e.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Círculo estilo radio (el Lead es uno solo). */
function Radio({ activo }: { activo: boolean }) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
        activo ? "border-primary bg-primary" : "border-muted-foreground/40"
      }`}
    >
      {activo && <span className="size-1.5 rounded-full bg-white" />}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────
function FilterBar(props: {
  members: Member[];
  briefs: BriefOption[];
  plataformas: string[];
  marcas: string[];
  fPersona: string;
  fBrief: string;
  fPlataforma: string;
  fMarca: string;
  setFPersona: (v: string) => void;
  setFBrief: (v: string) => void;
  setFPlataforma: (v: string) => void;
  setFMarca: (v: string) => void;
  onClear?: () => void;
  showing: number;
  total: number;
}) {
  const sel =
    "h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        className={sel}
        value={props.fPersona}
        onChange={(e) => props.setFPersona(e.target.value)}
        aria-label="Filtrar por persona"
      >
        <option value={ALL}>Todas las personas</option>
        {props.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.track}
          </option>
        ))}
      </select>

      <select
        className={sel}
        value={props.fBrief}
        onChange={(e) => props.setFBrief(e.target.value)}
        aria-label="Filtrar por brief"
      >
        <option value={ALL}>Todos los briefs</option>
        {props.briefs.map((b) => (
          <option key={b.id} value={b.id}>
            {b.tab ?? b.title ?? "Sin nombre"}
          </option>
        ))}
      </select>

      <select
        className={sel}
        value={props.fPlataforma}
        onChange={(e) => props.setFPlataforma(e.target.value)}
        aria-label="Filtrar por plataforma"
      >
        <option value={ALL}>Todas las plataformas</option>
        {props.plataformas.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {props.marcas.length > 0 && (
        <select
          className={sel}
          value={props.fMarca}
          onChange={(e) => props.setFMarca(e.target.value)}
          aria-label="Filtrar por marca"
        >
          <option value={ALL}>Todas las marcas</option>
          {props.marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {props.onClear && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={props.onClear}>
          <X className="size-3" /> Limpiar
        </Button>
      )}

      <span className="ml-auto text-xs text-muted-foreground">
        {props.showing === props.total
          ? `${props.total} tarea${props.total === 1 ? "" : "s"}`
          : `${props.showing} de ${props.total} tareas`}
      </span>
    </div>
  );
}
