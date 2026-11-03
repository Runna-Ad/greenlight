// Formatos con PSD reales: lee cada archivo como la página y dice, por artboard, qué piezas salen, si sirve y qué capas
// se quedaron en el fondo. Con <salida>, también pinta las medidas de inicio. Los PSD son de clientes y NO van al repo.
// node --experimental-strip-types --import ./scripts/register-hooks.mjs scripts/bateria-psd.mjs [--salida <carpeta>] <a.psd> <b.psd>…
import { mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

const raiz = process.env.BATERIA_RAIZ ?? new URL("..", import.meta.url).pathname;
const { leerPsd, despiezar, despieceUsable, ErrorPsd } = await import(join(raiz, "src/lib/prisma/formatos/psd.ts"));
const { prepararMaestro } = await import(join(raiz, "src/lib/prisma/formatos/listo.ts"));
const { revisarMedida } = await import(join(raiz, "src/lib/prisma/formatos/revisar.ts"));
const { armarMedida } = await import(join(raiz, "src/lib/prisma/formatos/nitido.ts"));
const { MEDIDAS_INICIO } = await import(join(raiz, "src/lib/prisma/formatos/acomodo.ts"));
const { leerMedidas } = await import(join(raiz, "src/lib/prisma/formatos/geometria.ts"));

const args = process.argv.slice(2);
const i = args.indexOf("--salida");
const salida = i >= 0 ? args.splice(i, 2)[1] : null;
for (const ruta of args) {
  let doc;
  try {
    doc = leerPsd(new Uint8Array(readFileSync(ruta)));
  } catch (err) {
    console.log(`${basename(ruta)}: NO SE LEE: ${err.message}`);
    continue;
  }
  for (const [n, mesa] of doc.mesas.entries()) {
    const fila = `${basename(ruta)} [${mesa.nombre || "sin artboard"} ${mesa.w}×${mesa.h}]`;
    try {
      const ma = despiezar(doc, n);
      const uso = despieceUsable(ma);
      console.log(`${fila}: ${uso.ok ? "ok" : `NO SIRVE (${uso.motivos.join("; ")})`} rearmado ${ma.rearmadoDistintoPct.toFixed(2)}% fondo ${ma.fondoDistintoPct.toFixed(2)}%`);
      console.log(`   piezas: ${ma.piezas.map((p) => `${p.nombre}${p.rol && p.rol !== p.nombre ? `=${p.rol}` : ""}`).join(" | ")}`);
      if (ma.origen.elementos?.length) console.log(`   sacados del fondo: ${ma.origen.elementos.map((e) => e.nombre).join(" | ")}`);
      for (const c of ma.reporte ?? []) if (!c.seMueve && c.porque !== "Es el fondo.") console.log(`   se queda: «${c.capa}» ${c.porque}`);
      if (salida && uso.ok) {
        mkdirSync(salida, { recursive: true });
        const { maestro } = prepararMaestro(ma);
        for (const { w, h } of leerMedidas(MEDIDAS_INICIO).medidas) {
          const r = revisarMedida([maestro], w, h, { heroLado: "derecha", zona: null, contraste: "auto", edicion: null });
          const px = armarMedida(r.ma, r.acomodo, w, h);
          const avisos = r.acomodo.avisos.filter((a) => a.tipo === "falta").map((a) => a.texto);
          if (avisos.length) console.log(`   ${w}×${h}: ${avisos.join(" · ")}`);
          await sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels: px.length / (w * h) } }).png().toFile(join(salida, `${basename(ruta, ".psd").replace(/\W+/g, "-")}-${n}-${w}x${h}.png`));
        }
      }
    } catch (err) {
      console.log(`${fila}: ${err instanceof ErrorPsd ? `NO SE SEPARA: ${err.message}` : `FALLA: ${err.stack}`}`);
    }
  }
}
