import { escapeHtml } from "@/lib/email-template";

/** La página pública y sencilla que ve el admin de un cliente en el flujo «Add to Slack». */
export function paginaSlack(titulo: string, texto: string, status = 200): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Greenlight · Slack</title><style>body{font-family:system-ui,sans-serif;background:#f6f5fb;color:#1a1530;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{background:#fff;border:1px solid #e4e0f0;border-radius:12px;padding:28px;max-width:420px}h1{font-size:20px;margin:0 0 8px}p{margin:0;line-height:1.5}</style></head><body><main><h1>${escapeHtml(titulo)}</h1><p>${escapeHtml(texto)}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
