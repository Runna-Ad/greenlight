import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { ctaUrl } from "@/lib/email-template";
import {
  decisionSlack, elegirConexion, errorSlackPermanente, errorTokenSlack, esSlackUserId, mensajeSlack, usuarioSlackValido,
  type ConexionSlack,
} from "@/lib/slack-routing";

export type SlackDispatchResult = { sent: number; skipped: number; failed: number; held: number; sinConfig?: boolean };

/** Tras un tropiezo de Slack con un DM, se reintenta en 5 min; al 3er fallo, 'failed'. */
const REINTENTO_MS = 5 * 60_000;
const MAX_INTENTOS = 3;
/** La ruta corre hasta 60 s (maxDuration): a los 45 s lo que falta se devuelve a la cola. */
const PLAZO_MS = 45_000;
/** Tiempo máximo por llamada a Slack. */
const TIMEOUT_MS = 5_000;
/** Quien no está en Slack no se vuelve a buscar en un rato (Slack limita las búsquedas). */
const NO_ENCONTRADO_MS = 6 * 60 * 60_000;

/** ¿Está conectado el bot? (el token lo pone Pedro en Vercel: SLACK_BOT_TOKEN, xoxb-…) */
export function hasSlack(): boolean {
  return !!process.env.SLACK_BOT_TOKEN?.trim();
}

type RespuestaSlack = { ok: boolean; error?: string; retryAfterMs?: number; [k: string]: unknown };

/** Slack caído, nos frenó, o la app perdió un permiso: no es culpa del aviso ni de la persona.
 *  Todo vuelve a la cola (un permiso que se arregla después no debe haber tirado avisos). */
const TROPIEZOS_GENERALES = new Set([
  "ratelimited", "service_unavailable", "internal_error", "fatal_error", "request_timeout",
  "team_added_to_org", "missing_scope", "invalid_auth", "not_authed", "token_revoked",
  "token_expired", "account_inactive", "no_permission", "team_access_not_granted",
]);
const esTropiezoGeneral = (error: string | undefined) =>
  !!error && (TROPIEZOS_GENERALES.has(error) || error.startsWith("red:"));

/** Llama a un método de la API de Slack. Nunca lanza: un fallo de red vuelve como error. */
async function slackApi(token: string, metodo: string, cuerpo: Record<string, unknown>, json = true): Promise<RespuestaSlack> {
  try {
    const res = await fetch(`https://slack.com/api/${metodo}`, {
      method: "POST",
      headers: json
        ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" }
        : { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
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

// El espacio (team id) de cada token, preguntado una vez por proceso (auth.test). Sólo se
// guarda un resultado BUENO: si Slack tropezó, se vuelve a preguntar en la siguiente corrida.
const teamDeToken = new Map<string, string | null>();
// Quien no está en Slack (por correo), para no buscarlo en cada movimiento de la app.
const noEncontradoHasta = new Map<string, number>();

/**
 * Las conexiones del bot. Hoy una: el Slack de Runna (SLACK_BOT_TOKEN). Si DiDi aprueba la
 * app, su conexión se agrega aquí (la persona usa la de SU espacio, ver elegirConexion).
 * `tropiezo` = Slack no contestó (no es que el token esté mal): hay que reintentar.
 */
async function conexiones(): Promise<{ cons: ConexionSlack[]; tropiezo?: string; retryAfterMs?: number }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) return { cons: [] };
  if (!teamDeToken.has(token)) {
    const r = await slackApi(token, "auth.test", {});
    if (!r.ok) {
      if (errorTokenSlack(r.error)) console.error("[notif-slack] EL TOKEN DE SLACK NO SIRVE, no salen DMs:", r.error);
      return { cons: [], tropiezo: r.error ?? "error desconocido", retryAfterMs: r.retryAfterMs };
    }
    teamDeToken.set(token, typeof r.team_id === "string" ? r.team_id : null);
  }
  return { cons: [{ teamId: teamDeToken.get(token) ?? null, token }] };
}

/**
 * Drena la cola de Slack y manda un DM por aviso a cada persona del equipo. Se llama junto
 * con el de correos (despacharAvisos) después de cada cambio de estado, y desde el reloj.
 *
 * Reclamo atómico (`rpc_reclamar_slack`, SKIP LOCKED): dos drenados a la vez no mandan el
 * mismo DM dos veces. Sin token NO se reclama nada (otra copia de la app, p. ej. una preview,
 * no le roba los avisos a la que sí tiene el bot).
 *
 * Límite conocido: si Slack sí entregó el DM pero la respuesta se perdió (tiempo agotado),
 * se reintenta y la persona puede recibirlo dos veces. Slack no ofrece cómo evitarlo; igual
 * que en el correo, preferimos un raro doble a uno que nunca sale.
 */
export async function dispatchPendingSlack(limit = 50): Promise<SlackDispatchResult> {
  const vacio = { sent: 0, skipped: 0, failed: 0, held: 0 };
  if (!hasSupabase()) return vacio;
  if (!hasSlack()) return { ...vacio, sinConfig: true };
  const inicio = Date.now();
  const db = supabaseAdmin();

  const { data: claimed, error: claimErr } = await db.rpc("rpc_reclamar_slack", { p_limit: limit });
  if (claimErr) {
    console.error("[notif-slack] no se pudo reclamar la cola:", claimErr.message);
    return vacio;
  }
  const rows = (claimed ?? []) as { id: string; notification_id: string; created_at: string; intentos: number }[];
  if (!rows.length) return vacio;

  const marcar = async (ids: string[], patch: Record<string, unknown>) => {
    if (!ids.length) return;
    const { error } = await db.from("notification_deliveries").update(patch).in("id", ids);
    if (error) console.error(`[notif-slack] no se pudo marcar ${ids.length} como ${String(patch.status)}:`, error.message);
  };
  // Devolver a la cola SIN gastar un intento (no fue culpa del aviso).
  const soltar = (ids: string[], enMs: number) =>
    marcar(ids, { status: "pending", claimed_at: null, not_before: new Date(Date.now() + enMs).toISOString() });
  const todos = rows.map((r) => r.id);

  // Token malo o Slack sin contestar: nada se tira. Todo vuelve a la cola (un token malo, en
  // 15 min; lo que pase de 1 día se salta solo cuando el bot vuelva a funcionar).
  const { cons, tropiezo, retryAfterMs } = await conexiones();
  if (tropiezo || !cons.length) {
    const enMs = errorTokenSlack(tropiezo) ? 15 * 60_000 : retryAfterMs ?? 60_000;
    console.error(`[notif-slack] sin conexión a Slack, se reintenta en ${Math.round(enMs / 1000)} s:`, tropiezo);
    await soltar(todos, enMs);
    return { ...vacio, held: todos.length };
  }

  const notifIds = [...new Set(rows.map((r) => r.notification_id))];
  const { data: notifs, error: notifErr } = await db
    .from("notifications")
    .select("id, type, title, body, url, entity_type, entity_id, recipient_member_id, recipient_id")
    .in("id", notifIds);
  if (notifErr) {
    console.error("[notif-slack] no se pudieron leer los avisos:", notifErr.message);
    await soltar(todos, 60_000);
    return { ...vacio, held: todos.length };
  }
  type Notif = {
    id: string; type: string | null; title: string; body: string | null; url: string | null;
    entity_type: string | null; entity_id: string | null;
    recipient_member_id: string | null; recipient_id: string | null;
  };
  const notifById = new Map<string, Notif>(((notifs ?? []) as Notif[]).map((n) => [n.id, n]));

  // Quién recibe: el aviso va a un member (tarea suya) o a un profile (por rol). En los dos
  // casos manda la fila del EQUIPO (track_members): ahí viven Slack, su interruptor y su correo.
  type Member = {
    id: string; email: string | null; notify_slack: boolean; profile_id: string | null;
    slack_user_id: string | null; slack_team_id: string | null; active: boolean;
  };
  const cols = "id, email, notify_slack, profile_id, slack_user_id, slack_team_id, active";
  const memberIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_id).filter(Boolean))] as string[];
  const [membersRes, rosterRes] = await Promise.all([
    memberIds.length
      ? db.from("track_members").select(cols).in("id", memberIds)
      : Promise.resolve({ data: [] as Member[], error: null }),
    profileIds.length
      ? db.from("track_members").select(cols).in("profile_id", profileIds).eq("active", true).order("id")
      : Promise.resolve({ data: [] as Member[], error: null }),
  ]);
  const memberById = new Map(((membersRes.data ?? []) as Member[]).map((m) => [m.id, m]));
  // Un profile con varias filas activas: gana la primera por id (siempre la misma).
  const memberByProfile = new Map<string, Member>();
  for (const m of (rosterRes.data ?? []) as Member[]) {
    if (m.profile_id && !memberByProfile.has(m.profile_id)) memberByProfile.set(m.profile_id, m);
  }
  const miembroDe = (n: Notif): Member | null =>
    n.recipient_member_id ? memberById.get(n.recipient_member_id) ?? null
    : n.recipient_id ? memberByProfile.get(n.recipient_id) ?? null
    : null;

  // El correo para buscar a la persona en Slack: el de su LOGIN (Google, verificado) si tiene;
  // si no, el que escribió un admin en Equipo.
  const perfilesDeMiembros = [...new Set(
    [...memberById.values(), ...memberByProfile.values()].map((m) => m.profile_id).filter(Boolean),
  )] as string[];
  // Misma elección por evento que el correo (notification_prefs.email).
  const prefProfileIds = [...new Set([...profileIds, ...perfilesDeMiembros])];
  const [perfilesRes, prefsRes] = await Promise.all([
    perfilesDeMiembros.length
      ? db.from("profiles").select("id, email").in("id", perfilesDeMiembros)
      : Promise.resolve({ data: [] as { id: string; email: string | null }[], error: null }),
    prefProfileIds.length
      ? db.from("notification_prefs").select("profile_id, event_type, email").in("profile_id", prefProfileIds)
      : Promise.resolve({ data: [] as { profile_id: string; event_type: string; email: boolean }[], error: null }),
  ]);
  const lecturaFallida = membersRes.error ?? rosterRes.error ?? perfilesRes.error ?? prefsRes.error;
  if (lecturaFallida) {
    console.error("[notif-slack] no se pudieron leer destinatarios/preferencias:", lecturaFallida.message);
    await soltar(todos, 60_000);
    return { ...vacio, held: todos.length };
  }
  const emailDePerfil = new Map(((perfilesRes.data ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const correoDe = (m: Member): string | null =>
    (m.profile_id ? emailDePerfil.get(m.profile_id)?.trim() : null) || m.email?.trim() || null;
  const prefByKey = new Map(
    ((prefsRes.data ?? []) as { profile_id: string; event_type: string; email: boolean }[])
      .map((r) => [`${r.profile_id}|${r.event_type}`, r.email]),
  );

  // Lo que se decide 'skipped' se escribe junto (una escritura por razón), antes de cualquier
  // salida y también si algo revienta (ver el finally de abajo).
  const saltadas = new Map<string, string[]>();
  const saltar = (id: string, razon: string) => saltadas.set(razon, [...(saltadas.get(razon) ?? []), id]);
  let skipped = 0;
  const escribirSaltadas = async () => {
    for (const [razon, ids] of saltadas) {
      await marcar(ids, { status: "skipped", error: razon });
      skipped += ids.length;
    }
    saltadas.clear();
  };

  let sent = 0, failed = 0, held = 0;
  /** Un DM que falló por algo de ESE aviso o persona: reintento (gasta intento) o 'failed'. */
  const reintentarOFallar = async (d: { id: string; intentos: number }, error: string) => {
    console.error("[notif-slack] falló un DM:", error);
    if (errorSlackPermanente(error) || d.intentos + 1 >= MAX_INTENTOS) {
      await marcar([d.id], { status: "failed", error });
      failed++;
      return;
    }
    await marcar([d.id], {
      status: "pending", claimed_at: null, error, intentos: d.intentos + 1,
      not_before: new Date(Date.now() + REINTENTO_MS).toISOString(),
    });
    held++;
  };

  // Slack de cada persona encontrado por su correo en ESTA corrida (una búsqueda por persona).
  type Hallazgo = { userId: string } | null | { tropiezo: RespuestaSlack };
  const encontrado = new Map<string, Hallazgo>();
  const buscarPorCorreo = async (m: Member, correo: string, con: ConexionSlack): Promise<Hallazgo> => {
    if (encontrado.has(m.id)) return encontrado.get(m.id) ?? null;
    const clave = `${con.teamId}|${correo.toLowerCase()}`;
    const hasta = noEncontradoHasta.get(clave);
    if (hasta !== undefined && hasta > Date.now()) { encontrado.set(m.id, null); return null; }
    if (hasta !== undefined) noEncontradoHasta.delete(clave); // ya venció: se vuelve a buscar
    const r = await slackApi(con.token, "users.lookupByEmail", { email: correo }, false);
    let res: Hallazgo = null;
    if (r.ok && usuarioSlackValido(r.user, con.teamId)) {
      res = { userId: (r.user as { id: string }).id };
      // Se guarda para la próxima (y se ve en Admin ▸ Equipo). Sólo si nadie lo llenó ya.
      const { error } = await db.from("track_members")
        .update({ slack_user_id: res.userId, slack_team_id: con.teamId })
        .eq("id", m.id).is("slack_user_id", null);
      if (error) console.error("[notif-slack] no se pudo guardar el Slack encontrado:", error.message);
    } else if (r.ok || r.error === "users_not_found") {
      // No está (o es un bot, una cuenta borrada o de otro espacio): no se le busca en 6 h.
      noEncontradoHasta.set(clave, Date.now() + NO_ENCONTRADO_MS);
    } else {
      res = { tropiezo: r };
    }
    encontrado.set(m.id, res);
    return res;
  };

  const ahora = Date.now();
  // Hasta qué fila se llegó: si algo revienta a media corrida, las de ahí en adelante
  // vuelven a la cola en el finally (no se quedan 15 min en 'sending' gastando intentos).
  let siguiente = 0;
  try {
  for (let i = 0; i < rows.length; i++) {
    siguiente = i;
    const d = rows[i];
    // Se acaba el tiempo de la ruta: lo que falta vuelve a la cola, sin gastar intento.
    if (Date.now() - inicio > PLAZO_MS) {
      await escribirSaltadas();
      const resto = rows.slice(i).map((r) => r.id);
      await soltar(resto, 0);
      held += resto.length;
      siguiente = rows.length;
      break;
    }
    const n = notifById.get(d.notification_id);
    if (!n) { saltar(d.id, "sin notificación"); continue; }
    const m = miembroDe(n);
    if (m && !m.active) { saltar(d.id, "persona inactiva"); continue; }
    const pid = n.recipient_id ?? m?.profile_id ?? null;
    const correo = m ? correoDe(m) : null;
    // Un id guardado que no es de una PERSONA (p. ej. un canal escrito antes de que Equipo lo
    // revisara) no se usa: se busca por correo. Si no, el aviso saldría en un canal.
    const guardado = m?.slack_user_id?.trim() ?? "";
    const slackUserId = esSlackUserId(guardado) ? guardado : null;
    const decision = decisionSlack({
      type: n.type,
      esDelEquipo: !!m,
      notifySlack: m?.notify_slack ?? false,
      slackUserId,
      email: correo,
      eventPref: pid && n.type ? prefByKey.get(`${pid}|${n.type}`) : undefined,
      esMiTarea: !!n.recipient_member_id,
      creadoEn: d.created_at,
      ahora,
    });
    if (!decision.enviar) { saltar(d.id, decision.razon); continue; }

    const con = elegirConexion(m!.slack_team_id, cons);
    if (!con) { saltar(d.id, "su espacio de Slack no está conectado"); continue; }

    let respuesta: RespuestaSlack | null = null;
    let userId = slackUserId ?? "";
    if (decision.buscarPorCorreo) {
      const h = await buscarPorCorreo(m!, correo!, con);
      if (h && "tropiezo" in h) respuesta = h.tropiezo;
      else if (!h) { saltar(d.id, "su correo no está en Slack"); continue; }
      else userId = h.userId;
    }

    if (!respuesta) {
      const msg = mensajeSlack({ title: n.title, body: n.body, ctaUrl: ctaUrl({ ...n, esCliente: false }) });
      // channel = el id de la persona: Slack lo entrega en el DM del bot con ella.
      respuesta = await slackApi(con.token, "chat.postMessage", {
        channel: userId, text: msg.text, blocks: msg.blocks, unfurl_links: false, unfurl_media: false,
      });
      if (respuesta.ok) {
        await marcar([d.id], {
          status: "sent", sent_at: new Date().toISOString(),
          provider_id: typeof respuesta.ts === "string" ? respuesta.ts : null,
        });
        sent++;
        continue;
      }
    }

    // Slack caído o nos frenó: ni éste ni los que siguen tienen la culpa. Todos vuelven a
    // la cola para cuando Slack diga (Retry-After), sin gastar intento, y se para aquí.
    if (esTropiezoGeneral(respuesta.error)) {
      console.error("[notif-slack] Slack tropezó, se devuelve lo pendiente:", respuesta.error);
      await escribirSaltadas();
      const resto = rows.slice(i).map((r) => r.id);
      await soltar(resto, respuesta.retryAfterMs ?? 60_000);
      held += resto.length;
      siguiente = rows.length;
      break;
    }
    await reintentarOFallar(d, respuesta.error ?? "error desconocido");
    siguiente = i + 1;
  }
  siguiente = rows.length;
  } catch (e) {
    console.error("[notif-slack] la corrida reventó; lo que faltaba vuelve a la cola:", e);
  } finally {
    await escribirSaltadas();
    // Sólo queda algo aquí si la corrida reventó: de la fila en curso en adelante, a la cola.
    // (Las saltadas de esas filas ya se escribieron arriba; soltar sólo toca las que siguen
    // en 'sending', así que no pisa lo ya decidido.)
    const resto = rows.slice(siguiente).map((r) => r.id);
    if (resto.length) {
      const { error } = await db.from("notification_deliveries")
        .update({ status: "pending", claimed_at: null, not_before: new Date(Date.now() + 60_000).toISOString() })
        .in("id", resto).eq("status", "sending");
      if (error) console.error("[notif-slack] no se pudieron devolver a la cola:", error.message);
      held += resto.length;
    }
  }
  return { sent, skipped, failed, held };
}
