// Smoke REAL de F4 (≈ US$0.01 por corrida): compara una imagen que NO es lo pedido (el logo de
// Greenlight) con un spec de foto de producto con texto. Se espera que H.Ü.E marque el texto y
// el sujeto como fallidos y devuelva refine + corrección. Se corre 2 veces (la forma del tool_use
// no es determinista). No toca la BD. Uso:
//   node --env-file=.env.local --import ./scripts/register-hooks.mjs scripts/smoke-veredicto.mjs
import { readFileSync } from "node:fs";
import { compararResultado } from "@/lib/prisma/writer";
import { compilar } from "@/lib/prisma/compilers";
import { specVacio } from "@/lib/prisma/spec";
import { scoreDe, detalleFallos, specCorreccion, fallosDe } from "@/lib/prisma/resultado";
import { validar } from "@/lib/prisma/validators";

const spec = specVacio("foto_producto", "nanobanana", "la tarjeta naranja sobre mármol blanco con luz de mañana");
Object.assign(spec, {
  sujeto: "the orange DiDi card from the reference", accion: "resting flat on white marble", entorno: "a white marble counter by a window",
  camara: { angulo: "45-degree angle", movimiento: null, lente: "85mm, shallow depth of field" }, luz: "soft morning window light from the left", mood: "premium, calm", estilo: "",
  paleta: [], texturas: [], negativos: ["clutter"], preservar: ["the card's logo and text"],
  refs: [{ role: "producto", caption: "an orange credit card on a marble counter", dna: null }], aspect: "1:1", destino: "ig_feed",
  marca: { nombre: "DiDi Card", paleta: ["#ff6b1a", "#ffffff"], tono: "premium, directo", evitar: ["fondos morados"], aspect_default: null },
  texto: { contenido: "Hasta 20% de cashback", posicion: null, estilo: null },
});
const salida = compilar(spec);
const base64 = readFileSync("public/brand/logo-h-color.png").toString("base64");
let okTotal = true;
for (const n of [1, 2]) {
  const t0 = Date.now();
  const r = await compararResultado(spec, salida.texto, base64, "image/png");
  if (!r.ok) { console.log(`corrida ${n}: ❌ ${r.error}`); okTotal = false; continue; }
  const v = r.veredicto;
  console.log(`\n--- corrida ${n} (${Date.now() - t0} ms, ${JSON.stringify(r.usage)}) ---`);
  console.log(JSON.stringify(v, null, 2));
  const fallos = fallosDe(v);
  const bien = fallos.includes("texto") && fallos.includes("sujeto") && !!v.refine && v.cumple.length >= 3;
  console.log(`score=${scoreDe(v)} detalle=${detalleFallos(v)} → ${bien ? "✅ texto y sujeto fallidos, con refine" : "❌ forma inesperada"}`);
  if (!bien) okTotal = false;
  if (v.correccion) {
    for (const tool of ["nanobanana", "chatgpt"]) {
      const sc = specCorreccion(spec, tool, v.correccion, v.caption, fallos);
      const out = compilar(sc);
      const vv = validar(out.texto, sc);
      console.log(`corrección → ${tool}: ${vv.ok ? "✅ válida" : "❌ " + vv.errores.join(" | ")}\n${out.texto}`);
      if (!vv.ok) okTotal = false;
    }
  } else console.log("(sin corrección: H.Ü.E juzgó que editar esta imagen no la arregla — aceptable para un logo)");
}
process.exit(okTotal ? 0 : 1);
