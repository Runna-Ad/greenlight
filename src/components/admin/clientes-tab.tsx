"use client";

import { useState, useTransition } from "react";
import { Mail, ShieldOff, ShieldCheck, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";

import {
  cambiarAccesoCliente,
  crearCliente,
  type ClienteUsuarioRow,
  type EmpresaCliente,
} from "@/app/(app)/admin/clientes-actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

export function ClientesTab({
  usuarios: inicial,
  empresas: empresasIniciales,
}: {
  usuarios: ClienteUsuarioRow[];
  empresas: { id: string; name: string; slug: string }[];
}) {
  const [usuarios, setUsuarios] = useState(inicial);
  const [empresas, setEmpresas] = useState(empresasIniciales);

  const setActivo = (id: string, active: boolean) =>
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-foreground">Empresas cliente</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
          Cada empresa es un tenant con su propio portal y URL (/su-identificador/…). Sus marcas se
          administran en «Marcas».
        </p>
        {empresas.length > 0 && (
          <ul className="mb-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {empresas.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                  <Building2 className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{c.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">/{c.slug}</span>
              </li>
            ))}
          </ul>
        )}
        <NuevaEmpresa onCreada={(e) => setEmpresas((prev) => [...prev, { id: e.id, name: e.name, slug: e.slug }])} />
      </section>

      <section>
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
      </section>
    </div>
  );
}

/** Alta de una empresa cliente (nombre → slug automático + color de marca). */
function NuevaEmpresa({ onCreada }: { onCreada: (e: EmpresaCliente) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#775cbf");
  const [pending, start] = useTransition();

  const crear = () =>
    start(async () => {
      const res = await crearCliente({ name, brandColor: color });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onCreada(res.empresa);
      setName("");
      setColor("#775cbf");
      toast.success(`Cliente ${res.empresa.name} creado (/${res.empresa.slug}).`);
    });

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Color de marca"
        className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim() && !pending) crear();
        }}
        placeholder="Nombre del nuevo cliente…"
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button size="sm" variant="outline" disabled={pending || !name.trim()} onClick={crear} className="gap-1.5">
        <Plus className="size-3.5" /> Crear cliente
      </Button>
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
