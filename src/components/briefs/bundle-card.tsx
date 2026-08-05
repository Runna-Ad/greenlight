"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Files, Layers } from "lucide-react";

import type { Bundle } from "@/lib/bundle";
import { STATUS_LABEL, STATUS_TOKEN } from "@/lib/brand";

/**
 * El card de un bundle (wireframe "Brief View"): el brief con cuántas tareas
 * trae adentro. Clic en el card → directo al workspace de la PRIMERA tarea;
 * el chevron despliega la lista por si quieres entrar a una en específico.
 *
 * Para el especialista el conteo ya viene filtrado (sólo sus tareas) — el
 * filtro vive en lib/bundle.ts, no aquí.
 */
export function BundleCard({ bundle, cliente }: { bundle: Bundle; cliente: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const primera = bundle.tasks[0];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <button
        onClick={() => primera && router.push(`/${cliente}/tareas/${primera.id}`)}
        className="block w-full p-4 text-left"
        aria-label={`Abrir ${bundle.brief_title ?? "brief"} (${bundle.tasks.length} tareas)`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {bundle.brief_title ?? bundle.brief_tab ?? "Brief sin título"}
            </h3>
            {bundle.brief_tab && bundle.brief_tab !== bundle.brief_title && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{bundle.brief_tab}</p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
            <Layers className="size-3" /> {bundle.tasks.length}
          </span>
        </div>

        {/* mini-resumen por estado */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {resumenEstados(bundle).map(([status, n]) => (
            <span
              key={status}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: `var(--status-${STATUS_TOKEN[status as keyof typeof STATUS_TOKEN]})` }}
            >
              {n} {STATUS_LABEL[status as keyof typeof STATUS_LABEL]}
            </span>
          ))}
        </div>
      </button>

      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
      >
        {abierto ? "Ocultar tareas" : "Ver tareas"}
        <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <ul className="border-t border-border/60">
          {bundle.tasks.map((t, i) => (
            <li key={t.id}>
              <Link
                href={`/${cliente}/tareas/${t.id}`}
                className="flex items-center gap-2.5 px-4 py-2 text-xs hover:bg-secondary/40"
              >
                <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">
                  {i + 1}/{bundle.tasks.length}
                </span>
                {t.code && (
                  <span className="shrink-0 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] font-semibold text-secondary-foreground">
                    {t.code}
                  </span>
                )}
                <span className="min-w-0 truncate font-mono font-medium text-foreground">
                  {t.naming_base ?? "Sin naming"}
                </span>
                <span
                  className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white"
                  style={{ backgroundColor: `var(--status-${STATUS_TOKEN[t.status]})` }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                  <Files className="size-3" /> {t.file_count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function resumenEstados(bundle: Bundle): [string, number][] {
  const conteo = new Map<string, number>();
  for (const t of bundle.tasks) conteo.set(t.status, (conteo.get(t.status) ?? 0) + 1);
  return [...conteo.entries()];
}
