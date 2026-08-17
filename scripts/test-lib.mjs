// Pure-logic tests for the intake libs (no DB). Run: node scripts/test-lib.mjs
// Node 24 strips TS types on import; the `import type` in filename.ts is erased.
import { buildFilename, isValidOverride, normToken } from "../src/lib/filename.ts";
import { missingRequired, requiredFor, tipoGroup, generatesFiles } from "../src/lib/required.ts";
import { actionsFor, waitingLabel } from "../src/lib/task-actions.ts";
import { plantillaPara, readTimeS, parseDuracion, nuevoPlano, nuevoEstatico, PLACEHOLDER_GUION, PLACEHOLDER_ESTATICO, varianteGuion, placeholdersGuion, voz, notaGlobal } from "../src/lib/plantilla.ts";
import { splitIdeaCode, nextVariantForLetter, idsIdeaRepetida, combosDeTarjeta, faltantesDraft, construirTarea, tarjetaEnBlanco, camposLlenos } from "../src/lib/intake-crear.ts";

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

// ── Referencias: sniff por magic bytes + plataforma ──
console.log("\n▶ Referencias");
const { sniffImageMime, plataformaDeUrl, parseReferencias } = await import("../src/lib/referencia.ts");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]); // MZ
eq("PNG por magic bytes", sniffImageMime(PNG), "image/png");
eq("JPEG por magic bytes", sniffImageMime(JPG), "image/jpeg");
eq("WebP por magic bytes", sniffImageMime(WEBP), "image/webp");
eq("un .exe (MZ) renombrado a .png se rechaza", sniffImageMime(EXE), null);
eq("TikTok detectado", plataformaDeUrl("https://www.tiktok.com/@x/video/1"), "tiktok");
eq("Drive detectado", plataformaDeUrl("https://drive.google.com/file/d/abc"), "drive");
eq("basura → otro", plataformaDeUrl("no soy url"), "otro");

// parseReferencias: SÓLO una URL real se numera "Referencia N"; el resto es texto
eq("vacío → sin segmentos", parseReferencias("").length, 0);
// El bug que reportó Pedro: "-" (sin valor del sheet) NO debe generar pastilla.
eq("un guion '-' → NADA (era un falso Referencia 1)", parseReferencias("-").length, 0);
eq("centinela n/a → nada", parseReferencias("N/A").length, 0);
eq("una URL → Referencia 1", parseReferencias("https://drive.google.com/x")[0].label, "Referencia 1");
eq("una URL es tipo ref", parseReferencias("https://drive.google.com/x")[0].tipo, "ref");
ok("y es abrible", !!parseReferencias("https://drive.google.com/x")[0].url);
eq("dos URLs → 2 referencias",
   parseReferencias("https://a.com/1\nhttps://b.com/2").length, 2);
eq("la segunda es Referencia 2",
   parseReferencias("https://a.com/1\nhttps://b.com/2")[1].label, "Referencia 2");
eq("un nombre (no URL) es tipo texto, no una pastilla",
   parseReferencias("TOURISM_9X16 IDEA 1_TT.mp4")[0].tipo, "texto");
eq("el texto se conserva tal cual",
   parseReferencias("TOURISM_9X16 IDEA 1_TT.mp4")[0].texto, "TOURISM_9X16 IDEA 1_TT.mp4");
// mezcla: el "-" se descarta, la URL se numera desde 1, el texto queda como texto
{
  const segs = parseReferencias("-\nhttps://a.com/1\nRecrear el tono");
  eq("mezcla → 2 segmentos (el '-' fuera)", segs.length, 2);
  eq("mezcla: la URL es Referencia 1 (numera sólo URLs)", segs[0].label, "Referencia 1");
  eq("mezcla: el texto queda como texto", segs[1].tipo, "texto");
}

const { urlDeLinea } = await import("../src/lib/referencia.ts");
eq("http se abre tal cual", urlDeLinea("https://drive.google.com/x"), "https://drive.google.com/x");
eq("www. se le antepone https", urlDeLinea("www.tiktok.com/@x"), "https://www.tiktok.com/@x");
eq("dominio con path se abre", urlDeLinea("drive.google.com/file/d/abc"), "https://drive.google.com/file/d/abc");
eq("un archivo .mp4 NO es URL", urlDeLinea("asset_final.mp4"), null);
eq("texto suelto NO es URL", urlDeLinea("recrear este asset"), null);

// ── Diálogo: (Quien) marca quién habla en la vista del cliente ──
console.log("\n▶ Diálogo del cliente");
const { parseDialogo } = await import("../src/lib/dialogo.ts");
eq("vacío → sin segmentos", parseDialogo("").length, 0);
eq("sin paréntesis → un segmento sin quien",
   JSON.stringify(parseDialogo("Me encanta como sabe")),
   JSON.stringify([{ quien: null, texto: "Me encanta como sabe" }]));
eq("(Actor) texto → quien + texto",
   JSON.stringify(parseDialogo("(Actor) Me encanta como sabe")),
   JSON.stringify([{ quien: "Actor", texto: "Me encanta como sabe" }]));
eq("dos intervenciones se separan",
   parseDialogo("(Narrador) En un pueblo (Actor) ¡Hola!").length, 2);
eq("segunda intervención es del actor",
   parseDialogo("(Narrador) En un pueblo (Actor) ¡Hola!")[1].quien, "Actor");
eq("texto antes del primer paréntesis queda sin quien",
   parseDialogo("Intro... (Actor) hola")[0].quien, null);

// ── Captura de brief: identidad, duplicación, combos, gate ──
console.log("\n▶ Captura de brief (intake-crear)");

// splitIdeaCode
eq("splitIdeaCode A4", JSON.stringify(splitIdeaCode("A4")), JSON.stringify({ letter: "A", variant: 4 }));
eq("splitIdeaCode B (sin número → 1)", JSON.stringify(splitIdeaCode("B")), JSON.stringify({ letter: "B", variant: 1 }));
eq("splitIdeaCode vacío → X1", JSON.stringify(splitIdeaCode("")), JSON.stringify({ letter: "X", variant: 1 }));

// draft factory
const draft = (over = {}) => ({ ...tarjetaEnBlanco("id-" + Math.random().toString(36).slice(2)), ...over });
const A1 = draft({ id: "a1", numIdea: "A1" });
const A2 = draft({ id: "a2", numIdea: "A2" });
const B1 = draft({ id: "b1", numIdea: "B1" });

// nextVariantForLetter — al duplicar, la siguiente variante libre
eq("nextVariant A con A1,A2 → 3", nextVariantForLetter([A1, A2, B1], "A"), 3);
eq("nextVariant B con B1 → 2", nextVariantForLetter([A1, A2, B1], "B"), 2);
eq("nextVariant C sin ninguna → 1", nextVariantForLetter([A1, A2, B1], "C"), 1);

// idsIdeaRepetida — dos "A1" chocan; distintos no
const dupSet = idsIdeaRepetida([draft({ id: "x", numIdea: "A1" }), draft({ id: "y", numIdea: "A1" }), B1]);
ok("A1 repetido marca ambas tarjetas", dupSet.has("x") && dupSet.has("y"));
ok("B1 no está en el set de repetidas", !dupSet.has("b1"));
eq("sin repetidos → set vacío", idsIdeaRepetida([A1, A2, B1]).size, 0);

// combosDeTarjeta — WYSIWYG del preview y de los assets
const video = draft({ tipoAsset: ["RP Video"], tamano: ["9:16", "1:1"], plataforma: ["GG", "FB"] });
eq("video 2 tamaños × 2 plataformas válidas → 4 combos", combosDeTarjeta(video).length, 4);
const copies = draft({ tipoAsset: ["Copies"], tamano: ["9:16"], plataforma: ["GG"] });
eq("Copies no genera archivos → 0 combos", combosDeTarjeta(copies).length, 0);
const staticBad = draft({ tipoAsset: ["Images"], tamano: ["4:5"], plataforma: ["TT"] });
eq("estático 4:5×TT no es válido → 0 combos", combosDeTarjeta(staticBad).length, 0);

// faltantesDraft — mismo gate que el import
ok("draft en blanco falta obligatorios", faltantesDraft(draft()).length > 0);
const copyOk = draft({
  entrega: ["1ra entrega"], asignacion: ["Vero"], marca: ["Card"],
  tipoAsset: ["Copies"], concepto: "Texto", plataforma: ["GG"],
});
eq("Copies completo no exige Naming/#Idea/Tamaño/Duración", faltantesDraft(copyOk).length, 0);

// construirTarea — resuelve member_ids, marca_id, codes, combos
const resuelto = {
  vocab: [{ set: "formato", code: "STOCK", label_es: "Stock", track: "normal" }],
  memberIdPorNombre: new Map([["vero", "mem-vero"]]),
  marcaIdPorNombre: new Map([["card", "marca-card"]]),
};
const src = draft({
  numIdea: "A3", naming: "SPAPX", tipoAsset: ["Normal Video"], formato: ["Stock"],
  marca: ["Card"], asignacion: ["Vero"], tamano: ["9:16"], plataforma: ["TT"], duracion: "30s",
});
const payload = construirTarea(src, "normal", resuelto);
eq("construirTarea → letra A", payload.family_letter, "A");
eq("construirTarea → variante 3", payload.variant_number, 3);
eq("construirTarea → marca resuelta", payload.marca_id, "marca-card");
eq("construirTarea → member resuelto", JSON.stringify(payload.member_ids), JSON.stringify(["mem-vero"]));
eq("construirTarea → formato label→code", payload.formato_code, "STOCK");
eq("construirTarea → naming_kind normal", payload.naming_kind, "normal");
eq("construirTarea → 1 combo (9:16×TT válido)", payload.assets.length, 1);

// camposLlenos — el multi-copy sólo ofrece campos con valor
const llenos = camposLlenos(draft({ naming: "SPAPX", tamano: ["9:16"], concepto: "" }));
const claves = llenos.map((c) => c.key);
ok("naming lleno está disponible", claves.includes("naming"));
ok("tamano lleno está disponible", claves.includes("tamano"));
ok("concepto vacío NO está disponible", !claves.includes("concepto"));
ok("# Idea nunca es copiable (identidad)", !claves.includes("numIdea"));

// ── Roles: Master Builder es el tope ──
console.log("\n▶ Roles (Master Builder)");
const { canOverrideStatus, canAssign, canCreateBrief, canAdmin, canSee, VIEW_ROLES, ROLE_LABEL } = await import("../src/lib/roles.ts");
ok("master está en VIEW_ROLES", VIEW_ROLES.includes("master"));
eq("master tiene etiqueta", ROLE_LABEL.master, "Master Builder");
ok("master puede override", canOverrideStatus("master"));
ok("master puede asignar", canAssign("master"));
ok("master puede crear brief", canCreateBrief("master"));
ok("master entra a admin", canAdmin("master"));
ok("admin entra a admin", canAdmin("admin"));
ok("lead NO entra a admin", !canAdmin("lead"));
ok("especialista NO entra a admin", !canAdmin("creative"));
ok("master ve la sección admin", canSee("master", "admin"));
ok("master ve el tablero", canSee("master", "tablero"));

// ── Ruteo de emails de notificación ──
console.log("\n▶ Ruteo de emails");
const { tipoEmailea, decisionEmail } = await import("../src/lib/notif-routing.ts");
ok("task_approved emailea", tipoEmailea("task_approved"));
ok("task_submitted emailea", tipoEmailea("task_submitted"));
ok("brief_created emailea (nuevo brief → especialistas)", tipoEmailea("brief_created"));
ok("un tipo desconocido NO emailea", !tipoEmailea("task_started"));
ok("null NO emailea", !tipoEmailea(null));
const D = (a) => decisionEmail(a).enviar;
ok("envía cuando todo ok", D({ type: "task_approved", notifyEmail: true, email: "vero@runna.com.mx" }));
ok("skip si el tipo no emailea", !D({ type: "task_started", notifyEmail: true, email: "vero@runna.com.mx" }));
ok("skip si la persona desactivó email", !D({ type: "task_approved", notifyEmail: false, email: "vero@runna.com.mx" }));
ok("skip si no hay email", !D({ type: "task_approved", notifyEmail: true, email: null }));
ok("skip si el email es inválido", !D({ type: "task_approved", notifyEmail: true, email: "no-es-email" }));

// ── Resaltado en vivo de correcciones por selección (best-effort) ──
console.log("\n▶ Resaltado por selección");
const { resaltadosEnTexto } = await import("../src/lib/correcciones.ts");
const corr = (o) => ({ id: o.id ?? "x", targetTabla: "planos", targetFilaId: "p", targetCampo: "copy_in", targetLabel: null, targetQuote: o.q, targetStart: o.s ?? null, targetEnd: o.e ?? null, body: "b", autor: null, ronda: 1, estado: o.estado ?? "open" });
const VTX = "Hasta 6% de CASHBACK* en todas tus compras";
{
  const r = resaltadosEnTexto(VTX, [corr({ q: "6% de CASHBACK*", s: 6, e: 21 })]);
  eq("offset exacto: 1 resaltado", r.length, 1);
  eq("y en la posición guardada", `${r[0].start}-${r[0].end}`, "6-21");
}
{
  const r = resaltadosEnTexto("xx " + VTX, [corr({ q: "6% de CASHBACK*", s: 6, e: 20 })]);
  eq("offset desfasado → re-encuentra por contenido", r.length, 1);
  eq("en la nueva posición", r[0].start, ("xx " + VTX).indexOf("6% de CASHBACK*"));
}
{
  const r = resaltadosEnTexto("Hasta 8% en todas tus compras", [corr({ q: "6% de CASHBACK*", s: 6, e: 20 })]);
  eq("frase borrada → 0 resaltados", r.length, 0);
}
{
  const r = resaltadosEnTexto(VTX, [{ ...corr({ q: null }), targetQuote: null }]);
  eq("corrección de campo entero → 0 resaltados", r.length, 0);
}
{
  const r = resaltadosEnTexto("aaaa", [corr({ id: "1", q: "aaa", s: 0, e: 3 }), corr({ id: "2", q: "aa", s: 1, e: 3 })]);
  eq("solapes: se queda 1 (el primero gana)", r.length, 1);
}

// ── Guard del chequeo de ortografía (H.Ü.E): números y legales intactos ──
console.log("\n▶ fixSeguro (chequeo de ortografía)");
{
  const { fixSeguro } = await import("../src/lib/ortografia.ts");
  ok("acento faltante se acepta", fixSeguro("comprar mas", "comprar más"));
  ok("ortografía se acepta", fixSeguro("aser el pago", "hacer el pago"));
  ok("concordancia se acepta", fixSeguro("las niño", "los niños"));
  ok("corrige letra junto a un número (dígitos intactos)", fixSeguro("6% de casback", "6% de cashback"));
  ok("mover el PUNTO decimal se RECHAZA (1.5%→15%)", !fixSeguro("1.5%", "15%"));
  ok("cambiar coma→punto en miles se RECHAZA ($60,000→$60.000)", !fixSeguro("$60,000", "$60.000"));
  ok("precio ×10 por el punto se RECHAZA ($1.5→$15)", !fixSeguro("$1.5", "$15"));
  ok("no-op (idéntico) se rechaza", !fixSeguro("hola", "hola"));
  ok("vacío se rechaza", !fixSeguro("", "algo"));
  ok("cambiar un número se RECHAZA", !fixSeguro("hasta 6% diario", "hasta 9% diario"));
  ok("cambiar un precio se RECHAZA", !fixSeguro("$60,000", "$60,00"));
  ok("quitar el asterisco de legal se RECHAZA", !fixSeguro("CASHBACK*", "CASHBACK"));
  ok("quitar el % se RECHAZA", !fixSeguro("hasta 6%", "hasta 6"));
  ok("reescritura larga se RECHAZA", !fixSeguro("hola", "hola qué tal cómo estás amigo mío"));
  ok("párrafo entero como 'fix' se rechaza", !fixSeguro("x".repeat(161), "y".repeat(161)));
}

console.log("\n▶ Guión (paste importer)");
{
  const { parseGuion, parseEstatico, contarPlanos, convertirDialogo, mismoContenido, sinInventar, desdeElPrimerPlano, limpiarPegado } =
    await import("../src/lib/guion.ts");

  // Pegado RICO: tabla Markdown/Notion (| celda |, **negrita**, <br>, |---|). Debe
  // parsear DIRECTO (sin IA) y preservar el `*` legal suelto de "CASHBACK*".
  const MD = [
    "| **ACCIÓN + COPY IN** | **DIÁLOGO** |",
    "| --- | --- |",
    "| **Plano 1 - int. Sala - MS**<br>Actor con la **DiDi Card**.<br>**Copy in:** Hasta 6% de CASHBACK* diario | **Actor**<br>Uso mi DiDi Card. |",
    "| **Plano 2 - int. Sala - MCU**<br>Contador sube.<br>**Copy in:** Línea de hasta $60,000 m.n. | **Actor**<br>Tengo crédito. |",
  ].join("\n");
  const mdP = parseGuion(MD);
  eq("md: cuenta 2 planos", contarPlanos(MD), 2);
  eq("md: parsea 2 planos", mdP.length, 2);
  eq("md: titulo sin ** ", mdP[0].titulo, "Plano 1 - int. Sala - MS");
  eq("md: copy_in preserva el * legal (CASHBACK*)", mdP[0].copy_in, "Hasta 6% de CASHBACK* diario");
  eq("md: $60,000 intacto", mdP[1].copy_in, "Línea de hasta $60,000 m.n.");
  eq("md: dialogo convertido", mdP[0].dialogo, "(Actor) Uso mi DiDi Card.");
  ok("limpiarPegado quita ** en par pero deja el * suelto", limpiarPegado("**hola CASHBACK* mundo**") === "hola CASHBACK* mundo");
  const { parseDialogo } = await import("../src/lib/dialogo.ts");

  // ── Gold: la muestra REAL de Pedro (reconstruida con saltos de línea, como
  //    sale de un <textarea>). La acción se define una vez y se reusa en el
  //    input y en el expected para no arriesgar un typo de transcripción.
  const acc1 = 'Actriz frente a cámara, concentrada, haciendo movimientos de "manifestación" con las manos. Cierra el puño y aparecen destellos. Al abrirlo, aparece mágicamente la DiDi Card. Mira la tarjeta de crédito y rompe personaje con expresión de "era obvio".';
  const acc2 = "Jump cut a un encuadre más cerrado. La actriz muestra la DiDi Card a cámara. Al moverla de un lado a otro, aparecen íconos de categorías participantes alrededor.";
  const acc3 = "Whip pan. La actriz aparece en otro punto de la habitación. Dos gráficos entran con cada movimiento de sus manos, acompañados de una palomita.";
  const acc6 = 'La actriz hace el mismo movimiento de "manifestación" del inicio, pero esta vez aparece un celular mostrando la solicitud de DiDi Card. Termina mostrando nuevamente la DiDi Card y señala el CTA.';
  const SAMPLE = [
    "ACCIÓN + COPY IN + GFX / SFX (Motion)",   // fila de títulos de columna → se descarta
    "DIÁLOGO",
    "Plano 1 - int. Sala - MCU",
    acc1,
    "Copy in: Manifestando ✨ una línea de crédito de hasta $60,000 m.n. ✨",
    "SFX: Brillo mágico + pop.",
    "Actriz (V.O)",
    "Manifestando una línea de crédito de hasta $60,000 m.n....",
    "Actriz",
    "Ah, claro. La DiDi Card.",
    "Plano 2 - int. Sala - CU",
    acc2,
    "Copy in: Hasta 6% de CASHBACK* diario",
    "Actriz",
    "Además, mis compras me recompensan con hasta 6% de CASHBACK diario*, así disfruto más lo que ya iba a comprar.",
    "Plano 3 - int. Sala - MS",
    acc3,
    "Copy in: ✓ Sin anualidad de por vida",
    "Copy in: ✓ Sin comisiones ocultas",
    "Actriz",
    "Y no tiene anualidad de por vida ni comisiones ocultas. Eso me da tranquilidad al usar mi tarjeta de crédito.",
    "Plano 4 - int. Sala - MCU",
    "Corte rápido. La actriz gira hacia cámara y señala al espectador.",
    "Copy in: Sin historial crediticio",
    "Actriz",
    "¿Y si vas empezando? Puedes solicitarla sin historial crediticio.",
    "Plano 5 - int. Sala - CU",
    "La actriz lanza la DiDi Card hacia un costado y hacemos match cut para recibirla desde otro ángulo.",
    "Copy in: Respaldada por Mastercard",
    "Actriz",
    "Además, está respaldada por Mastercard, así que puedes usarla en miles de establecimientos.",
    "Plano 6 - int. Sala - MCU",
    acc6,
    "Botón CTA: Pídela desde tu celular",
    "Actriz",
    "No necesitas manifestarla. La puedes solicitar en línea. Pídela desde tu celular.",
  ].join("\n");

  const p = parseGuion(SAMPLE);
  eq("detecta 6 planos (descarta la fila de títulos)", p.length, 6);
  eq("contarPlanos = 6 (señal de confianza)", contarPlanos(SAMPLE), 6);

  // Pegado SIN saltos de línea: los marcadores "Plano N" siguen en el texto pero
  // parseGuion —que separa por principio de línea— saca menos bloques. Ese
  // desfase es la señal para el normalizador con IA (paso 4).
  const blob = SAMPLE.replace(/\s*\n\s*/g, "");
  ok("pegado sin saltos: marcadores > bloques (dispara el normalizador)",
     contarPlanos(blob) > parseGuion(blob).length);

  // Plano 1 — todos los campos
  eq("p1 titulo", p[0].titulo, "Plano 1 - int. Sala - MCU");
  eq("p1 accion (verbatim, no se le cuela el diálogo)", p[0].accion, acc1);
  eq("p1 copy_in", p[0].copy_in, "Manifestando ✨ una línea de crédito de hasta $60,000 m.n. ✨");
  eq("p1 sfx", p[0].sfx, "Brillo mágico + pop.");
  eq("p1 gfx = null (no había)", p[0].gfx, null);
  eq("p1 edicion = null (transiciones van en acción)", p[0].edicion, null);
  eq(
    "p1 dialogo → formato (Quien) texto",
    p[0].dialogo,
    "(Actriz V.O) Manifestando una línea de crédito de hasta $60,000 m.n....\n(Actriz) Ah, claro. La DiDi Card.",
  );

  // Plano 3 — dos "Copy in:" se unen
  eq("p3 copy_in une los dos Copy in", p[2].copy_in, "✓ Sin anualidad de por vida\n✓ Sin comisiones ocultas");
  eq("p3 dialogo", p[2].dialogo, "(Actriz) Y no tiene anualidad de por vida ni comisiones ocultas. Eso me da tranquilidad al usar mi tarjeta de crédito.");

  // Plano 6 — "Botón CTA:" alimenta copy_in
  eq("p6 titulo", p[5].titulo, "Plano 6 - int. Sala - MCU");
  eq("p6 copy_in viene del Botón CTA", p[5].copy_in, "Pídela desde tu celular");
  eq("p6 accion no se traga el CTA ni el diálogo", p[5].accion, acc6);

  // El diálogo generado round-trip-ea con parseDialogo (la vista del cliente)
  const seg = parseDialogo(p[0].dialogo);
  eq("round-trip: 2 intervenciones", seg.length, 2);
  eq("round-trip: quien 1", seg[0].quien, "Actriz V.O");
  eq("round-trip: quien 2", seg[1].quien, "Actriz");

  // ── Bordes ──
  const soloAccion = parseGuion("Plano 1 - x - CU\nDescribe algo sin etiquetas ni diálogo.");
  eq("sin etiquetas → todo es acción", soloAccion[0].accion, "Describe algo sin etiquetas ni diálogo.");
  eq("sin etiquetas → dialogo null (no adivina)", soloAccion[0].dialogo, null);
  eq("sin etiquetas → copy_in null", soloAccion[0].copy_in, null);

  const antesDelPlano = parseGuion("Basura de encabezado\nMás basura\nPlano 1 - a - MS\nAcción.");
  eq("descarta todo lo anterior al primer Plano", antesDelPlano.length, 1);

  // convertirDialogo directo (varias intervenciones, cue con V.O)
  eq(
    "convertirDialogo agrupa por cue",
    convertirDialogo(["Locutor (V.O)", "Hola a todos.", "Actriz", "Qué tal."]),
    "(Locutor V.O) Hola a todos.\n(Actriz) Qué tal.",
  );

  // Guardarraíl del normalizador con IA: whitespace + tipografía cosmética pasan;
  // cambios de contenido fact-shaped NO.
  ok("guard: sólo saltos de línea → mismo contenido", mismoContenido("aaAbb", "aa\nA bb"));
  ok("guard: comillas curvas↔rectas → pasa (glifo cosmético)", mismoContenido('dijo "hola"', "dijo “hola”"));
  ok("guard: '…' ↔ '...' → pasa", mismoContenido("espera...", "espera…"));
  ok("guard: cambiar un número → NO pasa", !mismoContenido("$60,000", "$50,000"));
  ok("guard: quitar un asterisco de legal → NO pasa", !mismoContenido("6% CASHBACK*", "6% CASHBACK"));
  ok("guard: cambiar % del copy → NO pasa", !mismoContenido("6% CASHBACK", "8% CASHBACK"));
  ok("guard: quitar una PALABRA del copy → NO pasa", !mismoContenido("sin comisiones ocultas", "sin comisiones"));
  ok("guard: coma/puntuación cosmética → pasa", mismoContenido("Ah, claro.", "Ah claro"));
  // Ancla desde el primer Plano: la IA puede quitar la fila de títulos de columna.
  ok("guard ancla: quitar el encabezado de columnas → pasa",
     mismoContenido(desdeElPrimerPlano("ACCIÓN + COPY IN\nDIÁLOGO\nPlano 1 - x - CU\nAcción."),
                    desdeElPrimerPlano("Plano 1 - x - CU\nAcción.")));
  ok("guard ancla: pero un cambio DENTRO de un plano → NO pasa",
     !mismoContenido(desdeElPrimerPlano("Plano 1 - x - CU\nCopy in: 6%"),
                     desdeElPrimerPlano("Plano 1 - x - CU\nCopy in: 8%")));
  // Regresión: el primer "Plano 1" PEGADO al header (sin salto ni frontera de
  // palabra) debe seguir anclando ahí — no saltar al "Plano 2".
  eq("desdeElPrimerPlano ancla en Plano 1 aunque venga pegado al header",
     desdeElPrimerPlano("Motion)DIÁLOGOPlano 1 - x - CU\nAcción.Plano 2 - y - CU"),
     "Plano 1 - x - CU\nAcción.Plano 2 - y - CU");
  eq("contarPlanos cuenta el Plano 1 pegado al header",
     contarPlanos("ACCIÓN + GFX / SFX (Motion)DIÁLOGOPlano 1 - a - CU foo.Plano 2 - b - CU bar."), 2);

  // Guardarraíl del EXTRACTOR (sinInventar): extraer SELECCIONA de la entrada
  // (submultiset), nunca inventa. Descartar rótulos pasa; inventar/alterar NO.
  const entrada =
    "Plano 1 - int Sala - MCU\nAcción: entra al cuarto.\nCopy in: 6% CASHBACK*\nSFX: puerta\nActriz\nAh, claro.";
  ok("extractor: descartar rótulos y distribuir en campos → pasa",
     sinInventar(entrada, "Plano 1 - int Sala - MCU entra al cuarto. 6% CASHBACK* puerta (Actriz) Ah, claro."));
  ok("extractor: formato (Locutor) agrega paréntesis → pasa (no son letras/dígitos/signos)",
     sinInventar("Actriz Ah claro", "(Actriz) Ah claro"));
  ok("extractor: comillas curvas / '…' cosméticas → pasa",
     sinInventar('dijo "hola"... espera', "dijo “hola”… espera"));
  ok("extractor: mayúsculas/minúsculas cosméticas → pasa",
     sinInventar("plano uno", "PLANO UNO"));
  ok("extractor: INVENTAR una palabra que no está → NO pasa",
     !sinInventar("sin comisiones", "sin comisiones ocultas"));
  ok("extractor: CAMBIAR un número → NO pasa",
     !sinInventar("Copy in: $60,000 m.n.", "Copy in: $50,000 m.n."));
  ok("extractor: AGREGAR un asterisco de legal → NO pasa",
     !sinInventar("6% CASHBACK", "6% CASHBACK*"));
  ok("extractor: EXPANDIR una abreviatura (V.O → Voz en Off) → NO pasa",
     !sinInventar("Actriz V.O texto", "(Actriz Voz en Off) texto"));
  // Documenta el límite: OMITIR un plano NO lo caza el guard (lo caza la vista
  // previa humana) — su contenido es igual un subconjunto de la entrada.
  ok("extractor: OMITIR un plano entero → el guard NO lo rechaza (lo caza el humano)",
     sinInventar("Plano 1 - a - CU foo. Plano 2 - b - CU bar.", "Plano 1 - a - CU foo."));

  // Emoji: los shortcodes (Notion/Slack) se vuelven emoji real en limpiarPegado,
  // así el parser Y H.Ü.E ven 🧡, no `:orange_heart:` ni "orange heart".
  eq("limpiarPegado: :orange_heart: → 🧡", limpiarPegado("Copy in: paro :orange_heart:"), "Copy in: paro 🧡");
  // Mapa completo (github+iamcal+emojibase): usa emoji totalmente calificado (con
  // VS16 U+FE0F), así que asertamos que reemplazó el shortcode, no los codepoints.
  const dos = limpiarPegado(":sparkles::handshake:");
  ok("limpiarPegado: varios shortcodes seguidos se reemplazan",
     !dos.includes(":sparkles:") && !dos.includes(":handshake:") && dos.includes("🤝"));
  // Nombres de Slack/GitHub que el mapa curado viejo NO tenía — ahora sí resuelven.
  ok("limpiarPegado: :shopping_bags: (Slack) → emoji",
     limpiarPegado(":shopping_bags:").includes("🛍") && !limpiarPegado(":shopping_bags:").includes(":"));
  ok("limpiarPegado: :thumbsup: (Slack) → 👍",
     limpiarPegado(":thumbsup:").includes("👍"));
  eq("limpiarPegado: shortcode desconocido se deja igual", limpiarPegado("hola :no_existe_xyz: chau"), "hola :no_existe_xyz: chau");
  eq("limpiarPegado: NO toca la etiqueta 'Copy in:'", limpiarPegado("Copy in: hola"), "Copy in: hola");
  // El guard ignora emoji (no son letras/dígitos/marcas): entra con emoji, sale con emoji → pasa.
  ok("extractor: emoji conservado (entrada y salida) → pasa",
     sinInventar("Copy in: paro 🧡", "paro 🧡"));
  ok("extractor: emoji quitado por la IA → el guard igual pasa (lo caza el humano)",
     sinInventar("Copy in: paro 🧡", "paro"));

  // Estático (PROVISIONAL — sin muestra real de Pedro todavía)
  const est = parseEstatico("Título: Beneficio principal\nSubtítulo: Dos beneficios\nBotón CTA: Solicítala");
  eq("estatico copy_titulo", est.copy_titulo, "Beneficio principal");
  eq("estatico copy_cta", est.copy_cta, "Solicítala");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
