import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { descifrarToken } from "@/lib/slack-cifrado";
import { errorTokenSlack, type ConexionSlack } from "@/lib/slack-routing";

/** Tiempo máximo por llamada a Slack. */
const TIMEOUT_MS = 5_000;

export type RespuestaSlack = { ok: boolean; error?: string; retryAfterMs?: number; [k: string]: unknown };

/** ¿Está conectado el bot al Slack de Runna? (SLACK_BOT_TOKEN en Vercel, xoxb-…) */
export function hasSlack(): boolean {
  return !!process.env.SLACK_BOT_TOKEN?.trim();
}

/** Llama a un método de la API de Slack. Nunca lanza: un fallo de red vuelve como error. */
export async function slackApi(
  token: string | null, metodo: string, cuerpo: Record<string, unknown>, json = true,
): Promise<RespuestaSlack> {
  try {
    const headers: Record<string, string> = json
      ? { "Content-Type": "application/json; charset=utf-8" }
      : { "Content-Type": "application/x-www-form-urlencoded" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://slack.com/api/${metodo}`, {
      method: "POST",
      headers,
      body: json
        ? JSON.stringify(cuerpo)
        : new URLSearchParams(Object.entries(cuerpo).map(([k, v]) => [k, String(v)])).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) {
      const seg = Number(res.headers.get("retry-after"));
      return { ok: false, error: "ratelimited", retryAfterMs: Number.isFinite(seg) && seg > 0 ? seg * 1000 : 60_000 };
    }
    return (await res.json()) as RespuestaSlack;
  } catch (e) {
    return { ok: false, error: `red: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// El espacio (team id) del token de Runna, preguntado una vez por proceso (auth.test). Sólo se
// guarda un resultado BUENO: si Slack tropezó, se vuelve a preguntar en la siguiente corrida.
const teamDeToken = new Map<string, string | null>();

/** Desinstala el bot de un espacio (auth.revoke). Mejor esfuerzo: si falla, sólo se registra. */
export async function revocarToken(token: string): Promise<void> {
  const r = await slackApi(token, "auth.revoke", {}, false);
  if (!r.ok) console.error("[slack] no se pudo revocar el token de un espacio:", r.error);
}

/** El espacio de Slack de Runna (para no conectar ese mismo espacio como si fuera de un cliente). */
export async function teamDeRunna(): Promise<{ teamId: string | null; tropiezo?: string; retryAfterMs?: number }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { teamId: null };
  if (!teamDeToken.has(token)) {
    const r = await slackApi(token, "auth.test", {});
    if (!r.ok) {
      if (errorTokenSlack(r.error)) console.error("[slack] EL TOKEN DE SLACK DE RUNNA NO SIRVE, no salen DMs:", r.error);
      return { teamId: null, tropiezo: r.error ?? "error desconocido", retryAfterMs: r.retryAfterMs };
    }
    teamDeToken.set(token, typeof r.team_id === "string" ? r.team_id : null);
  }
  return { teamId: teamDeToken.get(token) ?? null };
}

export type ConexionesSlack = {
  cons: ConexionSlack[];
  /** El Slack de Runna no contestó (no es que el token esté mal): lo del equipo se reintenta. */
  runnaTropiezo?: { error: string; retryAfterMs?: number };
};

/**
 * Las conexiones del bot: el Slack de Runna (equipo, SLACK_BOT_TOKEN) y cada espacio de
 * cliente conectado con «Add to Slack» (token cifrado en slack_conexiones). Un token de
 * cliente que no se puede descifrar (llave cambiada) se avisa y se deja fuera.
 */
export async function conexionesSlack(): Promise<ConexionesSlack> {
  const cons: ConexionSlack[] = [];
  let runnaTropiezo: ConexionesSlack["runnaTropiezo"];
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (token) {
    const t = await teamDeRunna();
    if (t.tropiezo) runnaTropiezo = { error: t.tropiezo, retryAfterMs: t.retryAfterMs };
    else cons.push({ teamId: t.teamId, token, clienteId: null });
  }
  const llave = process.env.SLACK_TOKEN_KEY?.trim();
  if (hasSupabase() && llave) {
    const { data, error } = await supabaseAdmin()
      .from("slack_conexiones")
      .select("team_id, client_id, token_cifrado")
      .eq("active", true);
    if (error) console.error("[slack] no se pudieron leer las conexiones de clientes:", error.message);
    for (const c of (data ?? []) as { team_id: string; client_id: string; token_cifrado: string }[]) {
      const tk = descifrarToken(c.token_cifrado, llave, c.team_id);
      if (!tk) { console.error("[slack] no se pudo descifrar la conexión de", c.team_id, "(¿cambió SLACK_TOKEN_KEY?)"); continue; }
      cons.push({ teamId: c.team_id, token: tk, clienteId: c.client_id });
    }
  }
  return { cons, runnaTropiezo };
}
