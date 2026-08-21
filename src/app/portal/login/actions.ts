"use server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";
const esEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export type SolicitudResult = { ok: true } | { ok: false; error: string };

/**
 * Un cliente pide acceso al portal desde /portal/login. Esto NO lo autentica ni
 * le manda un link: crea una SOLICITUD PENDIENTE y avisa a Pedro + admins. El link
 * de acceso se manda sólo cuando un admin la APRUEBA (ver clientes-actions).
 */
export async function solicitarAcceso(input: {
  email: string;
  name: string;
  brand?: string | null;
}): Promise<SolicitudResult> {
  if (!hasSupabase()) return { ok: false, error: "El sistema no está disponible ahora mismo." };

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const brand = input.brand?.trim() || null;
  if (!esEmail(email)) return { ok: false, error: "Escribe un correo válido." };
  if (!name) return { ok: false, error: "Escribe tu nombre." };

  const db = supabaseAdmin();

  // El índice único parcial (lower(email) where status='pending') evita duplicados:
  // si ya hay una pendiente, la refrescamos en vez de acumular filas.
  const { error: insErr } = await db
    .from("pending_invites")
    .insert({ email, name, requested_brand: brand, status: "pending" });
  if (insErr) {
    if (insErr.code === "23505") {
      await db
        .from("pending_invites")
        .update({ name, requested_brand: brand })
        .eq("email", email)
        .eq("status", "pending");
    } else {
      return { ok: false, error: "No se pudo enviar la solicitud. Intenta de nuevo." };
    }
  }

  await notificarAdmins({ email, name, brand });
  return { ok: true };
}

/** Aviso a Pedro + admins: in-app (una notificación por perfil) + email branded. */
async function notificarAdmins(req: { email: string; name: string; brand: string | null }): Promise<void> {
  const db = supabaseAdmin();
  const { data: admins } = await db
    .from("profiles")
    .select("id, email")
    .in("role", ["admin", "master"])
    .eq("active", true);
  const rows = (admins ?? []) as { id: string; email: string | null }[];
  if (!rows.length) return;

  const title = `${req.name} pide acceso al portal`;
  const body = `Correo: ${req.email}${req.brand ? `\nMarca que indica: ${req.brand}` : ""}`;

  // in-app: el bell lee notifications por recipient_id. NO se insertan deliveries
  // (esas viven en las RPCs de la cola) — así el email no sale dos veces.
  await db.from("notifications").insert(
    rows.map((a) => ({
      recipient_id: a.id,
      type: "client_access_request",
      entity_type: "pending_invite",
      title,
      body,
      url: "/admin",
    })),
  );

  // email: transaccional directo (no pasa por la cola), branded con htmlFor.
  if (!hasEmail()) return;
  const ctaUrl = `${APP_URL}/admin`;
  const html = htmlFor({ type: "client_access_request", title, body, ctaUrl });
  const text = textFor(title, body, ctaUrl);
  await Promise.allSettled(
    rows
      .filter((a) => a.email)
      .map((a) => sendEmail({ to: a.email!, subject: `Greenlight · ${title}`, text, html })),
  );
}
