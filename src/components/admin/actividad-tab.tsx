"use client";

import { Activity, ArrowRight, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_LABEL, type AssetStatus } from "@/lib/brand";
import type { ActividadRow } from "@/lib/admin-tipos";
import { chipTextColor } from "@/lib/vocab";

const label = (s: string | null) => (s ? STATUS_LABEL[s as AssetStatus] ?? s : "—");

function hace(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-MX");
}

export function ActividadTab({ rows }: { rows: ActividadRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        titulo="Sin actividad todavía"
        descripcion="Aquí aparecerá quién mueve cada tarea por el flujo."
      />
    );
  }

  return (
    <div className="gl-card overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: r.actorColor ?? "#6b6885", color: chipTextColor(r.actorColor ?? "#6b6885") }}
              title={r.actor ?? "Sistema"}
            >
              {(r.actor ?? "··").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-medium text-foreground">{r.actor ?? "Alguien"}</span>{" "}
                <span className="text-muted-foreground">movió</span>{" "}
                <span className="font-mono text-xs font-semibold text-foreground">
                  {r.ideaCode ?? r.ideaNaming ?? "una tarea"}
                </span>
              </p>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {label(r.from)} <ArrowRight className="size-3" /> {label(r.to)}
                {r.override && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-status-corrections/10 px-1.5 py-px text-[10px] font-medium text-status-corrections">
                    <ShieldAlert className="size-2.5" /> override
                  </span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{hace(r.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
