// Pure-logic tests for the intake libs (no DB). Run: node scripts/test-lib.mjs
// Node 24 strips TS types on import; the `import type` in filename.ts is erased.
import { buildFilename, isValidOverride, normToken } from "../src/lib/filename.ts";
import { missingRequired, requiredFor, tipoGroup, generatesFiles } from "../src/lib/required.ts";
import { actionsFor, waitingLabel, transicionRequiereLead } from "../src/lib/task-actions.ts";
import { filtroBundle, greenlitDeBundle, bundleEnCurso, esGreenlitReciente, MS_VENTANA_GREENLIT } from "../src/lib/bundle.ts";
import { plantillaPara, readTimeS, soloHablado, PALABRAS_POR_MINUTO, parseDuracion, presupuestoDialogoS, LEGAL_SECONDS, COLCHON_MIN_S, nuevoPlano, nuevoEstatico, PLACEHOLDER_GUION, PLACEHOLDER_ESTATICO, varianteGuion, placeholdersGuion, voz, notaGlobal } from "../src/lib/plantilla.ts";
import { splitIdeaCode, nextVariantForLetter, idsIdeaRepetida, combosDeTarjeta, nombresDeTarjeta, faltantesDraft, construirTarea, tarjetaEnBlanco, camposLlenos } from "../src/lib/intake-crear.ts";
import { combinarConsideraciones } from "../src/lib/consideraciones.ts";
import { evaluarEquipo, atribuirAutor } from "../src/lib/evaluacion.ts";
import { puedeSerLead, puedeSerEspecialista } from "../src/lib/roles.ts";

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
const leadAsignado = { isAssignee: true, role: "lead", hasAssignee: true };
const ajeno = { isAssignee: false, role: "creative", hasAssignee: true };
const labels = (s, c) => actionsFor(s, c).map(a => a.label).join(" · ");

eq("el asignado empieza una tarea por hacer", labels("todo", asignado), "Empezar");
eq("sin responsable no hay botón de empezar", labels("todo", { ...asignado, hasAssignee: false }), "");
eq("y se explica por qué", waitingLabel("todo", { ...asignado, hasAssignee: false }), "Falta responsable");
eq("un creativo ajeno no empieza tu tarea", labels("todo", ajeno), "");
// El lead/admin/master es REVISOR, no doer (Pedro 2026-08-21): no ve "Empezar"
// ni "Mandar a revisión", ni aunque esté asignado a la tarea. Usa "Mover".
eq("el lead NO empieza (es revisor, no doer)", labels("todo", lead), "");
eq("un lead asignado tampoco empieza", labels("todo", leadAsignado), "");

eq("en progreso → mandar a revisión (especialista)", labels("in_progress", asignado), "Mandar a revisión");
eq("en progreso el lead NO manda a revisión (no hay a quién)", labels("in_progress", lead), "");
eq("en revisión el asignado sólo espera", labels("under_review", asignado), "");
eq("y se le dice", waitingLabel("under_review", asignado), "Esperando revisión");
eq("en revisión el lead aprueba o pide cambios", labels("under_review", lead), "Aprobar · Mandar cambios");
eq("mandar cambios exige texto", actionsFor("under_review", lead).find(a => a.tone === "danger").needsBody, true);
eq("correcciones → retomar (especialista)", labels("in_corrections", asignado), "Retomar");
eq("correcciones: el lead no retoma", labels("in_corrections", lead), "");

// ── transicionRequiereLead (reap C1): el arrastre del tablero no salta el gate del lead ──
console.log("\n▶ transicionRequiereLead — gate por transición");
// Transiciones de DOER (un creativo asignado SÍ puede) → NO requieren lead.
eq("todo→in_progress es doer", transicionRequiereLead("todo", "in_progress"), false);
eq("in_progress→under_review es doer", transicionRequiereLead("in_progress", "under_review"), false);
eq("in_corrections→in_progress es doer", transicionRequiereLead("in_corrections", "in_progress"), false);
eq("in_corrections→under_review es doer", transicionRequiereLead("in_corrections", "under_review"), false);
// Transiciones de REVISOR → requieren lead (un creativo NO puede auto-aprobar/publicar/entregar).
ok("under_review→completed (aprobar) requiere lead", transicionRequiereLead("under_review", "completed"));
ok("completed→published (enviar a cliente) requiere lead", transicionRequiereLead("completed", "published"));
ok("completed→delivered (entregar) requiere lead", transicionRequiereLead("completed", "delivered"));
ok("under_review→in_corrections (pedir cambios) requiere lead", transicionRequiereLead("under_review", "in_corrections"));
ok("published→delivered requiere lead", transicionRequiereLead("published", "delivered"));

// ── Brief GREENLIT: derivado de sus tareas, visible 7 días (Pedro 2026-09-01) ──
console.log("\n▶ Brief Greenlit + ventana de 7 días");
{
  const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const HOY = new Date().toISOString();
  const VIEJO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const d = (status, delivered_at) => ({ status, delivered_at });

  eq("un brief SIN tareas no está greenlit (si no, uno recién creado desaparecería)",
     greenlitDeBundle([]), null);
  eq("con una tarea en curso NO está greenlit",
     greenlitDeBundle([d("delivered", AYER), d("in_progress", null)]), null);
  eq("todas entregadas → greenlit con la fecha de la ÚLTIMA",
     greenlitDeBundle([d("delivered", AYER), d("delivered", HOY)]), HOY);
  eq("delivered SIN fecha no cuenta como entregada",
     greenlitDeBundle([d("delivered", null)]), null);

  ok("un brief en curso se sigue mostrando", bundleEnCurso({ greenlitAt: null }));
  ok("un brief greenlit AYER se sigue mostrando", bundleEnCurso({ greenlitAt: AYER }));
  ok("uno greenlit hace 10 días ya NO (vive en Entregas)", !bundleEnCurso({ greenlitAt: VIEJO }));

  // Reabrir una tarea revierte el greenlit SOLO — por eso se deriva y no se guarda.
  eq("reabrir una tarea quita el greenlit del brief",
     greenlitDeBundle([d("delivered", AYER), d("in_corrections", AYER)]), null);

  ok("la ventana del tablero y la de briefs son LA MISMA", MS_VENTANA_GREENLIT === 7 * 24 * 60 * 60 * 1000);
  ok("esGreenlitReciente(null) = false", !esGreenlitReciente(null));
}

// ── filtroBundle (reap S3): lead acotado a su(s) track(s); multi-track ve AMBOS ──
console.log("\n▶ filtroBundle — scope por rol + track");
const bReal = { member_ids: ["m1"], track: "real" };
const bNormal = { member_ids: ["m2"], track: "normal" };
// Creative: sólo lo suyo (por member_ids), sin importar track.
eq("creative ve sólo lo asignado", [bReal, bNormal].filter(filtroBundle("creative", "m1", null)).length, 1);
eq("creative sin identidad no ve nada", [bReal, bNormal].filter(filtroBundle("creative", null, null)).length, 0);
// Lead Real: sólo Real.
eq("lead Real ve sólo Real", [bReal, bNormal].filter(filtroBundle("lead", null, ["real"])).map((b) => b.track).join(), "real");
// FALSE-POSITIVE guard: un lead MULTI-TRACK debe ver AMBOS (no se le esconde el suyo).
eq("lead multi-track ve AMBOS tracks", [bReal, bNormal].filter(filtroBundle("lead", null, ["real", "normal"])).length, 2);
eq("lead sin tracks no ve nada (falla seguro)", [bReal, bNormal].filter(filtroBundle("lead", null, [])).length, 0);
// Admin/master: todo.
eq("admin ve todo", [bReal, bNormal].filter(filtroBundle("admin", null, null)).length, 2);
// Cambios del CLIENTE (clientChangesPending): cancha del lead. El especialista NO
// retoma (la tarea sale de su lista); el lead los resuelve en la propia tarea (banner).
eq("cambios del cliente: el especialista NO retoma", labels("in_corrections", { ...asignado, clientChangesPending: true }), "");
eq("cambios del cliente: en el tablero no hay botón inline", labels("in_corrections", { ...lead, clientChangesPending: true }), "");
eq("cambios del cliente: al lead se le marca", waitingLabel("in_corrections", { ...lead, clientChangesPending: true }), "Cambios del cliente");
eq("sin cambios del cliente: el lead no ve esa marca", waitingLabel("in_corrections", lead), null);
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

// Read-time: espejo del trigger — sólo lo HABLADO, a 200 pal/min (ceil(palabras × 3/10)).
eq("sin diálogo, 0s", readTimeS(""), 0);
eq("sólo espacios, 0s", readTimeS("   "), 0);
eq("null, 0s", readTimeS(null), 0);
eq("1 palabra → 1s", readTimeS("Hola"), 1);
eq("11 palabras habladas → 4s (200 pal/min: ceil(11×3/10)=ceil(3.3))",
   readTimeS("Hasta seis por ciento de cashback en todas tus compras diarias"), 4);
eq("espacios múltiples y saltos cuentan como uno",
   readTimeS("Hola   mundo\n\ncruel"), readTimeS("Hola mundo cruel"));
// No hablado: etiquetas de locutor "(...)" y negrita "**" NO cuentan.
eq("etiqueta de locutor no cuenta ('(Actriz 1) Hola mundo' → 2 palabras → 1s)",
   readTimeS("(Actriz 1) Hola mundo"), 1);
eq("dos locutores en una línea sólo cuentan lo hablado",
   readTimeS("(Actriz 1) ¿Y sin historial? (Actriz 2) Así es"),
   readTimeS("¿Y sin historial? Así es"));
eq("los ** de negrita no cuentan ('**tasa del 4%**' = 3 palabras)",
   readTimeS("con **tasa del 4%**"), readTimeS("con tasa del 4%"));
eq("línea que es SÓLO etiqueta → 0s", readTimeS("(Ambas)"), 0);
eq("soloHablado quita etiquetas y negrita (el conteo colapsa espacios, no importa el doble)",
   soloHablado("(Actriz 1) Pídelo en **DiDi**").replace(/\s+/g, " "), "Pídelo en DiDi");
eq("PALABRAS_POR_MINUTO = 200", PALABRAS_POR_MINUTO, 200);

// Duración
eq("'15-30s' se lee como rango", JSON.stringify(parseDuracion("15-30s")), '{"min":15,"max":30}');
eq("'30s' es un punto", JSON.stringify(parseDuracion("30s")), '{"min":30,"max":30}');
eq("'-' no es duración", parseDuracion("-"), null);
eq("vacío tampoco", parseDuracion(""), null);
eq("texto libre tampoco", parseDuracion("lo que salga"), null);

// Presupuesto de diálogo del writer = OBJETIVO − 2s de cortinilla legal, donde el
// objetivo = tope del rango − colchón (mitad del rango, mín COLCHON_MIN_S s). El objetivo
// nunca se sienta pegado al tope: apuntar al máx dejaba el video en el borde y los guiones
// fallaban por tiempo (Pedro, 2026-08-27). Rango ancho "30-40" → centro 35; valor único
// "30" → 4s por debajo (26) con 30 como TOPE DURO; el guard mide contra esto.
eq("la cortinilla legal son 2s fijos", LEGAL_SECONDS, 2);
eq("el colchón mínimo bajo el tope son 4s", COLCHON_MIN_S, 4);
eq("'30-40s' rango ancho → objetivo 35 (centro), presupuesto 33", presupuestoDialogoS(["30-40s"]), 33);
eq("'30s' punto → objetivo 26 (4s bajo el tope duro 30), presupuesto 24", presupuestoDialogoS(["30s"]), 24);
eq("'40s' punto → objetivo 36 (4s bajo 40), presupuesto 34", presupuestoDialogoS(["40s"]), 34);
eq("rango angosto '30-35s' → colchón forzado a 4 → objetivo 31, presupuesto 29", presupuestoDialogoS(["30-35s"]), 29);
eq("toma el objetivo MÁS LARGO del fan-out (30-40 → 35)", presupuestoDialogoS(["15s", "30-40s", "20s"]), 33);
eq("rango impar → floor ('15-30s' colchón 7.5 → objetivo 22.5 → 22, −2 = 20)", presupuestoDialogoS(["15-30s"]), 20);
eq("sin duración legible → null (sin tope)", presupuestoDialogoS([]), null);
eq("'-' y null no dan tope", presupuestoDialogoS(["-"]), null);
eq("piso de 1s (nunca ≤0)", presupuestoDialogoS(["1s"]), 1);
// El TOPE DURO nunca se rebasa: para un punto "40s" el total (diálogo + 2s legal) aterriza
// en 36 = 40 − 4, dejando el colchón entero por debajo del límite crítico.
eq("valor único aterriza 4s bajo el tope duro ('40s' → 34 + 2 = 36 ≤ 40)", presupuestoDialogoS(["40s"]) + LEGAL_SECONDS, 36);

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
const { compararBundle, posicionEnBundle } = await import("../src/lib/bundle.ts");

const T = (id, code, member_ids = [], track = "real") => ({ id, code, member_ids, track });
const tareas = [T("b", "A2", ["m1"]), T("a", "A1", ["m2"]), T("c", null, ["m1"]), T("d", "B1", [])];

// El lead ahora se acota a su(s) track(s) (reap S3): con su track ve los suyos (aquí
// todos son 'real'); sin track otorgado no ve nada (falla seguro).
eq("el lead ve su track", tareas.filter(filtroBundle("lead", null, ["real"])).length, 4);
eq("el especialista sólo lo suyo", tareas.filter(filtroBundle("creative", "m1", null)).length, 2);
eq("especialista SIN identidad → bundle vacío, no 'todo'",
   tareas.filter(filtroBundle("creative", null, null)).length, 0);

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
// El shape que produce el Apps Script mejorado para un chip/hipervínculo de Drive:
// "ETIQUETA VISIBLE\nURL_REAL". La etiqueta queda como texto y la URL escondida
// se vuelve el botón "Ver referencia" (antes la URL se perdía por completo).
{
  const drive = "https://drive.google.com/file/d/1ABlmVKU588gts6k2ONGghDiKulSQLJ9J/view?usp=share_link";
  const segs = parseReferencias(`VIDEO_IDEA 1.mp4\n${drive}`);
  eq("chip → 2 segmentos (etiqueta + liga)", segs.length, 2);
  eq("chip: la etiqueta visible queda como texto", segs[0].tipo, "texto");
  eq("chip: la liga recuperada es una referencia abrible", segs[1].tipo, "ref");
  eq("chip: conserva la URL completa de Drive", segs[1].url, drive);
}

const { urlDeLinea } = await import("../src/lib/referencia.ts");
eq("http se abre tal cual", urlDeLinea("https://drive.google.com/x"), "https://drive.google.com/x");
eq("www. se le antepone https", urlDeLinea("www.tiktok.com/@x"), "https://www.tiktok.com/@x");
eq("dominio con path se abre", urlDeLinea("drive.google.com/file/d/abc"), "https://drive.google.com/file/d/abc");
eq("un archivo .mp4 NO es URL", urlDeLinea("asset_final.mp4"), null);
eq("texto suelto NO es URL", urlDeLinea("recrear este asset"), null);

// ── hue-diff: borrador→publicado (aprender de ediciones) ──
console.log("\n▶ hue-diff · aprender de ediciones");
const { diffGuion, diffCopy, esEdicionUtil, esCambioDeEstilo } = await import("../src/lib/hue-diff.ts");
const P = (accion, copy_in, dialogo) => ({ titulo: null, accion, copy_in, sfx: null, gfx: null, edicion: null, dialogo });
const borrador = [
  P("Mujer camina", "DiDi Card", "(Actriz) Pide tu préstamo hoy"),
  P("Cierre", "Descarga", "(VO) Descarga la app"),
];
// Sólo cambió el diálogo del plano 1 (6 campos comparables, 1 cambiado → editRate 1/6).
const publicado = [
  P("Mujer camina", "DiDi Card", "(Actriz) Solicita tu préstamo hoy"),
  P("Cierre", "Descarga", "(VO) Descarga la app"),
];
const dg = diffGuion(borrador, publicado);
eq("diffGuion: 1 cambio", dg.cambios.length, 1);
eq("diffGuion: el cambio es el Diálogo del Plano 1", dg.cambios[0].campo, "Diálogo");
eq("diffGuion: editRate 1/6 ≈ 17%", Math.round(dg.editRate * 100), 17);
ok("una edición moderada SÍ sirve para aprender", esEdicionUtil(dg));
ok("un guión intacto NO sirve (nada que aprender)", !esEdicionUtil(diffGuion(borrador, borrador)));
const reemplazo = [P("Algo distinto", "Otro copy", "(X) Otra cosa"), P("Y otro", "Más", "(Y) Distinto")];
ok("un reemplazo total NO sirve (no fue una edición)", !esEdicionUtil(diffGuion(borrador, reemplazo)));
// esCambioDeEstilo: separa correcciones de HECHO (cifras/legales) de las de redacción.
eq("cambio SÓLO de cifra no es estilo", esCambioDeEstilo({ plano: 1, campo: "Copy", antes: "Hasta $46,800 M.N.", despues: "Hasta $50,000 M.N." }), false);
eq("cambio de redacción sí es estilo", esCambioDeEstilo({ plano: 1, campo: "Diálogo", antes: "Pide tu préstamo", despues: "Solicita tu préstamo" }), true);
// diffCopy: mismo shape para estáticos (plano 0).
const dc = diffCopy(
  { copy_titulo: "Tu DiDi Card", copy_subtitulo: "Sin anualidad", copy_cta: "Pídela", legales_extra: null },
  { copy_titulo: "Tu DiDi Card", copy_subtitulo: "Sin anualidad", copy_cta: "Solicítala", legales_extra: null },
);
eq("diffCopy: 1 cambio (CTA)", dc.cambios.length, 1);
eq("diffCopy: el campo es CTA", dc.cambios[0].campo, "CTA");

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
// Formato con dos puntos (deck del equipo / tareas ya importadas): también en negritas.
eq("colon: 'Actor: texto' → quien Actor", parseDialogo("Actor: Uso mi DiDi Card.")[0].quien, "Actor");
eq("colon: el texto sale limpio", parseDialogo("Actor: Uso mi DiDi Card.")[0].texto, "Uso mi DiDi Card.");
eq("colon: 'Actriz V.O:' conserva el rol", parseDialogo("Actriz V.O: Manifestando.")[0].quien, "Actriz V.O");
eq("colon: 'Y le dije: hola' NO es locutor", parseDialogo("Y le dije: hola")[0].quien, null);

// rangosLocutor: los "(Quién)" van en negrita EN SU LUGAR (sin reformatear) para
// que el portal del cliente se vea como Modo Lectura sin romper offsets/cita.
const { rangosLocutor } = await import("../src/lib/dialogo.ts");
eq("locutor: '(Actriz 1) hola' → rango 0..10", JSON.stringify(rangosLocutor("(Actriz 1) hola")), JSON.stringify([{ start: 0, end: 10 }]));
eq("locutor: sin paréntesis → sin rangos", rangosLocutor("hola mundo").length, 0);
eq("locutor: dos intervenciones → dos rangos", rangosLocutor("(A) hola (B) adios").length, 2);
// Cue con DOS PUNTOS (deck del equipo) también en negrita — antes sólo paréntesis (reap C5).
eq("locutor colon: 'Actor: hola' → rótulo 0..5", JSON.stringify(rangosLocutor("Actor: hola")), JSON.stringify([{ start: 0, end: 5 }]));
eq("locutor colon: 'Actriz V.O:' conserva el rol", rangosLocutor("Actriz V.O: Manifestando.")[0].end, 10);
eq("locutor: 'Y le dije: hola' NO es locutor", rangosLocutor("Y le dije: hola").length, 0);
eq("locutor colon en 2da línea respeta offset", JSON.stringify(rangosLocutor("(A) hi\nBeto: chau")), JSON.stringify([{ start: 0, end: 3 }, { start: 7, end: 11 }]));
// unirRangos: funde negrita de marca + locutor en una lista ordenada y sin traslape.
const { unirRangos } = await import("../src/lib/negrita.ts");
eq("unir: ordena por start", JSON.stringify(unirRangos([{ start: 10, end: 14 }], [{ start: 0, end: 3 }])), JSON.stringify([{ start: 0, end: 3 }, { start: 10, end: 14 }]));
eq("unir: coalesce solapados", JSON.stringify(unirRangos([{ start: 0, end: 6 }], [{ start: 4, end: 10 }])), JSON.stringify([{ start: 0, end: 10 }]));
eq("unir: descarta vacíos", unirRangos([{ start: 5, end: 5 }], []).length, 0);

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

// normalizarDuracion — un número/rango suelto se lee como SEGUNDOS y gana su "s"
const { normalizarDuracion } = await import("../src/lib/vocab.ts");
eq("normalizar '6' → '6s'", normalizarDuracion("6"), "6s");
eq("normalizar '35' → '35s'", normalizarDuracion("35"), "35s");
eq("normalizar '40-50' → '40-50s'", normalizarDuracion("40-50"), "40-50s");
eq("normalizar '40 - 50' → '40-50s'", normalizarDuracion("40 - 50"), "40-50s");
eq("normalizar '15s-30s' se deja igual", normalizarDuracion("15s-30s"), "15s-30s");
eq("normalizar '6 seg' (unidad explícita) se deja igual", normalizarDuracion("6 seg"), "6 seg");
eq("normalizar recorta espacios", normalizarDuracion("  20-30s  "), "20-30s");

// combosDeTarjeta — WYSIWYG del preview y de los assets
const video = draft({ tipoAsset: ["RP Video"], tamano: ["9:16", "1:1"], plataforma: ["GG", "FB"] });
eq("video 2 tamaños × 2 plataformas válidas → 4 combos", combosDeTarjeta(video).length, 4);
eq("video sin duración → combo con duracion_code vacío", combosDeTarjeta(video)[0].duracion_code, "");
const copies = draft({ tipoAsset: ["Copies"], tamano: ["9:16"], plataforma: ["GG"] });
eq("Copies no genera archivos → 0 combos", combosDeTarjeta(copies).length, 0);
const staticBad = draft({ tipoAsset: ["Images"], tamano: ["4:5"], plataforma: ["TT"] });
eq("estático 4:5×TT no es válido → 0 combos", combosDeTarjeta(staticBad).length, 0);

// Fan-out por duración: cada pastilla multiplica los entregables (tamaño × plat × dur).
const videoDur = draft({
  tipoAsset: ["RP Video"], tamano: ["9:16", "1:1"], plataforma: ["GG", "FB"],
  duracion: ["15-30s", "40s"],
});
eq("video 2×2 × 2 duraciones → 8 combos", combosDeTarjeta(videoDur).length, 8);
ok(
  "cada combo lleva su duracion_code",
  combosDeTarjeta(videoDur).filter((c) => c.duracion_code === "40s").length === 4 &&
    combosDeTarjeta(videoDur).filter((c) => c.duracion_code === "15-30s").length === 4,
);
// El estático NO se despliega por duración (una imagen no dura). EC es una
// plataforma abierta (sin regla de tamaño), así el combo existe sí o sí.
const staticDur = draft({
  tipoAsset: ["Images"], tamano: ["9:16"], plataforma: ["EC"], duracion: ["15-30s", "40s"],
});
eq("estático ignora duraciones → 1 combo", combosDeTarjeta(staticDur).length, 1);
eq("estático → duracion_code vacío", combosDeTarjeta(staticDur)[0].duracion_code, "");
// nombresDeTarjeta despliega un nombre por combo, y la duración entra en el token.
const nombres = nombresDeTarjeta(videoDur, "AUG");
eq("fan-out → 8 nombres", nombres.length, 8);
ok("un nombre lleva el token 40S", nombres.some((n) => n.includes("_40S_")));
ok("un nombre lleva el token 15-30S", nombres.some((n) => n.includes("_15-30S_")));

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
  marca: ["Card"], asignacion: ["Vero"], tamano: ["9:16"], plataforma: ["TT"], duracion: ["30s"],
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
ok("ready_for_review emailea (→ cliente, 0051)", tipoEmailea("ready_for_review"));
ok("un tipo desconocido NO emailea", !tipoEmailea("task_started"));
ok("null NO emailea", !tipoEmailea(null));
const D = (a) => decisionEmail(a).enviar;
ok("envía cuando todo ok", D({ type: "task_approved", notifyEmail: true, email: "vero@runna.com.mx" }));
ok("skip si el tipo no emailea", !D({ type: "task_started", notifyEmail: true, email: "vero@runna.com.mx" }));
ok("skip si la persona desactivó email", !D({ type: "task_approved", notifyEmail: false, email: "vero@runna.com.mx" }));
ok("skip si no hay email", !D({ type: "task_approved", notifyEmail: true, email: null }));
ok("skip si el email es inválido", !D({ type: "task_approved", notifyEmail: true, email: "no-es-email" }));
// Preferencia por-evento (0050): la fila de la persona MANDA sobre el default del catálogo.
ok("pref=false apaga un tipo que emailea por defecto",
   !D({ type: "task_approved", notifyEmail: true, email: "vero@runna.com.mx", eventPref: false }));
ok("pref=true prende un tipo aunque el default no emaileara",
   D({ type: "evento_raro", notifyEmail: true, email: "vero@runna.com.mx", eventPref: true }));
ok("sin fila (undefined) cae al default del catálogo",
   D({ type: "task_approved", notifyEmail: true, email: "vero@runna.com.mx", eventPref: undefined }));
ok("pref=true NO salva si la persona apagó el email maestro",
   !D({ type: "task_approved", notifyEmail: false, email: "vero@runna.com.mx", eventPref: true }));
// `esMiTarea`: el aviso va dirigido a la persona ASIGNADA (el fan_out sólo llena
// recipient_member_id en esas ramas). Lo TUYO siempre llega por correo; la preferencia
// por-evento gobierna el volumen de tu ALCANCE, no tu propia tarea. Sin esto un
// admin/master quedaba mudo: la siembra de 0050 los dejó en false para todo.
ok("tarea PROPIA se manda aunque la pref del evento esté en false",
   D({ type: "task_submitted", notifyEmail: true, email: "vero@runna.com.mx", eventPref: false, esMiTarea: true }));
ok("el MISMO evento en su alcance (no asignado) respeta la pref en false",
   !D({ type: "task_submitted", notifyEmail: true, email: "vero@runna.com.mx", eventPref: false, esMiTarea: false }));
ok("el interruptor MAESTRO gana incluso en una tarea propia",
   !D({ type: "task_submitted", notifyEmail: false, email: "vero@runna.com.mx", eventPref: false, esMiTarea: true }));
ok("sin email válido no se manda aunque sea tarea propia",
   !D({ type: "task_submitted", notifyEmail: true, email: null, esMiTarea: true }));

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
  // Diálogo con DOS PUNTOS (el formato real del equipo): "Actor: texto" → "(Actor) texto".
  eq("dialogo colon inline", convertirDialogo(["Actor: Uso mi DiDi Card."]), "(Actor) Uso mi DiDi Card.");
  eq("dialogo colon en líneas separadas", convertirDialogo(["Actriz V.O:", "Manifestando crédito."]), "(Actriz V.O) Manifestando crédito.");
  eq("dialogo colon dos locutores", convertirDialogo(["Actor: Hola.", "Narrador: Fin."]), "(Actor) Hola.\n(Narrador) Fin.");
  ok("dialogo colon: 'Y le dije: hola' NO es locutor", convertirDialogo(["Y le dije: hola"]) === "Y le dije: hola");
  ok("limpiarPegado quita ** en par pero deja el * suelto", limpiarPegado("**hola CASHBACK* mundo**") === "hola CASHBACK* mundo");

  // SIN etiqueta (Copy in:/SFX:/…): un diálogo con locutor SUELTO igual se detecta —
  // antes caía entero en Acción (bug del plano 4 en "Pegar guión": simulación sin
  // etiqueta → la actriz y su línea se iban a Acción).
  const sinEt = parseGuion([
    "Plano 4 - int. recámara - MS",
    "La actriz sostiene su celular.",
    "Monto del crédito: $46,800 m.n.",
    "Actriz",
    "Yo pediría $46,800 m.n.",
  ].join("\n"));
  eq("sin etiqueta: el cue de locutor arranca el diálogo", sinEt[0].dialogo, "(Actriz) Yo pediría $46,800 m.n.");
  ok("sin etiqueta: lo previo (monto) queda en Acción", (sinEt[0].accion ?? "").includes("Monto del crédito"));

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

  // ── Negrita (**…**): inicio-de-línea = andamiaje (se quita), mitad = copy (se conserva) ──
  eq("negrita: **…** a MITAD de línea se CONSERVA",
     limpiarPegado("Copy in: Gana **$46,800 m.n.** hoy"), "Copy in: Gana **$46,800 m.n.** hoy");
  eq("negrita: etiqueta **Copy in:** en negrita → se des-negrita y el valor conserva su negrita",
     parseGuion("Plano 1 - x - CU\n**Copy in:** **$46,800 m.n.**")[0].copy_in, "**$46,800 m.n.**");
  eq("negrita: encabezado **Plano 1** → titulo sin marcadores",
     parseGuion("**Plano 1 - int Sala - CU**\nAcción.")[0].titulo, "Plano 1 - int Sala - CU");
  eq("negrita: locutor **Actor** en negrita → cue detectado",
     parseGuion("Plano 1 - x - CU\nCopy in: hola\n**Actor**\nDiálogo aquí.")[0].dialogo, "(Actor) Diálogo aquí.");
  eq("negrita: __x__ se normaliza a **x** (conservado a mitad de línea)",
     limpiarPegado("Copy in: gana __mucho__ dinero"), "Copy in: gana **mucho** dinero");
  eq("negrita: negrita inline en la acción se conserva",
     parseGuion("Plano 1 - x - CU\nActor con la **DiDi Card**.\nCopy in: hola")[0].accion, "Actor con la **DiDi Card**.");
  ok("negrita: el * legal SUELTO no se toca (no forma par)",
     limpiarPegado("Copy in: 6% CASHBACK*") === "Copy in: 6% CASHBACK*");

  // Estático (PROVISIONAL — sin muestra real de Pedro todavía)
  const est = parseEstatico("Título: Beneficio principal\nSubtítulo: Dos beneficios\nBotón CTA: Solicítala");
  eq("estatico copy_titulo", est.copy_titulo, "Beneficio principal");
  eq("estatico copy_cta", est.copy_cta, "Solicítala");
}

// ── Negrita: helper de render (partirNegrita) + strip para la IA (sinNegrita) ──
console.log("\n▶ Negrita (render helper)");
{
  const { partirNegrita, sinNegrita, desmarcarNegrita } = await import("../src/lib/negrita.ts");
  eq("sinNegrita: quita ** en par, deja el * suelto", sinNegrita("**$46,800** y CASHBACK*"), "$46,800 y CASHBACK*");
  eq("sinNegrita: sin negrita → igual", sinNegrita("hola mundo"), "hola mundo");
  eq("sinNegrita: null → cadena vacía", sinNegrita(null), "");
  const runs = partirNegrita("Gana **$46,800 m.n.** hoy");
  eq("partirNegrita: 3 runs (normal · fuerte · normal)", runs.length, 3);
  eq("partirNegrita: run 0 normal", JSON.stringify(runs[0]), JSON.stringify({ texto: "Gana ", fuerte: false }));
  eq("partirNegrita: run 1 fuerte SIN marcadores", JSON.stringify(runs[1]), JSON.stringify({ texto: "$46,800 m.n.", fuerte: true }));
  ok("partirNegrita: el * suelto NO es negrita", partirNegrita("CASHBACK*").every((r) => !r.fuerte));
  eq("partirNegrita: dos negritas → dos runs fuertes", partirNegrita("**a** **b**").filter((r) => r.fuerte).length, 2);
  eq("partirNegrita: sin negrita → un run normal", partirNegrita("hola").length, 1);
  ok("partirNegrita: reconstruye el texto sin marcadores", partirNegrita("x **y** z").map((r) => r.texto).join("") === "x y z");

  // desmarcarNegrita: texto LIMPIO + rangos de negrita en coordenadas de limpio
  // (base del fix S1 — correcciones ancladas por offset comparten espacio con la negrita).
  const dm = desmarcarNegrita("Copy in: **$46,800 m.n.** hoy");
  eq("desmarcarNegrita: texto limpio sin marcadores", dm.texto, "Copy in: $46,800 m.n. hoy");
  eq("desmarcarNegrita: .texto === sinNegrita", dm.texto, sinNegrita("Copy in: **$46,800 m.n.** hoy"));
  eq("desmarcarNegrita: un rango", dm.negritas.length, 1);
  eq("desmarcarNegrita: el rango apunta al contenido en el texto LIMPIO",
     dm.texto.slice(dm.negritas[0].start, dm.negritas[0].end), "$46,800 m.n.");
  eq("desmarcarNegrita: dos rangos", desmarcarNegrita("a **b** c **d**").negritas.length, 2);
  eq("desmarcarNegrita: rangos ordenados y en coords limpias",
     desmarcarNegrita("a **b** c **d**").negritas.map((r) => r.start).join(","), "2,6");
  ok("desmarcarNegrita: el * suelto no crea rango", desmarcarNegrita("6% CASHBACK*").negritas.length === 0);
  eq("desmarcarNegrita: sin negrita → texto igual, cero rangos",
     JSON.stringify(desmarcarNegrita("hola")), JSON.stringify({ texto: "hola", negritas: [] }));
}

// ── Consideraciones: combina comentarios del lead + peloteo en una caja ──
console.log("\n▶ Consideraciones (combinar dos columnas)");
eq("ambas → divididas por línea en blanco",
   combinarConsideraciones("Comentario del lead", "El peloteo"),
   "Comentario del lead\n\nEl peloteo");
eq("sólo comentarios → tal cual", combinarConsideraciones("Sólo comentario", null), "Sólo comentario");
eq("sólo peloteo → tal cual", combinarConsideraciones(null, "Sólo peloteo"), "Sólo peloteo");
eq("ambas null → null", combinarConsideraciones(null, null), null);
eq("ambas vacío/espacios → null", combinarConsideraciones("   ", ""), null);
eq("NO recorta el contenido (evita conflicto espurio)", combinarConsideraciones("  A  ", "  B  "), "  A  \n\n  B  ");
eq("una vacía (sólo espacios) no deja separador colgando", combinarConsideraciones("  ", "B"), "B");

// ── Atribución de autor (quién escribió la sección corregida) ──
console.log("\n▶ atribuirAutor()");
{
  const edits = [
    { ideaId: "A", tabla: "planos", filaId: "P1", campo: "accion", memberId: "m1", at: "2026-08-05T00:00:00Z" }, // Ana escribió Plano1
    { ideaId: "A", tabla: "planos", filaId: "P2", campo: "accion", memberId: "m2", at: "2026-08-06T00:00:00Z" }, // Beto escribió Plano2
  ];
  const raw = [
    { ideaId: "A", categoria: "storytelling", ronda: 1, tabla: "planos", filaId: "P2", campo: "accion", createdAt: "2026-08-15T00:00:00Z" },
    { ideaId: "A", categoria: "ortografia", ronda: 1, tabla: "planos", filaId: "P1", campo: "accion", createdAt: "2026-08-16T00:00:00Z" },
  ];
  const atr = atribuirAutor(raw, edits);
  const autorDe = (cat) => atr.find((a) => a.categoria === cat).autorId;
  eq("atribuir · storytelling en Plano2 → Beto (m2)", autorDe("storytelling"), "m2");
  eq("atribuir · ortografia en Plano1 → Ana (m1)", autorDe("ortografia"), "m1");
  const sinAutor = atribuirAutor(
    [{ ideaId: "A", categoria: "hook", ronda: 1, tabla: "planos", filaId: "P1", campo: "dialogo", createdAt: "2026-08-04T00:00:00Z" }],
    [{ ideaId: "A", tabla: "planos", filaId: "P1", campo: "dialogo", memberId: "m1", at: "2026-08-10T00:00:00Z" }],
  );
  eq("atribuir · edición POSTERIOR a la corrección → sin autor (null)", sinAutor[0].autorId, null);
}

// ── Evaluación por AUTOR (una tarea co-asignada se reparte por quién escribió qué) ──
console.log("\n▶ evaluarEquipo() — por autor");
{
  const P = { desde: "2026-08-01T00:00:00Z", hasta: "2026-09-01T00:00:00Z" };
  const edits = [
    { ideaId: "A", tabla: "planos", filaId: "P1", campo: "accion", memberId: "m1", at: "2026-08-05T00:00:00Z" }, // Ana → Plano1 de A
    { ideaId: "A", tabla: "planos", filaId: "P2", campo: "accion", memberId: "m2", at: "2026-08-06T00:00:00Z" }, // Beto → Plano2 de A
    { ideaId: "B", tabla: "planos", filaId: "P3", campo: "accion", memberId: "m1", at: "2026-08-01T00:00:00Z" }, // Ana → Plano3 de B (limpia)
  ];
  const raw = [
    { ideaId: "A", categoria: "storytelling", ronda: 1, tabla: "planos", filaId: "P2", campo: "accion", createdAt: "2026-08-15T00:00:00Z" }, // en la sección de Beto
    { ideaId: "A", categoria: "ortografia", ronda: 1, tabla: "planos", filaId: "P1", campo: "accion", createdAt: "2026-08-16T00:00:00Z" }, // en la sección de Ana
  ];
  const atr = atribuirAutor(raw, edits);
  const autoria = [
    { ideaId: "A", memberId: "m1" },
    { ideaId: "A", memberId: "m2" },
    { ideaId: "B", memberId: "m1" },
  ];
  const asignaciones = [
    { ideaId: "A", memberId: "m1", assignedAt: "2026-08-04T00:00:00Z" },
    { ideaId: "B", memberId: "m1", assignedAt: "2026-08-01T00:00:00Z" },
    { ideaId: "A", memberId: "m2", assignedAt: "2026-08-04T00:00:00Z" },
  ];
  const ideas = [
    { id: "A", completedAt: "2026-08-20T00:00:00Z", briefId: "bfV", briefLabel: "Brief 20/08", code: "AAA" },
    { id: "B", completedAt: "2026-08-25T00:00:00Z", briefId: "bfP", briefLabel: "Brief 25/08", code: "BBB" },
  ];
  const evs = evaluarEquipo(
    [
      { id: "m1", name: "Ana", color: "#fff", track: "real" },
      { id: "m2", name: "Beto", color: "#000", track: "real" },
    ],
    autoria,
    atr,
    asignaciones,
    ideas,
    P,
  );
  const ana = evs.find((e) => e.memberId === "m1");
  const beto = evs.find((e) => e.memberId === "m2");
  const sc = (e, slug) => e.scorePorCriterio.find((s) => s.slug === slug).score;
  // Ana autoró A y B → 2 tareas. La ortografía cae en SU sección (A); el storytelling NO (es de Beto).
  eq("eval · Ana: 2 tareas (autoró A y B)", ana.tareas, 2);
  eq("eval · Ana ortografia = 5 (su sección tuvo el cambio)", sc(ana, "ortografia"), 5);
  eq("eval · Ana storytelling = 10 (ese cambio fue en la sección de Beto)", sc(ana, "storytelling"), 10);
  eq("eval · Ana resolución = 10 (sin rework fallido)", sc(ana, "resolucion"), 10);
  eq("eval · Ana calidad = 9.4 (avg de 9: 7×10 + orto 5 + resol 10)", ana.calidad, 9.4);
  eq("eval · Ana eficiencia = 10 (0.5 rondas, 1 cambio/ronda)", ana.eficiencia, 10);
  eq("eval · Ana overall = 9.6 (0.7·9.44 + 0.3·10)", ana.overall, 9.6);
  eq("eval · Ana rondas/tarea = 0.5", ana.rondasPorTarea, 0.5);
  eq("eval · Ana ciclo mediano = 20 (mediana de 16 y 24)", ana.cicloMedianoDias, 20);
  // Beto autoró sólo Plano2 de A → 1 tarea. El storytelling es SUYO.
  eq("eval · Beto: 1 tarea (autoró Plano2 de A)", beto.tareas, 1);
  eq("eval · Beto storytelling = 0 (su sección tuvo el cambio)", sc(beto, "storytelling"), 0);
  eq("eval · Beto ortografia = 10 (ese cambio fue en la sección de Ana)", sc(beto, "ortografia"), 10);
  eq("eval · Beto calidad = 8.9 (avg de 9: 7×10 + story 0 + resol 10)", beto.calidad, 8.9);
  eq("eval · Beto eficiencia = 10", beto.eficiencia, 10);
  eq("eval · Beto overall = 9.2 (0.7·8.89 + 0.3·10)", beto.overall, 9.2);
  eq("eval · Beto ciclo mediano = 16", beto.cicloMedianoDias, 16);
  // Desglose por brief: A vive en bfV (con la nota de orto de Ana), B en bfP (limpia).
  var bf = function (e, id) { return e.briefs.find(function (b) { return b.briefId === id; }); };
  eq("brief · Ana: 2 briefs", ana.briefs.length, 2);
  eq("brief · Ana bfV (tarea A) calidad = 8.9", bf(ana, "bfV").calidad, 8.9);
  eq("brief · Ana bfV overall = 9.2", bf(ana, "bfV").overall, 9.2);
  eq("brief · Ana bfP (tarea B, limpia) overall = 10", bf(ana, "bfP").overall, 10);
  ok("brief · Ana bfV tarea A tuvo notas", bf(ana, "bfV").tareasDetalle[0].conNotas);
  ok("brief · Ana bfP tarea B limpia", !bf(ana, "bfP").tareasDetalle[0].conNotas);
  eq("brief · Ana bfP etiqueta = Brief 25/08", bf(ana, "bfP").briefLabel, "Brief 25/08");
  eq("brief · Beto: 1 brief (sólo tarea A)", beto.briefs.length, 1);
  eq("brief · Beto bfV overall = 9.2", bf(beto, "bfV").overall, 9.2);
}

// ── Evaluación v2: Resolución (rework fallido de H.Ü.E) + Eficiencia (rondas + cambios/ronda) ──
console.log("\n▶ evaluarEquipo() — Resolución + Eficiencia");
{
  const P = { desde: "2026-08-01T00:00:00Z", hasta: "2026-09-01T00:00:00Z" };
  const edits = [
    { ideaId: "C", tabla: "planos", filaId: "P4", campo: "accion", memberId: "m3", at: "2026-08-05T00:00:00Z" },
  ];
  // 8 notas en la sección de Caro (todas storytelling): 5 en ronda 1 + 3 en ronda 2. UNA con
  // rework fallido (el lead aplicó H.Ü.E sobre una nota ya atendida).
  const raw = [];
  for (let i = 0; i < 5; i++)
    raw.push({ ideaId: "C", categoria: "storytelling", ronda: 1, tabla: "planos", filaId: "P4", campo: "accion", createdAt: "2026-08-10T00:00:00Z", reworkFallido: i === 0 });
  for (let i = 0; i < 3; i++)
    raw.push({ ideaId: "C", categoria: "storytelling", ronda: 2, tabla: "planos", filaId: "P4", campo: "accion", createdAt: "2026-08-14T00:00:00Z", reworkFallido: false });
  const atr = atribuirAutor(raw, edits);
  const evs = evaluarEquipo(
    [{ id: "m3", name: "Caro", color: "#0af", track: "real" }],
    [{ ideaId: "C", memberId: "m3" }],
    atr,
    [{ ideaId: "C", memberId: "m3", assignedAt: "2026-08-04T00:00:00Z" }],
    [{ id: "C", completedAt: "2026-08-20T00:00:00Z", briefId: "bfC", briefLabel: "Brief 20/08", code: "CCC" }],
    P,
  );
  const caro = evs.find((e) => e.memberId === "m3");
  const sc = (e, slug) => e.scorePorCriterio.find((s) => s.slug === slug).score;
  eq("evalv2 · Caro: 1 tarea", caro.tareas, 1);
  eq("evalv2 · Caro storytelling = 0", sc(caro, "storytelling"), 0);
  eq("evalv2 · Caro cumplimiento_brief = 10 (sin nota de ese tipo)", sc(caro, "cumplimiento_brief"), 10);
  eq("evalv2 · Caro Resolución = 0 (hubo rework fallido)", sc(caro, "resolucion"), 0);
  eq("evalv2 · Caro calidad = 7.8 (avg de 9: 7×10 + story 0 + resol 0)", caro.calidad, 7.8);
  eq("evalv2 · Caro rondas/tarea = 2", caro.rondasPorTarea, 2);
  eq("evalv2 · Caro cambios/ronda = 4 (8 notas / 2 rondas)", caro.cambiosPorRonda, 4);
  eq("evalv2 · Caro eficiencia = 6.5 (rondas 2→7, cambios 4→6)", caro.eficiencia, 6.5);
  eq("evalv2 · Caro overall = 7.4 (0.7·7.78 + 0.3·6.5)", caro.overall, 7.4);
  eq("evalv2 · Caro: 1 brief (bfC)", caro.briefs.length, 1);
  eq("evalv2 · Caro brief overall = 7.4 (== mensual, 1 brief)", caro.briefs[0].overall, 7.4);
  eq("evalv2 · Caro brief: 1 tarea", caro.briefs[0].tareas, 1);
  ok("evalv2 · Caro brief tarea C tuvo notas", caro.briefs[0].tareasDetalle[0].conNotas);
  eq("evalv2 · Caro brief tarea C code = CCC", caro.briefs[0].tareasDetalle[0].code, "CCC");
}

// ── Quién puede ser Lead / Especialista (fuente única: gate del servidor + 2 pickers) ──
{
  const lead = { role: "lead", track: "real", active: true };
  const leadOtro = { role: "lead", track: "normal", active: true };
  const admin = { role: "admin", track: null, active: true };
  const master = { role: "master", track: null, active: true };
  const crea = { role: "creative", track: "real", active: true };

  ok("lead es Lead de SU track", puedeSerLead(lead, "real"));
  ok("lead NO es Lead de otro track (es departamental)", !puedeSerLead(leadOtro, "real"));
  ok("admin SÍ puede ser Lead (Pedro 2026-09-01)", puedeSerLead(admin, "real"));
  ok("admin puede ser Lead del OTRO track también (es global)", puedeSerLead(admin, "normal"));
  ok("master también puede ser Lead", puedeSerLead(master, "real"));
  ok("creative NUNCA es Lead", !puedeSerLead(crea, "real"));
  ok("un miembro INACTIVO nunca es Lead", !puedeSerLead({ ...admin, active: false }, "real"));

  ok("creative es Especialista de su track", puedeSerEspecialista(crea, "real"));
  ok("creative NO es Especialista de otro track", !puedeSerEspecialista(crea, "normal"));
  ok("un admin NO ejecuta como Especialista (lleva, no produce)", !puedeSerEspecialista(admin, "real"));
  ok("un lead NO es Especialista", !puedeSerEspecialista(lead, "real"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass, ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
