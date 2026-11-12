import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { hasSlack, slackApi, teamDeRunna } from "@/lib/slack-api";
import { cifrarToken, llaveValida } from "@/lib/slack-cifrado";
import { SLACK_SCOPES } from "@/lib/slack-routing";
import { escapeHtml } from "@/lib/email-template";

export const dynamic = "force-dynamic";

/**
 * Regreso de «Add to Slack». El admin del cliente abre la liga que generó un admin de Runna
 * (Admin ▸ Integraciones), elige su espacio y da Permitir; Slack lo manda aquí con un `code`
 * y el `state` (el id de la instalación, de un solo uso, 7 días). Sin sesión de Greenlight.
 * La conexión queda PENDIENTE: no recibe ningún aviso hasta que un admin de Runna vea el
 * nombre del espacio en Integraciones y la apruebe (una liga reenviada no basta).
 * El token se guarda CIFRADO.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error")) return pagina("Se canceló la instalación", "No se conectó nada. Puedes cerrar esta pestaña.");
  if (!code || !/^[0-9a-f-]{36}$/i.test(state)) return pagina("Liga inválida", "Pide a Rünna una liga nueva.", 400);

  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const secreto = process.env.SLACK_CLIENT_SECRET?.trim();
  const llave = process.env.SLACK_TOKEN_KEY?.trim();
  if (!hasSupabase() || !clientId || !secreto || !llaveValida(llave) || !hasSlack()) {
    console.error("[slack-oauth] falta configurar SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_TOKEN_KEY (32 bytes) o SLACK_BOT_TOKEN");
    return pagina("Greenlight no está listo", "Avisa a Rünna: falta configurar la conexión con Slack.", 500);
  }
  const db = supabaseAdmin();

  // Se aparta la liga ANTES de hablar con Slack: dos clics a la vez no conectan dos veces.
  const { data: inst, error: instErr } = await db
    .from("slack_instalaciones")
    .update({ usado_at: new Date().toISOString() })
    .eq("id", state).is("usado_at", null).gt("expira_at", new Date().toISOString())
    .select("id, client_id, creado_por, redirect_uri")
    .maybeSingle<{ id: string; client_id: string; creado_por: string | null; redirect_uri: string }>();
  if (instErr) console.error("[slack-oauth] no se pudo leer la instalación:", instErr.message);
  if (!inst) return pagina("Esta liga ya se usó o venció", "Pide a Rünna una liga nueva.", 400);
  const liberar = async () => {
    const { error } = await db.from("slack_instalaciones").update({ usado_at: null }).eq("id", inst.id);
    if (error) console.error("[slack-oauth] no se pudo liberar la liga:", error.message);
  };
  const noSePudo = async (detalle: string, status = 400) => {
    console.error("[slack-oauth]", detalle);
    await liberar();
    // Un solo mensaje para todo lo que no se pudo: la página es pública, no cuenta detalles.
    return pagina("No se pudo conectar", "Intenta otra vez con la misma liga o pide ayuda a Rünna.", status);
  };

  try {
    const { data: cli } = await db.from("clients").select("id").eq("id", inst.client_id).eq("active", true).maybeSingle();
    if (!cli) return await noSePudo("el cliente de la liga ya no está activo");

    // El mismo regreso que se puso en la liga (Slack lo exige igual).
    const r = await slackApi(null, "oauth.v2.access", {
      client_id: clientId, client_secret: secreto, code, redirect_uri: inst.redirect_uri,
    }, false);
    const team = r.team as { id?: string; name?: string } | undefined;
    const token = typeof r.access_token === "string" ? r.access_token : "";
    if (!r.ok || !team?.id || !token.startsWith("xoxb-")) return await noSePudo(`Slack no entregó el token: ${r.error ?? "sin error"}`, 502);
    if (!/^T[A-Z0-9]{6,}$/.test(team.id)) return await noSePudo(`team id inesperado: ${team.id.slice(0, 20)}`);
    if (r.is_enterprise_install === true) return await noSePudo("instalación de organización completa (Enterprise Grid), no de un espacio");
    const permisos = new Set(String(r.scope ?? "").split(",").map((s) => s.trim()));
    if (SLACK_SCOPES.some((s) => !permisos.has(s))) return await noSePudo(`faltan permisos: ${String(r.scope ?? "")}`);

    // El Slack de Runna ya está conectado aparte (es del equipo): nunca se ata a un cliente.
    // Si no se pudo saber cuál es, no se arriesga.
    const runna = await teamDeRunna();
    if (runna.tropiezo || !runna.teamId) return await noSePudo(`no se pudo confirmar el espacio de Runna: ${runna.tropiezo ?? "sin team id"}`, 503);
    if (runna.teamId === team.id) return await noSePudo("eligieron el Slack de Runna");

    // Un espacio por cliente y un cliente por espacio: para cambiarlo, primero se desconecta.
    const { data: previas } = await db.from("slack_conexiones").select("team_id, client_id")
      .or(`team_id.eq.${team.id},client_id.eq.${inst.client_id}`);
    const choca = ((previas ?? []) as { team_id: string; client_id: string }[])
      .some((p) => p.team_id !== team.id || p.client_id !== inst.client_id);
    if (choca) return await noSePudo("el espacio o el cliente ya tienen otra conexión");

    const { error: upErr } = await db.from("slack_conexiones").upsert({
      team_id: team.id,
      team_name: team.name ?? null,
      client_id: inst.client_id,
      bot_user_id: typeof r.bot_user_id === "string" ? r.bot_user_id : null,
      token_cifrado: cifrarToken(token, llave!, team.id),
      instalado_por: inst.creado_por,
      // Reinstalar el mismo espacio vuelve a pedir la aprobación de Runna.
      active: false, aprobado_por: null, aprobado_at: null,
    }, { onConflict: "team_id" });
    if (upErr) return await noSePudo(`no se pudo guardar la conexión: ${upErr.message}`, 500);
    await db.from("slack_instalaciones").update({ team_id: team.id }).eq("id", inst.id);
    return pagina("Listo", `Greenlight quedó instalado en ${team.name ?? "tu espacio de Slack"}. Rünna lo activa en cuanto lo revise. Ya puedes cerrar esta pestaña.`);
  } catch (e) {
    return await noSePudo(`reventó: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
}

function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Greenlight · Slack</title><style>body{font-family:system-ui,sans-serif;background:#f6f5fb;color:#1a1530;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{background:#fff;border:1px solid #e4e0f0;border-radius:12px;padding:28px;max-width:420px}h1{font-size:20px;margin:0 0 8px}p{margin:0;line-height:1.5}</style></head><body><main><h1>${escapeHtml(titulo)}</h1><p>${escapeHtml(texto)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
