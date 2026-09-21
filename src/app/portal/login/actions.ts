"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import { buscarClienteAprobado, reenviarEnlaceCliente, type ClienteAprobado } from "@/lib/auth/enlace-cliente";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";
const esEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export type SolicitudResult = { ok: true } | { ok: false; error: string };

// ── Anti-abuso del endpoint PÚBLICO (solicitarAcceso) ──────────────────────────
// Es la única acción sin autenticar de la app: cada llamada avisaba a TODOS los
// admins (in-app + email) y podía crear una fila en pending_invites. Sin freno,
// un script inundaba los buzones de los admins y engordaba la tabla. Tres capas:
//   1) por-IP en memoria (best-effort, por instancia serverless): corta ráfagas.
//   2) circuit-breaker GLOBAL durable (cuenta pending_invites recientes): bajo un
//      ataque distribuido, deja de crear/avisar para no inundar a los admins.
//   3) no re-avisar en un re-envío del MISMO correo ya pendiente (el índice único
//      ya deduplica la fila; esto evita el re-email). — reap 2026-08-26

const IP_WINDOW_MS = 10 * 60_000; // 10 min
const IP_MAX = 5; // solicitudes por IP por ventana
const ipHits = new Map<string, number[]>();

/** Ventana deslizante en memoria (best-effort, por instancia). true = ya se pasó del límite. */
function pasaDelLimite(hits: Map<string, number[]>, clave: string, max: number, nowMs: number): boolean {
  const recientes = (hits.get(clave) ?? []).filter((t) => nowMs - t < IP_WINDOW_MS);
  recientes.push(nowMs);
  hits.set(clave, recientes);
  // Limpieza barata para que el mapa no crezca sin límite en una instancia larga.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => nowMs - t >= IP_WINDOW_MS)) hits.delete(k);
    }
  }
  return recientes.length > max;
}

function ipThrottled(ip: string, nowMs: number): boolean {
  return pasaDelLimite(ipHits, ip, IP_MAX, nowMs);
}

// "Mándame mi enlace" (enviarEnlaceDeEntrada): sólo le manda correo a clientes YA
// aprobados — no sirve para spamear direcciones arbitrarias — pero sin freno un script
// podía bombardear el buzón de un cliente real. Por-IP propio (no comparte cupo con
// las solicitudes) + por-CORREO. Pasado el límite se responde igual que siempre.
const ENTRADA_IP_MAX = 10;
const ENLACE_POR_CORREO_MAX = 3;
const entradaIpHits = new Map<string, number[]>();
const enlacesPorCorreo = new Map<string, number[]>();

const GLOBAL_WINDOW_MS = 10 * 60_000; // 10 min
const GLOBAL_MAX = 30; // solicitudes nuevas en la ventana antes de frenar en seco

async function ipDeLaSolicitud(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0].trim() || h.get("x-real-ip") || "desconocida").slice(0, 64);
}

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

  // Formulario PÚBLICO: se acota el tamaño y se quitan saltos de línea — `name` acaba en
  // el título de un aviso y en el ASUNTO de un correo. (reap pre-lanzamiento 2026-09-02)
  const unaLinea = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const name = unaLinea(input.name);
  const brand = input.brand ? unaLinea(input.brand) || null : null;
  if (!esEmail(email)) return { ok: false, error: "Escribe un correo válido." };
  if (!name) return { ok: false, error: "Escribe tu nombre." };

  // Capa 1: por-IP (best-effort, corta ráfagas de una misma fuente).
  if (ipThrottled(await ipDeLaSolicitud(), Date.now())) {
    return { ok: false, error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." };
  }

  const db = supabaseAdmin();

  // Capa 2: circuit-breaker global (durable). Si llegan muchísimas solicitudes en
  // poco tiempo (ataque distribuido), deja de crear/avisar para no inundar a los admins.
  const desde = new Date(Date.now() - GLOBAL_WINDOW_MS).toISOString();
  const { count: recientes } = await db
    .from("pending_invites")
    .select("*", { count: "exact", head: true })
    .gte("created_at", desde);
  if ((recientes ?? 0) >= GLOBAL_MAX) {
    return {
      ok: false,
      error: "Estamos recibiendo muchas solicitudes ahora mismo. Intenta más tarde.",
    };
  }

  // Un cliente YA aprobado que vuelve a "pedir acceso" (porque se le caducó la sesión)
  // no necesita otra aprobación: se le manda su enlace de entrada y NO se crea una
  // solicitud nueva que le caiga a los admins. Respuesta idéntica hacia fuera; el envío
  // corre después de responder.
  const yaEsCliente = await buscarClienteAprobado(email);
  if (yaEsCliente && yaEsCliente !== "error") {
    const cliente = yaEsCliente;
    if (hasEmail()) after(() => enviarSiHayCupo(cliente, null));
    return { ok: true };
  }

  // El índice único parcial (lower(email) where status='pending') evita duplicados:
  // si ya hay una pendiente, la refrescamos en vez de acumular filas.
  let esNueva = true;
  const { error: insErr } = await db
    .from("pending_invites")
    .insert({ email, name, requested_brand: brand, status: "pending" });
  if (insErr) {
    if (insErr.code === "23505") {
      esNueva = false; // ya había una pendiente con este correo
      await db
        .from("pending_invites")
        .update({ name, requested_brand: brand })
        .eq("email", email)
        .eq("status", "pending");
    } else {
      return { ok: false, error: "No se pudo enviar la solicitud. Intenta de nuevo." };
    }
  }

  // Capa 3: sólo avisar a los admins en una solicitud NUEVA. Un re-envío del mismo
  // correo ya pendiente refresca los datos pero NO vuelve a mandar correos — así un
  // mismo remitente no puede bombardear los buzones re-enviando. El cliente ve "ok"
  // igual (su solicitud está registrada), sin filtrar si ya existía.
  if (esNueva) await notificarAdmins({ email, name, brand });
  return { ok: true };
}

/**
 * "Ya tengo acceso — mándame mi enlace". Un cliente APROBADO cuya sesión caducó (o
 * que cambió de dispositivo) pide un enlace de entrada nuevo. Público y sin sesión:
 * la respuesta es la MISMA exista o no el correo (no revela quién es cliente), y sólo
 * se manda correo a clientes aprobados y activos. `next` = la página del portal que
 * intentaba abrir; sólo se respeta si cae dentro de SU portal.
 */
export async function enviarEnlaceDeEntrada(input: {
  email: string;
  next?: string | null;
}): Promise<SolicitudResult> {
  // Server action pública: el payload puede venir de cualquier lado, no sólo del formulario.
  if (typeof input?.email !== "string" || (input.next != null && typeof input.next !== "string")) {
    return { ok: false, error: "Escribe un correo válido." };
  }
  if (!hasSupabase() || !hasEmail()) return { ok: false, error: "El sistema no está disponible ahora mismo." };

  const email = input.email.trim().toLowerCase().slice(0, 254);
  if (!esEmail(email)) return { ok: false, error: "Escribe un correo válido." };

  if (pasaDelLimite(entradaIpHits, await ipDeLaSolicitud(), ENTRADA_IP_MAX, Date.now())) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
  }

  // TODO lo que distingue a un cliente de un desconocido (buscarlo, generar el link, el
  // SMTP) corre DESPUÉS de responder: misma respuesta y mismo tiempo para cualquier
  // correo — la página no sirve para averiguar quién es cliente de Rünna.
  const next = input.next?.slice(0, 512) ?? null;
  after(async () => {
    try {
      const cliente = await buscarClienteAprobado(email);
      if (cliente && cliente !== "error") await enviarSiHayCupo(cliente, next);
    } catch (e) {
      console.error("[portal] enlace de entrada: error inesperado —", e);
    }
  });
  return { ok: true };
}

/** Envía el enlace si ese correo no se pasó de su cupo. Fallos → log (nunca al público). */
async function enviarSiHayCupo(cliente: ClienteAprobado, next: string | null): Promise<void> {
  if (pasaDelLimite(enlacesPorCorreo, cliente.email, ENLACE_POR_CORREO_MAX, Date.now())) return;
  try {
    const r = await reenviarEnlaceCliente(cliente, next);
    if (!r.ok) console.error("[portal] no se pudo mandar el enlace de entrada", { profileId: cliente.profileId });
  } catch (e) {
    console.error("[portal] enlace de entrada: error inesperado —", e);
  }
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
