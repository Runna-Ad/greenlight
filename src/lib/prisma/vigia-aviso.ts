import "server-only";
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
import { correoVigia, type AvisoVigia } from "@/lib/prisma/vigia";

type Db = ReturnType<typeof supabaseAdmin>;

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";
/** Directo a la pestaña: /admin → H.Ü.E HUB → Prisma → Vigía. */
export const URL_VIGIA = `${APP_URL}/admin?tab=hue&hub=prisma&vista=vigia`;

/** Manda el aviso a cada Master Builder activo. Un correo que falla queda en el log y NO tumba la corrida
 *  (las propuestas ya están guardadas en el Hub). */
export async function avisarPropuestas(db: Db, nuevas: AvisoVigia[]): Promise<{ enviados: number; error?: string }> {
  const correo = correoVigia(nuevas);
  if (!correo) return { enviados: 0 };
  if (!hasEmail()) return { enviados: 0, error: "correo no configurado" };
  const { data, error } = await db.from("profiles").select("email").eq("role", "master").eq("active", true);
  if (error) {
    console.error(`[prisma/vigia] aviso: no se pudieron leer los masters: ${error.message}`);
    return { enviados: 0, error: "no se pudieron leer los destinatarios" };
  }
  const destinos = [...new Set(((data ?? []) as { email: string | null }[]).map((p) => p.email?.trim().toLowerCase()).filter((e): e is string => !!e && /^[^\s@]+@[^\s@]+$/.test(e)))];
  let enviados = 0;
  for (const to of destinos) {
    const r = await sendEmail({
      to,
      subject: correo.asunto,
      text: textFor(correo.titulo, correo.cuerpo, URL_VIGIA),
      html: htmlFor({ type: "vigia_propuestas", title: correo.titulo, body: correo.cuerpo, ctaUrl: URL_VIGIA, saltos: true }),
    });
    if (r.ok) enviados++;
    else console.error(`[prisma/vigia] aviso a un master falló: ${r.error}`);
  }
  return { enviados };
}
