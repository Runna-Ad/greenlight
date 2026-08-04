// Pure-logic tests for the intake libs (no DB). Run: node scripts/test-lib.mjs
// Node 24 strips TS types on import; the `import type` in filename.ts is erased.
import { buildFilename, isValidOverride, normToken } from "../src/lib/filename.ts";

let pass = 0,
  fail = 0;
const eq = (name, got, want) => {
  if (got === want) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}\n      got:  ${got}\n      want: ${want}`);
  }
};
const ok = (name, cond) => eq(name, !!cond, true);

console.log("\n▶ buildFilename() — must match DB build_filename()");
eq(
  "real full",
  buildFilename({ kind: "real", base: "RECOMMENDRUMORS", tamano: "9:16", duracion: "25s", genero: "WOMAN", idea: "G2", plataforma: "FB", version: 1, mes: "MAR26" }),
  "RECOMMENDRUMORS_9X16_25S_WOMAN_REAL_VIDEO_IDEAG2_FB_V1_MAR26_RN",
);
eq(
  "normal (formato replaces REAL)",
  buildFilename({ kind: "normal", base: "SPAPFISHFILTER", tamano: "9:16", duracion: "30s", genero: "WOMAN", formato: "STOCK", idea: "B", plataforma: "TT", version: 1, mes: "AUG26" }),
  "SPAPFISHFILTER_9X16_30S_WOMAN_STOCK_VIDEO_IDEAB_TT_V1_AUG26_RN",
);
eq(
  "static drops duration",
  buildFilename({ kind: "static", base: "NAMING", tamano: "1:1", genero: "WOMANMAN", formato: "STOCK", idea: "1", plataforma: "GG", version: 1, mes: "AUG26" }),
  "NAMING_1X1_WOMANMAN_STOCK_STATIC_IDEA1_GG_V1_AUG26_RN",
);
eq(
  "genero NA omitted",
  buildFilename({ kind: "static", base: "NAMING", tamano: "1:1", genero: "NA", formato: "STOCK", idea: "1", plataforma: "GG", version: 1, mes: "AUG26" }),
  "NAMING_1X1_STOCK_STATIC_IDEA1_GG_V1_AUG26_RN",
);
eq("normToken colon→x + spaces + upper", normToken("9:16 s"), "9X16S");
// Sheet-fidelity rules (2026-07-30)
eq("Género 'N/A' normalises to NA", normToken("N/A"), "NA");
eq(
  "'N/A' género is omitted from filename",
  buildFilename({ kind: "real", base: "T", tamano: "9:16", duracion: "25s", genero: "N/A", idea: "A1", plataforma: "FB", version: 1, mes: "AUG26" }),
  "T_9X16_25S_REAL_VIDEO_IDEAA1_FB_V1_AUG26_RN",
);
eq("hyphenated duration survives", normToken("20-30s"), "20-30S");
eq("size '2736 x 1260' → 2736X1260", normToken("2736 x 1260"), "2736X1260");
eq("'1.91:1' keeps the dot", normToken("1.91:1"), "1.91X1");
ok("hyphenated override is valid", isValidOverride("CASHBACK_9X16_20-30S_RN"));
// Regression: a missing Formato must not produce "WOMAN__VIDEO"
{
  const f = buildFilename({ kind: "normal", base: "T", tamano: "9:16", duracion: "15s-30s", genero: "WOMAN", formato: "", idea: "B", plataforma: "FB", version: 1, mes: "AUG26" });
  ok("no double underscore when a token is empty", !f.includes("__"));
  eq("empty token is dropped entirely", f, "T_9X16_15S-30S_WOMAN_VIDEO_IDEAB_FB_V1_AUG26_RN");
}
ok("valid override accepted", isValidOverride("CUSTOM_9X16_THING_RN"));
ok("invalid override rejected", !isValidOverride("bad name"));

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
