"use client";

import Link from "next/link";
import { Layers, ArrowRight } from "lucide-react";
import type { PortalMarca } from "@/app/(app)/[cliente]/portal/portal-data";

/**
 * NIVEL 1 del portal (Pedro 2026-09-03, Fase 2): al entrar, el cliente ve una tarjeta por
 * MARCA (Card / Préstamos) con cuántos briefs tiene trabajo. Click → los briefs de esa marca.
 * Se salta automáticamente cuando hay una sola marca (la página va directo a sus briefs).
 * Marca es un FILTRO sobre tareas: un brief que abarca ambas marcas aparece bajo las dos.
 */
export function PortalBrandGrid({
  cliente,
  marcas,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  marcas: PortalMarca[];
}) {
  const marca = cliente.brandColor;
  return (
    <div className="mx-auto max-w-4xl px-1">
      <header className="mb-6 flex items-center gap-3">
        {cliente.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cliente.logoUrl} alt={cliente.name} className="h-10 w-auto max-w-[120px] object-contain" />
        ) : (
          <span className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white shadow-sm" style={{ background: marca }}>
            {cliente.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <p className="gl-eyebrow">Portal de revisión</p>
          <h1 className="text-xl font-semibold text-foreground">Tus marcas</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {marcas.map((m) => (
          <Link
            key={m.id}
            href={`?marca=${m.id}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {m.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.logoUrl} alt={m.name} className="h-10 w-10 shrink-0 rounded-lg object-contain" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: `color-mix(in srgb, ${marca} 82%, #000)` }}>
                {m.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">{m.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                <Layers className="size-3" /> {m.briefs} brief{m.briefs === 1 ? "" : "s"}
                <span className="text-muted-foreground/60">· {m.tareas} idea{m.tareas === 1 ? "" : "s"}</span>
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
