// Tests the sheet parser against the REAL DiDi sheet (live fetch) plus
// offline unit cases. Run: node scripts/test-sync.mjs
import {
  parseCsv,
  parseSheetCsv,
  mapHeader,
  naturalKey,
  rowHash,
  diffRows,
  csvUrl,
  trackForTab,
} from "../src/lib/sheet-sync.ts";

const SHEET = "16QAbNy9sljgm610uTLwIIGDbZAv5_d0o4L0Iu3_JTjA";
const REAL_TAB = "Real (Card/Préstamos | Brief 24/07)";
const NORMAL_TAB = "Normal (Card/Préstamos | Brief 24/07)";

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

console.log("\n▶ CSV parser (offline)");
{
  const g = parseCsv('a,b\n"x,1","y\n2"\n');
  eq("quoted comma stays in field", g[1][0], "x,1");
  eq("quoted newline stays in field", g[1][1], "y\n2");
  const q = parseCsv('"he said ""hi"""\n');
  eq("escaped quotes", q[0][0], 'he said "hi"');
}

console.log("\n▶ Header validation (the wrong-tab guard)");
{
  ok("valid header maps", mapHeader(["# Entrega", "Asignación", "Marca", "Naming", "# Idea"]) !== null);
  ok(
    "foreign tab header rejected",
    mapHeader(["Tripleta", "Comentarios", "Peloteo", "Plataforma"]) === null,
  );
  const r = parseSheetCsv('"Tripleta","Comentarios"\n"x","y"\n');
  ok("parseSheetCsv errors on wrong tab", "error" in r);
}

console.log("\n▶ Identity + change detection");
{
  const a = { Marca: "Card", Naming: "SPAPVOY", "# Idea": "A4", "Versión": "V1", "Tipo de Asset": "RP Video" };
  const b = { ...a, Concepto: "algo nuevo" };
  eq("same task ⇒ same natural key", naturalKey("Real (x)", a), naturalKey("Real (x)", b));
  ok("edited row ⇒ different hash", rowHash(a) !== rowHash(b));
  ok("accents/case ignored in key", naturalKey("REAL (X)", a) === naturalKey("real (x)", a));

  const rows = [{ rowNumber: 2, data: a }];
  eq("unseen ⇒ new", diffRows("t", rows, new Map())[0].status, "new");
  eq(
    "seen + same hash ⇒ unchanged",
    diffRows("t", rows, new Map([[naturalKey("t", a), rowHash(a)]]))[0].status,
    "unchanged",
  );
  eq(
    "seen + different hash ⇒ updated",
    diffRows("t", rows, new Map([[naturalKey("t", a), "deadbeef"]]))[0].status,
    "updated",
  );
}

console.log("\n▶ Track inference");
eq("Real tab", trackForTab(REAL_TAB), "real");
eq("Normal tab", trackForTab(NORMAL_TAB), "normal");
eq("unknown tab", trackForTab("Card | Brief 17"), null);

console.log("\n▶ Tab classification (a project = one tab: track + date)");
{
  const { classifyTab, classifyTabs } = await import("../src/lib/sheet-sync.ts");
  const TODAY = new Date(2026, 7, 1); // fixed so tests don't drift with the clock

  const p = classifyTab("Real (Card/Préstamos | Brief 24/07)", TODAY);
  eq("canonical Real ⇒ project", p.kind, "project");
  eq("  track", p.track, "real");
  eq("  label", p.label, "Brief 24/07");
  eq("  sortable date", p.dateSort, 20260724);

  const n = classifyTab("Normal (Card/Préstamos | Brief 24/07)", TODAY);
  eq("canonical Normal ⇒ project", n.kind, "project");
  ok("same date + different track ⇒ DIFFERENT projects", p.name !== n.name && p.track !== n.track);

  eq("template Real excluded", classifyTab("Template Real (Card/Préstamos | Brief)", TODAY).kind, "template");
  eq("template Normal excluded", classifyTab("Template Normal (Card/Préstamos)", TODAY).kind, "template");
  eq("Control excluded", classifyTab("Control", TODAY).kind, "control");
  // the legacy/odd names must be VISIBLE, not silently dropped
  eq("legacy tab ⇒ unrecognized", classifyTab("Card | Brief 24", TODAY).kind, "unrecognized");
  // "Brief" is optional — these are REAL tab names in the sheet (older projects)
  const noBrief = classifyTab("Real (Card/Préstamos | 10/07 )", TODAY);
  eq("no 'Brief' word ⇒ still a project", noBrief.kind, "project");
  eq("  date parsed anyway", noBrief.label, "Brief 10/07");
  eq("  track parsed anyway", noBrief.track, "real");
  eq("trailing space tolerated", classifyTab("Real (Card/Préstamos | 26/06 )", TODAY).label, "Brief 26/06");
  // but a date with no separator is still junk
  eq("date without slash ⇒ unrecognized", classifyTab("Real (Card/Préstamos | 1007 )", TODAY).kind, "unrecognized");

  // December tab read in January belongs to the previous year
  eq(
    "year rolls back across New Year",
    classifyTab("Real (Card/Préstamos | Brief 20/12)", new Date(2027, 0, 5)).dateSort,
    20261220,
  );

  const sorted = classifyTabs(
    [
      "Control",
      "Card | Brief 24",
      "Normal (Card/Préstamos | Brief 10/07)",
      "Template Real (Card/Préstamos | Brief)",
      "Real (Card/Préstamos | Brief 24/07)",
      "Normal (Card/Préstamos | Brief 24/07)",
    ],
    TODAY,
  );
  eq("newest project first", sorted[0].name, "Real (Card/Préstamos | Brief 24/07)");
  eq("  its Normal pair next", sorted[1].name, "Normal (Card/Préstamos | Brief 24/07)");
  eq("  then the older project", sorted[2].label, "Brief 10/07");
  eq("templates/control sink to the bottom", sorted[sorted.length - 1].kind, "control");
}

console.log("\n▶ LIVE fetch from the real DiDi sheet");
try {
  for (const [label, tab] of [
    ["REAL", REAL_TAB],
    ["NORMAL", NORMAL_TAB],
  ]) {
    const res = await fetch(csvUrl(SHEET, tab));
    ok(`${label}: HTTP ${res.status}`, res.ok);
    const parsed = parseSheetCsv(await res.text());
    if ("error" in parsed) {
      ok(`${label}: parsed`, false, parsed.error);
      continue;
    }
    ok(`${label}: ${parsed.rows.length} tareas, ${parsed.skippedEmpty} filas vacías omitidas`, parsed.rows.length > 0);
    const first = parsed.rows[0];
    console.log(
      `      ej. fila ${first.rowNumber}: ${first.data["Naming"] ?? "(sin naming)"} · ` +
        `${first.data["Tipo de Asset"] ?? "?"} · ${first.data["Asignación"] ?? "sin asignar"}`,
    );
    // every row must produce a distinct identity, or dedup would collapse tasks
    const keys = new Set(parsed.rows.map((r) => naturalKey(tab, r.data)));
    ok(
      `${label}: identidades únicas (${keys.size}/${parsed.rows.length})`,
      keys.size === parsed.rows.length,
      keys.size !== parsed.rows.length ? "→ filas distintas comparten identidad" : "",
    );
    // re-running the same sync must import nothing new
    const known = new Map(parsed.rows.map((r) => [naturalKey(tab, r.data), rowHash(r.data)]));
    const second = diffRows(tab, parsed.rows, known);
    ok(
      `${label}: re-sync no duplica (0 nuevas)`,
      second.every((r) => r.status === "unchanged"),
    );
  }

  // the wrong-tab guard, against the live sheet
  const bogus = await fetch(csvUrl(SHEET, "__no_existe__"));
  const bogusParsed = parseSheetCsv(await bogus.text());
  ok("tab inexistente ⇒ error, NO importa la primera pestaña", "error" in bogusParsed);
} catch (e) {
  ok("live fetch", false, e.message);
}

// ── Apps Script adapter, end to end (only when configured) ──
{
  const url = process.env.SHEETS_SCRIPT_URL;
  const secret = process.env.SHEETS_SCRIPT_SECRET;
  if (!url || !secret) {
    console.log("\n▶ Apps Script — omitido (sin SHEETS_SCRIPT_URL/SECRET)");
  } else {
    console.log("\n▶ Apps Script — conector en vivo");
    const { fetchTabsViaScript, fetchRowsViaScript, classifyTabs } = await import(
      "../src/lib/sheet-sync.ts"
    );

    // wrong secret must be refused
    let refused = false;
    try {
      await fetchTabsViaScript(url, "definitivamente-incorrecto");
    } catch {
      refused = true;
    }
    ok("secreto incorrecto ⇒ rechazado", refused);

    const tabs = await fetchTabsViaScript(url, secret);
    ok(`lista ${tabs.length} pestañas con nombre completo`, tabs.length > 0);
    ok(
      "nombres sin truncar (contienen '/')",
      tabs.some((t) => t.name.includes("Card/Préstamos")),
    );

    const visible = tabs.filter((t) => !t.hidden).map((t) => t.name);
    const projects = classifyTabs(visible).filter((t) => t.kind === "project");
    ok(`${projects.length} proyectos visibles, todos reconocidos`, projects.length === visible.length);

    // read every project and confirm rows parse
    let totalRows = 0;
    for (const p of projects) {
      const parsed = await fetchRowsViaScript(url, secret, p.name);
      if ("error" in parsed) {
        ok(`${p.label} ${p.track}`, false, parsed.error);
        continue;
      }
      totalRows += parsed.rows.length;
      ok(`${p.label} ${String(p.track).padEnd(6)} → ${parsed.rows.length} tareas`, parsed.rows.length > 0);
    }
    ok(`${totalRows} tareas importables en total`, totalRows > 0);

    // a tab that doesn't exist must ERROR, never fall back to another tab
    const bogus = await fetchRowsViaScript(url, secret, "__no_existe__");
    ok("pestaña inexistente ⇒ error explícito", "error" in bogus);
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
