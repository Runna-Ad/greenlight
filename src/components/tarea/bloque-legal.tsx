"use client";

import { CortinillaCierre, type LegalSnippet } from "./cortinilla-cierre";
import { LegalLectura } from "./legal-lectura";
import type { Sugerencia } from "@/lib/legal-sugerido";
import { useWorkspaceView } from "./workspace-provider";

/**
 * El bloque de LEGALES de una tarea. Es idea-level y plantilla-AGNÓSTICO (el legal
 * vive en `ideas.legales_libres` o en un snippet elegido, uno por tarea), así que lo
 * comparten el guión/estático (DocumentoGuion) Y los copies — antes sólo montaba en
 * el guión, y una tarea de Copies que necesitaba un legal (CASHBACK/MSI) no podía
 * adjuntarlo. En "Vista cliente" el legal se ve ANCLABLE (LegalLectura) para el
 * round-trip de correcciones del cliente; en modo editor va el CortinillaCierre.
 * (reap 2026-08-26)
 */
export function BloqueLegal({
  ideaId,
  legalesLibres,
  seleccionados,
  biblioteca,
  sugerencia,
  soloLectura,
  titulo,
}: {
  ideaId: string;
  legalesLibres: string | null;
  seleccionados: LegalSnippet[];
  biblioteca: LegalSnippet[];
  sugerencia: Sugerencia;
  soloLectura: boolean;
  titulo: string;
}) {
  const { verCliente } = useWorkspaceView();
  const texto = seleccionados[0]?.body ?? legalesLibres;

  if (verCliente) {
    return texto ? <LegalLectura ideaId={ideaId} legal={texto} titulo={titulo} /> : null;
  }
  return (
    <CortinillaCierre
      ideaId={ideaId}
      titulo={titulo}
      legalesLibres={legalesLibres}
      seleccionados={seleccionados}
      biblioteca={biblioteca}
      sugerencia={sugerencia}
      soloLectura={soloLectura}
    />
  );
}
