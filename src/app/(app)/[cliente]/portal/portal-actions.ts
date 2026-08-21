"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import { getCurrentUser } from "@/lib/identity";
import type { CorreccionTarget } from "@/app/(app)/[cliente]/tareas/[id]/correcciones-actions";

export type PortalResultado = { ok: true } | { ok: false; error: string };

/**
 * ¿El usuario autenticado puede ACTUAR en el portal de ESTE slug (fijar/quitar/
 * enviar cambios, aprobar)? Sí cuando:
 *   · ES el cliente de esta marca (Partner — no otro tenant), o
 *   · es el MASTER BUILDER (Pedro), que puede actuar como cliente para reproducir
 *     o probar una queja ("el portal no me deja X").
 * Los demás roles de agencia (admin/lead) NO actúan: admin ve el portal en modo
 * SÓLO-LECTURA; lead ni siquiera entra (canSee). Cierra el hueco de que el path de
 * ESCRITURA confiaba en el slug de la URL. Con el login apagado no hay sesión → no
 * procede (correcto).
 */
async function puedeActuarComoCliente(
  db: ReturnType<typeof supabaseAdmin>,
  clienteSlug: string,
): Promise<boolean> {
  const u = await getCurrentUser();
  if (!u) return false;
  if (u.role === "master") return true; // master actúa como cliente (test/soporte)
  if (u.role !== "client" || !u.clientId) return false;
  const { data } = await db.from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  return (data as { id: string } | null)?.id === u.clientId;
}

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

/**
 * El cliente FIJA un cambio localizado (selección de texto → nota), igual que un
 * lead pide una corrección, pero sin tipo de cambio. Se guarda al instante como
 * un "pin" pendiente; NO mueve el estado ni avisa hasta "Pedir cambios".
 */
export async function clienteFijarCambio(
  clienteSlug: string,
  ideaId: string,
  target: CorreccionTarget,
  body: string,
): Promise<PortalResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!body.trim()) return { ok: false, error: "Escribe qué quieres cambiar." };

  const db = supabaseAdmin();
  if (!(await puedeActuarComoCliente(db, clienteSlug))) {
    return { ok: false, error: "No tienes acceso a este portal." };
  }
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db.rpc("rpc_client_add_change", {
    p_idea_id: ideaId,
    p_target_tabla: target.tabla,
    p_target_fila: target.filaId,
    p_target_campo: target.campo,
    p_target_label: target.label,
    p_body: body.trim(),
    p_target_quote: target.quote ?? null,
    p_target_start: target.start ?? null,
    p_target_end: target.end ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/portal`);
  return { ok: true };
}

/** El cliente quita un cambio que fijó y aún no ha enviado (borra el pin). */
export async function clienteQuitarCambio(
  clienteSlug: string,
  ideaId: string,
  commentId: string,
): Promise<PortalResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const db = supabaseAdmin();
  if (!(await puedeActuarComoCliente(db, clienteSlug))) {
    return { ok: false, error: "No tienes acceso a este portal." };
  }
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("idea_id", ideaId)
    .eq("kind", "client_change")
    .is("ronda", null); // sólo BORRADORES sin enviar (0038: enviado = ronda asignada,
                        // ya no es borrador y no se puede quitar — sigue el lifecycle interno)
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/portal`);
  return { ok: true };
}

/** El cliente ENVÍA todos sus cambios pendientes al equipo (published→in_corrections). */
export async function clienteEnviarCambios(
  clienteSlug: string,
  ideaId: string,
): Promise<PortalResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };

  const db = supabaseAdmin();
  if (!(await puedeActuarComoCliente(db, clienteSlug))) {
    return { ok: false, error: "No tienes acceso a este portal." };
  }
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db.rpc("rpc_client_submit_changes", { p_idea_id: ideaId });
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
  if (!(await puedeActuarComoCliente(db, clienteSlug))) {
    return { ok: false, error: "No tienes acceso a este portal." };
  }
  if (!(await esDelCliente(db, clienteSlug, ideaId))) {
    return { ok: false, error: "Esta idea no está disponible para revisión." };
  }
  const { error } = await db.rpc("rpc_client_approve", { p_idea_id: ideaId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${clienteSlug}/portal`);
  after(() => dispatchPendingEmails());
  return { ok: true };
}
