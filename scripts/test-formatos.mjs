// HÜE Prisma › Formatos — geometría (todos los presets) + PIXEL-LOCK con un proveedor de IA falso que
// devuelve basura (a otra medida). Sin DB ni red. Run: node scripts/test-formatos.mjs
import sharp from "sharp";
import {
  PRESETS, presetDe, idCustom, medidaValida, encajar, sugerir, agrandaPct, lienzoIA, RATIOS_IA, costoEstimado, COSTO_IA_USD,
  pegarDuro, zonaIdentica, deriva, colorDeBorde, nombreArchivo, LADO_MIN, LADO_MAX,
} from "../src/lib/prisma/formatos/geometria.ts";
import { leerFuente, escalar, componer } from "../src/lib/prisma/formatos/componer.ts";

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
const cob = (w0, h0, id) => encajar(w0, h0, presetDe(id).w, presetDe(id).h).cobertura;
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
  for (const p of TODAS) {
    const c = await componer(f, p.w, p.h, "ia", { expandir: basura });
    const e = c.encaje;
    // Comprobación INDEPENDIENTE: releer el PNG y compararlo contra una copia escalada calculada aparte.
    const nuestra = await escalar(f, e.sw, e.sh);
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
    if (!(c.deriva > 10)) fallas.push(`${p.id}: la basura no llegó al centro (deriva ${c.deriva}) — la prueba no probaría nada`);
  }
  ok(`IA de basura en ${TODAS.length} tamaños: zona original idéntica byte por byte (PNG releído), afuera opaco, JPG a la medida`, fallas.length === 0, fallas.slice(0, 6).join(" | "));
  eq("la IA falsa se llamó una vez por tamaño", llamadas, TODAS.length);

  const otros = [];
  for (const [modo, opts] of [["blur", {}], ["color", { color: "#123456" }]]) {
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
  ok("desenfoque y color: pixel-lock, sin deriva ni costo, el color llega a la esquina", otros.length === 0, otros.join(" | "));
  ok("modo ia sin proveedor lanza (nunca 'rellena' en silencio)", await componer(f, 300, 250, "ia").then(() => false).catch(() => true));

  // Control negativo: si el pegado NO ocurriera, el check lo atraparía.
  const c = await componer(f, 1080, 1920, "ia", { expandir: basura });
  const relei = await sharp(c.png).ensureAlpha().raw().toBuffer();
  const nuestra = await escalar(f, c.encaje.sw, c.encaje.sh);
  relei[((c.encaje.oy + 10) * 1080 + c.encaje.ox + 10) * 4] ^= 0xff;
  ok("control negativo: un píxel tocado dentro de la zona → el check falla", !zonaIdentica(relei, 1080, nuestra, c.encaje));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} formatos: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
