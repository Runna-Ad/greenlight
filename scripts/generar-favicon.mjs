// Genera los íconos de Greenlight a partir de public/brand/greenlight-icono.png:
//   src/app/favicon.ico (16, 32, 48), src/app/icon.png (192) y src/app/apple-icon.png (180).
// Se recorta el margen oscuro de la imagen para que la pieza llene el ícono.
// Uso: node scripts/generar-favicon.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const FUENTE = "public/brand/greenlight-icono.png";
const RECORTE = { left: 105, top: 105, width: 814, height: 814 };

const cuadrado = (lado) => sharp(FUENTE).extract(RECORTE).resize(lado, lado).ensureAlpha().png().toBuffer();

const redondeado = async (lado) => {
  const radio = Math.round(lado * 0.22);
  const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${radio}" fill="#fff"/></svg>`);
  return sharp(await cuadrado(lado)).composite([{ input: mascara, blend: "dest-in" }]).png().toBuffer();
};

// El .ico es un encabezado más los PNG tal cual.
const tamanos = await Promise.all([16, 32, 48].map(async (lado) => [lado, await redondeado(lado)]));
const encabezado = Buffer.alloc(6 + 16 * tamanos.length);
encabezado.writeUInt16LE(1, 2);
encabezado.writeUInt16LE(tamanos.length, 4);
let inicio = encabezado.length;
tamanos.forEach(([lado, png], i) => {
  const e = 6 + i * 16;
  encabezado[e] = lado;
  encabezado[e + 1] = lado;
  encabezado.writeUInt16LE(1, e + 4);
  encabezado.writeUInt16LE(32, e + 6);
  encabezado.writeUInt32LE(png.length, e + 8);
  encabezado.writeUInt32LE(inicio, e + 12);
  inicio += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([encabezado, ...tamanos.map(([, png]) => png)]));
writeFileSync("src/app/icon.png", await redondeado(192));
// El iPhone redondea las esquinas solo: va cuadrado y sin transparencia.
writeFileSync("src/app/apple-icon.png", await sharp(await cuadrado(180)).removeAlpha().png().toBuffer());
console.log("Listo: favicon.ico, icon.png, apple-icon.png");
