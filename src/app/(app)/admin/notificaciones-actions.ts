"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/identity";
import { canAdmin, canAssignAdmins } from "@/lib/roles";
import { leerCanales } from "@/lib/notif-canales";
import { conexionesSlack, hasSlack, revocarToken, slackApi } from "@/lib/slack-api";
import { descifrarToken, llaveValida } from "@/lib/slack-cifrado";
import { elegirConexion, emparejarPorCorreo, idGuardadoSirve, type ConexionSlack } from "@/lib/slack-routing";
import type {
  ConexionSlackFila, EstadoSlackPersona, NotifAdmin, PersonaNotif, ResultadoBusqueda, SlackIntegracion,
} from "@/lib/notif-admin-tipos";

type Res = { ok: true } | { ok: false; error: string };

/** Sólo admin/master (en la pantalla Y aquí: una acción se puede llamar sin la pantalla). */
async function gate(): Promise<{ userId: string; esMaster: boolean } | null> {
  if (!hasSupabase()) return null;
  const u = await getCurrentUser();
  if (!u || !canAdmin(u.role)) return null;
  return { userId: u.userId, esMaster: canAssignAdmins(u.role) };
}

type MiembroRow = {
  id: string; name: string; email: string | null; profile_id: string | null;
  notify_email: boolean; notify_slack: boolean; slack_user_id: string | null; slack_team_id: string | null;
};
type ClienteRow = {
  id: string; full_name: string; email: string | null; client_id: string | null;
  notify_email: boolean; notify_slack: boolean; slack_user_id: string | null; slack_team_id: string | null;
  clients: { name: string } | null;
};

async function leerGente() {
  const db = supabaseAdmin();
  const [m, c] = await Promise.all([
    db.from("track_members")
      .select("id, name, email, profile_id, notify_email, notify_slack, slack_user_id, slack_team_id")
      .eq("active", true).order("sort_order"),
    db.from("profiles")
      .select("id, full_name, email, client_id, notify_email, notify_slack, slack_user_id, slack_team_id, clients(name)")
      .eq("role", "client").eq("active", true).order("full_name"),
  ]);
  const err = m.error ?? c.error;
  if (err) throw new Error(err.message);
  const miembros = (m.data ?? []) as MiembroRow[];
  // El correo de login (Google) manda para encontrar a alguien en Slack; si no, el de Equipo.
  const ids = miembros.map((x) => x.profile_id).filter(Boolean) as string[];
  const p = ids.length
    ? await db.from("profiles").select("id, email").in("id", ids)
    : { data: [] as { id: string; email: string | null }[], error: null };
  if (p.error) throw new Error(p.error.message);
  const loginDe = new Map(((p.data ?? []) as { id: string; email: string | null }[]).map((x) => [x.id, x.email]));
  return {
    miembros,
    clientes: (c.data ?? []) as unknown as ClienteRow[],
    correoMiembro: (x: MiembroRow) => (x.profile_id ? loginDe.get(x.profile_id)?.trim() : null) || x.email?.trim() || null,
  };
}

function estadoSlack(userId: string | null, teamId: string | null, con: ConexionSlack | null): EstadoSlackPersona {
  if (!con) return "sin_conexion";
  return idGuardadoSirve(userId, teamId, con) ? "encontrado" : "sin_buscar";
}

/** Todo lo de Admin ▸ Notificaciones: los 4 interruptores y una fila por persona. */
export async function listarNotificaciones(): Promise<{ ok: true; datos: NotifAdmin } | { ok: false; error: string }> {
  if (!(await gate())) return { ok: false, error: "Sólo un admin ve las notificaciones." };
  try {
    const [{ miembros, clientes, correoMiembro }, canales, { cons, runnaTropiezo }] = await Promise.all([
      leerGente(), leerCanales(), conexionesSlack(),
    ]);
    const runna = elegirConexion(null, cons);
    const equipo: PersonaNotif[] = miembros.map((x) => ({
      id: x.id, nombre: x.name, correo: correoMiembro(x), notifyEmail: x.notify_email, notifySlack: x.notify_slack,
      slack: estadoSlack(x.slack_user_id, x.slack_team_id, runna),
    }));
    const clientesFilas: PersonaNotif[] = clientes.map((x) => ({
      id: x.id, nombre: x.full_name, correo: x.email, notifyEmail: x.notify_email, notifySlack: x.notify_slack,
      cliente: x.clients?.name ?? null,
      slack: x.client_id ? estadoSlack(x.slack_user_id, x.slack_team_id, elegirConexion(x.client_id, cons)) : "sin_conexion",
    }));
    return {
      ok: true,
      datos: {
        canales, equipo, clientes: clientesFilas,
        slackRunna: runnaTropiezo ? "tropiezo" : runna ? "conectado" : "sin_token",
      },
    };
  } catch (e) {
    console.error("[notificaciones] no se pudo leer:", e);
    return { ok: false, error: "No se pudieron leer las notificaciones." };
  }
}

/** Uno de los 4 interruptores generales. */
export async function guardarCanal(audiencia: string, canal: string, activo: boolean): Promise<Res> {
  if (!(await gate())) return { ok: false, error: "Sólo un admin cambia las notificaciones." };
  if (!["equipo", "clientes"].includes(audiencia) || !["email", "slack"].includes(canal) || typeof activo !== "boolean") {
    return { ok: false, error: "Ese interruptor no existe." };
  }
  const { error } = await supabaseAdmin().from("notif_canales")
    .upsert({ audiencia, canal, activo, updated_at: new Date().toISOString() }, { onConflict: "audiencia,canal" });
  if (error) return { ok: false, error: "No se pudo guardar." };
  revalidatePath("/admin");
  return { ok: true };
}

/** Correo y Slack de una persona: del equipo (track_members) o de un cliente (profiles). */
export async function guardarAvisosPersona(
  grupo: string, id: string, patch: { notifyEmail?: boolean; notifySlack?: boolean },
): Promise<Res> {
  if (!(await gate())) return { ok: false, error: "Sólo un admin cambia las notificaciones." };
  if (grupo !== "equipo" && grupo !== "clientes") return { ok: false, error: "Ese grupo no existe." };
  const limpio: Record<string, boolean> = {};
  if (typeof patch?.notifyEmail === "boolean") limpio.notify_email = patch.notifyEmail;
  if (typeof patch?.notifySlack === "boolean") limpio.notify_slack = patch.notifySlack;
  if (!Object.keys(limpio).length || typeof id !== "string") return { ok: false, error: "Nada que guardar." };
  const db = supabaseAdmin();
  const q = grupo === "equipo"
    ? db.from("track_members").update(limpio).eq("id", id)
    : db.from("profiles").update(limpio).eq("id", id).eq("role", "client");
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: "No se pudo guardar." };
  if (!data?.length) return { ok: false, error: "Esa persona ya no existe." };
  revalidatePath("/admin");
  return { ok: true };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toda la lista de usuarios de un espacio (users.list, de 200 en 200). Si Slack frena, espera
 *  lo que pide (hasta 20 s en total) y sigue; si no alcanza, devuelve lo que ya tenía. */
async function usuariosDe(con: ConexionSlack): Promise<{ usuarios: unknown[]; incompleto?: string }> {
  const usuarios: unknown[] = [];
  let cursor = "";
  let esperado = 0;
  for (let pagina = 0; pagina < 50; pagina++) {
    const r = await slackApi(con.token, "users.list", { limit: 200, ...(cursor ? { cursor } : {}) }, false);
    if (!r.ok) {
      const ms = r.retryAfterMs ?? 0;
      if (r.error === "ratelimited" && esperado + ms <= 20_000) { esperado += ms; await esperar(ms); pagina--; continue; }
      return { usuarios, incompleto: r.error ?? "error desconocido" };
    }
    usuarios.push(...((r.members as unknown[]) ?? []));
    cursor = (r.response_metadata as { next_cursor?: string } | undefined)?.next_cursor ?? "";
    if (!cursor) break;
  }
  return { usuarios };
}

/**
 * «Buscar en Slack»: pide a cada espacio conectado su lista de usuarios y le pone su member ID
 * a cada persona de Greenlight por correo. Equipo → Slack de Runna; cada cliente → el Slack
 * de SU empresa. No pisa un id que ya sirve (p. ej. uno escrito a mano en Equipo).
 */
export async function buscarEnSlack(): Promise<{ ok: true; resultado: ResultadoBusqueda } | { ok: false; error: string }> {
  if (!(await gate())) return { ok: false, error: "Sólo un admin busca en Slack." };
  if (!hasSlack()) return { ok: false, error: "El bot no está conectado al Slack de Runna (falta SLACK_BOT_TOKEN)." };
  const db = supabaseAdmin();
  try {
    const [{ miembros, clientes, correoMiembro }, { cons, runnaTropiezo }] = await Promise.all([leerGente(), conexionesSlack()]);
    if (runnaTropiezo) return { ok: false, error: `Slack no contestó (${runnaTropiezo.error}). Intenta en un minuto.` };
    const { data: nombres } = await db.from("slack_conexiones").select("team_id, team_name");
    const nombreDe = new Map(((nombres ?? []) as { team_id: string; team_name: string | null }[]).map((n) => [n.team_id, n.team_name]));

    const espacios = await Promise.all(cons.map(async (con) => {
      const nombre = con.clienteId ? (nombreDe.get(con.teamId ?? "") ?? "Slack del cliente") : "Slack de Runna";
      const gente = con.clienteId
        ? clientes.filter((c) => c.client_id === con.clienteId).map((c) => ({
            tabla: "profiles" as const, id: c.id, correos: [c.email], actual: c.slack_user_id, team: c.slack_team_id,
          }))
        : miembros.map((m) => ({
            tabla: "track_members" as const, id: m.id, correos: [correoMiembro(m), m.email], actual: m.slack_user_id, team: m.slack_team_id,
          }));
      const { usuarios, incompleto } = await usuariosDe(con);
      const pares = emparejarPorCorreo(usuarios, gente.map((g) => ({ clave: g.id, correos: g.correos })), con.teamId);
      let nuevos = 0, yaEstaban = 0, sinSlack = 0;
      const porGuardar = gente.filter((g) => {
        if (idGuardadoSirve(g.actual, g.team, con)) { yaEstaban++; return false; }
        if (!pares.has(g.id)) { sinSlack++; return false; }
        return true;
      });
      // De 10 en 10; cada escritura sólo si nadie cambió el id mientras tanto.
      for (let i = 0; i < porGuardar.length; i += 10) {
        const res = await Promise.all(porGuardar.slice(i, i + 10).map((g) => {
          const q = db.from(g.tabla).update({ slack_user_id: pares.get(g.id)!, slack_team_id: con.teamId }).eq("id", g.id);
          return (g.actual ? q.eq("slack_user_id", g.actual) : q.is("slack_user_id", null)).select("id");
        }));
        for (const r of res) {
          if (r.error) console.error("[notificaciones] no se pudo guardar un Slack ID:", r.error.message);
          else if (r.data?.length) nuevos++;
        }
      }
      return { nombre, nuevos, yaEstaban, sinSlack, ...(incompleto ? { error: `lista incompleta (${incompleto})` } : {}) };
    }));
    revalidatePath("/admin");
    return { ok: true, resultado: { espacios } };
  } catch (e) {
    console.error("[notificaciones] buscar en Slack reventó:", e);
    return { ok: false, error: "No se pudo buscar en Slack." };
  }
}

// ── Integraciones ▸ Slack ────────────────────────────────────────────────────

function puedeConectar(): boolean {
  return !!(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim() && llaveValida(process.env.SLACK_TOKEN_KEY));
}

export async function estadoSlackIntegracion(): Promise<{ ok: true; datos: SlackIntegracion } | { ok: false; error: string }> {
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin ve las integraciones." };
  const db = supabaseAdmin();
  const [conRes, cliRes] = await Promise.all([
    db.from("slack_conexiones").select("team_id, team_name, created_at, active, clients(name)").order("created_at"),
    db.from("clients").select("id, name").eq("active", true).order("name"),
  ]);
  if (conRes.error || cliRes.error) return { ok: false, error: "No se pudo leer la conexión con Slack." };
  const conexiones: ConexionSlackFila[] = ((conRes.data ?? []) as unknown as {
    team_id: string; team_name: string | null; created_at: string; active: boolean; clients: { name: string } | null;
  }[]).map((c) => ({
    teamId: c.team_id, teamName: c.team_name, cliente: c.clients?.name ?? "—", desde: c.created_at, pendiente: !c.active,
  }));
  return {
    ok: true,
    datos: {
      runnaConectado: hasSlack(), puedeConectar: puedeConectar(), conexiones, puedeAprobar: g.esMaster,
      clientes: (cliRes.data ?? []) as { id: string; name: string }[],
    },
  };
}

/** Dominios desde los que se puede crear una liga (su regreso tiene que estar en la app de Slack). */
function dominiosPermitidos(): Set<string> {
  const s = new Set<string>();
  for (const v of [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL]) {
    if (!v?.trim()) continue;
    try { s.add(new URL(v.includes("://") ? v : `https://${v}`).host); } catch { /* valor raro: se ignora */ }
  }
  return s;
}

/** La liga «Add to Slack» para el admin de un cliente: sirve una vez y vence en 7 días. Crear
 *  una nueva cancela la anterior que no se usó. */
export async function crearLigaSlack(clienteId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin crea la liga." };
  if (!puedeConectar()) return { ok: false, error: "Falta configurar SLACK_CLIENT_ID, SLACK_CLIENT_SECRET y SLACK_TOKEN_KEY en Vercel." };
  if (typeof clienteId !== "string" || !clienteId) return { ok: false, error: "Elige el cliente." };
  const db = supabaseAdmin();
  const { data: cli } = await db.from("clients").select("id").eq("id", clienteId).eq("active", true).maybeSingle();
  if (!cli) return { ok: false, error: "Ese cliente no existe." };
  const { data: ya } = await db.from("slack_conexiones").select("team_id").eq("client_id", clienteId).maybeSingle();
  if (ya) return { ok: false, error: "Ese cliente ya tiene un Slack conectado. Desconéctalo primero para cambiarlo." };

  // El regreso va al MISMO dominio desde donde se creó la liga (en vivo o preview), sólo si es
  // uno de los de Greenlight. Se guarda tal cual: Slack exige el mismo al canjear el código.
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!dominiosPermitidos().has(host)) return { ok: false, error: "Crea la liga desde el dominio de Greenlight." };
  const redirectUri = `https://${host}/api/slack/oauth`;

  await db.from("slack_instalaciones").update({ expira_at: new Date().toISOString() })
    .eq("client_id", clienteId).is("usado_at", null);
  const { data: inst, error } = await db.from("slack_instalaciones")
    .insert({ client_id: clienteId, creado_por: g.userId, redirect_uri: redirectUri }).select("id").single<{ id: string }>();
  if (error || !inst) return { ok: false, error: "No se pudo crear la liga." };
  // La liga corta de Greenlight; /slack/<id> reenvía a la página larga de Slack.
  return { ok: true, url: `https://${host}/slack/${inst.id}` };
}

/** Activa un espacio que llegó por «Add to Slack», después de ver que es el del cliente. */
export async function aprobarSlack(teamId: string): Promise<Res> {
  const g = await gate();
  if (!g?.esMaster) return { ok: false, error: "Sólo el Master Builder aprueba un Slack nuevo." };
  if (typeof teamId !== "string" || !teamId) return { ok: false, error: "Ese espacio no existe." };
  const { data, error } = await supabaseAdmin().from("slack_conexiones")
    .update({ active: true, aprobado_por: g.userId, aprobado_at: new Date().toISOString() })
    .eq("team_id", teamId).eq("active", false).select("team_id");
  if (error) return { ok: false, error: "No se pudo aprobar." };
  if (!data?.length) return { ok: false, error: "Ese espacio ya estaba aprobado o ya no existe." };
  revalidatePath("/admin");
  return { ok: true };
}

/** Desconecta (o rechaza) el espacio de un cliente: se desinstala el bot de ese Slack y su
 *  token se borra. El bot deja de mandarle avisos. */
export async function desconectarSlack(teamId: string): Promise<Res> {
  const g = await gate();
  if (!g) return { ok: false, error: "Sólo un admin desconecta Slack." };
  if (typeof teamId !== "string" || !teamId) return { ok: false, error: "Ese espacio no existe." };
  const db = supabaseAdmin();
  const { data: fila } = await db.from("slack_conexiones").select("token_cifrado, active").eq("team_id", teamId)
    .maybeSingle<{ token_cifrado: string; active: boolean }>();
  if (!fila) return { ok: false, error: "Ese espacio ya no estaba conectado." };
  if (!fila.active && !g.esMaster) return { ok: false, error: "Sólo el Master Builder rechaza un Slack nuevo." };
  const llave = process.env.SLACK_TOKEN_KEY?.trim();
  const token = llave ? descifrarToken(fila.token_cifrado, llave, teamId) : null;
  if (token) await revocarToken(token);
  const { error } = await db.from("slack_conexiones").delete().eq("team_id", teamId);
  if (error) return { ok: false, error: "No se pudo desconectar." };
  revalidatePath("/admin");
  return { ok: true };
}
