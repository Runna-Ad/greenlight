"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EvalMiembro, ScoreCriterio, Track } from "@/lib/evaluacion";
import { GRUPO_TONO, type GrupoCriterio } from "@/lib/tipos-cambio";
import { chipTextColor } from "@/lib/vocab";
import { cn } from "@/lib/utils";

const TEAM_LABEL: Record<Track, string> = { real: "Real", normal: "Normal" };

// Color del puntaje 0–10: rojo (0) → ámbar (5) → verde (10). En dos tramos para
// no pasar por el marrón sucio del punto medio de un rojo↔verde directo.
function scoreColor(v: number): string {
  return v >= 5
    ? `color-mix(in srgb, var(--status-completed) ${(v - 5) * 20}%, var(--status-progress))`
    : `color-mix(in srgb, var(--status-progress) ${v * 20}%, var(--status-corrections))`;
}

const fmt = (v: number | null): string =>
  v == null ? "—" : v % 1 === 0 ? String(v) : v.toFixed(1);

export function EvaluacionBoard({ miembros }: { miembros: EvalMiembro[] }) {
  const conDato = miembros
    .filter((m) => m.tareas > 0)
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  const sinDato = miembros.filter((m) => m.tareas === 0);

  if (!miembros.length)
    return <Vacio texto="No hay especialistas en este equipo todavía." />;
  if (!conDato.length)
    return <Vacio texto="Aún no hay tareas evaluadas en este periodo — vuelve cuando el equipo haya mandado trabajo a revisión." />;

  return (
    <div className="space-y-3">
      {conDato.map((m) => (
        <TarjetaMiembro key={m.memberId} m={m} />
      ))}

      {sinDato.length > 0 && (
        <details className="rounded-xl border border-dashed border-border">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] text-muted-foreground">
            {sinDato.length} sin tareas evaluadas este periodo
          </summary>
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {sinDato.map((m) => (
              <span key={m.memberId} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {m.name}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TarjetaMiembro({ m }: { m: EvalMiembro }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <Avatar name={m.name} color={m.color} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground">{m.name}</span>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Equipo {TEAM_LABEL[m.track]}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {m.tareas} tarea{m.tareas === 1 ? "" : "s"} evaluada{m.tareas === 1 ? "" : "s"}
          </p>
        </div>

        <div className="hidden items-center gap-4 sm:flex">
          <Stat label="rondas/tarea" value={fmt(m.rondasPorTarea)} />
          <Stat label="cambios/ronda" value={fmt(m.cambiosPorRonda)} />
          <Stat label="días" value={fmt(m.cicloMedianoDias)} />
        </div>

        <Puntaje v={m.overall} />
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")}
        />
      </button>

      {abierto && (
        <div className="border-t border-border p-4 pt-3">
          {gruposDe(m.scorePorCriterio).map((g) => (
            <div key={g.grupo} className="mb-3 last:mb-0">
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="size-1.5 rounded-full" style={{ background: GRUPO_TONO[g.grupo] }} />
                {g.grupoLabel}
              </p>
              <div className="space-y-1.5">
                {g.items.map((s) => (
                  <Barra key={s.slug} s={s} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-3 flex gap-6 sm:hidden">
            <Stat label="rondas/tarea" value={fmt(m.rondasPorTarea)} />
            <Stat label="cambios/ronda" value={fmt(m.cambiosPorRonda)} />
            <Stat label="días (mediana)" value={fmt(m.cicloMedianoDias)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Barra({ s }: { s: ScoreCriterio }) {
  const v = s.score;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-[11.5px] text-foreground sm:w-36" title={s.label}>
        {s.label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        {v != null && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width]"
            style={{ width: `${v * 10}%`, background: scoreColor(v) }}
          />
        )}
      </div>
      <span
        className="w-7 shrink-0 text-right text-[11px] font-bold tabular-nums"
        style={{ color: v != null ? scoreColor(v) : "var(--muted-foreground)" }}
      >
        {fmt(v)}
      </span>
    </div>
  );
}

function Puntaje({ v }: { v: number | null }) {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <span
        className="text-2xl font-bold leading-none tabular-nums"
        style={{ color: v != null ? scoreColor(v) : "var(--muted-foreground)" }}
      >
        {fmt(v)}
      </span>
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">/10</span>
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold"
      style={{ background: color, color: chipTextColor(color) }}
    >
      {initials}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

// Agrupa los criterios por sección del rúbrica, en orden, para pintarlos juntos.
function gruposDe(scores: ScoreCriterio[]) {
  const orden: GrupoCriterio[] = ["entrega", "craft", "aterrizaje"];
  return orden
    .map((g) => ({
      grupo: g,
      grupoLabel: scores.find((s) => s.grupo === g)?.grupoLabel ?? g,
      items: scores.filter((s) => s.grupo === g),
    }))
    .filter((x) => x.items.length);
}
