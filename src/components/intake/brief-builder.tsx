"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TRACK_HINT, TRACK_LABEL, PLACEHOLDER, type Track } from "@/lib/vocab";
import {
  combosDeTarjeta,
  faltantesDraft,
  idsIdeaRepetida,
  nextVariantForLetter,
  splitIdeaCode,
  tarjetaEnBlanco,
  type BriefHeader,
  type TaskDraft,
} from "@/lib/intake-crear";
import { crearBrief } from "@/app/(app)/[cliente]/briefs/nuevo/actions";
import { TaskCard } from "./task-card";
import type { PickCard } from "./copy-to-picker";

const uid = () => crypto.randomUUID();
const clone = <T,>(v: T): T => (Array.isArray(v) ? ([...v] as T) : v);

export function BriefBuilder({ cliente }: { cliente: string }) {
  const router = useRouter();

  const [header, setHeader] = useState<BriefHeader>({
    track: "real",
    title: "",
    briefName: "",
    mes: "",
  });
  const [tasks, setTasks] = useState<TaskDraft[]>(() => [tarjetaEnBlanco(uid())]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const t = tasks[0];
    return t ? { [t.id]: true } : {};
  });
  const [lastTargets, setLastTargets] = useState<string[]>([]);
  const [nBulk, setNBulk] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  // ── validación en vivo (mismo gate que el servidor, para bloquear el botón) ──
  const problemas = useMemo(() => {
    const repetidas = idsIdeaRepetida(tasks);
    const map = new Map<string, string[]>();
    for (const t of tasks) {
      const m: string[] = [...faltantesDraft(t)];
      if (repetidas.has(t.id)) m.push("# Idea repetido");
      if (m.length) map.set(t.id, m);
    }
    return map;
  }, [tasks]);

  const totalEntregables = useMemo(
    () => tasks.reduce((n, t) => n + combosDeTarjeta(t).length, 0),
    [tasks],
  );

  const ready = tasks.length > 0 && problemas.size === 0 && header.title.trim().length > 0;

  // Tarjetas para el selector "copiar a…" (etiqueta + marca/tipo para los atajos).
  const pickCards: PickCard[] = tasks.map((t, i) => ({
    id: t.id,
    label: (t.numIdea.trim() || `Tarea ${i + 1}`) + (t.concepto ? ` · ${t.concepto.slice(0, 24)}` : ""),
    marca: t.marca[0] ?? "",
    tipo: t.tipoAsset[0] ?? "",
  }));

  // ── mutadores ──
  const switchTrack = (track: Track) => {
    if (track === header.track) return;
    setHeader((h) => ({ ...h, track }));
    // Asignación, Tipo de Asset y Formato tienen pools distintos por track.
    setTasks((prev) => prev.map((t) => ({ ...t, asignacion: [], tipoAsset: [], formato: [] })));
  };

  const setChip = (id: string, key: keyof TaskDraft) => (updater: (prev: string[]) => string[]) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: updater(t[key] as string[]) } : t)));

  const setText = (id: string, key: keyof TaskDraft, value: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)));

  const copyField = (sourceId: string, key: keyof TaskDraft, targetIds: string[]) => {
    setTasks((prev) => {
      const src = prev.find((t) => t.id === sourceId);
      if (!src) return prev;
      const val = clone(src[key]);
      return prev.map((t) => (targetIds.includes(t.id) ? { ...t, [key]: val } : t));
    });
    setLastTargets(targetIds); // recuerda para el próximo campo
  };

  // Copiar VARIOS campos a la vez a las tarjetas elegidas (3er gesto).
  const copyFields = (sourceId: string, keys: (keyof TaskDraft)[], targetIds: string[]) => {
    setTasks((prev) => {
      const src = prev.find((t) => t.id === sourceId);
      if (!src) return prev;
      const patch: Partial<TaskDraft> = {};
      for (const k of keys) (patch as Record<string, unknown>)[k] = clone(src[k]);
      return prev.map((t) => (targetIds.includes(t.id) ? { ...t, ...patch } : t));
    });
    setLastTargets(targetIds);
  };

  const addTasks = (n: number) => {
    const nuevas = Array.from({ length: Math.max(1, n) }, () => tarjetaEnBlanco(uid()));
    setTasks((prev) => [...prev, ...nuevas]);
    setExpanded((e) => ({ ...e, [nuevas[0].id]: true }));
  };

  const duplicate = (id: string) => {
    setTasks((prev) => {
      const i = prev.findIndex((t) => t.id === id);
      if (i < 0) return prev;
      const src = prev[i];
      const { letter } = splitIdeaCode(src.numIdea);
      const variant = nextVariantForLetter(prev, letter);
      const copia: TaskDraft = {
        ...src,
        id: uid(),
        // Copiar TODO menos la identidad: # Idea avanza a la siguiente variante
        // libre de su familia (A1 → A2) para no chocar en la base.
        numIdea: src.numIdea.trim() ? `${letter}${variant}` : "",
        entrega: [...src.entrega],
        asignacion: [...src.asignacion],
        marca: [...src.marca],
        plataforma: [...src.plataforma],
        tipoAsset: [...src.tipoAsset],
        formato: [...src.formato],
        tamano: [...src.tamano],
        genero: [...src.genero],
      };
      const next = [...prev];
      next.splice(i + 1, 0, copia);
      setExpanded((e) => ({ ...e, [copia.id]: true }));
      return next;
    });
  };

  const remove = (id: string) =>
    setTasks((prev) => (prev.length === 1 ? prev : prev.filter((t) => t.id !== id)));

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await crearBrief(cliente, { header, tasks });
      if (r.ok) {
        toast.success(`Brief creado — ${r.created} tarea${r.created === 1 ? "" : "s"}, ${r.assets} entregable${r.assets === 1 ? "" : "s"}`);
        router.push(`/${cliente}/briefs`);
        router.refresh();
        return;
      }
      if (r.blocked.length) {
        toast.error(`${r.blocked.length} tarjeta(s) con datos faltantes: ${r.blocked.map((b) => b.titulo).join(", ")}`);
      } else {
        toast.error(r.errors.join(" · ") || "No se pudo crear el brief");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        {cliente} · Nuevo brief
      </div>
      <h2 className="mb-5 text-2xl font-semibold text-foreground">Capturar brief</h2>

      {/* ── Encabezado del brief (aplica a todas las tareas) ── */}
      <section className="gl-card mb-5 rounded-xl border border-border bg-card p-5">
        <Label className="mb-2 block">¿Real o Normal?</Label>
        <div className="flex flex-wrap gap-2">
          {(["real", "normal"] as Track[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTrack(t)}
              aria-pressed={header.track === t}
              className={cn(
                "flex-1 min-w-[200px] rounded-lg border p-3 text-left transition-colors",
                header.track === t ? "border-primary bg-primary/10" : "border-input hover:border-primary",
              )}
            >
              <span className="flex items-center gap-2 font-semibold text-foreground">
                {header.track === t && <Check className="size-4 text-primary" />}
                {TRACK_LABEL[t]}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{TRACK_HINT[t]}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Un brief es Real <em>o</em> Normal — cambia las opciones de Asignación, Tipo de Asset y Formato de todas las tareas.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label className="mb-1 block">Título del brief</Label>
            <input
              value={header.title}
              onChange={(e) => setHeader((h) => ({ ...h, title: e.target.value }))}
              placeholder="Brief 05/08"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <Label className="mb-1 block">Brief Name</Label>
            <input
              value={header.briefName}
              onChange={(e) => setHeader((h) => ({ ...h, briefName: e.target.value }))}
              placeholder={PLACEHOLDER.brief_name}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <Label className="mb-1 block">Mes</Label>
            <input
              value={header.mes}
              onChange={(e) => setHeader((h) => ({ ...h, mes: e.target.value }))}
              placeholder={PLACEHOLDER.mes}
              className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </section>

      {/* ── Tareas ── */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {tasks.length} tarea{tasks.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => addTasks(1)}>
            <Plus /> Agregar tarea
          </Button>
          <div className="flex items-center gap-1 rounded-md border border-input px-1.5">
            <input
              type="number"
              min={1}
              value={nBulk}
              onChange={(e) => setNBulk(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Cuántas tareas agregar"
              className="h-8 w-12 bg-transparent text-center text-sm outline-none"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => addTasks(nBulk)}>
              Agregar varias
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((t, i) => (
          <TaskCard
            key={t.id}
            task={t}
            index={i}
            track={header.track}
            expanded={!!expanded[t.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}
            onChip={(key, updater) => setChip(t.id, key)(updater)}
            onText={(key, value) => setText(t.id, key, value)}
            onCopy={(key, ids) => copyField(t.id, key, ids)}
            onCopyFields={(keys, ids) => copyFields(t.id, keys, ids)}
            onDuplicate={() => duplicate(t.id)}
            onRemove={() => remove(t.id)}
            cards={pickCards}
            lastTargets={lastTargets}
            mes={header.mes}
            blocked={problemas.get(t.id)?.filter((p) => p !== "# Idea repetido")}
            ideaRepetida={problemas.get(t.id)?.includes("# Idea repetido")}
          />
        ))}
      </div>

      {/* ── Barra fija de guardado ── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList className="size-4" />
            {tasks.length} tarea{tasks.length === 1 ? "" : "s"} · {totalEntregables} entregable{totalEntregables === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-3">
            {!ready && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {header.title.trim() ? `${problemas.size} tarjeta(s) por completar` : "Falta el título del brief"}
              </span>
            )}
            <Button type="button" disabled={!ready || submitting} onClick={submit}>
              {submitting ? "Creando…" : "Crear brief"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
