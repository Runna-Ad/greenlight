"use client";

import { useState, useTransition } from "react";
import { Mail, ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { cambiarAccesoCliente, type ClienteUsuarioRow } from "@/app/(app)/admin/clientes-actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export function ClientesTab({ usuarios: inicial }: { usuarios: ClienteUsuarioRow[] }) {
  const [usuarios, setUsuarios] = useState(inicial);

  const setActivo = (id: string, active: boolean) =>
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Clientes con acceso</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
        Partners que entran a su portal. Puedes revocar o reactivar el acceso de cada uno.
      </p>

      {usuarios.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay clientes con acceso. Aprueba una solicitud en «Invitaciones».
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {usuarios.map((u) => (
            <li key={u.id}>
              <ClienteRow u={u} onActivo={setActivo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClienteRow({
  u,
  onActivo,
}: {
  u: ClienteUsuarioRow;
  onActivo: (id: string, active: boolean) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();

  const cambiar = (active: boolean) =>
    start(async () => {
      const res = await cambiarAccesoCliente(u.id, active);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onActivo(u.id, active);
      setConfirmando(false);
      toast.success(active ? "Acceso reactivado." : "Acceso revocado.");
    });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{u.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Mail className="size-3 shrink-0" /> {u.email}
          {u.clientName && <span className="text-muted-foreground/60">· {u.clientName}</span>}
        </p>
      </div>

      <Pill status={u.active ? "completed" : "warning"} fill="soft">
        {u.active ? "Activo" : "Sin acceso"}
      </Pill>

      {u.active ? (
        confirmando ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => cambiar(false)}>
              Revocar
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmando(true)} className="gap-1.5">
            <ShieldOff className="size-3.5" /> Revocar
          </Button>
        )
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => cambiar(true)} className="gap-1.5">
          <ShieldCheck className="size-3.5" /> Reactivar
        </Button>
      )}
    </div>
  );
}
