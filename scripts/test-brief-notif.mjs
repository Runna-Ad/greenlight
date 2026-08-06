// Prueba END-TO-END del aviso "nuevo brief" contra la base REAL, reversible.
// Corre: node scripts/test-brief-notif.mjs
// Crea un brief de prueba con 2 tareas asignadas a un miembro (email temporal →
// petedv31@gmail.com), corre rpc_notificar_brief + la lógica del dispatcher
// (leer cola → resolver → enviar por Gmail SMTP → marcar), verifica que el aviso
// dice "2 tareas" y que el email salió, y BORRA TODO (el brief cascada + restaura
// el email del miembro).
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

let memberId, oldEmail, oldNotify, briefId;
try {
  const { data: client } = await db.from("clients").select("id").eq("slug", "didi").single();
  const { data: mem } = await db.from("track_members").select("id,name,email,notify_email").eq("active", true).order("sort_order").limit(1).single();
  memberId = mem.id; oldEmail = mem.email; oldNotify = mem.notify_email;
  await db.from("track_members").update({ email: TO, notify_email: true }).eq("id", memberId);
  console.log(`· miembro: ${mem.name} (email temporal → ${TO})`);

  // brief de prueba con 2 tareas asignadas al miembro
  const { data: brief } = await db.from("briefs").insert({ client_id: client.id, code: "ZZ-NOTIF-TEST", title: "Brief de prueba (aviso)" }).select("id").single();
  briefId = brief.id;
  const { data: fam } = await db.from("idea_families").insert({ brief_id: briefId, letter: "A" }).select("id").single();
  for (let v = 1; v <= 2; v++) {
    const { data: idea } = await db.from("ideas").insert({ family_id: fam.id, brief_id: briefId, variant_number: v, naming_kind: "real" }).select("id").single();
    await db.from("idea_assignments").insert({ idea_id: idea.id, member_id: memberId });
  }
  console.log("· brief de prueba con 2 tareas creado");

  // el aviso (lo que llama la server action tras crear el brief)
  const n = (await db.rpc("rpc_notificar_brief", { p_brief_id: briefId })).data;
  console.log(`· rpc_notificar_brief → ${n} aviso(s)`);

  const { data: notif } = await db.from("notifications").select("id,type,title,body,url,recipient_member_id").eq("recipient_member_id", memberId).eq("type", "brief_created").order("created_at", { ascending: false }).limit(1).single();
  console.log(`· aviso: "${notif.title}" — ${notif.body}`);

  // dispatcher (misma lógica que notif-email.ts)
  const { data: deliv } = await db.from("notification_deliveries").select("id").eq("notification_id", notif.id).eq("channel", "email").eq("status", "pending").single();
  const decision = decisionEmail({ type: notif.type, notifyEmail: true, email: TO });
  if (!decision.enviar) throw new Error("ruteo dijo skip");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
  const info = await t.sendMail({ from: `Greenlight <${env.GMAIL_USER}>`, to: TO, subject: notif.title, text: `${notif.body}\n\nAbrir: https://runna-command-center.vercel.app${notif.url}` });
  t.close();
  await db.from("notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: info.messageId }).eq("id", deliv.id);
  console.log(`· ENVIADO: ${info.messageId} → ${TO}`);

  const okBody = notif.body.startsWith("Tienes 2 tareas");
  console.log(okBody ? "\n✅ END-TO-END OK (aviso dice 2 tareas, email enviado)" : `\n❌ el cuerpo no dice 2 tareas: ${notif.body}`);
} finally {
  if (briefId) await db.from("briefs").delete().eq("id", briefId); // cascade: ideas, assignments, notifs, deliveries
  if (memberId) await db.from("track_members").update({ email: oldEmail, notify_email: oldNotify }).eq("id", memberId);
  console.log("· limpieza: brief de prueba borrado (cascade), email restaurado");
}
