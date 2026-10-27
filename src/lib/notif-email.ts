import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { decisionEmail, CLIENT_TYPES } from "@/lib/notif-routing";
import {
  htmlFor, textFor, ctaUrl, htmlAgrupado, textAgrupado, asuntoAgrupado, type AvisoAgrupado,
} from "@/lib/email-template";

export type DispatchResult = { sent: number; skipped: number; failed: number; held?: number; sinConfig?: boolean };

/** Tras un fallo de envío (SMTP), se reintenta en 5 min; al tercer fallo queda 'failed'. */
const REINTENTO_MS = 5 * 60_000;
const MAX_INTENTOS = 3;

/**
 * Drena la cola de emails pendientes y los manda (Gmail SMTP, sender
 * unique@runna.com.mx). Se llama INLINE después de cada cambio de estado, y además el
 * reloj de 0084 (cada minuto, /api/avisos/enviar) la llama cuando a algo le llega su turno.
 *
 * AGRUPADO (Pedro, 2026-10-27, clientes y equipo): el primer correo a una dirección sale
 * ya; lo que le llegue en los 10 minutos siguientes espera (`not_before`) y sale junto, en
 * UN correo. Lo que llega en el mismo envío (el lead manda 5 tareas de un jalón) sale junto
 * de una vez. La decisión "ya o espera" la toma la base (`rpc_reservar_envio`) con un
 * candado por dirección: dos envíos a la vez no pueden mandar los dos.
 *
 * CLAIM atómico (`rpc_reclamar_emails`, FOR UPDATE SKIP LOCKED): dos drains a la vez se
 * reparten filas distintas y ninguna se manda dos veces. Lo que se queda en 'sending' más
 * de 15 min desde que se reclamó (el proceso murió a medio envío) vuelve a ser candidato,
 * hasta 3 veces: preferimos un raro correo doble a uno que nunca sale, pero no sin fin.
 */
export async function dispatchPendingEmails(limit = 50): Promise<DispatchResult> {
  if (!hasSupabase()) return { sent: 0, skipped: 0, failed: 0 };
  if (!hasEmail()) return { sent: 0, skipped: 0, failed: 0, sinConfig: true };
  const db = supabaseAdmin();

  const { data: claimed, error: claimErr } = await db.rpc("rpc_reclamar_emails", { p_limit: limit });
  if (claimErr) {
    console.error("[notif-email] NO SALEN CORREOS: no se pudo reclamar la cola:", claimErr.message);
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const rows = (claimed ?? []) as { id: string; notification_id: string; created_at: string; intentos: number }[];
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };
  const intentosDe = new Map(rows.map((r) => [r.id, r.intentos]));

  // El estado final SE VERIFICA: si este update falla, la fila se queda en 'sending' y
  // sólo la rescata el reclamo de atascadas (15 min) — que quede registrado.
  const marcar = async (ids: string[], patch: Record<string, unknown>) => {
    if (!ids.length) return;
    const { error } = await db.from("notification_deliveries").update(patch).in("id", ids);
    if (error) console.error(`[notif-email] no se pudo marcar ${ids.length} como ${String(patch.status)}:`, error.message);
  };
  // Devolver a la cola para más tarde (no se pierde nada por un fallo pasajero).
  const soltar = (ids: string[], enMs: number) =>
    marcar(ids, { status: "pending", claimed_at: null, not_before: new Date(Date.now() + enMs).toISOString() });
  const todos = rows.map((r) => r.id);

  // Si no se puede leer A QUIÉN va cada aviso, NO se decide nada (antes una lectura
  // fallida marcaba todo 'skipped' para siempre): todo vuelve a la cola en un minuto.
  const notifIds = [...new Set(rows.map((r) => r.notification_id))];
  const { data: notifs, error: notifErr } = await db
    .from("notifications")
    .select("id, type, title, body, url, entity_type, entity_id, recipient_member_id, recipient_id")
    .in("id", notifIds);
  if (notifErr) {
    console.error("[notif-email] no se pudieron leer los avisos:", notifErr.message);
    await soltar(todos, 60_000);
    return { sent: 0, skipped: 0, failed: 0, held: todos.length };
  }
  type Notif = {
    id: string; type: string | null; title: string; body: string | null; url: string | null;
    entity_type: string | null; entity_id: string | null;
    recipient_member_id: string | null; recipient_id: string | null;
  };
  const notifById = new Map<string, Notif>(((notifs ?? []) as Notif[]).map((n) => [n.id, n]));

  const memberIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_id).filter(Boolean))] as string[];
  type Member = { id: string; email: string | null; notify_email: boolean; profile_id: string | null };
  type Profile = { id: string; email: string | null; notify_email: boolean };
  type Roster = { profile_id: string; notify_email: boolean; email: string | null };
  const [membersRes, profilesRes, rosterRes] = await Promise.all([
    memberIds.length
      ? db.from("track_members").select("id, email, notify_email, profile_id").in("id", memberIds)
      : Promise.resolve({ data: [] as Member[], error: null }),
    profileIds.length
      ? db.from("profiles").select("id, email, notify_email").in("id", profileIds)
      : Promise.resolve({ data: [] as Profile[], error: null }),
    // El interruptor maestro "Recibe emails" vive en track_members.notify_email (Mi perfil
    // y Equipo escriben AHÍ). profiles.notify_email no lo escribe nadie. Los avisos por
    // ROL (lead/admin en scope, watch_all) van dirigidos al PROFILE: se resuelve el roster
    // de cada profile y manda SU interruptor; el del profile queda como respaldo para quien
    // no tiene fila en el roster (clientes). (reap pre-lanzamiento 2026-09-02, sweep C2)
    profileIds.length
      ? db.from("track_members").select("profile_id, notify_email, email").in("profile_id", profileIds).eq("active", true)
      : Promise.resolve({ data: [] as Roster[], error: null }),
  ]);
  const memberById = new Map(((membersRes.data ?? []) as Member[]).map((m) => [m.id, m]));
  const profileById = new Map(((profilesRes.data ?? []) as Profile[]).map((p) => [p.id, p]));
  const memberByProfile = new Map(((rosterRes.data ?? []) as Roster[]).map((m) => [m.profile_id, m]));

  // Preferencia por-evento (0050): el email de cada notificación se decide por la fila
  // notification_prefs (profile_id, type) de la persona — MANDA sobre el default del
  // catálogo. Resuelve el profile del destinatario (directo, o vía el member) y precarga
  // sus filas para los tipos en juego. El in-app ya se entregó en el trigger (amplio).
  const perfilDe = (n: Notif): string | null =>
    n.recipient_id ?? (n.recipient_member_id ? memberById.get(n.recipient_member_id)?.profile_id ?? null : null);
  const prefProfileIds = [...new Set(((notifs ?? []) as Notif[]).map(perfilDe).filter(Boolean))] as string[];
  const prefsRes = prefProfileIds.length
    ? await db.from("notification_prefs").select("profile_id, event_type, email").in("profile_id", prefProfileIds)
    : { data: [] as { profile_id: string; event_type: string; email: boolean }[], error: null };
  const lecturaFallida = membersRes.error ?? profilesRes.error ?? rosterRes.error ?? prefsRes.error;
  if (lecturaFallida) {
    console.error("[notif-email] no se pudieron leer destinatarios/preferencias:", lecturaFallida.message);
    await soltar(todos, 60_000);
    return { sent: 0, skipped: 0, failed: 0, held: todos.length };
  }
  const prefByKey = new Map(
    ((prefsRes.data ?? []) as { profile_id: string; event_type: string; email: boolean }[]).map((r) => [`${r.profile_id}|${r.event_type}`, r.email]),
  );

  // 1) Por fila: ¿le toca correo? Lo que no, 'skipped'. Lo que sí, se junta por DIRECCIÓN
  //    (la misma persona puede llegar por su member o por su profile).
  type Listo = { id: string; createdAt: string; n: Notif; cta: string; esCliente: boolean };
  const porDireccion = new Map<string, Listo[]>();
  let sent = 0, skipped = 0, failed = 0, held = 0;
  for (const d of rows) {
    const n = notifById.get(d.notification_id);
    if (!n) { await marcar([d.id], { status: "skipped", error: "sin notificación" }); skipped++; continue; }

    let email: string | null = null;
    let notifyEmail = false;
    if (n.recipient_member_id) {
      const m = memberById.get(n.recipient_member_id);
      email = m?.email ?? null; notifyEmail = m?.notify_email ?? false;
    } else if (n.recipient_id) {
      const p = profileById.get(n.recipient_id);
      const m = memberByProfile.get(n.recipient_id);
      email = p?.email ?? m?.email ?? null;
      notifyEmail = m ? m.notify_email : (p?.notify_email ?? false);
    }

    const pid = perfilDe(n);
    const eventPref = pid && n.type ? prefByKey.get(`${pid}|${n.type}`) : undefined;
    // `recipient_member_id` sólo lo llena el fan_out en las ramas de ASIGNADOS
    // (y el trigger de task_assigned): si viene, el aviso es de UNA TAREA SUYA.
    const decision = decisionEmail({
      type: n.type, notifyEmail, email, eventPref, esMiTarea: !!n.recipient_member_id,
    });
    if (!decision.enviar) { await marcar([d.id], { status: "skipped", error: decision.razon }); skipped++; continue; }

    const esCliente = !n.recipient_member_id && !!n.recipient_id && CLIENT_TYPES.has(n.type ?? "");
    const dir = email!.trim().toLowerCase();
    const lote = porDireccion.get(dir) ?? [];
    lote.push({ id: d.id, createdAt: d.created_at, n, cta: ctaUrl({ ...n, esCliente }), esCliente });
    porDireccion.set(dir, lote);
  }

  // 2) Por dirección: la base decide (con candado) si sale ya o espera su turno.
  for (const [dir, lote] of porDireccion) {
    lote.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const ids = lote.map((l) => l.id);
    const { data: reserva, error: resErr } = await db.rpc("rpc_reservar_envio", { p_email: dir, p_ids: ids });
    if (resErr) {
      // Sin saber cuándo le escribimos por última vez, NO se manda a ciegas (sería el
      // bombardeo que esto evita): se reintenta en un minuto.
      console.error("[notif-email] no se pudo reservar el envío:", resErr.message);
      await soltar(ids, 60_000);
      held += ids.length;
      continue;
    }
    const r = ((reserva ?? []) as { hasta: string | null; ids: string[] }[])[0];
    if (r?.hasta) { held += r.ids.length; continue; } // espera su turno (la base ya la regresó a la cola)
    // Sólo lo que la base apartó para ESTE envío (otra corrida pudo haber tomado alguna).
    const apartadas = new Set(r?.ids ?? []);
    const enviar = lote.filter((l) => apartadas.has(l.id));
    if (!enviar.length) continue;
    lote.splice(0, lote.length, ...enviar);
    ids.splice(0, ids.length, ...enviar.map((l) => l.id));

    let res: { ok: boolean; id?: string; error?: string };
    if (lote.length === 1) {
      const { n, cta } = lote[0];
      res = await sendEmail({
        to: dir,
        subject: n.title,
        text: textFor(n.title, n.body, cta),
        html: htmlFor({ type: n.type, title: n.title, body: n.body, ctaUrl: cta }),
      });
    } else {
      const avisos: AvisoAgrupado[] = lote.map((l) => ({ type: l.n.type, title: l.n.title, body: l.n.body, ctaUrl: l.cta }));
      // Pie y botón de cliente sólo si TODO el lote es de cara al cliente.
      const esCliente = lote.every((l) => l.esCliente);
      res = await sendEmail({
        to: dir,
        subject: asuntoAgrupado(avisos, esCliente),
        text: textAgrupado(avisos, esCliente),
        html: htmlAgrupado({ avisos, esCliente }),
      });
    }
    if (res.ok) {
      await marcar(ids, { status: "sent", sent_at: new Date().toISOString(), provider_id: res.id ?? null });
      sent += ids.length;
      continue;
    }
    // Un tropiezo de Gmail no se lleva el lote entero: se reintenta en 5 min, hasta 3 veces.
    console.error(`[notif-email] falló el envío a 1 dirección (${ids.length} avisos):`, res.error);
    const agotadas = ids.filter((id) => (intentosDe.get(id) ?? 0) + 1 >= MAX_INTENTOS);
    const reintentar = ids.filter((id) => !agotadas.includes(id));
    await marcar(agotadas, { status: "failed", error: res.error ?? "error desconocido" });
    for (const id of reintentar) {
      await marcar([id], {
        status: "pending", claimed_at: null, error: res.error ?? "error desconocido",
        intentos: (intentosDe.get(id) ?? 0) + 1, not_before: new Date(Date.now() + REINTENTO_MS).toISOString(),
      });
    }
    failed += agotadas.length;
    held += reintentar.length;
  }

  return { sent, skipped, failed, held };
}
