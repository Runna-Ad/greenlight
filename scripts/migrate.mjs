// Greenlight migration runner.
//
// WHY NOT `supabase db push`: Greenlight shares a Supabase project with S.P.A.M,
// which owns `supabase_migrations.schema_migrations` (31 entries from a different
// repo). `db push` demands that the local migrations directory match that table,
// and its suggested remedy — `migration repair --status reverted 0001..0031` —
// would mark S.P.A.M's live migrations as reverted. Never run that.
//
// Instead Greenlight keeps its OWN ledger at `produccion._migrations`, so the two
// apps' histories are as separate as their schemas.
//
//   node scripts/migrate.mjs          → apply pending
//   node scripts/migrate.mjs --status → show what's applied/pending
//   --only <version>                  → apply ONLY that pending migration (Pedro approves each one by name)
//   --project-ref <ref>               → target that project instead of the linked one (no `supabase link` needed)
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DIR = "supabase/migrations";
const statusOnly = process.argv.includes("--status");
const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const only = arg("--only");
const ref = arg("--project-ref");
if (process.argv.includes("--only") && !/^\d{14}$/.test(only ?? "")) {
  console.error("--only necesita la versión de 14 dígitos (p. ej. 20261014120001).");
  process.exit(1);
}
if (process.argv.includes("--project-ref") && !/^[a-z]{20}$/.test(ref ?? "")) {
  console.error("--project-ref necesita el id del proyecto (20 letras).");
  process.exit(1);
}
const destino = ref ? ["--linked", "--project-ref", ref] : ["--linked"];

/** Run SQL against the linked project, returning parsed rows. */
function query(sql) {
  const tmp = `/tmp/gl-migrate-${Date.now()}.sql`;
  writeFileSync(tmp, sql);
  try {
    const out = execFileSync(
      "supabase",
      ["db", "query", ...destino, "--file", tmp, "-o", "json"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
    const start = out.indexOf("[");
    const end = out.lastIndexOf("]");
    return start >= 0 && end > start ? JSON.parse(out.slice(start, end + 1)) : [];
  } finally {
    unlinkSync(tmp);
  }
}

// The ledger lives inside our own schema, so it can never disturb S.P.A.M's.
query(`
  create schema if not exists produccion;
  create table if not exists produccion._migrations (
    version    text primary key,
    name       text not null,
    applied_at timestamptz not null default now()
  );
`);

const applied = new Set(
  query("select version from produccion._migrations;").map((r) => r.version),
);

const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const pending = files.filter((f) => !applied.has(f.split("_")[0]) && (!only || f.split("_")[0] === only));
if (only && !pending.length) {
  console.error(`\n${only}: no está pendiente (ya aplicada, o no existe ese archivo).\n`);
  process.exit(1);
}

console.log(`\n${applied.size} aplicadas · ${pending.length} pendientes\n`);
for (const f of files) {
  console.log(`  ${applied.has(f.split("_")[0]) ? "✓" : "·"} ${f}`);
}

if (statusOnly) process.exit(0);
if (!pending.length) {
  console.log("\n✅ Nada que aplicar\n");
  process.exit(0);
}

console.log("");
for (const file of pending) {
  const version = file.split("_")[0];
  process.stdout.write(`  aplicando ${file} … `);
  const sql = readFileSync(join(DIR, file), "utf8");
  try {
    // Each migration runs in ONE transaction: a failure leaves nothing behind.
    query(
      `begin;\n${sql}\ninsert into produccion._migrations (version, name) values ('${version}', '${file.replace(/'/g, "''")}');\ncommit;`,
    );
    console.log("ok");
  } catch (e) {
    console.log("FALLÓ");
    const msg = String(e.stderr || e.stdout || e.message);
    console.error(`\n${msg.slice(0, 1200)}\n`);
    console.error("Transacción revertida — no se aplicó nada de este archivo.\n");
    process.exit(1);
  }
}
console.log("\n✅ Migraciones aplicadas\n");
