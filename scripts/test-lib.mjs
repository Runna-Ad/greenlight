// Pure-logic tests for the intake libs (no DB). Run: node scripts/test-lib.mjs
// Node 24 strips TS types on import; the `import type` in filename.ts is erased.
import { buildFilename, isValidOverride, normToken } from "../src/lib/filename.ts";
import { missingRequired, requiredFor, tipoGroup, generatesFiles } from "../src/lib/required.ts";
import { actionsFor, waitingLabel } from "../src/lib/task-actions.ts";
import { plantillaPara, readTimeS, parseDuracion, compararDuracion, nuevoPlano, nuevoEstatico, PLACEHOLDER_GUION, PLACEHOLDER_ESTATICO } from "../src/lib/plantilla.ts";

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


// ── Obligatorios por Tipo de Asset ──
console.log("\n▶ Obligatorios — dependen del Tipo de Asset");

const fila = (o) => o;
const COMPLETA_VIDEO = fila({
  "Asignación": "Flor, Mony", "Marca": "Card", "# Entrega": "1ra entrega",
  "Tipo de Asset": "RP Video", "Concepto": "Un concepto", "Plataforma": "FB, GG",
  "Naming": "SPAPVOYTOURISM", "# Idea": "A1", "Tamaño": "9:16", "Duración": "10-40s",
});

eq("los 4 tipos de video piden lo mismo", ["RP Video","Normal Video","AIGC video","GIF"].every(t => tipoGroup(t) === "video"), true);
eq("Images es su propio grupo", tipoGroup("Images"), "images");
eq("Copies es su propio grupo", tipoGroup("Copies"), "copies");
eq("un tipo desconocido cae en el grupo más exigente", tipoGroup("Podcast"), "video");

eq("una fila de video completa no tiene faltantes", missingRequired(COMPLETA_VIDEO).length, 0);
eq("video exige Duración", missingRequired({ ...COMPLETA_VIDEO, "Duración": "" }).join(), "Duración");
eq('"-" en Duración cuenta como vacío', missingRequired({ ...COMPLETA_VIDEO, "Duración": "-" }).join(), "Duración");

// Images: mismo caso pero sin Duración — 5 de 5 filas reales del sheet no la traen.
const IMAGEN = { ...COMPLETA_VIDEO, "Tipo de Asset": "Images", "Duración": "" };
eq("Images NO exige Duración", missingRequired(IMAGEN).length, 0);

// Copies: las 2 filas reales del Brief 24/07 no traen Naming, # Idea ni Tamaño.
const COPY_REAL = {
  "Asignación": "Viri", "Marca": "Card", "# Entrega": "1ra entrega",
  "Tipo de Asset": "Copies", "Concepto": "15 Headlines + descripción", "Plataforma": "GG",
};
eq("Copies no exige Naming, # Idea ni Tamaño", missingRequired(COPY_REAL).length, 0);
eq("Copies SÍ exige Asignación", missingRequired({ ...COPY_REAL, "Asignación": "" }).join(), "Asignación");
eq("Copies SÍ exige Marca", missingRequired({ ...COPY_REAL, "Marca": "" }).join(), "Marca");

// La queja original de Pedro: no se crean tareas sin responsable.
eq("sin Asignación siempre falta, en los 3 grupos",
  ["RP Video","Images","Copies"].every(t => missingRequired({ ...COPY_REAL, "Tipo de Asset": t, "Asignación": "", "Naming":"X", "# Idea":"A1", "Tamaño":"9:16", "Duración":"10s" }).includes("Asignación")),
  true);

eq("video pide 10 campos", requiredFor("RP Video").length, 10);
eq("images pide 9", requiredFor("Images").length, 9);
eq("copies pide 6", requiredFor("Copies").length, 6);

// El fantasma: un copy no es un archivo con proporción.
eq("Copies NO genera entregables", generatesFiles("Copies"), false);
eq("Images sí genera entregables", generatesFiles("Images"), true);
eq("RP Video sí genera entregables", generatesFiles("RP Video"), true);

// ── Botones por estado × rol × asignación ──
console.log("\n▶ Botones — estado × rol × si es tu tarea");

const asignado = { isAssignee: true, role: "creative", hasAssignee: true };
const lead = { isAssignee: false, role: "lead", hasAssignee: true };
const ajeno = { isAssignee: false, role: "creative", hasAssignee: true };
const labels = (s, c) => actionsFor(s, c).map(a => a.label).join(" · ");

eq("el asignado empieza una tarea por hacer", labels("todo", asignado), "Empezar");
eq("sin responsable no hay botón de empezar", labels("todo", { ...asignado, hasAssignee: false }), "");
eq("y se explica por qué", waitingLabel("todo", { ...asignado, hasAssignee: false }), "Falta responsable");
eq("un creativo ajeno no empieza tu tarea", labels("todo", ajeno), "");
eq("el lead sí puede empezar cualquiera", labels("todo", lead), "Empezar");

eq("en progreso → mandar a revisión", labels("in_progress", asignado), "Mandar a revisión");
eq("en revisión el asignado sólo espera", labels("under_review", asignado), "");
eq("y se le dice", waitingLabel("under_review", asignado), "Esperando revisión");
eq("en revisión el lead aprueba o pide cambios", labels("under_review", lead), "Aprobar · Mandar cambios");
eq("mandar cambios exige texto", actionsFor("under_review", lead).find(a => a.tone === "danger").needsBody, true);
eq("correcciones → retomar", labels("in_corrections", asignado), "Retomar");
eq("el cliente no mueve nada", ["todo","in_progress","under_review","in_corrections"].every(s => actionsFor(s, { isAssignee: false, role: "client", hasAssignee: true }).length === 0), true);
eq("completado no tiene botón (vive en Mover)", labels("completed", lead), "");


// ── Plantilla de trabajo ──
console.log("\n▶ Plantilla de trabajo");

eq("los 4 tipos de video usan el guión",
   ["RP Video","Normal Video","AIGC video","GIF"].every(t => plantillaPara(t) === "guion"), true);
eq("Images usa la plantilla de estático", plantillaPara("Images"), "estatico");
eq("Copies tiene la suya", plantillaPara("Copies"), "copies");
eq("un tipo desconocido cae en guión", plantillaPara("Podcast"), "guion");

// El mapa está separado del de obligatorios A PROPÓSITO. Hoy coinciden; si
// alguien los separa, que sea deliberado y no en silencio.
const equivalente = { guion: "video", estatico: "images", copies: "copies" };
eq("plantillaPara y tipoGroup siguen de acuerdo en los 6 tipos + desconocido",
   ["RP Video","Normal Video","AIGC video","GIF","Images","Copies","Podcast"]
     .every(t => equivalente[plantillaPara(t)] === tipoGroup(t)), true);

// Read-time: espejo del trigger
eq("sin diálogo, 0s", readTimeS(""), 0);
eq("sólo espacios, 0s", readTimeS("   "), 0);
eq("null, 0s", readTimeS(null), 0);
eq("1 palabra → 1s", readTimeS("Hola"), 1);
eq("11 palabras / 2.5 → 5s",
   readTimeS("Hasta seis por ciento de cashback en todas tus compras diarias"), 5);
eq("espacios múltiples y saltos cuentan como uno",
   readTimeS("Hola   mundo\n\ncruel"), readTimeS("Hola mundo cruel"));

// Duración
eq("'15-30s' se lee como rango", JSON.stringify(parseDuracion("15-30s")), '{"min":15,"max":30}');
eq("'30s' es un punto", JSON.stringify(parseDuracion("30s")), '{"min":30,"max":30}');
eq("'-' no es duración", parseDuracion("-"), null);
eq("vacío tampoco", parseDuracion(""), null);
eq("texto libre tampoco", parseDuracion("lo que salga"), null);

// Tres estados, nunca dos: un ✓ por defecto sería un falso verde.
eq("dentro de rango", compararDuracion(20, "15-30s").estado, "dentro");
eq("se pasa", compararDuracion(45, "15-30s").estado, "excede");
eq("se queda corto", compararDuracion(8, "15-30s").estado, "corto");
eq("sin duración legible NO dice que está bien",
   compararDuracion(20, "-").estado, "sin-referencia");
ok("y lo explica en vez de callarse",
   compararDuracion(20, "-").mensaje.includes("sin duración"));

// Las instrucciones del deck son PLACEHOLDER, jamás valor inicial.
const plano = nuevoPlano(1);
const estatico = nuevoEstatico(1);
const textos = [...Object.values(PLACEHOLDER_GUION), ...Object.values(PLACEHOLDER_ESTATICO)];
eq("un plano nuevo llega con todos los campos de texto vacíos",
   Object.entries(plano).filter(([k]) => !["orden","es_cierre"].includes(k)).every(([,v]) => v === null), true);
eq("un estático nuevo también",
   Object.entries(estatico).filter(([k]) => k !== "orden").every(([,v]) => v === null), true);
eq("ninguna instrucción del deck aparece como dato",
   [...Object.values(plano), ...Object.values(estatico)]
     .some(v => typeof v === "string" && textos.includes(v)), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
