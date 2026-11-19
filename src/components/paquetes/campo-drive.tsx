"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ponerDrivePaquete } from "@/app/(app)/[cliente]/briefs/actions";

/**
 * La carpeta de Google Drive de un paquete (0100, Pedro 2026-11-19), para el EQUIPO.
 * Admin/master pega o cambia el link; los demás sólo lo abren. Va en Briefs (mientras el
 * paquete sigue ahí) y en Entregas: la misma pieza, para que se lea igual en las dos.
 */
/** El azul de liga que la gente reconoce (el de Google), claro y oscuro (Pedro 2026-11-19). */
const AZUL_LIGA = "text-[#1a73e8] hover:text-[#1557b0] dark:text-[#8ab4f8] dark:hover:text-[#aecbfa]";

export function CampoDrive({
  cliente,
  paqueteId,
  nombre,
  driveUrl,
  puedeEditar,
}: {
  cliente: string;
  paqueteId: string;
  nombre: string;
  driveUrl: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(driveUrl ?? "");
  const [guardando, startGuardar] = useTransition();

  const guardar = (link: string) =>
    startGuardar(async () => {
      const r = await ponerDrivePaquete(cliente, paqueteId, link.trim() || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(link.trim() ? "Carpeta de Drive guardada." : "Carpeta de Drive quitada.");
      setEditando(false);
      router.refresh();
    });

  if (driveUrl && !editando) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 whitespace-nowrap py-1 text-[11px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
        >
          <FolderOpen className="size-3.5" /> Abrir carpeta en Drive <ExternalLink className="size-3" />
        </a>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => { setValor(driveUrl); setEditando(true); }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" /> Cambiar
          </button>
        )}
      </div>
    );
  }

  if (!puedeEditar) {
    return <p className="mt-1 text-[11px] text-muted-foreground">Carpeta de Drive pendiente</p>;
  }

  // Sin link: una liga chica que abre el campo, para no llenar cada tarjeta de cajas vacías.
  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { setValor(""); setEditando(true); }}
        className={`my-1 flex w-fit items-center gap-1 whitespace-nowrap py-1 text-left text-[11px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
      >
        <FolderOpen className="size-3.5" /> Agregar carpeta de Drive
      </button>
    );
  }

  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => { e.preventDefault(); guardar(valor); }}
    >
      <input
        type="url"
        inputMode="url"
        placeholder="Pega el link de la carpeta de Drive"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        aria-label={`Link de la carpeta de Drive de ${nombre}`}
        className="h-7 min-w-0 flex-1 basis-full rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
      />
      <button
        type="submit"
        disabled={guardando || !valor.trim()}
        className="h-7 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      {driveUrl && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => guardar("")}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Quitar
        </button>
      )}
      <button
        type="button"
        disabled={guardando}
        onClick={() => setEditando(false)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        Cancelar
      </button>
    </form>
  );
}
