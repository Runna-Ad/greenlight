import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { decisionEmail } from "@/lib/notif-routing";
import { htmlFor, textFor, ctaUrl } from "@/lib/email-template";

export type DispatchResult = { sent: number; skipped: number; failed: number; sinConfig?: boolean };

/** Minutos que una fila puede estar en 'sending' antes de considerarla atascada. */
const STALE_SENDING_MIN = 15;

/**
 * Drena la cola de emails pendientes y los manda (Gmail SMTP, sender
 * unique@runna.com.mx). Se llama INLINE después de cada cambio de estado —
 * corre en el servidor de Vercel, así no depende de la frecuencia de un cron.
 * CLAIM atómico: reclama las filas (pending→sending) antes de mandar, así dos
 * drains concurrentes reclaman conjuntos disjuntos y ninguna se manda dos veces
 * (antes: select→send→update sin claim = doble envío bajo concurrencia; reap).
 */
export async function dispatchPendingEmails(limit = 50): Promise<DispatchResult> {
  if (!hasSupabase()) return { sent: 0, skipped: 0, failed: 0 };
  if (!hasEmail()) return { sent: 0, skipped: 0, failed: 0, sinConfig: true };
  const db = supabaseAdmin();

  // 1) candidatos (los 'pending' más viejos), 2) CLAIM atómico. El UPDATE con
  // `.eq('status','pending')` sólo pasa a 'sending' las que siguen pending y devuelve
  // EXACTAMENTE las que esta corrida reclamó — el lock de fila de Postgres serializa
  // el claim, así un segundo drain concurrente ve las suyas ya en 'sending' y no las toca.
  // Candidatas: las 'pending' + las 'sending' ATASCADAS. Si el update final de una corrida
  // anterior falló (o el proceso murió a medio envío), la fila se quedaba en 'sending'
  // para siempre: nadie la volvía a reclamar. Una en 'sending' desde hace más de
  // STALE_SENDING_MIN vuelve a ser candidata — preferimos un raro correo doble a uno que
  // nunca sale. (reap pre-lanzamiento 2026-09-02)
  const corte = new Date(Date.now() - STALE_SENDING_MIN * 60_000).toISOString();
  const { data: pend, error: pendErr } = await db
    .from("notification_deliveries")
    .select("id, status")
    .eq("channel", "email")
    .or(`status.eq.pending,and(status.eq.sending,created_at.lt.${corte})`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (pendErr) {
    console.error("[notif-email] no se pudo leer la cola:", pendErr.message);
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const candidatos = (pend ?? []) as { id: string; status: string }[];
  if (!candidatos.length) return { sent: 0, skipped: 0, failed: 0 };

  const { data: claimed, error: claimErr } = await db
    .from("notification_deliveries")
    .update({ status: "sending" })
    .in("status", ["pending", "sending"])
    .in("id", candidatos.map((r) => r.id))
    .select("id, notification_id");
  if (claimErr) {
    console.error("[notif-email] no se pudo reclamar la cola:", claimErr.message);
    return { sent: 0, skipped: 0, failed: 0 };
  }
  const rows = (claimed ?? []) as { id: string; notification_id: string }[];
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };

  const notifIds = [...new Set(rows.map((r) => r.notification_id))];
  const { data: notifs } = await db
    .from("notifications")
    .select("id, type, title, body, url, entity_type, entity_id, recipient_member_id, recipient_id")
    .in("id", notifIds);
  type Notif = {
    id: string; type: string | null; title: string; body: string | null; url: string | null;
    entity_type: string | null; entity_id: string | null;
    recipient_member_id: string | null; recipient_id: string | null;
  };
  const notifById = new Map<string, Notif>(((notifs ?? []) as Notif[]).map((n) => [n.id, n]));

  const memberIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_id).filter(Boolean))] as string[];
  const [membersRes, profilesRes] = await Promise.all([
    memberIds.length
      ? db.from("track_members").select("id, email, notify_email, name, profile_id").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; notify_email: boolean; name: string; profile_id: string | null }[] }),
    profileIds.length
      ? db.from("profiles").select("id, email, notify_email, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; notify_email: boolean; full_name: string }[] }),
  ]);
  const memberById = new Map(((membersRes.data ?? []) as { id: string; email: string | null; notify_email: boolean; profile_id: string | null }[]).map((m) => [m.id, m]));
  const profileById = new Map(((profilesRes.data ?? []) as { id: string; email: string | null; notify_email: boolean }[]).map((p) => [p.id, p]));

  // El interruptor maestro "Recibe emails" vive en track_members.notify_email (Mi perfil
  // y Equipo escriben AHÍ). profiles.notify_email no lo escribe nadie. Los avisos por
  // ROL (lead/admin en scope, watch_all) van dirigidos al PROFILE, y aquí se leía el
  // interruptor del profile → apagar el correo no apagaba justo el tráfico más
  // voluminoso. Se resuelve el roster de cada profile y manda SU interruptor; el
  // del profile queda como respaldo para quien no tiene fila en el roster (clientes).
  // (reap pre-lanzamiento 2026-09-02, sweep C2)
  const { data: rosterDePerfil } = profileIds.length
    ? await db.from("track_members").select("profile_id, notify_email, email").in("profile_id", profileIds).eq("active", true)
    : { data: [] as { profile_id: string; notify_email: boolean; email: string | null }[] };
  const memberByProfile = new Map(
    ((rosterDePerfil ?? []) as { profile_id: string; notify_email: boolean; email: string | null }[]).map((m) => [m.profile_id, m]),
  );

  // Preferencia por-evento (0050): el email de cada notificación se decide por la fila
  // notification_prefs (profile_id, type) de la persona — MANDA sobre el default del
  // catálogo. Resuelve el profile del destinatario (directo, o vía el member) y precarga
  // sus filas para los tipos en juego. El in-app ya se entregó en el trigger (amplio).
  const perfilDe = (n: Notif): string | null =>
    n.recipient_id ?? (n.recipient_member_id ? memberById.get(n.recipient_member_id)?.profile_id ?? null : null);
  const prefProfileIds = [...new Set(((notifs ?? []) as Notif[]).map(perfilDe).filter(Boolean))] as string[];
  const { data: prefsRows } = prefProfileIds.length
    ? await db.from("notification_prefs").select("profile_id, event_type, email").in("profile_id", prefProfileIds)
    : { data: [] as { profile_id: string; event_type: string; email: boolean }[] };
  const prefByKey = new Map(
    ((prefsRows ?? []) as { profile_id: string; event_type: string; email: boolean }[]).map((r) => [`${r.profile_id}|${r.event_type}`, r.email]),
  );

  // El estado final SE VERIFICA: si este update falla, la fila se queda en 'sending' y
  // sólo la rescata la ventana de STALE_SENDING_MIN de arriba — que quede registrado.
  const marcar = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await db.from("notification_deliveries").update(patch).eq("id", id);
    if (error) console.error(`[notif-email] no se pudo marcar ${id} como ${String(patch.status)}:`, error.message);
  };

  let sent = 0, skipped = 0, failed = 0;
  for (const d of rows) {
    const n = notifById.get(d.notification_id);
    if (!n) { await marcar(d.id, { status: "skipped", error: "sin notificación" }); skipped++; continue; }

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
    if (!decision.enviar) { await marcar(d.id, { status: "skipped", error: decision.razon }); skipped++; continue; }

    const cta = ctaUrl({ ...n, esCliente: !n.recipient_member_id && !!n.recipient_id && n.type === "ready_for_review" });
    const res = await sendEmail({
      to: email!,
      subject: n.title,
      text: textFor(n.title, n.body, cta),
      html: htmlFor({ type: n.type, title: n.title, body: n.body, ctaUrl: cta }),
    });
    if (res.ok) {
      await marcar(d.id, { status: "sent", sent_at: new Date().toISOString(), provider_id: res.id ?? null });
      sent++;
    } else {
      await marcar(d.id, { status: "failed", error: res.error ?? "error desconocido" });
      failed++;
    }
  }

  return { sent, skipped, failed };
}
