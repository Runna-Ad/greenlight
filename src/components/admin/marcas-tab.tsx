"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload, Trash2, Building2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { subirLogoMarca, quitarLogoMarca, crearMarca, eliminarMarca } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import type { ClienteConMarcas, MarcaLogo } from "@/lib/admin-tipos";

/**
 * Panel "Marcas": sube el logo de cada sub-marca. Un cliente tiene varias marcas
 * (DiDi → Card / Préstamos) y cada una lleva su propio logo, que aparece en la
 * cabecera de la tarea. Sube/reemplaza/quita, guardado inmediato.
 */
export function MarcasTab({ clientes: inicial }: { clientes: ClienteConMarcas[] }) {
  const [clientes, setClientes] = useState(inicial);

  const setLogo = (marcaId: string, logo_url: string | null) =>
    setClientes((prev) =>
      prev.map((c) => ({
        ...c,
        marcas: c.marcas.map((m) => (m.id === marcaId ? { ...m, logo_url } : m)),
      })),
    );

  const addMarca = (clientId: string, marca: MarcaLogo) =>
    setClientes((prev) => prev.map((c) => (c.id === clientId ? { ...c, marcas: [...c.marcas, marca] } : c)));
  const removeMarca = (marcaId: string) =>
    setClientes((prev) => prev.map((c) => ({ ...c, marcas: c.marcas.filter((m) => m.id !== marcaId) })));

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Marcas y logos</h2>
      <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
        El logo de cada marca aparece en la cabecera de sus tareas. Un cliente puede
        tener varias marcas (p. ej. DiDi Card y DiDi Préstamos), cada una con el suyo.
        PNG/JPG/WebP con fondo transparente se ven mejor.
      </p>

      {clientes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay clientes con marcas.
        </p>
      ) : (
        <div className="space-y-5">
          {clientes.map((c) => (
            <section key={c.id} className="rounded-xl border border-border bg-card shadow-sm">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{c.name}</span>
                <span className="text-[11px] text-muted-foreground">/{c.slug}</span>
              </header>
              {c.marcas.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted-foreground/70">
                  Este cliente no tiene marcas.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {c.marcas.map((m) => (
                    <li key={m.id}>
                      <MarcaRow marca={m} onLogo={setLogo} onDelete={removeMarca} />
                    </li>
                  ))}
                </ul>
              )}
              <AgregarMarca clientId={c.id} onCreated={(m) => addMarca(c.id, m)} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MarcaRow({
  marca,
  onLogo,
  onDelete,
}: {
  marca: MarcaLogo;
  onLogo: (marcaId: string, logoUrl: string | null) => void;
  onDelete: (marcaId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const borrarMarca = () =>
    start(async () => {
      const res = await eliminarMarca(marca.id);
      if (!res.ok) {
        toast.error(res.error);
        setConfirmarBorrar(false);
        return;
      }
      toast.success(`Marca ${marca.name} borrada.`);
      onDelete(marca.id);
    });

  const subir = (file: File) =>
    start(async () => {
      const form = new FormData();
      form.append("file", file);
      const res = await subirLogoMarca(marca.id, form);
      if (!res.ok) toast.error(res.error);
      else {
        onLogo(marca.id, res.logoUrl);
        toast.success(`Logo de ${marca.name} actualizado.`);
      }
    });

  const quitar = () =>
    start(async () => {
      const res = await quitarLogoMarca(marca.id);
      if (!res.ok) toast.error(res.error);
      else {
        onLogo(marca.id, null);
        toast.success(`Logo de ${marca.name} quitado.`);
      }
    });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {marca.logo_url ? (
        <div className="relative shrink-0">
          <Image
            src={marca.logo_url}
            alt={marca.name}
            width={44}
            height={44}
            unoptimized
            className="size-11 rounded-md border border-border bg-secondary object-contain p-0.5"
          />
          {/* Quitar el LOGO (no la marca) vive aquí, como ✕ en la miniatura — así el
              único ícono de basura de la fila significa sólo "borrar marca". */}
          <button
            type="button"
            onClick={quitar}
            disabled={pending}
            aria-label={`Quitar logo de ${marca.name}`}
            title="Quitar logo"
            className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-secondary hover:text-status-corrections disabled:opacity-50"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-secondary text-xs font-bold text-muted-foreground">
          {marca.name.slice(0, 2).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{marca.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {marca.logo_url ? "Logo cargado" : "Sin logo"}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
      >
        <Upload className="size-3.5" />
        {marca.logo_url ? "Reemplazar" : "Subir logo"}
      </Button>
      {confirmarBorrar ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setConfirmarBorrar(false)}
            disabled={pending}
            aria-label="Cancelar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
          <Button size="sm" variant="destructive" disabled={pending} onClick={borrarMarca}>
            Borrar marca
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmarBorrar(true)}
          disabled={pending}
          aria-label={`Borrar marca ${marca.name}`}
          title="Borrar marca"
          className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Alta rápida de una marca dentro de la tarjeta de su cliente. */
function AgregarMarca({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated: (marca: MarcaLogo) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [pending, start] = useTransition();

  const crear = () =>
    start(async () => {
      const res = await crearMarca(clientId, nombre);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onCreated(res.marca);
      setNombre("");
      toast.success(`Marca ${res.marca.name} creada.`);
    });

  return (
    <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && nombre.trim() && !pending) crear();
        }}
        placeholder="Nueva marca…"
        className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button size="sm" variant="outline" disabled={pending || !nombre.trim()} onClick={crear} className="gap-1.5">
        <Plus className="size-3.5" /> Agregar
      </Button>
    </div>
  );
}
