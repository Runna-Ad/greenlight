"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Files, Plus, X, GripVertical, Users } from "lucide-react";
import { toast } from "sonner";

import {
  ALLOWED_TRANSITIONS,
  KANBAN_STATUSES,
  STATUS_LABEL,
  STATUS_TOKEN,
  canMove,
  type AssetStatus,
} from "@/lib/brand";
import { moveTask, setAssignees } from "@/app/(app)/[cliente]/tablero/actions";
import { EJECUTA_VERBO, TOAST_VERBO } from "@/components/board/verbos";
import { actionsFor, waitingLabel, type TaskAction } from "@/lib/task-actions";
import {
  DEFAULT_ROLE,
  canAssign,
  canMoveStatus,
  canOverrideStatus,
  type ViewRole,
} from "@/lib/roles";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type Member = { id: string; name: string; color: string; track: "real" | "normal" };

export type Task = {
  id: string;
  code: string | null;
  status: AssetStatus;
  track: "real" | "normal";
  naming_base: string | null;
  concepto: string | null;
  tipo_asset: string | null;
  formato_code: string | null;
  duracion: string | null;
  tamanos: string[] | null;
  plataformas: string[] | null;
  marca: string | null;
  brief_id: string;
  brief_title: string | null;
  file_count: number;
  members: { id: string; name: string; color: string }[];
};

export type BriefOption = { id: string; title: string | null; tab: string | null };

const ALL = "__todas__";

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

  /** Optimistic move; the DB is still the authority, so revert on error. */
  const applyMove = (task: Task, to: AssetStatus) => {
    if (task.status === to || !mayMove) return;
    const from = task.status;
    const esOverride = !canMove(from, to);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: to } : t)));

    startTransition(async () => {
      const res = await moveTask(
        cliente,
        task.id,
        to,
        esOverride ? `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]} fuera del flujo` : undefined,
      );
      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: from } : t)));
        toast.error(res.error ?? "No se pudo mover la tarea.");
      } else if (esOverride) {
        toast.success(`Movida fuera del flujo — queda registrada.`);
      }
    });
  };

  const onDragStart = (e: DragStartEvent) =>
    setDragging(tasks.find((t) => t.id === e.active.id) ?? null);

  const onDragEnd = (e: DragEndEvent) => {
    const task = dragging;
    setDragging(null);
    if (!task || !e.over) return;
    applyMove(task, e.over.id as AssetStatus);
  };

  /** Ejecuta un verbo del flujo. La BD sigue siendo la autoridad. */
  const runAction = (task: Task, action: TaskAction, body?: string) => {
    const from = task.status;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: action.to } : t)));

    startTransition(async () => {
      const res = await EJECUTA_VERBO[action.verb](task.id, body);

      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: from } : t)));
        toast.error(res.error ?? "No se pudo completar la acción.");
        return;
      }
      const msg = TOAST_VERBO[action.verb];
      if (msg) toast.success(msg);
    });
  };

  const applyAssignees = (task: Task, memberIds: string[]) => {
    const before = task.members;
    const next = memberIds
      .map((id) => members.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => ({ id: m!.id, name: m!.name, color: m!.color }));

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, members: next } : t)));

    startTransition(async () => {
      const res = await setAssignees(cliente, task.id, memberIds);
      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, members: before } : t)));
        toast.error(res.error ?? "No se pudo guardar la asignación.");
      }
    });
  };

  return (
    <div>
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
              tasks={visible.filter((t) => t.status === status)}
              members={mayAssign ? members : undefined}
              dragging={dragging}
              mayOverride={mayOverride}
              role={role}
              soyId={soyId}
              onAssign={applyAssignees}
              onMove={mayMove ? applyMove : undefined}
              onAction={runAction}
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
function Column({
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
  onAction,
}: {
  cliente: string;
  status: AssetStatus;
  tasks: Task[];
  members?: Member[];
  dragging: Task | null;
  mayOverride: boolean;
  role: ViewRole;
  soyId: string | null;
  onAssign: (t: Task, ids: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
  onAction: (t: Task, a: TaskAction, body?: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const token = STATUS_TOKEN[status];

  // While dragging, say up front which columns this card can reach. The DB
  // enforces it either way; showing it beats an error toast after the drop.
  // A lead reaches everywhere — the move is logged as an override.
  const reachable =
    !dragging || mayOverride || canMove(dragging.status, status);
  const fueraDeFlujo =
    dragging && mayOverride && !canMove(dragging.status, status);
  const isSource = dragging?.status === status;

  return (
    <div
      className={`w-full transition-opacity lg:w-72 lg:shrink-0 ${
        dragging && !reachable ? "opacity-35" : "opacity-100"
      }`}
    >
      <div
        className="flex items-center justify-between rounded-t-lg border-t-[3px] px-3 py-2"
        style={{
          borderColor: `var(--status-${token})`,
          backgroundColor: `color-mix(in srgb, var(--status-${token}) 8%, var(--card))`,
        }}
      >
        <span className="text-sm font-semibold" style={{ color: `var(--status-${token})` }}>
          {STATUS_LABEL[status]}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: `var(--status-${token})` }}
        >
          {tasks.length}
        </span>
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
          <p className="mb-1 rounded bg-amber-500/15 px-2 py-1 text-center text-[10px] font-medium text-amber-800">
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
              onAction={onAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────
function TaskCard({
  cliente,
  task,
  members,
  mayOverride,
  role,
  soyId,
  onAssign,
  onMove,
  onAction,
}: {
  cliente: string;
  task: Task;
  members?: Member[];
  mayOverride: boolean;
  role: ViewRole;
  soyId: string | null;
  onAssign: (t: Task, ids: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
  onAction: (t: Task, a: TaskAction, body?: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: !onMove,
  });

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
        onAction={onAction}
        handleProps={onMove ? { ...listeners, ...attributes } : undefined}
      />
    </div>
  );
}

function CardBody({
  cliente,
  task,
  members,
  mayOverride,
  role = DEFAULT_ROLE,
  soyId = null,
  onAssign,
  onMove,
  onAction,
  handleProps,
  dragging,
}: {
  cliente: string;
  task: Task;
  members?: Member[];
  mayOverride?: boolean;
  role?: ViewRole;
  soyId?: string | null;
  onAssign?: (t: Task, ids: string[]) => void;
  onMove?: (t: Task, to: AssetStatus) => void;
  onAction?: (t: Task, a: TaskAction, body?: string) => void;
  handleProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const typeToken = task.track === "real" ? "real" : "normal";
  const ctx = {
    isAssignee: !!soyId && task.members.some((m) => m.id === soyId),
    role,
    hasAssignee: task.members.length > 0,
  };
  const acciones = onAction ? actionsFor(task.status, ctx) : [];
  const espera = waitingLabel(task.status, ctx);
  const enCorrecciones = task.status === "in_corrections";
  const targets = ALLOWED_TRANSITIONS[task.status];
  // Todo lo demás sólo aparece para quien puede sacar la tarea del flujo.
  const fueraDeFlujo = mayOverride
    ? KANBAN_STATUSES.filter((s) => s !== task.status && !targets.includes(s))
    : [];

  return (
    <article
      className={`rounded-lg border bg-card p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        enCorrecciones
          ? "border-status-corrections ring-1 ring-[color-mix(in_srgb,var(--status-corrections)_35%,transparent)]"
          : "border-border"
      } ${dragging ? "rotate-1 shadow-lg" : ""}`}
    >
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
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        {task.code && (
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
            {task.code}
          </span>
        )}
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
          style={{
            color: `var(--type-${typeToken})`,
            backgroundColor: `color-mix(in srgb, var(--type-${typeToken}) 12%, transparent)`,
          }}
        >
          {task.track}
        </span>

        {/* Files this ONE task delivers — a count, never separate cards. */}
        <span
          className="ml-auto flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
          title={`${(task.tamanos ?? []).join(", ")} × ${(task.plataformas ?? []).join(", ")}`}
        >
          <Files className="size-2.5" />
          {task.file_count}
        </span>
      </div>

      {/* La puerta a la plantilla de trabajo. El asa de arrastre está aislada
          arriba, así que abrir y arrastrar no compiten. */}
      <Link
        href={`/${cliente}/tareas/${task.id}`}
        className="mt-1.5 block font-mono text-[11px] font-semibold text-foreground underline-offset-2 hover:underline"
      >
        {task.naming_base ?? "Abrir tarea"}
      </Link>
      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
        {task.concepto ?? "Sin concepto"}
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {task.marca && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {task.marca}
          </span>
        )}
        {task.tipo_asset && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {task.tipo_asset}
          </span>
        )}
        {task.formato_code && (
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
            {task.formato_code}
          </span>
        )}
        {task.duracion && task.duracion !== "-" && (
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground">
            {task.duracion}
          </span>
        )}
      </div>

      {/* El camino normal: el trabajo empuja la tarjeta. */}
      {(acciones.length > 0 || espera) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
          {acciones.map((a) =>
            a.needsBody ? (
              <RequestChangesButton key={a.verb} task={task} action={a} onAction={onAction!} />
            ) : (
              <Button
                key={a.verb}
                size="sm"
                variant={a.tone === "danger" ? "destructive" : "default"}
                className="h-7 px-2.5 text-[11px]"
                onClick={() => onAction!(task, a)}
              >
                {a.label}
              </Button>
            ),
          )}
          {espera && acciones.length === 0 && (
            <span className="text-[11px] italic text-muted-foreground">{espera}</span>
          )}
        </div>
      )}

      {/* people + the no-drag way to change status (mobile, keyboard) */}
      <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
        {members && onAssign ? (
          <AssignPicker task={task} members={members} onAssign={onAssign} />
        ) : (
          <PeopleChips members={task.members} />
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
                      {STATUS_LABEL[to]}
                    </button>
                  ))}
                </>
              )}

              {/* Separado a propósito: sacar una tarea del flujo no debe ser un
                  clic indistinguible de seguirlo. Queda registrado con motivo. */}
              {fueraDeFlujo.length > 0 && (
                <>
                  <p className="mt-1 border-t border-border px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-amber-700">
                    Fuera del flujo · queda registrado
                  </p>
                  {fueraDeFlujo.map((to) => (
                    <button
                      key={to}
                      onClick={() => onMove(task, to)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-amber-500/10"
                    >
                      <span
                        className="size-2 rounded-full opacity-60"
                        style={{ backgroundColor: `var(--status-${STATUS_TOKEN[to]})` }}
                      />
                      {STATUS_LABEL[to]}
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
}

/**
 * "Mandar cambios" nunca es un clic suelto: pedir cambios sin decir cuáles no
 * le sirve a nadie. La RPC también lo rechaza — esto sólo evita el viaje.
 */
function RequestChangesButton({
  task,
  action,
  onAction,
}: {
  task: Task;
  action: TaskAction;
  onAction: (t: Task, a: TaskAction, body?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="destructive" className="h-7 px-2.5 text-[11px]">
          {action.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1 pb-1.5 text-[11px] font-medium text-foreground">
          ¿Qué hay que corregir?
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ej. El hook de los primeros 3 segundos no cierra la idea…"
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            Le llega a quien la trabaja.
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2.5 text-[11px]"
            disabled={!body.trim()}
            onClick={() => {
              onAction(task, action, body.trim());
              setBody("");
              setOpen(false);
            }}
          >
            Mandar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium text-foreground"
      style={chipStyle(color)}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
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
 * Assignación picker. The pool is scoped to the task's track — "Clau J" is a
 * Real person and "Clau T" a Normal one; they must not cross.
 */
function AssignPicker({
  task,
  members,
  onAssign,
}: {
  task: Task;
  members: Member[];
  onAssign: (t: Task, ids: string[]) => void;
}) {
  const pool = members.filter((m) => m.track === task.track);
  const selected = new Set(task.members.map((m) => m.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onAssign(task, [...next]);
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
              {task.members.map((m) => (
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

      <PopoverContent align="start" className="w-56 p-1">
        <p className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Users className="size-3" />
          Asignación · {task.track}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {pool.map((m) => {
            const on = selected.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
              >
                <span
                  className="size-3 shrink-0 rounded-sm border border-black/10"
                  style={{ backgroundColor: m.color }}
                />
                <span className="flex-1">{m.name}</span>
                {on && <X className="size-3 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
