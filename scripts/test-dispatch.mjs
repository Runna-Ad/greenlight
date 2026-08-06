// Prueba END-TO-END del dispatcher de emails contra la base REAL, reversible.
// Corre: node scripts/test-dispatch.mjs
// Inserta una notificación + entrega 'pending' para un miembro con email de
// prueba (petedv31@gmail.com), ejecuta la MISMA lógica que src/lib/notif-email.ts
// (leer cola → resolver email → enviar por Gmail SMTP → marcar), verifica que
// quedó 'sent', y LIMPIA TODO (borra la notif y restaura el email del miembro).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { decisionEmail } from "../src/lib/notif-routing.ts";

const TO = "petedv31@gmail.com";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "produccion" }, auth: { persistSession: false },
});
const gmailUser = env.GMAIL_USER, gmailPass = env.GMAIL_APP_PASSWORD;

let memberId, oldEmail, oldNotify, notifId, delivId;
try {
  // 1. un miembro real → email de prueba (guardo lo anterior para restaurar)
  const { data: mem } = await db.from("track_members")
    .select("id, name, email, notify_email").eq("active", true).order("sort_order").limit(1).single();
  memberId = mem.id; oldEmail = mem.email; oldNotify = mem.notify_email;
  await db.from("track_members").update({ email: TO, notify_email: true }).eq("id", memberId);
  console.log(`· miembro de prueba: ${mem.name} (email temporal → ${TO})`);

  // 2. notificación + entrega 'pending' (como las que crea el fan-out real)
  const { data: n } = await db.from("notifications").insert({
    recipient_member_id: memberId, type: "task_approved",
    title: "Prueba end-to-end · Greenlight",
    body: "Si ves esto, el dispatcher resolvió tu email y lo envió de verdad. 🎉",
    url: "/didi/tablero",
  }).select("id").single();
  notifId = n.id;
  const { data: d } = await db.from("notification_deliveries")
    .insert({ notification_id: notifId, channel: "email", status: "pending" })
    .select("id").single();
  delivId = d.id;
  console.log(`· cola: entrega 'pending' ${delivId} creada`);

  // 3. LA MISMA lógica de dispatchPendingEmails (leer → resolver → enviar → marcar)
  const { data: pend } = await db.from("notification_deliveries")
    .select("id, notification_id").eq("channel", "email").eq("status", "pending").eq("id", delivId);
  const row = pend[0];
  const { data: notif } = await db.from("notifications")
    .select("id, type, title, body, url, recipient_member_id, recipient_id").eq("id", row.notification_id).single();
  const { data: m } = await db.from("track_members")
    .select("email, notify_email").eq("id", notif.recipient_member_id).single();
  const decision = decisionEmail({ type: notif.type, notifyEmail: m.notify_email, email: m.email });
  console.log(`· ruteo: ${decision.enviar ? "ENVIAR" : "skip"} (${decision.razon})`);
  if (!decision.enviar) throw new Error("el ruteo dijo skip — no debería");

  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gmailUser, pass: gmailPass } });
  const info = await t.sendMail({
    from: `Greenlight <${gmailUser}>`, to: m.email,
    subject: notif.title, text: `${notif.body}\n\nAbrir: https://runna-command-center.vercel.app${notif.url}`,
  });
  t.close();
  await db.from("notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: info.messageId }).eq("id", delivId);
  console.log(`· ENVIADO: ${info.messageId} → ${m.email}`);

  // 4. verificar el estado final de la entrega
  const { data: fin } = await db.from("notification_deliveries").select("status, provider_id").eq("id", delivId).single();
  console.log(`· entrega quedó: status=${fin.status} provider_id=${fin.provider_id ? "sí" : "no"}`);
  console.log(fin.status === "sent" ? "\n✅ END-TO-END OK" : "\n❌ no quedó 'sent'");
} finally {
  // 5. LIMPIEZA — borra la notif (cascade borra la entrega) y restaura el email
  if (notifId) await db.from("notifications").delete().eq("id", notifId);
  if (memberId) await db.from("track_members").update({ email: oldEmail, notify_email: oldNotify }).eq("id", memberId);
  console.log("· limpieza: notif borrada, email del miembro restaurado");
}
