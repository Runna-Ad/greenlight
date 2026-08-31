// Plantilla PURA del email de notificación (sin server, sin secretos) — para
// poder renderizarla en un test de node y reusarla desde el dispatcher.
//
// Email HTML de verdad: layout con TABLAS + estilos inline (los clientes de
// correo tiran flex/grid y el <style>), charset UTF-8 explícito (los acentos se
// rompen si no), y un CTA que lleva a DONDE está el trabajo, no a un genérico.

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
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * A DÓNDE lleva el botón. Para avisos de una TAREA (entity 'idea'), directo a esa
 * tarea — el especialista cae sobre los pins rojos, no en el tablero. Para lo
 * demás (nuevo brief → /mi-trabajo), el url que ya trae el aviso. El slug se saca
 * del propio url (`/didi/tablero` → `didi`).
 */
export function ctaUrl(n: { url: string | null; entity_type: string | null; entity_id: string | null }): string {
  if (n.entity_type === "idea" && n.entity_id && n.url) {
    const slug = n.url.split("/").filter(Boolean)[0];
    if (slug && slug !== "mi-trabajo") return urlAbsoluta(`/${slug}/tareas/${n.entity_id}`);
  }
  return urlAbsoluta(n.url);
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
  const cta = args.ctaLabel ?? cfg.cta;
  const color = args.colorOverride ?? cfg.color;
  const dark = args.darkChip ?? cfg.darkChip ?? false;
  const chipStyle = dark
    ? `color:${color};background:#15132b`
    : `color:${bestText(color)};background:${color}`;
  const title = escapeHtml(args.title);
  const body = args.body ? escapeHtml(args.body) : "";

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
      <tr><td style="height:4px;background:${color};line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:26px 28px 8px;">
        <span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;${chipStyle};padding:4px 11px;border-radius:999px;">${escapeHtml(cfg.chip)}</span>
        <h1 style="margin:14px 0 0;font-size:19px;line-height:1.35;color:#2d2b55;font-weight:700;">${title}</h1>
      </td></tr>
      ${body ? `<tr><td style="padding:14px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#f7f5fc;border-left:3px solid ${color};border-radius:6px;padding:12px 14px;font-size:14px;line-height:1.55;color:#4a4770;">${body}</td>
        </tr></table>
      </td></tr>` : ""}
      <tr><td style="padding:22px 28px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border-radius:10px;background:#00E676;">
            <a href="${escapeHtml(args.ctaUrl)}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#0c2b1c;text-decoration:none;border-radius:10px;">${escapeHtml(cta)} &rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 28px 24px;">
        <div style="border-top:1px solid #efeaf9;padding-top:14px;font-size:11px;line-height:1.55;color:#9a95bd;">
          Recibes esto porque trabajas en <b style="color:#6f6b8d;">Greenlight &middot; by r&uuml;nna</b>.
          Puedes desactivar los correos en /admin &#9656; Equipo.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
