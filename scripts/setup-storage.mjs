// Crea (si no existe) el bucket de referencias en el proyecto Supabase.
//
// FUERA de las migraciones a propósito: check-isolation.mjs mata cualquier .sql
// que mencione `storage.` (protege a S.P.A.M), y PGlite no tiene el esquema
// storage. Así que el bucket se crea por la API de Storage, con service-role.
//
// Idempotente: se puede correr las veces que sea. NO está en `npm test`.
//   node scripts/setup-storage.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "greenlight-referencias";

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

if (buckets.some((b) => b.name === BUCKET)) {
  console.log(`✓ El bucket "${BUCKET}" ya existe — nada que hacer.`);
  process.exit(0);
}

// PRIVADO: la app no tiene login; un bucket público volvería cada referencia
// una URL permanente e indexable. La lectura va por signed URL desde el servidor.
const { error: createErr } = await db.storage.createBucket(BUCKET, {
  public: false,
  fileSizeLimit: "10MB",
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
});

if (createErr) {
  console.error(`No se pudo crear "${BUCKET}":`, createErr.message);
  process.exit(1);
}
console.log(`✅ Bucket privado "${BUCKET}" creado (límite 10 MB, sólo imágenes).`);
