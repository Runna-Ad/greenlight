import type { NextConfig } from "next";

// Cabeceras de seguridad para TODA respuesta. Sin ellas la app se podía meter en un
// iframe ajeno (clickjacking sobre "Aprobar" del portal) y el token del magic link
// (/auth/confirm?token_hash=…) viajaba en el Referer a cualquier recurso externo.
// CSP completa de scripts queda para después (necesita nonces en Next 16); aquí va
// frame-ancestors, que es la parte que importa hoy. (reap pre-lanzamiento 2026-09-02)
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    serverActions: {
      // Las referencias se suben por Server Action. El default de Next es 1 MB,
      // que corta cualquier imagen real ANTES de que corra la validación de
      // 10 MB del servidor (daba "Body exceeded 1 MB limit", 413). Se sube a
      // 10 MB para que coincida con MAX_BYTES de lib/referencia.ts.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
