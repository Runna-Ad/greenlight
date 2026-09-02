// El write-path del import del sheet (src/lib/import-lote.ts) contra una base FALSA
// en memoria. Run: node scripts/test-import.mjs
//
// Qué vigila que ninguna otra prueba vigila:
//  · que el número de CONSULTAS no crezca con las filas (5 filas y 40 = las mismas),
//  · que una fila mala no tumbe a las demás (lote atómico → reintento fila a fila),
//  · el contrato de re-sync: lo vivo se salta, lo de la papelera se reimporta,
//    una clave repetida en el mismo run crea UNA tarea, un brief que quedó vacío se borra.
//
// La base falsa imita lo que el import USA de supabase-js (from/select/eq/in/is/
// insert/upsert/delete/single/maybeSingle + el embed `ideas(deleted_at)`), con dos
// reglas de Postgres que importan aquí: un insert múltiple es ATÓMICO y el índice
// único de ideas (family_id, variant_number) choca.
import { ejecutarImport } from "../src/lib/import-lote.ts";

let pass = 0,
  fail = 0;
const ok = (n, c, extra = "") => {
  if (c) {
    pass++;
    console.log(`  ✓ ${n}`);
  } else {
    fail++;
    console.error(`  ✗ ${n} ${extra}`);
  }
};
const eq = (n, got, want) => ok(n, got === want, `\n      got:  ${got}\n      want: ${want}`);

// ── La base falsa ────────────────────────────────────────────────────────────
function baseFalsa() {
  const t = {
    vocab_terms: [], track_members: [], marcas: [], briefs: [], staged_rows: [],
    idea_families: [], ideas: [], idea_assignments: [], assets: [],
  };
  let seq = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const estado = { consultas: 0, fallos: [] };

  const cumple = (row, filtros) =>
    filtros.every(([op, k, v]) =>
      op === "eq" ? row[k] === v : op === "in" ? v.includes(row[k]) : op === "is" ? row[k] == null : true,
    );

  const defaults = (tabla, row) => {
    const r = { id: uuid(), deleted_at: null, ...row };
    if (tabla === "ideas") {
      const fam = t.idea_families.find((f) => f.id === r.family_id);
      r.code = `${fam?.letter ?? "?"}${r.variant_number}`; // lo que hace set_idea_code
    }
    return r;
  };

  const unicos = {
    ideas: [["id"], ["family_id", "variant_number"]],
    staged_rows: [["client_id", "natural_key"]],
    idea_assignments: [["idea_id", "member_id"]],
  };
  const choca = (tabla, filas) => {
    for (const cols of unicos[tabla] ?? []) {
      const vistos = new Set(t[tabla].map((r) => cols.map((c) => r[c]).join("|")));
      for (const f of filas) {
        const k = cols.map((c) => f[c]).join("|");
        if (vistos.has(k)) return `duplicate key (${cols.join(",")})=${k}`;
        vistos.add(k);
      }
    }
    return null;
  };

  function ejecutar(q) {
    const inyectado = estado.fallos.find(
      (f) => f.tabla === q.tabla && f.op === q.op && (q.payload ?? [null]).some((r) => f.cuando(r)),
    );
    if (inyectado) throw new Error(inyectado.msg);

    if (q.op === "select") {
      let rows = t[q.tabla].filter((r) => cumple(r, q.filtros));
      if (q.cols.includes("ideas(deleted_at)")) {
        rows = rows.map((r) => {
          const idea = t.ideas.find((i) => i.id === r.idea_id);
          return { ...r, ideas: idea ? { deleted_at: idea.deleted_at } : null };
        });
      }
      return { data: rows, error: null, count: q.count ? rows.length : null };
    }
    if (q.op === "insert") {
      const filas = q.payload.map((r) => defaults(q.tabla, r));
      const c = choca(q.tabla, filas);
      if (c) throw new Error(c); // atómico: nada entra
      t[q.tabla].push(...filas);
      return { data: q.returning ? filas : null, error: null, count: q.count ? filas.length : null };
    }
    if (q.op === "upsert") {
      const cols = q.opts.onConflict.split(",");
      const nuevas = q.payload.map((r) => defaults(q.tabla, r));
      for (const f of nuevas) {
        const i = t[q.tabla].findIndex((r) => cols.every((c) => r[c] === f[c]));
        if (i >= 0) t[q.tabla][i] = { ...t[q.tabla][i], ...f, id: t[q.tabla][i].id };
        else t[q.tabla].push(f);
      }
      return { data: null, error: null, count: null };
    }
    if (q.op === "delete") {
      t[q.tabla] = t[q.tabla].filter((r) => !cumple(r, q.filtros));
      return { data: null, error: null, count: null };
    }
    throw new Error(`op desconocida ${q.op}`);
  }

  function from(tabla) {
    const q = { tabla, op: "select", cols: "*", filtros: [], payload: null, opts: {}, returning: false, count: false, single: null };
    const b = {
      select(cols = "*", opts = {}) {
        q.cols = cols;
        q.returning = true;
        if (opts.count) q.count = true;
        return b;
      },
      insert(p, opts = {}) { q.op = "insert"; q.payload = Array.isArray(p) ? p : [p]; if (opts.count) q.count = true; return b; },
      upsert(p, opts = {}) { q.op = "upsert"; q.payload = Array.isArray(p) ? p : [p]; q.opts = opts; return b; },
      delete() { q.op = "delete"; return b; },
      eq(k, v) { q.filtros.push(["eq", k, v]); return b; },
      in(k, v) { q.filtros.push(["in", k, v]); return b; },
      is(k, v) { q.filtros.push(["is", k, v]); return b; },
      single() { q.single = "single"; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      then(resolve) {
        estado.consultas++;
        let out;
        try {
          out = ejecutar(q);
          if (q.single) {
            const rows = out.data ?? [];
            if (rows.length > 1 || (q.single === "single" && rows.length === 0)) throw new Error("single(): filas ≠ 1");
            out = { ...out, data: rows[0] ?? null };
          }
        } catch (e) {
          out = { data: null, error: { message: e.message }, count: null };
        }
        resolve(out);
      },
    };
    return b;
  }

  return {
    from,
    t,
    estado,
    fallar(f) { estado.fallos.push({ op: "insert", ...f }); },
    reset() { estado.consultas = 0; estado.fallos = []; },
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const CLIENT = "00000000-0000-0000-0000-00000000c001";
const ACTOR = "00000000-0000-0000-0000-0000000a0001";
const NILS = "00000000-0000-0000-0000-0000000d0001";
const CARD = "00000000-0000-0000-0000-0000000e0001";
const TAB_REAL = "Real (Card/Préstamos | Brief 24/07)";
const TAB_NORMAL = "Normal (Card/Préstamos | Brief 24/07)";

function conFixtures() {
  const db = baseFalsa();
  db.t.vocab_terms.push({ set: "genero", code: "WOMAN", label_es: "Mujer", track: "both" });
  db.t.track_members.push(
    { id: NILS, name: "Nils Vera", track: "real", role: "lead", es_lead: true, active: true },
    { id: "00000000-0000-0000-0000-0000000d0002", name: "Ana López", track: "normal", role: "lead", es_lead: true, active: true },
  );
  db.t.marcas.push({ id: CARD, name: "Card", client_id: CLIENT });
  return db;
}

/** Una fila de video válida: 1 tamaño × 2 plataformas × 2 duraciones = 4 assets. */
function fila(i, over = {}, tab = TAB_REAL) {
  const data = {
    Marca: "Card",
    Naming: `NAM${i}`,
    "# Idea": "A1", // el sheet reusa el código → la variante se reparte sola
    "Tipo de Asset": "RP Video",
    Concepto: `Concepto ${i}`,
    Plataforma: "FB, TT",
    "Tamaño": "9:16",
    "Duración": "15s, 30s",
    "# Entrega": "1",
    "Asignación": "Nils",
    "Género": "Mujer",
    Mes: "Ago",
    ...over,
  };
  return { key: `${tab}|${data.Naming}`.toLowerCase(), hash: `h${i}`, rowNumber: i + 2, tab, data };
}
const filas = (n, tab) => Array.from({ length: n }, (_, i) => fila(i + 1, {}, tab));
const ctx = { clientId: CLIENT, actorId: ACTOR };

// ── 1. Lo básico: un lote entero, bien ────────────────────────────────────────
console.log("\n▶ Import en lote — 40 filas de una pestaña");
let consultas40;
{
  const db = conFixtures();
  const r = await ejecutarImport(db, ctx, filas(40));
  consultas40 = db.estado.consultas;
  eq("ok", r.ok, true);
  eq("40 creadas", r.created, 40);
  eq("4 assets por fila (1 tamaño × 2 plat × 2 duraciones)", r.assets, 160);
  eq("0 saltadas", r.skipped, 0);
  eq("1 brief para la pestaña", db.t.briefs.length, 1);
  eq("1 familia (todas 'A')", db.t.idea_families.length, 1);
  const variantes = db.t.ideas.map((i) => i.variant_number).sort((a, b) => a - b);
  eq("variantes 1..40 sin choque", variantes.join(","), Array.from({ length: 40 }, (_, i) => i + 1).join(","));
  eq("código de idea = letra + variante", db.t.ideas.find((i) => i.variant_number === 7).code, "A7");
  eq("40 leads asignados (Nils → Nils Vera)", db.t.idea_assignments.filter((a) => a.es_lead && a.member_id === NILS).length, 40);
  eq("40 filas marcadas como importadas", db.t.staged_rows.length, 40);
  ok("cada staged apunta a su idea", db.t.staged_rows.every((s) => db.t.ideas.some((i) => i.id === s.idea_id)));
  eq("el asset lleva el código del sheet", db.t.assets[0].idea_code, "A1");
  eq("marca resuelta por nombre", db.t.ideas[0].marca_id, CARD);
  eq("Género label → code", db.t.ideas[0].genero_code, "WOMAN");
  console.log(`    (${consultas40} consultas para 40 filas)`);
}

// ── 2. Las consultas NO crecen con las filas ──────────────────────────────────
console.log("\n▶ Las consultas no crecen con las filas (el N+1 que se quitó)");
{
  const db = conFixtures();
  await ejecutarImport(db, ctx, filas(5));
  const consultas5 = db.estado.consultas;
  console.log(`    (${consultas5} consultas para 5 filas)`);
  eq("5 filas y 40 filas cuestan las MISMAS consultas", consultas40, consultas5);
  ok("menos de 15 consultas por lote", consultas5 < 15, `got ${consultas5}`);
}

// ── 3. Re-sync: idempotente ───────────────────────────────────────────────────
console.log("\n▶ Re-sync — lo vivo se salta, lo de la papelera vuelve");
{
  const db = conFixtures();
  await ejecutarImport(db, ctx, filas(10));
  db.reset();
  const r = await ejecutarImport(db, ctx, filas(10));
  eq("re-importar: 0 creadas", r.created, 0);
  eq("re-importar: 10 saltadas", r.skipped, 10);
  eq("siguen 10 ideas (sin duplicar)", db.t.ideas.length, 10);
  eq("re-importar en vacío no escribe (sólo lecturas)", db.t.staged_rows.length, 10);

  // Una tarea a la papelera → su fila vuelve a ser importable
  const idea3 = db.t.ideas.find((i) => i.naming_base === "NAM3");
  idea3.deleted_at = "2026-09-01T00:00:00Z";
  const r2 = await ejecutarImport(db, ctx, filas(10));
  eq("tras sellar una: 1 creada", r2.created, 1);
  eq("…y 9 saltadas", r2.skipped, 9);
  const nueva = db.t.ideas.filter((i) => i.naming_base === "NAM3" && !i.deleted_at)[0];
  ok("la nueva toma la siguiente variante libre (la sellada cuenta)", nueva.variant_number === 11, `got ${nueva?.variant_number}`);
  eq("el staged ahora apunta a la nueva", db.t.staged_rows.find((s) => s.natural_key === fila(3).key).idea_id, nueva.id);

  // Fila huérfana (borrado duro de antes de la papelera): idea_id null → importable
  const s5 = db.t.staged_rows.find((s) => s.natural_key === fila(5).key);
  s5.idea_id = null;
  const r3 = await ejecutarImport(db, ctx, filas(10));
  eq("staged sin idea (huérfano) → se reimporta", r3.created, 1);
}

// ── 4. Clave repetida en el mismo run ────────────────────────────────────────
console.log("\n▶ Dos filas con la misma clave natural en un run");
{
  const db = conFixtures();
  const r = await ejecutarImport(db, ctx, [fila(1), fila(1, { Concepto: "otra" })]);
  eq("1 creada", r.created, 1);
  eq("1 saltada", r.skipped, 1);
  eq("1 staged", db.t.staged_rows.length, 1);
}

// ── 5. Obligatorios: se bloquea, no se crea; brief vacío se borra ─────────────
console.log("\n▶ Obligatorios y limpieza del brief vacío");
{
  const db = conFixtures();
  const r = await ejecutarImport(db, ctx, [fila(1), fila(2, { Concepto: "" }), fila(3, { "Duración": "-" })]);
  eq("1 creada", r.created, 1);
  eq("2 bloqueadas", r.blocked.length, 2);
  eq("bloqueada por Concepto", r.blocked[0].missing.join(","), "Concepto");
  eq("'-' cuenta como vacío (Duración)", r.blocked[1].missing.join(","), "Duración");
  eq("las bloqueadas cuentan como saltadas", r.skipped, 2);
  eq("el brief se queda (tiene 1 idea)", db.t.briefs.length, 1);

  // Otra pestaña donde TODO se bloquea → el brief nuevo se borra
  const r2 = await ejecutarImport(db, ctx, [fila(9, { Concepto: "" }, TAB_NORMAL)]);
  eq("0 creadas en la pestaña Normal", r2.created, 0);
  eq("el brief vacío de Normal se borró", db.t.briefs.filter((b) => b.source_tab === TAB_NORMAL).length, 0);
  eq("el brief de Real sigue", db.t.briefs.filter((b) => b.source_tab === TAB_REAL).length, 1);
  // …y "Asignación" vacía NO bloquea: se crea sin lead
  const r3 = await ejecutarImport(db, ctx, [fila(20, { "Asignación": "" })]);
  eq("sin Asignación → se crea igual", r3.created, 1);
  eq("…sin lead asignado", db.t.idea_assignments.filter((a) => a.idea_id === db.t.ideas.at(-1).id).length, 0);
  const r4 = await ejecutarImport(db, ctx, [fila(21, { "Asignación": "Ana" })]);
  eq("lead del OTRO track no casa (atado al track)", r4.created, 1);
  eq("…queda sin lead", db.t.idea_assignments.filter((a) => a.idea_id === db.t.ideas.at(-1).id).length, 0);
}

// ── 6. Copies: texto, sin archivos inventados ────────────────────────────────
console.log("\n▶ Copies no generan assets");
{
  const db = conFixtures();
  const r = await ejecutarImport(db, ctx, [fila(1, { "Tipo de Asset": "Copies", "Tamaño": "", "Duración": "", Naming: "" })]);
  eq("copy creado", r.created, 1);
  eq("0 assets", r.assets, 0);
  eq("staged igual marcado", db.t.staged_rows.length, 1);
}

// ── 7. Aislamiento: una fila mala no tumba el lote ───────────────────────────
console.log("\n▶ Un insert en lote que falla se reintenta fila a fila");
{
  const db = conFixtures();
  db.fallar({ tabla: "assets", cuando: (r) => r?.naming_base === "NAM3", msg: "boom assets" });
  const r = await ejecutarImport(db, ctx, filas(5));
  eq("5 ideas creadas", r.created, 5);
  eq("assets de las otras 4 entraron", r.assets, 16);
  eq("1 error, nombra a la mala", r.errors.filter((e) => e.startsWith("assets de NAM3")).length, 1);
  eq("ok=false (hubo error)", r.ok, false);
  eq("las 5 quedan marcadas como importadas", db.t.staged_rows.length, 5);
  eq("NAM3 no tiene assets", db.t.assets.filter((a) => a.naming_base === "NAM3").length, 0);
}
{
  const db = conFixtures();
  db.fallar({ tabla: "ideas", cuando: (r) => r?.naming_base === "NAM2", msg: "boom idea" });
  const r = await ejecutarImport(db, ctx, filas(4));
  eq("idea mala: 3 creadas", r.created, 3);
  eq("la mala NO tiene assets ni staged", db.t.staged_rows.length + db.t.assets.filter((a) => a.naming_base === "NAM2").length, 3);
  eq("error nombra la idea", r.errors.filter((e) => e.startsWith("NAM2: idea:")).length, 1);
  eq("las 3 buenas tienen sus 12 assets", r.assets, 12);
}
{
  const db = conFixtures();
  db.fallar({ tabla: "staged_rows", op: "upsert", cuando: (r) => r?.natural_key === fila(2).key, msg: "boom staged" });
  const r = await ejecutarImport(db, ctx, filas(3));
  eq("staged mala: las 3 ideas existen", r.created, 3);
  eq("2 marcadas", db.t.staged_rows.length, 2);
  ok("aviso RUIDOSO de posible duplicado", r.errors.some((e) => e.includes("re-sincronizar podría duplicarla")));
}

// ── 8. Lectura del dedup falla → se ABORTA (no se duplica a ciegas) ───────────
console.log("\n▶ Si no se puede leer lo ya sincronizado, no se importa nada");
{
  const db = conFixtures();
  db.estado.fallos.push({ tabla: "staged_rows", op: "select", cuando: () => true, msg: "red caída" });
  const r = await ejecutarImport(db, ctx, filas(3));
  eq("0 creadas", r.created, 0);
  eq("0 ideas en la base", db.t.ideas.length, 0);
  ok("error explica", r.errors[0].includes("ya sincronizado"));
  eq("no quedó ningún brief vacío atrás", db.t.briefs.length, 0);
}

// ── 9. Brief en la papelera: no se reusa ─────────────────────────────────────
console.log("\n▶ Un brief sellado no recibe tareas nuevas");
{
  const db = conFixtures();
  await ejecutarImport(db, ctx, filas(2));
  const viejo = db.t.briefs[0];
  viejo.deleted_at = "2026-09-01T00:00:00Z";
  for (const i of db.t.ideas) i.deleted_at = viejo.deleted_at;
  const r = await ejecutarImport(db, ctx, filas(2));
  eq("se reimportan (sus ideas estaban selladas)", r.created, 2);
  eq("en un brief NUEVO y vivo", db.t.briefs.filter((b) => !b.deleted_at).length, 1);
  ok("las nuevas ideas cuelgan del brief vivo", db.t.ideas.filter((i) => !i.deleted_at).every((i) => i.brief_id !== viejo.id));
}

// ── 10. Dos pestañas en un run ───────────────────────────────────────────────
console.log("\n▶ Dos pestañas (dos briefs, dos tracks) en un run");
{
  const db = conFixtures();
  const r = await ejecutarImport(db, ctx, [...filas(3, TAB_REAL), ...filas(2, TAB_NORMAL)]);
  eq("5 creadas", r.created, 5);
  eq("2 briefs", db.t.briefs.length, 2);
  eq("brief Normal con track normal", db.t.briefs.find((b) => b.source_tab === TAB_NORMAL).track, "normal");
  eq("2 familias (A en cada brief)", db.t.idea_families.length, 2);
  eq("las ideas de Normal llevan track normal", db.t.ideas.filter((i) => i.track === "normal").length, 2);
  eq("Nils (real) no se asigna a las de Normal", db.t.idea_assignments.length, 3);
}

console.log(`\n${fail ? "❌" : "✅"} ${pass} pass, ${fail} fail\n`);
process.exit(fail ? 1 : 0);
