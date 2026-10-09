// HÜE Prisma › Formatos — geometría (todos los presets) + PIXEL-LOCK con un proveedor de IA falso que
// devuelve basura (a otra medida). Sin DB ni red. Run: node scripts/test-formatos.mjs
import sharp from "sharp";
import {
  PRESETS, presetDe, idCustom, medidaValida, encajar, sugerir, agrandaPct, lienzoIA, RATIOS_IA, costoEstimado, COSTO_IA_USD,
  pegarDuro, zonaIdentica, deriva, colorDeBorde, nombreArchivo, LADO_MIN, LADO_MAX,
  bordesDe, leerMedidas, hayExpansion, SIN_RECORTE, MODOS, esModo,
} from "../src/lib/prisma/formatos/geometria.ts";
import { leerFuente, escalarVisible, componer, analizarBordes } from "../src/lib/prisma/formatos/componer.ts";

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

console.log(`\n${fail === 0 ? "✅" : "❌"} formatos: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
