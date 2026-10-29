// Batería de Formatos con imágenes planas: por cada anuncio con su lectura guardada (prisma_formatos_lecturas, bajada
// a <lecturas>/<sha256>.json) rearma el maestro como la app, saca todas las medidas y escribe una tabla de resultados.
// Sin IA. Con una carpeta de tipografías (.otf/.ttf) reescribe los textos como la página (escritura.ts, con
// @napi-rs/canvas en lugar del canvas del navegador); sin ella, todo texto sale como imagen.
// Las imágenes y lecturas son de clientes y NO van al repo (es público): viven en ~/Desktop/formatos-prueba.
// node --experimental-strip-types --import ./scripts/register-hooks.mjs scripts/bateria-formatos.mjs \
//   <carpeta-imagenes> <carpeta-lecturas> <carpeta-salida> [carpeta-tipografias]
import sharp from "sharp";
import { createCanvas, DOMMatrix, GlobalFonts } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { limpiarLectura, medirPlanoFijo, maestroDePlano, mascaraPegados, pegarFondoIA, rellenarConMuestras, soltarConFondoIA } from "../src/lib/prisma/formatos/plano.ts";
import { prepararMaestro } from "../src/lib/prisma/formatos/listo.ts";
import { revisarMedida } from "../src/lib/prisma/formatos/revisar.ts";
import { armarMedida } from "../src/lib/prisma/formatos/nitido.ts";
import { MEDIDAS_INICIO, esNota } from "../src/lib/prisma/formatos/acomodo.ts";
import { leerMedidas } from "../src/lib/prisma/formatos/geometria.ts";
import { fuentesDe } from "../src/lib/prisma/formatos/textos.ts";

// Lo único del navegador que usa escritura.ts al escribir: crear un canvas y DOMMatrix.
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.DOMMatrix = DOMMatrix;
const { ajustarTextosPlano, revisarTextos, renglonesDe, textoEscrito } = await import("../src/components/prisma/formatos/escritura.ts");

const [dirImg, dirLect, dirSal, dirFuentes] = process.argv.slice(2);
// Las tipografías como `cargarFuentes`: nombre PostScript → la familia con que se pide en el canvas.
const tipos = new Map();
if (dirFuentes) {
  const archivos = readdirSync(dirFuentes, { recursive: true }).map(String).filter((n) => /\.(otf|ttf)$/i.test(n));
  for (const [i, n] of archivos.entries()) {
    const ruta = join(dirFuentes, n), datos = readFileSync(ruta);
    const nombres = fuentesDe(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength));
    if (!nombres.length || !GlobalFonts.registerFromPath(ruta, `bateria-${i}`)) continue;
    for (const f of nombres) if (!tipos.has(f.ps)) tipos.set(f.ps, { familia: `bateria-${i}`, peso: f.peso });
  }
  console.log(`tipografías: ${tipos.size} (${[...tipos.keys()].join(", ")})`);
}
if (!dirSal) {
  console.error("uso: bateria-formatos.mjs <imagenes> <lecturas> <salida>");
  process.exit(1);
}
const IMAGEN = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const medidas = leerMedidas(MEDIDAS_INICIO).medidas;
const corto = (s) => basename(s, extname(s)).replace(/[^\w.-]+/g, "-").slice(0, 40);
const filas = [];

for (const f of readdirSync(dirImg).filter((n) => IMAGEN.has(extname(n).toLowerCase())).sort()) {
  const ruta = join(dirImg, f);
  const sha = createHash("sha256").update(readFileSync(ruta)).digest("hex");
  const fila = { anuncio: f, sha: sha.slice(0, 12) };
  filas.push(fila);
  const fx = join(dirLect, `${sha}.json`);
  if (!existsSync(fx)) { fila.estado = "sin lectura"; continue; }
  try {
    const L = JSON.parse(readFileSync(fx, "utf8"));
    const { data, info } = await sharp(ruta).flatten({ background: "#fff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    fila.lienzo = `${W}×${H}`;
    const leidos0 = limpiarLectura(L.elementos, L.w, L.h);
    if (!leidos0) { fila.estado = "lectura inválida"; continue; }
    // Como plano-lector.ts: las cajas de la copia leída a la imagen real, dentro del lienzo.
    const sx = W / L.w, sy = H / L.h;
    const leidos = leidos0.map((e) => ({ ...e, caja: {
      x0: Math.max(0, Math.floor(e.caja.x0 * sx)), y0: Math.max(0, Math.floor(e.caja.y0 * sy)),
      x1: Math.min(W, Math.ceil(e.caja.x1 * sx)), y1: Math.min(H, Math.ceil(e.caja.y1 * sy)),
    } }));
    fila.leidos = leidos.length;
    fila.textos = leidos.filter((e) => e.tipo === "texto").length;
    let medido = medirPlanoFijo({ w: W, h: H, rgba: new Uint8ClampedArray(data) }, leidos);
    // BATERIA_IA=simulada: «Rehacer el fondo con IA» sin gastar: en lugar de Gemini, el relleno con muestras en la
    // máscara; lo demás (pegar sólo en la máscara, soltar lo pegado) es lo mismo que en la revisión.
    if (process.env.BATERIA_IA === "simulada" && medido.fijos.length) {
      const mascara = mascaraPegados(medido, W, H), falso = new Uint8ClampedArray(medido.fondo);
      rellenarConMuestras(falso, W, H, mascara);
      const ia = new Uint8ClampedArray(W * H * 4);
      for (let k = 0; k < W * H; k++) { ia[k * 4] = falso[k * 3]; ia[k * 4 + 1] = falso[k * 3 + 1]; ia[k * 4 + 2] = falso[k * 3 + 2]; ia[k * 4 + 3] = 255; }
      const pegado = pegarFondoIA(medido.fondo, W, H, mascara, { x: 0, y: 0, w: W, h: H }, ia);
      fila.fijosAntesDeIA = medido.fijos.length;
      medido = soltarConFondoIA({ w: W, h: H, rgba: new Uint8ClampedArray(data) }, medido, pegado.fondo);
    }
    fila.fijos = medido.fijos.length;
    fila.idsFijos = medido.fijos;
    fila.sueltos = medido.elementos.length;
    fila.avisosLectura = medido.avisos;
    const sal = join(dirSal, corto(f));
    mkdirSync(sal, { recursive: true });
    await sharp(Buffer.from(medido.fondo), { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(sal, "_fondo-limpio.png"));
    // La meta (Pedro, 2026-10-29): TODO texto leído sale editable. Por qué no, de cada uno que no.
    const textosLeidos = leidos.filter((e) => e.tipo === "texto").map((e) => e.id);
    const noEditable = (editables, notas) => textosLeidos.filter((id) => !editables.has(id)).map((id) => {
      const n = notas.find((x) => x.id === id);
      return `${id}: ${medido.fijos.includes(id) ? "pegado al fondo" : n ? (n.fuente ? `como imagen (dif ${n.dif?.toFixed(2)})` : "como imagen (sin tipografía que cuadre)") : medido.elementos.some((e) => e.id === id) ? "como imagen" : "no se midió"}`;
    });
    if (!medido.elementos.length) { fila.estado = "nada que mover (todo fijo)"; fila.editables = `0/${textosLeidos.length}`; fila.noEditables = noEditable(new Set(), []); continue; }
    // Como revision-plano.tsx: qué textos se reescriben con las tipografías (los que no pasan, como imagen).
    const ajuste = tipos.size ? ajustarTextosPlano(medido.elementos, W, tipos) : { capas: new Map(), notas: [] };
    fila.reescritos = ajuste.capas.size;
    fila.comoImagen = ajuste.notas.filter((n) => !n.ok).map((n) => `${n.id}${n.fuente ? ` (dif ${n.dif?.toFixed(2)})` : " (sin fuente)"}`);
    const ma = maestroDePlano(corto(f), { w: W, h: H, rgba: new Uint8ClampedArray(data) }, medido.elementos, medido.fondo, ajuste.capas, medido.avisos, medido.pegados, new Set(ajuste.notas.filter((n) => n.aproximado).map((n) => n.id)), new Set(medido.anclados));
    fila.anclados = medido.anclados;
    fila.aproximados = ajuste.notas.filter((n) => n.aproximado).map((n) => `${n.id} (${n.fuente}, dif ${n.dif?.toFixed(2)})`);
    const { maestro } = prepararMaestro(ma);
    fila.piezas = maestro.piezas.map((p) => p.rol ?? p.nombre).join(" ");
    const editables = new Set(maestro.piezas.flatMap((p) => [...p.textos, ...(p.partes ?? []).flatMap((q) => q.textos)]).map((t) => t.capa));
    fila.capas = [...editables].map((id) => { const c = ajuste.capas.get(id); return c ? `${id}: ${JSON.stringify(c.texto)} ${c.tramos.map((t) => `${t.fuente} ${t.tam.toFixed(1)}px track ${t.track.toFixed(0)}`).join(" + ")}${c.caja ? " (caja)" : ""}` : id; });
    fila.editables = `${textosLeidos.filter((id) => editables.has(id)).length}/${textosLeidos.length}`;
    fila.noEditables = noEditable(editables, ajuste.notas);
    if (process.env.BATERIA_RAPIDA) { fila.estado = "ok (sin medidas)"; continue; }
    // Como formatos-psd.tsx (~1931): la escritura del maestro y el legal en otros renglones.
    const escritura = tipos.size ? revisarTextos([maestro], tipos) : null;
    const rg = renglonesDe([maestro], escritura, tipos);
    fila.medidas = [];
    for (const { w, h } of medidas) {
      const r = revisarMedida([maestro], w, h, { heroLado: "derecha", zona: null, contraste: "auto", edicion: null, renglones: { de: rg.de, legal: rg.legal } });
      const avisos = r.acomodo.avisos.filter((a) => !esNota(a));
      const px = armarMedida(r.ma, r.acomodo, w, h, { texto: textoEscrito(rg.escrituraDe(r.ma), 0, r.ma, tipos) });
      await sharp(Buffer.from(px.buffer), { raw: { width: w, height: h, channels: 4 } }).png().toFile(join(sal, `${w}x${h}.png`));
      fila.medidas.push({ medida: `${w}×${h}`, familia: r.acomodo.familia, quitadas: r.acomodo.quitadas.length, avisos: avisos.map((a) => `${a.tipo}: ${a.texto}`) });
    }
    fila.estado = "ok";
  } catch (err) {
    fila.estado = `error: ${err?.message ?? err}`;
  }
}

mkdirSync(dirSal, { recursive: true });
writeFileSync(join(dirSal, "resultados.json"), JSON.stringify(filas, null, 2));
// Tabla corta: una fila por anuncio; cuántas medidas salen limpias y los tipos de aviso que más se repiten.
const lineas = ["| anuncio | estado | leídos (textos) | textos editables | fijos | limpias | avisos por tipo |", "|---|---|---|---|---|---|---|"];
for (const f of filas) {
  const ms = f.medidas ?? [];
  const tipos = {};
  for (const m of ms) for (const a of m.avisos) { const t = a.split(":")[0]; tipos[t] = (tipos[t] ?? 0) + 1; }
  const limpias = ms.length ? `${ms.filter((m) => !m.avisos.length).length}/${ms.length}` : "-";
  lineas.push(`| ${f.anuncio} | ${f.estado} | ${f.leidos ?? "-"} (${f.textos ?? "-"}) | ${f.editables ?? "-"} | ${f.fijos ?? "-"} | ${limpias} | ${Object.entries(tipos).map(([t, n]) => `${t} ${n}`).join(", ")} |`);
}
const porQue = filas.flatMap((f) => (f.noEditables ?? []).map((x) => `- ${f.anuncio.slice(0, 24)} · ${x}`));
lineas.push("", "Textos que no salen editables:", ...(porQue.length ? porQue : ["(ninguno)"]));
writeFileSync(join(dirSal, "tabla.md"), lineas.join("\n") + "\n");
console.log(lineas.join("\n"));
