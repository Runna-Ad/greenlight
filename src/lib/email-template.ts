// Plantilla PURA del email de notificación (sin server, sin secretos) — para
// poder renderizarla en un test de node y reusarla desde el dispatcher.
//
// Email HTML de verdad: layout con TABLAS + estilos inline (los clientes de
// correo tiran flex/grid y el <style>), charset UTF-8 explícito (los acentos se
// rompen si no), y un CTA que lleva a DONDE está el trabajo, no a un genérico.

import { CLIENT_TYPES } from "./notif-routing.ts";

type TipoConfig = { chip: string; color: string; cta: string; darkChip?: boolean };

// Colores NEON por tipo (Pedro: "más visual, versión neón de cada uno"). Aprobada
// = verde señal (el token del logo, --greenlight #00e676): te dieron luz verde
// para avanzar. Su chip usa el trato del wordmark on-light (verde sobre pastilla
// oscura) para que BRILLE como el logo en vez de leerse plano — opción "A" de Pedro.
const TIPO: Record<string, TipoConfig> = {
  brief_created: { chip: "Nuevo brief", color: "#ff9e2c", cta: "Ver mis tareas" }, // ámbar neón
  task_submitted: { chip: "Lista para revisar", color: "#9d4edd", cta: "Revisar la tarea" }, // púrpura neón
  task_changes_requested: { chip: "Cambios pedidos", color: "#ff2d6f", cta: "Ver los cambios" }, // rosa-rojo neón
  task_approved: { chip: "Aprobada", color: "#00e676", cta: "Ver la tarea", darkChip: true }, // verde logo, brilla en pastilla oscura
  task_published: { chip: "Enviada al cliente", color: "#00c2ff", cta: "Ver la tarea" }, // azul neón
  client_access_request: { chip: "Solicitud de acceso", color: "#ff9e2c", cta: "Ver solicitudes" }, // ámbar neón
  client_invite: { chip: "Tu acceso está listo", color: "#00e676", cta: "Entrar a mi portal", darkChip: true }, // verde logo
  team_welcome: { chip: "Bienvenido al equipo", color: "#9d4edd", cta: "Ver mis tareas" }, // púrpura neón
  task_assigned: { chip: "Tarea asignada", color: "#9d4edd", cta: "Ver la tarea" }, // púrpura neón
  ready_for_review: { chip: "Lista para tu revisión", color: "#00c2ff", cta: "Abrir mi portal" }, // azul neón — al CLIENTE
  change_reply: { chip: "Respuesta", color: "#ff2d6f", cta: "Ver la conversación" }, // rosa-rojo: es de un cambio
  change_reply_client: { chip: "Te respondieron", color: "#00c2ff", cta: "Ver la respuesta" }, // azul: de cara al cliente
};
const DEFECTO: TipoConfig = { chip: "Aviso", color: "#9d4edd", cta: "Abrir en Greenlight" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Texto legible sobre un color neón: negro o blanco, el que más contraste dé
// (los tonos neón fallan con blanco; los oscuros con negro — se mide, no se adivina).
function relLum(hex: string): number {
  const n = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
}
function contrast(a: string, b: string): number {
  const [L1, L2] = [relLum(a), relLum(b)];
  const [hi, lo] = [Math.max(L1, L2), Math.min(L1, L2)];
  return (hi + 0.05) / (lo + 0.05);
}
/** Negro-tinta o blanco, el que sea más legible sobre `bg`. */
export function bestText(bg: string): string {
  return contrast(bg, "#15132b") >= contrast(bg, "#ffffff") ? "#15132b" : "#ffffff";
}

/** La versión de texto plano (para clientes que no muestran HTML). */
export function textFor(title: string, body: string | null, ctaUrl: string): string {
  return `${title}${body ? `\n\n${body}` : ""}\n\nAbrir en Greenlight: ${ctaUrl}`.trim();
}

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

function urlAbsoluta(url: string | null): string {
  if (!url) return APP_URL;
  // Una liga absoluta de OTRO dominio no sale en un correo: se queda su camino sobre Greenlight.
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      return u.origin === new URL(APP_URL).origin ? url : `${APP_URL}${u.pathname}${u.search}`;
    } catch {
      return APP_URL;
    }
  }
  return `${APP_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * A DÓNDE lleva el botón. Para avisos de una TAREA (entity 'idea'), directo a esa
 * tarea — el especialista cae sobre los pins rojos, no en el tablero. Para lo
 * demás (nuevo brief → /mi-trabajo), el url que ya trae el aviso. El slug se saca
 * del propio url (`/didi/tablero` → `didi`).
 */
export function ctaUrl(n: {
  url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  /** Aviso dirigido a un CLIENTE: su url ya apunta al portal y NO se reescribe a /tareas
   *  (no entra ahí — el proxy lo rebotaría al portal sin la tarea). Espeja la misma
   *  exclusión que hace la campana in-app (notification-actions). (reap 2026-09-02) */
  esCliente?: boolean;
}): string {
  if (!n.esCliente && n.entity_type === "idea" && n.entity_id && n.url) {
    const slug = n.url.split("/").filter(Boolean)[0];
    if (slug && slug !== "mi-trabajo") return urlAbsoluta(`/${slug}/tareas/${n.entity_id}`);
  }
  return urlAbsoluta(n.url);
}

/** El marco común de todo correo: cabecera Greenlight, franja de color, chip + título,
 *  el contenido, el botón y el pie (cliente o equipo). */
function marco(args: {
  color: string;
  chipStyle: string;
  chip: string;
  title: string;
  contenido: string;
  ctaUrl: string;
  ctaLabel: string;
  esCliente: boolean;
}): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f3fa;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fa;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e4e0f0;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="background:#2d2b55;padding:18px 26px;">
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">
          <span style="color:#00E676;">&#9679;</span>&nbsp;Greenlight</span>
        <span style="font-size:12px;color:#b4aee0;margin-left:8px;">by r&uuml;nna</span>
      </td></tr>
      <tr><td style="height:4px;background:${args.color};line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 28px 8px;">
        <span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;${args.chipStyle};padding:4px 11px;border-radius:999px;">${escapeHtml(args.chip)}</span>
        <h1 style="margin:14px 0 0;font-size:19px;line-height:1.35;color:#2d2b55;font-weight:700;">${escapeHtml(args.title)}</h1>
      </td></tr>
      ${args.contenido}
      <tr><td style="padding:22px 28px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:10px;background:#00E676;">
            <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#0c2b1c;text-decoration:none;border-radius:10px;">${escapeHtml(args.ctaLabel)} &rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 28px 24px;">
        <div style="border-top:1px solid #efeaf9;padding-top:14px;font-size:11px;line-height:1.55;color:#9a95bd;">
          ${
            args.esCliente
              ? `Recibes esto porque el equipo de <b style="color:#6f6b8d;">r&uuml;nna</b> te escribi&oacute; desde Greenlight.`
              : `Recibes esto porque trabajas en <b style="color:#6f6b8d;">Greenlight &middot; by r&uuml;nna</b>.
          Puedes desactivar los correos en /admin &#9656; Equipo.`
          }
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function estiloChip(color: string, dark: boolean): string {
  return dark ? `color:${color};background:#15132b` : `color:${bestText(color)};background:${color}`;
}

/**
 * El HTML del correo. Recibe el tipo (para el color/chip/etiqueta del botón), el
 * título y cuerpo ya listos, y la URL ABSOLUTA a la que lleva el botón.
 */
export function htmlFor(args: {
  type: string | null | undefined;
  title: string;
  body: string | null;
  ctaUrl: string;
  ctaLabel?: string;
  /** Chip en pastilla oscura con el color como TEXTO (trato del wordmark on-light). */
  darkChip?: boolean;
  colorOverride?: string;
}): string {
  const cfg = (args.type && TIPO[args.type]) || DEFECTO;
  const color = args.colorOverride ?? cfg.color;
  const body = args.body ? escapeHtml(args.body) : "";
  return marco({
    color,
    chipStyle: estiloChip(color, args.darkChip ?? cfg.darkChip ?? false),
    chip: cfg.chip,
    title: args.title,
    contenido: body ? `<tr><td style="padding:14px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#f7f5fc;border-left:3px solid ${color};border-radius:6px;padding:12px 14px;font-size:14px;line-height:1.55;color:#4a4770;">${body}</td>
        </tr></table>
      </td></tr>` : "",
    ctaUrl: args.ctaUrl,
    ctaLabel: args.ctaLabel ?? cfg.cta,
    esCliente: CLIENT_TYPES.has(args.type ?? ""),
  });
}

// ── Correo AGRUPADO (0084) ───────────────────────────────────────────────────
// Varios avisos a la misma persona dentro de la ventana de 10 minutos salen en uno.

/** Un aviso dentro del correo agrupado. `ctaUrl` ya es ABSOLUTA (`ctaUrl()`). */
export type AvisoAgrupado = { type: string | null; title: string; body: string | null; ctaUrl: string };

/** Cuántos avisos se listan; del resto sólo se dice cuántos más hay. */
export const MAX_AVISOS_EN_CORREO = 25;

// El asunto cuando todos son del mismo tipo: "5 piezas listas para tu revisión".
const PLURAL: Record<string, string> = {
  ready_for_review: "piezas listas para tu revisión",
  change_reply_client: "respuestas del equipo a tus cambios",
  task_assigned: "tareas nuevas asignadas",
  brief_created: "briefs nuevos",
  task_submitted: "tareas listas para revisar",
  task_changes_requested: "tareas con cambios pedidos",
  task_approved: "tareas aprobadas",
  task_published: "tareas enviadas al cliente",
  change_reply: "respuestas en cambios",
};

export function asuntoAgrupado(avisos: AvisoAgrupado[], esCliente: boolean): string {
  const n = avisos.length;
  const tipos = new Set(avisos.map((a) => a.type ?? ""));
  const plural = tipos.size === 1 ? PLURAL[[...tipos][0]] : undefined;
  if (plural) return `${n} ${plural}`;
  return esCliente ? `Tienes ${n} novedades en Greenlight` : `${n} avisos nuevos en Greenlight`;
}

/** El botón principal del agrupado: al cliente, su portal (sin la tarea de la liga); al
 *  equipo, Mi trabajo. Cada aviso trae además su propia liga. */
export function ctaAgrupado(avisos: AvisoAgrupado[], esCliente: boolean): string {
  if (esCliente && avisos[0]) {
    // Sólo el CAMINO de la liga guardada; el dominio siempre es el de Greenlight.
    try {
      return urlAbsoluta(new URL(avisos[0].ctaUrl).pathname);
    } catch {
      return urlAbsoluta(null);
    }
  }
  return urlAbsoluta("/mi-trabajo");
}

export function htmlAgrupado(args: { avisos: AvisoAgrupado[]; esCliente: boolean }): string {
  const { avisos, esCliente } = args;
  const tipos = new Set(avisos.map((a) => a.type ?? ""));
  const unTipo = tipos.size === 1 ? TIPO[[...tipos][0]] : undefined;
  const color = unTipo?.color ?? DEFECTO.color;
  const visibles = avisos.slice(0, MAX_AVISOS_EN_CORREO);
  const resto = avisos.length - visibles.length;

  const filas = visibles
    .map((a) => {
      const cfg = (a.type && TIPO[a.type]) || DEFECTO;
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #efeaf9;">
          <span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;${estiloChip(cfg.color, cfg.darkChip ?? false)};padding:2px 8px;border-radius:999px;">${escapeHtml(cfg.chip)}</span>
          <div style="margin-top:6px;font-size:14px;line-height:1.45;font-weight:700;color:#2d2b55;">${escapeHtml(a.title)}</div>
          ${a.body ? `<div style="margin-top:4px;font-size:13px;line-height:1.5;color:#4a4770;">${escapeHtml(a.body)}</div>` : ""}
          <a href="${escapeHtml(a.ctaUrl)}" style="display:inline-block;margin-top:6px;font-size:13px;font-weight:700;color:#5b3fc4;text-decoration:none;">${escapeHtml(cfg.cta)} &rarr;</a>
        </td></tr>`;
    })
    .join("\n        ");

  return marco({
    color,
    chipStyle: estiloChip(color, unTipo?.darkChip ?? false),
    chip: esCliente ? `${avisos.length} novedades` : `${avisos.length} avisos`,
    title: asuntoAgrupado(avisos, esCliente),
    contenido: `<tr><td style="padding:6px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${filas}
        ${resto > 0 ? `<tr><td style="padding:12px 0;font-size:13px;color:#6f6b8d;">Y ${resto} m&aacute;s: est&aacute;n en ${esCliente ? "tu portal" : "Greenlight"}, con el bot&oacute;n de abajo.</td></tr>` : ""}
        </table>
      </td></tr>`,
    ctaUrl: ctaAgrupado(avisos, esCliente),
    ctaLabel: esCliente ? "Abrir mi portal" : "Abrir Greenlight",
    esCliente,
  });
}

/** La versión de texto plano del agrupado. */
export function textAgrupado(avisos: AvisoAgrupado[], esCliente: boolean): string {
  const visibles = avisos.slice(0, MAX_AVISOS_EN_CORREO);
  const resto = avisos.length - visibles.length;
  const lineas = visibles.map((a) => `• ${a.title}${a.body ? `\n  ${a.body}` : ""}\n  ${a.ctaUrl}`);
  return [
    asuntoAgrupado(avisos, esCliente),
    "",
    ...lineas,
    ...(resto > 0 ? ["", `Y ${resto} más: están en ${esCliente ? "tu portal" : "Greenlight"}.`] : []),
    "",
    `Abrir en Greenlight: ${ctaAgrupado(avisos, esCliente)}`,
  ].join("\n");
}
