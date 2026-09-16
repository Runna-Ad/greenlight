/**
 * F6b — el VIGÍA: lo puro. Lee las fuentes (docs oficiales, Help Center y blog de Higgsfield), se queda con
 * los PÁRRAFOS NUEVOS desde la última lectura y H.Ü.E propone cambios al conocimiento de Prisma con una cita
 * literal. Nada se publica solo: el master aprueba en Hub › Prisma › Vigía y la propuesta se escribe con los
 * MISMOS validadores del Hub (validarRegla / validarFicha). Aquí vive todo lo que no toca red ni BD: extraer
 * texto, comparar, validar fuentes, sanear lo que propone el modelo, la huella y cómo se aplica.
 * Módulo puro (se prueba en node).
 */
import { ASPECTS, TOOLS, type Tool } from "./spec.ts";
import { ID_MODELO, ROLES_MODELO, fichaAFila, fortalezasDe, type FichaHerramienta } from "./catalogo.ts";
import { validarRegla } from "./reglas.ts";
import { plano } from "./texto.ts";
import { listaDe, objetoDe } from "./json.ts";
import { TOOL_INFO } from "./tools.ts";

export const TIPOS_PROPUESTA = ["nota", "regla", "modelo", "limite", "fortaleza", "deprecacion", "codigo"] as const;
export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number];
export const ORIGENES = ["oficial", "comunidad"] as const;
export type Origen = (typeof ORIGENES)[number];
/** Lo que la ficha de una herramienta deja proponer como límite (las mismas llaves que el jsonb de 0071). */
export const CAMPOS_LIMITE = ["duraciones", "aspects", "refs_max", "audio", "max_palabras"] as const;
export type CampoLimite = (typeof CAMPOS_LIMITE)[number];

export const LIMITES_VIGIA = {
  url: 300,
  nombre: 80,
  /** Lo que se guarda de la última lectura (para comparar la siguiente). */
  textoGuardado: 300_000,
  /** Lo que H.Ü.E lee de lo nuevo POR LLAMADA (una página muy cambiada se reparte en varios lotes). */
  loteParaIA: 6_000,
  /** Un "párrafo" con menos palabras es menú, botón o pie de página: no cuenta como cambio. */
  palabrasMin: 6,
  propuestasPorLectura: 5,
  resumen: 300,
  cita: 600,
  nota: 700,
  detalle: 600,
  fuentesPorPropuesta: 20,
} as const;

export type FuenteBase = { url: string; nombre: string; tool: Tool | null; origen: Origen };

/** Las fuentes con las que arranca el vigía (0074 las siembra desde aquí): las oficiales que ya citaba el
 *  conocimiento + las páginas de Higgsfield que se leyeron en el deep dive del 2026-09-16. Todas verificadas. */
export const FUENTES_BASE: FuenteBase[] = [
  { url: "https://higgsfield.ai/creator-hub/help-center/getting-started/how-do-i-write-a-good-prompt", nombre: "Higgsfield — cómo escribir un buen prompt", tool: null, origen: "oficial" },
  { url: "https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work", nombre: "Higgsfield — cómo funcionan los créditos", tool: null, origen: "oficial" },
  { url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-nano-banana", nombre: "Higgsfield — Nano Banana", tool: "nanobanana", origen: "oficial" },
  { url: "https://ai.google.dev/gemini-api/docs/image-generation", nombre: "Google — generación de imágenes (Gemini)", tool: "nanobanana", origen: "oficial" },
  { url: "https://higgsfield.ai/blog/gpt-image-2-5-higgsfield", nombre: "Higgsfield — GPT Image 2.5", tool: "chatgpt", origen: "oficial" },
  { url: "https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide", nombre: "OpenAI — guía de prompts de imagen", tool: "chatgpt", origen: "oficial" },
  { url: "https://higgsfield.ai/blog/Seedream-5.0-Lite-Review-How-to-Comparison", nombre: "Higgsfield — Seedream 5.0 Lite", tool: "seedream", origen: "oficial" },
  { url: "https://higgsfield.ai/blog/How-to-Use-Google-Veo-3.1-Complete-Guide-for-the-New-Model", nombre: "Higgsfield — Veo 3.1", tool: "veo", origen: "oficial" },
  { url: "https://ai.google.dev/gemini-api/docs/veo", nombre: "Google — Veo (Gemini API)", tool: "veo", origen: "oficial" },
  { url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling", nombre: "Higgsfield — Kling", tool: "kling", origen: "oficial" },
  { url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-seedance", nombre: "Higgsfield — Seedance", tool: "seedance", origen: "oficial" },
  { url: "https://higgsfield.ai/blog/seedance-2-5-prompting-guide", nombre: "Higgsfield — guía de prompts de Seedance 2.5", tool: "seedance", origen: "oficial" },
  { url: "https://higgsfield.ai/blog/gemini-omni-flash-vfx-video-editing", nombre: "Higgsfield — Gemini Omni Flash", tool: "gemini_omni", origen: "oficial" },
  { url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-dop", nombre: "Higgsfield — DoP (presets de cámara)", tool: "higgsfield", origen: "oficial" },
];

// ── Texto legible y cambios ───────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const desEntidades = (s: string): string =>
  s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z0-9]{2,8});/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTIDADES) return ENTIDADES[k];
    const n = k.startsWith("#x") ? parseInt(k.slice(2), 16) : k.startsWith("#") ? parseInt(k.slice(1), 10) : NaN;
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });

/** Etiquetas cuyo CONTENIDO no es lectura (código, menús, pies, formularios): se saltan enteras. */
const SALTAR = new Set(["script", "style", "noscript", "svg", "template", "iframe", "nav", "header", "footer", "form", "aside", "button", "select"]);
/** Etiquetas que cortan bloque (una línea por párrafo). */
const BLOQUE = new Set(["br", "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "blockquote", "pre", "td", "th", "dd", "dt", "main", "article", "ul", "ol", "table", "figcaption"]);

/** El texto que una persona lee en la página, un bloque por línea. Si hay <main> o <article>, sólo eso (el menú
 *  y el pie cambian seguido y no son conocimiento). Sin scripts, estilos, nav, header, footer ni formularios.
 *  UNA pasada hacia adelante con indexOf (nada de regex sobre el HTML): una página hostil de 2 MB con "<" sin
 *  cerrar no puede volverlo cuadrático (reap de seguridad 2026-09-16). Lo que queda sin cerrar se descarta. */
export function extraerTexto(html: string): string {
  let h = html.slice(0, 3_000_000);
  // Sólo A–Z a minúsculas: toLowerCase() puede ALARGAR el texto ("İ" → 2 caracteres) y descuadrar las posiciones.
  let bajo = h.replace(/[A-Z]/g, (c) => c.toLowerCase());
  // Sólo el contenido principal: del primer <main|<article al ÚLTIMO cierre de esa etiqueta.
  for (const tag of ["main", "article"]) {
    const ini = bajo.indexOf(`<${tag}`);
    const fin = bajo.lastIndexOf(`</${tag}`);
    if (ini >= 0 && fin > ini) {
      h = h.slice(ini, fin);
      bajo = bajo.slice(ini, fin);
      break;
    }
  }
  const partes: string[] = [];
  let i = 0;
  while (i < h.length) {
    const lt = h.indexOf("<", i);
    if (lt < 0) {
      partes.push(h.slice(i));
      break;
    }
    if (lt > i) partes.push(h.slice(i, lt));
    if (bajo.startsWith("<!--", lt)) {
      const cierre = bajo.indexOf("-->", lt + 4);
      if (cierre < 0) break;
      i = cierre + 3;
      continue;
    }
    const gt = h.indexOf(">", lt + 1);
    if (gt < 0) break;
    const nombre = /^\/?([a-z][a-z0-9]*)/.exec(bajo.slice(lt + 1, Math.min(gt, lt + 24)))?.[1] ?? "";
    const cierra = bajo[lt + 1] === "/";
    i = gt + 1;
    if (!cierra && SALTAR.has(nombre) && h[gt - 1] !== "/") {
      const fin = bajo.indexOf(`</${nombre}`, i);
      if (fin < 0) break;
      const finGt = h.indexOf(">", fin);
      if (finGt < 0) break;
      i = finGt + 1;
      partes.push(" ");
      continue;
    }
    partes.push(BLOQUE.has(nombre) ? "\n" : " ");
  }
  const lineas = desEntidades(partes.join(""))
    .split("\n")
    .map((l) => l.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Tope sin partir un carácter (un emoji partido lo rechaza Postgres).
  let out = "";
  for (const l of lineas) {
    if (out.length + l.length + 1 > LIMITES_VIGIA.textoGuardado) break;
    out += (out ? "\n" : "") + l;
  }
  return out;
}

const palabras = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** Los bloques con contenido (los cortos son menú o botón). */
export const parrafos = (texto: string): string[] => texto.split("\n").map((l) => l.trim()).filter((l) => palabras(l) >= LIMITES_VIGIA.palabrasMin);

/** TODO lo que es NUEVO respecto a la lectura anterior (párrafos que antes no estaban), sin repetir. Sin tope:
 *  lo que no quepa en una llamada se reparte en lotes (enLotes) y lo que no se alcance a leer NO se marca como
 *  leído (reap 2026-09-16: un tope aquí perdía cambios para siempre). Sin lectura anterior no hay "nuevo". */
export function cambios(anterior: string | null, actual: string): string[] {
  if (anterior === null) return [];
  const antes = new Set(parrafos(anterior));
  return [...new Set(parrafos(actual))].filter((p) => !antes.has(p));
}

/** Los párrafos nuevos en lotes de hasta `max` caracteres (un párrafo más largo va solo, recortado). */
export function enLotes(nuevos: string[], max: number = LIMITES_VIGIA.loteParaIA): string[][] {
  const lotes: string[][] = [];
  let actual: string[] = [];
  let largo = 0;
  for (const p0 of nuevos) {
    const p = p0.length > max ? p0.slice(0, max) : p0;
    if (actual.length && largo + p.length > max) {
      lotes.push(actual);
      actual = [];
      largo = 0;
    }
    actual.push(p);
    largo += p.length;
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}

/** El texto que se guarda como "leído" cuando quedaron lotes sin leer: la página SIN esos párrafos, así la
 *  próxima corrida los vuelve a ver como nuevos. */
export function sinParrafos(texto: string, quitar: string[]): string {
  const fuera = new Set(quitar.map((p) => p.trim()));
  return texto.split("\n").filter((l) => !fuera.has(l.trim())).join("\n");
}

// ── Fuentes ───────────────────────────────────────────────────────────────────

/** Hosts que nunca se leen: IPs literales, locales e internos (la resolución DNS se revisa aparte, en el servidor). */
export function hostPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || !h.includes(".")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  if (h === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet|arpa)$/.test(h)) return false;
  if (h === "metadata.google.internal" || h.endsWith(".supabase.co") || h.endsWith(".vercel.internal")) return false;
  return /^[a-z0-9.-]+$/.test(h);
}

export type FilaFuente = { url: string; nombre: string; tool: Tool | null; origen: Origen; activa: boolean };

export function validarFuente(raw: unknown): { ok: true; fila: FilaFuente } | { ok: false; error: string } {
  const o = objetoDe(raw) ?? {};
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url || url.length > LIMITES_VIGIA.url || /\s/.test(url)) return { ok: false, error: `La liga: https://… de hasta ${LIMITES_VIGIA.url} caracteres.` };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, error: "La liga no es válida." };
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return { ok: false, error: "Sólo ligas https normales (sin usuario, contraseña ni puerto)." };
  if (!hostPermitido(u.hostname)) return { ok: false, error: "Ese sitio no se puede leer (dirección interna o IP)." };
  const nombre = typeof o.nombre === "string" ? plano(o.nombre) : "";
  if (!nombre || nombre.length > LIMITES_VIGIA.nombre) return { ok: false, error: `Ponle un nombre (máx. ${LIMITES_VIGIA.nombre}).` };
  const tool = o.tool === null || o.tool === undefined || o.tool === "" ? null : o.tool;
  if (tool !== null && !(TOOLS as unknown[]).includes(tool)) return { ok: false, error: "Herramienta desconocida." };
  const origen = o.origen ?? "oficial";
  if (!(ORIGENES as readonly unknown[]).includes(origen)) return { ok: false, error: "El origen es oficial o comunidad." };
  return { ok: true, fila: { url: u.toString(), nombre, tool: tool as Tool | null, origen: origen as Origen, activa: o.activa === undefined ? true : !!o.activa } };
}

// ── Propuestas ────────────────────────────────────────────────────────────────

export type Propuesta = { tipo: TipoPropuesta; tool: Tool | null; resumen_es: string; cita: string; contenido: Record<string, unknown> };

const linea = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = plano(v);
  return s && s.length <= max ? s : null;
};
const comparable = (s: string): string => plano(s).toLowerCase();

/** El contenido de cada tipo, estricto: lo que no cabe en la forma se tira (el modelo no inventa campos). */
export function validarContenido(tipo: TipoPropuesta, tool: Tool | null, raw: unknown): Record<string, unknown> | null {
  const c = objetoDe(raw);
  if (!c) return null;
  switch (tipo) {
    case "nota":
    case "deprecacion": {
      const nota_en = linea(c.nota_en, LIMITES_VIGIA.nota);
      // Una nota del vigía es un HECHO sobre la herramienta. Si le habla a alguien (tú, H.Ü.E, el asistente) o
      // pide aprobar / ignorar / agregar, viene de la página y no es un hecho: se tira (reap 2026-09-16).
      if (!nota_en || NOTA_SOSPECHOSA.test(nota_en)) return null;
      // Mismo filtro que el Hub (una nota es un HECHO, no una instrucción al modelo).
      const v = validarRegla({ codigo: "vigia_prueba", clase: "nota", tool, nota_en, fuente_url: "https://x.y/z", fuente_fecha: "2026-01-01" });
      return v.ok ? { nota_en } : null;
    }
    case "regla": {
      // Una regla del vigía nunca BLOQUEA la generación: como mucho advierte (bloquear lo decide una persona en el Hub).
      const nivelVigia = c.nivel === "sugiere" ? "sugiere" : "advierte";
      const v = validarRegla({ ...c, nivel: nivelVigia, codigo: "vigia_prueba", clase: "regla", tool, fuente_url: "https://x.y/z", fuente_fecha: "2026-01-01" });
      if (!v.ok) return null;
      // Los textos en inglés de la regla tampoco pueden hablarle a nadie (mismo filtro que las notas).
      if ([v.row.que_en, v.row.porque_en, v.row.arreglo_en].some((x) => x && NOTA_SOSPECHOSA.test(x))) return null;
      // Sólo lo que define la regla; código, clase, herramienta y fuente los pone la aprobación.
      const { kind, nivel, campo, patron, umbral, que_es, que_en, porque_es, porque_en, arreglo_es, arreglo_en, accion } = v.row;
      return { kind, nivel, campo, patron, umbral, que_es, que_en, porque_es, porque_en, arreglo_es, arreglo_en, accion };
    }
    case "modelo": {
      if (!tool) return null;
      const id = typeof c.id === "string" && ID_MODELO.test(c.id) && c.id !== "otro" ? c.id : null;
      const etiqueta = linea(c.etiqueta, 60);
      const rol = (ROLES_MODELO as readonly unknown[]).includes(c.rol) ? (c.rol as string) : null;
      const es = linea(c.como_llegar_es, 300);
      const en = linea(c.como_llegar_en, 300);
      if (!id || !etiqueta || !rol || !es || !en) return null;
      return { id, etiqueta, rol, como_llegar_es: es, como_llegar_en: en };
    }
    case "limite": {
      if (!tool || !(CAMPOS_LIMITE as readonly unknown[]).includes(c.campo)) return null;
      const campo = c.campo as CampoLimite;
      const v = c.valor;
      const entero = (x: unknown, a: number, b: number) => typeof x === "number" && Number.isInteger(x) && x >= a && x <= b;
      const ok =
        campo === "duraciones" ? Array.isArray(v) && v.length > 0 && v.length <= 15 && v.every((d) => entero(d, 1, 60))
        : campo === "aspects" ? Array.isArray(v) && v.length > 0 && v.every((a) => (ASPECTS as unknown[]).includes(a))
        : campo === "refs_max" ? entero(v, 0, 50)
        : campo === "audio" ? typeof v === "boolean"
        : v === null || entero(v, 30, 500);
      return ok ? { campo, valor: v } : null;
    }
    case "fortaleza": {
      if (!tool || !(fortalezasDe(tool) as unknown[]).includes(c.fortaleza)) return null;
      return typeof c.valor === "number" && Number.isInteger(c.valor) && c.valor >= 0 && c.valor <= 5 ? { fortaleza: c.fortaleza, valor: c.valor } : null;
    }
    case "codigo": {
      const detalle_es = linea(c.detalle_es, LIMITES_VIGIA.detalle);
      return detalle_es ? { detalle_es } : null;
    }
  }
}

// "hue" (color) y "your" son palabras normales en una guía: no cuentan. Sí cuenta nombrar a H.Ü.E con diéresis.
export const NOTA_SOSPECHOSA = /\b(you|yourself|ignore|disregard|approve|approval|assistant|claude|system prompt|instructions?|admin mode|jailbreak|append|override)\b|h\.?\s?ü\.?\s?e/i;

/** Lo que devuelve H.Ü.E, saneado. Cada propuesta necesita una CITA que esté LITERAL en lo que se leyó
 *  (sin ella es una suposición: se tira). La herramienta la pone la fuente cuando la fuente es de una. */
export function sanearPropuestas(raw: unknown, leido: string[], toolFuente: Tool | null): Propuesta[] {
  const fuente = comparable(leido.join("\n"));
  const out: Propuesta[] = [];
  for (const item of listaDe(raw, "propuestas")) {
    const o = objetoDe(item);
    if (!o || !(TIPOS_PROPUESTA as readonly unknown[]).includes(o.tipo)) continue;
    const tipo = o.tipo as TipoPropuesta;
    const toolDicho = o.tool === null || o.tool === undefined || o.tool === "" ? null : (TOOLS as unknown[]).includes(o.tool) ? (o.tool as Tool) : undefined;
    if (toolDicho === undefined) continue;
    if (toolFuente && toolDicho && toolDicho !== toolFuente) continue;
    const tool = toolFuente ?? toolDicho;
    const resumen_es = linea(o.resumen_es, LIMITES_VIGIA.resumen);
    const cita = linea(o.cita, LIMITES_VIGIA.cita);
    if (!resumen_es || !cita || cita.length < 12 || !fuente.includes(comparable(cita))) continue;
    const contenido = validarContenido(tipo, tool, o.contenido);
    if (!contenido) continue;
    out.push({ tipo, tool, resumen_es, cita, contenido });
    if (out.length >= LIMITES_VIGIA.propuestasPorLectura) break;
  }
  return out;
}

/** JSON con las llaves en orden: la misma propuesta da la misma huella aunque el modelo reordene. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(typeof v === "string" ? comparable(v) : v);
}
/** El texto del que sale la huella (el servidor lo pasa por sha256). Mismo cambio = misma huella, venga de la
 *  fuente que venga: así un descarte no vuelve y dos fuentes de comunidad se suman. */
export const huellaTexto = (p: Pick<Propuesta, "tipo" | "tool" | "contenido">): string => `${p.tipo}|${p.tool ?? "*"}|${canonico(p.contenido)}`;

/** Una propuesta de comunidad necesita 2 fuentes distintas antes de enseñarse. */
export const visible = (p: { origen: Origen; fuentes: string[] }): boolean => p.origen === "oficial" || new Set(p.fuentes).size >= 2;

/** Los tipos que se escriben en prisma_reglas y los que tocan la ficha de la herramienta. */
export const ESCRIBE_REGLA: TipoPropuesta[] = ["nota", "deprecacion", "regla"];
export const ESCRIBE_FICHA: TipoPropuesta[] = ["modelo", "limite", "fortaleza"];

/** La ficha con el cambio aplicado, en la forma que valida el Hub (validarFicha decide si pasa). */
export function aplicarAFicha(ficha: FichaHerramienta, tool: Tool, p: Pick<Propuesta, "tipo" | "contenido">): Record<string, unknown> {
  const fila = fichaAFila(tool, ficha) as unknown as { limites: Record<string, unknown>; fortalezas: Record<string, unknown>; modelos: Record<string, unknown>[]; fuente_url: string | null; fuente_fecha: string | null };
  const c = p.contenido;
  if (p.tipo === "limite") fila.limites = { ...fila.limites, [c.campo as string]: c.valor };
  if (p.tipo === "fortaleza") fila.fortalezas = { ...fila.fortalezas, [c.fortaleza as string]: c.valor };
  if (p.tipo === "modelo") {
    const i = fila.modelos.findIndex((m) => m.id === c.id);
    // Un modelo nuevo entra SIN costo conocido (lo pone una persona en el Hub); uno existente conserva el suyo.
    const nuevo = { ...c, url: i >= 0 ? fila.modelos[i].url : null, costo: i >= 0 ? fila.modelos[i].costo : null };
    if (i >= 0) fila.modelos = fila.modelos.map((m, j) => (j === i ? nuevo : m));
    else {
      // Uno NUEVO (versión nueva, renombre) pasa a ser el recomendado de su rol: va antes de los de ese rol.
      const primero = fila.modelos.findIndex((m) => m.rol === c.rol);
      fila.modelos = primero >= 0 ? [...fila.modelos.slice(0, primero), nuevo, ...fila.modelos.slice(primero)] : [...fila.modelos, nuevo];
    }
  }
  return fila;
}

/** La fila de prisma_reglas que escribe una nota / deprecación / regla aprobada (validarRegla decide si pasa). */
export function reglaDePropuesta(p: Pick<Propuesta, "tipo" | "tool" | "contenido">, codigo: string, fuente: { url: string; origen: Origen }, hoy: string): Record<string, unknown> {
  const base = { codigo, tool: p.tool, fuente_url: fuente.url, fuente_fecha: hoy, fuente_tipo: fuente.origen, activa: true };
  // El nivel se vuelve a limitar al aprobar (una propuesta guardada antes del límite no puede entrar bloqueando).
  const nivel = p.contenido.nivel === "sugiere" ? "sugiere" : "advierte";
  return p.tipo === "regla" ? { ...p.contenido, nivel, ...base, clase: "regla" } : { ...base, clase: "nota", nota_en: p.contenido.nota_en };
}

/** El código estable de una regla/nota aprobada: sale de la huella (aprobar dos veces no duplica). */
export const codigoDeHuella = (huella: string): string => `vigia_${huella.slice(0, 16)}`;

/** Lo que Prisma sabe HOY de una herramienta (o de todas, para una fuente general), en texto corto para H.Ü.E:
 *  así no propone lo que ya está. Ficha del catálogo + notas activas. */
export function sabidoDe(cat: Record<Tool, FichaHerramienta>, notas: { tool: Tool | null; texto: string }[], tool: Tool | null, max = 6000): string {
  const ficha = (t: Tool) => {
    const f = cat[t];
    return `${t}: durations ${f.limites.duraciones.join("/") || "-"} s; aspects ${f.limites.aspects.join(", ")}; max refs ${f.limites.refsMax}; audio ${f.limites.audio ? "yes" : "no"}; strengths ${Object.entries(f.fortalezas).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ")}; models ${f.modelos.map((m) => `${m.etiqueta} (${m.id}, ${m.rol})`).join("; ")}`;
  };
  const lineas = [
    ...(tool ? [ficha(tool)] : TOOLS.map(ficha)),
    ...notas.filter((n) => !tool || n.tool === tool || n.tool === null).map((n) => `note${n.tool ? ` [${n.tool}]` : ""}: ${n.texto}`),
  ];
  return lineas.join("\n").slice(0, max);
}

export const TIPO_LABEL: Record<TipoPropuesta, string> = {
  nota: "Nota para H.Ü.E",
  regla: "Aviso automático",
  modelo: "Modelo",
  limite: "Límite",
  fortaleza: "En qué es mejor",
  deprecacion: "Se retira",
  codigo: "Necesita código",
};
const CAMPO_LIMITE_LABEL: Record<CampoLimite, string> = { duraciones: "Duraciones (s)", aspects: "Formatos", refs_max: "Referencias máximas", audio: "Genera sonido", max_palabras: "Tope de palabras" };

/** Qué cambiaría, en palabras, para la tarjeta del Hub. */
export function describirContenido(tipo: TipoPropuesta, c: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "sí" : "no") : v === null ? "sin tope" : String(v));
  switch (tipo) {
    case "nota":
    case "deprecacion":
      return `Nota (inglés): ${s(c.nota_en)}`;
    case "regla":
      // TODO lo que la regla hará, no un extracto (reap 2026-09-16): nivel, a qué trabajos, textos y arreglo.
      return [
        `${c.nivel === "sugiere" ? "Sugiere" : c.nivel === "bloquea" ? "Advierte (pedía BLOQUEAR; se aprueba como aviso)" : "Advierte"}${c.kind ? ` (sólo ${s(c.kind)})` : ""} cuando ${s(c.campo)} ${c.patron ? `coincide con /${s(c.patron)}/` : `pasa de ${s(c.umbral)}`}.`,
        `Aviso: «${s(c.que_es)}» / «${s(c.que_en)}».`,
        c.porque_es || c.porque_en ? `Por qué: «${s(c.porque_es ?? "")}» / «${s(c.porque_en ?? "")}».` : null,
        c.arreglo_es || c.arreglo_en ? `Arreglo: «${s(c.arreglo_es ?? "")}» / «${s(c.arreglo_en ?? "")}».` : null,
        c.accion ? `Acción de un click: ${JSON.stringify(c.accion)}.` : null,
      ].filter(Boolean).join(" ");
    case "modelo":
      return `${s(c.etiqueta)} (${s(c.id)}, ${c.rol === "rapido" ? "rápido" : "fino"}) — si es nuevo, pasa a ser el recomendado de ese nivel. ${s(c.como_llegar_es)}`;
    case "limite":
      return `${CAMPO_LIMITE_LABEL[c.campo as CampoLimite] ?? s(c.campo)} → ${s(c.valor)}`;
    case "fortaleza":
      return `${s(c.fortaleza)} → ${s(c.valor)} de 5`;
    case "codigo":
      return s(c.detalle_es);
  }
}

/** Lo que el correo cuenta de una propuesta nueva. */
export type AvisoVigia = { tipo: TipoPropuesta; tool: Tool | null; resumen_es: string; fuente: string };

/** El correo "hay cambios para Prisma" (Pedro, 2026-09-16: avisar cada vez que haya que cambiar algo en la
 *  plataforma). Sólo lo que ya se puede aprobar (oficial, o comunidad con 2 fuentes). Texto plano: la plantilla
 *  lo escapa. Tope de 20 líneas; el resto se cuenta. */
export function correoVigia(nuevas: AvisoVigia[]): { asunto: string; titulo: string; cuerpo: string } | null {
  if (!nuevas.length) return null;
  const n = nuevas.length;
  const codigo = nuevas.filter((a) => a.tipo === "codigo").length;
  const tope = 20;
  const lineas = nuevas.slice(0, tope).map((a) => `• ${TIPO_LABEL[a.tipo]}${a.tool ? ` · ${TOOL_INFO[a.tool].nombre}` : ""}: ${plano(a.resumen_es).slice(0, 300)} (fuente: ${plano(a.fuente).slice(0, 80)})`);
  if (n > tope) lineas.push(`…y ${n - tope} más.`);
  const plural = n === 1 ? "un cambio" : `${n} cambios`;
  return {
    asunto: `Prisma: el vigía encontró ${plural} para revisar`,
    titulo: `El vigía encontró ${plural} en Higgsfield`,
    cuerpo: [
      `Nada se aplica solo: revísalos y apruébalos o descártalos en Hub › Prisma › Vigía.${codigo ? ` ${codigo === 1 ? "Uno necesita" : `${codigo} necesitan`} un cambio en el código (pásaselo a Claude).` : ""}`,
      "",
      ...lineas,
    ].join("\n"),
  };
}
