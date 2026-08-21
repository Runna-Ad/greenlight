"use client";

import { useState, useTransition } from "react";
import { Check, X, Mail, Clock } from "lucide-react";
import { toast } from "sonner";

import {
  aprobarInvitacion,
  rechazarInvitacion,
  type InvitacionRow,
  type ClienteOpt,
} from "@/app/(app)/admin/clientes-actions";
import { Button } from "@/components/ui/button";

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function InvitacionesTab({
  pendientes: inicial,
  clientes,
}: {
  pendientes: InvitacionRow[];
  clientes: ClienteOpt[];
}) {
  const [pendientes, setPendientes] = useState(inicial);
  const quitar = (id: string) => setPendientes((p) => p.filter((i) => i.id !== id));

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Invitaciones pendientes</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
        Clientes que pidieron acceso a su portal. Al aprobar, eliges a qué cliente y marca
        pertenecen — hasta entonces se les manda su enlace de entrada por correo.
      </p>

      {pendientes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay solicitudes pendientes.
        </p>
      ) : (
        <ul className="space-y-3">
          {pendientes.map((inv) => (
            <li key={inv.id}>
              <InvitacionRowCard inv={inv} clientes={clientes} onDecidir={() => quitar(inv.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitacionRowCard({
  inv,
  clientes,
  onDecidir,
}: {
  inv: InvitacionRow;
  clientes: ClienteOpt[];
  onDecidir: () => void;
}) {
  const [clientId, setClientId] = useState(clientes[0]?.id ?? "");
  const [marcaId, setMarcaId] = useState("");
  const [pending, start] = useTransition();

  const marcas = clientes.find((c) => c.id === clientId)?.marcas ?? [];

  const aprobar = () =>
    start(async () => {
      const res = await aprobarInvitacion({ inviteId: inv.id, clientId, marcaId: marcaId || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Acceso aprobado — enlace enviado a ${inv.email}.`);
      onDecidir();
    });

  const rechazar = () =>
    start(async () => {
      const res = await rechazarInvitacion(inv.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Solicitud rechazada.");
      onDecidir();
    });

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{inv.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Mail className="size-3.5 shrink-0" /> {inv.email}
          </p>
          {inv.requested_brand && (
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Dice trabajar con: <span className="text-foreground">{inv.requested_brand}</span>
            </p>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <Clock className="size-3" />
          {new Date(inv.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="text-xs text-muted-foreground">Aprobar como</span>
        <select className={selectCls} value={clientId} onChange={(e) => { setClientId(e.target.value); setMarcaId(""); }}>
          {clientes.length === 0 && <option value="">Sin clientes</option>}
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className={selectCls} value={marcaId} onChange={(e) => setMarcaId(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={rechazar} className="gap-1.5">
            <X className="size-3.5" /> Rechazar
          </Button>
          <Button size="sm" disabled={pending || !clientId} onClick={aprobar} className="gap-1.5">
            <Check className="size-3.5" /> Aprobar y enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
