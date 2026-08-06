"use client";

import Image from "next/image";

import { varianteGuion, type Plantilla } from "@/lib/plantilla";
import { contentType, canales } from "@/lib/iconos";
import { PLATAFORMA_LABEL } from "@/lib/vocab";
import { CampoIntake } from "./campo-intake";

const COLOR_PLATAFORMA: Record<string, string> = {
  GG: "var(--plat-gg)",
  FB: "var(--plat-fb)",
  TT: "var(--plat-tt)",
};

/** Una plataforma = su color. Varias = degradado con todas. */
export function plecaFondo(plataformas: string[]): string {
  const colores = plataformas.map((p) => COLOR_PLATAFORMA[p]).filter(Boolean);
  if (!colores.length) return "var(--muted-foreground)";
  if (colores.length === 1) return colores[0];
  return `linear-gradient(160deg, ${colores.join(", ")})`;
}

/** El panel derecho del deck: color y sub-opción según el tipo. */
function panelTipo(tipoAsset: string | null, plantilla: Plantilla) {
  if (plantilla === "estatico") {
    return {
      titulo: "Static",
      fondo: "linear-gradient(135deg, #b9a7e6, #7c5cbf)",
      etiqueta: null as string | null,
      opciones: [] as string[],
    };
  }
  return varianteGuion(tipoAsset) === "real"
    ? {
        titulo: "Real Person",
        fondo: "linear-gradient(135deg, #ff8a3d, #e03131)",
        etiqueta: null,
        opciones: ["In-house", "UGC"],
      }
    : {
        titulo: "Normal",
        fondo: "linear-gradient(135deg, #7b4bd8, #4a1fa0)",
        etiqueta: "Estilo",
        opciones: ["Stock", "Illustration", "AI"],
      };
}

/**
 * La cabecera de la VERSIÓN DE TRABAJO — una sola tarjeta.
 *
 * Antes eran dos secciones (banda de marca + datos del intake) que se sentían
 * partidas. Se fusionaron en un solo bloque que se lee de arriba a abajo:
 *   1. identidad de la pieza (marca + topic) · content type · channels
 *   2. los datos del intake (formato ratio, duración, formato, entrega)
 *   3. las cajas para escribir (resumen del brief, trend, notas)
 * La pleca de plataforma (izq) y el panel de tipo (der) son los colores-guía
 * del deck para el especialista; enmarcan la parte de arriba.
 */
export function CabeceraTarea({
  ideaId,
  tipoAsset,
  plantilla,
  plataformas,
  tamanos,
  duracion,
  trend,
  concepto,
  peloteo,
  marca,
  logoUrl,
  topic,
  formato,
  entregaFinal,
  soloLectura,
}: {
  ideaId: string;
  tipoAsset: string | null;
  plantilla: Plantilla;
  plataformas: string[];
  tamanos: string[];
  duracion: string | null;
  /** Trend = la columna Referencias del sheet (ya viene llena). */
  trend: string | null;
  /** Resumen del brief = la columna Concepto del sheet (ya viene llena). */
  concepto: string | null;
  /** Notas = la columna Peloteo del sheet (ya viene llena). */
  peloteo: string | null;
  marca: string | null;
  logoUrl: string | null;
  topic: string | null;
  formato: string | null;
  entregaFinal: string | null;
  soloLectura?: boolean;
}) {
  const panel = panelTipo(tipoAsset, plantilla);
  const esEstatico = plantilla === "estatico";
  const ct = contentType(tipoAsset);
  const IconCT = ct.icon;
  const chans = canales(plataformas);

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
      {/* ── franja superior, enmarcada por los colores-guía ── */}
      <div className="flex flex-col sm:flex-row">
        {/* pleca de plataforma */}
        <div
          className="flex items-center justify-center px-2 py-2 sm:w-9 sm:py-0"
          style={{ background: plecaFondo(plataformas) }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-white sm:rotate-180 sm:[writing-mode:vertical-rl]">
            {esEstatico ? "Static" : "Video"}
          </span>
        </div>

        <div className="flex-1 bg-card">
          {/* identidad + content type + channels */}
          <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-3">
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={marca ?? "Marca"}
                  width={32}
                  height={32}
                  className="size-8 rounded object-contain"
                  unoptimized
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded bg-secondary text-[10px] font-bold text-secondary-foreground">
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

            <div className="flex gap-5">
              <Grupo titulo="Content type">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                  <IconCT className="size-3.5" /> {ct.label}
                </span>
              </Grupo>
              <Grupo titulo="Channels">
                <div className="flex flex-wrap gap-1.5">
                  {chans.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground/70">—</span>
                  ) : (
                    chans.map((c) => (
                      <span
                        key={c.code}
                        title={c.label}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: c.color }}
                      >
                        {c.label}
                      </span>
                    ))
                  )}
                </div>
              </Grupo>
            </div>
          </div>

          {/* datos del intake — una fila limpia */}
          <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2 border-t border-border/60 px-4 py-3">
            <Grupo titulo="Formato ratio">
              <div className="flex flex-wrap gap-1">
                {tamanos.length ? (
                  tamanos.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </Grupo>
            {esEstatico ? (
              // Un estático no dura. build_filename ni emite el token.
              <Dato titulo="Duración" valor="—" />
            ) : (
              <CampoIntake
                ideaId={ideaId}
                campo="duracion"
                label="Duración"
                valorInicial={duracion && duracion !== "-" ? duracion : null}
                placeholder="15-30s"
                ancho="w-24"
                caja
                refrescar
                soloLectura={soloLectura}
              />
            )}
            <Dato titulo="Formato" valor={formato ?? "—"} />
            <Dato titulo="Entrega final" valor={entregaFinal ?? "—"} />
          </div>
        </div>

        {/* panel de tipo — el mismo código de color del deck */}
        <div
          className="flex min-w-[150px] flex-col justify-center gap-1 px-4 py-3 text-white"
          style={{ background: panel.fondo }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">
            {esEstatico ? "Static" : "Video"}
          </span>
          <span className="text-base font-bold leading-tight">{panel.titulo}</span>
          {panel.opciones.length > 0 && (
            <span className="mt-0.5 text-[10px] opacity-90">
              {panel.etiqueta && <b className="mr-1 uppercase">{panel.etiqueta}:</b>}
              {panel.opciones.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* ── cajas para escribir: resumen, trend, notas ──
          Resumen y Notas YA vienen llenas del sheet (Concepto y Comentarios
          Leads); son editables por si el equipo agrega algo. Trend no tiene
          columna en el sheet, así que empieza vacío. */}
      <div className="space-y-3 border-t border-border bg-card px-4 py-3">
        <CampoIntake
          ideaId={ideaId}
          campo="concepto"
          label="Resumen del brief"
          valorInicial={concepto}
          placeholder="El concepto del brief (viene del sheet — edítalo si hace falta)…"
          rows={2}
          caja
          soloLectura={soloLectura}
        />
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <CampoIntake
            ideaId={ideaId}
            campo="trend"
            label="Trend"
            valorInicial={trend}
            placeholder="Referencia que sigue esta pieza (viene del sheet)…"
            rows={2}
            caja
            soloLectura={soloLectura}
          />
          <CampoIntake
            ideaId={ideaId}
            campo="peloteo_raw"
            label="Notas"
            valorInicial={peloteo}
            placeholder="El peloteo del brief (viene del sheet — agrega lo que haga falta)…"
            rows={2}
            caja
            soloLectura={soloLectura}
          />
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="leading-tight">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="leading-tight">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      <span className="mt-1 block text-xs text-foreground">{valor}</span>
    </span>
  );
}

export { PLATAFORMA_LABEL };
