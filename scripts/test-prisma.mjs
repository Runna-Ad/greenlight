// HÜE Prisma — golden set: specs → compilers → validators. Sin DB ni modelo.
// Run: node scripts/test-prisma.mjs   (Node 24 quita los tipos al importar .ts)
import { specVacio, contarPalabras, frases, comas, indiceRef, JOBS_POR_KIND, TOOLS } from "../src/lib/prisma/spec.ts";
import { compilar } from "../src/lib/prisma/compilers/index.ts";
import { validar } from "../src/lib/prisma/validators.ts";
import { elegirHerramienta } from "../src/lib/prisma/routing.ts";
import { presetDe, PRESETS_HIGGSFIELD } from "../src/lib/prisma/compilers/higgsfield.ts";
import { TOOLS_POR_JOB } from "../src/lib/prisma/tools.ts";

let pass = 0,
  fail = 0;
const eq = (name, got, want) => {
  if (got === want) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
};
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${extra ? `\n      ${extra}` : ""}`);
  }
};

const dna = { luz: "soft window light from the left", lente: "85mm, shallow depth of field", paleta: ["#1a1f1c", "warm beige"], mood: "intimate", composicion: "subject left, air above", textura: "fine film grain" };
const marca = { nombre: "DiDi Card", paleta: ["#ff6b1a", "#ffffff"], tono: "premium, direct", evitar: ["purple backgrounds", "on-screen text"], aspect_default: "9:16" };

/** Un spec "lleno" razonable para cualquier job, como lo dejaría H.Ü.E. */
function spec(job, tool, extra = {}) {
  const s = specVacio(job, tool, "una mujer con abrigo negro camina por un mercado");
  s.sujeto = "a woman in a long black coat";
  s.accion = "walks slowly through a crowded night market";
  s.entorno = "a night market with paper lanterns and steam from food stalls";
  s.camara = { angulo: "eye level", movimiento: "slow dolly in", lente: "35mm, slight wide distortion" };
  s.luz = "warm lantern light, cool blue shadows";
  s.mood = "nostalgic, calm";
  s.estilo = "cinematic photo";
  s.paleta = ["#f2c57c", "#1b211e"];
  s.texturas = ["fine film grain"];
  s.negativos = ["blur on the face"];
  s.aspect = "9:16";
  s.marca = marca;
  const refsPorJob = {
    foto_producto: ["producto"],
    escena_persona: ["sujeto"],
    imagen_libre: [],
    cambio_outfit: ["sujeto", "outfit"],
    cambio_fondo: ["sujeto"],
    cambio_pose: ["sujeto", "pose"],
    agregar_objeto: ["escena", "objeto"],
    cambio_angulo: ["escena"],
    restaurar_foto: ["sujeto"],
    mejora_foto: ["sujeto"],
    aplicar_logo: ["producto", "logo"],
    dos_personajes: ["sujeto", "personaje2", "pose"],
    cambio_epoca: ["sujeto"],
    figura_coleccionable: ["sujeto", "empaque"],
    animar_foto: ["sujeto"],
    texto_a_video: [],
    transicion: ["inicio", "fin"],
    escena_sora: ["sujeto"],
  };
  s.refs = refsPorJob[job].map((role, i) => ({ role, caption: i === 0 ? "a woman in a black coat" : null, dna: i === 0 ? dna : null }));
  if (["animar_foto", "texto_a_video", "transicion", "escena_sora"].includes(job)) {
    s.duracion = tool === "sora" ? 10 : tool === "kling" ? 5 : 8;
  }
  return { ...s, ...extra };
}

// ── 1. Golden set: todos los jobs × todas sus herramientas → validador en verde ──
console.log("\n▶ golden set — cada job con cada herramienta permitida pasa los validators");
let combos = 0;
for (const kind of Object.keys(JOBS_POR_KIND)) {
  for (const job of JOBS_POR_KIND[kind]) {
    for (const tool of TOOLS_POR_JOB[job]) {
      const s = spec(job, tool);
      const out = compilar(s);
      const v = validar(out.texto, s);
      combos++;
      ok(`${job} → ${tool}`, v.ok, v.ok ? "" : v.errores.join(" | ") + "\n      " + out.texto.slice(0, 200));
    }
  }
}
ok("cubre las 5 herramientas", TOOLS.every((t) => Object.values(TOOLS_POR_JOB).some((l) => l.includes(t))));
ok("al menos 20 combinaciones", combos >= 20, `combos=${combos}`);

// ── 2. Kling: tope de palabras y una sola oración ──
console.log("\n▶ Kling");
{
  const s = spec("texto_a_video", "kling");
  s.entorno = "a night market with paper lanterns, steam from food stalls, neon signs, wet cobblestones, vendors shouting, children running, fireworks in the distance, a cat on a roof";
  s.mood = "nostalgic, calm, melancholic, hopeful, quiet, warm, cinematic, epic";
  const out = compilar(s).texto;
  ok("≤50 palabras aunque el spec sea largo", contarPalabras(out) <= 50, `${contarPalabras(out)}: ${out}`);
  ok("empieza con el estilo", out.startsWith("Cinematic photo"), out);
  const pron = compilar(spec("animar_foto", "kling", { accion: "she breathes softly and smiles" })).texto;
  ok("quita el pronombre: 'coat breathes', no 'coat she breathes'", /black coat breathes softly/.test(pron), pron);
  ok("termina en punto", out.endsWith("."));
  const t = compilar(spec("transicion", "kling", { accion: "x".repeat(600) })).texto;
  ok("transición ≤500 caracteres", t.length <= 500, `${t.length}`);
}

// ── 3. Veo: JSON válido con los campos y el timeline ──
console.log("\n▶ Veo 3.1");
{
  const s = spec("animar_foto", "veo", { dialogo: { texto: "soy adicto a la IA", idioma: "es-MX", voz: "neutral Mexican accent" } });
  const out = compilar(s);
  eq("formato json", out.formato, "json");
  const j = JSON.parse(out.texto);
  eq("text = none", j.text, "none");
  ok("keywords trae el aspect", j.keywords.includes("9:16"));
  eq("3 bloques de timeline", j.timeline.length, 3);
  eq("diálogo en su idioma", j.dialogue.text, "soy adicto a la IA");
  ok("con diálogo NO mete 'no music background' a fuerza", !j.negative_prompts.includes("no music background"));
  ok("descripción de animar habla de la referencia", /reference image/i.test(j.description));
  ok("veo animar: sin 'she' pegado al sujeto", !/coat she /.test(JSON.parse(compilar(spec("animar_foto", "veo", { accion: "she smiles" })).texto).description));
  const sin = JSON.parse(compilar(spec("texto_a_video", "veo")).texto);
  ok("sin diálogo sí pide sin música", sin.negative_prompts.includes("no music background"));
  ok("evitar de la marca entra a negative_prompts", sin.negative_prompts.includes("purple backgrounds"));
}

// ── 4. Sora: tipo al inicio, 3 bloques, duración ──
console.log("\n▶ Sora 2");
{
  const s = spec("escena_sora", "sora", { video_type: "Vlog Selfie", duracion: 15 });
  const out = compilar(s).texto;
  ok("empieza con el tipo en inglés", out.startsWith("Selfie vlog:"), out.split("\n")[0]);
  eq("timeline de 15s", out.includes("Timeline (15s)"), true);
  eq("bloques 0–4 / 4–10 / 10–15", (out.match(/^(0–4|4–10|10–15)s:/gm) ?? []).length, 3);
  ok("SFX entre asteriscos", /\*[^*]+\*/.test(out));
  const v = validar(out, s);
  ok("validator en verde", v.ok, v.ok ? "" : v.errores.join(" | "));
  // Beats del modelo se realinean a los cortes oficiales
  const conBeats = spec("escena_sora", "sora", { duracion: 10, beats: [
    { desde: 0, hasta: 2, accion: "she looks up", camara: "push in", sfx: "wind" },
    { desde: 2, hasta: 5, accion: "she smiles", camara: "hold", sfx: "laugh" },
    { desde: 5, hasta: 10, accion: "she walks away", camara: "orbit", sfx: "steps" },
  ] });
  const o2 = compilar(conBeats).texto;
  ok("beats del modelo realineados a 0–3/3–7/7–10", o2.includes("0–3s: she looks up") && o2.includes("7–10s: she walks away"), o2);
}

// ── 5. Higgsfield: preset desde el movimiento ──
console.log("\n▶ Higgsfield");
{
  eq("órbita → Orbit", presetDe("la cámara gira alrededor del sujeto"), "Orbit");
  eq("crash zoom → Crash Zoom In", presetDe("crash zoom into her face"), "Crash Zoom In");
  eq("dron → FPV Drone", presetDe("toma aérea de dron"), "FPV Drone");
  eq("sin movimiento → Dolly In", presetDe(null), "Dolly In");
  const s = spec("animar_foto", "higgsfield", { camara: { angulo: null, movimiento: "360 orbit around her", lente: null } });
  const out = compilar(s).texto;
  ok("termina con 'Camera preset: 360 Orbit'", out.endsWith("Camera preset: 360 Orbit"), out);
  ok("preset pertenece a la lista", PRESETS_HIGGSFIELD.includes(out.split("Camera preset: ")[1]));
  ok("≤60 palabras", contarPalabras(out.split("\n")[0]) <= 60);
}

// ── 6. Nano Banana: referencias, preservar, marca ──
console.log("\n▶ Nano Banana");
{
  const s = spec("cambio_outfit", "nanobanana");
  const out = compilar(s).texto;
  ok("nombra [Imagen 1: caption]", out.includes("[Imagen 1: a woman in a black coat]"), out);
  ok("nombra [Imagen 2]", out.includes("[Imagen 2]"));
  ok("conserva identidad y manos", /facial identity/.test(out) && /five fingers/.test(out));
  ok("iguala luz del ADN", out.includes("soft window light from the left"));
  ok("paleta de marca", out.includes("#ff6b1a"));
  ok("evita lo de la marca", out.includes("purple backgrounds"));
  ok("formato 9:16", out.includes("9:16"));
  const p = compilar(spec("foto_producto", "nanobanana")).texto;
  ok("producto: conserva etiqueta y texto", /label and any text/.test(p));
  // Validator caza un prompt sin referencia
  const roto = validar("Make it pretty. Keep unchanged: nothing. 9:16", s);
  ok("validator caza referencias sin usar", !roto.ok && roto.errores.some((e) => e.includes("[Imagen 1]")), JSON.stringify(roto));
}

// ── 7. Validators comunes ──
console.log("\n▶ validators comunes");
{
  const s = spec("texto_a_video", "kling");
  const v1 = validar("Cinematic video, a woman walks, camera pans --ar 9:16.", s);
  ok("caza parámetros de Midjourney", !v1.ok && v1.errores.some((e) => e.includes("Midjourney")));
  const v2 = validar("Cinematic video, la mujer camina por el mercado con una bolsa para la cena que compró.", s);
  ok("caza español fuera del diálogo", !v2.ok && v2.errores.some((e) => e.includes("español")), JSON.stringify(v2));
  const v3 = validar('Cinematic video, a woman says "hola, cómo estás, ya llegué a la casa con la cena", camera pans.', s);
  ok("el diálogo entre comillas NO cuenta como fuga", !(v3.ok === false && v3.errores.some((e) => e.includes("español"))), JSON.stringify(v3));
  const v4 = validar("Cinematic video, a woman at golden hour under neon signs, camera pans.", s);
  ok("caza luz contradictoria", !v4.ok && v4.errores.some((e) => e.includes("contradictoria")));
}

// ── 8. Routing ──
console.log("\n▶ routing");
{
  const base = { destino: "ig_story", tieneDialogo: false, tieneRefs: true, movimientoMarcado: false };
  eq("edición → nanobanana", elegirHerramienta({ ...base, job: "cambio_outfit" }).tool, "nanobanana");
  eq("animar foto vertical sin voz → kling", elegirHerramienta({ ...base, job: "animar_foto" }).tool, "kling");
  eq("con diálogo → veo", elegirHerramienta({ ...base, job: "animar_foto", tieneDialogo: true }).tool, "veo");
  eq("movimiento marcado → higgsfield", elegirHerramienta({ ...base, job: "animar_foto", movimientoMarcado: true }).tool, "higgsfield");
  eq("transición → kling", elegirHerramienta({ ...base, job: "transicion" }).tool, "kling");
  eq("escena sora → sora", elegirHerramienta({ ...base, job: "escena_sora" }).tool, "sora");
  eq("texto a video en YouTube → veo", elegirHerramienta({ ...base, job: "texto_a_video", destino: "yt" }).tool, "veo");
  ok("toda elección trae un porqué en ambos idiomas", (() => { const p = elegirHerramienta({ ...base, job: "transicion" }).porque; return p.es.length > 10 && p.en.length > 10; })());
}

// ── 9. helpers ──
console.log("\n▶ helpers");
eq("frases une y cierra", frases("a", " b. ", null, "", "c"), "a. b. c.");
eq("comas limpia colas", comas("x, ", "y.", undefined), "x, y");
eq("indiceRef 1-based", indiceRef(spec("cambio_outfit", "nanobanana"), "outfit"), 2);
eq("indiceRef null", indiceRef(spec("cambio_outfit", "nanobanana"), "logo"), null);

console.log(`\n${fail === 0 ? "✅" : "❌"} prisma: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
