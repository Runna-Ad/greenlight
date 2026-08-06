// Prueba de envío de email (Gmail SMTP). Corre:
//   node scripts/send-test-email.mjs [destinatario]
// Lee GMAIL_USER / GMAIL_APP_PASSWORD de .env.local. Si no pasas destinatario,
// se manda a sí mismo (GMAIL_USER). Úsalo para confirmar que el App Password de
// unique@runna.com.mx funciona antes de fiarte del pipeline.
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

let env = {};
try {
  env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
} catch {
  console.error("No se pudo leer .env.local");
  process.exit(1);
}

const user = env.GMAIL_USER || process.env.GMAIL_USER;
const pass = env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
const to = process.argv[2] || user;

if (!user || !pass) {
  console.error("❌ Faltan GMAIL_USER / GMAIL_APP_PASSWORD en .env.local");
  process.exit(1);
}

const t = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user, pass },
});

try {
  const info = await t.sendMail({
    from: `Greenlight <${user}>`,
    to,
    subject: "Prueba de Greenlight ✅",
    text: "Si ves esto, el email de Greenlight (Gmail SMTP) funciona.",
    html: "<p>Si ves esto, el <b>email de Greenlight</b> (Gmail SMTP) funciona. 🎉</p>",
  });
  console.log(`✅ enviado: ${info.messageId} → ${to}`);
} catch (e) {
  console.error("❌ falló el envío:", e.message);
  process.exit(1);
} finally {
  t.close();
}
