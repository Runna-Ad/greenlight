import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import { sinComodines } from "./provision";
import { isAgencyEmail } from "./allowlist";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

/**
 * Cuentas de CLIENTE (Partner): entran con correo + contraseña o con Google.
 * La contraseña se elige al pedir acceso y sólo se guarda después de PROBAR que el
 * correo es suyo con un código de 6 dígitos. Sin esa prueba, cualquiera podía pedir
 * acceso "como ana@didi.com" con SU contraseña y, si un admin lo aprobaba, entrar
 * como Ana. El mismo código sirve para "¿Olvidaste tu contraseña?" y para que los
 * clientes de antes (que entraban por enlace, sin contraseña) creen una.
 *
 * Nada de esto usa enlaces de un solo uso: los escáneres de correo corporativos
 * (p. ej. Safe Links de Microsoft Defender) abren los enlaces al recibir el correo y
 * los gastan antes que la persona — un código no se "gasta" por abrir un correo.
 */

export type PerfilCliente = {
  profileId: string;
  email: string;
  role: string;
  active: boolean;
  clientId: string | null;
  slug: string | null;
};

/** El perfil de la cuenta (cualquier rol), por id o por correo. null = no existe; "error" = no se pudo leer. */
export async function leerPerfil(por: { id: string } | { email: string }): Promise<PerfilCliente | null | "error"> {
  let q = supabaseAdmin().from("profiles").select("id, email, role, active, client_id, clients(slug)");
  if ("id" in por) {
    q = q.eq("id", por.id);
  } else {
    // PostgREST convierte `*` en `%` dentro de ilike y sinComodines no lo escapa: un
    // correo con `*` casaría con otros. Esos no se buscan. (security review 2026-09-21)
    if (por.email.includes("*")) return null;
    q = q.ilike("email", sinComodines(por.email));
  }
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) {
    console.error("[acceso-cliente] no se pudo leer el perfil —", error.message);
    return "error";
  }
  const p = data as unknown as {
    id: string;
    email: string | null;
    role: string;
    active: boolean;
    client_id: string | null;
    clients: { slug: string } | null;
  } | null;
  if (!p) return null;
  return {
    profileId: p.id,
    email: p.email ?? "",
    role: p.role,
    active: p.active,
    clientId: p.client_id,
    slug: p.clients?.slug ?? null,
  };
}

/** ¿Es un cliente APROBADO que puede entrar ya a su portal? */
export function esClienteAprobado(p: PerfilCliente | null | "error"): p is PerfilCliente & { slug: string } {
  return !!p && p !== "error" && p.role === "client" && p.active && !!p.clientId && !!p.slug;
}

/**
 * ¿Esta sesión se abrió con CONTRASEÑA? Lee el `amr` del access token de la sesión. Sólo
 * se llama DESPUÉS de que getUser() validó esa misma sesión contra Supabase, así que
 * decodificar su payload es seguro (y evita otro viaje de red). Ante cualquier duda
 * devuelve false: esta es una capa EXTRA y nunca debe dejar fuera a un cliente legítimo.
 */
export function sesionConContrasena(accessToken: string | null | undefined): boolean {
  try {
    const payload = accessToken?.split(".")[1];
    if (!payload) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { amr?: unknown };
    const amr = Array.isArray(claims.amr) ? claims.amr : [];
    return amr.some((a) => (typeof a === "string" ? a : (a as { method?: unknown })?.method) === "password");
  } catch {
    return false;
  }
}

/**
 * Las contraseñas sólo valen para CLIENTES que la crearon con el código del correo
 * (marca `clave_verificada`, que sólo el servidor escribe). El equipo entra con Google:
 * una contraseña en una cuenta del equipo (p. ej. creada antes de su primer login con
 * Google) saltaría la verificación en 2 pasos de Google. (security review 2026-09-21)
 */
export function contrasenaPermitida(role: string, appMetadata: Record<string, unknown> | null | undefined): boolean {
  return role === "client" && appMetadata?.clave_verificada === true;
}

/** ¿Hay una solicitud de acceso PENDIENTE con este correo? */
export async function tieneSolicitudPendiente(email: string): Promise<boolean> {
  if (email.includes("*")) return false;
  const { data } = await supabaseAdmin()
    .from("pending_invites")
    .select("id")
    .ilike("email", sinComodines(email))
    .eq("status", "pending")
    .limit(1);
  return !!data?.length;
}

/** ¿`next` cae dentro del portal de ESTE cliente? Sólo entonces se respeta; si no, a su inicio. */
export function destinoDentroDelPortal(next: string | null | undefined, portalPath: string): string {
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

/**
 * Asegura la cuenta de auth de `email` (la crea si no existe) y devuelve su id + un
 * código de un solo uso. generateLink NO manda correo: el correo lo mandamos nosotros.
 */
export async function generarCodigo(email: string): Promise<{ userId: string; codigo: string } | null> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email });
  const props = data?.properties as { email_otp?: string } | undefined;
  const userId = data?.user?.id;
  if (error || !userId || !props?.email_otp) {
    console.error("[acceso-cliente] no se pudo generar el código —", error?.message);
    return null;
  }
  return { userId, codigo: props.email_otp };
}

export type MotivoCodigo = "solicitud" | "recuperar";

export async function mandarCorreoCodigo(email: string, codigo: string, motivo: MotivoCodigo): Promise<{ ok: boolean }> {
  const title = `Tu código: ${codigo}`;
  const body =
    motivo === "solicitud"
      ? "Escríbelo en la página de Greenlight para confirmar tu correo y enviar tu solicitud de acceso. Vence en poco tiempo y sirve una sola vez. Si no fuiste tú, ignora este correo."
      : "Escríbelo en la página de Greenlight para crear tu nueva contraseña. Vence en poco tiempo y sirve una sola vez. Si no fuiste tú, ignora este correo — tu contraseña no cambia.";
  const url = `${APP_URL}/portal/login`;
  const r = await sendEmail({
    to: email,
    subject: `Greenlight · Tu código es ${codigo}`,
    text: textFor(title, body, url),
    html: htmlFor({ type: "client_invite", title, body, ctaUrl: url, ctaLabel: "Ir a Greenlight" }),
  });
  return { ok: r.ok };
}

/**
 * Comprueba el código contra Supabase con un cliente DESECHABLE (no guarda sesión ni
 * cookies): lo único que se toma es la PRUEBA de que el correo es suyo (id + correo).
 * No depende de si el proyecto tiene activada la "confirmación de correo".
 */
export async function verificarCodigo(
  email: string,
  codigo: string,
): Promise<{ userId: string } | "invalido" | "limite"> {
  const tmp = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await tmp.auth.verifyOtp({ email, token: codigo, type: "email" });
  // El límite de verificaciones de Supabase es POR IP, y desde el servidor todos
  // compartimos las de Vercel: si se llena, decirle "código incorrecto" a un cliente con
  // el código BUENO lo haría reintentar a ciegas. Se distingue.
  if (error && (error.status === 429 || error.code === "over_request_rate_limit")) return "limite";
  const userId = data?.user?.id;
  if (error || !userId || data.user?.email?.toLowerCase() !== email.toLowerCase()) return "invalido";
  // La sesión desechable no sale del servidor; se revoca SÓLO ésa (scope "local"). El
  // default ("global") cerraría también la sesión del cliente en su teléfono/laptop.
  await tmp.auth.signOut({ scope: "local" }).catch(() => undefined);
  return { userId };
}

/**
 * Guarda la contraseña que el cliente PROBÓ con su código y marca la cuenta
 * (`app_metadata` sólo lo escribe el servidor, nunca el público). Cambiar la
 * contraseña desde el admin también cierra todas las sesiones previas de la cuenta.
 */
export async function guardarContrasenaVerificada(userId: string, password: string) {
  return supabaseAdmin().auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    app_metadata: { clave_verificada: true },
  });
}

/**
 * Al APROBAR: asegura la cuenta de auth del correo y devuelve su id. Si la cuenta tiene
 * una contraseña que NO pasó por el código (p. ej. alguien la registró directo en
 * Supabase con la llave pública, con SU contraseña, antes que el cliente real), esa
 * contraseña se reemplaza por una aleatoria — y eso cierra sus sesiones. Hoy el
 * proyecto exige confirmar el correo (esa cuenta no podría entrar), pero es un ajuste
 * COMPARTIDO con S.P.A.M que puede cambiar sin avisar. (security review 2026-09-21)
 */
export async function asegurarCuentaCliente(email: string): Promise<{ userId: string } | null> {
  const db = supabaseAdmin();
  await db.auth.admin.createUser({ email, email_confirm: true }).catch(() => undefined);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const user = data?.user;
  if (error || !user?.id) {
    console.error("[acceso-cliente] no se pudo asegurar la cuenta —", error?.message);
    return null;
  }
  // Las cuentas del EQUIPO no se tocan aquí (Pedro prueba con correos @runna como
  // clientes, y el proyecto de auth es compartido con S.P.A.M): su contraseña ya no abre
  // Greenlight de todos modos (contrasenaPermitida), y resetearla le cerraría S.P.A.M.
  if (user.app_metadata?.clave_verificada !== true && !isAgencyEmail(email)) {
    const { error: pwErr } = await db.auth.admin.updateUserById(user.id, {
      password: randomBytes(32).toString("base64url"),
    });
    if (pwErr) {
      console.error("[acceso-cliente] no se pudo neutralizar la contraseña previa —", pwErr.message);
      return null;
    }
  }
  return { userId: user.id };
}

/** Correo al APROBAR: ya puede entrar (con la contraseña que eligió o con Google). */
export async function mandarCorreoAccesoListo(email: string): Promise<{ ok: boolean }> {
  const title = "Tu acceso a Greenlight está listo";
  const body =
    "Entra a tu portal con tu correo y la contraseña que elegiste, o con Google. " +
    "¿No tienes contraseña o no la recuerdas? En la página de entrada toca \"¿Olvidaste tu contraseña?\" y crea una en un minuto.";
  const url = `${APP_URL}/portal/login`;
  const r = await sendEmail({
    to: email,
    subject: "Greenlight · Tu acceso está listo",
    text: textFor(title, body, url),
    html: htmlFor({ type: "client_invite", title, body, ctaUrl: url }),
  });
  return { ok: r.ok };
}
