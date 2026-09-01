"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw, Trash2, FileText, Layers, Clock } from "lucide-react";
import { toast } from "sonner";

import {
  listarPapelera,
  restaurarTarea,
  restaurarBrief,
  vaciarPapelera,
} from "@/app/(app)/admin/papelera-actions";
import { DIAS_RETENCION, type ItemPapelera } from "@/lib/papelera";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * PAPELERA (0057) — sólo Master Builder. Lo borrado en los últimos 30 días, con
 * un clic para devolverlo. Carga en cliente (no SSR) igual que el H.Ü.E HUB: abrir
 * la pestaña es lo que dispara la purga perezosa de lo vencido.
 */
export function PapeleraTab() {
  const [items, setItems] = useState<ItemPapelera[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const [pending, start] = useTransition();

  const cargar = () =>
    start(async () => {
      const res = await listarPapelera();
      if (!res.ok) {
        setError(res.error);
        setItems([]);
        return;
      }
      setError(null);
      setItems(res.items);
    });

  // Al montar: cargar (y de paso disparar la purga perezosa de lo vencido).
  useEffect(cargar, []);

  const restaurar = (item: ItemPapelera) =>
    start(async () => {
      const res =
        item.tipo === "brief" ? await restaurarBrief(item.id) : await restaurarTarea(item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const tareas = "tareas" in res ? res.tareas : 0;
      toast.success(
        item.tipo === "brief"
          ? `Brief restaurado${tareas ? ` con ${tareas} tarea${tareas === 1 ? "" : "s"}` : ""}.`
          : "Tarea restaurada.",
      );
      setItems((prev) => (prev ?? []).filter((i) => !(i.id === item.id && i.tipo === item.tipo)));
    });

  const vaciar = () =>
    start(async () => {
      const res = await vaciarPapelera();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmandoVaciar(false);
      setItems([]);
      toast.success(`Papelera vacía (${res.briefs} brief(s), ${res.tareas} tarea(s)).`);
    });

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Papelera</h2>
          <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
            Lo que se borró en los últimos {DIAS_RETENCION} días. Restaurar lo devuelve tal como
            estaba. Pasado ese plazo se elimina de forma definitiva.
          </p>
        </div>
        {!!items?.length &&
          (confirmandoVaciar ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmandoVaciar(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" disabled={pending} onClick={vaciar}>
                Sí, borrar para siempre
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmandoVaciar(true)}
              className="shrink-0 gap-1.5"
            >
              <Trash2 className="size-3.5" /> Vaciar papelera
            </Button>
          ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-status-corrections/40 bg-[color-mix(in_srgb,var(--status-corrections)_8%,transparent)] p-3 text-sm text-foreground">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          titulo="La papelera está vacía"
          descripcion="Cuando borres un brief o una tarea, aparecerá aquí y podrás recuperarla."
        />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {items.map((item) => (
            <li key={`${item.tipo}-${item.id}`} className="flex items-center gap-3 px-4 py-3">
              {item.tipo === "brief" ? (
                <Layers className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.titulo}</p>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {item.tipo === "brief" ? "Brief" : "Tarea"}
                  {item.contexto && <> · {item.contexto}</>}
                  {item.borradoPor && <> · borró {item.borradoPor}</>}
                </p>
              </div>

              <Pill status={item.diasRestantes <= 7 ? "warning" : "progress"} fill="soft">
                <Clock className="size-3" />
                {item.diasRestantes === 0
                  ? "Vence hoy"
                  : `${item.diasRestantes} día${item.diasRestantes === 1 ? "" : "s"}`}
              </Pill>

              {item.bloqueadaPorBrief ? (
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  Vuelve con su brief
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => restaurar(item)}
                  className="shrink-0 gap-1.5"
                >
                  <RotateCcw className="size-3.5" /> Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
