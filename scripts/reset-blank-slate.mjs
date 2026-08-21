// ─────────────────────────────────────────────────────────────────────────────
// BLANK-SLATE RESET — Greenlight go-live prep (Phase 0)
//
// Wipes all WORK CONTENT + PEOPLE from the `produccion` schema so the platform
// starts empty for the final pre-live test, while KEEPING the DiDi client, its
// brands, and the reusable library/config (vocab, rules, snippets, matrices).
//
// ⛔ DESTRUCTIVE + IRREVERSIBLE on production data. Gated three ways:
//   1. Default run = DRY RUN. It prints every table's row count + its
//      KEEP/DELETE/REVIEW classification and the computed delete order, then
//      STOPS. Nothing is written.
//   2. `--run` is required to actually delete — and even then it refuses if any
//      table is left unclassified or any REVIEW table hasn't been resolved.
//   3. Pedro must say "yes, run it" in-session first. Claude runs the dry-run,
//      shows the counts, waits for the explicit go, THEN runs with `--run`.
//
// Usage:
//   node scripts/reset-blank-slate.mjs            # dry run against PROD (linked)
//   node scripts/reset-blank-slate.mjs --pglite   # self-test the order on PGlite
//   node scripts/reset-blank-slate.mjs --run       # DESTRUCTIVE: delete on PROD
//
// PROD access uses the same `supabase db query --linked` path as migrate.mjs
// (the CLI has a persistent login). `produccion` schema only — never public/storage.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DRY = !process.argv.includes("--run");
const PGLITE = process.argv.includes("--pglite");

// ── Table classification — the heart of the review. Edit these lists to move a
// table between buckets; the script fails loudly if any produccion table is left
// out of all three, so a newly-added table can never be silently skipped.
//
// KEEP  = config / library / seed data the platform needs to function.
// DELETE = work-product content + people (re-created cleanly on first login).
// REVIEW = genuinely ambiguous — Pedro must move each to KEEP or DELETE before
//          a real `--run` is allowed.
const KEEP = new Set([
  "clients",                // DiDi — explicit keep
  "marcas",                 // Card, Préstamos — explicit keep
  "vocab_terms",            // naming vocabulary (naming builder needs it)
  "size_platform_validity", // size×platform validity matrix
  "reglas",                 // contextual production rules (7 seeded)
  "snippets",               // legal + selling-point library
  "pods",                   // team pod definitions
  "sheet_sources",          // Google-Sheet connection config — KEEP so sync stays wired (Pedro, 2026-08-20)
]);

// Ordered children→parents is computed automatically from the FK graph; this is
// just the SET of tables to delete. Order does not matter here.
const DELETE = new Set([
  "briefs", "idea_families", "ideas", "planos", "estaticos", "assets",
  "asset_versions", "comments", "status_events", "activity_log",
  "notifications", "notification_deliveries", "idea_assignments",
  "idea_references", "plano_references", "estatico_references",
  "field_edits", "gary_reviews", "idea_snippets", "delivery_waves",
  "staged_rows", "sync_runs",
  "references",             // stale sheet-imported links — DELETE for a true blank slate (Pedro, 2026-08-20)
  "pending_invites",        // runtime access-request queue — clear on reset
  "track_members", "profiles",
]);

// Ambiguous — Pedro decides. Treated as KEEP (never auto-deleted) until moved.
// Resolved 2026-08-20: references→DELETE, sheet_sources→KEEP. None left.
const REVIEW = new Set([]);

// ── SQL backends ─────────────────────────────────────────────────────────────
// Two ways to run SQL and get rows back: PROD (via the linked Supabase CLI) or a
// throwaway PGlite built from the migrations (for --pglite self-test).
async function makeRunner() {
  if (PGLITE) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const migDir = join(here, "..", "supabase", "migrations");
    const db = await PGlite.create();
    for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(join(migDir, f), "utf8"));
    }
    await seedFixture(db); // minimal content covering the tricky FK edges
    return {
      query: async (sql) => (await db.query(sql)).rows,
      exec: async (sql) => { await db.exec(sql); },
      label: "PGlite (self-test)",
    };
  }
  // PROD: mirror migrate.mjs — write SQL to a temp file, run through the CLI.
  const query = (sql) => {
    const tmp = `/tmp/gl-reset-${process.pid}-${Math.round(process.hrtime()[1])}.sql`;
    writeFileSync(tmp, sql);
    try {
      const out = execFileSync(
        "supabase",
        ["db", "query", "--linked", "--file", tmp, "-o", "json"],
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
      );
      const s = out.indexOf("["), e = out.lastIndexOf("]");
      return s >= 0 && e > s ? JSON.parse(out.slice(s, e + 1)) : [];
    } finally {
      unlinkSync(tmp);
    }
  };
  return {
    query: async (sql) => query(sql),
    exec: async (sql) => { query(sql); },
    label: "PROD (Supabase --linked · produccion)",
  };
}

// Fixture for --pglite: one row through every FK layer + a KEEP→DELETE edge
// (clients.created_by → profiles) so the null-out step is exercised.
async function seedFixture(db) {
  await db.exec(`
    insert into produccion.profiles (id,email,full_name,role)
      values ('00000000-0000-0000-0000-0000000000f1','a@runna.mx','A','master');
    insert into produccion.clients (id,name,slug) values
      ('00000000-0000-0000-0000-000000000001','DiDi','didi');
    insert into produccion.marcas (id,client_id,name,slug) values
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','Card','card');
    insert into produccion.track_members (name,track,color,profile_id)
      values ('Ana','real','#fff','00000000-0000-0000-0000-0000000000f1');
    insert into produccion.briefs (id,client_id,code,title) values
      ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000001','DIDI-01','B');
    insert into produccion.idea_families (id,brief_id,letter) values
      ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','A');
    insert into produccion.ideas (id,family_id,brief_id,variant_number,naming_kind,naming_base,genero_code,mes_code)
      values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',1,'real','X','WOMAN','MAR26');
    insert into produccion.idea_assignments (idea_id, member_id)
      select '00000000-0000-0000-0000-0000000000d1', id from produccion.track_members limit 1;
  `);
  // Best-effort KEEP→DELETE edge: only if clients has a created_by column.
  await db.exec(`
    do $$ begin
      if exists (select 1 from information_schema.columns
                 where table_schema='produccion' and table_name='clients' and column_name='created_by') then
        update produccion.clients set created_by='00000000-0000-0000-0000-0000000000f1'
          where id='00000000-0000-0000-0000-000000000001';
      end if;
    end $$;
  `).catch(() => {});
}

// ── FK graph → delete order ──────────────────────────────────────────────────
// Real (non-self) FK edges child→parent inside produccion.
const FK_SQL = `
  select rc.relname as child, rp.relname as parent,
         (select array_agg(att.attname order by k.ord)
            from unnest(con.conkey) with ordinality k(attnum,ord)
            join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k.attnum) as child_cols
  from pg_constraint con
  join pg_class rc on rc.oid=con.conrelid
  join pg_namespace nc on nc.oid=rc.relnamespace
  join pg_class rp on rp.oid=con.confrelid
  where con.contype='f' and nc.nspname='produccion' and rc.oid<>rp.oid;
`;

const TABLES_SQL = `
  select table_name from information_schema.tables
  where table_schema='produccion' and table_type='BASE TABLE'
  and table_name <> '_migrations';
`;

const COUNT_SQL = (t) => `select count(*)::int as n from produccion."${t}"`;

// Kahn topological sort: a DELETE table may be dropped only once every DELETE
// table that references it is already gone. Returns [orderedChildrenFirst].
function deleteOrder(edges, del) {
  const nodes = new Set(del);
  // referrers[parent] = set of children (within DELETE) that point at it
  const referrers = new Map([...nodes].map((t) => [t, new Set()]));
  for (const { child, parent } of edges) {
    if (nodes.has(child) && nodes.has(parent) && child !== parent) {
      referrers.get(parent).add(child);
    }
  }
  const order = [];
  const remaining = new Set(nodes);
  while (remaining.size) {
    // a table with no remaining referrers can be deleted now (children first)
    const ready = [...remaining].filter(
      (t) => [...referrers.get(t)].every((c) => !remaining.has(c)),
    );
    if (!ready.length) {
      throw new Error(
        `FK cycle among DELETE tables: ${[...remaining].join(", ")} — resolve by hand.`,
      );
    }
    ready.sort();
    for (const t of ready) { order.push(t); remaining.delete(t); }
  }
  return order;
}

// KEEP/REVIEW tables whose FK columns point INTO the DELETE set — must be nulled
// before the referenced rows are deleted (or a restrict FK would block it).
function keepToDeleteNulls(edges, del, keptSet) {
  const out = [];
  for (const { child, parent, child_cols } of edges) {
    if (keptSet.has(child) && del.has(parent) && child !== parent) {
      out.push({ table: child, cols: child_cols || [] });
    }
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────
const R = await makeRunner();
console.log(`\n🧭 Reset · backend: ${R.label} · mode: ${DRY ? "DRY RUN (no writes)" : "🔴 --run (DESTRUCTIVE)"}\n`);

const allTables = (await R.query(TABLES_SQL)).map((r) => r.table_name).sort();

// Safety: every table must be classified. An unclassified table aborts.
const unclassified = allTables.filter(
  (t) => !KEEP.has(t) && !DELETE.has(t) && !REVIEW.has(t),
);
if (unclassified.length) {
  console.error(`❌ Tablas sin clasificar (añádelas a KEEP / DELETE / REVIEW):\n   ${unclassified.join(", ")}\n`);
  process.exit(1);
}

// Counts for the report.
const counts = {};
for (const t of allTables) counts[t] = (await R.query(COUNT_SQL(t)))[0].n;

// Postgres text[] comes back as a real array from PGlite but as a literal
// string ("{a,b}") from the Supabase CLI's JSON — normalize to a JS array.
const toArr = (v) =>
  Array.isArray(v) ? v
  : typeof v === "string" ? v.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
  : [];
const edges = (await R.query(FK_SQL)).map((e) => ({ ...e, child_cols: toArr(e.child_cols) }));
const keptSet = new Set([...KEEP, ...REVIEW]); // REVIEW is treated as kept until resolved
const order = deleteOrder(edges, DELETE);
const nulls = keepToDeleteNulls(edges, DELETE, keptSet);

// ── Report ───────────────────────────────────────────────────────────────────
const show = (title, list) => {
  console.log(title);
  for (const t of list) console.log(`   ${String(counts[t]).padStart(6)}  ${t}`);
  console.log("");
};
show("🟢 KEEP (config / library / seed):", [...KEEP].filter((t) => allTables.includes(t)).sort());
show("🟡 REVIEW (Pedro decides — kept until moved):", [...REVIEW].filter((t) => allTables.includes(t)).sort());
show("🔴 DELETE (order = children→parents):", order);

const delRows = order.reduce((s, t) => s + counts[t], 0);
console.log(`   Σ ${delRows} filas a borrar en ${order.length} tablas.\n`);

if (nulls.length) {
  console.log("🔗 Antes de borrar, se anulan estas columnas FK de tablas KEEP→DELETE:");
  for (const { table, cols } of nulls) console.log(`   ${table}: ${cols.join(", ")}`);
  console.log("");
}

if (DRY) {
  console.log("✅ DRY RUN — no se tocó nada. Revisa la clasificación y los conteos.");
  console.log("   Para ejecutar (tras el OK de Pedro): node scripts/reset-blank-slate.mjs --run\n");
  process.exit(0);
}

// ── Destructive path (--run) ─────────────────────────────────────────────────
if (REVIEW.size && !PGLITE) {
  const stillReview = [...REVIEW].filter((t) => allTables.includes(t));
  if (stillReview.length) {
    console.error(`❌ Hay tablas en REVIEW sin resolver: ${stillReview.join(", ")}`);
    console.error("   Muévelas a KEEP o DELETE (edita el script) antes de --run. Abortado.\n");
    process.exit(1);
  }
}

// One transaction: null the KEEP→DELETE columns, then delete children→parents.
const stmts = [
  ...nulls.flatMap(({ table, cols }) => cols.map((c) => `update produccion."${table}" set "${c}"=null;`)),
  ...order.map((t) => `delete from produccion."${t}";`),
];
const tx = `begin;\n${stmts.join("\n")}\ncommit;`;

console.log("🔴 Ejecutando borrado en UNA transacción…\n");
await R.exec(tx);

// Re-count to prove the result.
console.log("📊 Después del reset:");
let bad = 0;
for (const t of order) {
  const n = (await R.query(COUNT_SQL(t)))[0].n;
  if (n !== 0) { bad++; console.log(`   ✗ ${t} = ${n} (esperado 0)`); }
}
for (const t of KEEP) {
  if (!allTables.includes(t)) continue;
  const n = (await R.query(COUNT_SQL(t)))[0].n;
  console.log(`   ${n === counts[t] ? "✓" : "⚠"} KEEP ${t} = ${n} (antes ${counts[t]})`);
}
console.log(bad === 0 ? "\n✅ Reset completo — tablas de contenido vacías, KEEP intactas.\n"
                       : `\n❌ ${bad} tabla(s) no quedaron vacías — revisa arriba.\n`);
process.exit(bad === 0 ? 0 : 1);
