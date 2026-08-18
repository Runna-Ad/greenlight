"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";

import { guardarDuraciones } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { DURACION as SUGERENCIAS } from "@/lib/vocab";

/**
 * Las DURACIONES como pastillas editables. Cada pastilla es un rango (o un valor
 * suelto como "40s") y cada una despliega su propio juego de archivos
 * (tamaño × plataforma × duración). Agregar/quitar guarda de una vez y reconcilia
 * los entregables (guardarDuraciones); al guardar bien se refresca para que
 * "Nombre de archivos" muestre los nuevos nombres. De sólo lectura muestra las
 * pastillas sin controles (Vista cliente / tarea cerrada).
 */
export function CampoDuraciones({
  ideaId,
  valorInicial,
  soloLectura,
}: {
  ideaId: string;
  valorInicial: string[];
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const listaId = useId();
  const [durs, setDurs] = useState<string[]>(valorInicial);
  const [nueva, setNueva] = useState("");
  const [pending, start] = useTransition();

  const guardar = (next: string[]) =>
    start(async () => {
      const prev = durs;
      setDurs(next); // optimista
      const res = await guardarDuraciones(ideaId, next);
      if (!res.ok) {
        setDurs(prev); // revertir
        toast.error(res.error);
      } else {
        // Refrescar para que "Nombre de archivos" tome los nombres recalculados.
        router.refresh();
      }
    });

  const agregar = (v: string) => {
    const t = v.trim();
    setNueva("");
    if (!t || durs.some((d) => d.toLowerCase() === t.toLowerCase())) return;
    guardar([...durs, t]);
  };
  const quitar = (d: string) => guardar(durs.filter((x) => x !== d));

  if (soloLectura) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {durs.length ? (
          durs.map((d) => (
            <span
              key={d}
              className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-[12px] font-medium text-secondary-foreground"
            >
              {d}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground/70">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {durs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {durs.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-[12px] font-medium text-secondary-foreground"
            >
              {d}
              <button
                type="button"
                onClick={() => quitar(d)}
                disabled={pending}
                aria-label={`Quitar ${d}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-status-corrections disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          list={listaId}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar(nueva);
            }
          }}
          placeholder="p. ej. 20-30s"
          autoComplete="off"
          disabled={pending}
          className="h-8 w-28 rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <datalist id={listaId}>
          {SUGERENCIAS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => agregar(nueva)}
          disabled={pending || !nueva.trim()}
          className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/45 hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-3" /> Agregar
        </button>
      </div>
    </div>
  );
}
