import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { cargarPortal, cargarTareaPortal } from "./portal-data";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalTarea } from "@/components/portal/portal-tarea";
import { PortalAcciones } from "@/components/portal/portal-acciones";

export const dynamic = "force-dynamic";

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ cliente: string }>;
  searchParams: Promise<{ brief?: string; tarea?: string }>;
}) {
  const { cliente } = await params;
  const sp = await searchParams;
  const role = await getViewAs();

  if (!canSee(role, "portal")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Un {ROLE_LABEL[role]} no entra al portal.</p>
      </div>
    );
  }

  const data = await cargarPortal(cliente);
  if (!data) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No se encontró el cliente «{cliente}».
      </div>
    );
  }

  // Selección: brief del query (si es válido) o el primero; tarea del query (si
  // pertenece al brief) o la primera del brief.
  const briefSel = (sp.brief && data.briefs.some((b) => b.id === sp.brief) ? sp.brief : data.briefs[0]?.id) ?? null;
  const briefObj = data.briefs.find((b) => b.id === briefSel);
  const tareaSel =
    (sp.tarea && briefObj?.tasks.some((t) => t.id === sp.tarea) ? sp.tarea : briefObj?.tasks[0]?.id) ?? null;

  const tareaData = tareaSel ? await cargarTareaPortal(cliente, tareaSel) : null;

  return (
    <PortalShell
      cliente={{ name: data.cliente.name, logoUrl: data.cliente.logoUrl, brandColor: data.cliente.brandColor }}
      briefs={data.briefs}
      selBriefId={briefSel}
      selTareaId={tareaSel}
      vista={tareaData ? <PortalTarea t={tareaData} /> : null}
      acciones={
        tareaData ? (
          <PortalAcciones clienteSlug={cliente} ideaId={tareaData.ideaId} status={tareaData.status} />
        ) : null
      }
    />
  );
}
