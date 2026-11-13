import "server-only";
import { contextoDeTareas } from "@/lib/paquetes-data";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { ctaUrl } from "@/lib/email-template";
import { CLIENT_TYPES } from "@/lib/notif-routing";
import { leerCanales } from "@/lib/notif-canales";
import { conexionesSlack, hasSlack, slackApi, type RespuestaSlack } from "@/lib/slack-api";
import {
  decisionSlack, elegirConexion, errorSlackPermanente, errorTokenSlack, idGuardadoSirve, mensajeSlack,
  usuarioSlackValido, type ConexionSlack,
} from "@/lib/slack-routing";

export { hasSlack };
export type SlackDispatchResult = { sent: number; skipped: number; failed: number; held: number; sinConfig?: boolean };

/** Tras un tropiezo de Slack con un DM, se reintenta en 5 min; al 3er fallo, 'failed'. */
const REINTENTO_MS = 5 * 60_000;
const MAX_INTENTOS = 3;
/** La ruta corre hasta 60 s (maxDuration): a los 45 s lo que falta se devuelve a la cola. */
const PLAZO_MS = 45_000;
/** Quien no está en Slack no se vuelve a buscar en un rato (Slack limita las búsquedas). */
const NO_ENCONTRADO_MS = 6 * 60 * 60_000;
/** Un espacio cuyo token dejó de servir: lo suyo se reintenta en 15 min (puede ser un permiso que se arregla). */
const TOKEN_MALO_MS = 15 * 60_000;

/** Slack entero caído o nos frenó: todo lo que falta vuelve a la cola y se para la corrida. */
const TROPIEZOS_DE_SLACK = new Set([
  "ratelimited", "service_unavailable", "internal_error", "fatal_error", "request_timeout", "team_added_to_org",
]);
const esTropiezoDeSlack = (error: string | undefined) =>
  !!error && (TROPIEZOS_DE_SLACK.has(error) || error.startsWith("red:"));

// Quien no está en Slack (por espacio y correo), para no buscarlo en cada movimiento de la app.
const noEncontradoHasta = new Map<string, number>();

/** A quién va un aviso: una persona del equipo (track_members) o un cliente (profiles). */
type Persona = {
  tabla: "track_members" | "profiles";
  id: string;
  esCliente: boolean;
  /** La empresa del cliente (su conexión de Slack). null = equipo (Slack de Runna). */
  clienteId: string | null;
  active: boolean;
  notifySlack: boolean;
  slackUserId: string | null;
  slackTeamId: string | null;
  correo: string | null;
  profileId: string | null;
};

/**
 * Drena la cola de Slack y manda un DM por aviso: al equipo por el Slack de Runna y a cada
 * cliente por el Slack de SU empresa (si la conectó con «Add to Slack»). Se llama junto con
 * el de correos (despacharAvisos) después de cada cambio de estado, y desde el reloj.
 *
 * Reclamo atómico (`rpc_reclamar_slack`, SKIP LOCKED). Sin el token de Runna NO se reclama
 * nada: otra copia de la app (p. ej. una preview sin bot) no le roba los avisos a la buena.
 *
 * Límite conocido: si Slack sí entregó el DM pero la respuesta se perdió (tiempo agotado), se
 * reintenta y la persona puede recibirlo dos veces. Slack no ofrece cómo evitarlo.
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

  const [{ cons, runnaTropiezo }, canales] = await Promise.all([conexionesSlack(), leerCanales()]);

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
  const lista = (notifs ?? []) as Notif[];
  const notifById = new Map<string, Notif>(lista.map((n) => [n.id, n]));
  // "LT AfterBF · Brief 30/10 · Real" bajo el título (fase 3). Si falla, el DM sale sin él.
  const contexto = await contextoDeTareas(lista.filter((n) => n.entity_type === "idea").map((n) => n.entity_id));

  // Destinatarios. Un aviso va a un member (tarea suya) o a un profile (por rol, o un cliente).
  // Con fila activa en el EQUIPO manda esa fila; un profile sin fila es un cliente (o alguien
  // del equipo sin roster, que usa su propio profile).
  type Member = {
    id: string; email: string | null; notify_slack: boolean; profile_id: string | null;
    slack_user_id: string | null; slack_team_id: string | null; active: boolean;
  };
  type Profile = {
    id: string; email: string | null; notify_slack: boolean; role: string; client_id: string | null;
    slack_user_id: string | null; slack_team_id: string | null; active: boolean;
  };
  const colsM = "id, email, notify_slack, profile_id, slack_user_id, slack_team_id, active";
  const memberIds = [...new Set(lista.map((n) => n.recipient_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(lista.map((n) => n.recipient_id).filter(Boolean))] as string[];
  const [membersRes, rosterRes] = await Promise.all([
    memberIds.length
      ? db.from("track_members").select(colsM).in("id", memberIds)
      : Promise.resolve({ data: [] as Member[], error: null }),
    profileIds.length
      ? db.from("track_members").select(colsM).in("profile_id", profileIds).eq("active", true).order("id")
      : Promise.resolve({ data: [] as Member[], error: null }),
  ]);
  const memberById = new Map(((membersRes.data ?? []) as Member[]).map((m) => [m.id, m]));
  const memberByProfile = new Map<string, Member>();
  for (const m of (rosterRes.data ?? []) as Member[]) {
    if (m.profile_id && !memberByProfile.has(m.profile_id)) memberByProfile.set(m.profile_id, m);
  }
  // Los profiles: el de cada destinatario (clientes, o el correo de login del equipo).
  const perfilesNecesarios = [...new Set([
    ...profileIds,
    ...[...memberById.values(), ...memberByProfile.values()].map((m) => m.profile_id).filter(Boolean),
  ])] as string[];
  const [perfilesRes, prefsRes] = await Promise.all([
    perfilesNecesarios.length
      ? db.from("profiles").select("id, email, notify_slack, role, client_id, slack_user_id, slack_team_id, active").in("id", perfilesNecesarios)
      : Promise.resolve({ data: [] as Profile[], error: null }),
    perfilesNecesarios.length
      ? db.from("notification_prefs").select("profile_id, event_type, email").in("profile_id", perfilesNecesarios)
      : Promise.resolve({ data: [] as { profile_id: string; event_type: string; email: boolean }[], error: null }),
  ]);
  const lecturaFallida = membersRes.error ?? rosterRes.error ?? perfilesRes.error ?? prefsRes.error;
  if (lecturaFallida) {
    console.error("[notif-slack] no se pudieron leer destinatarios/preferencias:", lecturaFallida.message);
    await soltar(todos, 60_000);
    return { ...vacio, held: todos.length };
  }
  const perfilById = new Map(((perfilesRes.data ?? []) as Profile[]).map((p) => [p.id, p]));
  const prefByKey = new Map(
    ((prefsRes.data ?? []) as { profile_id: string; event_type: string; email: boolean }[])
      .map((r) => [`${r.profile_id}|${r.event_type}`, r.email]),
  );

  const deMiembro = (m: Member): Persona => {
    const p = m.profile_id ? perfilById.get(m.profile_id) : undefined;
    return {
      tabla: "track_members", id: m.id, esCliente: false, clienteId: null, active: m.active,
      notifySlack: m.notify_slack, slackUserId: m.slack_user_id, slackTeamId: m.slack_team_id,
      // El correo de su LOGIN (Google, verificado) si tiene; si no, el que escribió un admin.
      correo: p?.email?.trim() || m.email?.trim() || null, profileId: m.profile_id,
    };
  };
  const personaDe = (n: Notif): Persona | null => {
    if (n.recipient_member_id) {
      const m = memberById.get(n.recipient_member_id);
      return m ? deMiembro(m) : null;
    }
    if (!n.recipient_id) return null;
    const m = memberByProfile.get(n.recipient_id);
    if (m) return deMiembro(m);
    const p = perfilById.get(n.recipient_id);
    if (!p) return null;
    const esCliente = p.role === "client";
    return {
      tabla: "profiles", id: p.id, esCliente, clienteId: esCliente ? p.client_id : null, active: p.active,
      notifySlack: p.notify_slack, slackUserId: p.slack_user_id, slackTeamId: p.slack_team_id,
      correo: p.email?.trim() || null, profileId: p.id,
    };
  };

  // Lo 'skipped' se escribe junto (una escritura por razón), antes de cualquier salida y
  // también si algo revienta (ver el finally).
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

  // Espacios cuyo token dejó de servir en esta corrida: lo suyo vuelve a la cola en 15 min.
  const conexionCaida = new Set<string>();
  const llaveCon = (c: ConexionSlack) => c.clienteId ?? "runna";

  // Slack de cada persona encontrado por su correo en ESTA corrida (una búsqueda por persona).
  type Hallazgo = { userId: string } | null | { tropiezo: RespuestaSlack };
  const encontrado = new Map<string, Hallazgo>();
  const buscarPorCorreo = async (per: Persona, con: ConexionSlack): Promise<Hallazgo> => {
    const k = `${per.tabla}|${per.id}`;
    if (encontrado.has(k)) return encontrado.get(k) ?? null;
    const clave = `${con.teamId}|${per.correo!.toLowerCase()}`;
    const hasta = noEncontradoHasta.get(clave);
    if (hasta !== undefined && hasta > Date.now()) { encontrado.set(k, null); return null; }
    if (hasta !== undefined) noEncontradoHasta.delete(clave);
    const r = await slackApi(con.token, "users.lookupByEmail", { email: per.correo! }, false);
    let res: Hallazgo = null;
    if (r.ok && usuarioSlackValido(r.user, con.teamId)) {
      res = { userId: (r.user as { id: string }).id };
      // Se guarda para la próxima (se ve en Admin ▸ Notificaciones). Sólo si sigue sin uno
      // que sirva: no se pisa un id que alguien escribió a mano entre tanto.
      const q = db.from(per.tabla).update({ slack_user_id: res.userId, slack_team_id: con.teamId }).eq("id", per.id);
      const { error } = await (per.slackUserId ? q.eq("slack_user_id", per.slackUserId) : q.is("slack_user_id", null));
      if (error) console.error("[notif-slack] no se pudo guardar el Slack encontrado:", error.message);
    } else if (r.ok || r.error === "users_not_found") {
      noEncontradoHasta.set(clave, Date.now() + NO_ENCONTRADO_MS);
    } else {
      res = { tropiezo: r };
    }
    encontrado.set(k, res);
    return res;
  };

  const ahora = Date.now();
  let siguiente = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      siguiente = i;
      const d = rows[i];
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
      const per = personaDe(n);
      if (per && !per.active) { saltar(d.id, "persona inactiva"); continue; }
      const decision = decisionSlack({
        type: n.type,
        esDelEquipo: !!per,
        canalActivo: per ? (per.esCliente ? canales.clientes.slack : canales.equipo.slack) : true,
        notifySlack: per?.notifySlack ?? false,
        slackUserId: per?.slackUserId,
        email: per?.correo,
        eventPref: per?.profileId && n.type ? prefByKey.get(`${per.profileId}|${n.type}`) : undefined,
        esMiTarea: !!n.recipient_member_id,
        creadoEn: d.created_at,
        ahora,
      });
      if (!decision.enviar) { saltar(d.id, decision.razon); continue; }

      // El Slack de Runna no contestó: lo del equipo vuelve a la cola, lo de clientes sigue.
      if (!per!.esCliente && runnaTropiezo) {
        await soltar([d.id], runnaTropiezo.retryAfterMs ?? (errorTokenSlack(runnaTropiezo.error) ? TOKEN_MALO_MS : 60_000));
        held++;
        siguiente = i + 1;
        continue;
      }
      // Un cliente sin empresa asignada no tiene Slack al que mandar (nunca el de Runna).
      if (per!.esCliente && !per!.clienteId) { saltar(d.id, "cliente sin empresa"); continue; }
      const con = elegirConexion(per!.clienteId, cons);
      if (!con) { saltar(d.id, per!.esCliente ? "su empresa no conectó Slack" : "Slack de Runna sin conectar"); continue; }
      if (conexionCaida.has(llaveCon(con))) { await soltar([d.id], TOKEN_MALO_MS); held++; siguiente = i + 1; continue; }

      // Lo ya decidido se escribe antes de hablar con Slack: si la ruta se corta a media
      // corrida, esas filas no se quedan en 'sending' esperando el rescate.
      if (saltadas.size) await escribirSaltadas();
      let respuesta: RespuestaSlack | null = null;
      let userId = idGuardadoSirve(per!.slackUserId, per!.slackTeamId, con) ? per!.slackUserId!.trim() : "";
      if (!userId) {
        if (!per!.correo) { saltar(d.id, "sin Slack ni correo"); continue; }
        const h = await buscarPorCorreo(per!, con);
        if (h && "tropiezo" in h) respuesta = h.tropiezo;
        else if (!h) { saltar(d.id, "su correo no está en Slack"); continue; }
        else userId = h.userId;
      }

      if (!respuesta) {
        const esClienteCta = !n.recipient_member_id && !!n.recipient_id && per!.esCliente && CLIENT_TYPES.has(n.type ?? "");
        const msg = mensajeSlack({
          title: n.title, body: n.body, ctaUrl: ctaUrl({ ...n, esCliente: esClienteCta }),
          contexto: n.entity_type === "idea" && n.entity_id ? contexto.get(n.entity_id) ?? null : null,
        });
        respuesta = await slackApi(con.token, "chat.postMessage", {
          channel: userId, text: msg.text, blocks: msg.blocks, unfurl_links: false, unfurl_media: false,
        });
        if (respuesta.ok) {
          await marcar([d.id], {
            status: "sent", sent_at: new Date().toISOString(),
            provider_id: typeof respuesta.ts === "string" ? respuesta.ts : null,
          });
          sent++;
          siguiente = i + 1;
          continue;
        }
      }

      // Slack entero caído o nos frenó: todo lo que falta vuelve a la cola (Retry-After), sin
      // gastar intento, y se para aquí.
      if (esTropiezoDeSlack(respuesta.error)) {
        console.error("[notif-slack] Slack tropezó, se devuelve lo pendiente:", respuesta.error);
        await escribirSaltadas();
        const resto = rows.slice(i).map((r) => r.id);
        await soltar(resto, respuesta.retryAfterMs ?? 60_000);
        held += resto.length;
        siguiente = rows.length;
        break;
      }
      // El token de ESE espacio dejó de servir (desinstalaron la app, quitaron un permiso):
      // lo de ese espacio vuelve a la cola en 15 min; los demás espacios siguen.
      if (errorTokenSlack(respuesta.error)) {
        console.error(`[notif-slack] el token del espacio ${con.teamId ?? "Runna"} no sirve:`, respuesta.error);
        conexionCaida.add(llaveCon(con));
        await soltar([d.id], TOKEN_MALO_MS);
        held++;
        siguiente = i + 1;
        continue;
      }
      await reintentarOFallar(d, respuesta.error ?? "error desconocido");
      siguiente = i + 1;
    }
    siguiente = rows.length;
  } catch (e) {
    console.error("[notif-slack] la corrida reventó; lo que faltaba vuelve a la cola:", e);
  } finally {
    await escribirSaltadas();
    // Sólo queda algo aquí si la corrida reventó: de la fila en curso en adelante, a la cola
    // (sólo las que siguen en 'sending': no se pisa lo ya decidido).
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
