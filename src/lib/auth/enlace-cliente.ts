import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import { sinComodines } from "./provision";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

/**
 * El ÚNICO lugar que arma el enlace de entrada de un cliente (Partner). Lo usan la
 * APROBACIÓN (Admin › Solicitudes) y el "mándame mi enlace" de /portal/login — antes
 * sólo existía el de la aprobación, y un cliente ya aprobado cuya sesión caducaba no
 * tenía cómo volver a entrar. El formato del link tiene que casar con /auth/confirm
 * (token_hash + type + next), por eso vive en un solo sitio.
 */
export async function generarEnlaceCliente(
  email: string,
  next: string,
): Promise<{ userId: string; url: string } | null> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${APP_URL}/auth/confirm` },
  });
  const props = data?.properties as { hashed_token?: string } | undefined;
  const userId = data?.user?.id;
  if (error || !userId || !props?.hashed_token) return null;
  const url =
    `${APP_URL}/auth/confirm?token_hash=${props.hashed_token}` +
    `&type=magiclink&next=${encodeURIComponent(next)}`;
  return { userId, url };
}

/** El correo branded con el enlace. `bienvenida` = primera vez (al aprobar). */
export async function mandarCorreoEnlace(
  email: string,
  url: string,
  bienvenida: boolean,
): Promise<{ ok: boolean }> {
  const title = bienvenida ? "Tu acceso a Greenlight está listo" : "Tu enlace para entrar a Greenlight";
  const body = bienvenida
    ? "Entra a tu portal para revisar y aprobar el contenido de tu marca."
    : "Toca el botón para entrar a tu portal. El enlace sirve una sola vez y caduca pronto; si caduca, pide otro desde la página de entrada.";
  const r = await sendEmail({
    to: email,
    subject: bienvenida ? "Greenlight · Tu acceso está listo" : "Greenlight · Tu enlace de entrada",
    text: textFor(title, body, url),
    html: htmlFor({ type: "client_invite", title, body, ctaUrl: url }),
  });
  return { ok: r.ok };
}

/** ¿`next` cae dentro del portal de ESTE cliente? Sólo entonces se respeta; si no, a su inicio. */
function destinoDentroDelPortal(next: string | null | undefined, portalPath: string): string {
  if (!next) return portalPath;
  try {
    const base = "https://x.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return portalPath;
    if (u.pathname === portalPath || u.pathname.startsWith(`${portalPath}/`)) return u.pathname + u.search;
  } catch {
    // malformado → inicio del portal
  }
  return portalPath;
}

export type ClienteAprobado = { profileId: string; email: string; portalPath: string };

/**
 * ¿`email` es un cliente APROBADO y ACTIVO con marca? null = no (incluye revocados y
 * sin marca) — quien llama NO debe distinguirlo ante el público (no revelar qué
 * correos son clientes). "error" = no se pudo leer.
 */
export async function buscarClienteAprobado(email: string): Promise<ClienteAprobado | null | "error"> {
  // PostgREST convierte `*` en `%` dentro de ilike, y sinComodines no lo escapa: "a*@acme.com"
  // casaba con cualquier cliente de acme y, por la diferencia de respuesta, servía para ir
  // descubriendo la lista de clientes letra por letra. Un correo con `*` no se busca.
  // (security review 2026-09-21)
  if (email.includes("*")) return null;
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("id, email, active, client_id, clients(slug)")
    .eq("role", "client")
    .ilike("email", sinComodines(email))
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[portal] buscar cliente: no se pudo leer el perfil —", error.message);
    return "error";
  }
  const p = data as unknown as {
    id: string;
    email: string | null;
    active: boolean;
    client_id: string | null;
    clients: { slug: string } | null;
  } | null;
  const slug = p?.clients?.slug;
  if (!p || !p.email || !p.active || !p.client_id || !slug) return null;
  return { profileId: p.id, email: p.email, portalPath: `/${slug}/portal` };
}

/** Manda a un cliente aprobado un enlace de entrada NUEVO (a `next` si cae en su portal).
 *  Va al correo GUARDADO en su perfil, nunca al texto que se escribió en el formulario. */
export async function reenviarEnlaceCliente(
  cliente: ClienteAprobado,
  next?: string | null,
): Promise<{ ok: boolean }> {
  const email = cliente.email;
  const link = await generarEnlaceCliente(email, destinoDentroDelPortal(next, cliente.portalPath));
  // El link entra a la cuenta de auth con ESE correo. Si no es la misma cuenta que el
  // perfil (correo cambiado a mano en uno solo), no se manda: jamás un enlace que abra
  // una cuenta distinta a la aprobada.
  if (!link || link.userId !== cliente.profileId) {
    console.error("[portal] reenviar enlace: el link no corresponde al perfil del cliente", {
      profileId: cliente.profileId,
    });
    return { ok: false };
  }
  return mandarCorreoEnlace(email, link.url, false);
}
