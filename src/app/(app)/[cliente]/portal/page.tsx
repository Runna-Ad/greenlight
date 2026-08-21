import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getCurrentUser } from "@/lib/identity";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { cargarPortal, cargarTareaPortal } from "./portal-data";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalTarea } from "@/components/portal/portal-tarea";

export const dynamic = "force-dynamic";

function PortalDenegado({ mensaje }: { mensaje: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
      <Lock className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-sm text-foreground">{mensaje}</p>
    </div>
  );
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ cliente: string }>;
  searchParams: Promise<{ brief?: string; tarea?: string }>;
}) {
  const { cliente } = await params;
  const sp = await searchParams;
  const [role, user] = await Promise.all([getViewAs(), getCurrentUser()]);

  if (!canSee(role, "portal")) {
    return <PortalDenegado mensaje={`Un ${ROLE_LABEL[role]} no entra al portal.`} />;
  }

  // Client↔session binding: a Partner sees ONLY their own brand's portal — never
  // another client's by editing the URL slug. Internal roles (master/admin/lead)
  // can still preview any portal. Dormant while login is off (no client session).
  if (role === "client") {
    let esSuyo = false;
    if (user?.clientId && hasSupabase()) {
      const { data: reqClient } = await supabaseAdmin()
        .from("clients")
        .select("id")
        .eq("slug", cliente)
        .maybeSingle();
      esSuyo = (reqClient as { id: string } | null)?.id === user.clientId;
    }
    if (!esSuyo) {
      return <PortalDenegado mensaje="Este portal no es de tu marca." />;
    }
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
    />
  );
}
