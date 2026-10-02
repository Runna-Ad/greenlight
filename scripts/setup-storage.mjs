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

// Documentos del KB de H.Ü.E: pdf/docx/txt/md → se extrae el texto al subir.
const KB_DOCS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
];

// Dos buckets, distinta política:
//  - referencias: PRIVADO. La app no tiene login; público lo volvería indexable.
//    Se lee por signed URL desde el servidor.
//  - logos: PÚBLICO. Son logos de marca (assets públicos, sin PII), se muestran
//    en muchos lados (la cabecera usa next/image `unoptimized`) y así se evita
//    firmar una URL por render. Se guarda getPublicUrl en marcas.logo_url.
const BUCKETS = [
  { name: "greenlight-referencias", public: false, fileSizeLimit: "10MB", allowedMimeTypes: IMAGENES },
  { name: "greenlight-logos", public: true, fileSizeLimit: "10MB", allowedMimeTypes: IMAGENES },
  // KB de H.Ü.E: PRIVADO (docs de entrenamiento, se leen server-side por signed URL).
  { name: "greenlight-kb", public: false, fileSizeLimit: "20MB", allowedMimeTypes: KB_DOCS },
  // Prisma › Formatos: PRIVADO. El anuncio subido (fuente/…) y sus tamaños (salida/<lote>/…). Sube el
  // navegador directo con una URL firmada (Vercel corta los cuerpos de más de 4.5 MB); se lee firmado.
  { name: "greenlight-formatos", public: false, fileSizeLimit: "25MB", allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] },
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

// "25MB" puede quedar guardado como 25·1000² o 25·1024² según la versión de Storage: ambas cuentan como iguales
// (si no, la revisión "corregiría" todos los buckets en cada corrida y escondería un cambio real).
const MB = (v) => Number(String(v).replace(/MB$/i, ""));
const mismoTope = (bytes, v) => [1000 * 1000, 1024 * 1024].some((u) => Number(bytes) === MB(v) * u);
for (const b of BUCKETS) {
  const existe = buckets.find((x) => x.name === b.name);
  if (existe) {
    // Que exista no basta: en un proyecto compartido alguien pudo crearlo a mano (público, sin tope). Si su
    // configuración no es la de aquí, se corrige.
    const igual =
      existe.public === b.public &&
      mismoTope(existe.file_size_limit, b.fileSizeLimit) &&
      JSON.stringify([...(existe.allowed_mime_types ?? [])].sort()) === JSON.stringify([...b.allowedMimeTypes].sort());
    if (igual) {
      console.log(`✓ El bucket "${b.name}" ya existe con la configuración correcta.`);
      continue;
    }
    const { error: updErr } = await db.storage.updateBucket(b.name, { public: b.public, fileSizeLimit: b.fileSizeLimit, allowedMimeTypes: b.allowedMimeTypes });
    if (updErr) {
      console.error(`El bucket "${b.name}" existe con OTRA configuración y no se pudo corregir:`, updErr.message);
      process.exit(1);
    }
    console.log(`✅ Bucket "${b.name}": configuración corregida (${b.public ? "público" : "privado"}, ${b.fileSizeLimit}).`);
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
