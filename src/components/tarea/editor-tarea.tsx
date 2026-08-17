"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Eye, Pencil, Clock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { agregarPlano, borrarPlano } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import {
  PLACEHOLDER_ESTATICO,
  notaGlobal,
  placeholdersGuion,
  readTimeS,
} from "@/lib/plantilla";
import { reglasQueAplican, type Regla } from "@/lib/reglas";
import { cn } from "@/lib/utils";
import { CampoIntake } from "./campo-intake";
import { PegarGuion } from "./pegar-guion";
import { ChipsReglas } from "./chips-reglas";
import { type RefVista } from "./referencias-plano";
import { CortinillaCierre, type LegalSnippet } from "./cortinilla-cierre";
import { DocumentoTarea } from "./documento-tarea";
import { useBorrador } from "./borrador-tarea";
import {
  type CabeceraVista,
  type EstaticoVista,
  type PlanoVista,
} from "./preview-slide";

export function EditorTarea({
  ideaId,
  cabecera,
  marcaSlug,
  planosIniciales,
  estaticoInicial,
  refsPorPlano,
  refsEstatico,
  reglas,
  cortinilla,
  notaGuion,
  soloLectura,
}: {
  ideaId: string;
  cabecera: CabeceraVista;
  marcaSlug: string | null;
  planosIniciales: PlanoVista[];
  estaticoInicial: EstaticoVista | null;
  refsPorPlano: Record<string, RefVista[]>;
  refsEstatico: RefVista[];
  reglas: Regla[];
  notaGuion: string | null;
  cortinilla: {
    legalesLibres: string | null;
    seleccionados: LegalSnippet[];
    biblioteca: LegalSnippet[];
  };
  soloLectura: boolean;
}) {
  // El documento se alimenta de ESTE estado: se actualiza en la misma tecla, sin
  // ir al servidor. Los campos persisten aparte, con su propio autoguardado.
  const [planos, setPlanos] = useState(planosIniciales);
  const [estatico, setEstatico] = useState(estaticoInicial);
  // El toggle: por defecto editable (agencia); "ver como cliente" lo pasa a lectura.
  const [verCliente, setVerCliente] = useState(false);
  const [, startTransition] = useTransition();

  // Mantener el borrador VIVO para el chequeo de ortografía: revisa el texto
  // ACTUAL en pantalla (no la BD), así no se pierde lo recién tecleado que aún no
  // se autoguardó (la carrera que hizo que el chequeo no viera los cambios).
  const borrador = useBorrador();
  useEffect(() => {
    borrador?.set({ planos, estatico });
  }, [planos, estatico, borrador]);

  const esEstatico = estatico !== null;
  // Real Person y Normal no son la misma plantilla: cambian los placeholders y
  // la nota del guión.
  const PH = placeholdersGuion(cabecera.tipoAsset);
  const nota = notaGlobal(cabecera.tipoAsset);

  const editarPlano = (id: string, campo: keyof PlanoVista, valor: string) =>
    setPlanos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [campo]: valor || null } : p)),
    );

  const editarEstatico = (campo: keyof EstaticoVista, valor: string) =>
    setEstatico((prev) => (prev ? { ...prev, [campo]: valor || null } : prev));

  // Todo el texto escrito, para las reglas que miran contenido (CASHBACK/MSI).
  const textoTotal = useMemo(() => {
    if (estatico) {
      return [estatico.copy_titulo, estatico.copy_subtitulo, estatico.copy_cta]
        .filter(Boolean).join(" ");
    }
    return planos
      .flatMap((p) => [p.copy_in, p.dialogo, p.accion])
      .filter(Boolean).join(" ");
  }, [planos, estatico]);

  const reglasActivas = useMemo(
    () =>
      reglasQueAplican(reglas, {
        tipoAsset: cabecera.tipoAsset,
        plataformas: cabecera.plataformas,
        duracion: cabecera.duracion,
        marcaSlug,
        texto: textoTotal,
      }),
    [reglas, cabecera, marcaSlug, textoTotal],
  );

  // Informativo, no un juicio. La Duración la decide la persona en la cabecera
  // (Pedro: "no lo adaptes basado en cuánto escrito está en el diálogo"), así
  // que aquí sólo se suma lo que tarda en leerse.
  const totalS = useMemo(
    () => planos.reduce((n, p) => n + readTimeS(p.dialogo), 0),
    [planos],
  );

  const nuevoPlano = () =>
    startTransition(async () => {
      const res = await agregarPlano(ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Optimista: se agrega al estado y entra con animación (gl-enter), sin
      // recargar la página (antes un reload perdía scroll y foco).
      setPlanos((prev) => [...prev, res.plano]);
    });

  const quitarPlano = (id: string) =>
    startTransition(async () => {
      const res = await borrarPlano(id);
      if (!res.ok) toast.error("error" in res ? res.error : "No se pudo borrar.");
      else setPlanos((prev) => prev.filter((p) => p.id !== id));
    });

  return (
    <div className="space-y-4">
      {/* Reglas de la pieza + read-time — arriba de todo, con encabezado claro.
          Cada chip abre su regla completa en un tooltip al pasar el mouse.
          (Sección interna — se queda como estaba.) */}
      {(reglasActivas.length > 0 || !esEstatico) && (
        <div className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 gl-eyebrow">
              <ShieldCheck className="size-3.5" />
              Reglas que aplican
            </span>
            {!esEstatico && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                {totalS}s de lectura en total
              </span>
            )}
          </div>
          {reglasActivas.length > 0 ? (
            <ChipsReglas reglas={reglasActivas} plataformas={cabecera.plataformas} />
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              No hay reglas especiales para esta combinación. Pasa el mouse por un
              chip para ver el detalle cuando aparezcan.
            </p>
          )}
        </div>
      )}

      {/* Nota del guión — editable (Real Person: actriz/actor/outfits).
          (Sección interna — se queda como estaba.) */}
      {!esEstatico && (
        <CampoIntake
          ideaId={ideaId}
          campo="nota_guion"
          label="Nota del guión"
          valorInicial={notaGuion}
          placeholder={nota ?? "Nota general del guión (p. ej. # de outfits, tono, continuidad)…"}
          rows={2}
          caja
          soloLectura={soloLectura}
        />
      )}

      {/* CTA para ARRANCAR la tarea: pegar el guión/copy completo y llenar todo de
          una vez. Es una acción de EDICIÓN → se oculta en "ver como cliente". */}
      {!soloLectura && !verCliente && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              {esEstatico ? "¿Ya tienes el copy?" : "¿Ya tienes el guión?"}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {esEstatico
                ? "Pégalo del deck y llena los campos de una vez."
                : "Pégalo completo del deck y llena todos los planos de una vez."}
            </p>
          </div>
          <PegarGuion
            ideaId={ideaId}
            modo={esEstatico ? "estatico" : "guion"}
            onPlanos={setPlanos}
            onEstatico={setEstatico}
          />
        </div>
      )}

      {/* Toggle Editar / Ver como cliente — el documento es el mismo; sólo cambia
          si los campos son editables o se ven como el slide final del cliente. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="gl-eyebrow">
          {verCliente ? "Como lo verá el cliente" : "Documento de la tarea"}
        </span>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[12px] font-medium shadow-sm">
          <button
            type="button"
            onClick={() => setVerCliente(false)}
            aria-pressed={!verCliente}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
              !verCliente ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Pencil className="size-3.5" /> Editar
          </button>
          <button
            type="button"
            onClick={() => setVerCliente(true)}
            aria-pressed={verCliente}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
              verCliente ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Eye className="size-3.5" /> Ver como cliente
          </button>
        </div>
      </div>

      {/* EL DOCUMENTO — editable en su lugar (agencia) o de lectura (cliente). */}
      <DocumentoTarea
        modo={verCliente ? "lectura" : "editable"}
        esEstatico={esEstatico}
        planos={planos}
        estatico={estatico}
        refsPorPlano={refsPorPlano}
        refsEstatico={refsEstatico}
        ph={PH}
        phEstatico={PLACEHOLDER_ESTATICO}
        soloLectura={soloLectura}
        onEditarPlano={editarPlano}
        onEditarEstatico={editarEstatico}
        onNuevoPlano={nuevoPlano}
        onQuitarPlano={quitarPlano}
      />

      {/* La Cortinilla de Cierre va al FINAL (sólo video). Sección aparte —
          se queda como estaba. */}
      {!esEstatico && (
        <CortinillaCierre
          ideaId={ideaId}
          legalesLibres={cortinilla.legalesLibres}
          seleccionados={cortinilla.seleccionados}
          biblioteca={cortinilla.biblioteca}
          soloLectura={soloLectura}
        />
      )}
    </div>
  );
}
