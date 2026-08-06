import "server-only";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { decisionEmail } from "@/lib/notif-routing";

const APP_URL = process.env.APP_URL ?? "https://runna-command-center.vercel.app";

function urlAbsoluta(url: string | null): string {
  if (!url) return APP_URL;
  if (/^https?:\/\//i.test(url)) return url;
  return `${APP_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function htmlEmail(titulo: string, cuerpo: string | null, url: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#1f1d2e">
  <div style="background:#00E676;height:4px;border-radius:4px 4px 0 0"></div>
  <div style="border:1px solid #ece8f5;border-top:none;border-radius:0 0 10px 10px;padding:24px">
    <p style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#775cbf;margin:0 0 8px">Greenlight</p>
    <h1 style="font-size:18px;margin:0 0 10px;color:#2d2b55">${escapeHtml(titulo)}</h1>
    ${cuerpo ? `<p style="font-size:14px;line-height:1.5;color:#555;margin:0 0 20px">${escapeHtml(cuerpo)}</p>` : ""}
    <a href="${url}" style="display:inline-block;background:#2d2b55;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Abrir en Greenlight →</a>
    <p style="font-size:11px;color:#999;margin:24px 0 0">Recibes esto porque tienes tareas en Greenlight · Rünna. Puedes desactivar los emails en tu perfil.</p>
  </div>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export type DispatchResult = { sent: number; skipped: number; failed: number; sinConfig?: boolean };

/**
 * Drena la cola de emails pendientes y los manda (Gmail SMTP, sender
 * unique@runna.com.mx). Se llama INLINE después de cada cambio de estado —
 * corre en el servidor de Vercel, así no depende de la frecuencia de un cron.
 * Idempotente: sólo toma filas 'pending' y las marca sent/skipped/failed.
 */
export async function dispatchPendingEmails(limit = 50): Promise<DispatchResult> {
  if (!hasSupabase()) return { sent: 0, skipped: 0, failed: 0 };
  if (!hasEmail()) return { sent: 0, skipped: 0, failed: 0, sinConfig: true };
  const db = supabaseAdmin();

  const { data: pend } = await db
    .from("notification_deliveries")
    .select("id, notification_id")
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  const rows = (pend ?? []) as { id: string; notification_id: string }[];
  if (!rows.length) return { sent: 0, skipped: 0, failed: 0 };

  const notifIds = [...new Set(rows.map((r) => r.notification_id))];
  const { data: notifs } = await db
    .from("notifications")
    .select("id, type, title, body, url, recipient_member_id, recipient_id")
    .in("id", notifIds);
  type Notif = {
    id: string; type: string | null; title: string; body: string | null; url: string | null;
    recipient_member_id: string | null; recipient_id: string | null;
  };
  const notifById = new Map<string, Notif>(((notifs ?? []) as Notif[]).map((n) => [n.id, n]));

  const memberIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_member_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(((notifs ?? []) as Notif[]).map((n) => n.recipient_id).filter(Boolean))] as string[];
  const [membersRes, profilesRes] = await Promise.all([
    memberIds.length
      ? db.from("track_members").select("id, email, notify_email, name").in("id", memberIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; notify_email: boolean; name: string }[] }),
    profileIds.length
      ? db.from("profiles").select("id, email, notify_email, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; notify_email: boolean; full_name: string }[] }),
  ]);
  const memberById = new Map(((membersRes.data ?? []) as { id: string; email: string | null; notify_email: boolean }[]).map((m) => [m.id, m]));
  const profileById = new Map(((profilesRes.data ?? []) as { id: string; email: string | null; notify_email: boolean }[]).map((p) => [p.id, p]));

  const marcar = (id: string, patch: Record<string, unknown>) =>
    db.from("notification_deliveries").update(patch).eq("id", id);

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
      email = p?.email ?? null; notifyEmail = p?.notify_email ?? false;
    }

    const decision = decisionEmail({ type: n.type, notifyEmail, email });
    if (!decision.enviar) { await marcar(d.id, { status: "skipped", error: decision.razon }); skipped++; continue; }

    const url = urlAbsoluta(n.url);
    const res = await sendEmail({
      to: email!,
      subject: n.title,
      text: `${n.body ?? ""}\n\nAbrir en Greenlight: ${url}`.trim(),
      html: htmlEmail(n.title, n.body, url),
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
