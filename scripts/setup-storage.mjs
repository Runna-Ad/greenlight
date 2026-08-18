// Crea (si no existen) los buckets de Storage del proyecto Supabase.
//
// FUERA de las migraciones a propósito: check-isolation.mjs mata cualquier .sql
// que mencione `storage.` (protege a S.P.A.M), y PGlite no tiene el esquema
// storage. Así que los buckets se crean por la API de Storage, con service-role.
//
// Idempotente: se puede correr las veces que sea. NO está en `npm test`.
//   node scripts/setup-storage.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const IMAGENES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

// Dos buckets, distinta política:
//  - referencias: PRIVADO. La app no tiene login; público lo volvería indexable.
//    Se lee por signed URL desde el servidor.
//  - logos: PÚBLICO. Son logos de marca (assets públicos, sin PII), se muestran
//    en muchos lados (la cabecera usa next/image `unoptimized`) y así se evita
//    firmar una URL por render. Se guarda getPublicUrl en marcas.logo_url.
const BUCKETS = [
  { name: "greenlight-referencias", public: false, fileSizeLimit: "10MB", allowedMimeTypes: IMAGENES },
  { name: "greenlight-logos", public: true, fileSizeLimit: "10MB", allowedMimeTypes: IMAGENES },
];

// Cargar .env.local sin dependencias (los scripts de este repo no usan dotenv).
function cargarEnv() {
  try {
    for (const linea of readFileSync(".env.local", "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // sin .env.local: se usa lo que ya esté en el entorno
  }
}
cargarEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);

const { data: buckets, error: listErr } = await db.storage.listBuckets();
if (listErr) {
  console.error("No se pudieron listar los buckets:", listErr.message);
  process.exit(1);
}

for (const b of BUCKETS) {
  if (buckets.some((x) => x.name === b.name)) {
    console.log(`✓ El bucket "${b.name}" ya existe — nada que hacer.`);
    continue;
  }
  const { error: createErr } = await db.storage.createBucket(b.name, {
    public: b.public,
    fileSizeLimit: b.fileSizeLimit,
    allowedMimeTypes: b.allowedMimeTypes,
  });
  if (createErr) {
    console.error(`No se pudo crear "${b.name}":`, createErr.message);
    process.exit(1);
  }
  console.log(`✅ Bucket ${b.public ? "público" : "privado"} "${b.name}" creado.`);
}
