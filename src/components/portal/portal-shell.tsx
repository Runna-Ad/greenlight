"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { PackageOpen } from "lucide-react";
import type { PortalBrief } from "@/app/(app)/[cliente]/portal/portal-data";
import type { BucketPortal } from "@/lib/portal-bucket";
import { PortalNav } from "./portal-nav";

export function PortalShell({
  cliente,
  briefs,
  selBriefId,
  selTareaId,
  vistaBucket,
  vista,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  briefs: PortalBrief[];
  selBriefId: string | null;
  selTareaId: string | null;
  /** Cubeta en modo LISTA (revision|aprobado) o null en modo DETALLE — gobierna las pestañas. */
  vistaBucket: BucketPortal | null;
  /** El contenido: el detalle de la tarea seleccionada, o la lista de tarjetas de una cubeta. */
  vista: ReactNode;
}) {
  const marca = cliente.brandColor;

  // La barra de acción del cliente (PortalAcciones, dentro de `vista`) es sticky y pega
  // DEBAJO del nav, así que necesita saber cuánto mide. Se MIDE (ResizeObserver: cambia
  // si la fila se envuelve, con zoom o con otra fuente) y se publica como variable CSS en
  // el contenedor común; la barra lee `--portal-nav-h`. Antes de medir (SSR) la barra
  // usa su fallback, que es la altura del nav sin envolver.
  const navRef = useRef<HTMLDivElement>(null);
  const [navH, setNavH] = useState<number | null>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const medir = () => setNavH(el.getBoundingClientRect().height);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [briefs.length]);
  const varNav = (navH != null ? { "--portal-nav-h": `${navH}px` } : undefined) as CSSProperties | undefined;

  // Glow sutil con el color de marca — hace sentir el portal "suyo". Full-bleed arriba.
  const glow = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56"
      style={{
        background: `radial-gradient(60rem 20rem at 50% -8rem, color-mix(in srgb, ${marca} 20%, transparent), transparent 70%)`,
      }}
    />
  );

  if (!briefs.length) {
    return (
      <div className="relative w-full px-4 py-8 sm:px-6 lg:px-8">
        {glow}
        <header className="mb-6 flex items-center gap-3 gl-rise-in">
          {cliente.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cliente.logoUrl} alt={cliente.name} className="h-10 w-auto max-w-[120px] object-contain" />
          ) : (
            <span
              className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ background: marca }}
            >
              {cliente.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="gl-eyebrow">Portal de revisión</p>
            <h1 className="text-xl font-semibold text-foreground">{cliente.name}</h1>
          </div>
        </header>
        <div className="rounded-xl border border-dashed border-border p-10 text-center gl-rise-in">
          <PackageOpen className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay nada para revisar. Cuando el equipo te envíe una idea, aparecerá aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={varNav}>
      {glow}

      {/* Navegación STICKY (briefs · tareas · filtro · flechas) — ancho completo. */}
      <PortalNav ref={navRef} cliente={cliente} briefs={briefs} selBriefId={selBriefId} selTareaId={selTareaId} vistaBucket={vistaBucket} />

      {/* El contenido usa el ANCHO COMPLETO (con padding) — más aire, sin el margen central
          que dejaba mucho espacio muerto a los lados (Pedro). El key por tarea la remonta al
          cambiar → entra con un fade sutil. */}
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {vista ? (
          <div key={selTareaId ?? vistaBucket ?? "none"} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {vista}
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-muted-foreground">Elige una idea para revisarla.</p>
        )}
      </div>
    </div>
  );
}
