"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, UserPlus, Check, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import { reenviarACliente, reasignarCambios } from "@/app/(app)/[cliente]/tablero/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Pool = { id: string; name: string; color: string };

/**
 * Banner de "Cambios del cliente" — SÓLO para el lead (canOverrideStatus), cuando la
 * tarea está en in_corrections con cambios del cliente sin resolver. El especialista no
 * ve esta tarea (visibilidad). El lead decide, sin salir de la tarea:
 *   · "Enviar a cliente" → él ya hizo los cambios (editables en in_corrections) y
 *     reenvía DIRECTO (reenviarACliente → rpc_lead_reenvia_cliente). Sin ronda de revisión.
 *   · "Reasignar" → elige especialista(s) y la manda a EN PROGRESO (reasignarCambios) →
 *     el especialista la trabaja y vuelve por el flujo normal.
 */
export function BannerCambiosCliente({
  ideaId,
  nCambios,
  leadActualId,
  especialistasPool,
}: {
  ideaId: string;
  nCambios: number;
  leadActualId: string | null;
  especialistasPool: Pool[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [esp, setEsp] = useState<Set<string>>(new Set());

  const toggleEsp = (id: string) =>
    setEsp((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const reenviar = () =>
    startTransition(async () => {
      const res = await reenviarACliente(ideaId);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo reenviar.");
        return;
      }
      toast.success("Cambios aplicados — reenviado al cliente.");
      router.refresh();
    });

  const reasignar = () =>
    startTransition(async () => {
      const res = await reasignarCambios(ideaId, leadActualId, [...esp]);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo reasignar.");
        return;
      }
      toast.success("Reasignada — el especialista ya tiene el aviso.");
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-status-corrections/40 bg-[color-mix(in_srgb,var(--status-corrections)_8%,transparent)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-status-corrections" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              El cliente pidió {nCambios} cambio{nCambios === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted-foreground">
              Hazlos tú y reenvía, o reasígnalos a un especialista para que los trabaje.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <UserPlus className="size-4" /> Reasignar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Elige especialista(s)
              </p>
              {especialistasPool.length === 0 ? (
                <p className="px-1 py-1 text-[11px] text-muted-foreground/70">
                  No hay especialistas en este track.
                </p>
              ) : (
                <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                  {especialistasPool.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => toggleEsp(e.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                      >
                        <span
                          className="flex size-4 items-center justify-center rounded border"
                          style={{ borderColor: e.color }}
                        >
                          {esp.has(e.id) && <Check className="size-3" style={{ color: e.color }} />}
                        </span>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={pending || esp.size === 0}
                onClick={reasignar}
              >
                Reasignar y mandar a trabajar
              </Button>
            </PopoverContent>
          </Popover>
          <Button size="sm" disabled={pending} onClick={reenviar}>
            <Send className="size-4" /> Enviar a cliente
          </Button>
        </div>
      </div>
    </div>
  );
}
