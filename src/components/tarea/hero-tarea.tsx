"use client";

import Image from "next/image";
import { MessageSquareText, Link2 } from "lucide-react";

import { STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import type { Plantilla } from "@/lib/plantilla";
import { CampoIntake } from "./campo-intake";
import { useWorkspaceView } from "./workspace-provider";

/**
 * La HERO de la tarea (mockup): la tarjeta cálida con la identidad de la pieza.
 *   [logo marca] [Brief 20-07]                     [status]
 *   TÍTULO GRANDE (naming_base)
 *   💬 Notas de guión (editable)       · cliente: [Link de entrega ↗]
 *
 * El logo sale de marcas.logo_url (con fallback de 2 letras). El pill de Brief
 * viene del join a briefs. En "Vista cliente" (o rol cliente) se muestra el
 * botón "Link de entrega" (la liga del entregable, que SÍ es para el cliente),
 * porque en esa vista las Rünna tools se ocultan.
 */
export function HeroTarea({
  ideaId,
  marca,
  logoUrl,
  briefLabel,
  naming,
  status,
  notaGuion,
  notaPlaceholder,
  plantilla,
  entregaUrl,
  soloLectura,
}: {
  ideaId: string;
  marca: string | null;
  logoUrl: string | null;
  briefLabel: string | null;
  naming: string | null;
  status: AssetStatus;
  notaGuion: string | null;
  notaPlaceholder: string;
  plantilla: Plantilla;
  entregaUrl: string | null;
  soloLectura: boolean;
}) {
  const { verCliente } = useWorkspaceView();
  const token = STATUS_TOKEN[status];

  return (
    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--deck-orange)_40%,var(--border))] bg-[color-mix(in_srgb,var(--deck-orange)_6%,var(--card))] px-5 py-4 shadow-sm">
      {/* identidad + status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // Alto fijo, ancho natural: un logo horizontal (p. ej. "DiDi Card")
            // se ve a tamaño real en vez de aplastarse dentro de un cuadro. El
            // max-w evita que un logo muy ancho domine la cabecera.
            <Image
              src={logoUrl}
              alt={marca ?? "Marca"}
              width={240}
              height={48}
              className="h-12 w-auto max-w-[220px] object-contain object-left"
              unoptimized
            />
          ) : (
            <span className="flex h-12 min-w-12 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-bold text-secondary-foreground">
              {(marca ?? "·").slice(0, 2).toUpperCase()}
            </span>
          )}
          {briefLabel && (
            <span
              className="max-w-[240px] truncate rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold text-secondary-foreground"
              title={briefLabel}
            >
              {briefLabel}
            </span>
          )}
        </div>

        <span
          className="rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{
            color: `var(--status-${token})`,
            backgroundColor: `color-mix(in srgb, var(--status-${token}) 14%, transparent)`,
          }}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      {/* título */}
      <h1 className="mt-2 break-words font-mono text-3xl font-black uppercase tracking-tight text-foreground sm:text-4xl">
        {naming ?? "Sin naming"}
      </h1>

      {/* notas de guión (SÓLO guión/video — estático y copies no las tienen) + botón
          de entrega del cliente */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        {plantilla === "guion" ? (
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <MessageSquareText className="mt-2 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <CampoIntake
                ideaId={ideaId}
                campo="nota_guion"
                label=""
                valorInicial={notaGuion}
                placeholder={notaPlaceholder}
                caja
                soloLectura={soloLectura || verCliente}
              />
            </div>
          </div>
        ) : (
          <span />
        )}

        {verCliente && entregaUrl && (
          <a
            href={entregaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-status-published px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            Link de entrega <Link2 className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
