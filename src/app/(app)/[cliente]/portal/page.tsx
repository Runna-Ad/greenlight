import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
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

  // Sesión viva pero SIN identidad (cliente revocado a media sesión): sin esto el rol caía
  // a 'creative' y el cliente veía "Un Especialista no entra al portal" + nav interna.
  // El proxy no cubre las rutas del portal (no consulta el rol ahí), así que se cierra
  // aquí. Sólo con el muro de login encendido: con él apagado no hay sesión que revocar.
  if (process.env.AUTH_ENABLED === "true" && !user) redirect("/portal/login?error=access-revoked");

  if (!canSee(role, "portal")) {
    return <PortalDenegado mensaje={`Un ${ROLE_LABEL[role]} no entra al portal.`} />;
  }

  // Quién puede ACTUAR como cliente en el portal (aprobar / pedir cambios), vs. sólo
  // VERLO. El portal es FUNCIONAL, no una preview (esa vive en la tarea: Vista
  // cliente/editor). Reglas (Pedro 2026-08-21):
  //   · client → sólo SU marca (nunca otra por editar el slug).
  //   · master → puede actuar (reproducir/probar una queja del cliente).
  //   · admin  → VE el portal pero SÓLO-LECTURA (no actúa como cliente).
  //   · lead   → ni entra (lo corta canSee arriba).
  let puedeActuar = role === "master";
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
    puedeActuar = true;
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
      vista={tareaData ? <PortalTarea t={tareaData} puedeActuar={puedeActuar} /> : null}
    />
  );
}
