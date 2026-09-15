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
import { ASPECTS_POR_TOOL, REFS_MAX, TOOL_AUDIO, TOOL_INFO, TOOLS_POR_JOB, VEO_SEGUNDOS_CON_REFS } from "./tools.ts";
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
export const ROLES_POR_TOOL: Record<Tool, RolModelo[]> = { nanobanana: ["rapido", "fino"], chatgpt: ["rapido", "fino"], veo: ["rapido", "fino"], kling: ["rapido", "fino"], higgsfield: ["fino"] };
export const MAX_MODELOS = 4;

export type Limites = { duraciones: number[]; maxPalabras: number | null; maxCaracteres: number | null; aspects: Aspect[]; refsMax: number; audio: boolean };
export type ModeloHerramienta = { id: string; etiqueta: string; rol: RolModelo; comoLlegar: Par };
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
};

/** Los modelos verificados el 2026-09-11 (antes vivían en modelo.ts). El PRIMERO de cada rol es
 *  el que se recomienda; los demás sólo aparecen en "¿en cuál lo generaste?". */
const BASE_MODELOS: Record<Tool, ModeloHerramienta[]> = {
  nanobanana: [
    { id: "gemini-3.1-flash-image", etiqueta: "Nano Banana 2", rol: "rapido", comoLlegar: t("En Gemini es el modelo de imagen por default; en AI Studio, gemini-3.1-flash-image.", "In Gemini it is the default image model; in AI Studio, gemini-3.1-flash-image.") },
    { id: "gemini-3-pro-image", etiqueta: "Nano Banana Pro", rol: "fino", comoLlegar: t("En Gemini elige el modo Thinking (Nano Banana Pro) antes de pegar; en AI Studio, el modelo gemini-3-pro-image.", "In Gemini pick Thinking mode (Nano Banana Pro) before pasting; in AI Studio, the gemini-3-pro-image model.") },
  ],
  chatgpt: [
    { id: "gpt-image-2.5-flare", etiqueta: "ChatGPT Images · flare", rol: "rapido", comoLlegar: t("En ChatGPT pega el prompt tal cual; por API, gpt-image-2.5-flare.", "In ChatGPT paste the prompt as is; via API, gpt-image-2.5-flare.") },
    { id: "gpt-image-2.5-sunburst", etiqueta: "ChatGPT Images · sunburst", rol: "fino", comoLlegar: t("En ChatGPT pega el prompt con la imagen adjunta; por API usa el modelo gpt-image-2.5-sunburst.", "In ChatGPT paste the prompt with the image attached; via API use the gpt-image-2.5-sunburst model.") },
  ],
  veo: [
    { id: "veo-3.1-fast-generate-preview", etiqueta: "Veo 3.1 Fast", rol: "rapido", comoLlegar: t("En Flow elige la calidad Fast antes de generar.", "In Flow choose Fast quality before generating.") },
    { id: "veo-3.1-generate-preview", etiqueta: "Veo 3.1", rol: "fino", comoLlegar: t("En Flow deja la calidad estándar (Quality).", "In Flow keep the standard quality (Quality).") },
  ],
  kling: [
    { id: "kling-3.0-turbo", etiqueta: "Kling 3.0 Turbo", rol: "rapido", comoLlegar: t("En Kling elige el modelo 3.0 y el modo Turbo (o Standard).", "In Kling pick model 3.0 and Turbo mode (or Standard).") },
    { id: "kling-3.0", etiqueta: "Kling 3.0", rol: "fino", comoLlegar: t("En Kling elige el modelo 3.0 en modo Professional.", "In Kling pick model 3.0 in Professional mode.") },
  ],
  higgsfield: [{ id: "higgsfield", etiqueta: "Higgsfield", rol: "fino", comoLlegar: t("En Higgsfield: Create → elige ese preset de cámara → pega el texto.", "In Higgsfield: Create → pick that camera preset → paste the text.") }],
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
  if (!Array.isArray(v) || v.length > 6 || !v.every((d) => entero(d, 1, 60))) return mal("Duraciones: hasta 6 números enteros de 1 a 60 segundos.");
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
    out.push({ id: o.id, etiqueta: (o.etiqueta as string).trim(), rol: o.rol as RolModelo, comoLlegar: t((o.como_llegar_es as string).trim(), (o.como_llegar_en as string).trim()) });
  }
  if (new Set(out.map((m) => m.id)).size !== out.length) return mal("Modelos: dos con el mismo id.");
  const falta = ROLES_POR_TOOL[tool].find((r) => !out.some((m) => m.rol === r));
  if (falta) return mal(`Modelos: falta uno con rol "${falta}".`);
  return bien(out);
}
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
      modelos: pick(leerModelos(f.modelos, tool), base.modelos),
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
    modelos: f.modelos.map((m) => ({ id: m.id, etiqueta: m.etiqueta, rol: m.rol, como_llegar_es: m.comoLlegar.es, como_llegar_en: m.comoLlegar.en })),
    fuente_url: f.fuente?.url ?? null,
    fuente_fecha: f.fuente?.fecha ?? null,
  };
}

// ── Consultas que usan routing / modelo / diagnóstico ─────────────────────────
/** La herramienta con más puntaje en esa fortaleza; empate → la primera de la lista (TOOLS_POR_JOB). */
export function mejorEn(cat: Catalogo, f: Fortaleza, entre: Tool[]): Tool {
  return entre.reduce((mejor, x) => (cat[x].fortalezas[f] > cat[mejor].fortalezas[f] ? x : mejor), entre[0]);
}

/** El modelo recomendado de un rol: el PRIMERO con ese rol; si el catálogo no trae ninguno, la base. */
export function modeloPorRol(cat: Catalogo, tool: Tool, rol: RolModelo): ModeloHerramienta {
  return cat[tool].modelos.find((m) => m.rol === rol) ?? CATALOGO_BASE[tool].modelos.find((m) => m.rol === rol) ?? CATALOGO_BASE[tool].modelos[0];
}
