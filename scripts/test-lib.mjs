// Pure-logic tests for the intake libs (no DB). Run: node scripts/test-lib.mjs
// Node 24 strips TS types on import; the `import type` in filename.ts is erased.
import { buildFilename, isValidOverride, normToken } from "../src/lib/filename.ts";
import { missingRequired, requiredFor, tipoGroup, generatesFiles } from "../src/lib/required.ts";
import { actionsFor, waitingLabel } from "../src/lib/task-actions.ts";
import { plantillaPara, readTimeS, parseDuracion, nuevoPlano, nuevoEstatico, PLACEHOLDER_GUION, PLACEHOLDER_ESTATICO, varianteGuion, placeholdersGuion, voz, notaGlobal } from "../src/lib/plantilla.ts";

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
// Enviar al cliente es un paso APARTE de aprobar (decisión de Pedro): dos
// puertas del lead. El especialista no lo ve.
eq("completado: el lead puede enviar a cliente", labels("completed", lead), "Enviar a cliente");
eq("completado: el especialista no ve el botón", labels("completed", asignado), "");
eq("enviar a cliente usa el verbo send_client",
   actionsFor("completed", lead)[0].verb, "send_client");


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


// ── Real Person vs Normal: no son la misma plantilla ──
console.log("\n▶ Variantes del guión");
eq("RP Video es la variante Real", varianteGuion("RP Video"), "real");
eq("Normal Video es Normal", varianteGuion("Normal Video"), "normal");
eq("AIGC video también es Normal", varianteGuion("AIGC video"), "normal");
eq("GIF también", varianteGuion("GIF"), "normal");

eq("en Real habla la Actriz / Actor", voz("RP Video"), "Actriz / Actor");
eq("en Normal habla una voz en off", voz("Normal Video"), "Mujer/Hombre (V.O)");

eq("Real numera el plano por locación", placeholdersGuion("RP Video").titulo, "Plano 1 - int. locación - MS");
eq("Normal lo numera por fondo", placeholdersGuion("Normal Video").titulo, "Plano 1 - fondo");
ok("Normal guía el diálogo con el máximo de 5 seg",
   placeholdersGuion("Normal Video").dialogo.includes("5 seg"));

ok("sólo Real lleva la nota de actriz/outfits", notaGlobal("RP Video")?.includes("outfits"));
eq("Normal no lleva nota global", notaGlobal("Normal Video"), null);

eq("las dos variantes difieren en el hook",
   placeholdersGuion("RP Video").hook_narrativo === placeholdersGuion("Normal Video").hook_narrativo,
   false);

// ── Bundle: filtro por rol + orden estable ──
console.log("\n▶ Bundle");
const { filtroBundle, compararBundle, posicionEnBundle } = await import("../src/lib/bundle.ts");

const T = (id, code, member_ids = []) => ({ id, code, member_ids });
const tareas = [T("b", "A2", ["m1"]), T("a", "A1", ["m2"]), T("c", null, ["m1"]), T("d", "B1", [])];

eq("el lead ve todo", tareas.filter(filtroBundle("lead", null)).length, 4);
eq("el especialista sólo lo suyo", tareas.filter(filtroBundle("creative", "m1")).length, 2);
eq("especialista SIN identidad → bundle vacío, no 'todo'",
   tareas.filter(filtroBundle("creative", null)).length, 0);

const orden = [...tareas].sort(compararBundle).map((t) => t.id).join(",");
eq("orden por código, sin código al final", orden, "a,b,d,c");
eq("el orden es estable entre cargas",
   [...tareas].reverse().sort(compararBundle).map((t) => t.id).join(","), orden);

const ordenadas = [...tareas].sort(compararBundle);
const pos = posicionEnBundle(ordenadas, "b");
eq("posición 2/4 con vecinos correctos",
   `${pos.indice + 1}/${pos.total}:${pos.anterior?.id}→${pos.siguiente?.id}`, "2/4:a→d");
eq("tarea fuera del bundle filtrado → índice -1 (flechas apagadas)",
   posicionEnBundle(ordenadas.filter(filtroBundle("creative", "m1")), "a").indice, -1);
eq("la primera no tiene anterior", posicionEnBundle(ordenadas, "a").anterior, null);
eq("la última no tiene siguiente", posicionEnBundle(ordenadas, "c").siguiente, null);

// ── Liga de entrega: sólo http/https (se pinta como href) ──
console.log("\n▶ URL de entrega");
const { urlSegura } = await import("../src/lib/url-segura.ts");
ok("https pasa", urlSegura("https://drive.google.com/abc"));
ok("http pasa", urlSegura("http://dropbox.com/x"));
eq("javascript: NO pasa", urlSegura("javascript:alert(1)"), false);
eq("data: NO pasa", urlSegura("data:text/html,<script>"), false);
eq("texto suelto NO pasa", urlSegura("drive.google.com"), false);

// ── Íconos: content type derivado del Tipo de Asset ──
console.log("\n▶ Content type");
const { contentType, canales } = await import("../src/lib/iconos.ts");
eq("RP Video → persona real", contentType("RP Video").label, "Video persona real");
eq("Normal Video → animado", contentType("Normal Video").label, "Video animado");
eq("Images → estática", contentType("Images").label, "Imagen estática");
eq("desconocido → animado (no revienta)", contentType("Loquesea").label, "Video animado");
eq("FB trae su etiqueta", canales(["FB"])[0].label, "Facebook");
eq("EC cae en neutro", canales(["EC"])[0].color, "var(--muted-foreground)");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
