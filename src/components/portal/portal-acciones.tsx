"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageSquarePlus, Clock } from "lucide-react";
import { clienteAprobar, clientePedirCambios } from "@/app/(app)/[cliente]/portal/portal-actions";
import type { AssetStatus } from "@/lib/brand";

/**
 * Los botones del partner: Aprobar / Pedir cambios. Si la idea ya fue resuelta por
 * el cliente (aprobada = delivered, o en cambios = in_corrections) se muestra el
 * estado en vez de las acciones — no puede aprobar dos veces ni pedir cambios sobre
 * algo que ya volvió al equipo.
 */
export function PortalAcciones({
  clienteSlug,
  ideaId,
  status,
}: {
  clienteSlug: string;
  ideaId: string;
  status: AssetStatus;
}) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [modo, setModo] = useState<"idle" | "cambios">("idle");
  const [texto, setTexto] = useState("");

  if (status === "delivered")
    return <Estado tono="var(--status-completed)" Icon={Check} texto="Aprobaste esta idea. ¡Gracias!" />;
  if (status === "in_corrections")
    return (
      <Estado
        tono="var(--status-corrections)"
        Icon={Clock}
        texto="Pediste cambios — el equipo está trabajando en ellos."
      />
    );

  const aprobar = () =>
    start(async () => {
      const res = await clienteAprobar(clienteSlug, ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("¡Aprobado! El equipo fue notificado.");
      router.refresh();
    });

  const enviarCambios = () =>
    start(async () => {
      if (!texto.trim()) return;
      const res = await clientePedirCambios(clienteSlug, ideaId, texto.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Cambios enviados al equipo.");
      setModo("idle");
      setTexto("");
      router.refresh();
    });

  return (
    <div className="mt-5 rounded-xl border border-border bg-card p-4">
      {modo === "idle" ? (
        <>
          <p className="mb-3 text-sm font-medium text-foreground">¿Qué te parece esta idea?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={aprobar}
              disabled={pend}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "color-mix(in srgb, var(--status-completed) 90%, #000)" }}
            >
              <Check className="size-4" /> Aprobar
            </button>
            <button
              type="button"
              onClick={() => setModo("cambios")}
              disabled={pend}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <MessageSquarePlus className="size-4" /> Pedir cambios
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm font-medium text-foreground">¿Qué te gustaría cambiar?</p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Cuéntale al equipo qué ajustar…"
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={enviarCambios}
              disabled={pend || !texto.trim()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "color-mix(in srgb, var(--status-corrections) 82%, #000)" }}
            >
              Enviar cambios
            </button>
            <button
              type="button"
              onClick={() => {
                setModo("idle");
                setTexto("");
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Estado({
  tono,
  texto,
  Icon,
}: {
  tono: string;
  texto: string;
  Icon: typeof Check;
}) {
  return (
    <div
      className="mt-5 flex items-center gap-2 rounded-xl border p-4 text-sm font-medium"
      style={{
        borderColor: `color-mix(in srgb, ${tono} 40%, var(--border))`,
        background: `color-mix(in srgb, ${tono} 8%, transparent)`,
        color: `color-mix(in srgb, ${tono} 78%, #000)`,
      }}
    >
      <Icon className="size-4 shrink-0" />
      {texto}
    </div>
  );
}
