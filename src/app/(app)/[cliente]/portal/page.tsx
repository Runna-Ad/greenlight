import { Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewAs } from "@/lib/view-as";
import { getCurrentUser } from "@/lib/identity";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { cargarPortal, cargarTareaPortal } from "./portal-data";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalTarea } from "@/components/portal/portal-tarea";
import { PortalListaTareas } from "@/components/portal/portal-lista-tareas";
import { PortalBrandGrid } from "@/components/portal/portal-brand-grid";
import { PortalBriefGrid } from "@/components/portal/portal-brief-grid";
import { bucketPortal, type BucketPortal } from "@/lib/portal-bucket";

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
  searchParams: Promise<{ marca?: string; brief?: string; tarea?: string; vista?: string }>;
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

  // ── Navegación por NIVELES (Fase 2): MARCA → BRIEFS → TAREA. Marca es un FILTRO sobre
  //    tareas (un brief abarca ambas marcas). Se autosaltan los niveles de un solo item. ──
  const marca = data.cliente.brandColor;
  const clienteInfo = { name: data.cliente.name, logoUrl: data.cliente.logoUrl, brandColor: marca };
  const marcas = data.marcas;

  // Sin trabajo client-facing → estado vacío (el shell lo pinta con !briefs && !vista).
  if (!marcas.length) {
    return <PortalShell cliente={clienteInfo} briefs={[]} selBriefId={null} selTareaId={null} vistaBucket={null} marcaId={null} backHref={null} backLabel="" mostrarNav={false} vista={null} />;
  }

  // Marca seleccionada (auto-salto si hay UNA sola marca → directo a sus briefs).
  const marcaValida = sp.marca && marcas.some((m) => m.id === sp.marca) ? sp.marca : null;
  const marcaSel = marcaValida ?? (marcas.length === 1 ? marcas[0].id : null);

  // NIVEL 1 — grid de MARCAS: entrada cuando hay >1 marca y ninguna elegida.
  if (!marcaSel) {
    return (
      <PortalShell cliente={clienteInfo} briefs={[]} selBriefId={null} selTareaId={null} vistaBucket={null} marcaId={null} backHref={null} backLabel="" mostrarNav={false}
        vista={<PortalBrandGrid cliente={clienteInfo} marcas={marcas} />} />
    );
  }

  // Briefs FILTRADOS a la marca (sólo sus tareas; un brief que abarca dos marcas aparece bajo ambas).
  const briefsMarca = data.briefs
    .map((b) => ({ ...b, tasks: b.tasks.filter((t) => t.marcaId === marcaSel) }))
    .filter((b) => b.tasks.length > 0);
  const marcaObj = marcas.find((m) => m.id === marcaSel)!;
  const backAMarcas = marcas.length > 1 ? "?" : null;

  // NIVEL 2 — grid de BRIEFS de la marca: sin brief/tarea/vista elegidos y con >1 brief.
  const enTarea = !!(sp.brief || sp.vista || sp.tarea);
  if (!enTarea && briefsMarca.length > 1) {
    return (
      <PortalShell cliente={clienteInfo} briefs={[]} selBriefId={null} selTareaId={null} vistaBucket={null} marcaId={marcaSel} backHref={null} backLabel="" mostrarNav={false}
        vista={<PortalBriefGrid cliente={clienteInfo} marcaNombre={marcaObj.name} marcaId={marcaSel} briefs={briefsMarca} backHref={backAMarcas} />} />
    );
  }

  // NIVEL 3 — vista de TAREA (filtrada a la marca). El auto-salto de brief único cae aquí.
  const briefSel = (sp.brief && briefsMarca.some((b) => b.id === sp.brief) ? sp.brief : briefsMarca[0]?.id) ?? null;
  const briefObj = briefsMarca.find((b) => b.id === briefSel);
  const vistaBucket: BucketPortal | null = sp.vista === "revision" || sp.vista === "aprobado" ? sp.vista : null;
  // Atrás: a los briefs si hay >1; si no, a las marcas si hay >1; si no, nada.
  const backHref = briefsMarca.length > 1 ? `?marca=${marcaSel}` : backAMarcas;
  const backLabel = briefsMarca.length > 1 ? "los briefs" : "las marcas";

  if (vistaBucket) {
    const tareasBucket = (briefObj?.tasks ?? []).filter((t) => bucketPortal(t.status) === vistaBucket);
    return (
      <PortalShell cliente={clienteInfo} briefs={briefsMarca} selBriefId={briefSel} selTareaId={null}
        vistaBucket={vistaBucket} marcaId={marcaSel} backHref={backHref} backLabel={backLabel} mostrarNav
        vista={briefSel ? <PortalListaTareas briefId={briefSel} bucket={vistaBucket} tareas={tareasBucket} marca={marca} marcaId={marcaSel} /> : null} />
    );
  }

  const tareaSel = (sp.tarea && briefObj?.tasks.some((t) => t.id === sp.tarea) ? sp.tarea : briefObj?.tasks[0]?.id) ?? null;
  const tareaData = tareaSel ? await cargarTareaPortal(cliente, tareaSel) : null;
  return (
    <PortalShell cliente={clienteInfo} briefs={briefsMarca} selBriefId={briefSel} selTareaId={tareaSel}
      vistaBucket={null} marcaId={marcaSel} backHref={backHref} backLabel={backLabel} mostrarNav
      vista={tareaData ? <PortalTarea t={tareaData} puedeActuar={puedeActuar} /> : null} />
  );
}
