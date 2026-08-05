import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
