import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import { slackApi } from "@/lib/slack-api";
import { esSlackUserId, mensajeSlack, usuarioSlackValido } from "@/lib/slack-routing";

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

/**
 * Aviso directo a los Master Builder (no pasa por la cola): campana, correo y DM en el
 * Slack de Runna. Quien no tiene Slack (no está en el espacio) sólo recibe los otros dos.
 * Nunca truena: un canal que falla se anota y los demás siguen.
 */
export async function avisarMasters(a: { type: string; title: string; body: string; ruta: string }): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("profiles").select("id, email").eq("role", "master").eq("active", true);
  if (error) { console.error("[aviso-master] no se pudieron leer los master:", error.message); return; }
  const masters = (data ?? []) as { id: string; email: string | null }[];
  if (!masters.length) return;
  const url = `${APP_URL}${a.ruta}`;

  const { error: inErr } = await db.from("notifications").insert(
    masters.map((m) => ({ recipient_id: m.id, type: a.type, title: a.title, body: a.body, url: a.ruta })),
  );
  if (inErr) console.error("[aviso-master] campana:", inErr.message);

  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const { data: miembros } = await db.from("track_members").select("profile_id, slack_user_id")
    .in("profile_id", masters.map((m) => m.id));
  const slackDe = new Map(((miembros ?? []) as { profile_id: string; slack_user_id: string | null }[])
    .filter((x) => x.slack_user_id && esSlackUserId(x.slack_user_id)).map((x) => [x.profile_id, x.slack_user_id!]));
  const msg = mensajeSlack({ title: a.title, body: a.body, ctaUrl: url });

  await Promise.allSettled(masters.map(async (m) => {
    if (hasEmail() && m.email) {
      await sendEmail({
        to: m.email, subject: `Greenlight · ${a.title}`,
        text: textFor(a.title, a.body, url), html: htmlFor({ type: a.type, title: a.title, body: a.body, ctaUrl: url }),
      }).catch((e) => console.error("[aviso-master] correo:", e));
    }
    if (!token) return;
    let canal = slackDe.get(m.id);
    if (!canal && m.email) {
      const r = await slackApi(token, "users.lookupByEmail", { email: m.email }, false);
      if (r.ok && usuarioSlackValido(r.user, null)) canal = (r.user as { id: string }).id;
    }
    if (!canal) return; // no está en el Slack de Runna
    const r = await slackApi(token, "chat.postMessage", { channel: canal, ...msg });
    if (!r.ok) console.error("[aviso-master] Slack:", r.error);
  }));
}
