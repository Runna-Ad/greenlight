"use client";

import { useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, ExternalLink, Pencil, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { ponerDrivePaquete, ponerLinkBrief } from "@/app/(app)/[cliente]/briefs/actions";

/** El azul de liga que la gente reconoce (el de Google), claro y oscuro (Pedro 2026-11-19). */
const AZUL_LIGA = "text-[#1a73e8] hover:text-[#1557b0] dark:text-[#8ab4f8] dark:hover:text-[#aecbfa]";

type Resultado = { ok: true; aviso: string | null } | { ok: false; error: string };

/**
 * Un link que pega el EQUIPO (carpeta de Drive de un paquete, Google Sheet de un brief).
 * Admin/master lo pega o lo cambia; los demás sólo lo abren. Sin link, una liga chica que
 * abre el campo, para no llenar cada tarjeta de cajas vacías.
 */
function CampoLink({
  url,
  puedeEditar,
  guardarLink,
  Icono,
  textos,
}: {
  url: string | null;
  puedeEditar: boolean;
  guardarLink: (link: string | null) => Promise<Resultado>;
  Icono: ComponentType<{ className?: string }>;
  textos: { abrir: string; agregar: string; pendiente: string; placeholder: string; aria: string; guardado: string; quitado: string };
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(url ?? "");
  const [guardando, startGuardar] = useTransition();

  const guardar = (link: string) =>
    startGuardar(async () => {
      const r = await guardarLink(link.trim() || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(link.trim() ? textos.guardado : textos.quitado);
      setEditando(false);
      router.refresh();
    });

  if (url && !editando) {
    return (
      <div className="my-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 whitespace-nowrap py-1 text-[11px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
        >
          <Icono className="size-3.5" /> {textos.abrir} <ExternalLink className="size-3" />
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
    return textos.pendiente ? <p className="mt-1 text-[11px] text-muted-foreground">{textos.pendiente}</p> : null;
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { setValor(""); setEditando(true); }}
        className={`my-1 flex w-fit items-center gap-1 whitespace-nowrap py-1 text-left text-[11px] font-semibold underline underline-offset-2 ${AZUL_LIGA}`}
      >
        <Icono className="size-3.5" /> {textos.agregar}
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
        placeholder={textos.placeholder}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        aria-label={textos.aria}
        className="h-7 min-w-0 flex-1 basis-full rounded-md border border-border bg-background px-2 text-[11px] text-foreground"
      />
      <button
        type="submit"
        disabled={guardando || !valor.trim()}
        className="h-7 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
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

/**
 * La carpeta de Google Drive de un paquete (0100, Pedro 2026-11-19). Va en Briefs y en
 * Entregas: la misma pieza, para que se lea igual en las dos.
 */
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
  return (
    <CampoLink
      url={driveUrl}
      puedeEditar={puedeEditar}
      guardarLink={(link) => ponerDrivePaquete(cliente, paqueteId, link)}
      Icono={FolderOpen}
      textos={{
        abrir: "Abrir carpeta en Drive",
        agregar: "Agregar carpeta de Drive",
        pendiente: "Carpeta de Drive pendiente",
        placeholder: "Pega el link de la carpeta de Drive",
        aria: `Link de la carpeta de Drive de ${nombre}`,
        guardado: "Carpeta de Drive guardada.",
        quitado: "Carpeta de Drive quitada.",
      }}
    />
  );
}

/**
 * «Link a Brief» (0102, Pedro 2026-11-20): el Google Sheet del brief, bajo su nombre en el
 * card de Briefs. Sólo el equipo; sin link, quien no edita no ve nada.
 */
export function CampoLinkBrief({
  cliente,
  briefIds,
  nombre,
  briefUrl,
  puedeEditar,
}: {
  cliente: string;
  briefIds: string[];
  nombre: string;
  briefUrl: string | null;
  puedeEditar: boolean;
}) {
  return (
    <CampoLink
      url={briefUrl}
      puedeEditar={puedeEditar}
      guardarLink={(link) => ponerLinkBrief(cliente, briefIds, link)}
      Icono={FileSpreadsheet}
      textos={{
        abrir: "Link a Brief",
        agregar: "Agregar link a Brief",
        pendiente: "",
        placeholder: "Pega el link del Google Sheet del brief",
        aria: `Link al Google Sheet de ${nombre}`,
        guardado: "Link a Brief guardado.",
        quitado: "Link a Brief quitado.",
      }}
    />
  );
}
