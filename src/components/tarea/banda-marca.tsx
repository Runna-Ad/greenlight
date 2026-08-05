"use client";

import Image from "next/image";

import { contentType, canales } from "@/lib/iconos";
import { CampoIntake } from "./campo-intake";

/**
 * La "banda de marca" del wireframe: logo de la marca + topic grande +
 * "Resumen del brief" a la izquierda; Content Type y Channels con íconos a la
 * derecha. Duración y Format ratio ya viven en la cabecera — no se duplican.
 *
 * El resumen del brief es editable (briefs.description) porque el wireframe lo
 * muestra como caja a llenar, no como dato fijo.
 */
export function BandaMarca({
  briefId,
  marca,
  logoUrl,
  topic,
  tipoAsset,
  plataformas,
  resumen,
  puedeEditar,
}: {
  briefId: string;
  marca: string | null;
  logoUrl: string | null;
  topic: string | null;
  tipoAsset: string | null;
  plataformas: string[];
  resumen: string | null;
  puedeEditar: boolean;
}) {
  const ct = contentType(tipoAsset);
  const IconCT = ct.icon;
  const chans = canales(plataformas);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {/* izquierda: logo + topic + resumen */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // <img>/next-Image de nuestro dominio; las marcas suben su logo.
              <Image
                src={logoUrl}
                alt={marca ?? "Marca"}
                width={28}
                height={28}
                className="size-7 rounded object-contain"
                unoptimized
              />
            ) : (
              <span className="flex size-7 items-center justify-center rounded bg-secondary text-[10px] font-bold text-secondary-foreground">
                {(marca ?? "·").slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              {marca && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {marca}
                </p>
              )}
              <h3 className="truncate font-mono text-base font-bold text-foreground">
                {topic ?? "Sin topic"}
              </h3>
            </div>
          </div>

          <div className="mt-3">
            <CampoIntake
              briefId={briefId}
              campo="description"
              label="Resumen del brief"
              valorInicial={resumen}
              placeholder="En una o dos líneas: de qué va este brief."
              rows={2}
              soloLectura={!puedeEditar}
            />
          </div>
        </div>

        {/* derecha: content type + channels */}
        <div className="flex shrink-0 gap-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Content type
            </p>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
              <IconCT className="size-3.5" /> {ct.label}
            </span>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Channels
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chans.length === 0 ? (
                <span className="text-[11px] text-muted-foreground/70">—</span>
              ) : (
                chans.map((c) => (
                  <span
                    key={c.code}
                    title={c.label}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.label}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
