"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { agregarPlano, borrarPlano } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { PLACEHOLDER_ESTATICO, placeholdersGuion } from "@/lib/plantilla";
import { DocumentoTarea } from "./documento-tarea";
import { CortinillaCierre, type LegalSnippet } from "./cortinilla-cierre";
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

  return (
    <div className="space-y-4">
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

      {!esEstatico && (
        <CortinillaCierre
          ideaId={ideaId}
          legalesLibres={cortinilla.legalesLibres}
          seleccionados={cortinilla.seleccionados}
          biblioteca={cortinilla.biblioteca}
          // En "Vista cliente" los legales también son de lectura (el preview
          // debe verse como lo del cliente, y no editar legales por accidente).
          soloLectura={soloLectura || verCliente}
        />
      )}
    </div>
  );
}
