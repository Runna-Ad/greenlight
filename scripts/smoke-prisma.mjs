// Smoke REAL de HÜE Prisma contra Anthropic (≈ US$0.05): tres specs distintos con TOOL NOTES
// en el bloque cacheado. Falla si la 2ª o la 3ª llamada NO leen del caché (cache_read = 0):
// es la prueba de que las notas no rompieron la economía del prefijo. También falla si un
// prompt sale inválido. No toca la BD. Uso:
//   node --env-file=.env.local --import ./scripts/register-hooks.mjs scripts/smoke-prisma.mjs
import { escribirSpec, estableCon } from "@/lib/prisma/writer";
import { notasDe } from "@/lib/prisma/reglas";
import { recomendarModelo } from "@/lib/prisma/modelo";

const filas = [
  { clase: "nota", tool: "nanobanana", nota_en: "Nano Banana 2 accepts up to 14 reference images. There is NO negative-prompt field: describe what you want. Text: quotes + a named typeface; 1 to 8 words render reliably.", fuente_fecha: "2026-09-04", activa: true, orden: 10 },
  { clase: "nota", tool: "veo", nota_en: "Veo 3.1: clips of 4, 6 or 8 s; 8 s is mandatory with reference images. Max 3 reference images. Negatives are noun phrases, never 'no X'.", fuente_fecha: "2026-09-09", activa: true, orden: 30 },
  { clase: "nota", tool: "kling", nota_en: "Kling 3.0: 3 to 15 s, ONE sentence, ONE camera move, 50 to 60 words. No negative_prompt field.", fuente_fecha: "2026-09-11", activa: true, orden: 40 },
];
const estable = estableCon(notasDe(filas), "smoke");
const look = { luz: "luz de ventana suave", movimiento: null, lente: null, mood: "premium, calmado", estilo: null };
const marca = { nombre: "DiDi Card", paleta: ["#ff6b1a", "#ffffff"], tono: "premium, directo", evitar: ["fondos morados"], aspect_default: null };
const casos = [
  { job: "foto_producto", tool: "nanobanana", idea: "la tarjeta naranja sobre mármol blanco con luz de mañana", destino: "ig_feed", aspect: "1:1", duracion: null, refs: [{ role: "producto", caption: "an orange credit card on a marble counter", dna: null }], texto: null, dialogo: null },
  { job: "imagen_libre", tool: "chatgpt", idea: "un cartel minimalista con la oferta de cashback", destino: "print", aspect: "4:5", duracion: null, refs: [], texto: "Hasta 20% de cashback", dialogo: null },
  { job: "animar_foto", tool: "kling", idea: "que la tarjeta gire despacio y brille", destino: "ig_story", aspect: "9:16", duracion: 5, refs: [{ role: "sujeto", caption: "an orange credit card on a marble counter", dna: null }], texto: null, dialogo: null },
];
const out = [];
for (const c of casos) {
  const modelo = recomendarModelo({ job: c.job, tool: c.tool, destino: c.destino, refs: c.refs.length, texto: !!c.texto, dialogo: !!c.dialogo, duracion: c.duracion }).modelo;
  const t0 = Date.now();
  const r = await escribirSpec({ ...c, look, marca, personaje: null, videoType: null, aprendizaje: null, modelo }, estable);
  if (!r.ok) { console.log(JSON.stringify({ caso: c.job, error: r.error })); process.exit(1); }
  out.push({ caso: `${c.job}/${c.tool}`, modelo, ms: Date.now() - t0, valido: r.valido, errores: r.errores, reparado: r.reparado, usage: r.usage, negativos: r.spec.negativos });
  console.log(`\n--- ${c.job} → ${c.tool} (${modelo}) ---\n${r.salida.texto.slice(0, 900)}`);
}
console.log("\n" + JSON.stringify(out, null, 2));
const cacheOk = out.slice(1).every((o) => o.usage.cache_read > 0);
const validos = out.every((o) => o.valido);
const negativosOk = out.every((o) => o.negativos.every((n) => !/^(no|without|avoid)\b/i.test(n)));
console.log(cacheOk ? "✅ caché: la 2ª y 3ª llamada leyeron el prefijo" : "❌ caché: alguna llamada no leyó del prefijo");
console.log(validos ? "✅ los 3 prompts salieron válidos" : "❌ algún prompt salió inválido");
console.log(negativosOk ? "✅ negativos como sustantivos (sin 'no X')" : "⚠️ el writer sigue escribiendo 'no X' en negativos (el compiler lo corrige; revisa el bloque estable)");
process.exit(cacheOk && validos ? 0 : 1);
