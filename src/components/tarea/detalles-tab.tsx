"use client";

import { contentType, canales } from "@/lib/iconos";
import { varianteGuion } from "@/lib/plantilla";
import { Pill } from "@/components/ui/pill";
import { CampoIntake } from "./campo-intake";
import { CampoDuraciones } from "./campo-duraciones";
import { BotonReferencia } from "./boton-referencia";
import { useWorkspace } from "./workspace-provider";

/**
 * La pestaña "Detalles asset" (mockup): los datos de la pieza que el CLIENTE sí
 * ve. Dos columnas — izquierda los atributos (tipo, canales, tamaño, duración),
 * derecha el resumen del brief + el botón "Ver referencia".
 *
 * En "Vista cliente" (o rol cliente) todo es de sólo lectura.
 */
export function DetallesTab({
  ideaId,
  tipoAsset,
  plataformas,
  tamanos,
  duracion,
  concepto,
  trend,
  esEstatico,
  soloLectura,
}: {
  ideaId: string;
  tipoAsset: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string[];
  concepto: string | null;
  trend: string | null;
  esEstatico: boolean;
  soloLectura: boolean;
}) {
  const { verCliente } = useWorkspace();
  const lectura = soloLectura || verCliente;
  const ct = contentType(tipoAsset);
  const IconCT = ct.icon;
  const chans = canales(plataformas);
  // Tipo de contenido como en el mockup: media + variante en dos pastillas.
  const media = esEstatico ? "Imagen" : "Video";
  const variante = esEstatico
    ? null
    : varianteGuion(tipoAsset) === "real"
      ? "Real Person"
      : "Animado";

  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      {/* Columna izquierda: atributos */}
      <div className="space-y-4">
        <Grupo titulo="Tipo de contenido">
          <div className="flex flex-wrap gap-1.5">
            <PastillaGris>
              <IconCT className="size-3.5" /> {media}
            </PastillaGris>
            {variante && <PastillaGris>{variante}</PastillaGris>}
          </div>
        </Grupo>

        <Grupo titulo="Canales">
          {chans.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">—</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chans.map((c) => (
                <Pill key={c.code} color={c.color} fill="solid" title={c.label}>
                  {c.label}
                </Pill>
              ))}
            </div>
          )}
        </Grupo>

        <Grupo titulo="Tamaño">
          {tamanos.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">—</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tamanos.map((t) => (
                <PastillaGris key={t}>{t}</PastillaGris>
              ))}
            </div>
          )}
        </Grupo>

        {/* Duraciones — pastillas editables; cada una despliega su propio juego
            de nombres de archivo (tamaño × plataforma × duración). */}
        {!esEstatico && (
          <Grupo titulo="Duraciones">
            <CampoDuraciones ideaId={ideaId} valorInicial={duracion} soloLectura={lectura} />
          </Grupo>
        )}
      </div>

      {/* Columna derecha: resumen del brief + ver referencia */}
      <div className="flex flex-col">
        <Grupo titulo="Resumen de brief (Concepto)">
          <CampoIntake
            ideaId={ideaId}
            campo="concepto"
            label=""
            valorInicial={concepto}
            placeholder="El concepto del brief (viene del sheet — edítalo si hace falta)…"
            rows={6}
            caja
            soloLectura={lectura}
          />
        </Grupo>
        <div className="mt-3 flex justify-end">
          <BotonReferencia ideaId={ideaId} valorInicial={trend} soloLectura={lectura} />
        </div>
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="leading-tight">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PastillaGris({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[12px] font-medium text-secondary-foreground">
      {children}
    </span>
  );
}
