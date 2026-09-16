/**
 * F6a — lo que Prisma sabe de CADA herramienta, como DATOS: límites (duraciones, formatos,
 * referencias, palabras, audio), fortalezas 0–5 (qué hace mejor; el routing las lee) y modelos
 * (id, etiqueta, rol rápido/fino, cómo llegar; "Úsalo en…" los lee). La BASE son las constantes
 * verificadas en código (tools.ts / modelo.ts, 2026-09-11); la tabla prisma_herramientas (0071)
 * las pisa campo a campo desde el Hub, sin deploy. Un campo que falte o venga mal se queda con la
 * base: la generación nunca se rompe por una fila rara. El Hub, en cambio, valida estricto.
 * Módulo puro (cliente y servidor; se prueba en node).
 */
import { ASPECTS, REFS_POR_JOB, TOOLS, type Aspect, type JobType, type Tool } from "./spec.ts";
import { ASPECTS_POR_TOOL, HF_IMAGEN, HF_VIDEO, REFS_MAX, TOOL_AUDIO, TOOL_INFO, TOOLS_POR_JOB, VEO_SEGUNDOS_CON_REFS } from "./tools.ts";
import { t, type Par } from "./copy.ts";

// ── Fortalezas ────────────────────────────────────────────────────────────────
export const FORTALEZAS = ["texto_exacto", "identidad", "voz", "movimiento", "rapidez"] as const;
export type Fortaleza = (typeof FORTALEZAS)[number];

/** Sólo las fortalezas que HOY cambian una decisión del routing: cada número editable hace algo.
 *  Imagen/edición: texto pedido → texto_exacto; sin texto → identidad. Video: diálogo → voz;
 *  movimiento marcado → movimiento; vertical corto sin voz → rapidez. */
export const FORTALEZAS_IMAGEN: Fortaleza[] = ["texto_exacto", "identidad"];
export const FORTALEZAS_VIDEO: Fortaleza[] = ["voz", "movimiento", "rapidez"];
export const fortalezasDe = (tool: Tool): Fortaleza[] => (TOOL_INFO[tool].video ? FORTALEZAS_VIDEO : FORTALEZAS_IMAGEN);

export const ETIQUETA_FORTALEZA: Record<Fortaleza, Par> = {
  texto_exacto: t("Texto exacto en la imagen", "Exact text in the image"),
  identidad: t("Caras, productos y referencias fieles", "Faithful faces, products and references"),
  voz: t("Voz y sonido", "Voice and sound"),
  movimiento: t("Movimientos de cámara", "Camera moves"),
  rapidez: t("Rápido y barato (clip corto)", "Fast and cheap (short clip)"),
};

// ── Modelos ───────────────────────────────────────────────────────────────────
export const ROLES_MODELO = ["rapido", "fino"] as const;
export type RolModelo = (typeof ROLES_MODELO)[number];
/** Los roles entre los que elige recomendarModelo en cada herramienta. */
export const ROLES_POR_TOOL: Record<Tool, RolModelo[]> = { nanobanana: ["rapido", "fino"], chatgpt: ["rapido", "fino"], veo: ["rapido", "fino"], kling: ["rapido", "fino"], higgsfield: ["fino"], seedream: ["fino"], seedance: ["rapido", "fino"], gemini_omni: ["fino"] };
export const MAX_MODELOS = 4;
export const MAX_DURACIONES = 15;

export type Limites = { duraciones: number[]; maxPalabras: number | null; maxCaracteres: number | null; aspects: Aspect[]; refsMax: number; audio: boolean };
/** Lo que cuesta UN intento en nuestro plan (Ultimate). `ilimitado`: 0 créditos en higgsfield.ai. Si no,
 *  créditos por generación con los ajustes de siempre (típico = mediana del histórico; null = sin dato). */
export type CostoModelo = { ilimitado: boolean; tipico: number | null; min: number | null; max: number | null };
/** `url`: la página de ESE modelo en Higgsfield (null = la de la familia, TOOL_INFO.url). `costo`: null = sin dato. */
export type ModeloHerramienta = { id: string; etiqueta: string; rol: RolModelo; comoLlegar: Par; url: string | null; costo: CostoModelo | null };
export type FichaHerramienta = { limites: Limites; fortalezas: Record<Fortaleza, number>; modelos: ModeloHerramienta[]; fuente: { url: string; fecha: string } | null };
export type Catalogo = Record<Tool, FichaHerramienta>;

const cero = (): Record<Fortaleza, number> => ({ texto_exacto: 0, identidad: 0, voz: 0, movimiento: 0, rapidez: 0 });

/** Puntajes de arranque: reproducen EXACTAMENTE el routing de antes de F6a (test golden). */
const BASE_FORTALEZAS: Record<Tool, Partial<Record<Fortaleza, number>>> = {
  nanobanana: { texto_exacto: 3, identidad: 5 },
  chatgpt: { texto_exacto: 5, identidad: 3 },
  veo: { voz: 5, movimiento: 3, rapidez: 2 },
  kling: { voz: 3, movimiento: 4, rapidez: 5 },
  higgsfield: { voz: 0, movimiento: 5, rapidez: 3 },
  // Familias nuevas (2026-09-16): puntajes DEBAJO del líder en cada fortaleza a propósito — el routing de
  // antes no cambia (test golden) y el diseñador las elige a mano. Se calibran en Hub › Herramientas con
  // lo que digan los resultados subidos. Seedance: la mejor calidad pero la más cara (rapidez 1).
  seedream: { texto_exacto: 3, identidad: 4 },
  seedance: { voz: 4, movimiento: 4, rapidez: 1 },
  gemini_omni: { voz: 3, movimiento: 3, rapidez: 3 },
};

/** Los modelos que el equipo usa EN HIGGSFIELD (verificados en su sitio el 2026-09-16; slugs de `?model=`).
 *  El PRIMERO de cada rol es el que se recomienda; los demás sólo aparecen en "¿en cuál lo generaste?".
 *  Los ids son estables (se guardan en modelo_sug y en los resultados): no se renombran. */
const hf = (id: string, etiqueta: string, rol: RolModelo, es: string, en: string, url: string | null, costo: CostoModelo | null = null): ModeloHerramienta => ({ id, etiqueta, rol, comoLlegar: t(es, en), url, costo });
/** Costos base (tasks/higgsfield-costos-2026-09-16.md): ILIMITADO = lista "365 Ilimitado" del plan de Pedro; los
 *  créditos = medianas/rangos del historial de uso de Pedro, y donde no hay filas, precios del blog de Higgsfield. */
const LIBRE: CostoModelo = { ilimitado: true, tipico: 0, min: 0, max: 0 };
const pago = (tipico: number | null, min: number | null = tipico, max: number | null = tipico): CostoModelo => ({ ilimitado: false, tipico, min, max });
const BASE_MODELOS: Record<Tool, ModeloHerramienta[]> = {
  nanobanana: [
    hf("gemini-3.1-flash-image", "Nano Banana 2", "rapido", "En Higgsfield: Image → Nano Banana 2 → sube las referencias en orden y pega el prompt.", "In Higgsfield: Image → Nano Banana 2 → upload the references in order and paste the prompt.", `${HF_IMAGEN}?model=nano-banana-2`, pago(null)),
    hf("gemini-3-pro-image", "Nano Banana Pro", "fino", "En Higgsfield: Image → Nano Banana Pro → sube las referencias en orden y pega el prompt.", "In Higgsfield: Image → Nano Banana Pro → upload the references in order and paste the prompt.", `${HF_IMAGEN}?model=nano-banana-pro`, LIBRE),
    // Sólo para "¿en cuál lo generaste?": Higgsfield elige el modelo solo (el prompt de Nano Banana es el más neutro).
    hf("image-auto", "Image Auto", "rapido", "En Higgsfield: Image → Auto → pega el prompt (Higgsfield elige el modelo).", "In Higgsfield: Image → Auto → paste the prompt (Higgsfield picks the model).", null, LIBRE),
  ],
  chatgpt: [
    hf("gpt-image-2.5-flare", "GPT Image 2.5 Flare", "rapido", "En Higgsfield: Image → GPT Image 2.5 Flare → adjunta las imágenes en orden y pega el prompt.", "In Higgsfield: Image → GPT Image 2.5 Flare → attach the images in order and paste the prompt.", `${HF_IMAGEN}?model=gpt-image-2-5-flare`, pago(3, 1.5, 26.5)),
    hf("gpt-image-2.5-sunburst", "GPT Image 2.5 Sunburst", "fino", "En Higgsfield: Image → GPT Image 2.5 Sunburst → adjunta las imágenes en orden y pega el prompt.", "In Higgsfield: Image → GPT Image 2.5 Sunburst → attach the images in order and paste the prompt.", `${HF_IMAGEN}?model=gpt-image-2-5-sunburst`, pago(3, 1.5, 26.5)),
  ],
  veo: [
    hf("veo-3.1-fast-generate-preview", "Veo 3.1 Fast", "rapido", "En Higgsfield: Video → Google Veo → Veo 3.1 Fast → pega el JSON completo.", "In Higgsfield: Video → Google Veo → Veo 3.1 Fast → paste the full JSON.", `${HF_VIDEO}?model=veo-3-1-preview`, pago(null)),
    hf("veo-3.1-generate-preview", "Veo 3.1", "fino", "En Higgsfield: Video → Google Veo → Veo 3.1 → pega el JSON completo.", "In Higgsfield: Video → Google Veo → Veo 3.1 → paste the full JSON.", `${HF_VIDEO}?model=veo-3-1-preview`, pago(58, 29, 88)),
  ],
  kling: [
    hf("kling-3.0-turbo", "Kling 3.0 Turbo", "rapido", "En Higgsfield: Video → Kling 3.0 en su modo rápido (Turbo) → pega el prompt.", "In Higgsfield: Video → Kling 3.0 in its fast (Turbo) mode → paste the prompt.", `${HF_VIDEO}?model=kling3_0`, pago(6, 6, 8)),
    hf("kling-3.0", "Kling 3.0", "fino", "En Higgsfield: Video → Kling 3.0 → pega el prompt (la foto va en Start frame).", "In Higgsfield: Video → Kling 3.0 → paste the prompt (the photo goes in Start frame).", `${HF_VIDEO}?model=kling3_0`, pago(6, 3.75, 12)),
    // Sólo para "¿en cuál lo generaste?": el movimiento sale de un VIDEO de referencia; el texto sólo pinta el escenario.
    hf("kling-3.0-motion-control", "Kling 3.0 Motion Control", "fino", "En Higgsfield: Video → Motion Control → sube la foto del personaje y el video del movimiento; el prompt describe sólo el escenario y la luz.", "In Higgsfield: Video → Motion Control → upload the character photo and the motion video; the prompt only describes the setting and light.", "https://higgsfield.ai/ai/video/motion?model=kling-3-motion-control", pago(8, 8, 14)),
  ],
  higgsfield: [hf("higgsfield", "Higgsfield DoP", "fino", "En Higgsfield: Video → sube la foto → elige ese preset de cámara → pega el texto.", "In Higgsfield: Video → upload the photo → pick that camera preset → paste the text.", HF_VIDEO, null)],
  seedream: [
    hf("seedream-4.5", "Seedream 4.5", "fino", "En Higgsfield: Image → Seedream 4.5 → sube las referencias en el orden del prompt (Image 1, Image 2…) y pega el prompt.", "In Higgsfield: Image → Seedream 4.5 → upload the references in the prompt's order (Image 1, Image 2…) and paste the prompt.", `${HF_IMAGEN}?model=seedream_v4_5`, LIBRE),
    hf("seedream-5.0-lite", "Seedream 5.0 Lite", "fino", "En Higgsfield: Image → Seedream 5.0 lite → sube las referencias en orden y pega el prompt.", "In Higgsfield: Image → Seedream 5.0 lite → upload the references in order and paste the prompt.", `${HF_IMAGEN}?model=seedream_v5_lite`, LIBRE),
  ],
  seedance: [
    hf("seedance-2.0-mini", "Seedance 2.0 Mini", "rapido", "En Higgsfield: Video → Seedance 2.0 Mini (hasta 720p) → sube las referencias y pega el prompt.", "In Higgsfield: Video → Seedance 2.0 Mini (up to 720p) → upload the references and paste the prompt.", `${HF_VIDEO}?model=seedance_2_0_mini`, pago(12.5, 10, 17.5)),
    hf("seedance-2.0", "Seedance 2.0", "fino", "En Higgsfield: Video → Seedance 2.0 → sube las referencias y pega el prompt; 1080p salvo que la pieza pida 4K.", "In Higgsfield: Video → Seedance 2.0 → upload the references and paste the prompt; 1080p unless the piece needs 4K.", `${HF_VIDEO}?model=seedance_2_0`, pago(54, 36, 110)),
    hf("seedance-2.5", "Seedance 2.5", "fino", "En Higgsfield: Video → Seedance 2.5 → sube las referencias y pega el prompt.", "In Higgsfield: Video → Seedance 2.5 → upload the references and paste the prompt.", `${HF_VIDEO}?model=seedance_2_5`, pago(72, null, 195)),
  ],
  gemini_omni: [
    hf("gemini-omni-flash", "Gemini Omni Flash", "fino", "En Higgsfield: Video → Gemini Omni Flash (720p) → sube las referencias y pega el prompt.", "In Higgsfield: Video → Gemini Omni Flash (720p) → upload the references and paste the prompt.", `${HF_VIDEO}?model=gemini-omni-flash-1-1`, pago(24, 12, 30)),
  ],
};

/** El catálogo de las constantes: lo que usa todo el que no pase otro (tests, demo, sin BD). */
export const CATALOGO_BASE: Catalogo = Object.fromEntries(
  TOOLS.map((tool) => [
    tool,
    {
      limites: { duraciones: [...TOOL_INFO[tool].duraciones], maxPalabras: TOOL_INFO[tool].maxPalabras, maxCaracteres: TOOL_INFO[tool].maxCaracteres, aspects: [...ASPECTS_POR_TOOL[tool]], refsMax: REFS_MAX[tool], audio: TOOL_AUDIO[tool] },
      fortalezas: { ...cero(), ...BASE_FORTALEZAS[tool] },
      modelos: BASE_MODELOS[tool],
      fuente: null,
    },
  ]),
) as Catalogo;

// ── Lectura campo a campo (compartida por la carga tolerante y la validación estricta) ──
type Leido<T> = { ok: true; valor: T } | { ok: false; error: string };
const bien = <T>(valor: T): Leido<T> => ({ ok: true, valor });
const mal = <T>(error: string): Leido<T> => ({ ok: false, error });
const entero = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
/** Texto humano de una línea: sin caracteres de control ni de formato invisibles. */
const textoPlano = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
export const ID_MODELO = /^[a-z0-9][a-z0-9._-]{0,59}$/;
/** Un tope de palabras más bajo haría fallar CADA prompt de esa herramienta (y pagar una reparación). */
export const MIN_PALABRAS = 30;
/** Lo mínimo que una herramienta debe aceptar: las refs obligatorias del trabajo que más pide
 *  (la transición pide 2). Por debajo, el aviso "refs de más" saltaría en cada uso. */
export const refsMinimas = (tool: Tool): number =>
  Math.max(0, ...Object.entries(TOOLS_POR_JOB).filter(([, ts]) => ts.includes(tool)).map(([job]) => REFS_POR_JOB[job as JobType].filter((r) => !r.opcional).length));
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerDuraciones(v: unknown, tool: Tool): Leido<number[]> {
  // Hasta 15: Kling 3.0 y Seedance aceptan cualquier segundo de 3/4 a 15 en Higgsfield.
  if (!Array.isArray(v) || v.length > MAX_DURACIONES || !v.every((d) => entero(d, 1, 60))) return mal(`Duraciones: hasta ${MAX_DURACIONES} números enteros de 1 a 60 segundos.`);
  if (new Set(v).size !== v.length) return mal("Duraciones: sin repetir.");
  if (TOOL_INFO[tool].video && !v.length) return mal("Un video necesita al menos una duración.");
  if (!TOOL_INFO[tool].video && v.length) return mal("Una herramienta de imagen no lleva duraciones.");
  // Regla de Veo que el código impone siempre (duracionVeo): con referencias, 8 s. Quitarlo de la
  // lista contradiría al compilador y al aviso veo_8s_con_refs.
  if (tool === "veo" && !v.includes(VEO_SEGUNDOS_CON_REFS)) return mal(`Veo necesita ${VEO_SEGUNDOS_CON_REFS} s en la lista: con imágenes de referencia sólo genera ${VEO_SEGUNDOS_CON_REFS} s.`);
  return bien(v as number[]);
}
function leerTope(v: unknown, min: number, max: number, que: string): Leido<number | null> {
  if (v === null) return bien(null);
  return entero(v, min, max) ? bien(v) : mal(`${que}: vacío (sin tope) o un entero de ${min} a ${max}.`);
}
function leerAspects(v: unknown): Leido<Aspect[]> {
  if (!Array.isArray(v) || !v.length || !v.every((a) => (ASPECTS as unknown[]).includes(a)) || new Set(v).size !== v.length) return mal(`Formatos: al menos uno, de ${ASPECTS.join(", ")}, sin repetir.`);
  return bien(v as Aspect[]);
}
function leerRefsMax(v: unknown, tool: Tool): Leido<number> {
  const min = refsMinimas(tool);
  return entero(v, min, 20) ? bien(v) : mal(`Referencias: un entero de ${min} a 20 (algún trabajo de esta herramienta pide ${min}).`);
}
function leerFortalezas(v: unknown, tool: Tool, audio: boolean): Leido<Record<Fortaleza, number>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return mal("Fortalezas: falta el objeto.");
  const o = v as Record<string, unknown>;
  const out = cero();
  for (const f of fortalezasDe(tool)) {
    if (!entero(o[f], 0, 5)) return mal(`Fortaleza "${ETIQUETA_FORTALEZA[f].es}": un entero de 0 a 5.`);
    out[f] = o[f] as number;
  }
  if (!audio && out.voz > 0) return mal("Sin audio, la fortaleza de voz tiene que ser 0.");
  return bien(out);
}
function leerModelos(v: unknown, tool: Tool): Leido<ModeloHerramienta[]> {
  if (!Array.isArray(v) || !v.length || v.length > MAX_MODELOS) return mal(`Modelos: de 1 a ${MAX_MODELOS}.`);
  const out: ModeloHerramienta[] = [];
  for (const [i, m] of v.entries()) {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    const n = `Modelo ${i + 1}`;
    if (typeof o.id !== "string" || !ID_MODELO.test(o.id)) return mal(`${n}: el id va en minúsculas, números, punto o guion (máx. 60).`);
    if (o.id === "otro") return mal(`${n}: "otro" está reservado (es la opción "otro modelo" de "¿Cómo salió?").`);
    if (!textoPlano(o.etiqueta, 60)) return mal(`${n}: falta el nombre (máx. 60).`);
    if (!(ROLES_MODELO as readonly unknown[]).includes(o.rol)) return mal(`${n}: el rol es "rapido" o "fino".`);
    if (!textoPlano(o.como_llegar_es, 300) || !textoPlano(o.como_llegar_en, 300)) return mal(`${n}: falta "cómo llegar" en español y en inglés (máx. 300).`);
    const url = leerUrlModelo(o.url);
    if (url === false) return mal(`${n}: la página va como https://higgsfield.ai/… (máx. 300), o vacía.`);
    // Una fila guardada antes del costo (0071/0072) no lo trae: se toma el de la constante con el mismo id.
    const costo = o.costo === undefined ? { ok: true as const, valor: BASE_MODELOS[tool].find((b) => b.id === o.id)?.costo ?? null } : leerCosto(o.costo);
    if (!costo.ok) return mal(`${n}: ${costo.error}`);
    out.push({ id: o.id, etiqueta: (o.etiqueta as string).trim(), rol: o.rol as RolModelo, comoLlegar: t((o.como_llegar_es as string).trim(), (o.como_llegar_en as string).trim()), url, costo: costo.valor });
  }
  if (new Set(out.map((m) => m.id)).size !== out.length) return mal("Modelos: dos con el mismo id.");
  const falta = ROLES_POR_TOOL[tool].find((r) => !out.some((m) => m.rol === r));
  if (falta) return mal(`Modelos: falta uno con rol "${falta}".`);
  return bien(out);
}
/** La página del modelo: vacía (null) o https EN higgsfield.ai (la plataforma del equipo; así una cuenta
 *  master robada no puede mandar el botón "Abrir" de todos a un sitio falso). false = mala. */
export function leerUrlModelo(v: unknown): string | null | false {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || v.length > 300 || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "higgsfield.ai" || u.hostname.endsWith(".higgsfield.ai")) ? v : false;
  } catch {
    return false;
  }
}
// 0 o al menos 0.01: un 5e-324 pasaría "≥ 0" y se guardaría como 300+ dígitos en el jsonb.
const creditos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && (v === 0 || v >= 0.01) && v <= 1000;
const redondo = (v: number): number => Math.round(v * 100) / 100;
/** El costo de un modelo tal como viaja: {ilimitado, creditos_tipicos, creditos_min, creditos_max} o null. */
export function leerCosto(v: unknown): Leido<CostoModelo | null> {
  if (v === null) return bien(null);
  const o = obj(v);
  if (typeof o.ilimitado !== "boolean") return mal("Costo: di si es ilimitado.");
  if (o.ilimitado) return bien({ ...LIBRE });
  const num = (x: unknown): number | null | false => (x === null || x === undefined || x === "" ? null : creditos(x) ? x : false);
  const [tipico, min, max] = [num(o.creditos_tipicos), num(o.creditos_min), num(o.creditos_max)];
  if (tipico === false || min === false || max === false) return mal("Costo: créditos entre 0 y 1000 (o vacío si no hay dato).");
  if ((min !== null && tipico !== null && min > tipico) || (max !== null && tipico !== null && max < tipico) || (min !== null && max !== null && min > max)) return mal("Costo: mínimo ≤ típico ≤ máximo.");
  return bien({ ilimitado: false, tipico: tipico === null ? null : redondo(tipico), min: min === null ? null : redondo(min), max: max === null ? null : redondo(max) });
}
const costoAFila = (c: CostoModelo | null) => (c ? { ilimitado: c.ilimitado, creditos_tipicos: c.tipico, creditos_min: c.min, creditos_max: c.max } : null);

function leerFuente(url: unknown, fecha: unknown): Leido<{ url: string; fecha: string } | null> {
  if ((url === null || url === undefined || url === "") && (fecha === null || fecha === undefined || fecha === "")) return bien(null);
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || url.length > 300) return mal("Fuente: una URL http(s) de hasta 300 caracteres.");
  if (typeof fecha !== "string" || !FECHA.test(fecha) || Number.isNaN(Date.parse(fecha))) return mal("Fuente: la fecha va como AAAA-MM-DD.");
  return bien({ url, fecha });
}

/** Una fila de prisma_herramientas tal como viaja (jsonb snake_case). */
export type FilaHerramienta = { tool: string; limites: unknown; fortalezas: unknown; modelos: unknown; fuente_url: string | null; fuente_fecha: string | null };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Carga TOLERANTE: cada campo válido pisa la base; uno raro se queda con la base. */
export function catalogoDesdeFilas(filas: FilaHerramienta[]): Catalogo {
  const cat = { ...CATALOGO_BASE };
  for (const tool of TOOLS) {
    const f = filas.find((x) => x.tool === tool);
    if (!f) continue;
    const base = CATALOGO_BASE[tool];
    const l = obj(f.limites);
    const pick = <T>(r: Leido<T>, fallback: T): T => (r.ok ? r.valor : fallback);
    const audio = typeof l.audio === "boolean" ? l.audio : base.limites.audio;
    const limites: Limites = {
      duraciones: pick(leerDuraciones(l.duraciones, tool), base.limites.duraciones),
      maxPalabras: "max_palabras" in l ? pick(leerTope(l.max_palabras, MIN_PALABRAS, 500, ""), base.limites.maxPalabras) : base.limites.maxPalabras,
      maxCaracteres: "max_caracteres" in l ? pick(leerTope(l.max_caracteres, 50, 5000, ""), base.limites.maxCaracteres) : base.limites.maxCaracteres,
      aspects: pick(leerAspects(l.aspects), base.limites.aspects),
      refsMax: pick(leerRefsMax(l.refs_max, tool), base.limites.refsMax),
      audio,
    };
    // Fortalezas campo a campo; sin audio la voz es 0 pase lo que pase (nunca mandar diálogo a una muda).
    const fo = obj(f.fortalezas);
    const fortalezas = { ...base.fortalezas };
    for (const k of fortalezasDe(tool)) if (entero(fo[k], 0, 5)) fortalezas[k] = fo[k] as number;
    if (!audio) fortalezas.voz = 0;
    cat[tool] = {
      limites,
      fortalezas,
      modelos: (() => {
        const m = leerModelos(f.modelos, tool);
        // Tolerante pero no mudo: una fila rara vuelve a la base y queda en el log.
        if (!m.ok) console.warn(`[prisma] modelos de ${tool} ilegibles (${m.error}); se usan los del código.`);
        return m.ok ? m.valor : base.modelos;
      })(),
      fuente: pick(leerFuente(f.fuente_url, f.fuente_fecha), null),
    };
  }
  return cat;
}

/** Validación ESTRICTA para el Hub: cualquier campo mal = no se guarda, con el porqué. */
export function validarFicha(tool: string, raw: unknown): { ok: true; fila: FilaHerramienta } | { ok: false; error: string } {
  if (!(TOOLS as string[]).includes(tool)) return { ok: false, error: "Herramienta desconocida." };
  const tl = tool as Tool;
  const o = obj(raw);
  const l = obj(o.limites);
  if (typeof l.audio !== "boolean") return { ok: false, error: "Audio: sí o no." };
  const checks = [
    leerDuraciones(l.duraciones, tl),
    leerTope(l.max_palabras ?? null, MIN_PALABRAS, 500, "Tope de palabras"),
    leerTope(l.max_caracteres ?? null, 50, 5000, "Tope de caracteres"),
    leerAspects(l.aspects),
    leerRefsMax(l.refs_max, tl),
    leerFortalezas(o.fortalezas, tl, l.audio),
    leerModelos(o.modelos, tl),
    leerFuente(o.fuente_url, o.fuente_fecha),
  ];
  const error = checks.find((c): c is { ok: false; error: string } => !c.ok);
  if (error) return { ok: false, error: error.error };
  // Ya validado: la carga tolerante devuelve exactamente lo mismo, normalizado (recortes, orden de campos).
  const ficha = catalogoDesdeFilas([{ tool: tl, limites: o.limites, fortalezas: o.fortalezas, modelos: o.modelos, fuente_url: (o.fuente_url as string) || null, fuente_fecha: (o.fuente_fecha as string) || null }])[tl];
  return { ok: true, fila: { tool: tl, ...fichaAFila(tl, ficha) } };
}

/** De la ficha en memoria a las columnas jsonb (snake_case); sólo las fortalezas que aplican. */
export function fichaAFila(tool: Tool, f: FichaHerramienta): Omit<FilaHerramienta, "tool"> {
  return {
    limites: { duraciones: f.limites.duraciones, max_palabras: f.limites.maxPalabras, max_caracteres: f.limites.maxCaracteres, aspects: f.limites.aspects, refs_max: f.limites.refsMax, audio: f.limites.audio },
    fortalezas: Object.fromEntries(fortalezasDe(tool).map((k) => [k, f.fortalezas[k]])),
    modelos: f.modelos.map((m) => ({ id: m.id, etiqueta: m.etiqueta, rol: m.rol, como_llegar_es: m.comoLlegar.es, como_llegar_en: m.comoLlegar.en, url: m.url, costo: costoAFila(m.costo) })),
    fuente_url: f.fuente?.url ?? null,
    fuente_fecha: f.fuente?.fecha ?? null,
  };
}

// ── Consultas que usan routing / modelo / diagnóstico ─────────────────────────
/** Lo mínimo que cuesta un intento en esa herramienta con un modelo que Prisma recomendaría (el primero de cada
 *  rol): ilimitado = 0; sin dato en ninguno = null. */
export function costoMinimo(cat: Catalogo, tool: Tool): number | null {
  const recomendables = ROLES_MODELO.map((r) => cat[tool].modelos.find((m) => m.rol === r)).filter((m): m is ModeloHerramienta => !!m);
  const cs = recomendables.map((m) => (m.costo ? (m.costo.ilimitado ? 0 : m.costo.tipico) : null)).filter((c): c is number => c !== null);
  return cs.length ? Math.min(...cs) : null;
}

/** La herramienta con más puntaje en esa fortaleza. Empate → la más barata si las dos tienen costo conocido
 *  (paso 2: ahorrar sin bajar calidad); si no, la primera de la lista (TOOLS_POR_JOB). */
export function mejorEn(cat: Catalogo, f: Fortaleza, entre: Tool[]): Tool {
  return entre.reduce((mejor, x) => {
    const a = cat[x].fortalezas[f];
    const b = cat[mejor].fortalezas[f];
    if (a !== b) return a > b ? x : mejor;
    const cx = costoMinimo(cat, x);
    const cm = costoMinimo(cat, mejor);
    return cx !== null && cm !== null && cx < cm ? x : mejor;
  }, entre[0]);
}

/** El modelo recomendado de un rol: el PRIMERO con ese rol; si el catálogo no trae ninguno, la base. */
export function modeloPorRol(cat: Catalogo, tool: Tool, rol: RolModelo): ModeloHerramienta {
  return cat[tool].modelos.find((m) => m.rol === rol) ?? CATALOGO_BASE[tool].modelos.find((m) => m.rol === rol) ?? CATALOGO_BASE[tool].modelos[0];
}
