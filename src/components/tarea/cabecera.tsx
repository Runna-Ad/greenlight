"use client";

import { varianteGuion, type Plantilla } from "@/lib/plantilla";
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
 * La cabecera de la VERSIÓN DE TRABAJO.
 *
 * Los colores no son decoración del preview: le dicen al especialista de un
 * vistazo a qué plataforma va la pieza y de qué tipo es. Por eso viven aquí
 * también, no sólo en la vista del cliente (Pedro).
 */
export function CabeceraTarea({
  ideaId,
  tipoAsset,
  plantilla,
  plataformas,
  tamanos,
  duracion,
  trend,
  notas,
  marca,
  formato,
  entregaFinal,
  duracionesSugeridas = [],
  soloLectura,
}: {
  ideaId: string;
  tipoAsset: string | null;
  plantilla: Plantilla;
  plataformas: string[];
  tamanos: string[];
  duracion: string | null;
  trend: string | null;
  notas: string | null;
  marca: string | null;
  formato: string | null;
  entregaFinal: string | null;
  duracionesSugeridas?: string[];
  soloLectura?: boolean;
}) {
  const panel = panelTipo(tipoAsset, plantilla);
  const esEstatico = plantilla === "estatico";

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-col sm:flex-row">
        {/* pleca de plataforma */}
        <div
          className="flex items-center justify-center px-2 py-2 sm:w-10 sm:py-0"
          style={{ background: plecaFondo(plataformas) }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-white sm:rotate-180 sm:[writing-mode:vertical-rl]">
            {esEstatico ? "Static" : "Video"}
          </span>
        </div>

        {/* datos del intake */}
        <div className="flex flex-1 flex-wrap items-start gap-x-6 gap-y-2 bg-card px-4 py-3">
          {/* Formato ratio como pastillas, igual que el wireframe */}
          <div className="leading-tight">
            <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Formato ratio
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
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
          </div>
          {esEstatico ? (
            // Un estático no dura. build_filename ni siquiera emite el token, así
            // que un campo editable aquí prometería algo que no pasa.
            <Dato titulo="Duración" valor="—" />
          ) : (
            <CampoIntake
              ideaId={ideaId}
              campo="duracion"
              label="Duración"
              valorInicial={duracion && duracion !== "-" ? duracion : null}
              placeholder="15-30s"
              sugerencias={duracionesSugeridas}
              ancho="w-24"
              caja
              refrescar
              soloLectura={soloLectura}
            />
          )}
          <Dato titulo="Marca" valor={marca ?? "—"} />
          <Dato titulo="Formato" valor={formato ?? "—"} />
          <Dato titulo="Entrega final" valor={entregaFinal ?? "—"} />
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

      {/* TREND y NOTAS — cajas para escribir (recuadro visible) */}
      <div className="grid gap-x-6 gap-y-2 border-t border-border bg-card px-4 py-3 sm:grid-cols-2">
        <CampoIntake
          ideaId={ideaId}
          campo="trend"
          label="Trend"
          valorInicial={trend}
          placeholder="Tendencia o referencia que sigue esta pieza"
          rows={2}
          caja
          soloLectura={soloLectura}
        />
        <CampoIntake
          ideaId={ideaId}
          campo="notas"
          label="Notas"
          valorInicial={notas}
          placeholder="Lo que el equipo tiene que saber y no cabe en otro campo"
          rows={2}
          caja
          soloLectura={soloLectura}
        />
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="leading-tight">
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      <span className="block text-xs text-foreground">{valor}</span>
    </span>
  );
}

export { PLATAFORMA_LABEL };
