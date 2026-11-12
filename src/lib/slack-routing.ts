// Lógica PURA del bot de Slack «Greenlight» (sin server, testeable).
// Mismas compuertas que el correo (notif-routing): el EVENTO le toca a la persona y la
// persona tiene Slack encendido. Slack sigue la MISMA elección por evento que el correo
// (Mi perfil ▸ «Qué me llega por correo y Slack»): no hay una segunda matriz que mantener.

import { tipoEmailea } from "./notif-routing.ts";

/** Un aviso más viejo que esto ya no se manda por Slack (evita una avalancha de DMs
 *  viejos el día que se conecta el bot, o tras una caída larga). */
export const SLACK_MAX_EDAD_MS = 24 * 60 * 60_000;

export type DecisionSlack =
  | { enviar: true; buscarPorCorreo: boolean }
  | { enviar: false; razon: string };

/**
 * ¿Se manda DM de Slack para esta entrega?
 * Sólo a gente del EQUIPO (fila en track_members): los clientes no están en el Slack de Runna.
 * `buscarPorCorreo` = no sabemos su Slack todavía, pero tiene correo: el bot lo busca.
 */
export function decisionSlack(args: {
  type: string | null | undefined;
  esDelEquipo: boolean;
  notifySlack: boolean;
  slackUserId: string | null | undefined;
  email: string | null | undefined;
  /** Preferencia por-evento de la persona (notification_prefs.email). undefined = sin fila → default. */
  eventPref?: boolean | null;
  /** El aviso es de una tarea SUYA (recipient_member_id lleno): siempre le llega. */
  esMiTarea?: boolean;
  creadoEn: string;
  ahora: number;
}): DecisionSlack {
  if (!args.esDelEquipo) return { enviar: false, razon: "no es del equipo" };
  const toca = args.esMiTarea ? true : args.eventPref ?? tipoEmailea(args.type);
  if (!toca) return { enviar: false, razon: "evento no avisa (pref/def)" };
  if (!args.notifySlack) return { enviar: false, razon: "persona desactivó Slack" };
  const creado = Date.parse(args.creadoEn);
  if (Number.isFinite(creado) && args.ahora - creado > SLACK_MAX_EDAD_MS) {
    return { enviar: false, razon: "aviso de hace más de 1 día" };
  }
  if (args.slackUserId?.trim()) return { enviar: true, buscarPorCorreo: false };
  if (args.email?.trim()) return { enviar: true, buscarPorCorreo: true };
  return { enviar: false, razon: "sin Slack ni correo" };
}

export type ConexionSlack = { teamId: string | null; token: string };

/**
 * Qué conexión (qué espacio de Slack) usa una persona. Su `slack_team_id` null = el espacio
 * de Runna, que es la primera conexión. Con un team id que no tenemos conectado → null
 * (no se le manda nada; mejor que mandarlo por el espacio equivocado).
 */
export function elegirConexion(teamId: string | null | undefined, conexiones: ConexionSlack[]): ConexionSlack | null {
  if (!conexiones.length) return null;
  if (!teamId) return conexiones[0];
  return conexiones.find((c) => c.teamId === teamId) ?? null;
}

/** Un member ID de Slack de una PERSONA (U… o W…). Un canal (C…, G…) no: el aviso privado
 *  de alguien terminaría publicado en un canal. */
export function esSlackUserId(v: string): boolean {
  return /^[UW][A-Z0-9]{6,}$/.test(v);
}

/** Lo que devolvió users.lookupByEmail ¿es una persona real de ESTE espacio? Una cuenta
 *  borrada, un bot o alguien de otro espacio (Slack Connect) no se acepta. */
export function usuarioSlackValido(user: unknown, teamId: string | null): boolean {
  if (!user || typeof user !== "object") return false;
  const u = user as { id?: unknown; deleted?: unknown; is_bot?: unknown; team_id?: unknown };
  if (typeof u.id !== "string" || !esSlackUserId(u.id)) return false;
  if (u.deleted === true || u.is_bot === true) return false;
  if (teamId && typeof u.team_id === "string" && u.team_id !== teamId) return false;
  return true;
}

/** El token del bot está mal (no es que Slack haya tropezado). */
const ERRORES_DE_TOKEN = new Set([
  "invalid_auth", "not_authed", "account_inactive", "token_revoked", "token_expired",
  "missing_scope", "no_permission", "team_access_not_granted",
]);
export function errorTokenSlack(error: string | null | undefined): boolean {
  return !!error && ERRORES_DE_TOKEN.has(error);
}

/** Errores de Slack que no se arreglan reintentando (la persona, el mensaje o el token). */
const ERRORES_PERMANENTES = new Set([
  ...ERRORES_DE_TOKEN,
  "user_not_found", "users_not_found", "channel_not_found", "user_disabled", "cannot_dm_bot",
  "invalid_blocks", "msg_too_long", "invalid_arguments", "no_text",
]);
export function errorSlackPermanente(error: string | null | undefined): boolean {
  return !!error && ERRORES_PERMANENTES.has(error);
}

/** Slack interpreta &, < y > en el texto (menciones, ligas): se escapan. */
export function escaparSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Por caracteres reales (Array.from), para no partir un emoji a la mitad.
const recortar = (s: string, max: number) => {
  const cs = Array.from(s);
  return cs.length > max ? `${cs.slice(0, max - 1).join("")}…` : s;
};

/**
 * El DM: el título como encabezado, la línea del aviso y un botón a donde está el trabajo.
 * Título y línea van en texto PLANO: lo que escribe un cliente no puede volverse negritas,
 * ligas ni menciones. `text` es lo que sale en la notificación del teléfono.
 * Slack rechaza encabezados de más de 150 caracteres y secciones de más de 3000.
 */
export function mensajeSlack(args: { title: string; body: string | null; ctaUrl: string }): {
  text: string;
  blocks: unknown[];
} {
  const title = args.title.trim() || "Aviso de Greenlight";
  const body = args.body?.trim() ?? "";
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: recortar(title, 150), emoji: false } },
  ];
  if (body) blocks.push({ type: "section", text: { type: "plain_text", text: recortar(body, 2900), emoji: false } });
  // Slack rechaza el mensaje ENTERO si el botón lleva una liga que no es http(s) (p. ej. sin
  // APP_URL la liga sale relativa): mejor el aviso sin botón que ningún aviso.
  if (/^https?:\/\//i.test(args.ctaUrl) && args.ctaUrl.length <= 2000) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Abrir en Greenlight", emoji: false },
          url: args.ctaUrl,
          style: "primary",
        },
      ],
    });
  }
  // Se recorta ANTES de escapar: así el corte nunca cae a la mitad de un "&amp;".
  return { text: escaparSlack(recortar(body ? `${title}: ${body}` : title, 2500)), blocks };
}
