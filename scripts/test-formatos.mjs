// HÜE Prisma › Formatos — geometría (todos los presets) + PIXEL-LOCK con un proveedor de IA falso que
// devuelve basura (a otra medida). Sin DB ni red. Run: node scripts/test-formatos.mjs
import sharp from "sharp";
import {
  PRESETS, presetDe, idCustom, medidaValida, encajar, sugerir, agrandaPct, lienzoIA, RATIOS_IA, costoEstimado, COSTO_IA_USD,
  pegarDuro, zonaIdentica, deriva, colorDeBorde, nombreArchivo, LADO_MIN, LADO_MAX,
  bordesDe, leerMedidas, limpiarNombre, hayExpansion, SIN_RECORTE, MODOS, esModo,
} from "../src/lib/prisma/formatos/geometria.ts";
import { leerFuente, escalarVisible, componer, analizarBordes } from "../src/lib/prisma/formatos/componer.ts";
import { writePsdBuffer } from "ag-psd";
import { nombreDeGuia, etiquetaPieza } from "../src/lib/prisma/formatos/roles.ts";
import { leerPsd, despiezar, rearmar, despieceUsable, rolDe, ErrorPsd, PIEZAS_MAX, TAPADA_MAX_PCT, promediarArea, reducirMesa, esVersionPsd, rellenarSuave } from "../src/lib/prisma/formatos/psd.ts";
import { adelgazarPsd, PsdPesado, PSD_ARCHIVO_MAX } from "../src/lib/prisma/formatos/adelgazar.ts";
import { armarMedida, ENFOQUE_DESDE, ESCRIBIR_LEJOS_DE_1 } from "../src/lib/prisma/formatos/nitido.ts";
import { textoDe, maquetar, fuentesDe, compararAlfa } from "../src/lib/prisma/formatos/textos.ts";
import { leerTipografia, nombresPedidos, archivoVisible, elegirTipografias, rutaTipografia, elegirParaCliente, exclusivasDeOtros, TIPOGRAFIA_MAX_BYTES, TIPOGRAFIA_GOOGLE_MAX_BYTES, NOMBRES_PEDIDOS_MAX, ARCHIVOS_ENTREGADOS_MAX, ARCHIVO_NOMBRE_MAX } from "../src/lib/prisma/formatos/tipografias.ts";
import { carpetaGoogle, archivosDeMetadata, archivosQueSirven, buscarEnGoogle, ARCHIVOS_POR_FAMILIA_MAX, GOOGLE_BYTES_POR_PEDIDO } from "../src/lib/prisma/formatos/google-fonts.ts";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { acomodar, acomodarMedida, aplicarEdicion, topesPieza, elegirMaestro, familiaDe, nombreSalida, sePuedeVoltear, zonaCanal, es916, esCanal, CANALES, LETRA_MIN_PX, MEDIDAS_EQUIPO, FONDO_ZOOM_MAX } from "../src/lib/prisma/formatos/acomodo.ts";
import { prepararMaestro, medidasQueCaben, sugerirMesas, PSD_BYTES_MAX, MEDIDAS_MAX, MEDIDAS_PX_MAX, MESAS_AUTO } from "../src/lib/prisma/formatos/listo.ts";
import { buscarGemela, quitarGemela, recorteParaIA, pegarRellenoIA } from "../src/lib/prisma/formatos/gemela.ts";
import { perdidas, avisosDePixeles, seVeLaCopia, revisarMedida, opcionesDeContraste } from "../src/lib/prisma/formatos/revisar.ts";
import { zonaSeguraImagen } from "../src/lib/prisma/compilers/zonas.ts";
import { specVacio } from "../src/lib/prisma/spec.ts";

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${extra ? `\n      ${extra}` : ""}`);
  }
};
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// ── Geometría ────────────────────────────────────────────────
console.log("\n▶ encajar: todos los presets × formas de anuncio");
const FORMAS = [[1200, 1500], [1080, 1080], [1920, 1080], [300, 250], [4000, 1000], [999, 1001], [7, 3], [1, 1], [2000, 3]];
const TODAS = [...PRESETS, { id: "otro-777x333", w: 777, h: 333 }, { id: "otro-32x4096", w: 32, h: 4096 }];
let malos = [];
for (const [w0, h0] of FORMAS) {
  for (const p of TODAS) {
    const e = encajar(w0, h0, p.w, p.h);
    const x = e.expansion;
    const fallas = [];
    if (x.left + e.sw + x.right !== p.w) fallas.push("ancho no suma");
    if (x.top + e.sh + x.bottom !== p.h) fallas.push("alto no suma");
    if (Object.values(x).some((v) => v < 0 || !Number.isInteger(v))) fallas.push("expansión negativa o no entera");
    if (!(e.sw >= 1 && e.sh >= 1 && e.sw <= p.w && e.sh <= p.h)) fallas.push("original fuera de la medida");
    if (e.sw !== p.w && e.sh !== p.h) fallas.push("ningún lado toca el borde (no es contain)");
    if (Math.abs(x.left - x.right) > 1 || Math.abs(x.top - x.bottom) > 1) fallas.push("no está centrado");
    // Proporción: el lado redondeado se aleja < 1 px del exacto (o se acotó a 1 / al borde).
    const exactoH = (h0 * e.sw) / w0;
    const exactoW = (w0 * e.sh) / h0;
    const desv = e.sw === p.w ? Math.abs(e.sh - exactoH) : Math.abs(e.sw - exactoW);
    if (desv > 0.5 && !(e.sh === 1 || e.sw === 1)) fallas.push(`proporción desviada ${desv.toFixed(2)} px`);
    if (fallas.length) malos.push(`${w0}×${h0} → ${p.id}: ${fallas.join(", ")}`);
  }
}
ok(`${FORMAS.length * TODAS.length} combinaciones: suman exacto, centradas, contain, nunca 1 px de más`, malos.length === 0, malos.slice(0, 5).join(" | "));
eq("1200×1500 → 1080×1920: 1080×1350 centrado (285 arriba, 285 abajo)", (({ sw, sh, expansion }) => ({ sw, sh, ...expansion }))(encajar(1200, 1500, 1080, 1920)), { sw: 1080, sh: 1350, top: 285, right: 0, bottom: 285, left: 0 });
eq("1080×1080 → 1200×627: 627×627, impar a la derecha (286 / 287)", (({ sw, sh, expansion }) => ({ sw, sh, l: expansion.left, r: expansion.right }))(encajar(1080, 1080, 1200, 627)), { sw: 627, sh: 627, l: 286, r: 287 });
eq("misma proporción → sin expansión", encajar(1200, 1500, 1080, 1350).expansion, { top: 0, right: 0, bottom: 0, left: 0 });
ok("encajar con medidas inválidas lanza", (() => { try { encajar(0, 10, 10, 10); return false; } catch { return true; } })());

console.log("\n▶ modo por omisión, rediseño, agrandar");
const cob = (w0, h0, id) => encajar(w0, h0, presetDe(id).w, presetDe(id).h);
eq("cuadrado → 300×250: IA", sugerir(cob(1080, 1080, "google-300x250")), { modo: "ia", rediseno: false, encendido: true });
eq("cuadrado → 1080×1920: IA", sugerir(cob(1080, 1080, "meta-1080x1920")).modo, "ia");
eq("vertical 4:5 → 300×600: IA (cubre 62 %)", sugerir(cob(1200, 1500, "google-300x600")).modo, "ia");
eq("vertical 4:5 → 1600×900: desenfoque (cubre 45 %)", sugerir(cob(1200, 1500, "x-1600x900")), { modo: "blur", rediseno: false, encendido: true });
for (const id of ["google-728x90", "google-320x50", "google-970x250", "google-160x600"]) {
  eq(`cuadrado → ${id}: "Requiere rediseño", apagado`, sugerir(cob(1080, 1080, id)), { modo: "blur", rediseno: true, encendido: false });
}
eq("vertical → 728×90 también es rediseño", sugerir(cob(1200, 1500, "google-728x90")).rediseno, true);
eq("anuncio de 300×250 → 1080×1920: avisa que se agranda 260 %", agrandaPct(encajar(300, 250, 1080, 1920)), 260);
eq("1200×1500 → 1080×1920: se achica, sin aviso", agrandaPct(encajar(1200, 1500, 1080, 1920)), null);

console.log("\n▶ presets y medida libre");
eq("14 presets, ids únicos", [PRESETS.length, new Set(PRESETS.map((p) => p.id)).size], [14, 14]);
ok("cada id dice su medida (meta-1080x1920 = 1080×1920)", PRESETS.every((p) => p.id.endsWith(`-${p.w}x${p.h}`)));
eq("medida libre válida", presetDe(idCustom(640, 480)), { id: "otro-640x480", plataforma: "otro", w: 640, h: 480 });
eq("medida libre: id canónico (\"otro-0640x0480\" = \"otro-640x480\")", presetDe("otro-0640x0480")?.id, "otro-640x480");
eq("medida libre fuera de límites → null", [presetDe("otro-10x480"), presetDe("otro-5000x480"), presetDe("hack-1x1"), presetDe("otro-640x480;drop")], [null, null, null, null]);
eq("límites de lado", [medidaValida(LADO_MIN, LADO_MAX), medidaValida(LADO_MIN - 1, 100), medidaValida(100.5, 100)], [true, false, false]);
eq("nombre de archivo limpio", nombreArchivo("Promo Día del Trabajo!", { plataforma: "meta", w: 1080, h: 1920 }, "png"), "Promo-Dia-del-Trabajo_meta_1080x1920.png");

console.log("\n▶ lienzo de la IA");
malos = [];
for (const [w0, h0] of FORMAS.slice(0, 6)) {
  for (const p of TODAS) {
    const L = lienzoIA(w0, h0, p.w, p.h);
    const [gw, gh] = RATIOS_IA[L.aspect][L.tamano];
    const f = [];
    if (L.gw !== gw || L.gh !== gh) f.push("lienzo no es una medida de la tabla");
    if (L.zona.x < 0 || L.zona.y < 0 || L.zona.x + L.zona.w > L.gw || L.zona.y + L.zona.h > L.gh) f.push("zona fuera del lienzo");
    if (Math.abs(L.zona.w / L.zona.h - p.w / p.h) / (p.w / p.h) > 0.02) f.push("zona con otra proporción");
    if (L.original.x < L.zona.x || L.original.y < L.zona.y || L.original.x + L.original.w > L.zona.x + L.zona.w || L.original.y + L.original.h > L.zona.y + L.zona.h) f.push("original fuera de la zona");
    if (f.length) malos.push(`${w0}×${h0} → ${p.id}: ${f.join(", ")}`);
  }
}
ok("lienzo de la IA: medida de la tabla, zona y original adentro, misma proporción", malos.length === 0, malos.slice(0, 5).join(" | "));
eq("728×90 → 8:1 · 970×250 → 4:1 · 160×600 → 1:4 · 1200×627 → 16:9", ["google-728x90", "google-970x250", "google-160x600", "linkedin-1200x627"].map((id) => lienzoIA(1080, 1080, presetDe(id).w, presetDe(id).h).aspect), ["8:1", "4:1", "1:4", "16:9"]);
eq("1080×1920 pide 2K (1K se agrandaría 40 %); 300×250 se queda en 1K", [lienzoIA(1080, 1080, 1080, 1920).tamano, lienzoIA(1080, 1080, 300, 250).tamano], ["2K", "1K"]);
eq("costo estimado: blur y color = $0; IA suma por tamaño", costoEstimado(1080, 1080, [{ w: 1080, h: 1920, modo: "ia" }, { w: 300, h: 250, modo: "ia" }, { w: 728, h: 90, modo: "blur" }, { w: 300, h: 600, modo: "color" }]), Math.round((COSTO_IA_USD["2K"] + COSTO_IA_USD["1K"]) * 1000) / 1000);
eq("sin tamaños con IA el lote cuesta 0", costoEstimado(1080, 1080, [{ w: 300, h: 250, modo: "blur" }]), 0);

console.log("\n▶ pegarDuro / zonaIdentica / deriva / colorDeBorde (bytes)");
{
  const W = 5, H = 4;
  const lienzo = new Uint8Array(W * H * 4).fill(7);
  const orig = Uint8Array.from({ length: 2 * 3 * 4 }, (_, i) => i + 100);
  const e = { sw: 2, sh: 3, ox: 2, oy: 1 };
  pegarDuro(lienzo, W, orig, e);
  ok("la zona pegada es idéntica", zonaIdentica(lienzo, W, orig, e));
  ok("lo de afuera NO se toca (sigue en 7)", [0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 15, 16].every((px) => lienzo.slice(px * 4, px * 4 + 4).every((v) => v === 7)) && lienzo.slice(-4).every((v) => v === 7));
  lienzo[((1 + 2) * W + 3) * 4 + 1] ^= 1;
  ok("un solo byte distinto → ya no es idéntica (el check puede fallar)", !zonaIdentica(lienzo, W, orig, e));
  ok("pegarDuro rechaza un original del tamaño equivocado", (() => { try { pegarDuro(lienzo, W, orig.slice(4), e); return false; } catch { return true; } })());
  eq("deriva 0 cuando la zona es el original", deriva(Uint8Array.from(orig), 2, orig, { sw: 2, sh: 3, ox: 0, oy: 0 }), 0);
  const rojo = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < rojo.length; i += 4) rojo.set([200, 10, 20, 255], i);
  rojo.set([0, 0, 0, 255], (1 * 4 + 1) * 4); // un pixel del centro no cuenta
  eq("color del borde (el centro no cuenta)", colorDeBorde(rojo, 4, 4, 1), "#c80a14");
}

// ── PIXEL-LOCK con proveedor de basura ───────────────────────
console.log("\n▶ pixel-lock: anuncio de prueba + IA falsa que devuelve ruido a otra medida");
{
  // Anuncio sintético 600×750: ruido determinista + degradado + una franja semitransparente (alpha 128).
  const w0 = 600, h0 = 750;
  const px = Buffer.alloc(w0 * h0 * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
    const i = (y * w0 + x) * 4;
    px[i] = (x * 255) / w0 ^ rnd();
    px[i + 1] = (y * 255) / h0;
    px[i + 2] = rnd();
    px[i + 3] = y > 300 && y < 320 ? 128 : 255;
  }
  const anuncio = await sharp(px, { raw: { width: w0, height: h0, channels: 4 } }).png().toBuffer();
  const f = await leerFuente(anuncio);
  eq("leerFuente: medidas, y guarda los BYTES (no 160 MB de píxeles)", [f.w, f.h, f.bytes.length === anuncio.length], [w0, h0, true]);
  ok("leerFuente rechaza un archivo truncado", await leerFuente(anuncio.subarray(0, Math.floor(anuncio.length / 2))).then(() => false).catch(() => true));
  // Foto de teléfono: la orientación vive en el EXIF. Se mide y se compone YA girada.
  const girada = await sharp(px, { raw: { width: w0, height: h0, channels: 4 } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const fg = await leerFuente(girada);
  eq("EXIF orientación 6: medidas giradas (750×600)", [fg.w, fg.h], [h0, w0]);
  const cg = await componer(fg, 1080, 1080, "blur");
  ok("EXIF: el pixel-lock se cumple sobre la imagen girada", cg.pixelLockOk && cg.encaje.sw === 1080 && cg.encaje.sh === 864);

  let llamadas = 0;
  const basura = async ({ png, aspect }) => {
    llamadas++;
    const m = await sharp(png).metadata();
    if (!RATIOS_IA[aspect]) throw new Error(`aspect inesperado ${aspect}`);
    // Ruido puro, y a una medida que NO es la pedida (los proveedores redondean): el código debe reescalar.
    const gw = m.width + 37, gh = Math.max(16, m.height - 21);
    const ruido = Buffer.alloc(gw * gh * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = rnd();
    return { png: await sharp(ruido, { raw: { width: gw, height: gh, channels: 3 } }).png().toBuffer(), costoUsd: 0.068, modelo: "falso" };
  };

  const fallas = [];
  let sinRelleno = 0;
  for (const p of TODAS) {
    const c = await componer(f, p.w, p.h, "ia", { expandir: basura });
    const e = c.encaje;
    if (!hayExpansion(e)) sinRelleno++;
    // Comprobación INDEPENDIENTE: releer el PNG y compararlo contra una copia escalada calculada aparte.
    const nuestra = await escalarVisible(f, e);
    const relei = await sharp(c.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const ident = relei.info.width === p.w && relei.info.height === p.h && zonaIdentica(relei.data, p.w, nuestra, e);
    // Lo de afuera existe (opaco) — atrapa la clase de bug de `blend: "source"` (afuera transparente).
    const esquinas = [[0, 0], [p.w - 1, 0], [0, p.h - 1], [p.w - 1, p.h - 1]];
    const afueraOpaco = esquinas.every(([x, y]) => {
      const dentro = x >= e.ox && x < e.ox + e.sw && y >= e.oy && y < e.oy + e.sh;
      return dentro || relei.data[(y * p.w + x) * 4 + 3] === 255;
    });
    const jpg = await sharp(c.jpg).metadata();
    if (!c.pixelLockOk) fallas.push(`${p.id}: pixelLockOk=false`);
    if (!ident) fallas.push(`${p.id}: zona distinta al releer`);
    if (!afueraOpaco) fallas.push(`${p.id}: afuera transparente`);
    if (jpg.width !== p.w || jpg.height !== p.h || jpg.format !== "jpeg") fallas.push(`${p.id}: JPG mal`);
    if (hayExpansion(e) && !(c.deriva > 10)) fallas.push(`${p.id}: la basura no llegó al centro (deriva ${c.deriva}) — la prueba no probaría nada`);
    if (!hayExpansion(e) && (c.costoUsd !== null || c.deriva !== null)) fallas.push(`${p.id}: sin nada que rellenar igual cobró la IA`);
  }
  ok(`IA de basura en ${TODAS.length} tamaños: zona original idéntica byte por byte (PNG releído), afuera opaco, JPG a la medida`, fallas.length === 0, fallas.slice(0, 6).join(" | "));
  ok("hay al menos un tamaño con la misma proporción (sin relleno) en la prueba", sinRelleno >= 1);
  eq("la IA falsa se llamó una vez por tamaño CON algo que rellenar (sin relleno = $0, sin llamada)", llamadas, TODAS.length - sinRelleno);

  const otros = [];
  for (const [modo, opts] of [["blur", {}], ["color", { color: "#123456" }], ["extender", {}]]) {
    for (const id of ["meta-1080x1920", "google-728x90", "linkedin-1200x627", "google-300x250"]) {
      const p = presetDe(id);
      const c = await componer(f, p.w, p.h, modo, opts);
      if (!c.pixelLockOk || c.deriva !== null || c.costoUsd !== null) otros.push(`${modo} ${id}`);
      if (modo === "color") {
        const r = await sharp(c.png).raw().toBuffer();
        if (!(r[0] === 0x12 && r[1] === 0x34 && r[2] === 0x56)) otros.push(`color ${id}: la esquina no es #123456`);
      }
    }
  }
  ok("desenfoque, color y extender: pixel-lock, sin deriva ni costo, el color llega a la esquina", otros.length === 0, otros.join(" | "));
  eq("anuncio de ruido: nada liso, nada recortable", await analizarBordes(f), { recortable: SIN_RECORTE, liso: { top: false, right: false, bottom: false, left: false } });
  ok("modo ia sin proveedor lanza (nunca 'rellena' en silencio)", await componer(f, 300, 250, "ia").then(() => false).catch(() => true));

  // Control negativo: si el pegado NO ocurriera, el check lo atraparía.
  const c = await componer(f, 1080, 1920, "ia", { expandir: basura });
  const relei = await sharp(c.png).ensureAlpha().raw().toBuffer();
  const nuestra = await escalarVisible(f, c.encaje);
  relei[((c.encaje.oy + 10) * 1080 + c.encaje.ox + 10) * 4] ^= 0xff;
  ok("control negativo: un píxel tocado dentro de la zona → el check falla", !zonaIdentica(relei, 1080, nuestra, c.encaje));
}

// ── v2: recorte de fondo liso, extender, pegar la lista ──────
console.log("\n▶ v2 · encajar recortando fondo liso");
{
  const MARGENES = [
    { top: 200, right: 0, bottom: 200, left: 0 },
    { top: 0, right: 300, bottom: 0, left: 300 },
    { top: 120, right: 90, bottom: 60, left: 30 },
    { top: 5000, right: 5000, bottom: 5000, left: 5000 }, // se acota a 45 %
  ];
  const malosR = [];
  for (const [w0, h0] of FORMAS.filter(([a, b]) => a >= 100 && b >= 100)) {
    for (const p of TODAS) {
      const base = encajar(w0, h0, p.w, p.h);
      for (const m of MARGENES) {
        const e = encajar(w0, h0, p.w, p.h, m);
        const x = e.expansion;
        const k = e.escala;
        const lim = (v, lado) => Math.min(v, Math.floor(lado * 0.45));
        const ml = lim(m.left, w0), mr = lim(m.right, w0), mt = lim(m.top, h0), mb = lim(m.bottom, h0);
        const fl = [];
        if (x.left + e.sw + x.right !== p.w || x.top + e.sh + x.bottom !== p.h) fl.push("no suma");
        if (Object.values(x).some((v) => v < 0 || !Number.isInteger(v))) fl.push("expansión negativa");
        if (e.corte.x < 0 || e.corte.y < 0 || e.corte.x + e.sw > e.completo.w || e.corte.y + e.sh > e.completo.h) fl.push("corte fuera del escalado");
        // Lo cortado por lado nunca pasa del fondo liso (± 2 px de redondeo).
        const cortaIzq = e.corte.x, cortaDer = e.completo.w - e.corte.x - e.sw, cortaArr = e.corte.y, cortaAba = e.completo.h - e.corte.y - e.sh;
        if (cortaIzq > ml * k + 2 || cortaDer > mr * k + 2 || cortaArr > mt * k + 2 || cortaAba > mb * k + 2) fl.push(`corta contenido (${cortaIzq},${cortaDer},${cortaArr},${cortaAba})`);
        if (e.escala + 1e-9 < base.escala) fl.push("quedó más chico que sin recortar");
        if (e.cobertura + 1e-9 < base.cobertura) fl.push("cubre menos que sin recortar");
        if (Math.abs(e.completo.h / e.completo.w - h0 / w0) > 2 / Math.min(e.completo.w, e.completo.h) + 1e-9) fl.push("se deformó");
        if (e.escala > Math.max(base.escala, 1) + 1e-9) fl.push(`se agrandó de más (${e.escala.toFixed(3)})`);
        if (fl.length) malosR.push(`${w0}×${h0} → ${p.id} ${JSON.stringify(m)}: ${fl.join(", ")}`);
      }
    }
  }
  ok("recortando: suma exacto, nunca corta contenido, nunca más chico ni deformado (todas las formas × tamaños × márgenes)", malosR.length === 0, malosR.slice(0, 4).join(" | "));
  const sin = encajar(1080, 1080, 1200, 627);
  const con = encajar(1080, 1080, 1200, 627, { top: 220, right: 0, bottom: 220, left: 0 });
  ok(`1080² con 220 px lisos arriba y abajo → 1200×627: el anuncio crece (${sin.sh}→${con.completo.h} px de alto) y cubre más (${Math.round(sin.cobertura * 100)} → ${Math.round(con.cobertura * 100)} %)`, con.completo.h > sin.sh && con.cobertura > sin.cobertura && con.sh === 627);
  eq("sin margen, igual que antes (mismo resultado exacto)", encajar(1080, 1080, 1200, 627, SIN_RECORTE), sin);
  const tope = encajar(1080, 1350, 768, 1024, { top: 0, right: 200, bottom: 0, left: 200 });
  eq("4:5 → 3:4 con costados lisos: llena la medida (cover), sin nada que rellenar", [hayExpansion(tope), tope.sw, tope.sh], [false, 768, 1024]);
}

console.log("\n▶ v2 · sugerir con bordes lisos");
{
  const LISO = { top: true, right: true, bottom: true, left: true };
  const NADA = { top: false, right: false, bottom: false, left: false };
  eq("misma proporción → extender (no se paga IA por nada)", sugerir(encajar(1080, 1350, 1200, 1500), NADA), { modo: "extender", rediseno: false, encendido: true });
  eq("bordes lisos → extender aunque sobre mucho", sugerir(encajar(1080, 1080, 1080, 1920), LISO).modo, "extender");
  eq("sólo arriba/abajo lisos y hay que rellenar arriba/abajo → extender", sugerir(encajar(1080, 1080, 1080, 1920), { ...NADA, top: true, bottom: true }).modo, "extender");
  eq("lisos arriba/abajo pero hay que rellenar a los lados → IA", sugerir(encajar(1080, 1080, 1200, 627), { ...NADA, top: true, bottom: true }).modo, "ia");
  eq("banner extremo con bordes lisos: sigue siendo rediseño (apagado), con extender", sugerir(encajar(1080, 1080, 320, 50), LISO), { modo: "extender", rediseno: true, encendido: false });
  eq("modos válidos", [MODOS, esModo("extender"), esModo("nada")], [["extender", "ia", "blur", "color"], true, false]);
}

console.log("\n▶ v2 · bordesDe (fondo liso / degradado / contenido)");
{
  // Lienzo chico 200×200 con una "letra" oscura en medio (60..140) sobre fondo: liso o degradado vertical.
  const lienzo = (fondo) => {
    const w = 200, h = 200, a = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = x >= 60 && x < 140 && y >= 60 && y < 140 ? [10, 10, 10] : fondo(x, y);
      a.set([r, g, b, 255], i);
    }
    return a;
  };
  const plano = bordesDe(lienzo(() => [240, 200, 40]), 200, 200, 1000, 1000);
  ok(`fondo plano: los 4 lados lisos y recortable ≈ 0.7 × 59 líneas × 5 = ${plano.recortable.top} px`, Object.values(plano.liso).every(Boolean) && plano.recortable.top > 180 && plano.recortable.top < 210 && plano.recortable.left === plano.recortable.top);
  const degr = bordesDe(lienzo((x, y) => [30 + y / 2, 60 + y / 3, 200 - y / 2]), 200, 200, 1000, 1000);
  ok("degradado vertical: también liso y recortable (un degradado ES fondo)", Object.values(degr.liso).every(Boolean) && degr.recortable.top > 150);
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  const foto = bordesDe(lienzo(() => [rnd(), rnd(), rnd()]), 200, 200, 1000, 1000);
  eq("foto / textura: nada liso, nada recortable", foto, { recortable: SIN_RECORTE, liso: { top: false, right: false, bottom: false, left: false } });
  // Contenido pegado al borde de arriba: ese lado no es liso ni recortable; los demás sí.
  const pegado = bordesDe(lienzo((x, y) => (y < 10 && x > 50 && x < 150 ? [0, 0, 0] : [250, 250, 250])), 200, 200, 1000, 1000);
  ok("texto pegado al borde de arriba: arriba nada, abajo sí", pegado.recortable.top === 0 && !pegado.liso.top && pegado.liso.bottom && pegado.recortable.bottom > 0);
}

console.log("\n▶ v2 · pegar la lista del cliente");
{
  const texto = "9:16 (1080*1920)  1200*627  320*250\n320*50  1280*720  600*500\n876*324  768*1024  720*1600\n720*1280  640*100  4:5 (1200*1500)";
  const r = leerMedidas(texto);
  eq("la lista de la captura: 12 medidas, en orden, sin las proporciones sueltas", r.medidas.map((m) => `${m.w}x${m.h}`), ["1080x1920", "1200x627", "320x250", "320x50", "1280x720", "600x500", "876x324", "768x1024", "720x1600", "720x1280", "640x100", "1200x1500"]);
  eq("separadores x × X * y espacios; repetidas una vez; fuera de límites aparte", leerMedidas("300x250, 300 × 250; 728X90 | 10x10 9000*50"), { medidas: [{ w: 300, h: 250 }, { w: 728, h: 90 }], fuera: ["10×10", "9000×50"] });
  eq("texto sin medidas", leerMedidas("9:16 y 4:5 por favor"), { medidas: [], fuera: [] });
}

console.log("\n▶ v2 · componer: recorte + extender sobre un anuncio de fondo liso");
{
  // Anuncio 1080×1080: degradado vertical de fondo, "contenido" (bloque con ruido) en 300..780.
  const w0 = 1080, h0 = 1080;
  const px = Buffer.alloc(w0 * h0 * 4);
  let s = 99;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
    const i = (y * w0 + x) * 4;
    const dentro = x >= 300 && x < 780 && y >= 300 && y < 780;
    px.set(dentro ? [rnd(), rnd(), rnd(), 255] : [20 + y / 8, 90, 200 - y / 8, 255], i);
  }
  const f = await leerFuente(await sharp(px, { raw: { width: w0, height: h0, channels: 4 } }).png().toBuffer());
  const b = await analizarBordes(f);
  ok(`analizarBordes: 4 lados lisos, recortable ~${b.recortable.top} px por lado (< 300 del contenido)`, Object.values(b.liso).every(Boolean) && Object.values(b.recortable).every((v) => v > 120 && v < 300));
  const fallas = [];
  for (const p of TODAS) {
    const c = await componer(f, p.w, p.h, "extender", { bordes: b });
    const e = c.encaje;
    const nuestra = await escalarVisible(f, e);
    const relei = await sharp(c.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (!c.pixelLockOk || !zonaIdentica(relei.data, p.w, nuestra, e)) fallas.push(`${p.id}: pixel-lock`);
    if (c.costoUsd !== null) fallas.push(`${p.id}: costo`);
    // El contenido (300..780 del original) entero dentro de lo visible.
    const k = e.escala;
    const v = { x0: e.corte.x / k, x1: (e.corte.x + e.sw) / k, y0: e.corte.y / k, y1: (e.corte.y + e.sh) / k };
    if (v.x0 > 300 + 1 / k || v.x1 < 780 - 1 / k || v.y0 > 300 + 1 / k || v.y1 < 780 - 1 / k) fallas.push(`${p.id}: cortó contenido ${JSON.stringify(v)}`);
    if (relei.data[3] !== 255 || relei.data[relei.data.length - 1] !== 255) fallas.push(`${p.id}: esquina transparente`);
  }
  ok(`extender en ${TODAS.length} tamaños: pixel-lock, gratis, el contenido nunca se corta, esquinas opacas`, fallas.length === 0, fallas.slice(0, 5).join(" | "));
  const c = await componer(f, 1080, 1920, "extender", { bordes: b });
  const r = await sharp(c.png).raw().toBuffer();
  // Arriba del todo el degradado sigue con el color de la primera línea del anuncio (≈ [20, 90, 200]).
  const [R, G, B] = [r[0], r[1], r[2]];
  ok(`1080×1920 extendido: la esquina de arriba continúa el degradado (${R},${G},${B} ≈ 20,90,200)`, Math.abs(R - 20) <= 6 && Math.abs(G - 90) <= 6 && Math.abs(B - 200) <= 6);
  const conIA = await componer(f, 768, 1024, "ia", { bordes: b, expandir: async () => { throw new Error("no debía llamarse"); } }).catch((err) => err);
  ok("768×1024 con costados lisos: el recorte llena la medida → la IA ni se llama", !(conIA instanceof Error) && !hayExpansion(conIA.encaje) && conIA.costoUsd === null && conIA.pixelLockOk);
  eq("recortar nunca agranda más allá del tamaño real (1080² → 1080×1920 se queda a 1×)", encajar(1080, 1080, 1080, 1920, b.recortable).escala, 1);
}

// ── v2 · puerta PSD ──────────────────────────────────────────
console.log("\n▶ v2 · PSD: roles de la guía de diseño");
eq("rolDe: nombre completo, sin mayúsculas ni acentos", ["BRAND", "Subtitulo", " título ", "background", "Hero", "cta", "FOOTER"].map(rolDe), ["BRAND", "SUBTITULO", "TITULO", "BACKGROUND", "HERO", "CTA", "FOOTER"]);
eq("rolDe: nunca por 'contiene' (SUBTITULO no es TITULO) ni carpetas ajenas", ["SUBTITULO 2", "TITULOS", "Logo 2", "", "HERO copia", "Capa 1"].map(rolDe), [null, null, null, null, null, null]);
eq("rolDe: los otros nombres del equipo (PSD s33 de DiDi: Logo, Copy, CARD, Legales), sin mayúsculas ni acentos", ["Logo", "Copy", "CARD", "Legales", "Botón", "fondo", "BG", "Headline", "Beneficios"].map(rolDe), ["BRAND", "TITULO", "HERO", "FOOTER", "CTA", "BACKGROUND", "BACKGROUND", "TITULO", "SUBTITULO"]);
eq("nombreDeGuia: sólo los 7 nombres exactos de la guía", ["Subtítulo", "BACKGROUND", "Logo", "Copy", "TITULOS"].map(nombreDeGuia), [true, true, false, false, false]);

console.log("\n▶ v2 · PSD: leer y despiezar un anuncio sintético");
{
  const W = 400, H = 500;
  const dentro = (x, y, [l, t, w, h]) => x >= l && x < l + w && y >= t && y < t + h;
  const img = (w, h, fn) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a = 255] = fn(x, y); data.set([r, g, b, a], (y * w + x) * 4); }
    return { data, width: w, height: h };
  };
  const capa = (name, [l, t, w, h], fn, extra = {}) => ({ name, left: l, top: t, right: l + w, bottom: t + h, blendMode: "normal", opacity: 1, imageData: img(w, h, (x, y) => fn(x + l, y + t)), ...extra });
  const carpeta = (name, children, extra = {}) => ({ name, opened: true, children, ...extra });

  // La verdad, píxel a píxel (lo que "Photoshop" guardaría como copia aplanada).
  const base = (x, y) => [200 + 30 * Math.sin(x / 40), 180 + 20 * Math.cos(y / 50), 160];
  const tinte = (x, y) => { const v = 255 - (55 * y) / H; return [v, v, v]; };
  const fondoVerdad = (x, y) => base(x, y).map((v, k) => (v * tinte(x, y)[k]) / 255);
  const R = { sombra: [60, 300, 200, 60], producto: [80, 150, 140, 180], titulo: [40, 30, 320, 50], sub: [250, 170, 130, 60], cta: [250, 250, 130, 40], brand: [150, 95, 100, 30], footer: [40, 450, 320, 30] };
  const OSC = 1 + (128 / 255 - 1) * (200 / 255); // sombra gris 128 al 78 % de alfa, en multiplicar
  const verdad = (fondo) => (x, y) => {
    let c = fondo(x, y);
    if (dentro(x, y, R.sombra)) c = c.map((v) => v * OSC);
    if (dentro(x, y, R.producto)) c = [250, 120, 20]; // la capa es AZUL: el naranja sólo existe en el aplanado
    if (dentro(x, y, R.titulo)) c = c.map((v) => v * 0.5 + 255 * 0.5);
    if (dentro(x, y, R.sub)) c = [255, 212, 0];
    if (dentro(x, y, [R.cta[0], R.cta[1], R.cta[2] / 2, R.cta[3]])) c = [17, 17, 17]; // la máscara esconde la mitad derecha
    if (dentro(x, y, R.brand)) c = [240, 60, 30];
    if (dentro(x, y, R.footer)) c = [90, 90, 90];
    return c;
  };
  const arbol = () => [
    carpeta("Background", [capa("base", [0, 0, W, H], base), capa("tinte", [0, 0, W, H], tinte, { blendMode: "multiply" })]),
    carpeta("FOOTER", [capa("legal", R.footer, () => [90, 90, 90])]),
    carpeta("HERO", [capa("sombra", R.sombra, () => [128, 128, 128, 200], { blendMode: "multiply" }), capa("producto", R.producto, () => [10, 10, 200])]),
    carpeta("CTA", [capa("boton", R.cta, () => [17, 17, 17], { mask: { left: R.cta[0], top: R.cta[1], right: R.cta[0] + R.cta[2], bottom: R.cta[1] + R.cta[3], defaultColor: 255, imageData: img(R.cta[2], R.cta[3], (x) => (x < R.cta[2] / 2 ? [255, 255, 255] : [0, 0, 0])) } })]),
    carpeta("Subtitulo", [capa("beneficio", R.sub, () => [255, 212, 0])]),
    carpeta("TITULO", [capa("titular", R.titulo, () => [255, 255, 255, 128])]),
    carpeta("BRAND", [capa("logo", R.brand, () => [240, 60, 30])]),
    capa("borrador oculto", [0, 0, W, H], () => [255, 0, 0], { hidden: true }),
  ];
  const psdDe = (children, aplanado, real = true) =>
    writePsdBuffer({ width: W, height: H, children, imageData: img(W, H, (x, y) => aplanado(x, y)), imageResources: { versionInfo: { hasRealMergedData: real, writerName: "t", readerName: "t", fileVersion: 1 } } });
  const maxDif = (a, fn, caja = [0, 0, W, H]) => {
    let mx = 0;
    for (let y = caja[1]; y < caja[1] + caja[3]; y++) for (let x = caja[0]; x < caja[0] + caja[2]; x++) { const v = fn(x, y); for (let k = 0; k < 3; k++) mx = Math.max(mx, Math.abs(a[(y * W + x) * 3 + k] - v[k])); }
    return Math.round(mx);
  };

  const motivo = (fn) => { try { fn(); return "sin error"; } catch (err) { return err instanceof ErrorPsd ? err.motivo : `otro: ${err}`; } };
  const doc = leerPsd(psdDe(arbol(), verdad(fondoVerdad)));
  eq("leerPsd: sin mesas de trabajo, el lienzo es la mesa; la capa oculta no entra", [doc.mesas.length, doc.mesas[0].w, doc.mesas[0].h, doc.capas.length, doc.capas.some((c) => c.nombre.includes("oculto"))], [1, W, H, 9, false]);
  const ma = despiezar(doc, 0);
  eq("despiezar: 6 piezas con su rol, de abajo hacia arriba", ma.piezas.map((p) => p.rol), ["FOOTER", "HERO", "CTA", "SUBTITULO", "TITULO", "BRAND"]);
  ok(`el fondo sale como el de Photoshop (${ma.fondoDistintoPct.toFixed(2)} % distinto) y rearmado da el anuncio (${ma.rearmadoDistintoPct.toFixed(2)} %)`, ma.fondoDistintoPct < 0.5 && ma.rearmadoDistintoPct < 0.5 && despieceUsable(ma).ok, JSON.stringify(despieceUsable(ma)));
  ok(`fondo LIMPIO: bajo el producto y la sombra no queda rastro de ellos (dif. máx ${maxDif(ma.fondo, fondoVerdad)})`, maxDif(ma.fondo, fondoVerdad) <= 4);
  const pz = (rol) => ma.piezas.find((p) => p.rol === rol);
  const px = (p, x, y) => [...p.rgba.subarray(((y - p.caja.y) * p.caja.w + (x - p.caja.x)) * 4, ((y - p.caja.y) * p.caja.w + (x - p.caja.x)) * 4 + 4)];
  eq("el COLOR de la pieza sale del aplanado, no de la capa (azul en la capa, naranja en Photoshop)", px(pz("HERO"), 150, 200), [250, 120, 20, 255]);
  const t = px(pz("TITULO"), 200, 55);
  ok(`un titular al 50 % se des-mezcla del fondo: blanco con alfa 128 (${t})`, t[3] === 128 && t.slice(0, 3).every((v) => v >= 250));
  eq("la máscara recorta la silueta: del botón sólo viaja la mitad visible", [pz("CTA").solido.w, pz("CTA").solido.h], [R.cta[2] / 2, R.cta[3]]);
  const h = pz("HERO");
  const o = h.oscurece ? h.oscurece[((330 - h.caja.y) * h.caja.w + (70 - h.caja.x)) * 3] : -1;
  ok(`la sombra viaja con el HERO como "cuánto oscurece" (${o} ≈ ${Math.round(OSC * 255)}) y su caja la incluye`, Math.abs(o - OSC * 255) <= 3 && h.caja.x === R.sombra[0] && h.solido.x === R.producto[0]);
  ok("rearmar() devuelve el anuncio de Photoshop", maxDif(rearmar(ma), verdad(fondoVerdad)) <= 6, `dif. máx ${maxDif(rearmar(ma), verdad(fondoVerdad))}`);

  // Un ajuste de color sobre el fondo que NO pintamos (tinte parejo): se corrige solo, también bajo las piezas.
  const ajustado = (x, y) => fondoVerdad(x, y).map((v) => v * 0.85 + 12);
  const ma2 = despiezar(leerPsd(psdDe(arbol(), verdad(ajustado))), 0);
  ok(`ajuste de color que no pintamos: el fondo limpio lo trae igual (dif. máx ${maxDif(ma2.fondo, ajustado)}) y sigue usable`, maxDif(ma2.fondo, ajustado) <= 6 && despieceUsable(ma2).ok, JSON.stringify(despieceUsable(ma2)));

  // Textura que no coincide (el aplanado trae un fondo que las capas no explican): NO es usable.
  let s = 5;
  const ruido = new Uint8Array(W * H).map(() => ((s = (s * 1103515245 + 12345) & 0x7fffffff) % 200));
  const ma3 = despiezar(leerPsd(psdDe(arbol(), verdad((x, y) => { const v = 40 + ruido[y * W + x]; return [v, v, v]; }))), 0);
  ok(`fondo que las capas no explican (${ma3.fondoDistintoPct.toFixed(0)} % distinto) → no usable`, ma3.fondoDistintoPct > 50 && !despieceUsable(ma3).ok);

  // Dos piezas que se tapan: se avisa y no es usable.
  const tapado = arbol();
  tapado[6] = carpeta("BRAND", [capa("logo", [40, 30, 200, 50], () => [240, 60, 30])]);
  const ma4 = despiezar(leerPsd(psdDe(tapado, (x, y) => (dentro(x, y, [40, 30, 200, 50]) ? [240, 60, 30] : verdad(fondoVerdad)(x, y)))), 0);
  ok(`BRAND encima del TITULO: tapada ${ma4.piezas.find((p) => p.rol === "TITULO").tapadaPct.toFixed(0)} % → no usable, con motivo`, ma4.piezas.find((p) => p.rol === "TITULO").tapadaPct > 50 && despieceUsable(ma4).motivos.some((x) => x.includes("TITULO")));

  // Lo que manda el anuncio a la vía plana.
  eq("sin copia aplanada real → sin-aplanado", motivo(() => despiezar(leerPsd(psdDe(arbol(), verdad(fondoVerdad), false)), 0)), "sin-aplanado");
  eq("sin carpeta BACKGROUND → sin-fondo", motivo(() => despiezar(leerPsd(psdDe(arbol().slice(1), verdad(fondoVerdad))), 0)), "sin-fondo");
  eq("bytes que no son un PSD → no-soportado", motivo(() => leerPsd(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))), "no-soportado");
  eq("mesa que no existe → no-soportado", motivo(() => despiezar(doc, 3)), "no-soportado");

  // ── Lo que encontró el reap (2026-10-13): cada caso se vio FALLAR antes del arreglo ──
  const soloBase = () => carpeta("BACKGROUND", [capa("base", [0, 0, W, H], base)]);
  const px3 = (a, x, y) => [...a.subarray((y * W + x) * 3, (y * W + x) * 3 + 3)];

  // Sombra paralela (efecto de capa): vive FUERA de los píxeles de su capa. Antes se quedaba pintada en el fondo.
  {
    const T = [100, 100, 200, 40], S = [112, 112, 200, 40];
    const v = (x, y) => { let c = base(x, y); if (dentro(x, y, S)) c = c.map((n) => n * 0.6); if (dentro(x, y, T)) c = [255, 255, 255]; return c; };
    const sombra = { effects: { dropShadow: [{ enabled: true, size: { value: 0, units: "Pixels" }, distance: { value: 17, units: "Pixels" }, angle: 135, color: { r: 0, g: 0, b: 0 }, blendMode: "multiply", opacity: 0.4 }] } };
    const d = leerPsd(psdDe([soloBase(), carpeta("TITULO", [capa("t", T, () => [255, 255, 255], sombra)])], v));
    eq("leerPsd: la sombra paralela queda como halo de su capa (distancia + tamaño + 1; fuerza = su opacidad)", d.capas.find((c) => c.nombre === "t").halos, [{ tipo: "sombra", radio: 18, fuerza: 0.4 }]);
    const x = despiezar(d, 0);
    ok(`sombra paralela del titular: el fondo limpio no guarda su fantasma (dif. máx ${maxDif(x.fondo, base)}) y viaja con la pieza`, maxDif(x.fondo, base) <= 4 && !!x.piezas[0].oscurece && x.piezas[0].caja.w > T[2] && maxDif(rearmar(x), v) <= 6);
  }
  // Contorno por fuera: es parte de la silueta.
  {
    const B0 = [150, 200, 100, 40], B1 = [144, 194, 112, 52];
    const v = (x, y) => (dentro(x, y, B0) ? [17, 17, 17] : dentro(x, y, B1) ? [255, 0, 0] : base(x, y));
    const contorno = { effects: { stroke: [{ enabled: true, position: "outside", fillType: "color", size: { value: 6, units: "Pixels" }, color: { r: 255, g: 0, b: 0 }, blendMode: "normal", opacity: 1 }] } };
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("CTA", [capa("b", B0, () => [17, 17, 17], contorno)])], v)), 0);
    const s = x.piezas[0].solido;
    ok(`contorno de 6 px: la silueta del botón lo incluye (${s.w}×${s.h} ≥ 112×52) y el fondo queda limpio (dif. máx ${maxDif(x.fondo, base)})`, s.w >= 112 && s.h >= 52 && maxDif(x.fondo, base) <= 4 && maxDif(rearmar(x), v) <= 6);
  }
  // Una pieza de ARRIBA que oscurece a una de ABAJO: antes se oscurecía dos veces al rearmar.
  {
    const HE = [80, 150, 200, 200], SC = [60, 300, 260, 60];
    const v = (x, y) => { let c = base(x, y); if (dentro(x, y, HE)) c = [250, 120, 20]; if (dentro(x, y, SC)) c = c.map((n) => n * 0.6); return c; };
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("HERO", [capa("p", HE, () => [250, 120, 20])]), carpeta("FOOTER", [capa("velo", SC, () => [153, 153, 153], { blendMode: "multiply" })])], v)), 0);
    ok(`velo del FOOTER sobre el HERO: rearmado exacto (dif. máx ${maxDif(rearmar(x), v)}) y el HERO queda marcado, no usable`, maxDif(rearmar(x), v) <= 6 && despieceUsable(x).motivos.some((s) => s.includes("HERO")));
  }
  // La sombra del título que pasa DETRÁS de la tarjeta (s33, 2026-10-15): ahí no se ve, y quedaba sin sombra; en otra
  // medida, con la tarjeta corrida, asomaba un hueco claro con su forma. Ahora se llena con la sombra de alrededor.
  {
    const TI = [60, 60, 280, 60], SO = [20, 40, 360, 360], HE = [140, 200, 120, 160];
    const v = (x, y) => { let c = base(x, y); if (dentro(x, y, TI)) c = [255, 255, 255]; if (dentro(x, y, SO)) c = c.map((n) => n * 0.6); if (dentro(x, y, HE)) c = [250, 120, 20]; return c; };
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("TITULO", [capa("t", TI, () => [255, 255, 255]), capa("sombra", SO, () => [153, 153, 153], { blendMode: "multiply" })]), carpeta("HERO", [capa("p", HE, () => [250, 120, 20])])], v)), 0);
    const t = x.piezas.find((p) => p.rol === "TITULO");
    const oscEn = (X, Y) => (t.oscurece ? t.oscurece[((Y - t.caja.y) * t.caja.w + (X - t.caja.x)) * 3] : -1);
    ok(`sombra del título detrás de la tarjeta: se llena con la de alrededor (${oscEn(200, 280)} ≈ 153, no 255) y el rearmado no cambia (dif. máx ${maxDif(rearmar(x), v)})`, Math.abs(oscEn(200, 280) - 153) <= 4 && maxDif(rearmar(x), v) <= 6);
  }
  ok(
    "rellenarSuave: un anillo parejo deja el centro parejo; una rampa de 0 a 90 queda en rampa (45 ± 2 a la mitad)",
    (([c, m]) => c === 100 && Math.abs(m - 45) <= 2)((() => {
      const w = 40, h = 40, v = new Float32Array(w * h).fill(100), d = new Uint8Array(w * h);
      for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) { d[y * w + x] = 1; v[y * w + x] = 0; }
      rellenarSuave(v, d, w, h);
      const r = new Float32Array(31 * 5), dr = new Uint8Array(31 * 5);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 31; x++) { r[y * 31 + x] = x * 3; if (x > 0 && x < 30) dr[y * 31 + x] = 1; }
      rellenarSuave(r, dr, 31, 5);
      return [Math.round(v[20 * w + 20]), Math.round(r[2 * 31 + 15])];
    })()),
  );
  // Una capa de sombra es un rectángulo OPACO, blanco salvo donde oscurece: lo blanco no cuenta como sombra.
  // (En el PSD real, la sombra del HERO "tapaba" 90 % del FOOTER sin tocarlo.)
  {
    const HE = [80, 150, 140, 180], FO = [40, 450, 320, 30], SO = [0, 100, W, 400];
    const gris = (x, y) => (dentro(x, y, [60, 320, 200, 30]) ? [128, 128, 128] : [255, 255, 255]);
    const v = (x, y) => { let c = base(x, y); if (dentro(x, y, FO)) c = [90, 90, 90]; if (dentro(x, y, [60, 320, 200, 30])) c = c.map((n) => (n * 128) / 255); if (dentro(x, y, HE)) c = [250, 120, 20]; return c; };
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("FOOTER", [capa("legal", FO, () => [90, 90, 90])]), carpeta("HERO", [capa("sombra", SO, gris, { blendMode: "multiply" }), capa("p", HE, () => [250, 120, 20])])], v)), 0);
    const f = x.piezas.find((p) => p.rol === "FOOTER"), h = x.piezas.find((p) => p.rol === "HERO");
    ok(`sombra en rectángulo blanco: no tapa al FOOTER (${f.tapadaPct.toFixed(1)} %), la caja del HERO sólo crece por lo gris (${h.caja.w}×${h.caja.h}) y es usable`, f.tapadaPct === 0 && h.caja.w === 200 && h.caja.h === 200 && despieceUsable(x).ok && maxDif(rearmar(x), v) <= 6, JSON.stringify(despieceUsable(x)));
  }
  // Un tinte que no pintamos + una pieza que tapa el 70 % de lado a lado: antes el fondo "se olvidaba" del tinte lejos del borde.
  {
    const HE = [0, 0, 280, H];
    const tintado = (x, y) => base(x, y).map((n) => n * 0.85 + 12);
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("HERO", [capa("p", HE, () => [250, 120, 20])])], (a, b) => (dentro(a, b, HE) ? [250, 120, 20] : tintado(a, b)))), 0);
    ok(`pieza que tapa el 70 %: bajo ella el fondo sigue trayendo el tinte (dif. máx ${maxDif(x.fondo, tintado, HE)}; en x=5 ${px3(x.fondo, 5, 250)})`, maxDif(x.fondo, tintado, HE) <= 10);
  }
  // Fondo negro: "cuánto oscurece" no se puede medir ahí → la sombra no agranda la pieza ni ennegrece otro fondo.
  {
    const HE = [100, 100, 100, 100], SO = [90, 190, 140, 40];
    const x = despiezar(leerPsd(psdDe([carpeta("BACKGROUND", [capa("base", [0, 0, W, H], () => [0, 0, 0])]), carpeta("HERO", [capa("s", SO, () => [0, 0, 0, 150], { blendMode: "multiply" }), capa("p", HE, () => [250, 120, 20])])], (a, b) => (dentro(a, b, HE) ? [250, 120, 20] : [0, 0, 0]))), 0);
    eq("fondo negro con sombra: la caja del HERO es sólo lo sólido y no oscurece nada", [x.piezas[0].caja.w, x.piezas[0].caja.h, Math.min(...x.piezas[0].oscurece)], [100, 100, 255]);
  }
  // ── Segunda pasada del reap ──
  // Botón "fantasma": Relleno al 0 % con contorno INTERIOR. La capa no pinta nada, su efecto sí: la pieza existe.
  {
    const B0 = [150, 200, 100, 40];
    const v = (x, y) => (dentro(x, y, B0) && !dentro(x, y, [153, 203, 94, 34]) ? [255, 0, 0] : base(x, y));
    const fantasma = { fillOpacity: 0, effects: { stroke: [{ enabled: true, position: "inside", fillType: "color", size: { value: 3, units: "Pixels" }, color: { r: 255, g: 0, b: 0 }, blendMode: "normal", opacity: 1 }] } };
    const x = despiezar(leerPsd(psdDe([soloBase(), carpeta("CTA", [capa("b", B0, () => [17, 17, 17], fantasma)])], v)), 0);
    ok("botón al 0 % de Relleno con contorno interior: sigue siendo una pieza (antes desaparecía y su marco se quedaba en el fondo), con aviso", x.piezas.length === 1 && x.piezas[0].solido.w === 100 && x.piezas[0].solido.h === 40 && x.avisos.some((a) => a.includes("Relleno")) && maxDif(x.fondo, base, [150, 200, 100, 3]) <= 4, JSON.stringify([x.piezas.map((p) => p.solido), x.avisos]));
  }
  // La sombra paralela de una pieza de arriba que cae sobre una de abajo (sin que las piezas se toquen): sólo
  // marca a la de abajo si se nota.
  {
    const HE = [200, 100, 150, 300], T = [40, 150, 150, 40], S = [100, 210, 150, 40]; // sombra corrida 60 px en diagonal
    const caso = (opacidad) => {
      const v = (x, y) => { let c = base(x, y); if (dentro(x, y, HE)) c = [250, 120, 20]; if (dentro(x, y, S)) c = c.map((n) => n * (1 - opacidad)); if (dentro(x, y, T)) c = [255, 255, 255]; return c; };
      const fx = { effects: { dropShadow: [{ enabled: true, size: { value: 0, units: "Pixels" }, distance: { value: 85, units: "Pixels" }, angle: 135, color: { r: 0, g: 0, b: 0 }, blendMode: "multiply", opacity: opacidad }] } };
      return despiezar(leerPsd(psdDe([soloBase(), carpeta("HERO", [capa("p", HE, () => [250, 120, 20])]), carpeta("TITULO", [capa("t", T, () => [255, 255, 255], fx)])], v)), 0);
    };
    const tenue = caso(0.03), fuerte = caso(0.5);
    const heroDe = (x) => x.piezas.find((p) => p.rol === "HERO").tapadaPct;
    ok(`sombra del titular que cae sobre el HERO: al 3 % no lo marca (${heroDe(tenue).toFixed(1)} %), al 50 % sí (${heroDe(fuerte).toFixed(1)} %)`, heroDe(tenue) === 0 && despieceUsable(tenue).ok && heroDe(fuerte) > TAPADA_MAX_PCT && !despieceUsable(fuerte).ok, JSON.stringify([despieceUsable(tenue), despieceUsable(fuerte)]));
  }
  // Máscara "ocultar todo" sin pintar: esa capa no existe para Photoshop.
  {
    const oculta = capa("fantasma", [20, 20, 360, 60], () => [0, 255, 0], { mask: { left: 0, top: 0, right: 0, bottom: 0, defaultColor: 0 } });
    const d = leerPsd(psdDe([soloBase(), carpeta("BRAND", [oculta, capa("logo", R.brand, () => [240, 60, 30])])], (x, y) => (dentro(x, y, R.brand) ? [240, 60, 30] : base(x, y))));
    const x = despiezar(d, 0);
    eq("capa con máscara 'ocultar todo' sin pintar: no entra a la silueta", [d.capas.some((c) => c.nombre === "fantasma"), x.piezas[0].solido.w, x.piezas[0].solido.h], [false, R.brand[2], R.brand[3]]);
  }
  // Una capa en multiplicar casi blanca que cubre todo: no oscurece nada visible y no debe "tapar todo el fondo".
  {
    const HE = [100, 100, 100, 100];
    const v = (x, y) => (dentro(x, y, HE) ? [250, 120, 20] : base(x, y).map((n) => (n * 252) / 255));
    eq("multiplicar casi blanco sobre toda la mesa: el fondo sigue viéndose (antes: sin-fondo)", motivo(() => despiezar(leerPsd(psdDe([soloBase(), carpeta("HERO", [capa("velo", [0, 0, W, H], () => [252, 252, 252], { blendMode: "multiply" }), capa("p", HE, () => [250, 120, 20])])], v)), 0)), "sin error");
  }
  // La copia aplanada con un cuarto canal que NO es transparencia (una selección guardada): se ignora.
  {
    const v = verdad(fondoVerdad);
    const x = despiezar(leerPsd(psdDe(arbol(), (a, b) => [...v(a, b), a < 200 ? 0 : 255])), 0);
    ok(`cuarto canal del aplanado ignorado: sigue saliendo el anuncio (rearmado ${x.rearmadoDistintoPct.toFixed(2)} %, dif. máx del fondo ${maxDif(x.fondo, fondoVerdad)})`, x.rearmadoDistintoPct < 0.5 && maxDif(x.fondo, fondoVerdad) <= 4);
  }
  // Límites para archivos ajenos.
  {
    const sueltas = Array.from({ length: PIEZAS_MAX + 1 }, (_, i) => capa(`suelta ${i}`, [i, i, 4, 4], () => [0, 0, 0]));
    eq(`${PIEZAS_MAX + 1} capas sueltas de primer nivel (cada una sería una pieza del tamaño de la mesa) → demasiado-grande`, motivo(() => despiezar(leerPsd(psdDe([soloBase(), ...sueltas], base)), 0)), "demasiado-grande");
    const bueno = psdDe(arbol(), verdad(fondoVerdad));
    const psb = Uint8Array.from(bueno); psb[5] = 2;
    eq("un PSB (versión 2) → no-soportado, antes de leerlo", motivo(() => leerPsd(psb)), "no-soportado");
    const pozo = new Uint8Array(bueno.length + 64); pozo.set(bueno, 32);
    eq("una vista en medio de un búfer más grande se lee igual (se copia)", leerPsd(pozo.subarray(32, 32 + bueno.length)).capas.length, 9);
    const raro = arbol(); raro[2] = carpeta("HE‮RO\u0007", raro[2].children); raro[1] = carpeta("x".repeat(500), raro[1].children);
    const dr = leerPsd(psdDe(raro, verdad(fondoVerdad)));
    eq("nombres del archivo: sin caracteres de control ni de dirección, y con tope de largo", [[...new Set(dr.capas.map((c) => c.pieza))].map((n) => (n.length > 20 ? n.length : n))], [["Background", 120, "HERO", "CTA", "Subtitulo", "TITULO", "BRAND"]]);
  }

  // Mesas de trabajo: dos anuncios en un archivo, cada capa en la suya; lo que queda fuera se ignora con aviso.
  const mesa = (name, dx, hijos) => carpeta(name, hijos.map((g) => (g.children ? { ...g, children: g.children.map((l) => ({ ...l, left: l.left + dx, right: l.right + dx, ...(l.mask ? { mask: { ...l.mask, left: l.mask.left + dx, right: l.mask.right + dx } } : {}) })) } : g)), { artboard: { rect: { top: 0, left: dx, bottom: H, right: dx + W } } });
  const dosMesas = writePsdBuffer({
    width: W * 2 + 40, height: H,
    children: [mesa("ANUNCIO_4x5", 0, arbol().slice(0, 7)), mesa("ANUNCIO_9x16", W + 40, arbol().slice(0, 7)), capa("nota suelta", [W + 5, 10, 20, 20], () => [0, 0, 0])],
    imageData: img(W * 2 + 40, H, (x, y) => (x < W ? verdad(fondoVerdad)(x, y) : x >= W + 40 ? verdad(fondoVerdad)(x - W - 40, y) : [0, 0, 0, 0])),
    imageResources: { versionInfo: { hasRealMergedData: true, writerName: "t", readerName: "t", fileVersion: 1 } },
  });
  const d2 = leerPsd(dosMesas);
  eq("dos mesas de trabajo: medidas, nombres y capas repartidas", [d2.mesas.map((m) => `${m.nombre}@${m.x}:${m.w}x${m.h}`), d2.capas.filter((c) => c.mesa === 0).length, d2.capas.filter((c) => c.mesa === 1).length], [["ANUNCIO_4x5@0:400x500", "ANUNCIO_9x16@440:400x500"], 9, 9]);
  ok("la capa fuera de las mesas se ignora, con aviso", d2.avisos.some((a) => a.includes("fuera de las mesas")));
  const m2 = despiezar(d2, 1);
  ok(`la segunda mesa se despieza en SUS coordenadas (rearmado ${m2.rearmadoDistintoPct.toFixed(2)} %, HERO en x=${m2.piezas.find((p) => p.rol === "HERO").solido.x})`, m2.rearmadoDistintoPct < 0.5 && m2.piezas.find((p) => p.rol === "HERO").solido.x === R.producto[0] && despieceUsable(m2).ok);

  // ── Filtro propio (nitidez A, 2026-10-14): a la medida del maestro sale EXACTAMENTE el anuncio rearmado ──
  {
    const lista = prepararMaestro(ma).maestro, px = armarMedida(lista, acomodar(ma, W, H), W, H), ref = rearmar(ma);
    let mx = 0;
    for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) mx = Math.max(mx, Math.abs(px[i * 4 + c] - ref[i * 3 + c]));
    ok(`armarMedida a la medida del maestro = el anuncio rearmado (dif. máx ${mx}, sólo redondeo)`, mx <= 1 && px.length === W * H * 4 && px.every((v, i) => i % 4 !== 3 || v === 255));
  }

  // ── PSD muy grandes (Pedro, 2026-10-14: "A and B now") ──
  const igualBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const mismoDespiece = (a, b) => igualBytes(a.fondo, b.fondo) && a.piezas.length === b.piezas.length && a.piezas.every((p, i) => igualBytes(p.rgba, b.piezas[i].rgba) && JSON.stringify(p.caja) === JSON.stringify(b.piezas[i].caja) && p.letraMinPx === b.piezas[i].letraMinPx);
  {
    // Un PSD con 3 MB de "original de objeto inteligente" (bloque lnk2), como los reales.
    const relleno = Uint8Array.from({ length: 3_000_000 }, (_, i) => (i * 31) & 255);
    const conObjeto = writePsdBuffer({ width: W, height: H, children: arbol(), linkedFiles: [{ id: "20953ddb-9391-11ec-b4f1-c15674f50bc4", name: "foto.psb", type: "8BPB", creator: "8BIM", data: relleno }], imageData: img(W, H, (x, y) => verdad(fondoVerdad)(x, y)), imageResources: { versionInfo: { hasRealMergedData: true, writerName: "t", readerName: "t", fileVersion: 1 } } });
    const flaco = await adelgazarPsd(new Blob([conObjeto]), PSD_BYTES_MAX);
    ok(`adelgazar quita el original del objeto inteligente (${(conObjeto.length / 1e6).toFixed(1)} → ${(flaco.datos.byteLength / 1e6).toFixed(1)} MB; quitó ${flaco.quitados} bytes por 3 000 000 de datos) y nada más`, flaco.quitados >= 3_000_000 && flaco.quitados < 3_001_000 && conObjeto.length - flaco.datos.byteLength === flaco.quitados);
    ok("el PSD adelgazado da EXACTAMENTE el mismo despiece (fondo, piezas, cajas, letra)", mismoDespiece(despiezar(leerPsd(flaco.datos), 0), despiezar(leerPsd(conObjeto), 0)));
    const sinNada = psdDe(arbol(), verdad(fondoVerdad));
    const igual = await adelgazarPsd(new Blob([sinNada]), PSD_BYTES_MAX);
    ok("un PSD sin nada que quitar sale byte por byte igual", igual.quitados === 0 && igualBytes(new Uint8Array(igual.datos), sinNada));
    const pesado = await adelgazarPsd(new Blob([conObjeto]), 100_000).then(() => null, (e) => e);
    ok("si aun sin lo que sobra pasa del tope: PsdPesado con lo que pesaría, ANTES de reservar memoria", pesado instanceof PsdPesado && pesado.mb === Math.round(flaco.datos.byteLength / 1e6) && pesado.mb < 1, String(pesado));
    ok(`PsdPesado dice si se le quitó algo (${pesado?.quitados} bloques): el mensaje "ya sin los originales" sólo si es verdad`, pesado?.quitados > 0);
    // Lo que no se entiende no se quita: un archivo cortado a la mitad o con basura al final se entrega entero.
    const cortado = conObjeto.subarray(0, Math.floor(conObjeto.length / 2));
    const c = await adelgazarPsd(new Blob([cortado]), PSD_BYTES_MAX);
    ok("PSD cortado: no se quita nada (se entrega tal cual y que leerPsd decida)", c.quitados === 0 && c.datos.byteLength === cortado.length);
    const basura = await adelgazarPsd(new Blob([new Uint8Array(40).fill(7)]), PSD_BYTES_MAX);
    ok("bytes que no son un PSD: se entregan tal cual (leerPsd los rechaza con su mensaje)", basura.quitados === 0 && basura.datos.byteLength === 40 && motivo(() => leerPsd(basura.datos)) === "no-soportado");
    eq("el tope de archivo es el del formato PSD (2 GB)", PSD_ARCHIVO_MAX, 2 ** 31);
    // Photoshop rellena los bloques a 4 bytes (la especificación dice "a par"): el PSD real de hoy tenía eso y la
    // primera versión no quitaba NADA. Aquí: un bloque de 2 bytes + 2 de relleno antes del objeto inteligente.
    const con4 = (() => {
      const b = Uint8Array.from(conObjeto), v = new DataView(b.buffer);
      const posLargo = 26 + 4 + v.getUint32(26) + 4 + v.getUint32(26 + 4 + v.getUint32(26));
      const sig = [...new TextEncoder().encode("8BIMlnk2")];
      const at = b.findIndex((_, i) => sig.every((c, k) => b[i + k] === c));
      const extra = Uint8Array.from([...new TextEncoder().encode("8BIMxtra"), 0, 0, 0, 2, 1, 2, 0, 0]);
      const out = new Uint8Array(b.length + extra.length);
      out.set(b.subarray(0, at)); out.set(extra, at); out.set(b.subarray(at), at + extra.length);
      new DataView(out.buffer).setUint32(posLargo, v.getUint32(posLargo) + extra.length);
      return out;
    })();
    const f4 = await adelgazarPsd(new Blob([con4]), PSD_BYTES_MAX);
    ok(`relleno a 4 bytes (como Photoshop): igual quita el objeto inteligente (${f4.quitados} bytes) y da el mismo despiece`, f4.quitados === flaco.quitados && mismoDespiece(despiezar(leerPsd(f4.datos), 0), despiezar(leerPsd(con4), 0)));
  }
  {
    // Reducir por área: identidad a escala 1, promedio exacto, alfa premultiplicada y lo de afuera.
    const src = { data: Uint8ClampedArray.from([10, 20, 30, 255, 50, 60, 70, 255, 90, 100, 110, 255, 130, 140, 150, 255]), width: 2, height: 2 };
    eq("promediarArea a escala 1 = copia exacta", [...promediarArea(src, 0, 0, 1, 1, 2, 2, [0, 0, 0, 0], true).data], [...src.data]);
    eq("2×2 → 1×1 = el promedio de los cuatro", [...promediarArea(src, 0, 0, 2, 2, 1, 1, [0, 0, 0, 0], true).data], [70, 80, 90, 255]);
    const medio = { data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 0]), width: 2, height: 1 }; // rojo opaco + azul transparente
    eq("alfa premultiplicada: un vecino transparente no tiñe el color, sólo baja el alfa", [...promediarArea(medio, 0, 0, 2, 1, 1, 1, [0, 0, 0, 0], true).data], [255, 0, 0, 128]);
    eq("lo que cae fuera del original vale 'fuera' (una máscara blanca por defecto)", [...promediarArea({ data: Uint8ClampedArray.from([0, 0, 0, 255]), width: 1, height: 1 }, 0, 0, 2, 1, 1, 1, [255, 255, 255, 255], false).data], [128, 128, 128, 255]);
    ok("promediarArea sólo reduce (ampliar sería inventar píxeles)", motivo(() => promediarArea(src, 0, 0, 0.5, 0.5, 4, 4, [0, 0, 0, 0], true)).startsWith("otro"));
    // Una mesa enorme ya no se rechaza: se lee reducida, con aviso, y sigue usable.
    const N = W * H;
    const r1 = reducirMesa(doc, 0, N);
    ok("reducir una mesa a SU MISMO tamaño = el despiece de siempre (identidad)", r1.w === W && r1.h === H && mismoDespiece(despiezar(r1.doc, 0), despiezar(doc, 0)));
    const chica = despiezar(doc, 0, { mesaMaxPx: Math.floor(N / 4) });
    const normal = despiezar(doc, 0);
    ok(`mesa de más píxeles que el tope: se lee REDUCIDA a ${chica.w}×${chica.h}, usable (rearmado ${chica.rearmadoDistintoPct.toFixed(2)} %), con aviso`, chica.w === W / 2 && chica.h === H / 2 && despieceUsable(chica).ok && chica.avisos[0].includes("reducida a 200×250"), JSON.stringify([chica.w, chica.h, despieceUsable(chica), chica.avisos[0]]));
    const mismasCajas = chica.piezas.every((p, i) => Math.abs(p.solido.x * 2 - normal.piezas[i].solido.x) <= 2 && Math.abs(p.solido.w * 2 - normal.piezas[i].solido.w) <= 2 && Math.abs(p.solido.h * 2 - normal.piezas[i].solido.h) <= 2);
    ok("las piezas reducidas caen donde las originales, a la mitad (±1 px)", chica.piezas.map((p) => p.rol).join() === normal.piezas.map((p) => p.rol).join() && mismasCajas, JSON.stringify(chica.piezas.map((p) => p.solido)));
    const d2c = despiezar(d2, 1, { mesaMaxPx: Math.floor(N / 4) });
    ok("la SEGUNDA mesa de un archivo también se reduce en sus coordenadas (no toma píxeles de la primera)", despieceUsable(d2c).ok && d2c.w === W / 2 && d2c.rearmadoDistintoPct < 1, JSON.stringify(despieceUsable(d2c)));
  }
  {
    // Muchas mesas: la persona elige; se propone la más grande de cada forma.
    const m = (w, h) => ({ w, h });
    eq("sugerir: la más grande de cada forma, en el orden del archivo", sugerirMesas([m(1080, 1920), m(720, 1280), m(1200, 1500), m(600, 750), m(1080, 1080), m(1280, 720)]), [0, 2, 4, 5]);
    eq(`sugerir: a lo más ${MESAS_AUTO}, las formas más repetidas primero`, sugerirMesas([m(100, 100), m(200, 100), m(300, 100), m(400, 100), m(500, 100), m(1080, 1920), m(540, 960), m(1200, 1500), m(600, 750)]).length, MESAS_AUTO);
    eq("sugerir: medidas inválidas no se proponen", sugerirMesas([m(0, 0), m(NaN, 5), m(100, 100)]), [2]);
    eq("sugerir: la más GRANDE aunque venga después de una chica de la misma forma", sugerirMesas([m(720, 1280), m(600, 750), m(1080, 1920), m(1200, 1500)]), [2, 3]);
  }
}

// ── v2 · acomodo: dónde va cada pieza en cada medida ─────────
console.log("\n▶ v2 · acomodo: las 12 medidas del equipo sobre las cajas del PSD real (DiDi Giant Card)");
{
  const pz = (nombre, x, y, w, h, letraMinPx = null) => ({ nombre, rol: rolDe(nombre), solido: { x, y, w, h }, letraMinPx });
  // Las cajas que `despiezar` saca del PSD real (2026-10-13). De abajo hacia arriba.
  const M916 = { nombre: "APGIANTCARDUGC_9x16_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", w: 1080, h: 1920, piezas: [pz("FOOTER", 131, 1485, 818, 70, 16), pz("HERO", 105, 558, 692, 695), pz("CTA", 365, 1290, 348, 110, 51.2), pz("Subtitulo", 632, 625, 338, 194, 31.9), pz("TITULO", 193, 336, 681, 176, 34.8), pz("BRAND", 312, 202, 457, 80)] };
  const M45 = { nombre: "APGIANTCARDUGC_4x5_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", w: 1200, h: 1500, piezas: [pz("FOOTER", 204, 1361, 790, 62, 16), pz("HERO", 113, 508, 788, 791), pz("CTA", 788, 856, 306, 97, 45), pz("Subtitulo", 684, 617, 383, 194, 32), pz("TITULO", 188, 238, 824, 212, 42), pz("BRAND", 364, 86, 472, 83)] };
  const MESAS = [M916, M45];
  // Medida · de qué mesa sale según el script del equipo · familia.
  const DOCE = [[1080, 1920, 0, "igual"], [720, 1280, 0, "igual"], [720, 1600, 0, "igual"], [1200, 1500, 1, "igual"], [768, 1024, 1, "igual"], [1280, 720, 1, "horizontal"], [1200, 627, 1, "horizontal"], [876, 324, 1, "ancho"], [600, 500, 1, "display"], [320, 250, 1, "display"], [640, 100, 1, "banner"], [320, 50, 1, "banner"]];
  eq("cada medida sale de la misma mesa que en el script del equipo, con su familia", DOCE.map(([W, H]) => [elegirMaestro(MESAS, W, H), familiaDe(W, H, MESAS[elegirMaestro(MESAS, W, H)])]), DOCE.map(([, , i, f]) => [i, f]));
  const hechos = DOCE.map(([W, H, i]) => ({ W, H, ma: MESAS[i], a: acomodar(MESAS[i], W, H) }));
  // Medidas chicas (Pedro, 2026-10-14): se quita el legal y luego el subtítulo, y el texto que queda se agranda.
  // El legal NUNCA se quita (Pedro, 2026-10-15: "legales can never be removed"): sólo el subtítulo, en 320×50.
  eq("las 12 llevan el legal; sólo 320×50 quita el subtítulo para que el resto se lea", hechos.map((x) => x.a.puestas.length), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5]);
  ok("lo que se quitó es exactamente lo que no se colocó, y sólo el subtítulo", hechos.every((x) => x.a.quitadas.every((i) => x.ma.piezas[i].rol === "SUBTITULO") && x.ma.piezas.every((_, i) => x.a.puestas.some((q) => q.pieza === i) !== x.a.quitadas.includes(i))));
  eq("cada quitada lleva su aviso", hechos.filter((x) => x.a.quitadas.length).map((x) => [`${x.W}x${x.H}`, x.a.avisos.filter((v) => v.tipo === "quitada").length]), [["320x50", 1]]);
  eq(`9 pasan todas las comprobaciones; en las 3 chicas el legal queda bajo ${LETRA_MIN_PX} px y se marca (320×50 además por el subtítulo quitado)`, hechos.filter((x) => x.a.avisos.length).map((x) => [`${x.W}x${x.H}`, [...new Set(x.a.avisos.map((v) => v.tipo))]]), [["320x250", ["letra"]], ["640x100", ["letra"]], ["320x50", ["quitada", "letra"]]]);
  const anchaChica = acomodar(MESAS[1], 438, 162);
  const textoDe = (ma, a) => a.letras.filter((l) => ma.piezas[l.pieza].rol !== "FOOTER");
  ok(`una ancha chica (438×162, tres zonas): se queda el legal, se quita el subtítulo y el resto del texto llega a ${LETRA_MIN_PX} px`, anchaChica.familia === "ancho" && anchaChica.quitadas.map((i) => MESAS[1].piezas[i].rol).join() === "SUBTITULO" && anchaChica.puestas.some((q) => MESAS[1].piezas[q.pieza].rol === "FOOTER") && textoDe(MESAS[1], anchaChica).every((l) => l.px >= LETRA_MIN_PX), JSON.stringify([anchaChica.quitadas, anchaChica.letras]));
  const chico916 = acomodar(MESAS[0], 360, 640);
  ok("en el acomodo del diseñador (un 9:16 a un tercio) no se quita nada: la letra chica se marca", chico916.familia === "igual" && chico916.quitadas.length === 0 && chico916.puestas.length === 6 && chico916.avisos.some((v) => v.tipo === "letra"), JSON.stringify(chico916.avisos));
  ok(`320×250 y 640×100: todo el texto (menos el legal, que va en su franja) llega a ${LETRA_MIN_PX} px`, hechos.filter((x) => ["320x250", "640x100"].includes(`${x.W}x${x.H}`)).every((x) => textoDe(x.ma, x.a).every((l) => l.px >= LETRA_MIN_PX)), JSON.stringify(hechos.slice(9, 11).map((x) => x.a.letras)));
  // La franja del legal crece sólo si el resto del texto puede ceder alto sin bajar del mínimo. Con M45 en 640×100 no
  // puede (el título queda en 10.3 px): el legal se queda en su franja de siempre (6.2 px). Con un título de letra
  // grande sí puede, y el legal sube.
  const pieDe = (ma, a) => a.letras.find((l) => ma.piezas[l.pieza].rol === "FOOTER")?.px ?? 0;
  const tituloGrande = { ...M45, piezas: M45.piezas.map((p) => (p.rol === "TITULO" || p.rol === "SUBTITULO" || p.rol === "CTA" ? { ...p, letraMinPx: p.letraMinPx * 3 } : p)) };
  const banner = acomodar(tituloGrande, 640, 100);
  ok(
    `el legal que no llega a ${LETRA_MIN_PX} px gana una franja más alta cuando el resto del texto puede ceder (y el resto sigue ≥ ${LETRA_MIN_PX} px)`,
    pieDe(tituloGrande, banner) > pieDe(M45, hechos[10].a) + 0.5 && textoDe(tituloGrande, banner).every((l) => l.px >= LETRA_MIN_PX),
    JSON.stringify([pieDe(M45, hechos[10].a), pieDe(tituloGrande, banner), banner.letras]),
  );
  const pie = (x) => x.a.puestas.find((q) => x.ma.piezas[q.pieza].rol === "FOOTER");
  ok("regla del legal: el pie nunca queda más grande de como lo dejó el diseñador", hechos.filter((x) => x.a.familia === "igual").every((x) => pie(x).k <= Math.max(1, Math.min(x.W / x.ma.w, x.H / x.ma.h)) + 1e-9) && pie({ ma: M45, a: acomodar(M45, 2400, 3000) }).k === 2);
  ok("regla del legal: en las medidas con la forma del maestro el pie crece más que el resto, sin tocar la pieza de arriba", hechos.filter((x) => x.a.familia === "igual" && x.W !== x.ma.w).every((x) => pie(x).k > Math.min(x.W / x.ma.w, x.H / x.ma.h) + 0.01 && x.a.puestas.every((q) => q === pie(x) || q.y + q.h <= pie(x).y || q.y >= pie(x).y + pie(x).h || q.x + q.w <= pie(x).x || q.x >= pie(x).x + pie(x).w)));
  eq("el maestro tal cual: cada pieza en su lugar, a escala 1", acomodar(M45, 1200, 1500).puestas.map((q) => [q.k, Math.round(q.x), Math.round(q.y)]), M45.piezas.map((p) => [1, p.solido.x, p.solido.y]));

  // HERO a la derecha (como el equipo) y el volteo.
  const heroX = (ma, a) => { const q = a.puestas.find((p) => ma.piezas[p.pieza].rol === "HERO"); return q.x + q.w / 2; };
  const conLado = hechos.filter((x) => sePuedeVoltear(x.a.familia));
  eq("se puede voltear en horizontales, anchas y display", conLado.map((x) => `${x.W}x${x.H}`), ["1280x720", "1200x627", "876x324", "600x500", "320x250"]);
  ok("por omisión el HERO va a la DERECHA; con heroLado 'izquierda' todo el acomodo es el espejo exacto", conLado.every((x) => {
    const v = acomodar(x.ma, x.W, x.H, { heroLado: "izquierda" });
    return heroX(x.ma, x.a) > x.W / 2 && heroX(x.ma, v) < x.W / 2 && v.puestas.every((q, i) => Math.abs(q.x - (x.W - x.a.puestas[i].x - x.a.puestas[i].w)) < 0.01 && q.y === x.a.puestas[i].y && q.k === x.a.puestas[i].k) && v.avisos.length === x.a.avisos.length;
  }));
  ok("donde no hay columnas (misma forma, banner) voltear no cambia nada", hechos.filter((x) => !sePuedeVoltear(x.a.familia)).every((x) => JSON.stringify(acomodar(x.ma, x.W, x.H, { heroLado: "izquierda" }).puestas) === JSON.stringify(x.a.puestas)));

  console.log("\n▶ v2 · acomodo: invariantes con maestros raros × todas las medidas");
  const sin = (ma, rol) => ({ ...ma, piezas: ma.piezas.filter((p) => p.rol !== rol) });
  const RAROS = {
    "4:5 real": M45, "9:16 real": M916, "sin CTA": sin(M45, "CTA"), "sin HERO": sin(M45, "HERO"), "sin FOOTER": sin(M45, "FOOTER"), "sólo HERO": { ...M45, piezas: M45.piezas.filter((p) => p.rol === "HERO") },
    "hero muy ancho": { ...M45, piezas: M45.piezas.map((p) => (p.rol === "HERO" ? pz("HERO", 50, 700, 1100, 250) : p)) },
    "hero muy alto": { ...M45, piezas: M45.piezas.map((p) => (p.rol === "HERO" ? pz("HERO", 500, 300, 160, 1000) : p)) },
    "carpeta ajena": { ...M45, piezas: [...M45.piezas, pz("STICKER", 900, 100, 200, 200)] },
    "calcomanía junto al pie": { ...M45, piezas: [...M45.piezas, pz("STICKER", 20, 1230, 140, 120)] },
    "hero que pisa el pie": { ...M45, piezas: M45.piezas.map((p) => (p.rol === "HERO" ? pz("HERO", 113, 508, 788, 862) : p)) },
    "texto alto y angosto": { ...M45, piezas: M45.piezas.map((p) => (p.rol === "TITULO" ? pz("TITULO", 100, 200, 300, 400, 40) : p.rol === "SUBTITULO" ? pz("Subtitulo", 700, 500, 300, 500, 30) : p)) },
    "maestro horizontal": { nombre: "X_16x9_Y", w: 1920, h: 1080, piezas: [pz("FOOTER", 100, 980, 1700, 60, 18), pz("HERO", 1000, 150, 800, 780), pz("CTA", 150, 760, 380, 120, 50), pz("Subtitulo", 150, 520, 600, 180, 30), pz("TITULO", 150, 250, 800, 220, 40), pz("BRAND", 150, 90, 400, 90)] },
  };
  const MEDIDAS = [...DOCE.map(([W, H]) => [W, H]), ...PRESETS.map((p) => [p.w, p.h]), [2000, 100], [100, 2000], [300, 300], [32, 32], [4096, 32]];
  const solapa = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  // Sin zona · la de historias (15 % arriba, 20 % abajo) · una imposible, más grande que la medida.
  const ZONAS = { "sin zona": () => undefined, "zona de historia": (W, H) => ({ top: H * 0.15, right: 0, bottom: H * 0.2, left: 0 }), "zona imposible": (W) => ({ top: 0, right: W, bottom: 0, left: W }) };
  const malas = [];
  let casos = 0;
  for (const [nombre, ma] of Object.entries(RAROS))
    for (const [W, H] of MEDIDAS)
      for (const [nz, zona] of Object.entries(ZONAS))
      for (const heroLado of ["derecha", "izquierda"]) {
        casos++;
        const a = acomodar(ma, W, H, { heroLado, zona: zona(W, H) });
        const numeros = [...a.puestas.flatMap((q) => [q.k, q.x, q.y, q.w, q.h]), a.fondo.k, a.fondo.x, a.fondo.y];
        const cubre = a.fondo.x <= 0.01 && a.fondo.y <= 0.01 && a.fondo.x + ma.w * a.fondo.k >= W - 0.01 && a.fondo.y + ma.h * a.fondo.k >= H - 0.01;
        const dentro = a.puestas.every((q) => q.k > 0 && q.x >= -0.5 && q.y >= -0.5 && q.x + q.w <= W + 0.5 && q.y + q.h <= H + 0.5);
        const sinChoque = !a.avisos.some((v) => v.tipo === "fuera" || v.tipo === "encima");
        const nadaCallado = ma.piezas.every((p, i) => a.puestas.some((q) => q.pieza === i) || a.avisos.some((v) => (v.tipo === "falta" || v.tipo === "quitada") && v.texto.includes(etiquetaPieza(p))));
        // Con la forma del maestro: el pie puede crecer, pero no MÁS encima de nadie que a la escala de las demás
        // piezas, sobre su mismo pie (el centro de abajo: ahí lo ancla `anclarAlFondo` y desde ahí crece).
        let pieQuieto = true;
        const fi = ma.piezas.findIndex((p) => p.rol === "FOOTER"), f = a.puestas.find((q) => q.pieza === fi);
        const otra = a.puestas.find((q) => q !== f);
        if (a.familia === "igual" && f && otra) {
          const k0 = otra.k, s = ma.piezas[fi].solido;
          const f0 = { x: f.x + f.w / 2 - (s.w * k0) / 2, y: f.y + f.h - s.h * k0, w: s.w * k0, h: s.h * k0 };
          pieQuieto = a.puestas.every((q) => q === f || solapa(f, q) <= solapa(f0, q) + 0.01);
        }
        const zonaAvisada = nz !== "zona imposible" || a.avisos.some((v) => v.tipo === "zona");
        if (!numeros.every(Number.isFinite) || !cubre || !dentro || !sinChoque || !nadaCallado || !pieQuieto || !zonaAvisada) malas.push(`${nombre} → ${W}x${H} ${heroLado}, ${nz} (${a.familia}): ${JSON.stringify({ cubre, dentro, sinChoque, nadaCallado, pieQuieto, zonaAvisada })}`);
      }
  ok(`${casos} casos: números finitos, el fondo cubre, nada fuera, nada encimado, el pie no crece sobre nadie, y toda pieza o se coloca o se avisa`, malas.length === 0, malas.slice(0, 6).join("\n      "));
  const ajena = acomodar(RAROS["carpeta ajena"], 1200, 627);
  ok("una carpeta que no es de la guía no desaparece en silencio: se avisa", ajena.avisos.some((v) => v.tipo === "falta" && v.texto.includes("STICKER")) && acomodar(RAROS["carpeta ajena"], 768, 1024).puestas.length === 7);

  // Zona segura.
  const z = acomodar(M45, 1280, 720, { zona: { top: 0, right: 0, bottom: 0, left: 200 } });
  ok("zona segura a la izquierda: ninguna pieza entra en ella", z.puestas.every((q) => q.x >= 200) && !z.avisos.some((v) => v.tipo === "zona"));
  ok("con la forma del maestro la zona no mueve nada: se avisa qué pieza cae en ella", acomodar(M916, 1080, 1920, { zona: { top: 300, right: 0, bottom: 0, left: 0 } }).avisos.some((v) => v.tipo === "zona" && v.texto.includes("BRAND")));

  // Otra forma con el acomodo del diseñador (Pedro, 2026-10-14, s33: la tarjeta flotaba sobre el colchón y el legal
  // le caía encima): cada pieza con su pie sobre el mismo punto del fondo que en el maestro.
  const alFondo = (ma, a, q) => {
    const s = ma.piezas[q.pieza].solido;
    return [(q.x + q.w / 2 - a.fondo.x) / a.fondo.k - (s.x + s.w / 2), (q.y + q.h - a.fondo.y) / a.fondo.k - (s.y + s.h)];
  };
  const v916 = acomodar(M45, 1080, 1920);
  ok("4:5 → 1080×1920 sin canal: cada pieza (menos el legal, que crece) cae sobre su mismo punto del fondo (< 1 px del maestro)", v916.familia === "igual" && v916.puestas.filter((q) => M45.piezas[q.pieza].rol !== "FOOTER").every((q) => alFondo(M45, v916, q).every((d) => Math.abs(d) < 1)), JSON.stringify(v916.puestas.map((q) => alFondo(M45, v916, q).map(Math.round))));
  ok("y el legal también: su pie sobre su punto (crece hacia arriba desde ahí)", (([dx, dy]) => Math.abs(dy) < 1 && Math.abs(dx) < 1)(alFondo(M45, v916, v916.puestas.find((q) => M45.piezas[q.pieza].rol === "FOOTER"))));
  const historia = { top: 1920 * 0.14, right: 0, bottom: 1920 * 0.2, left: 0 };
  const conCanal = acomodar(M45, 1080, 1920, { zona: historia });
  const heroCanal = conCanal.puestas.find((q) => M45.piezas[q.pieza].rol === "HERO");
  ok("con la zona de historias: ninguna pieza queda debajo de lo que tapa la app (sin aviso de zona)", conCanal.puestas.every((q) => q.y >= historia.top && q.y + q.h <= 1920 - historia.bottom) && !conCanal.avisos.some((v) => v.tipo === "zona"), JSON.stringify(conCanal.puestas.map((q) => [M45.piezas[q.pieza].rol, Math.round(q.y), Math.round(q.y + q.h)])));
  // Con historias el contenido no cabe ni junto (1337 px del maestro a ×0.9 contra 1169 libres): se achica.
  ok("con la zona de historias el contenido no cabe ni junto: se achica todo por igual, sin bajar de 60 %", heroCanal.k < 0.9 && heroCanal.k >= 0.9 * 0.6 && conCanal.puestas.every((q) => q.k === heroCanal.k || M45.piezas[q.pieza].rol === "FOOTER"), String(heroCanal.k));
  // s33 (DiDi Buen Fin, 2026-10-14): la tarjeta parada en un colchón a 3/4 del alto. Cajas reales de `despiezar`.
  const M33 = { nombre: "BFDIRECT20CASH_4x5_STOCK_STATIC_IDEAE_EC_V1_NOV26_RN", w: 1200, h: 1500, piezas: [pz("CTA", 424, 1179, 352, 97, 44.9), pz("FOOTER", 205, 1361, 788, 62, 16), pz("TITULO", 287, 239, 611, 459, 59), pz("HERO", 468, 726, 279, 408), pz("BRAND", 146, 73, 907, 113)] };
  const s33Historia = acomodar(M33, 1080, 1920, { zona: historia });
  const heroS33 = s33Historia.puestas.find((q) => M33.piezas[q.pieza].rol === "HERO");
  ok(
    `s33 con historias: el fondo se agranda lo necesario (≤ ×${FONDO_ZOOM_MAX}) para que la tarjeta quede sobre su punto, y nada en la zona`,
    s33Historia.fondo.k > 1.28 && s33Historia.fondo.k <= 1.28 * FONDO_ZOOM_MAX + 1e-9 && alFondo(M33, s33Historia, heroS33).every((d) => Math.abs(d) < 1) && !s33Historia.avisos.some((v) => v.tipo === "zona"),
    JSON.stringify([s33Historia.fondo.k, alFondo(M33, s33Historia, heroS33)]),
  );
  ok("s33 sin canal: todas sobre su punto y el fondo cubre justo (×1.28)", ((a) => a.fondo.k === 1.28 && a.puestas.every((q) => alFondo(M33, a, q).every((d) => Math.abs(d) < 1)))(acomodar(M33, 1080, 1920)));
  const reels = acomodar(M45, 1080, 1920, { zona: { top: 1920 * 0.14, right: 1080 * 0.06, bottom: 1920 * 0.35, left: 1080 * 0.06 } });
  ok("si el HERO pide más zoom que el tope (APGIANT con reels, franja de 35 % abajo: pediría ×2), el fondo no se agranda y nada queda en la zona", reels.fondo.k === 1.28 && !reels.avisos.some((v) => v.tipo === "zona"), JSON.stringify([reels.fondo.k, reels.avisos]));
  ok("sin canal el fondo nunca se agranda de más (cubre justo)", [[1080, 1920], [720, 1600], [768, 1024]].every(([W, H]) => acomodar(M45, W, H).fondo.k === Math.max(W / 1200, H / 1500)));
  const arriba = acomodar(M45, 1080, 1920, { zona: { top: 250, right: 0, bottom: 0, left: 0 } });
  const heroArriba = arriba.puestas.find((q) => M45.piezas[q.pieza].rol === "HERO");
  ok("con una zona sólo arriba (el HERO sí cabe en su lugar): el HERO se queda sobre su punto y lo de arriba se junta hacia él, fuera de la zona", alFondo(M45, arriba, heroArriba).every((d) => Math.abs(d) < 1) && arriba.puestas.every((q) => q.y >= 250) && heroArriba.k === 0.9, JSON.stringify([alFondo(M45, arriba, heroArriba), arriba.puestas.map((q) => Math.round(q.y))]));
  // Lo que el diseñador dejó separado sigue separado, en todos los maestros raros, medidas «igual» y zonas.
  const separadas = [];
  for (const [nombre, ma] of Object.entries(RAROS))
    for (const [W, H] of MEDIDAS)
      for (const [nz, zona] of Object.entries(ZONAS)) {
        const a = acomodar(ma, W, H, { zona: zona(W, H) });
        if (a.familia !== "igual") continue;
        for (const q of a.puestas)
          for (const r of a.puestas) {
            const sq = ma.piezas[q.pieza].solido, sr = ma.piezas[r.pieza].solido;
            if (q.pieza < r.pieza && solapa(sq, sr) === 0 && solapa(q, r) > 1) separadas.push(`${nombre} → ${W}x${H} ${nz}: ${etiquetaPieza(ma.piezas[q.pieza])} / ${etiquetaPieza(ma.piezas[r.pieza])}`);
          }
      }
  ok("anclar al fondo nunca encima dos piezas que el diseñador dejó separadas (todos los raros × medidas × zonas)", separadas.length === 0, separadas.slice(0, 4).join(" | "));
  const sinLegal = [];
  for (const [nombre, ma] of Object.entries(RAROS))
    for (const [W, H] of MEDIDAS)
      for (const [nz, zona] of Object.entries(ZONAS)) {
        const fi = ma.piezas.findIndex((p) => p.rol === "FOOTER");
        if (fi >= 0 && !acomodar(ma, W, H, { zona: zona(W, H) }).puestas.some((q) => q.pieza === fi)) sinLegal.push(`${nombre} → ${W}x${H} ${nz}`);
      }
  ok("el legal nunca se quita: en todos los raros × medidas × zonas, si el maestro lo trae, se coloca", sinLegal.length === 0, sinLegal.slice(0, 4).join(" | "));

  const M33R = { nombre: "R", w: 120, h: 150, fondo: new Uint8ClampedArray(120 * 150 * 4).fill(200), piezas: [{ nombre: "CTA", rol: "CTA", caja: { x: 40, y: 110, w: 40, h: 12 }, solido: { x: 40, y: 110, w: 40, h: 12 }, letraMinPx: 6, rgba: new Uint8ClampedArray(40 * 12 * 4).fill(255), oscurece: null }] };
  // Edición a mano (Pedro, 2026-10-15: "an edit button ... move and or resize the elements ... and save your changes").
  const base1200 = acomodar(M45, 1200, 627);
  const iCta = M45.piezas.findIndex((p) => p.rol === "CTA"), iPie = M45.piezas.findIndex((p) => p.rol === "FOOTER");
  const movida = aplicarEdicion(M45, base1200, { [iCta]: { x: 40, y: 30, k: 0.8 } }, 1200, 627);
  const cta = movida.puestas.find((q) => q.pieza === iCta);
  ok(
    "editar: la pieza va donde la dejó la persona (caja = sólido × escala), las demás y el fondo no se mueven, y queda marcada",
    cta.x === 40 && cta.y === 30 && cta.k === 0.8 && cta.w === M45.piezas[iCta].solido.w * 0.8 && movida.editada === true &&
      JSON.stringify(movida.fondo) === JSON.stringify(base1200.fondo) && movida.puestas.every((q) => q.pieza === iCta || JSON.stringify(q) === JSON.stringify(base1200.puestas.find((r) => r.pieza === q.pieza))),
  );
  const chico = aplicarEdicion(M45, base1200, { [iPie]: { x: 10, y: 620, k: 0.3 } }, 1200, 627);
  ok("editar: lo que la persona hace se revisa igual (legal bajo 10 px → aviso de letra; fuera de la medida → aviso)", chico.avisos.some((v) => v.tipo === "letra" && v.texto.includes("FOOTER")) && chico.avisos.some((v) => v.tipo === "fuera" && v.texto.includes("FOOTER")), JSON.stringify(chico.avisos));
  const enZona = aplicarEdicion(M45, acomodar(M45, 1080, 1920), { [iCta]: { x: 300, y: 1800, k: 0.8 } }, 1080, 1920, { top: 0, right: 0, bottom: 300, left: 0 });
  ok("editar: con canal, una pieza que la persona deja bajo la franja de la app se avisa", enZona.avisos.some((v) => v.tipo === "zona" && v.texto.includes("CTA")));
  const encimada = aplicarEdicion(M45, base1200, { [iCta]: { ...base1200.puestas.find((q) => M45.piezas[q.pieza].rol === "HERO"), k: 0.5 } }, 1200, 627);
  ok("editar: encimar piezas lo decidió la persona a la vista: no se avisa (sí en el automático)", !encimada.avisos.some((v) => v.tipo === "encima"));
  ok("editar: una edición con números que no sirven (NaN, escala 0 o negativa) se ignora: queda el automático", aplicarEdicion(M45, base1200, { [iCta]: { x: NaN, y: 0, k: 1 }, [iPie]: { x: 0, y: 0, k: 0 } }, 1200, 627) === base1200);
  // Dos piezas que la persona NO tocó y se enciman se siguen avisando aunque haya movido otra (reap 2026-10-15).
  const iHero = M45.piezas.findIndex((p) => p.rol === "HERO"), iTit = M45.piezas.findIndex((p) => p.rol === "TITULO");
  const tit = base1200.puestas.find((q) => q.pieza === iTit);
  const conChoque = { ...base1200, puestas: base1200.puestas.map((q) => (q.pieza === iHero ? { ...q, x: tit.x, y: tit.y } : q)) };
  const otraMovida = aplicarEdicion(M45, conChoque, { [iCta]: { x: 40, y: 30, k: 0.8 } }, 1200, 627);
  ok("editar: mover una pieza no calla el aviso de otras dos (sin tocar) que se enciman", base1200.familia !== "igual" && otraMovida.avisos.some((v) => v.tipo === "encima" && v.texto.includes("HERO") && v.texto.includes("TITULO")), JSON.stringify(otraMovida.avisos));
  const loca = aplicarEdicion(M45, base1200, { [iCta]: { x: 1e9, y: -1e9, k: 1e6 } }, 1200, 627).puestas.find((q) => q.pieza === iCta);
  eq("editar: un dato guardado fuera de lo que deja el editor (k 1e6, x 1e9) se recorta a sus topes", [loca.k, loca.x, loca.y], [topesPieza(M45.piezas[iCta].solido, 1200, 627).max, 2400, -2400]);
  const r1 = revisarMedida([M33R], 1200, 627, { edicion: { 0: { x: 20, y: 20, k: 0.5 } } });
  ok(
    "revisarMedida con edición: la tarjeta y el resumen comparten la misma (misma edición → mismo objeto; otra → otro; sin edición → el automático)",
    r1 === revisarMedida([M33R], 1200, 627, { edicion: { 0: { x: 20, y: 20, k: 0.5 } } }) && r1 !== revisarMedida([M33R], 1200, 627, { edicion: { 0: { x: 21, y: 20, k: 0.5 } } }) && !revisarMedida([M33R], 1200, 627).acomodo.editada && r1.acomodo.editada === true,
  );
  eq("nombre de entrega: la medida de la mesa se cambia por la nueva; si no trae medida, se agrega", [nombreSalida(M45, 1200, 627), nombreSalida(M916, 320, 50), nombreSalida({ ...M45, nombre: "ANUNCIO" }, 600, 500)], ["APGIANTCARDUGC_1200x627_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", "APGIANTCARDUGC_320x50_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", "ANUNCIO_600x500"]);
  eq("nombre con una promo '2x1', o con la medida al principio / al final: se cambia la ficha que tiene la forma de la mesa", [nombreSalida({ nombre: "BUENFIN_2x1_9x16_FB", w: 1080, h: 1920 }, 1200, 627), nombreSalida({ nombre: "4x5_AD", w: 1200, h: 1500 }, 600, 500), nombreSalida({ nombre: "AD_4X5", w: 1200, h: 1500 }, 600, 500), nombreSalida({ nombre: "AD_", w: 1200, h: 1500 }, 600, 500)], ["BUENFIN_2x1_1200x627_FB", "600x500_AD", "AD_600x500", "AD_600x500"]);

  // Lo que encontró la revisión (2026-10-13). Cada caso se reprodujo ANTES de arreglarlo.
  console.log("\n▶ v2 · acomodo: lo que no debe pasar callado");
  {
    const ma = RAROS["calcomanía junto al pie"], a = acomodar(ma, 768, 1024);
    const f = a.puestas.find((q) => ma.piezas[q.pieza].rol === "FOOTER"), st = a.puestas.find((q) => ma.piezas[q.pieza].nombre === "STICKER");
    ok("el pie crece (regla del legal) pero nunca encima de una pieza que tiene al lado", f.k > 0.64 + 0.01 && solapa(f, st) === 0, JSON.stringify({ f, st }));
  }
  const zg = acomodar(M45, 1000, 500, { zona: { top: 0, right: 600, bottom: 0, left: 600 } });
  ok("una zona segura más grande que la medida: se avisa y se acomoda sin ella (antes salían tamaños negativos)", zg.avisos.filter((v) => v.tipo === "zona").length === 1 && JSON.stringify(zg.puestas) === JSON.stringify(acomodar(M45, 1000, 500).puestas));
  ok("zona con valores que no son medidas (NaN, negativos, infinito) cuenta como sin zona", JSON.stringify(acomodar(M45, 1280, 720, { zona: { top: NaN, right: -50, bottom: undefined, left: Infinity } })) === JSON.stringify(acomodar(M45, 1280, 720)));
  const aplanado = { ...M45, piezas: M45.piezas.map((p) => (p.rol === "FOOTER" ? { ...p, letraMinPx: null } : p)) };
  ok("legal aplanado (su letra no se puede medir): se avisa en cuanto se reduce, nunca se quita; a su tamaño, nada", acomodar(aplanado, 600, 500).avisos.some((v) => v.tipo === "letra" && v.texto.includes("FOOTER")) && acomodar(aplanado, 320, 50).avisos.some((v) => v.tipo === "letra" && v.texto.includes("FOOTER")) && !acomodar(aplanado, 320, 50).quitadas.some((i) => aplanado.piezas[i].rol === "FOOTER") && acomodar(aplanado, 1200, 1500).avisos.length === 0);
  eq("una medida vertical lejos de la forma del maestro sale con aviso; ninguna de las 12 del equipo lo lleva", [acomodar(M45, 1080, 1920).avisos.map((v) => v.tipo), hechos.some((x) => x.a.avisos.some((v) => v.tipo === "forma"))], [["forma"], false]);
  const rotas = acomodar({ ...M45, piezas: [...M45.piezas, pz("HERO", 0, 0, 0, 100), pz("CTA", NaN, 5, 10, 10)] }, 1200, 627);
  ok("una caja vacía o con NaN no se coloca y se avisa", rotas.puestas.length === 6 && rotas.avisos.filter((v) => v.tipo === "falta" && v.texto.includes("inválida")).length === 2, JSON.stringify(rotas.avisos));
  const heroRoto = acomodar({ ...M45, piezas: M45.piezas.map((p) => (p.rol === "HERO" ? pz("HERO", NaN, 508, 788, 791) : p)) }, 1200, 627);
  ok("HERO con caja inválida: se avisa y el fondo sigue con números de verdad", [heroRoto.fondo.k, heroRoto.fondo.x, heroRoto.fondo.y].every(Number.isFinite) && heroRoto.avisos.some((v) => v.tipo === "falta" && v.texto.includes("HERO")));
  const doble = acomodar({ ...M45, piezas: [...M45.piezas, pz("HERO", 100, 100, 300, 300)] }, 1200, 627);
  ok("dos carpetas HERO: se coloca una y la otra se avisa por lo que es", doble.puestas.length === 6 && doble.avisos.some((v) => v.tipo === "falta" && v.texto.includes("más de una carpeta «HERO»")), JSON.stringify(doble.avisos));
  eq("lista de mesas vacía → −1; una medida que no es un número positivo → error claro", [elegirMaestro([], 100, 100), [Infinity, NaN, 0, -5].map((W) => { try { acomodar(M45, W, 100); return "sigue"; } catch { return "error"; } })], [-1, ["error", "error", "error", "error"]]);
}

// ── v2 · la pantalla de la puerta PSD: lo que NO depende del navegador ─────────
console.log("\n▶ v2 · pantalla PSD: una medida completa, la guía de zona segura y lo que cruza del worker");
{
  const pz = (nombre, x, y, w, h, letraMinPx = null) => ({ nombre, rol: rolDe(nombre), solido: { x, y, w, h }, letraMinPx });
  const M916 = { nombre: "AD_9x16_FB", w: 1080, h: 1920, piezas: [pz("FOOTER", 131, 1485, 818, 70, 16), pz("HERO", 105, 558, 692, 695), pz("CTA", 365, 1290, 348, 110, 51.2), pz("Subtitulo", 632, 625, 338, 194, 31.9), pz("TITULO", 193, 336, 681, 176, 34.8), pz("BRAND", 312, 202, 457, 80)] };
  const M45 = { nombre: "AD_4x5_FB", w: 1200, h: 1500, piezas: [pz("FOOTER", 204, 1361, 790, 62, 16), pz("HERO", 113, 508, 788, 791), pz("CTA", 788, 856, 306, 97, 45), pz("Subtitulo", 684, 617, 383, 194, 32), pz("TITULO", 188, 238, 824, 212, 42), pz("BRAND", 364, 86, 472, 83)] };
  const lista = leerMedidas(MEDIDAS_EQUIPO);
  eq("la lista con la que arranca la pantalla son las 12 medidas del equipo, todas válidas y dentro del tope", [lista.medidas.length, lista.fuera, lista.medidas.length <= MEDIDAS_MAX, lista.medidas[0], lista.medidas[11]], [12, [], true, { w: 1080, h: 1920 }, { w: 320, h: 50 }]);
  // Zona segura POR CANAL (Pedro, 2026-10-14): sin canal no hay guía; con canal, sólo en 9:16 y sus escalas.
  const r1 = (z) => z && Object.fromEntries(Object.entries(z).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  eq("sin canal elegido no se marca nada, ni en 9:16", [zonaCanal(null, 1080, 1920), zonaCanal(undefined, 1080, 1920), zonaCanal("instagram", 1080, 1920), zonaCanal("__proto__", 1080, 1920)], [null, null, null, null]);
  eq("con canal: sólo en 9:16 y sus escalas directas", lista.medidas.filter((m) => zonaCanal("tiktok", m.w, m.h)).map((m) => `${m.w}x${m.h}`), ["1080x1920", "720x1280"]);
  eq("es916 = la misma regla que decide dónde hay guía", lista.medidas.filter((m) => es916(m.w, m.h)).map((m) => `${m.w}x${m.h}`), ["1080x1920", "720x1280"]);
  eq("Stories (Instagram y Facebook): 14 % arriba y 20 % abajo, sin costados", [r1(zonaCanal("ig-stories", 1080, 1920)), r1(zonaCanal("fb-stories", 1080, 1920))], [{ top: 268.8, right: 0, bottom: 384, left: 0 }, { top: 268.8, right: 0, bottom: 384, left: 0 }]);
  eq("Reels (Instagram y Facebook): 14 % arriba, 35 % abajo y 6 % a cada lado", [r1(zonaCanal("ig-reels", 1080, 1920)), r1(zonaCanal("fb-reels", 1080, 1920))], [{ top: 268.8, right: 64.8, bottom: 672, left: 64.8 }, { top: 268.8, right: 64.8, bottom: 672, left: 64.8 }]);
  eq("TikTok: los px que dio Pedro sobre 1080×1920 (el extremo seguro de cada rango) y su escala en 720×1280", [r1(zonaCanal("tiktok", 1080, 1920)), r1(zonaCanal("tiktok", 720, 1280))], [{ top: 200, right: 120, bottom: 300, left: 0 }, { top: 133.3, right: 80, bottom: 200, left: 0 }]);
  ok("cada canal tiene nombre visible y su zona deja lugar al anuncio (menos del 75 % de cada lado)", Object.values(CANALES).every((c) => c.nombre.length > 0 && c.pct.top + c.pct.bottom < 75 && c.pct.left + c.pct.right < 75) && Object.keys(CANALES).every(esCanal) && !esCanal("toString"));
  eq("la frase de zona segura del prompt no cambió (los prompts siguen con su propia regla de historia)", zonaSeguraImagen({ ...specVacio("imagen_cero", "nanobanana", "x"), destino: "ig_story", aspect: "9:16" }), "Safe zone: subject and text centered, top 15% and bottom 20% clear");
  eq("zonaCanal con medidas que no son medidas o que no son 9:16 → sin guía", [zonaCanal("tiktok", 0, 0), zonaCanal("tiktok", NaN, 5), zonaCanal("tiktok", 1080, 1080), zonaCanal("tiktok", 1920, 1080), zonaCanal("tiktok", 1200, 1500), zonaCanal("tiktok", -9, -16)], [null, null, null, null, null, null]);
  const m916 = acomodarMedida([M916, M45], 1080, 1920);
  ok("una medida completa: 9:16 sale de la mesa 9:16, y la zona del canal NO marca lo que colocó el diseñador (BRAND está dentro de ella)", m916.maestro === 0 && M916.piezas[5].solido.y < zonaCanal("ig-reels", 1080, 1920).top && m916.acomodo.avisos.length === 0, JSON.stringify(m916.acomodo.avisos));
  const m627 = acomodarMedida([M916, M45], 1200, 627, { heroLado: "izquierda" });
  ok("una medida completa: 1200×627 sale de la mesa 4:5 y respeta el lado pedido", m627.maestro === 1 && JSON.stringify(m627.acomodo) === JSON.stringify(acomodar(M45, 1200, 627, { heroLado: "izquierda" })));
  eq("sin mesas no hay medida: error claro, no un índice inventado", (() => { try { acomodarMedida([], 100, 100); return "sigue"; } catch (e) { return e.message; } })(), "acomodarMedida: sin maestros");
  eq("nombre de archivo: el de entrega del equipo cabe entero (antes se cortaba a 50) y un nombre con rutas o símbolos sale limpio", [limpiarNombre("APGIANTCARDUGC_1200x627_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", 120), limpiarNombre("../../etc/pa ss<wd>", 120), limpiarNombre("x".repeat(300), 120).length, limpiarNombre("x".repeat(300)).length], ["APGIANTCARDUGC_1200x627_WOMAN_REAL_STATIC_IDEAH2_FB_V2_OCT26_RN", "etc-pa-ss-wd", 120, 50]);

  // Lo que el worker le manda a la pantalla.
  const W2 = 4, H2 = 3;
  const fondoRgb = Uint8ClampedArray.from({ length: W2 * H2 * 3 }, (_, i) => (i * 7) % 256);
  const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(9), osc = Uint8ClampedArray.from({ length: 2 * 2 * 3 }, (_, i) => 100 + i);
  const base = new Uint8ClampedArray(16).fill(3), alfaTexto = new Uint8ClampedArray(6).fill(200);
  const texto = { capa: "Pídela ya", texto: { texto: "x", tramos: [], alineacion: "left", transform: [1, 0, 0, 1, 0, 0], caja: null, motivo: null }, opacidad: 1, caja: { x: 1, y: 1, w: 3, h: 2 }, alfa: alfaTexto, motivo: null };
  const crudo = { nombre: "mesa", w: W2, h: H2, fondo: fondoRgb, piezas: [{ nombre: "HERO", rol: "HERO", caja: { x: 0, y: 0, w: 2, h: 2 }, solido: { x: 0, y: 0, w: 2, h: 2 }, rgba, oscurece: osc, tapadaPct: 0, letraMinPx: null, textos: [], base: null }, { nombre: "CTA", rol: "CTA", caja: { x: 1, y: 1, w: 2, h: 2 }, solido: { x: 1, y: 1, w: 2, h: 2 }, rgba, oscurece: null, tapadaPct: 0, letraMinPx: 12, textos: [texto], base }], fondoDistintoPct: 0, rearmadoDistintoPct: 0, textoGamma: 1.45, avisos: ["nota"] };
  const { maestro: listo, transferibles, bytes: pesoListo } = prepararMaestro(crudo);
  eq("la gamma del texto de Photoshop viaja con el maestro", listo.textoGamma, 1.45);
  eq("lo que pesa un maestro al cruzar a la página = fondo + color, sombra, pieza sin texto y tinta de cada texto", pesoListo, W2 * H2 * 4 + (16 + 16) + 16 + 16 + 6);
  ok("la pieza sin texto y la tinta de cada texto también cruzan sin copiarse", listo.piezas[1].base === base && listo.piezas[1].textos[0].alfa === alfaTexto && transferibles.includes(base.buffer) && transferibles.includes(alfaTexto.buffer));
  ok("el fondo y el mapa de sombras llegan en RGBA opaco, con los mismos colores", listo.fondo.length === W2 * H2 * 4 && [...listo.fondo].every((v, i) => (i % 4 === 3 ? v === 255 : v === fondoRgb[Math.floor(i / 4) * 3 + (i % 4)])) && listo.piezas[0].oscurece.length === 16 && [...listo.piezas[0].oscurece].every((v, i) => (i % 4 === 3 ? v === 255 : v === osc[Math.floor(i / 4) * 3 + (i % 4)])) && listo.piezas[1].oscurece === null);
  ok("las piezas conservan su orden, rol, cajas y letra; los píxeles van sin copiar", listo.piezas.map((p) => p.rol).join() === "HERO,CTA" && listo.piezas[1].letraMinPx === 12 && listo.piezas[0].rgba === rgba && listo.avisos[0] === "nota" && listo.piezas[1].caja.x === 1);
  ok("cada búfer se transfiere UNA vez aunque dos piezas lo compartan (repetido tumbaría el postMessage)", transferibles.length === new Set(transferibles).size && transferibles.length === 5 && transferibles.includes(rgba.buffer), String(transferibles.length));
  // Tope de lienzos: una lista pegada no puede pedir 2 GB de memoria.
  const g = { w: 4096, h: 4096 }, c = { w: 320, h: 50 };
  eq("las 12 del equipo caben todas", medidasQueCaben(lista.medidas), { caben: lista.medidas, fuera: 0 });
  eq("30 medidas de 4096×4096 (2 GB de lienzos): sólo entran las que caben en el tope de píxeles, y se dice cuántas no", (({ caben, fuera }) => [caben.length, fuera, caben.reduce((s, m) => s + m.w * m.h, 0) <= MEDIDAS_PX_MAX])(medidasQueCaben(Array.from({ length: 30 }, () => g))), [4, 26, true]);
  eq("una enorme en medio no le quita su lugar a las chicas que vienen después, y se respeta el orden", medidasQueCaben([g, g, g, g, g, c, { w: 300, h: 250 }]).caben.map((m) => m.w), [4096, 4096, 4096, 4096, 320, 300]);
  eq(`más de ${MEDIDAS_MAX} medidas chicas: entran ${MEDIDAS_MAX}`, (({ caben, fuera }) => [caben.length, fuera])(medidasQueCaben(Array.from({ length: 45 }, () => c))), [MEDIDAS_MAX, 15]);
  ok("el tope de peso es uno solo: el que revisa la pantalla es el que aplica el lector", (() => { try { leerPsd(new Uint8Array(0).subarray(0)); } catch { /* vacío: otro error */ } try { leerPsd({ byteLength: PSD_BYTES_MAX + 1 }); return false; } catch (e) { return e instanceof ErrorPsd && e.motivo === "demasiado-grande"; } })());
}

// ── v2 · nitidez A: el filtro propio con piezas hechas a mano ─────────
console.log("\n▶ v2 · nitidez: filtro propio (Lanczos-3, alfa premultiplicada, enfoque sólo en texto)");
{
  const lleno = (w, h, c) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(c, i * 4); return d; };
  // Fondo blanco 200×200; una pieza roja de 100×100 con un borde transparente de 10 px alrededor (caja 120×120).
  const pieza = new Uint8ClampedArray(120 * 120 * 4);
  for (let y = 10; y < 110; y++) for (let x = 10; x < 110; x++) pieza.set([255, 0, 0, 255], (y * 120 + x) * 4);
  const ma = { w: 200, h: 200, fondo: lleno(200, 200, [255, 255, 255, 255]), piezas: [{ rol: "HERO", caja: { x: 40, y: 40, w: 120, h: 120 }, solido: { x: 50, y: 50, w: 100, h: 100 }, rgba: pieza, oscurece: null }] };
  const conK = (k, x, y) => ({ familia: "display", puestas: [{ pieza: 0, k, x, y, w: 100 * k, h: 100 * k }], fondo: { k: 1, x: 0, y: 0 }, letras: [], avisos: [], quitadas: [] });
  const px = armarMedida(ma, conK(0.37, 33.3, 41.7), 200, 200);
  let rojoMin = 255;
  for (let i = 0; i < 200 * 200; i++) rojoMin = Math.min(rojoMin, px[i * 4]);
  ok(`alfa premultiplicada: rojo sobre blanco reducido al 37 % en posición fraccionaria, sin orilla oscura (rojo mínimo ${rojoMin}, debe ser 255)`, rojoMin >= 254);
  // El fondo siempre cubre: ampliado un poco y corrido medio píxel, las orillas no se oscurecen (se extiende la orilla).
  const fondoDeg = new Uint8ClampedArray(100 * 100 * 4);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) fondoDeg.set([x * 2, 100, 200 - y, 255], (y * 100 + x) * 4);
  const f = armarMedida({ w: 100, h: 100, fondo: fondoDeg, piezas: [] }, { familia: "igual", puestas: [], fondo: { k: 1.07, x: -0.5, y: -3.2 }, letras: [], avisos: [], quitadas: [] }, 104, 100);
  const esquinas = [0, 103, 99 * 104, 99 * 104 + 103].map((i) => [f[i * 4], f[i * 4 + 1], f[i * 4 + 2]]);
  ok(`fondo ampliado y corrido: las esquinas conservan su color, sin negro de "afuera" (${JSON.stringify(esquinas)})`, esquinas.every((c) => c[1] >= 98 && c[2] >= 90));
  const mitad = armarMedida({ w: 100, h: 100, fondo: fondoDeg, piezas: [] }, { familia: "igual", puestas: [], fondo: { k: 0.5, x: 0, y: 0 }, letras: [], avisos: [], quitadas: [] }, 50, 50);
  ok(`fondo reducido a la mitad: la orilla conserva su color (verde ${mitad[1]} y ${mitad[(49 * 50 + 49) * 4 + 1]}, debe ser ~100)`, Math.abs(mitad[1] - 100) <= 2 && Math.abs(mitad[(49 * 50 + 49) * 4 + 1] - 100) <= 2);
  // Al reducir, el filtro se ensancha: un ajedrez de 1 px reducido a un tercio sale gris parejo, sin rayas (moiré).
  const ajedrez = new Uint8ClampedArray(99 * 99 * 4);
  for (let y = 0; y < 99; y++) for (let x = 0; x < 99; x++) { const v = (x + y) % 2 ? 255 : 0; ajedrez.set([v, v, v, 255], (y * 99 + x) * 4); }
  const gris = armarMedida({ w: 99, h: 99, fondo: ajedrez, piezas: [] }, { familia: "igual", puestas: [], fondo: { k: 1 / 3, x: 0, y: 0 }, letras: [], avisos: [], quitadas: [] }, 33, 33);
  let gmin = 255, gmax = 0;
  for (let y = 3; y < 30; y++) for (let x = 3; x < 30; x++) { const v = gris[(y * 33 + x) * 4]; gmin = Math.min(gmin, v); gmax = Math.max(gmax, v); }
  ok(`ajedrez de 1 px a un tercio: gris parejo (de ${gmin} a ${gmax}), sin moiré`, gmin >= 117 && gmax <= 138);
  // Enfoque: sólo a piezas de texto y sólo al reducirlas por debajo de ENFOQUE_DESDE.
  const conRol = (rol) => ({ ...ma, piezas: [{ ...ma.piezas[0], rol }] });
  const igual = (a, b) => a.every((v, i) => v === b[i]);
  const chico = conK(0.4, 20, 20), casi = conK(ENFOQUE_DESDE + 0.01, 20, 20);
  ok("el enfoque cambia una pieza de TEXTO reducida", !igual(armarMedida(conRol("TITULO"), chico, 200, 200), armarMedida(conRol("TITULO"), chico, 200, 200, { enfoque: false })));
  ok("el enfoque NO toca al HERO ni a la marca, ni a un texto casi a su tamaño", ["HERO", "BRAND"].every((r) => igual(armarMedida(conRol(r), chico, 200, 200), armarMedida(conRol(r), chico, 200, 200, { enfoque: false }))) && igual(armarMedida(conRol("TITULO"), casi, 200, 200), armarMedida(conRol("TITULO"), casi, 200, 200, { enfoque: false })));
  // Sombra (multiplicar): oscurece lo de abajo sólo dentro de su caja.
  const osc = lleno(120, 120, [128, 128, 128, 255]);
  const conSombra = { ...ma, piezas: [{ ...ma.piezas[0], rgba: new Uint8ClampedArray(120 * 120 * 4), oscurece: osc }] };
  const ps = armarMedida(conSombra, conK(1, 50, 50), 200, 200);
  eq("sombra a su tamaño: dentro de su caja el blanco queda a la mitad; justo afuera de la caja y lejos, intacto", [ps[(100 * 200 + 100) * 4], ps[(100 * 200 + 39) * 4], ps[(5 * 200 + 5) * 4]], [128, 255, 255]);
  // Texto vuelto a escribir: la pieza va SIN sus letras (base) y encima lo que devuelva `texto`.
  const conLetras = new Uint8ClampedArray(pieza);
  for (let y = 50; y < 60; y++) for (let x = 30; x < 90; x++) conLetras.set([255, 255, 255, 255], (y * 120 + x) * 4);
  const conBase = { ...ma, piezas: [{ ...ma.piezas[0], rol: "CTA", rgba: conLetras, base: pieza }] };
  const punto = (color) => (_p, l) => { const o = new Float32Array((l.x1 - l.x0) * (l.y1 - l.y0) * 4); o.set(color, ((100 - l.y0) * (l.x1 - l.x0) + (100 - l.x0)) * 4); return o; };
  const verde = punto([0, 255, 0, 255]);
  // Al 120 % la pieza cubre de 38 a 182 y sus letras viejas caerían en y 98-110, x 74-146.
  const k12 = conK(1.2, 50, 50), k1 = conK(1, 50, 50);
  const esc = armarMedida(conBase, k12, 200, 200, { texto: verde });
  let blancas = 0;
  for (let y = 99; y < 110; y++) for (let x = 76; x < 145; x++) if (esc[(y * 200 + x) * 4 + 1] === 255 && esc[(y * 200 + x) * 4] === 255) blancas++;
  eq("con texto escrito: va la base (sin las letras viejas) y encima las nuevas", [blancas, [...esc.subarray((100 * 200 + 100) * 4, (100 * 200 + 100) * 4 + 3)]], [0, [0, 255, 0]]);
  const igualA = (a, b) => a.every((v, i) => v === b[i]);
  let llamadas = 0;
  ok("texto que devuelve null (no pasó la prueba): sale la pieza entera, como sin texto", igualA(armarMedida(conBase, k12, 200, 200, { texto: () => null }), armarMedida(conBase, k12, 200, 200)));
  armarMedida({ ...conBase, piezas: [{ ...conBase.piezas[0], base: null }] }, k12, 200, 200, { texto: () => (llamadas++, null) });
  eq("pieza sin base (algún texto no se puede redibujar): ni se pregunta por su texto", llamadas, 0);
  const conto = (k) => { let n = 0; const px = armarMedida(conBase, conK(k, 50, 50), 200, 200, { texto: (p, l) => (n++, verde(p, l)) }); return [n, igualA(px, armarMedida(conBase, conK(k, 50, 50), 200, 200))]; };
  eq(`a su tamaño (escala a menos de ${ESCRIBIR_LEJOS_DE_1 * 100} % de 1) van las letras de Photoshop tal cual: ni se pregunta`, [conto(1), conto(1.019), conto(0.981)], [[0, true], [0, true], [0, true]]);
  eq("apenas fuera de ese margen ya se escribe", [conto(1.02)[0], conto(0.98)[0]], [1, 1]);
  // Mezcla del texto escrito: el legal del PSD real, color (58, 41, 50) al 60 % sobre (240, 222, 211).
  const legal = { w: 200, h: 200, fondo: lleno(200, 200, [240, 222, 211, 255]), piezas: [{ ...conBase.piezas[0], rol: "FOOTER", rgba: new Uint8ClampedArray(120 * 120 * 4), base: new Uint8ClampedArray(120 * 120 * 4) }] };
  const tinta60 = punto([58 * 0.6, 41 * 0.6, 50 * 0.6, 153]);
  const enLegal = (g) => [...armarMedida({ ...legal, textoGamma: g }, k12, 200, 200, { texto: tinta60 }).subarray((100 * 200 + 100) * 4, (100 * 200 + 100) * 4 + 3)];
  const g145 = [58, 41, 50].map((t, c) => Math.round(255 * Math.pow(0.6 * Math.pow(t / 255, 1.45) + 0.4 * Math.pow([240, 222, 211][c] / 255, 1.45), 1 / 1.45)));
  eq("texto escrito con la mezcla normal (gamma 1 o sin dato): 60 % de su color + 40 % de lo de abajo", [enLegal(1), enLegal(undefined)], [[131, 113, 114], [131, 113, 114]]);
  eq(`con gamma 1.45, como Photoshop: más claro (${g145}), cerca de lo que trae la copia aplanada del PSD real (146, 131, 128)`, enLegal(1.45), g145);
}

// ── v2 · nitidez C: el texto se vuelve a escribir con su tipografía ─────────
console.log("\n▶ v2 · nitidez C: textos del PSD, su maqueta, las tipografías y la prueba contra Photoshop");
{
  const st = { font: { name: "F-Bold" }, fontSize: 20, fillColor: { r: 255, g: 10, b: 0 } };
  const t1 = textoDe({ text: "Hola\rmundo", transform: [2, 0, 0, 2, 10, 20], style: st, styleRuns: [{ length: 5, style: {} }, { length: 5, style: { font: { name: "F-Regular" }, fontCaps: 2 } }], paragraphStyle: { justification: "center" } });
  eq("textoDe: \\r pasa a \\n, cada corrida hereda el estilo base, centrado, texto de punto", [t1.texto, t1.tramos.map((r) => [r.n, r.fuente, r.tam, r.color, r.mayusculas]), t1.alineacion, t1.caja, t1.motivo], ["Hola\nmundo", [[5, "F-Bold", 20, [255, 10, 0], false], [5, "F-Regular", 20, [255, 10, 0], true]], "center", null, null]);
  const t2 = textoDe({ text: "a\u0003b", shapeType: "box", boxBounds: [0, 0, 100, 40], style: { ...st, autoLeading: false, leading: 30 } });
  eq("textoDe: caja de párrafo, salto forzado (\\u0003) e interlineado fijo", [t2.texto, t2.caja, t2.tramos[0].interlineado], ["a\nb", [0, 0, 100, 40], 30]);
  eq("textoDe: interlineado automático queda null (120 % al maquetar)", textoDe({ text: "a", style: { ...st, autoLeading: true, leading: 30 } }).tramos[0].interlineado, null);
  const casos = [
    [{ style: { ...st, fauxBold: true } }, "negrita o cursiva falsa"],
    [{ style: { ...st, horizontalScale: 0.9 } }, "letra estirada"],
    [{ style: { ...st, fontCaps: 1 } }, "versalitas"],
    [{ style: { ...st, underline: true } }, "subrayado o tachado"],
    [{ style: { ...st, strokeFlag: true } }, "contorno de letra"],
    [{ style: st, warp: { style: "arc" } }, "texto deformado"],
    [{ style: st, orientation: "vertical" }, "texto vertical"],
    [{ style: st, styleRuns: [{ length: 2, style: {} }] }, "tramos que no cubren el texto"],
    [{ style: st, paragraphStyle: { justification: "left" }, paragraphStyleRuns: [{ length: 4, style: { justification: "center" } }] }, "párrafos con distinta alineación"],
    [{ style: st, paragraphStyle: { justification: "justifyAll" } }, "alineación «justifyAll»"],
    [{ style: { fontSize: 20 } }, "tramo sin tipografía o tamaño"],
    [{ style: st, shapeType: "box", boxBounds: [0, 0, NaN, 9] }, "caja de párrafo ilegible"],
  ];
  eq("textoDe: corridas de largo 0 no cuentan (la librería las conserva)", textoDe({ text: "abcd", style: st, styleRuns: [{ length: 0, style: { font: { name: "Otra" } } }, { length: 4, style: {} }] }).tramos.map((r) => [r.n, r.fuente]), [[4, "F-Bold"]]);
  const muchas = textoDe({ text: "a".repeat(65), style: st, styleRuns: Array.from({ length: 65 }, () => ({ length: 1, style: {} })) });
  eq("textoDe: más de 64 cambios de estilo: va como imagen sin maquetarlo (y sin un motivo de más)", [muchas.motivo, muchas.tramos.length], ["demasiados cambios de estilo", 0]);
  eq("textoDe: el nombre de la tipografía llega sin caracteres de control ni de dirección", textoDe({ text: "a", style: { ...st, font: { name: "F-\u202eBold\u0007" } } }).tramos[0].fuente, "F-Bold");
  eq("textoDe: lo que no se puede escribir igual lleva su motivo (y va como imagen)", casos.map(([t, m]) => { const mo = textoDe({ text: "abcd", ...t }).motivo; return mo?.includes(m) ? m : mo; }), casos.map(([, m]) => m));

  // maquetar con un medidor falso: cada letra mide medio tamaño; "sube" sólo es razonable para la "d".
  const medir = (texto, tramo) => ({ ancho: texto.length * tramo.tam * 0.5, sube: texto === "d" ? tramo.tam * 0.7 : 999 });
  const lin = (ls) => ls.map((l) => [+l.base.toFixed(3), l.pedazos.map((p) => [p.texto, +p.x.toFixed(3)])]);
  eq("maquetar, texto de punto: base de la primera en 0, centrado en x = 0, mayúsculas aplicadas, 120 % de interlineado", lin(maquetar(t1, medir)), [[0, [["Hola", -20]]], [24, [["MUNDO", -25]]]]);
  const mezcla = textoDe({ text: "ab\ncd", style: st, styleRuns: [{ length: 3, style: {} }, { length: 1, style: { fontSize: 40 } }, { length: 1, style: {} }] });
  eq("maquetar: el interlineado automático sale de la letra MÁS GRANDE de esa línea", lin(maquetar(mezcla, medir)).map((l) => l[0]), [0, 48]);
  const dos = textoDe({ text: "abcd", style: st, styleRuns: [{ length: 2, style: {} }, { length: 2, style: { fontSize: 40 } }] });
  eq("maquetar: dos tramos en una línea van uno tras otro", lin(maquetar(dos, medir)), [[0, [["ab", 0], ["cd", 20]]]]);
  const caja = (just, ancho) => textoDe({ text: "aa bb cc", shapeType: "box", boxBounds: [10, 5, 10 + ancho, 60], style: st, paragraphStyle: { justification: just } });
  eq("maquetar, caja: parte en palabras al ancho, y la primera base baja lo que sube la «d» (regla Ascent de Adobe)", lin(maquetar(caja("left", 60), medir)), [[19, [["aa bb", 10]]], [43, [["cc", 10]]]]);
  eq("maquetar, caja: una línea que cabe justa no se parte; alineada a la derecha", lin(maquetar(caja("right", 50), medir)), [[19, [["aa bb", 10]]], [43, [["cc", 40]]]]);

  // fuentesDe con tipografías mínimas hechas aquí (tabla de nombres + fvar).
  const sfnt = ({ nombres, ejes = null, instancias = [], firma = 0x00010000, tamInst = null }) => {
    const recs = Object.entries(nombres).map(([id, s]) => ({ id: +id, b: [...s].flatMap((ch) => [ch.charCodeAt(0) >> 8, ch.charCodeAt(0) & 255]) }));
    const ini = 6 + recs.length * 12;
    const name = new Uint8Array(ini + recs.reduce((s, r) => s + r.b.length, 0));
    const nv = new DataView(name.buffer);
    nv.setUint16(2, recs.length); nv.setUint16(4, ini);
    let off = 0;
    recs.forEach((r, i) => { const o = 6 + i * 12; nv.setUint16(o, 3); nv.setUint16(o + 2, 1); nv.setUint16(o + 4, 0x409); nv.setUint16(o + 6, r.id); nv.setUint16(o + 8, r.b.length); nv.setUint16(o + 10, off); name.set(r.b, ini + off); off += r.b.length; });
    const tablas = [["name", name]];
    if (ejes) {
      const tam = tamInst ?? 4 + ejes.length * 4 + 2;
      // + un estilo de más al final: con tamInst 0 todos se escriben en el mismo lugar y no deben salirse.
      const fv = new Uint8Array(16 + ejes.length * 20 + instancias.length * tam + 4 + ejes.length * 4 + 2);
      const fd = new DataView(fv.buffer);
      fd.setUint16(0, 1); fd.setUint16(4, 16); fd.setUint16(6, 2); fd.setUint16(8, ejes.length); fd.setUint16(10, 20); fd.setUint16(12, instancias.length); fd.setUint16(14, tam);
      ejes.forEach((t, i) => [...t].forEach((ch, k) => fd.setUint8(16 + i * 20 + k, ch.charCodeAt(0))));
      instancias.forEach((ins, i) => { const o = 16 + ejes.length * 20 + i * tam; fd.setUint16(o, ins.sub); ins.coords.forEach((c, k) => fd.setInt32(o + 4 + k * 4, Math.round(c * 65536))); fd.setUint16(o + 4 + ejes.length * 4, ins.ps ?? 0xffff); });
      tablas.push(["fvar", fv]);
    }
    let pos = 12 + tablas.length * 16;
    const out = new Uint8Array(pos + tablas.reduce((s, [, b]) => s + b.length, 0));
    const v = new DataView(out.buffer);
    v.setUint32(0, firma); v.setUint16(4, tablas.length);
    tablas.forEach(([tag, b], i) => { const o = 12 + i * 16; [...tag].forEach((ch, k) => v.setUint8(o + k, ch.charCodeAt(0))); v.setUint32(o + 8, pos); v.setUint32(o + 12, b.length); out.set(b, pos); pos += b.length; });
    return out.buffer;
  };
  const fijas = (f) => f.map((x) => [x.ps, x.peso]);
  eq("fuentesDe: una fija (.ttf y .otf) da su nombre PostScript, sin peso", [fijas(fuentesDe(sfnt({ nombres: { 1: "Fam", 6: "Fam-Medium" } }))), fijas(fuentesDe(sfnt({ nombres: { 6: "Fam-Bold" }, firma: 0x4f54544f })))], [[["Fam-Medium", null]], [["Fam-Bold", null]]]);
  const variable = sfnt({
    nombres: { 6: "FamVariable-Regular", 25: "FamVariable", 256: "Thin", 257: "Bold", 258: "Bold Italic", 259: "FamVariable-Black", 260: "Semi Bold" },
    ejes: ["wght", "ital"],
    instancias: [{ sub: 256, ps: 256, coords: [0, 0] }, { sub: 257, ps: 257, coords: [100, 0] }, { sub: 258, ps: 258, coords: [100, 100] }, { sub: 259, ps: 259, coords: [90, 0] }, { sub: 260, coords: [33, 0] }],
  });
  eq("fuentesDe: una variable da cada estilo NO cursivo como «prefijo-Estilo», con su peso (como lo guarda Photoshop)", fijas(fuentesDe(variable)), [["FamVariable-Thin", 0], ["FamVariable-Bold", 100], ["FamVariable-Black", 90], ["FamVariable-SemiBold", 33]]);
  eq("fuentesDe: sin prefijo de familia, el prefijo sale del nombre PostScript", fijas(fuentesDe(sfnt({ nombres: { 6: "X-Regular", 256: "Bold" }, ejes: ["wght"], instancias: [{ sub: 256, ps: 256, coords: [700] }] }))), [["X-Bold", 700]]);
  let lanzo = false;
  try { fuentesDe(new ArrayBuffer(64)); } catch { lanzo = true; }
  ok("fuentesDe: un archivo que no es tipografía lanza", lanzo);
  // Tipografías del cliente (Admin › Marcas → Formatos): se validan por sus bytes y se eligen por nombre.
  eq("leerTipografia: un .otf (OTTO) y un .ttf dicen su tipo por los bytes y traen sus nombres", [leerTipografia(sfnt({ nombres: { 6: "Fam-Bold" }, firma: 0x4f54544f })), leerTipografia(sfnt({ nombres: { 6: "Fam-Medium" } }))], [{ ext: "otf", nombres: ["Fam-Bold"] }, { ext: "ttf", nombres: ["Fam-Medium"] }]);
  eq("leerTipografia: una variable trae un nombre por estilo", leerTipografia(variable)?.nombres, ["FamVariable-Thin", "FamVariable-Bold", "FamVariable-Black", "FamVariable-SemiBold"]);
  eq("leerTipografia: lo que no es tipografía, una sin nombre usable (con espacio) o una de más de 4 MB: null", [leerTipografia(new ArrayBuffer(64)), leerTipografia(sfnt({ nombres: { 6: "Con espacio" } })), leerTipografia(new ArrayBuffer(TIPOGRAFIA_MAX_BYTES + 1))], [null, null, null]);
  eq("nombresPedidos: sólo nombres válidos, sin repetir, con tope; lo que no es lista, nada", [nombresPedidos(["A-Bold", "A-Bold", "", "con espacio", 7, "x".repeat(128)]), nombresPedidos("A-Bold"), nombresPedidos(Array.from({ length: 100 }, (_, i) => `F-${i}`)).length], [["A-Bold"], [], NOMBRES_PEDIDOS_MAX]);
  eq("archivoVisible: sin carpetas ni caracteres de control, con tope y nunca vacío", [archivoVisible("C:\\fuentes\\DiDi.otf"), archivoVisible("../../x\u0000y.ttf"), archivoVisible("a".repeat(200)).length, archivoVisible("/")], ["DiDi.otf", "xy.ttf", ARCHIVO_NOMBRE_MAX, "tipografía"]);
  const guardadas = [{ id: "suelta", nombres: ["D-Medium"] }, { id: "var", nombres: ["DV-Thin", "DV-Bold"] }, { id: "otra", nombres: ["Otra-Bold"] }, { id: "repetida", nombres: ["D-Medium"] }];
  const el1 = elegirTipografias(guardadas, ["D-Medium", "DV-Bold", "Falta-X"]);
  const el2 = elegirTipografias(guardadas, ["D-Medium", "DV-Thin", "DV-Bold"]);
  eq("elegirTipografias: sólo las que cubren lo pedido, cada nombre una vez (la repetida no va), primero la que cubre más; y lo que falta", [el1.elegidas.map((x) => x.id), el1.faltan, el2.elegidas.map((x) => x.id), el2.faltan], [["suelta", "var"], ["Falta-X"], ["var", "suelta"], []]);
  eq(`elegirTipografias: a lo más ${ARCHIVOS_ENTREGADOS_MAX} archivos por PSD`, elegirTipografias(Array.from({ length: 40 }, (_, i) => ({ nombres: [`F-${i}`] })), Array.from({ length: 40 }, (_, i) => `F-${i}`)).elegidas.length, ARCHIVOS_ENTREGADOS_MAX);
  eq("rutaTipografia: <cliente>/<huella>.<tipo> (la que exige la base)", rutaTipografia("c1", "ab", "otf"), "c1/ab.otf");
  // Variables de Google: el estilo con nombre propio completo va tal cual (no "MontserratItalic-Montserrat-…"), y
  // cada estilo responde también al nombre de su versión estática (lo que guarda el PSD si el diseñador usó ésa).
  eq("fuentesDe: un estilo con nombre propio completo no lleva otro prefijo", fijas(fuentesDe(sfnt({ nombres: { 1: "Montserrat", 6: "Montserrat-ThinItalic", 25: "MontserratItalic", 256: "Bold Italic", 257: "Montserrat-BoldItalic" }, ejes: ["wght"], instancias: [{ sub: 256, ps: 257, coords: [700] }] }))), [["Montserrat-BoldItalic", 700]]);
  eq("fuentesDe: un nombre de ESTILO con guion (sin nombre PostScript propio) sí lleva el prefijo", fijas(fuentesDe(sfnt({ nombres: { 6: "Fam-Regular", 25: "Fam", 256: "Semi-Bold" }, ejes: ["wght"], instancias: [{ sub: 256, coords: [600] }] }))), [["Fam-Semi-Bold", 600]]);
  eq("fuentesDe: cada estilo de una variable responde también al nombre de su estática", fijas(fuentesDe(sfnt({ nombres: { 6: "OpenSansRoman-Regular", 16: "Open Sans", 25: "OpenSansRoman", 256: "Bold" }, ejes: ["wght"], instancias: [{ sub: 256, coords: [700] }] }))), [["OpenSansRoman-Bold", 700], ["OpenSans-Bold", 700]]);
  // Exclusivas: sólo se entregan con su cliente elegido; las del cliente elegido ganan un empate.
  const bib = [
    { id: "didi-pro", client_id: "didi", exclusiva: true, cliente: "DiDi", nombres: ["DiDiSans-Pro-Bold"] },
    { id: "otro-x", client_id: "otro", exclusiva: false, cliente: "Otro", nombres: ["Comun-Bold"] },
    { id: "google-m", client_id: null, exclusiva: false, cliente: "Google Fonts", nombres: ["Montserrat-Bold"] },
    { id: "didi-x", client_id: "didi", exclusiva: false, cliente: "DiDi", nombres: ["Comun-Bold"] },
  ];
  const ids = (xs) => xs.map((x) => x.id);
  const todo = ["DiDiSans-Pro-Bold", "Comun-Bold", "Montserrat-Bold"];
  const ep = (c) => { const r = elegirParaCliente(bib, todo, c); return [ids(r.elegidas), r.faltan]; };
  eq("elegirParaCliente: sin cliente, ninguna exclusiva; con DiDi, la suya; con otro, sin la de DiDi", [ep(null), ep("didi"), ep("otro")], [[["otro-x", "google-m"], ["DiDiSans-Pro-Bold"]], [["didi-pro", "didi-x", "google-m"], []], [["otro-x", "google-m"], ["DiDiSans-Pro-Bold"]]]);
  const grande = [{ id: "google-var", client_id: null, exclusiva: false, cliente: "Google Fonts", nombres: ["Comun-Bold", "Comun-Thin", "Comun-Black"] }, ...bib];
  eq("elegirParaCliente: la del cliente elegido gana aunque otro archivo cubra más nombres", ids(elegirParaCliente(grande, ["Comun-Bold", "Comun-Thin"], "didi").elegidas), ["didi-x", "google-var"]);
  eq(`elegirParaCliente: entre las dos vueltas, a lo más ${ARCHIVOS_ENTREGADOS_MAX} archivos`, elegirParaCliente(Array.from({ length: 40 }, (_, i) => ({ client_id: i < 20 ? "c" : null, exclusiva: false, nombres: [`F-${i}`] })), Array.from({ length: 40 }, (_, i) => `F-${i}`), "c").elegidas.length, ARCHIVOS_ENTREGADOS_MAX);
  eq("exclusivasDeOtros: lo que falta y es exclusivo de otro cliente, por cliente; con su cliente elegido, nada", [exclusivasDeOtros(bib, ["DiDiSans-Pro-Bold", "Nadie-Bold"], null), exclusivasDeOtros(bib, ["DiDiSans-Pro-Bold"], "didi")], [[{ cliente: "DiDi", nombres: ["DiDiSans-Pro-Bold"] }], []]);
  eq("rutaTipografia: las de Google van en google/<huella>.<tipo>", rutaTipografia("google", "ab", "ttf"), "google/ab.ttf");
  ok("leerTipografia: hasta 10 MB sólo si se pide (las de Google)", leerTipografia(new ArrayBuffer(TIPOGRAFIA_MAX_BYTES + 1), TIPOGRAFIA_GOOGLE_MAX_BYTES) === null && TIPOGRAFIA_GOOGLE_MAX_BYTES === 10_000_000);
  // Google Fonts: la carpeta sale del nombre; el METADATA dice qué archivos hay; sólo se bajan los que sirven.
  eq("carpetaGoogle: lo de antes del guion, minúsculas y sin símbolos; muy corto, null", ["OpenSans-Bold", "Montserrat", "DiDiSans-Pro-Medium", "X-Bold", "-Bold", "Noto_Sans-Bold"].map(carpetaGoogle), ["opensans", "montserrat", "didisans", null, null, "notosans"]);
  const md = `name: "Fake"\nfonts {\n  name: "Fake"\n  filename: "Fake-Regular.ttf"\n  post_script_name: "Fake-Regular"\n  copyright: "Copyright {2020} } raro"\n}\nfonts {\n  filename: "Fake-Bold.ttf"\n  post_script_name: "Fake-Bold"\n}\nfonts {\n  filename: "../malo.ttf"\n  post_script_name: "Malo"\n}\nfonts {\n  filename: "Fake-Bold.ttf"\n  post_script_name: "Fake-Bold"\n}\n`;
  eq("archivosDeMetadata: cada archivo con su nombre, sin rutas raras ni repetidos (aunque el copyright traiga llaves)", archivosDeMetadata(md), [{ archivo: "Fake-Regular.ttf", ps: "Fake-Regular" }, { archivo: "Fake-Bold.ttf", ps: "Fake-Bold" }]);
  eq("archivosQueSirven: las variables si las hay; si no, sólo las estáticas pedidas; con tope", [
    archivosQueSirven([{ archivo: "V[wght].ttf", ps: "V-Thin" }, { archivo: "V-Italic[wght].ttf", ps: "V-ThinItalic" }], ["V-Bold"]),
    archivosQueSirven(archivosDeMetadata(md), ["Fake-Bold"]),
    archivosQueSirven(Array.from({ length: 20 }, (_, i) => ({ archivo: `S-${i}.ttf`, ps: `S-${i}` })), Array.from({ length: 20 }, (_, i) => `S-${i}`)).length,
  ], [["V[wght].ttf", "V-Italic[wght].ttf"], ["Fake-Bold.ttf"], ARCHIVOS_POR_FAMILIA_MAX]);
  {
    const fakeBold = sfnt({ nombres: { 6: "Fake-Bold" } });
    const pedidos = [];
    // Un GitHub falso: "fake" está en apache (no en ofl); "nadiea" no está; "caido" responde 500.
    const pedir = async (url) => {
      pedidos.push(url.replace("https://raw.githubusercontent.com/google/fonts/main/", ""));
      if (url.endsWith("/apache/fake/METADATA.pb")) return new Response(md);
      if (url.endsWith("/apache/fake/Fake-Bold.ttf")) return new Response(fakeBold);
      if (url.includes("/caido/")) return new Response("", { status: 500 });
      return new Response("", { status: 404 });
    };
    const sinPlazo = new AbortController().signal;
    const r = await buscarEnGoogle(["Fake-Bold", "Nadiea-Bold", "Caido-Bold"], sinPlazo, pedir);
    eq("buscarEnGoogle: encuentra la familia en otra licencia y baja sólo el archivo pedido, leído de sus bytes", r.map((x) => [x.archivo, x.leida.nombres]), [["Fake-Bold.ttf", ["Fake-Bold"]]]);
    pedidos.length = 0;
    await buscarEnGoogle(["Nadiea-Regular", "Caido-Regular"], sinPlazo, pedir);
    eq("buscarEnGoogle: lo que Google no tiene no se vuelve a buscar; lo que falló por la red, sí", pedidos, ["ofl/caido/METADATA.pb"]);
    const mentira = async (url) => (url.endsWith("METADATA.pb") ? new Response(md.replace(/fake/gi, "Mentira").replace("apache", "ofl")) : new Response(sfnt({ nombres: { 6: "Otra-Cosa" } })));
    eq("buscarEnGoogle: un archivo que no trae el nombre pedido no vuelve (manda lo que dicen sus bytes, no el METADATA)", (await buscarEnGoogle(["Mentira-Bold"], sinPlazo, mentira)).length, 0);
    pedidos.length = 0;
    await buscarEnGoogle(["Fake-Zzz"], sinPlazo, pedir);
    await buscarEnGoogle(["Fake-Zzz"], sinPlazo, pedir);
    eq("buscarEnGoogle: la familia está pero el estilo no: se baja una vez y luego se recuerda", pedidos, ["ofl/fake/METADATA.pb", "apache/fake/METADATA.pb"]);
    // Un GitHub que manda archivos enormes sin decir su tamaño: se corta al pasar el tope, no se lee entero.
    let servidos = 0;
    const enorme = async (url) => {
      if (url.endsWith("METADATA.pb")) return new Response(`fonts {\n filename: "Gorda[wght].ttf"\n post_script_name: "Gorda-Thin"\n}\n`);
      return new Response(new ReadableStream({ pull(c) { servidos += 1_000_000; c.enqueue(new Uint8Array(1_000_000)); if (servidos > 3 * GOOGLE_BYTES_POR_PEDIDO) c.close(); } }));
    };
    eq("buscarEnGoogle: un archivo sin tamaño declarado se corta al pasar 10 MB (no se baja entero)", [(await buscarEnGoogle(["Gorda-Bold"], sinPlazo, enorme)).length, servidos <= 12_000_000], [0, true]);
    const vencido = AbortSignal.abort();
    pedidos.length = 0;
    eq("buscarEnGoogle: con el plazo vencido no se pide nada", [(await buscarEnGoogle(["Otrafam-Bold"], vencido, pedir)).length, pedidos.length], [0, 0]);
  }
  // Archivos hechos a propósito: no congelan ni inventan estilos.
  const bomba = (() => {
    const cuenta = 65535, largo = 65534, ini = 6 + cuenta * 12;
    const name = new Uint8Array(ini + largo);
    const nv = new DataView(name.buffer);
    nv.setUint16(2, cuenta);
    for (let i = 0; i < cuenta; i++) { const o = 6 + i * 12; nv.setUint16(o, 3); nv.setUint16(o + 6, i); nv.setUint16(o + 8, largo); }
    const out = new Uint8Array(12 + 16 + name.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, 0x00010000); v.setUint16(4, 1);
    [..."name"].forEach((ch, k) => v.setUint8(12 + k, ch.charCodeAt(0)));
    v.setUint32(12 + 8, 28); v.setUint32(12 + 12, name.length);
    out.set(name, 28);
    return out.buffer;
  })();
  const t0b = performance.now();
  let tiroBomba = false;
  try { fuentesDe(bomba); } catch { tiroBomba = true; }
  const msBomba = performance.now() - t0b;
  ok(`fuentesDe: tabla de nombres con 65 535 nombres de 64 KB: no la decodifica entera (${msBomba.toFixed(0)} ms) y lanza (sin nombre PostScript usable)`, tiroBomba && msBomba < 500);
  eq("fuentesDe: estilos de tamaño 0 (todos leen el mismo) no se creen: queda el nombre del archivo", fijas(fuentesDe(sfnt({ nombres: { 6: "Fam-Regular", 25: "Fam", 256: "Bold" }, ejes: ["wght"], instancias: [{ sub: 256, coords: [700] }, { sub: 256, coords: [700] }], tamInst: 0 }))), [["Fam-Regular", null]]);
  eq("fuentesDe: dos estilos con el mismo nombre cuentan una vez", fijas(fuentesDe(sfnt({ nombres: { 6: "Fam-Regular", 25: "Fam", 256: "Bold" }, ejes: ["wght"], instancias: [{ sub: 256, coords: [700] }, { sub: 256, coords: [700] }] }))), [["Fam-Bold", 700]]);
  const didi = join(homedir(), "Desktop/formatos-prueba/DiDi Sans Pro");
  const vf = join(didi, "DiDiSansVariableVF/DiDiSansVariableVF.ttf"), med = join(didi, "DiDi Sans Pro/otf/DiDiSans-Pro-Medium.otf");
  if (existsSync(vf) && existsSync(med)) {
    const ab = (f) => { const b = readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    eq("fuentesDe con las DiDi reales: la variable da sus 4 estilos con su peso; la Medium, su nombre", [fijas(fuentesDe(ab(vf))), fijas(fuentesDe(ab(med)))], [[["DiDiSansVariable-Thin", 0], ["DiDiSansVariable-Regular", 33], ["DiDiSansVariable-Medium", 66], ["DiDiSansVariable-Bold", 100]], [["DiDiSans-Pro-Medium", null]]]);
  } else console.log("  · (las DiDi no están en el Escritorio: no se probó con las reales)");

  // compararAlfa: cuánto correr el nuestro y qué tanto no coincide.
  const w = 40, h = 10;
  const bloque = (x0, y0, extra = []) => { const a = new Uint8Array(w * h); for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 3; x++) a[y * w + x] = 255; for (const [x, y, v] of extra) a[y * w + x] = v; return a; };
  const psA = bloque(10, 3);
  eq("compararAlfa: idéntico = sin corrimiento y 0 % distinto", compararAlfa(psA, psA, w, h), { dx: 0, dy: 0, dif: 0, anchoRazon: 1 });
  const c2 = compararAlfa(bloque(7, 5), psA, w, h);
  eq("compararAlfa: el nuestro 3 px a la izquierda y 2 abajo se corre (3, -2) y coincide", [c2.dx, c2.dy, c2.dif], [3, -2, 0]);
  const c3 = compararAlfa(bloque(10, 3, [[34, 4, 40], [35, 4, 40]]), psA, w, h);
  ok(`compararAlfa: tinta tenue lejos corre el centro casi 1 px; se prueba alrededor y queda el corrimiento exacto (dx ${c3.dx}, ${(c3.dif * 100).toFixed(1)} %)`, c3.dx === 0 && c3.dy === 0 && c3.dif < 0.05);
  const c4 = compararAlfa(bloque(10, 3, [[10, 9, 219], [12, 9, 219]]), psA, w, h);
  ok(`compararAlfa: lo mismo hacia abajo (dy ${c4.dy}, ${(c4.dif * 100).toFixed(1)} %)`, c4.dx === 0 && c4.dy === 0 && c4.dif < 0.2);
  eq("compararAlfa: si no hay tinta nuestra, 100 % distinto", compararAlfa(new Uint8Array(w * h), psA, w, h).dif, 1);

  // textosDe (dentro de despiezar), con un PSD que trae una capa de texto de verdad (ag-psd la escribe), dentro de
  // una mesa de trabajo corrida OX px (todo lo de la pieza va en px de la MESA). Letras con orilla suave de 2 px.
  const W = 200, H = 100, OX = 300;
  const img = (iw, ih, fn) => { const data = new Uint8ClampedArray(iw * ih * 4); for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const [r, g, b, a = 255] = fn(x, y); data.set([r, g, b, a], (y * iw + x) * 4); } return { data, width: iw, height: ih }; };
  const capa = (name, [l, t, cw, ch], fn, extra = {}) => ({ name, left: l + OX, top: t, right: l + OX + cw, bottom: t + ch, blendMode: "normal", opacity: 1, imageData: img(cw, ch, (x, y) => fn(x + l, y + t)), ...extra });
  const tinta = (x, y) => (x >= 60 && x < 120 && y >= 40 && y < 60 && y % 8 < 6 ? [255, 255, 255, 100, 40, 0][x % 6] : 0);
  const NARANJA = [250, 120, 20];
  const enBoton = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const texto = (extra = {}) => capa("Pídela", [60, 40, 60, 20], (x, y) => [255, 255, 255, tinta(x, y)], { text: { text: "Pídela\rya", transform: [1, 0, 0, 1, 60 + OX, 55], style: { font: { name: "DiDiSans-Pro-Bold" }, fontSize: 16, fillColor: { r: 255, g: 255, b: 255 } }, paragraphStyle: { justification: "center" } }, ...extra });
  // `g`: la gamma con que "Photoshop" mezcló el texto blanco al guardar la copia aplanada (1 = la normal).
  const psdTexto = (cta, op = 1, g = 1) => writePsdBuffer({
    width: OX + W, height: H,
    children: [{ name: "Mesa", opened: true, artboard: { rect: { top: 0, left: OX, bottom: H, right: OX + W } }, children: [{ name: "Background", opened: true, children: [capa("base", [0, 0, W, H], () => [20, 40, 60])] }, { name: "CTA", opened: true, children: cta }] }],
    imageData: img(OX + W, H, (X, y) => { const x = X - OX; if (x < 0) return [0, 0, 0]; let c = [20, 40, 60]; if (enBoton(x, y)) c = NARANJA; const a = (tinta(x, y) / 255) * op; return c.map((v) => 255 * Math.pow((1 - a) * Math.pow(v / 255, g) + a, 1 / g)); }),
    imageResources: { versionInfo: { hasRealMergedData: true, writerName: "t", readerName: "t", fileVersion: 1 } },
  });
  const cta = (buf) => despiezar(leerPsd(buf), 0).piezas.find((p) => p.rol === "CTA");
  const p1 = cta(psdTexto([capa("boton", [40, 30, 120, 40], () => NARANJA), texto()]));
  const t0 = p1.textos[0];
  eq("esVersionPsd: un PSD (versión 1) sí; un PSB (versión 2) o una cabecera corta, no", [esVersionPsd(Uint8Array.of(0x38, 0x42, 0x50, 0x53, 0, 1)), esVersionPsd(Uint8Array.of(0x38, 0x42, 0x50, 0x53, 0, 2)), esVersionPsd(Uint8Array.of(0x38, 0x42))], [true, false, false]);
  eq("textosDe: el texto de la pieza, su lugar en px de la mesa, su caja de tinta en Photoshop y su alfa ahí", [p1.textos.length, t0?.capa, t0?.texto.texto, t0?.texto.transform[4], t0?.caja, [0, 3, 4, 5].map((i) => t0?.alfa[i]), t0?.motivo, t0?.opacidad], [1, "Pídela", "Pídela\nya", 60, { x: 60, y: 40, w: 59, h: 20 }, [255, 100, 40, 0], null, 1]);
  const bpx = (p, x, y) => [...p.base.subarray(((y - p.caja.y) * p.caja.w + (x - p.caja.x)) * 4, ((y - p.caja.y) * p.caja.w + (x - p.caja.x)) * 4 + 4)];
  let fueraIgual = true, letrasNaranja = true;
  for (let y = p1.caja.y; y < p1.caja.y + p1.caja.h; y++)
    for (let x = p1.caja.x; x < p1.caja.x + p1.caja.w; x++) {
      const b = bpx(p1, x, y), j = ((y - p1.caja.y) * p1.caja.w + (x - p1.caja.x)) * 4;
      if (tinta(x, y) && !b.slice(0, 3).every((v, k) => Math.abs(v - NARANJA[k]) <= 2)) letrasNaranja = false;
      if (x >= 58 && x < 122 && y >= 38 && y < 62) continue; // las letras y su margen
      if (!b.every((v, k) => v === p1.rgba[j + k])) fueraIgual = false;
    }
  ok("textosDe: la base es la pieza sin letras: donde iban (también su orilla suave), el naranja del botón; lejos, idéntica a la pieza", !!p1.base && letrasNaranja && fueraIgual && bpx(p1, 61, 41)[3] === 255);
  const p2 = cta(psdTexto([capa("boton", [40, 30, 120, 40], () => NARANJA), texto({ opacity: 0.5 })], 0.5));
  eq("textosDe: con la capa al 50 %, el alfa de la prueba sale SIN la opacidad y la opacidad viaja aparte", [p2.textos[0].alfa[0], +p2.textos[0].opacidad.toFixed(2)], [255, 0.5]);
  const p3 = cta(psdTexto([capa("boton", [40, 30, 120, 40], () => NARANJA), texto({ blendMode: "screen" })]));
  eq("textosDe: texto en «trama»: lleva motivo y la pieza va entera como imagen (sin base)", [p3.textos[0].motivo, p3.base], ["fusión screen", null]);
  const p4 = cta(psdTexto([capa("boton", [40, 30, 120, 40], () => NARANJA), texto(), capa("brillo", [100, 35, 20, 10], () => [255, 255, 255, 30])]));
  eq("textosDe: una capa que no es texto encima de las letras: motivo y sin base (no se sabría qué hay debajo)", [p4.textos[0].motivo, p4.base], ["«brillo» está encima", null]);
  // La gamma del texto se averigua con las orillas de las letras contra la copia aplanada.
  const gammaDe = (buf) => despiezar(leerPsd(buf), 0).textoGamma;
  const conBoton = (extra) => [capa("boton", [40, 30, 120, 40], () => NARANJA), texto(extra)];
  eq("gamma del texto: copia aplanada mezclada normal → 1; en gamma 1.45 → 1.45; con la capa al 50 %, igual", [gammaDe(psdTexto(conBoton())), gammaDe(psdTexto(conBoton(), 1, 1.45)), gammaDe(psdTexto(conBoton({ opacity: 0.5 }), 0.5, 1.45)), gammaDe(psdTexto(conBoton({ opacity: 0.5 }), 0.5))], [1, 1.45, 1.45, 1]);
  eq("gamma del texto: sin texto que medir, la del PSD real del equipo (1.45)", gammaDe(psdTexto([capa("boton", [40, 30, 120, 40], () => NARANJA)])), 1.45);
}

console.log("\n▶ v2 · copia del HERO pintada en el fondo (gemela.ts) y avisos de píxeles (revisar.ts)");
{
  // Fondo con textura (cada lugar distinto) y el HERO pintado tal cual en su lugar, como la imagen de IA del s33.
  const L = 200, caja = { x: 60, y: 60, w: 50, h: 70 };
  const heroPx = (x, y) => [((x * 13 + y * 3) % 200) + 30, ((x * 5 + y * 11) % 200) + 20, 90];
  const rgba = new Uint8ClampedArray(caja.w * caja.h * 4);
  for (let y = 0; y < caja.h; y++) for (let x = 0; x < caja.w; x++) rgba.set([...heroPx(x, y), 255], (y * caja.w + x) * 4);
  const fondo = new Uint8ClampedArray(L * L * 4);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) fondo.set([(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256, 255], (y * L + x) * 4);
  for (let y = 0; y < caja.h; y++) for (let x = 0; x < caja.w; x++) fondo.set([...heroPx(x, y), 255], ((caja.y + y) * L + caja.x + x) * 4);
  const hero = { nombre: "CARD", rol: "HERO", caja, solido: caja, letraMinPx: null, rgba };
  const ma = { nombre: "M", w: L, h: L, fondo, piezas: [hero] };
  const g = buscarGemela(ma);
  ok("gemela: el fondo trae el HERO pintado debajo → se encuentra (pieza 0, parecido 100 %) y lo que se borra cubre la pieza", !!g && g.pieza === 0 && g.parecido === 1 && g.caja.x <= caja.x && g.caja.y <= caja.y && g.caja.x + g.caja.w >= caja.x + caja.w && g.caja.y + g.caja.h >= caja.y + caja.h, JSON.stringify(g));
  const antes = fondo.slice();
  const limpio = quitarGemela(ma, g);
  let fuera = true;
  for (let y = 0; y < L; y++)
    for (let x = 0; x < L; x++) {
      const dentro = x >= g.caja.x && x < g.caja.x + g.caja.w && y >= g.caja.y && y < g.caja.y + g.caja.h;
      if (!dentro && [0, 1, 2, 3].some((c) => limpio[(y * L + x) * 4 + c] !== fondo[(y * L + x) * 4 + c])) fuera = false;
    }
  ok("gemela: quitarla da un fondo NUEVO (el de entrada no cambia) y fuera de su caja no toca ni un píxel", limpio !== fondo && fondo.every((v, i) => v === antes[i]) && fuera);
  eq("gemela: en el fondo ya rellenado no queda copia que encontrar", buscarGemela({ ...ma, fondo: limpio }), null);
  const blanco = new Uint8ClampedArray(L * L * 4).fill(250), heroBlanco = new Uint8ClampedArray(caja.w * caja.h * 4).fill(250);
  eq("gemela: un HERO blanco sobre un fondo blanco se parece en todas partes: NO es copia", buscarGemela({ ...ma, fondo: blanco, piezas: [{ ...hero, rgba: heroBlanco }] }), null);
  eq("gemela: sólo se busca bajo el HERO (la misma pieza con otro papel no cuenta)", buscarGemela({ ...ma, piezas: [{ ...hero, rol: "TITULO" }] }), null);

  // ¿Se ve la copia? Con el acomodo del maestro, la pieza la tapa; corrida, no.
  const conCopia = (quitada) => ({ ...ma, fondo: quitada ? limpio : fondo, copia: { pieza: 0, caja: g.caja, quitada } });
  const enSuLugar = acomodar(conCopia(false), L, L);
  const corrida = { ...enSuLugar, puestas: enSuLugar.puestas.map((q) => ({ ...q, x: q.x + 60 })) };
  eq("copia: a la medida del maestro la pieza la tapa (no se ve); corrida 60 px, sí", [seVeLaCopia(conCopia(false), enSuLugar, L, L), seVeLaCopia(conCopia(false), corrida, L, L)], [false, true]);
  eq("copia: el aviso dice lo que pasa antes y después de quitarla", [avisosDePixeles(conCopia(false), corrida, L, L).map((a) => a.tipo), avisosDePixeles(conCopia(true), corrida, L, L).map((a) => a.tipo), avisosDePixeles(conCopia(false), enSuLugar, L, L).length], [["copia"], ["retoque"], 0]);
  const uno = conCopia(false);
  ok(
    "revisarMedida: la tarjeta (lado «derecha») y el resumen (sin lado) reciben el MISMO resultado; otra lista con el mismo maestro también; otro maestro, no",
    revisarMedida([uno], 1200, 627) === revisarMedida([uno], 1200, 627, { heroLado: "derecha" }) && revisarMedida([uno], 1200, 627) !== revisarMedida([conCopia(false)], 1200, 627),
  );
  eq("avisos: la pieza se nombra por su carpeta, y con su papel si la carpeta no es de la guía", [etiquetaPieza({ nombre: "TITULO", rol: "TITULO" }), etiquetaPieza({ nombre: "Copy", rol: "TITULO" }), etiquetaPieza({ nombre: "Capa suelta", rol: null })], ["«TITULO»", "«Copy» (TITULO)", "«Capa suelta»"]);

  // Piezas grandes: corrida entera cae fuera, se mide corrida a la mitad; sin ningún lado medible, no se marca.
  const grande = (fondoDe, color) => {
    const cg = { x: 30, y: 30, w: 140, h: 140 }, rg = new Uint8ClampedArray(cg.w * cg.h * 4), fg = new Uint8ClampedArray(L * L * 4);
    for (let y = 0; y < cg.h; y++) for (let x = 0; x < cg.w; x++) rg.set([...color(x, y), 255], (y * cg.w + x) * 4);
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) fg.set([...fondoDe(x, y), 255], (y * L + x) * 4);
    for (let y = 0; y < cg.h; y++) for (let x = 0; x < cg.w; x++) fg.set([...color(x, y), 255], ((cg.y + y) * L + cg.x + x) * 4);
    return { ...ma, fondo: fg, piezas: [{ ...hero, caja: cg, solido: cg, rgba: rg }] };
  };
  const textura = (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256];
  eq("gemela: HERO grande (49 % del maestro): blanco sobre blanco NO es copia aunque corrida entera caiga fuera; con textura, sí", [buscarGemela(grande(() => [250, 250, 250], () => [250, 250, 250])), buscarGemela(grande(textura, heroPx))?.pieza], [null, 0]);
  const enorme = { ...grande(textura, heroPx) };
  enorme.piezas = [{ ...enorme.piezas[0], caja: { x: 0, y: 0, w: L, h: 150 }, solido: { x: 0, y: 0, w: L, h: 150 }, rgba: enorme.fondo.slice(0, L * 150 * 4) }];
  eq("gemela: una pieza que tapa más de la mitad del maestro no se ofrece (no queda alrededor de dónde rellenar)", buscarGemela(enorme), null);

  // Copia pegada al borde: el espejo usa el lado que sí existe y nada sale negro.
  const borde = { ...hero, caja: { x: 0, y: 60, w: 50, h: 70 }, solido: { x: 0, y: 60, w: 50, h: 70 } };
  const fb = fondo.slice();
  for (let y = 0; y < 70; y++) for (let x = 0; x < 50; x++) fb.set([...heroPx(x, y), 255], ((60 + y) * L + x) * 4);
  const mb = { ...ma, fondo: fb, piezas: [borde] }, gb = buscarGemela(mb);
  const lb = gb && quitarGemela(mb, gb);
  let negros = 0;
  if (lb) for (let y = 60; y < 130; y++) for (let x = 0; x < 50; x++) if (lb[(y * L + x) * 4] + lb[(y * L + x) * 4 + 1] + lb[(y * L + x) * 4 + 2] < 10) negros++;
  ok("gemela: pegada al borde del maestro se encuentra y se rellena sin dejar píxeles negros", !!gb && gb.caja.x === 0 && !!lb && negros === 0, `${JSON.stringify(gb)} negros=${negros}`);

  // El reflejo: alrededor de una copia naranja el fondo blanco-azulado trae un halo naranja; al quitar la copia se le
  // quita ese tinte (rojo − azul baja) y el brillo se queda.
  const NARANJA_T = (x, y) => [220 + ((x + y) % 20), 90 + ((x * 3) % 30), 30 + ((y * 7) % 20)];
  const fr = new Uint8ClampedArray(L * L * 4), cr = { x: 75, y: 70, w: 50, h: 60 };
  for (let y = 0; y < L; y++)
    for (let x = 0; x < L; x++) {
      const dx = Math.max(cr.x - x, 0, x - (cr.x + cr.w - 1)), dy = Math.max(cr.y - y, 0, y - (cr.y + cr.h - 1)), dist = Math.hypot(dx, dy);
      const halo = dist > 0 && dist < 14 ? 1 - dist / 14 : 0;
      fr.set([230 + 20 * halo, 235 - 60 * halo, 250 - 110 * halo, 255].map(Math.round), (y * L + x) * 4);
    }
  const rr = new Uint8ClampedArray(cr.w * cr.h * 4);
  for (let y = 0; y < cr.h; y++) for (let x = 0; x < cr.w; x++) { rr.set([...NARANJA_T(x, y), 255], (y * cr.w + x) * 4); fr.set([...NARANJA_T(x, y), 255], ((cr.y + y) * L + cr.x + x) * 4); }
  const mr = { ...ma, fondo: fr, piezas: [{ ...hero, caja: cr, solido: cr, rgba: rr }] }, gr = buscarGemela(mr), lr = gr && quitarGemela(mr, gr);
  const anillo = (buf) => {
    let rb = 0, lum = 0, n = 0;
    for (let y = cr.y - 12; y < cr.y + cr.h + 12; y++)
      for (let x = cr.x - 12; x < cr.x + cr.w + 12; x++) {
        if (x >= cr.x - 6 && x < cr.x + cr.w + 6 && y >= cr.y - 6 && y < cr.y + cr.h + 6) continue; // sólo el halo, lejos del hueco
        const j = (y * L + x) * 4;
        rb += buf[j] - buf[j + 2]; lum += buf[j] + buf[j + 1] + buf[j + 2]; n++;
      }
    return [rb / n, lum / n];
  };
  const [rbAntes, lumAntes] = anillo(fr), [rbDespues, lumDespues] = lr ? anillo(lr) : [NaN, NaN];
  ok("gemela: el halo naranja alrededor de la copia pierde su tinte (rojo − azul baja a menos de la mitad) y el brillo se queda (±3)", !!gr && rbDespues < rbAntes / 2 && Math.abs(lumDespues - lumAntes) <= 3, `rb ${rbAntes.toFixed(1)} → ${rbDespues.toFixed(1)}, brillo ${lumAntes.toFixed(1)} → ${lumDespues.toFixed(1)}`);

  // Respaldo con IA: el recorte que se manda y lo que se pega de vuelta.
  const rc = recorteParaIA(ma, g);
  const [rw, rh] = (rc?.aspect ?? "0:1").split(":").map(Number);
  ok(
    "IA: el recorte contiene la caja de la copia, no sale del maestro y tiene una proporción que la IA acepta (±3 %)",
    !!rc && rc.caja.x <= g.caja.x && rc.caja.y <= g.caja.y && rc.caja.x + rc.caja.w >= g.caja.x + g.caja.w && rc.caja.y + rc.caja.h >= g.caja.y + g.caja.h && rc.caja.x >= 0 && rc.caja.y >= 0 && rc.caja.x + rc.caja.w <= L && rc.caja.y + rc.caja.h <= L && Math.abs(rc.caja.w / rc.caja.h / (rw / rh) - 1) <= 0.03,
    JSON.stringify(rc),
  );
  eq(
    "IA: si ninguna proporción de la IA cabe en el maestro con la copia entera, no se manda nada (100×30 en un maestro de 100×31)",
    recorteParaIA({ w: 100, h: 31 }, { pieza: 0, parecido: 1, caja: { x: 0, y: 0, w: 100, h: 30 } }),
    null,
  );
  // Lo que "devuelve la IA": todo verde. Dentro del hueco va verde; lejos de la copia, el fondo original intacto.
  const verde = new Uint8ClampedArray(rc.caja.w * rc.caja.h * 4);
  for (let i = 0; i < rc.caja.w * rc.caja.h; i++) verde.set([0, 200, 0, 255], i * 4);
  const pr = pegarRellenoIA(ma, g, rc.caja, verde);
  const px = (buf, x, y) => [...buf.slice((y * L + x) * 4, (y * L + x) * 4 + 3)];
  let fueraIgual = true;
  for (let y = 0; y < L; y++)
    for (let x = 0; x < L; x++) {
      const enCaja = x >= g.caja.x && x < g.caja.x + g.caja.w && y >= g.caja.y && y < g.caja.y + g.caja.h;
      if (!enCaja && px(pr.fondo, x, y).some((v, c) => v !== fondo[(y * L + x) * 4 + c])) fueraIgual = false;
    }
  ok("IA: en el centro del hueco va lo de la IA; fuera de la caja de la copia el fondo queda idéntico (píxel por píxel)", JSON.stringify(px(pr.fondo, caja.x + 25, caja.y + 35)) === "[0,200,0]" && fueraIgual);
  let orillaIgual = true;
  for (let y = g.caja.y; y < g.caja.y + g.caja.h; y++)
    for (let x = g.caja.x; x < g.caja.x + g.caja.w; x++) {
      const enOrilla = x === g.caja.x || y === g.caja.y || x === g.caja.x + g.caja.w - 1 || y === g.caja.y + g.caja.h - 1;
      if (enOrilla && px(pr.fondo, x, y).some((v, c) => v !== fondo[(y * L + x) * 4 + c])) orillaIgual = false;
    }
  ok("IA: la orilla de la caja de la copia queda idéntica al original aunque la IA mande todo verde (la unión no se nota)", orillaIgual);
  eq("IA: si lo que vuelve es más chico que el recorte, no se pega nada (null)", pegarRellenoIA(ma, g, rc.caja, new Uint8ClampedArray(4)), null);
  eq(
    "IA: con un recorte sin aire alrededor de la copia no hay con qué medir la deriva (null, no 0)",
    pegarRellenoIA(ma, g, g.caja, new Uint8ClampedArray(g.caja.w * g.caja.h * 4))?.deriva,
    null,
  );
  ok("IA: la deriva mide el aire del recorte: con una IA que lo cambió todo, alta; con una que no tocó el aire, 0", pr.deriva > 18 && pegarRellenoIA(ma, g, rc.caja, (() => { const o = new Uint8ClampedArray(rc.caja.w * rc.caja.h * 4); for (let y = 0; y < rc.caja.h; y++) o.set(fondo.subarray(((rc.caja.y + y) * L + rc.caja.x) * 4, ((rc.caja.y + y) * L + rc.caja.x + rc.caja.w) * 4), y * rc.caja.w * 4); return o; })()).deriva === 0, String(pr.deriva));

  // Contraste: fondo azul a la izquierda, blanco a la derecha; un titular blanco que en el original va sobre el azul.
  const C = 400, fc = new Uint8ClampedArray(C * C * 4);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) fc.set(x < 200 ? [30, 60, 200, 255] : [245, 245, 245, 255], (y * C + x) * 4);
  const bloque = (w, h, color) => { const b = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) b.set(color, i * 4); return b; };
  const titulo = (x) => ({ nombre: "Copy", rol: "TITULO", caja: { x, y: 100, w: 100, h: 40 }, solido: { x, y: 100, w: 100, h: 40 }, letraMinPx: null, rgba: bloque(100, 40, [255, 255, 255, 255]) });
  const sobreAzul = { nombre: "C", w: C, h: C, fondo: fc, piezas: [titulo(50)] };
  const aDerecha = (m) => { const a = acomodar(m, C, C); return { ...a, familia: "horizontal", puestas: a.puestas.map((q) => (m.piezas[q.pieza].rol === "TITULO" ? { ...q, x: 250 } : q)) }; };
  const pOrig = perdidas(sobreAzul, acomodar(sobreAzul, C, C), C, C).get(0), pMovido = perdidas(sobreAzul, aDerecha(sobreAzul), C, C).get(0);
  ok("contraste: blanco sobre azul no se pierde; el mismo blanco sobre blanco, casi todo", pOrig < 0.05 && pMovido > 0.95, `${pOrig} ${pMovido}`);
  eq("contraste: se avisa cuando la medida lo pone sobre su mismo tono y en el original se leía", avisosDePixeles(sobreAzul, aDerecha(sobreAzul), C, C).map((a) => a.tipo), ["contraste"]);
  eq("contraste: si en el original ya iba así (el diseñador lo dejó), no se avisa", avisosDePixeles({ ...sobreAzul, piezas: [titulo(250)] }, aDerecha({ ...sobreAzul, piezas: [titulo(250)] }), C, C).length, 0);
  // Lo de atrás incluye las piezas de abajo: el titular blanco sobre un HERO oscuro se lee aunque el fondo sea blanco.
  const heroOscuro = { nombre: "CARD", rol: "HERO", caja: { x: 220, y: 80, w: 160, h: 100 }, solido: { x: 220, y: 80, w: 160, h: 100 }, letraMinPx: null, rgba: bloque(160, 100, [20, 20, 20, 255]) };
  const conHero = { ...sobreAzul, piezas: [heroOscuro, titulo(50)] };
  ok("contraste: lo de atrás también son las piezas de abajo (blanco sobre un HERO oscuro, encima del fondo blanco, se lee)", (perdidas(conHero, aDerecha(conHero), C, C).get(1) ?? 1) < 0.05);

  // Arreglos de contraste (Pedro, 2026-10-15: "can we do both and let the user decide?"). Fondo blanco a la izquierda
  // y azul a la derecha; en el maestro el titular blanco va sobre el azul. En una medida de 300 de ancho cae sobre el
  // blanco, y el fondo (400 de ancho) tiene 100 px para correrse hasta que atrás quede azul.
  const fc2 = new Uint8ClampedArray(C * C * 4);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) fc2.set(x >= 200 ? [30, 60, 200, 255] : [245, 245, 245, 255], (y * C + x) * 4);
  const m2 = { nombre: "C2", w: C, h: C, fondo: fc2, piezas: [titulo(250)] };
  const a2 = { familia: "horizontal", puestas: [{ pieza: 0, k: 1, x: 100, y: 100, w: 100, h: 40 }], fondo: { k: 1, x: 0, y: 0 }, letras: [], avisos: [], quitadas: [] };
  const op2 = opcionesDeContraste(m2, a2, 300, C);
  ok(
    "contraste: «Mover fondo» corre el fondo dentro de su holgura hasta que atrás quede el azul (se pierde ~0) y sigue cubriendo la medida",
    op2.info.perdida.original > 0.95 && op2.info.perdida.fondo < 0.05 && op2.fondo.fondo.x <= -95 && op2.fondo.fondo.x >= -100,
    JSON.stringify({ p: op2.info.perdida, f: op2.fondo?.fondo }),
  );
  ok("contraste: «Sombra» oscurece lo de atrás del titular blanco y deja de perderse; va marcada en el acomodo", op2.info.perdida.sombra < 0.1 && op2.sombra.sombras.includes(0), JSON.stringify(op2.info.perdida));
  ok("contraste: sin tarjeta que quede flotando, la plataforma elige uno de los dos (no el original)", op2.info.auto !== "original" && !op2.info.fondoSacaHero, op2.info.auto);
  const sinSombra = armarMedida(m2, a2, 300, C), conSombra = armarMedida(m2, op2.sombra, 300, C);
  const gris = (px, x, y) => px[(y * 300 + x) * 4];
  ok("contraste: la sombra se pinta (a 2 px del titular, fuera de su caja, el fondo blanco queda más oscuro; sin letra medida el radio es chico) y lejos no toca nada", gris(conSombra, 98, 120) < gris(sinSombra, 98, 120) - 40 && gris(conSombra, 20, 350) === gris(sinSombra, 20, 350), `${gris(sinSombra, 98, 120)} → ${gris(conSombra, 98, 120)}`);
  // Con un HERO parado en el fondo, correr el fondo 100 px lo deja flotando: se ofrece, pero la plataforma no lo elige.
  const heroM2 = { nombre: "CARD", rol: "HERO", caja: { x: 20, y: 250, w: 100, h: 100 }, solido: { x: 20, y: 250, w: 100, h: 100 }, letraMinPx: null, rgba: bloque(100, 100, [200, 80, 20, 255]) };
  const m3 = { ...m2, piezas: [heroM2, titulo(250)] };
  const a3 = { ...a2, puestas: [{ pieza: 0, k: 1, x: 20, y: 250, w: 100, h: 100 }, { ...a2.puestas[0], pieza: 1 }] };
  const op3 = opcionesDeContraste(m3, a3, 300, C);
  ok("contraste: si mover el fondo saca a la tarjeta de su lugar, se ofrece pero la plataforma elige la sombra", op3.fondo !== null && op3.info.fondoSacaHero && op3.info.auto === "sombra", JSON.stringify(op3.info));
  eq("contraste: si nada se pierde, no hay arreglos que ofrecer", opcionesDeContraste(sobreAzul, acomodar(sobreAzul, C, C), C, C), null);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} formatos: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
