"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import {
  leerPerfil,
  esClienteAprobado,
  tieneSolicitudPendiente,
  destinoDentroDelPortal,
  generarCodigo,
  mandarCorreoCodigo,
  verificarCodigo,
  guardarContrasenaVerificada,
  sesionConContrasena,
  contrasenaPermitida,
  type MotivoCodigo,
} from "@/lib/auth/acceso-cliente";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";
const esEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export type AccionResult = { ok: true } | { ok: false; error: string };

// ── Anti-abuso de los endpoints PÚBLICOS de /portal/login ──────────────────────
// Sin sesión: cada código es un correo y cada solicitud avisa a TODOS los admins.
//   1) por-IP y por-CORREO en memoria (best-effort, por instancia serverless).
//   2) circuit-breaker GLOBAL durable (cuenta pending_invites recientes).
//   3) no re-avisar a los admins en un re-envío del MISMO correo ya pendiente.
// La contraseña NO pasa por aquí al entrar: el navegador habla directo con Supabase
// (su límite es por IP del CLIENTE; desde el servidor todos compartiríamos la IP de
// Vercel y 30 intentos cada 5 min de cualquiera bloquearían a todos los clientes).

const VENTANA_MS = 10 * 60_000; // 10 min

/** Ventana deslizante en memoria. true = ya se pasó del límite. */
function pasaDelLimite(hits: Map<string, number[]>, clave: string, max: number, nowMs: number): boolean {
  const recientes = (hits.get(clave) ?? []).filter((t) => nowMs - t < VENTANA_MS);
  recientes.push(nowMs);
  hits.set(clave, recientes);
  // Limpieza barata para que el mapa no crezca sin límite en una instancia larga.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => nowMs - t >= VENTANA_MS)) hits.delete(k);
    }
  }
  return recientes.length > max;
}

const pedirIpHits = new Map<string, number[]>();
const confirmarIpHits = new Map<string, number[]>();
const codigosPorCorreo = new Map<string, number[]>();
const intentosPorCorreo = new Map<string, number[]>();
const PEDIR_IP_MAX = 10;
const CONFIRMAR_IP_MAX = 20;
const CODIGOS_POR_CORREO_MAX = 3;
const INTENTOS_POR_CORREO_MAX = 5;

const GLOBAL_MAX = 30; // solicitudes nuevas en la ventana antes de frenar en seco

async function ipDeLaSolicitud(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0].trim() || h.get("x-real-ip") || "desconocida").slice(0, 64);
}

// Formulario PÚBLICO: se acota el tamaño y se quitan saltos de línea — `name` acaba en
// el título de un aviso y en el ASUNTO de un correo. (reap pre-lanzamiento 2026-09-02)
const unaLinea = (s: string) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
const normalizarEmail = (s: string) => s.trim().toLowerCase().slice(0, 254);

const MSJ = {
  pendiente: "Tu solicitud todavía está pendiente de aprobación. Te avisamos por correo en cuanto esté lista.",
  revocado: "Tu acceso fue dado de baja. Si crees que es un error, escríbele a tu contacto en Rünna.",
  sinAcceso: "Esa cuenta aún no tiene acceso al portal. Pide acceso con \"¿Primera vez aquí?\".",
  equipo: "Esa es una cuenta del equipo Rünna — entra con Google desde el acceso del equipo.",
  confirmarClave:
    "Tu contraseña necesita confirmarse. Toca \"¿Olvidaste tu contraseña?\" y crea una nueva con el código que te mandamos.",
  generico: "No se pudo completar. Intenta de nuevo en unos minutos.",
};

/**
 * Paso 1 (pedir acceso u olvidé mi contraseña): manda un código de 6 dígitos al correo.
 * La respuesta es la MISMA exista o no la cuenta, y todo lo que las distingue corre
 * DESPUÉS de responder (after) — la página no sirve para averiguar quién es cliente.
 */
export async function pedirCodigo(input: { email: string; motivo: MotivoCodigo }): Promise<AccionResult> {
  if (typeof input?.email !== "string" || (input.motivo !== "solicitud" && input.motivo !== "recuperar")) {
    return { ok: false, error: "Escribe un correo válido." };
  }
  if (!hasSupabase() || !hasEmail()) return { ok: false, error: "El sistema no está disponible ahora mismo." };

  const email = normalizarEmail(input.email);
  if (!esEmail(email)) return { ok: false, error: "Escribe un correo válido." };
  if (pasaDelLimite(pedirIpHits, await ipDeLaSolicitud(), PEDIR_IP_MAX, Date.now())) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
  }

  const motivo = input.motivo;
  after(async () => {
    try {
      await enviarCodigoSiCorresponde(email, motivo);
    } catch (e) {
      console.error("[portal] pedir código: error inesperado —", e);
    }
  });
  return { ok: true };
}

async function enviarCodigoSiCorresponde(email: string, motivo: MotivoCodigo): Promise<void> {
  if (pasaDelLimite(codigosPorCorreo, email, CODIGOS_POR_CORREO_MAX, Date.now())) return;
  const perfil = await leerPerfil({ email });
  if (perfil === "error") return;
  // Las cuentas del equipo entran con Google; el formulario de clientes no les toca.
  if (perfil && perfil.role !== "client") return;
  // "Olvidé mi contraseña" sólo para quien ya es cliente o ya tiene una solicitud —
  // así no se crean cuentas de auth para correos al azar.
  if (motivo === "recuperar" && !perfil && !(await tieneSolicitudPendiente(email))) return;

  const gen = await generarCodigo(email);
  if (!gen) return;
  const r = await mandarCorreoCodigo(email, gen.codigo, motivo);
  if (!r.ok) console.error("[portal] no se pudo mandar el código", { userId: gen.userId });
}

export type ConfirmarResult =
  | { ok: true; estado: "listo" | "pendiente" | "revocado" | "sin-acceso" }
  | { ok: false; error: string };

/**
 * Paso 2: el código PRUEBA que el correo es suyo → recién entonces se guarda la
 * contraseña. Luego, según la cuenta: "listo" (cliente aprobado → el navegador entra
 * con esa contraseña), "pendiente" (se crea/refresca la solicitud y se avisa a los
 * admins), "revocado" o "sin-acceso". El estado sólo se revela a quien probó el correo.
 */
export async function confirmarCodigo(input: {
  email: string;
  codigo: string;
  password: string;
  motivo: MotivoCodigo;
  name?: string;
  brand?: string | null;
}): Promise<ConfirmarResult> {
  if (
    typeof input?.email !== "string" ||
    typeof input.codigo !== "string" ||
    typeof input.password !== "string" ||
    (input.motivo !== "solicitud" && input.motivo !== "recuperar") ||
    (input.name != null && typeof input.name !== "string") ||
    (input.brand != null && typeof input.brand !== "string")
  ) {
    return { ok: false, error: "Faltan datos. Vuelve a intentarlo." };
  }
  if (!hasSupabase()) return { ok: false, error: "El sistema no está disponible ahora mismo." };

  const email = normalizarEmail(input.email);
  const codigo = input.codigo.replace(/\s+/g, "");
  const password = input.password;
  const name = input.name ? unaLinea(input.name) : "";
  const brand = input.brand ? unaLinea(input.brand) || null : null;
  if (!esEmail(email)) return { ok: false, error: "Escribe un correo válido." };
  if (!/^\d{6,10}$/.test(codigo)) return { ok: false, error: "Escribe el código de 6 dígitos del correo." };
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  if (password.length > 72) return { ok: false, error: "La contraseña es demasiado larga (máximo 72 caracteres)." };
  if (input.motivo === "solicitud" && !name) return { ok: false, error: "Escribe tu nombre." };

  const now = Date.now();
  if (pasaDelLimite(confirmarIpHits, await ipDeLaSolicitud(), CONFIRMAR_IP_MAX, now)) {
    return { ok: false, error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." };
  }
  if (pasaDelLimite(intentosPorCorreo, email, INTENTOS_POR_CORREO_MAX, now)) {
    return { ok: false, error: "Demasiados intentos con este correo. Espera unos minutos y pide un código nuevo." };
  }

  const prueba = await verificarCodigo(email, codigo);
  if (prueba === "limite") {
    return { ok: false, error: "Hay demasiados intentos en este momento. Espera unos minutos y usa el mismo código." };
  }
  if (prueba === "invalido") {
    return {
      ok: false,
      error: "Código incorrecto o vencido. Usa el del correo MÁS RECIENTE, o pide uno nuevo.",
    };
  }

  const perfil = await leerPerfil({ id: prueba.userId });
  if (perfil === "error") return { ok: false, error: MSJ.generico };
  if (perfil && perfil.role !== "client") return { ok: false, error: MSJ.equipo };

  const { error: pwErr } = await guardarContrasenaVerificada(prueba.userId, password);
  if (pwErr) {
    const debil = pwErr.name === "AuthWeakPasswordError" || /password/i.test(pwErr.message);
    console.error("[portal] no se pudo guardar la contraseña —", pwErr.message);
    return {
      ok: false,
      error: debil
        ? "Esa contraseña no cumple los requisitos. Prueba una más larga, con letras y números."
        : MSJ.generico,
    };
  }

  if (esClienteAprobado(perfil)) return { ok: true, estado: "listo" };

  if (input.motivo === "solicitud") {
    const r = await crearSolicitud({ email, name, brand });
    return r.ok ? { ok: true, estado: "pendiente" } : r;
  }
  if (perfil && !perfil.active) return { ok: true, estado: "revocado" };
  return { ok: true, estado: (await tieneSolicitudPendiente(email)) ? "pendiente" : "sin-acceso" };
}

/**
 * Crea (o refresca) la SOLICITUD PENDIENTE y avisa a Pedro + admins — sólo después de
 * probar el correo. No da acceso: el acceso lo da un admin al APROBAR (clientes-actions).
 */
async function crearSolicitud(req: { email: string; name: string; brand: string | null }): Promise<AccionResult> {
  const db = supabaseAdmin();

  // Circuit-breaker global (durable): bajo un ataque distribuido deja de crear/avisar.
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  const { count: recientes } = await db
    .from("pending_invites")
    .select("*", { count: "exact", head: true })
    .gte("created_at", desde);
  if ((recientes ?? 0) >= GLOBAL_MAX) {
    return { ok: false, error: "Estamos recibiendo muchas solicitudes ahora mismo. Intenta más tarde." };
  }

  // El índice único parcial (lower(email) where status='pending') evita duplicados:
  // si ya hay una pendiente, la refrescamos en vez de acumular filas.
  let esNueva = true;
  const { error: insErr } = await db
    .from("pending_invites")
    .insert({ email: req.email, name: req.name, requested_brand: req.brand, status: "pending" });
  if (insErr) {
    if (insErr.code !== "23505") return { ok: false, error: "No se pudo enviar la solicitud. Intenta de nuevo." };
    esNueva = false; // ya había una pendiente con este correo
    await db
      .from("pending_invites")
      .update({ name: req.name, requested_brand: req.brand })
      .eq("email", req.email)
      .eq("status", "pending");
  }

  // Sólo se avisa a los admins en una solicitud NUEVA (un re-envío no re-bombardea).
  if (esNueva) {
    after(async () => {
      try {
        await notificarAdmins(req);
      } catch (e) {
        console.error("[portal] no se pudo avisar a los admins —", e);
      }
    });
  }
  return { ok: true };
}

/**
 * Después de que el NAVEGADOR entró (contraseña): ¿a dónde va? Sólo un cliente
 * aprobado y activo sigue — a su portal (o a `next` si cae dentro de él). Cualquier
 * otro caso cierra la sesión recién abierta y explica por qué (sin callejones).
 */
export async function destinoTrasEntrar(
  next?: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (next != null && typeof next !== "string") next = null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No se pudo iniciar sesión. Intenta de nuevo." };

  const salir = async (error: string) => {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false as const, error };
  };

  const perfil = await leerPerfil({ id: user.id });
  if (perfil === "error") return salir(MSJ.generico);
  // Misma regla que getCurrentUser: una contraseña sólo vale si pasó por el código.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (perfil && sesionConContrasena(session?.access_token) && !contrasenaPermitida(perfil.role, user.app_metadata)) {
    return salir(perfil.role === "client" ? MSJ.confirmarClave : MSJ.equipo);
  }
  if (esClienteAprobado(perfil)) {
    return { ok: true, url: destinoDentroDelPortal(next?.slice(0, 512), `/${perfil.slug}/portal`) };
  }
  if (perfil && perfil.role !== "client") return salir(MSJ.equipo);
  if (perfil && !perfil.active) return salir(MSJ.revocado);
  if (user.email && (await tieneSolicitudPendiente(user.email))) return salir(MSJ.pendiente);
  return salir(MSJ.sinAcceso);
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
