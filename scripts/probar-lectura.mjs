// Rearma una imagen plana con una lectura guardada (scripts/fixtures/lecturas, sacada de prisma_formatos_lecturas) sin
// llamar a la IA: lista lo medido y deja fondo.png y sombras.png en la carpeta de salida.
// node --experimental-strip-types scripts/probar-lectura.mjs <imagen> <lectura.json> <carpeta>
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { limpiarLectura, medirPlanoFijo } from "../src/lib/prisma/formatos/plano.ts";
const [img, fx, out] = process.argv.slice(2);
const L = JSON.parse(readFileSync(fx, "utf8"));
const { data, info } = await sharp(img).flatten({ background: "#fff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const leidos0 = limpiarLectura(L.elementos, L.w, L.h);
const sx = W / L.w, sy = H / L.h;
const leidos = leidos0.map((e) => ({ ...e, caja: { x0: Math.floor(e.caja.x0 * sx), y0: Math.floor(e.caja.y0 * sy), x1: Math.ceil(e.caja.x1 * sx), y1: Math.ceil(e.caja.y1 * sy) } }));
const m = medirPlanoFijo({ w: W, h: H, rgba: new Uint8ClampedArray(data) }, leidos);
console.log("fijos", m.fijos, "avisos", m.avisos);
for (const e of m.elementos) {
  let somb = 0; if (e.oscurece) for (let j = 0; j < e.oscurece.length; j += 3) if (e.oscurece[j] < 255) somb++;
  console.log(e.id, e.tipo, e.rol, JSON.stringify(e.texto).slice(0, 30), "pinta", e.pinta, "solido", e.solido, "sombra px", somb, "renglones", e.renglones.length);
}
await sharp(Buffer.from(m.fondo), { raw: { width: W, height: H, channels: 3 } }).png().toFile(out + "/fondo.png");
// sombra map of all elements
const s = new Uint8ClampedArray(W * H * 3).fill(255);
for (const e of m.elementos) if (e.oscurece) for (let y = 0; y < e.pinta.h; y++) for (let x = 0; x < e.pinta.w; x++) { const j = (y * e.pinta.w + x) * 3; if (e.oscurece[j] < 255) { const k = ((e.pinta.y + y) * W + e.pinta.x + x) * 3; s[k] = 0; s[k + 1] = 0; s[k + 2] = 255 - (255 - e.oscurece[j]) * 10; } }
await sharp(Buffer.from(s), { raw: { width: W, height: H, channels: 3 } }).png().toFile(out + "/sombras.png");
