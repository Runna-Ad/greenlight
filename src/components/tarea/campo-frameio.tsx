"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { guardarIntake } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { esLinkFrameio } from "@/lib/frameio";

/** El mismo azul de liga que la carpeta de Drive (campo-drive). */
const AZUL_LIGA = "text-[#1a73e8] hover:text-[#1557b0] dark:text-[#8ab4f8] dark:hover:text-[#aecbfa]";

/**
 * El link de Frame.io de la tarea, en la cabecera (Pedro 2026-11-19). SÓLO equipo: la página
 * no lo manda al cliente. Se pega desde aquí quien trabaja la tarea; se guarda en
 * `ideas.entrega_url` con el mismo guardado de la cabecera (`guardarIntake`).
 */
export function CampoFrameio({
  ideaId,
  url,
  puedeEditar,
}: {
  ideaId: string;
  url: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(url ?? "");
  const [guardando, startGuardar] = useTransition();

  const guardar = (nuevo: string) =>
    startGuardar(async () => {
      const limpio = nuevo.trim() || null;
      try {
        const r = await guardarIntake(ideaId, "entrega_url", url, limpio);
        if (!r.ok) {
          toast.error(r.conflicto ? "Alguien más cambió el link. Ya ves el nuevo." : r.error);
          if (r.conflicto) { setEditando(false); router.refresh(); }
          return;
        }
      } catch {
        toast.error("No se pudo guardar el link. Revisa tu conexión.");
        return;
      }
      if (limpio && !esLinkFrameio(limpio)) toast.warning("Guardado, pero no es un link de Frame.io.");
      else toast.success(limpio ? "Link de Frame.io guardado." : "Link de Frame.io quitado.");
      setEditando(false);
      router.refresh();
    });

  if (url && !editando) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 whitespace-nowrap py-1 text-[12px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
        >
          <Clapperboard className="size-3.5" /> Abrir en Frame.io <ExternalLink className="size-3" />
        </a>
        {puedeEditar && (
          <button
            type="button"
            onClick={() => { setValor(url); setEditando(true); }}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" /> Cambiar
          </button>
        )}
      </div>
    );
  }

  if (!puedeEditar) {
    return <p className="py-1 text-[11px] text-muted-foreground">Sin link de Frame.io</p>;
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { setValor(""); setEditando(true); }}
        className={`flex w-fit items-center gap-1 whitespace-nowrap py-1 text-left text-[12px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
      >
        <Clapperboard className="size-3.5" /> Agregar link de Frame.io
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => { e.preventDefault(); guardar(valor); }}
    >
      <input
        type="url"
        inputMode="url"
        placeholder="Pega el link de Frame.io"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        aria-label="Link de Frame.io de la tarea"
        className="h-8 min-w-0 flex-1 basis-64 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
      />
      <button
        type="submit"
        disabled={guardando || !valor.trim()}
        className="h-8 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      {url && (
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
