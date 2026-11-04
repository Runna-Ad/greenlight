// Formatos con PSD reales: por cada medida de la lista, cuánto se agranda el fondo y qué tan cerca de la orilla queda la
// pieza más arrimada, hoy y con el fondo ampliado (`ampliar.ts`). Sin IA: el relleno es la orilla del fondo repetida, sólo
// para ver el acomodo (NO enseña cómo pinta la IA). Los PSD son de clientes y NO van al repo.
// node --experimental-strip-types --import ./scripts/register-hooks.mjs scripts/medir-ampliar.mjs [--salida <carpeta>] <a.psd> ...
import { mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

const raiz = process.env.BATERIA_RAIZ ?? new URL("..", import.meta.url).pathname;
const { leerPsd, despiezar, despieceUsable } = await import(join(raiz, "src/lib/prisma/formatos/psd.ts"));
const { prepararMaestro } = await import(join(raiz, "src/lib/prisma/formatos/listo.ts"));
const { revisarMedida } = await import(join(raiz, "src/lib/prisma/formatos/revisar.ts"));
const { armarMedida } = await import(join(raiz, "src/lib/prisma/formatos/nitido.ts"));
const { MEDIDAS_INICIO, elegirMaestro } = await import(join(raiz, "src/lib/prisma/formatos/acomodo.ts"));
const { leerMedidas } = await import(join(raiz, "src/lib/prisma/formatos/geometria.ts"));
const { coserAmpliacion, lienzoAmpliado, valeAmpliar } = await import(join(raiz, "src/lib/prisma/formatos/ampliar.ts"));

const args = process.argv.slice(2);
const i = args.indexOf("--salida");
const salida = i >= 0 ? args.splice(i, 2)[1] : null;
const orilla = (a, W, H) => (a.puestas.length ? Math.min(...a.puestas.map((q) => Math.min(q.x, q.y, W - q.x - q.w, H - q.y - q.h))) : NaN);
const png = (px, w, h, ruta) => sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels: 4 } }).png().toFile(ruta);

for (const ruta of args) {
  const doc = leerPsd(new Uint8Array(readFileSync(ruta)));
  const maestros = [];
  for (const n of doc.mesas.keys()) {
    const ma = despiezar(doc, n);
    if (despieceUsable(ma).ok) maestros.push(prepararMaestro(ma).maestro);
  }
  console.log(`\n${basename(ruta)}: ${maestros.map((m) => `${m.w}×${m.h}`).join(", ")}`);
  console.log("medida       maestro     zoom fondo  orilla hoy  orilla ampliado  avisos hoy → ampliado");
  for (const { w, h } of leerMedidas(MEDIDAS_INICIO).medidas) {
    const ma = maestros[elegirMaestro(maestros, w, h)];
    const nombre = `${w}×${h}`.padEnd(12), desde = `${ma.w}×${ma.h}`.padEnd(11);
    const hoy = revisarMedida(maestros, w, h, {});
    const zoom = hoy.acomodo.fondo.k / Math.min(w / ma.w, h / ma.h);
    if (!valeAmpliar(ma.w, ma.h, w, h)) {
      console.log(`${nombre} ${desde} ${zoom.toFixed(2).padEnd(11)} ${orilla(hoy.acomodo, w, h).toFixed(0).padEnd(11)} (no se ofrece)`);
      continue;
    }
    const g = lienzoAmpliado(ma.w, ma.h, w, h);
    // La orilla repetida hace de "IA": sólo importa el acomodo.
    const relleno = new Uint8ClampedArray(g.w * g.h * 4);
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const X = Math.min(ma.w - 1, Math.max(0, x - g.ox)), Y = Math.min(ma.h - 1, Math.max(0, y - g.oy));
        const s = (Y * ma.w + X) * 4, d = (y * g.w + x) * 4;
        relleno[d] = ma.fondo[s]; relleno[d + 1] = ma.fondo[s + 1]; relleno[d + 2] = ma.fondo[s + 2]; relleno[d + 3] = 255;
      }
    const amp = { ...g, ...coserAmpliacion(relleno, ma.fondo, ma.w, ma.h, g), base: ma.fondo, costoUsd: null };
    const con = revisarMedida(maestros, w, h, { ampliacion: amp });
    const avisos = (a) => a.avisos.filter((v) => v.tipo !== "renglones").length;
    console.log(`${nombre} ${desde} ${zoom.toFixed(2).padEnd(11)} ${orilla(hoy.acomodo, w, h).toFixed(0).padEnd(11)} ${orilla(con.acomodo, w, h).toFixed(0).padEnd(16)} ${avisos(hoy.acomodo)} → ${avisos(con.acomodo)}`);
    if (salida) {
      mkdirSync(salida, { recursive: true });
      const base = `${basename(ruta, ".psd")}_${w}x${h}`;
      await png(armarMedida(hoy.ma, hoy.acomodo, w, h), w, h, join(salida, `${base}_hoy.png`));
      await png(armarMedida(con.ma, con.acomodo, w, h), w, h, join(salida, `${base}_ampliado.png`));
    }
  }
}
