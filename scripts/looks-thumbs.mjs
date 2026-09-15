// Miniaturas de los looks del paso 2 (F5a): una imagen por look, generada UNA vez con Nano Banana 2
// (gemini-3.1-flash-image) por la API REST de Gemini, reducida a 480 px y guardada como JPEG en
// public/prisma/looks/<id>.jpg. No corre en tests ni en build: se corre a mano cuando cambien los
// looks. Necesita GEMINI_API_KEY en el entorno (no se lee de ningún archivo del repo).
//   GEMINI_API_KEY=… node scripts/looks-thumbs.mjs            → genera las que falten
//   GEMINI_API_KEY=… node scripts/looks-thumbs.mjs --todas    → regenera todas
//   node scripts/looks-thumbs.mjs --dry-run                    → sólo enseña los prompts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LOOKS } from "../src/lib/prisma/looks.ts";

const DIR = "public/prisma/looks";
const MODELO = "gemini-3.1-flash-image";
const dry = process.argv.includes("--dry-run");
const todas = process.argv.includes("--todas");
const key = process.env.GEMINI_API_KEY;
if (!dry && !key) {
  console.error("Falta GEMINI_API_KEY en el entorno (expórtala en la shell; no va en el repo).");
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

/** El sujeto genérico de cada familia: la miniatura enseña el LOOK, no un producto real. */
const SUJETO = {
  producto: "a generic matte ceramic bottle and a small box",
  persona: "a young woman in a plain beige coat, seen from the side, face turned away",
  libre: "a paper plane and a coffee cup on a desk",
  video: "a generic matte ceramic bottle on a table (a single video frame)",
  edicion: "a plain portrait of a young man in a grey sweater, face turned slightly away",
};

const promptDe = (l) => {
  const f = l.campos;
  const partes = [
    `Small thumbnail for a style picker in a design app, showing this look: ${l.nombre.en}. ${l.descripcion.en}`,
    `Subject: ${SUJETO[l.familias[0]]}.`,
    f.luz && f.luz !== "as in the reference" ? `Light: ${f.luz}.` : "",
    f.lente ? `Lens: ${f.lente}.` : "",
    f.angulo ? `Angle: ${f.angulo}.` : "",
    f.mood ? `Mood: ${f.mood}.` : "",
    f.estilo ? `Style: ${f.estilo}.` : "Style: natural photo.",
    "No text, no letters, no logos, no watermarks, no recognizable faces. Clean composition, 4:3.",
  ];
  return partes.filter(Boolean).join(" ");
};

async function generar(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) throw new Error("sin imagen en la respuesta");
  return Buffer.from(part.inlineData.data, "base64");
}

let hechas = 0;
for (const l of LOOKS) {
  const destino = `${DIR}/${l.id}.jpg`;
  if (!todas && existsSync(destino)) continue;
  const prompt = promptDe(l);
  if (dry) {
    console.log(`\n[${l.id}] ${prompt}`);
    continue;
  }
  try {
    const png = await generar(prompt);
    const tmp = `${DIR}/${l.id}.png`;
    writeFileSync(tmp, png);
    // sips (macOS): a 480 px de ancho y JPEG q 70 → ~25 KB por miniatura.
    execFileSync("sips", ["-Z", "480", "-s", "format", "jpeg", "-s", "formatOptions", "70", tmp, "--out", destino], { stdio: "ignore" });
    execFileSync("rm", ["-f", tmp]);
    hechas++;
    console.log(`✓ ${l.id}`);
  } catch (e) {
    console.error(`✗ ${l.id}: ${e.message}`);
  }
}
console.log(dry ? "\n(dry-run: nada generado)" : `\n${hechas} miniatura(s) generada(s) en ${DIR}`);
