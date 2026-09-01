"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pill, type PillStatus } from "@/components/ui/pill";
import { ChevronDown, Files, Layers, Sparkles, Trash2 } from "lucide-react";

import type { Bundle } from "@/lib/bundle";
import { STATUS_LABEL, STATUS_TOKEN } from "@/lib/brand";
import { eliminarBrief } from "@/app/(app)/[cliente]/briefs/actions";

/**
 * El card de un bundle (wireframe "Brief View"): el brief con cuántas tareas
 * trae adentro. Clic en el card → directo al workspace de la PRIMERA tarea;
 * el chevron despliega la lista por si quieres entrar a una en específico.
 *
 * Para el especialista el conteo ya viene filtrado (sólo sus tareas) — el
 * filtro vive en lib/bundle.ts, no aquí.
 */
export function BundleCard({
  bundle,
  cliente,
  puedeBorrar = false,
}: {
  bundle: Bundle;
  cliente: string;
  /** master/admin: puede borrar el brief entero (con todas sus tareas). */
  puedeBorrar?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const primera = bundle.tasks[0];

  const borrar = () =>
    startBorrar(async () => {
      const r = await eliminarBrief(cliente, bundle.brief_id);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo borrar el brief.");
        return;
      }
      toast.success("Brief borrado — con todas sus tareas.");
      setConfirmando(false);
      router.refresh();
    });

  return (
    <div className="gl-card-interactive overflow-hidden">
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
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Brief GREENLIT: todas sus tareas entregadas. Se queda 7 días en la lista y
                luego vive sólo en Entregas — mismo verde neón que la columna Greenlit del
                tablero, para que se lea como lo mismo. (Pedro 2026-09-01) */}
            {bundle.greenlitAt && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: "color-mix(in srgb, #00e676 18%, transparent)",
                  color: "color-mix(in srgb, #00e676 72%, #000)",
                }}
                title="Todas sus tareas están entregadas. Vive en Entregas."
              >
                <Sparkles className="size-3" /> Greenlit
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <Layers className="size-3" /> {bundle.tasks.length}
            </span>
          </div>
        </div>

        {/* mini-resumen por estado */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {resumenEstados(bundle).map(([status, n]) => (
            <Pill
              key={status}
              status={STATUS_TOKEN[status as keyof typeof STATUS_TOKEN] as PillStatus}
              className="text-[10px]"
            >
              {n} {STATUS_LABEL[status as keyof typeof STATUS_LABEL]}
            </Pill>
          ))}
        </div>
      </button>

      <div className="flex items-stretch border-t border-border/60">
        <button
          onClick={() => setAbierto((v) => !v)}
          className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
        >
          {abierto ? "Ocultar tareas" : "Ver tareas"}
          <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </button>
        {puedeBorrar &&
          (confirmando ? (
            <span className="flex items-center gap-1 border-l border-border/60 px-2 text-[11px] text-muted-foreground">
              ¿Borrar todo?
              <button
                type="button"
                onClick={borrar}
                disabled={borrando}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-60"
                style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
              >
                {borrando ? "…" : "Sí"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmando(false)}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-background"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label="Borrar brief y todas sus tareas"
              title="Borrar brief y todas sus tareas"
              className="flex items-center border-l border-border/60 px-3 text-muted-foreground hover:bg-secondary/40 hover:text-status-corrections"
            >
              <Trash2 className="size-3.5" />
            </button>
          ))}
      </div>

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
                <Pill status={STATUS_TOKEN[t.status] as PillStatus} className="ml-auto shrink-0 text-[9px] uppercase">
                  {STATUS_LABEL[t.status]}
                </Pill>
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
