import "server-only";
import nodemailer from "nodemailer";

/**
 * Envío de email vía Gmail SMTP (mismo patrón que "Brooklyn" en SnapTrack): se
 * manda desde una cuenta real de Google Workspace con un App Password, y Gmail
 * resuelve SPF/DKIM/DMARC — cero verificación de dominio.
 *
 * SERVER ONLY. Las credenciales viven SÓLO en env (Vercel), NUNCA en el repo
 * (que es público): GMAIL_USER = unique@runna.com.mx, GMAIL_APP_PASSWORD.
 */

export function hasEmail(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** El remitente visible: "Greenlight <unique@runna.com.mx>". */
function fromLine(user: string): string {
  return `Greenlight <${user}>`;
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "Faltan GMAIL_USER / GMAIL_APP_PASSWORD en el entorno." };
  }

  // Transporte fresco por envío y se cierra al final (como SnapTrack) — evita
  // conexiones colgadas en serverless.
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from: fromLine(user),
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    return { ok: true, id: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    transporter.close();
  }
}
