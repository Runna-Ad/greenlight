"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { canAdmin } from "@/lib/roles";
import { slugify } from "@/lib/slug";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

export type InvitacionRow = {
  id: string;
  email: string;
  name: string;
  requested_brand: string | null;
  created_at: string;
};

export type ClienteOpt = { id: string; name: string; slug: string; marcas: { id: string; name: string }[] };

export type ClienteUsuarioRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  clientId: string | null;
  clientName: string | null;
};

export type AccionResult = { ok: true } | { ok: false; error: string };

async function gate(): Promise<{ userId: string } | null> {
  const u = await getCurrentUser();
  if (!u || !canAdmin(u.role)) return null;
  return { userId: u.userId };
}

/** Solicitudes pendientes + las opciones de cliente/marca para aprobarlas. */
export async function listarInvitaciones(): Promise<{ pendientes: InvitacionRow[]; clientes: ClienteOpt[] }> {
  if (!hasSupabase() || !(await gate())) return { pendientes: [], clientes: [] };
  const db = supabaseAdmin();

  const [invRes, cliRes, marcaRes] = await Promise.all([
    db
      .from("pending_invites")
      .select("id, email, name, requested_brand, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    db.from("clients").select("id, name, slug").order("name"),
    db.from("marcas").select("id, name, client_id").order("name"),
  ]);

  const marcas = (marcaRes.data ?? []) as { id: string; name: string; client_id: string }[];
  const clientes: ClienteOpt[] = ((cliRes.data ?? []) as { id: string; name: string; slug: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    marcas: marcas.filter((m) => m.client_id === c.id).map((m) => ({ id: m.id, name: m.name })),
  }));

  return { pendientes: (invRes.data ?? []) as InvitacionRow[], clientes };
}

/** Clientes (Partners) con cuenta: para la pestaña "Clientes". */
export async function listarClientesUsuarios(): Promise<ClienteUsuarioRow[]> {
  if (!hasSupabase() || !(await gate())) return [];
  const db = supabaseAdmin();
  const { data } = await db
    .from("profiles")
    .select("id, email, full_name, active, client_id, clients(name)")
    .eq("role", "client")
    .order("full_name");
  return ((data ?? []) as unknown as {
    id: string;
    email: string;
    full_name: string;
    active: boolean;
    client_id: string | null;
    clients: { name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    email: r.email,
    name: r.full_name,
    active: r.active,
    clientId: r.client_id,
    clientName: r.clients?.name ?? null,
  }));
}

/**
 * APROBAR: crea (idempotente) la cuenta del cliente + su perfil scopeado al
 * cliente elegido, y AHÍ recién le manda el magic-link de acceso. Nunca antes.
 */
export async function aprobarInvitacion(input: {
  inviteId: string;
  clientId: string;
  marcaId?: string | null;
}): Promise<AccionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin aprueba solicitudes." };
  if (!input.clientId) return { ok: false, error: "Elige a qué cliente pertenece." };

  const db = supabaseAdmin();

  const { data: inv } = await db
    .from("pending_invites")
    .select("id, email, name, status")
    .eq("id", input.inviteId)
    .maybeSingle<{ id: string; email: string; name: string; status: string }>();
  if (!inv) return { ok: false, error: "La solicitud ya no existe." };
  if (inv.status !== "pending") return { ok: false, error: "Esa solicitud ya fue decidida." };

  const { data: cli } = await db
    .from("clients")
    .select("slug")
    .eq("id", input.clientId)
    .maybeSingle<{ slug: string }>();
  if (!cli) return { ok: false, error: "El cliente elegido no existe." };
  const email = inv.email.trim().toLowerCase();
  const portalPath = `/${cli.slug}/portal`;

  // 1) Asegura la cuenta de auth (idempotente). Confirmada, sin contraseña — entra
  //    sólo por magic-link.
  await db.auth.admin.createUser({ email, email_confirm: true }).catch(() => undefined);

  // 2) Genera el magic-link (devuelve también el user, exista o recién creado).
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${APP_URL}/auth/confirm` },
  });
  const props = link?.properties as { hashed_token?: string } | undefined;
  const userId = link?.user?.id;
  if (linkErr || !userId || !props?.hashed_token) {
    return { ok: false, error: "No se pudo generar el enlace de acceso. Intenta de nuevo." };
  }

  // 3) Crea/actualiza el perfil del cliente, scopeado a su client_id. El id ES el
  //    de auth.users — nunca inventado.
  const { error: profErr } = await db
    .from("profiles")
    .upsert(
      { id: userId, email, full_name: inv.name, role: "client", client_id: input.clientId, active: true },
      { onConflict: "id" },
    );
  if (profErr) return { ok: false, error: profErr.message };

  // 4) Sella la solicitud como aprobada — compare-and-set sobre status='pending' para
  //    que dos admins aprobando a la vez no manden el enlace dos veces. Si esto falla,
  //    NO se manda el correo: la solicitud sigue pendiente y al reintentar se completa.
  const { data: sellada, error: sealErr } = await db
    .from("pending_invites")
    .update({
      status: "approved",
      client_id: input.clientId,
      marca_id: input.marcaId ?? null,
      decided_by: g.userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", input.inviteId)
    .eq("status", "pending")
    .select("id");
  if (sealErr) {
    return { ok: false, error: "Se preparó el acceso pero no se pudo cerrar la solicitud. Reintenta." };
  }
  const loSelle = !!(sellada && sellada.length); // sólo quien la selló manda el enlace

  // 5) Manda el enlace (branded, transaccional). El link entra por /auth/confirm.
  if (loSelle && hasEmail()) {
    const confirmUrl =
      `${APP_URL}/auth/confirm?token_hash=${props.hashed_token}` +
      `&type=magiclink&next=${encodeURIComponent(portalPath)}`;
    const title = "Tu acceso a Greenlight está listo";
    const body = "Entra a tu portal para revisar y aprobar el contenido de tu marca.";
    await sendEmail({
      to: email,
      subject: "Greenlight · Tu acceso está listo",
      text: textFor(title, body, confirmUrl),
      html: htmlFor({ type: "client_invite", title, body, ctaUrl: confirmUrl }),
    });
  }

  revalidatePath("/admin");
  return { ok: true };
}

/** RECHAZAR una solicitud (no crea nada, no manda nada). */
export async function rechazarInvitacion(inviteId: string): Promise<AccionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin decide solicitudes." };

  const { error } = await supabaseAdmin()
    .from("pending_invites")
    .update({ status: "rejected", decided_by: g.userId, decided_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Revocar / reactivar el acceso de un cliente (soft: active=false). */
export async function cambiarAccesoCliente(profileId: string, active: boolean): Promise<AccionResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin cambia accesos." };

  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ active })
    .eq("id", profileId)
    .eq("role", "client"); // nunca toca a un miembro del equipo desde aquí
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export type EmpresaCliente = { id: string; name: string; slug: string; brandColor: string };
export type CrearClienteResult = { ok: true; empresa: EmpresaCliente } | { ok: false; error: string };

/**
 * Crea una EMPRESA cliente (el tenant: DiDi). Distinto de "cliente con acceso"
 * (un usuario del portal). El slug se deriva del nombre y es la RAÍZ de sus URLs
 * (/{slug}/tablero…), así que es único. Sólo admin+. Antes no había forma de
 * onboardear un cliente sin tocar la BD a mano. (reap 2026-09-02)
 */
export async function crearCliente(input: {
  name: string;
  tagline?: string | null;
  brandColor?: string | null;
}): Promise<CrearClienteResult> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!(await gate())) return { ok: false, error: "Sólo un admin crea clientes." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Escribe el nombre del cliente." };
  const slug = slugify(name);
  if (!slug) return { ok: false, error: "Ese nombre no genera un identificador de URL válido." };

  const tagline = input.tagline?.trim() || null;
  // brand_color: hex #rgb/#rrggbb; si no viene o no valida, cae al default del esquema.
  const bc = input.brandColor?.trim();
  const brand_color = bc && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(bc) ? bc : "#775cbf";

  const { data, error } = await supabaseAdmin()
    .from("clients")
    .insert({ name, slug, tagline, brand_color })
    .select("id, name, slug, brand_color")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `Ya existe un cliente con el identificador "${slug}". Usa un nombre distinto.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/clientes");
  const c = data as { id: string; name: string; slug: string; brand_color: string };
  return { ok: true, empresa: { id: c.id, name: c.name, slug: c.slug, brandColor: c.brand_color } };
}
