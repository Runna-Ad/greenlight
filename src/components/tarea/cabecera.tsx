"use client";

import { useState } from "react";
import { ChevronDown, Copy, ExternalLink, Check } from "lucide-react";
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
  entregaNum,
  entregaFinal,
  entregaUrl,
  filenames,
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
  entregaNum: string | null;
  entregaFinal: string | null;
  entregaUrl: string | null;
  /** Los nombres finales que entrega esta tarea, ya calculados por la BD. */
  filenames: string[];
  duracionesSugeridas?: string[];
  soloLectura?: boolean;
}) {
  const panel = panelTipo(tipoAsset, plantilla);
  const esEstatico = plantilla === "estatico";

  // Los nombres se recalculan en la base al cambiar la Duración. Se guardan en
  // estado para enseñar los NUEVOS sin recargar — nunca los arma el navegador.
  const [nombres, setNombres] = useState(filenames);

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
          <Dato titulo="Formatos" valor={tamanos.length ? tamanos.join(" · ") : "—"} />
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
              soloLectura={soloLectura}
              onGuardado={(res) => {
                if (res.ok && res.filenames) setNombres(res.filenames);
              }}
            />
          )}
          <Dato titulo="Marca" valor={marca ?? "—"} />
          <Dato titulo="Formato" valor={formato ?? "—"} />
          <Dato titulo="# Entrega" valor={entregaNum ?? "—"} />
          <Dato titulo="Entrega final" valor={entregaFinal ?? "—"} />
          <div className="ml-auto">
            {entregaUrl ? (
              <a
                href={entregaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#ff6d01] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white hover:opacity-90"
              >
                <ExternalLink className="size-3" /> Entrega final
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                Sin liga de entrega
              </span>
            )}
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

      {/* TREND y NOTAS — las dos cajas libres de la cabecera del deck */}
      <div className="grid gap-x-6 gap-y-2 border-t border-border bg-card px-4 py-2 sm:grid-cols-2">
        <CampoIntake
          ideaId={ideaId}
          campo="trend"
          label="Trend"
          valorInicial={trend}
          placeholder="Tendencia o referencia que sigue esta pieza"
          rows={2}
          soloLectura={soloLectura}
        />
        <CampoIntake
          ideaId={ideaId}
          campo="notas"
          label="Notas"
          valorInicial={notas}
          placeholder="Lo que el equipo tiene que saber y no cabe en otro campo"
          rows={2}
          soloLectura={soloLectura}
        />
      </div>

      <NombresFinales filenames={nombres} />
    </div>
  );
}

/**
 * El nombre final. Es lo más importante de la cabecera — el equipo lo copia
 * literal al entregar, y equivocarse ahí rompe la entrega.
 *
 * Una tarea entrega VARIOS archivos (uno por Tamaño × Plataforma), así que se
 * muestra el primero con su leyenda y los demás se despliegan. Salen calculados
 * por la BD (trigger build_filename), no se escriben a mano.
 */
function NombresFinales({ filenames }: { filenames: string[] }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (!filenames.length) {
    return (
      <p className="border-t border-border bg-secondary/40 px-4 py-2 text-center text-[11px] text-muted-foreground">
        Sin archivos generados todavía
      </p>
    );
  }

  const copiar = (f: string) => {
    void navigator.clipboard?.writeText(f);
    setCopiado(f);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div className="border-t border-border bg-secondary/40 px-4 py-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => copiar(filenames[0])}
          title="Copiar"
          className="group inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-tight text-foreground hover:text-primary"
        >
          {filenames[0]}
          {copiado === filenames[0] ? (
            <Check className="size-3 text-status-completed" />
          ) : (
            <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
          )}
        </button>
        {filenames.length > 1 && (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="inline-flex items-center gap-0.5 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            +{filenames.length - 1}
            <ChevronDown className={`size-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      <p className="mt-0.5 text-center font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70">
        topic _ format _ duration _ gender _ kvfocus _ filetype _ idea# _ rrss _ v# _ monthyy _ rn
      </p>

      {abierto && (
        <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
          {filenames.slice(1).map((f) => (
            <li key={f}>
              <button
                onClick={() => copiar(f)}
                className="group flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-[10px] text-muted-foreground hover:bg-card hover:text-foreground"
              >
                {f}
                {copiado === f ? (
                  <Check className="size-2.5 shrink-0 text-status-completed" />
                ) : (
                  <Copy className="size-2.5 shrink-0 opacity-0 group-hover:opacity-60" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
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
