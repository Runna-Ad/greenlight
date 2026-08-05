"use client";

import { STATUS_LABEL, type AssetStatus } from "@/lib/brand";

export type PlanoVista = {
  id: string;
  orden: number;
  titulo: string | null;
  accion: string | null;
  copy_in: string | null;
  sfx: string | null;
  gfx: string | null;
  edicion: string | null;
  dialogo: string | null;
  es_cierre: boolean;
};

export type EstaticoVista = {
  id: string;
  copy_titulo: string | null;
  copy_subtitulo: string | null;
  copy_cta: string | null;
  legales_extra: string | null;
  referencia_url: string | null;
  referencia_nota: string | null;
};

export type CabeceraVista = {
  naming: string | null;
  tipoAsset: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string | null;
  marca: string | null;
  formato: string | null;
  status: AssetStatus;
};

const COLOR_PLATAFORMA: Record<string, string> = {
  GG: "var(--plat-gg)",
  FB: "var(--plat-fb)",
  TT: "var(--plat-tt)",
};

/**
 * La pleca. Una plataforma = su color; varias = un degradado con todas.
 *
 * Tomar la primera sería arbitrario: las 5 tareas de Images son FB+GG+TT, y
 * pintarlas de azul haría pensar que son sólo de Facebook. El degradado dice de
 * un vistazo que la pieza va a varios lados — que es exactamente por lo que sus
 * reglas pueden contradecirse.
 *
 * EC no tiene color propio; cae en neutro.
 */
function plecaFondo(plataformas: string[]): string {
  const colores = plataformas.map((p) => COLOR_PLATAFORMA[p]).filter(Boolean);
  if (colores.length === 0) return "var(--muted-foreground)";
  if (colores.length === 1) return colores[0];
  return `linear-gradient(160deg, ${colores.join(", ")})`;
}

/**
 * El slide, tal como lo verá el cliente.
 *
 * Se alimenta del MISMO estado de React que los campos — se actualiza en la
 * misma tecla, sin ir al servidor. Por eso el editor le pasa los valores en
 * vivo y no relee de la base.
 */
export function PreviewSlide({
  cabecera,
  planos,
  estatico,
  legales,
}: {
  cabecera: CabeceraVista;
  planos?: PlanoVista[];
  estatico?: EstaticoVista | null;
  legales: string[];
}) {
  const fondo = plecaFondo(cabecera.plataformas);
  // El tinte de la franja de datos usa un solo color para no competir.
  const tinte = COLOR_PLATAFORMA[cabecera.plataformas[0]] ?? "var(--muted-foreground)";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white text-[#111114] shadow-sm">
      {/* pleca */}
      <div className="flex items-stretch">
        <div
          className="flex w-9 shrink-0 items-center justify-center py-2"
          style={{ background: fondo }}
        >
          <span className="rotate-180 text-[9px] font-bold uppercase tracking-widest text-white [writing-mode:vertical-rl]">
            {cabecera.tipoAsset?.toLowerCase().includes("image") ? "Static" : "Video"}
          </span>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[9px]" style={{ backgroundColor: `color-mix(in srgb, ${tinte} 12%, white)` }}>
          <Dato titulo="Formatos" valor={cabecera.tamanos.join(" · ") || "—"} />
          <Dato titulo="Duración" valor={cabecera.duracion || "—"} />
          <Dato titulo="Marca" valor={cabecera.marca || "—"} />
          <Dato titulo="Formato" valor={cabecera.formato || "—"} />
          <span className="ml-auto rounded-full bg-white px-2 py-0.5 font-semibold uppercase tracking-wide">
            {STATUS_LABEL[cabecera.status]}
          </span>
        </div>
      </div>

      {/* naming */}
      <p className="border-b border-black/10 px-3 py-1.5 text-center font-mono text-[9px] tracking-tight">
        {cabecera.naming ?? "SIN NAMING"}
      </p>

      {/* cuerpo */}
      {estatico ? (
        <div className="grid grid-cols-2 text-[10px]">
          <div className="border-r border-black/10">
            <p className="bg-[#4a86e8] px-2 py-1 text-center text-[9px] font-bold uppercase text-white">
              Copy in
            </p>
            <div className="space-y-1.5 p-2">
              <Linea rotulo="Título" texto={estatico.copy_titulo} fuerte />
              <Linea rotulo="Subtítulo" texto={estatico.copy_subtitulo} />
              {estatico.copy_cta && <Linea rotulo="Botón CTA" texto={estatico.copy_cta} />}
            </div>
          </div>
          <div>
            <p className="bg-[#ff6d01] px-2 py-1 text-center text-[9px] font-bold uppercase text-white">
              Referencia / Imagen
            </p>
            <div className="p-2 text-[10px] text-black/60">
              {estatico.referencia_url || estatico.referencia_nota || "—"}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[10px]">
          <div className="grid grid-cols-2">
            <p className="border-r border-white/20 bg-[#4a86e8] px-2 py-1 text-center text-[9px] font-bold uppercase text-white">
              Acción + Copy in + GFX / SFX
            </p>
            <p className="bg-[#ff6d01] px-2 py-1 text-center text-[9px] font-bold uppercase text-white">
              Diálogo
            </p>
          </div>
          {(planos ?? []).length === 0 && (
            <p className="p-4 text-center text-[10px] italic text-black/40">
              Todavía no hay planos.
            </p>
          )}
          {(planos ?? []).map((p) => (
            <div key={p.id} className="grid grid-cols-2 border-b border-black/10 last:border-0">
              <div className="space-y-1 border-r border-black/10 p-2">
                <p className="font-bold">{p.titulo || `Plano ${p.orden}`}</p>
                {p.accion && <p className="text-black/70">{p.accion}</p>}
                {p.sfx && <p><b>SFX:</b> {p.sfx}</p>}
                {p.gfx && <p><b>GFX:</b> {p.gfx}</p>}
                {p.edicion && <p><b>EDICIÓN:</b> {p.edicion}</p>}
                {p.copy_in && <p><b>COPY IN:</b> {p.copy_in}</p>}
              </div>
              <div className="p-2 text-center">
                {p.dialogo ? (
                  <p className="whitespace-pre-wrap">{p.dialogo}</p>
                ) : (
                  <p className="italic text-black/30">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* cortinilla de cierre */}
      {legales.length > 0 && (
        <div className="border-t border-black/10 p-2">
          <p className="text-[9px] font-bold">Cortinilla de Cierre</p>
          {legales.map((l, i) => (
            <p key={i} className="mt-0.5 text-[8px] leading-snug text-black/70">
              <b>Legales:</b> {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="leading-tight">
      <span className="block font-bold uppercase tracking-wide text-black/50">{titulo}</span>
      <span className="block">{valor}</span>
    </span>
  );
}

function Linea({ rotulo, texto, fuerte }: { rotulo: string; texto: string | null; fuerte?: boolean }) {
  return (
    <p className={fuerte ? "font-bold" : ""}>
      <span className="text-black/45">{rotulo}: </span>
      {texto || <span className="italic text-black/30">—</span>}
    </p>
  );
}
