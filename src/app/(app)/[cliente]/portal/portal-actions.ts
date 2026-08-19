"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";

export type PortalResultado = { ok: true } | { ok: false; error: string };

/**
 * ¿La idea es de ESTE cliente y está publicada? El server action no confía en el
 * slug de la URL a ciegas — verifica el vínculo idea→brief→cliente. (Hoy es la
 * única protección real: sin login, RLS no participa. Al lanzar, el guard será la
 * sesión del cliente.)
 */
async function esDelCliente(
  db: ReturnType<typeof supabaseAdmin>,
  clienteSlug: string,
  ideaId: string,
): Promise<boolean> {
  const { data: idea } = await db
    .from("ideas")
    .select("brief_id, published_at")
    .eq("id", ideaId)
    .maybeSingle<{ brief_id: string; published_at: string | null }>();
  if (!idea || !idea.published_at) return false;
  const { data: brief } = await db
    .from("briefs")
    .select("clients(slug)")
    .eq("id", idea.brief_id)
    .maybeSingle<{ clients: { slug: string } | null }>();
  return brief?.clients?.slug === clienteSlug;
}

/** El cliente pide cambios (texto libre) sobre una idea publicada. */
export async function clientePedirCambios(
  clienteSlug: string,
  ideaId: string,
  texto: string,
): Promise<PortalResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!texto.trim()) return { ok: false, error: "Escribe qué quieres cambiar." };

  const db = supabaseAdmin();
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db.rpc("rpc_client_request_changes", {
    p_idea_id: ideaId,
    p_body: texto.trim(),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/portal`);
  after(() => dispatchPendingEmails());
  return { ok: true };
}

/** El cliente aprueba una idea publicada. */
export async function clienteAprobar(
  clienteSlug: string,
  ideaId: string,
): Promise<PortalResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const db = supabaseAdmin();
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db.rpc("rpc_client_approve", { p_idea_id: ideaId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/portal`);
  after(() => dispatchPendingEmails());
  return { ok: true };
}
