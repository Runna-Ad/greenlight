"use server";

// Revisor del cliente (0099) — la ÚNICA puerta para ponerlo, cambiarlo o quitarlo. La usan el
// portal (cliente) y el tablero / la tarea (admin, master). Las reglas viven en
// src/lib/revisor-cliente.ts; aquí sólo se leen los datos y se escribe.

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import type { AssetStatus } from "@/lib/brand";
import { motivoNoPuedeAsignar, revisorValido, MSG_REVISOR } from "@/lib/revisor-cliente";
import { cargarPortal, cargarTareaPortal } from "@/app/(app)/[cliente]/portal/portal-data";

export type RevisorResultado = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function asignarRevisorCliente(ideaId: string, profileId: string | null): Promise<RevisorResultado> {
  if (!hasSupabase()) return { ok: false, error: "Sin base de datos." };
  if (!UUID.test(ideaId) || (profileId !== null && !UUID.test(profileId))) {
    return { ok: false, error: MSG_REVISOR.noExiste };
  }
  const u = await getCurrentUser();
  if (!u) return { ok: false, error: MSG_REVISOR.sinPermiso };
  const db = supabaseAdmin();

  const { data: idea } = await db
    .from("ideas")
    .select("id, status, deleted_at, brief_id, marca_id, revisor_cliente_id")
    .eq("id", ideaId)
    .maybeSingle<{ id: string; status: AssetStatus; deleted_at: string | null; brief_id: string | null; marca_id: string | null; revisor_cliente_id: string | null }>();
  if (!idea) return { ok: false, error: MSG_REVISOR.noExiste };

  // Empresa de la tarea: la del brief (si el brief no está en la papelera), o la de la marca.
  const [{ data: brief }, { data: marca }] = await Promise.all([
    idea.brief_id
      ? db.from("briefs").select("client_id, deleted_at").eq("id", idea.brief_id).maybeSingle<{ client_id: string | null; deleted_at: string | null }>()
      : Promise.resolve({ data: null }),
    idea.marca_id
      ? db.from("marcas").select("client_id").eq("id", idea.marca_id).maybeSingle<{ client_id: string | null }>()
      : Promise.resolve({ data: null }),
  ]);
  const clientId = brief?.client_id ?? marca?.client_id ?? null;
  const borrada = !!idea.deleted_at || !!brief?.deleted_at;
  const { data: cli } = clientId
    ? await db.from("clients").select("slug").eq("id", clientId).maybeSingle<{ slug: string }>()
    : { data: null };
  const slug = cli?.slug ?? null;

  // ¿La pieza está en la lista del portal de ese cliente? Lo decide el MISMO cargador que pinta
  // el portal (así la regla no se separa de lo que el cliente ve). Sólo hace falta para clientes.
  let enPortal = false;
  if (u.role === "client" && slug && !borrada) {
    const portal = await cargarPortal(slug);
    enPortal =
      !!portal &&
      (portal.produccion.some((p) => p.id === ideaId) || portal.briefs.some((b) => b.tasks.some((t) => t.id === ideaId)));
    if (!enPortal) enPortal = !!(await cargarTareaPortal(slug, ideaId)); // pieza de un brief archivado
  }

  const motivo = motivoNoPuedeAsignar(
    { role: u.role, clientId: u.clientId },
    { status: idea.status, borrada, clientId, enPortal },
  );
  if (motivo) return { ok: false, error: motivo };

  if (profileId !== null) {
    const { data: perfil } = await db
      .from("profiles")
      .select("role, active, client_id")
      .eq("id", profileId)
      .maybeSingle<{ role: string; active: boolean; client_id: string | null }>();
    if (!revisorValido(perfil, clientId)) return { ok: false, error: MSG_REVISOR.revisorInvalido };
  }
  if ((idea.revisor_cliente_id ?? null) === profileId) return { ok: true }; // nada que cambiar

  const { error } = await db
    .from("ideas")
    .update(
      profileId === null
        ? { revisor_cliente_id: null, revisor_cliente_por: null, revisor_cliente_at: null }
        : { revisor_cliente_id: profileId, revisor_cliente_por: u.userId, revisor_cliente_at: new Date().toISOString() },
    )
    .eq("id", ideaId)
    .is("deleted_at", null);
  if (error) {
    console.error("asignarRevisorCliente:", error.message);
    return { ok: false, error: "No se pudo guardar el revisor. Intenta de nuevo." };
  }

  if (slug) {
    revalidatePath(`/${slug}/portal`);
    revalidatePath(`/${slug}/tablero`);
    revalidatePath(`/${slug}/tareas/${ideaId}`);
  }
  return { ok: true };
}
