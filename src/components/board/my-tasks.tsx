"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Files } from "lucide-react";
import { toast } from "sonner";

import { STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import { actionsFor, waitingLabel, type TaskAction } from "@/lib/task-actions";
import type { ViewRole } from "@/lib/roles";
import {
  approveTask,
  requestChanges,
  startTask,
  submitForReview,
} from "@/app/(app)/[cliente]/tablero/actions";
import { Button } from "@/components/ui/button";

export type MyTask = {
  id: string;
  code: string | null;
  status: AssetStatus;
  track: "real" | "normal";
  naming_base: string | null;
  concepto: string | null;
  tipo_asset: string | null;
  duracion: string | null;
  marca: string | null;
  brief_tab: string | null;
  file_count: number;
  member_ids: string[];
};

/**
 * La lista personal. Renderiza la MISMA decisión de botones que el tablero
 * (actionsFor), para que las dos pantallas no ofrezcan cosas distintas sobre
 * la misma tarea.
 */
export function MyTasks({
  tasks,
  soyId,
  role,
}: {
  tasks: MyTask[];
  soyId: string;
  role: ViewRole;
}) {
  const [rows, setRows] = useState(tasks);
  const [, startTransition] = useTransition();

  const run = (task: MyTask, action: TaskAction, body?: string) => {
    const from = task.status;
    setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: action.to } : t)));

    startTransition(async () => {
      const res =
        action.verb === "start"
          ? await startTask(task.id)
          : action.verb === "submit_review"
            ? await submitForReview(task.id)
            : action.verb === "request_changes"
              ? await requestChanges(task.id, body ?? "")
              : await approveTask(task.id);

      if (!res.ok) {
        setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: from } : t)));
        toast.error(res.error ?? "No se pudo completar la acción.");
      } else if (action.verb === "submit_review") {
        toast.success("Mandada a revisión — el lead ya tiene el aviso.");
      }
    });
  };

  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const ctx = {
          isAssignee: t.member_ids.includes(soyId),
          role,
          hasAssignee: t.member_ids.length > 0,
        };
        const acciones = actionsFor(t.status, ctx);
        const espera = waitingLabel(t.status, ctx);
        const enCorrecciones = t.status === "in_corrections";

        return (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card p-3 ${
              enCorrecciones
                ? "border-status-corrections ring-1 ring-[color-mix(in_srgb,var(--status-corrections)_35%,transparent)]"
                : "border-border"
            }`}
          >
            <span
              className="h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--status-${STATUS_TOKEN[t.status]})` }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {t.code && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
                    {t.code}
                  </span>
                )}
                <span className="font-mono text-[12px] font-semibold text-foreground">
                  {t.naming_base ?? "—"}
                </span>
                {t.marca && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                    {t.marca}
                  </span>
                )}
                {t.tipo_asset && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                    {t.tipo_asset}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Files className="size-2.5" />
                  {t.file_count}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                {t.concepto ?? "Sin concepto"}
              </p>
              {t.brief_tab && (
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">{t.brief_tab}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {acciones
                .filter((a) => !a.needsBody) // pedir cambios se hace desde el tablero
                .map((a) => (
                  <Button
                    key={a.verb}
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => run(t, a)}
                  >
                    {a.label}
                  </Button>
                ))}
              {espera && acciones.length === 0 && (
                <span className="text-[11px] italic text-muted-foreground">{espera}</span>
              )}
            </div>
          </li>
        );
      })}
      {rows.length === 0 && (
        <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Nada por aquí.{" "}
          <Link href="/clientes" className="underline underline-offset-2">
            Ver tableros
          </Link>
        </li>
      )}
    </ul>
  );
}
