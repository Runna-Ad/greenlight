"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { agregarPlano, borrarPlano, vaciarGuion } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { PLACEHOLDER_ESTATICO, placeholdersGuion } from "@/lib/plantilla";
import { DocumentoTarea } from "./documento-tarea";
import { type LegalSnippet } from "./cortinilla-cierre";
import { BloqueLegal } from "./bloque-legal";
import type { Sugerencia } from "@/lib/legal-sugerido";
import { type RefVista } from "./referencias-plano";
import { useWorkspace } from "./workspace-provider";
import type { PlanoVista, EstaticoVista } from "./preview-slide";

/**
 * La sección del GUIÓN: el documento (editable o "vista cliente") + la
 * cortinilla de cierre. Lee el cuerpo en vivo y el toggle del contexto del
 * workspace; el "Pegar guión", las reglas y la barra de read-time viven fuera
 * (son piezas hermanas en page.tsx). Antes esto era EditorTarea, que además
 * cargaba el toggle y la nota — ahora repartidos por la nueva disposición.
 */
export function DocumentoGuion({
  ideaId,
  tipoAsset,
  esEstatico,
  refsPorPlano,
  refsEstatico,
  soloLectura,
  cortinilla,
}: {
  ideaId: string;
  tipoAsset: string | null;
  esEstatico: boolean;
  refsPorPlano: Record<string, RefVista[]>;
  refsEstatico: RefVista[];
  soloLectura: boolean;
  cortinilla: {
    legalesLibres: string | null;
    seleccionados: LegalSnippet[];
    biblioteca: LegalSnippet[];
    sugerencia: Sugerencia;
  };
}) {
  const { verCliente, planos, setPlanos, estatico, setEstatico } = useWorkspace();
  const [, startTransition] = useTransition();
  const ph = placeholdersGuion(tipoAsset);

  const editarPlano = (id: string, campo: keyof PlanoVista, valor: string) =>
    setPlanos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor || null } : p)));

  const editarEstatico = (campo: keyof EstaticoVista, valor: string) =>
    setEstatico((prev) => (prev ? { ...prev, [campo]: valor || null } : prev));

  const nuevoPlano = () =>
    startTransition(async () => {
      const res = await agregarPlano(ideaId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPlanos((prev) => [...prev, res.plano]);
    });

  const quitarPlano = (id: string) =>
    startTransition(async () => {
      const res = await borrarPlano(id);
      if (!res.ok) toast.error("error" in res ? res.error : "No se pudo borrar.");
      else setPlanos((prev) => prev.filter((p) => p.id !== id));
    });

  // "Descartar guión": borra TODOS los planos de un golpe (empezar de cero tras un
  // Crear/Pegar que no gustó). Sólo video, editable, con planos. Confirmación 2 pasos.
  const vaciar = () =>
    startTransition(async () => {
      const res = await vaciarGuion(ideaId);
      if (!res.ok) {
        toast.error("error" in res ? res.error : "No se pudo descartar el guión.");
        return;
      }
      setPlanos([]);
      toast.success("Guión descartado — crea o pega uno nuevo.");
    });

  return (
    <div className="space-y-4">
      {!esEstatico && !verCliente && !soloLectura && planos.length > 0 && (
        <div className="flex justify-end">
          <BotonVaciarGuion n={planos.length} onConfirm={vaciar} />
        </div>
      )}

      <DocumentoTarea
        modo={verCliente ? "lectura" : "editable"}
        esEstatico={esEstatico}
        planos={planos}
        estatico={estatico}
        refsPorPlano={refsPorPlano}
        refsEstatico={refsEstatico}
        ph={ph}
        phEstatico={PLACEHOLDER_ESTATICO}
        soloLectura={soloLectura}
        onEditarPlano={editarPlano}
        onEditarEstatico={editarEstatico}
        onNuevoPlano={nuevoPlano}
        onQuitarPlano={quitarPlano}
      />

      {/* La biblioteca de legales aplica a TODAS las plantillas: video y estático
          (aquí) y copies (en page.tsx). El bloque es idea-level y vive en
          <BloqueLegal> (editor vs "Vista cliente" anclable) — el video conserva su
          título "Cortinilla de Cierre"; el estático se titula "Legales". */}
      <BloqueLegal
        ideaId={ideaId}
        titulo={esEstatico ? "Legales" : "Cortinilla de Cierre"}
        legalesLibres={cortinilla.legalesLibres}
        seleccionados={cortinilla.seleccionados}
        biblioteca={cortinilla.biblioteca}
        sugerencia={cortinilla.sugerencia}
        soloLectura={soloLectura}
      />
    </div>
  );
}

/** "Descartar guión" con confirmación en 2 pasos (mismo patrón que borrar un plano). */
function BotonVaciarGuion({ n, onConfirm }: { n: number; onConfirm: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-muted-foreground">
          ¿Descartar {n === 1 ? "el plano" : `los ${n} planos`}?
        </span>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded px-2 py-0.5 font-bold text-white"
          style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
        >
          Sí, descartar
        </button>
        <button
          type="button"
          autoFocus
          onClick={() => setConfirmando(false)}
          className="rounded border border-border px-2 py-0.5 font-medium text-foreground hover:bg-background"
        >
          No
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-status-corrections/50 hover:text-status-corrections"
    >
      <Trash2 className="size-3.5" /> Descartar guión
    </button>
  );
}
