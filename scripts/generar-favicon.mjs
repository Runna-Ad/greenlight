// Genera los íconos de Greenlight a partir del logo de Rünna (public/brand/logo-h-color.png):
//   src/app/favicon.ico (16, 32, 48), src/app/icon.png (192) y src/app/apple-icon.png (180).
// La pieza morada va rellena y sobre fondo blanco: el contorno del logo se pierde a 16 px
// y el morado sin fondo se apaga en pestañas oscuras.
// A 16 y 32 px las esquinas y el símbolo van más gruesos para que se sigan viendo.
// Uso: node scripts/generar-favicon.mjs [carpeta-para-copias-png]
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const LOGO = "public/brand/logo-h-color.png";
const copias = process.argv[2];

const recorte = await sharp(LOGO).extract({ left: 0, top: 0, width: 860, height: 850 }).png().toBuffer();
const { data, info } = await sharp(recorte).trim().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const total = W * H;

// 1. Separar el logo en piezas sueltas (contorno morado, 2 esquinas y 3 trazos del símbolo).
const opaco = new Uint8Array(total);
for (let i = 0; i < total; i++) opaco[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
const vecinos = (p) => {
  const x = p % W;
  const y = (p / W) | 0;
  return [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1].filter((q) => q >= 0);
};
const etiqueta = new Int32Array(total);
const piezas = [];
for (let i = 0; i < total; i++) {
  if (!opaco[i] || etiqueta[i]) continue;
  const id = piezas.length + 1;
  const pila = [i];
  etiqueta[i] = id;
  const suma = [0, 0, 0];
  let n = 0;
  while (pila.length) {
    const p = pila.pop();
    n++;
    for (let c = 0; c < 3; c++) suma[c] += data[p * 4 + c];
    for (const q of vecinos(p)) {
      if (opaco[q] && !etiqueta[q]) {
        etiqueta[q] = id;
        pila.push(q);
      }
    }
  }
  piezas.push({ id, n, color: suma.map((v) => Math.round(v / n)) });
}
const esMorado = (k) => k.color[2] > k.color[0];
const moradas = piezas.filter(esMorado).sort((a, b) => b.n - a.n);
const esquinas = piezas.filter((k) => !esMorado(k));
if (moradas.length !== 4 || esquinas.length !== 2) {
  throw new Error(`El logo no tiene las piezas esperadas: ${moradas.length} moradas, ${esquinas.length} esquinas`);
}
const contorno = moradas[0];
const simbolo = new Set(moradas.slice(1).map((k) => k.id));

// 2. Lo de afuera de la pieza: inundar desde las orillas; lo que no se alcanza es su interior.
const afuera = new Uint8Array(total);
const pila = [];
for (let x = 0; x < W; x++) pila.push(x, (H - 1) * W + x);
for (let y = 0; y < H; y++) pila.push(y * W, y * W + W - 1);
while (pila.length) {
  const p = pila.pop();
  if (afuera[p] || opaco[p]) continue;
  afuera[p] = 1;
  pila.push(...vecinos(p));
}

const MARGEN = 40;
const capa = (color, llena) => {
  const out = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    if (llena(i)) out.set([...color, 255], i * 4);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extend({ top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
};
// Engrosar: desenfocar la silueta y volver a cortarla más abajo.
const engrosar = async (png, color, sigma, corte) => {
  const alfa = await sharp(png).extractChannel("alpha").blur(sigma).threshold(corte).toBuffer();
  return sharp(alfa)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data: d, info: f }) => {
      const out = Buffer.alloc(f.width * f.height * 4);
      for (let i = 0; i < f.width * f.height; i++) if (d[i * f.channels] > 127) out.set([...color, 255], i * 4);
      return sharp(out, { raw: { width: f.width, height: f.height, channels: 4 } }).png().toBuffer();
    });
};

const BLANCO = [255, 255, 255];
const pieza = await capa(contorno.color, (i) => etiqueta[i] === contorno.id || (!opaco[i] && !afuera[i] && !etiqueta[i]));
const trazos = await capa(BLANCO, (i) => simbolo.has(etiqueta[i]));
const capasEsquinas = await Promise.all(
  esquinas.map(async (k) => ({ png: await capa(k.color, (i) => etiqueta[i] === k.id), color: k.color })),
);

const componer = async (capas) => {
  const lienzo = { width: W + 2 * MARGEN, height: H + 2 * MARGEN, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } };
  return sharp({ create: lienzo }).composite(capas.map((input) => ({ input }))).png().toBuffer();
};
const fiel = await componer([...capasEsquinas.map((c) => c.png), pieza, trazos]);
const gruesa = await componer([
  ...(await Promise.all(capasEsquinas.map((c) => engrosar(c.png, c.color, 12, 55)))),
  pieza,
  await engrosar(trazos, BLANCO, 4, 80),
]);

// 3. Armar cada tamaño sobre el fondo blanco.
const icono = async (arte, lado, { redondo = true, ajuste = 0.96 } = {}) => {
  const interior = Math.round(lado * ajuste);
  const pos = Math.round((lado - interior) / 2);
  const dibujo = await sharp(arte)
    .trim()
    .resize(interior, interior, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const radio = redondo ? Math.round(lado * 0.22) : 0;
  const fondo = Buffer.from(`<svg width="${lado}" height="${lado}"><rect width="${lado}" height="${lado}" rx="${radio}" fill="#fff"/></svg>`);
  return sharp(fondo).composite([{ input: dibujo, left: pos, top: pos }]).png().toBuffer();
};

const tamanos = [
  [16, await icono(gruesa, 16, { ajuste: 1 })],
  [32, await icono(gruesa, 32)],
  [48, await icono(fiel, 48, { ajuste: 0.92 })],
];

// 4. El .ico es un encabezado más los PNG tal cual.
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
writeFileSync("src/app/icon.png", await icono(fiel, 192, { ajuste: 0.84 }));
// El iPhone redondea las esquinas solo y pinta de negro lo transparente: va cuadrado y lleno.
writeFileSync("src/app/apple-icon.png", await sharp(await icono(fiel, 180, { redondo: false, ajuste: 0.8 })).flatten({ background: "#fff" }).png().toBuffer());

if (copias) {
  mkdirSync(copias, { recursive: true });
  for (const [lado, png] of tamanos) writeFileSync(`${copias}/${lado}.png`, png);
}
console.log("Listo: favicon.ico, icon.png, apple-icon.png");
