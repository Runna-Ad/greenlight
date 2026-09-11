/**
 * HÜE Prisma — el DIAGNÓSTICO: avisos antes de generar (y sobre el resultado), cada uno con
 * qué pasa, por qué, el arreglo y, cuando se puede, la acción de UN click. Dos fuentes:
 *   · REGLAS_BASE — lo que depende de constantes del código (duraciones, formatos, refs,
 *     audio por herramienta, movimientos de cámara); no necesitan la BD.
 *   · reglas de `prisma_reglas` (0067) — patrones y umbrales editables en el Hub, con fuente
 *     y fecha; se compilan aquí con `regexSegura` (una regex mala se descarta, nunca tumba
 *     Prisma) y se evalúan sobre el campo que dicen.
 * Los errores del validador y la ortografía entran como avisos del mismo tipo: un solo
 * lenguaje de problemas para el diseñador. Módulo puro (cliente y servidor).
 */
import { ASPECTS, JOB_KIND, contarPalabras, textoDe, type Aspect, type Destino, type JobType, type PromptSpec, type RefRole, type Tool } from "./spec.ts";
import { ASPECTS_POR_TOOL, REFS_MAX, TOOL_AUDIO, TOOL_INFO, TOOLS_POR_JOB, duracionValida } from "./tools.ts";
import { movimientos } from "./camara.ts";
import { regexSegura, CAMPOS, NIVELES, type ReglaCampo, type ReglaNivel } from "./reglas.ts";
import { negativosSinMapear } from "./compilers/nanobanana.ts";
import { t, type Par } from "./copy.ts";
import type { Revision } from "./ortografia.ts";

export type Nivel = ReglaNivel;
export type Arreglo =
  | { tipo: "tool"; tool: Tool }
  | { tipo: "duracion"; segundos: number }
  | { tipo: "aspect"; aspect: Aspect }
  | { tipo: "quitar_texto" }
  | { tipo: "recortar_texto"; palabras: number }
  | { tipo: "soltar_ref"; role: RefRole }
  | { tipo: "prompt_fusion" }
  | { tipo: "usar_personaje" }
  | { tipo: "modelo"; modelo: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "dialogo"; texto: string }
  | { tipo: "nota" };

export type Fuente = { url: string; fecha: string | null; tipo: "oficial" | "comunidad" };
export type Aviso = { codigo: string; nivel: Nivel; que: Par; porque: Par | null; arreglo: Par | null; accion: Arreglo | null; fuente: Fuente | null };

/** Lo que el diagnóstico necesita saber: lo mismo que el wizard tiene en el paso 3 o lo que
 *  un spec ya compilado sabe de sí. `salida` sólo existe en el resultado. */
export type EntradaDiagnostico = {
  job: JobType;
  tool: Tool;
  destino: Destino;
  aspect: Aspect;
  duracion: number | null;
  refs: { role: RefRole }[];
  texto: string | null;
  dialogo: { texto: string; idioma: string } | null;
  movimiento: string | null;
  idea: string;
  salida?: string | null;
};

/** Una regla de la BD tal como viaja al cliente (sin fechas ni ids: serializable y pequeña). */
export type ReglaCliente = {
  codigo: string;
  tool: string | null;
  kind: string | null;
  nivel: string;
  campo: string | null;
  patron: string | null;
  umbral: number | null;
  que_es: string | null;
  que_en: string | null;
  porque_es: string | null;
  porque_en: string | null;
  arreglo_es: string | null;
  arreglo_en: string | null;
  accion: unknown;
  fuente_url: string | null;
  fuente_fecha: string | null;
  fuente_tipo?: string | null;
};

export type ReglaCompilada = {
  codigo: string;
  tool: Tool | null;
  kind: "imagen" | "video" | "edicion" | null;
  nivel: Nivel;
  campo: ReglaCampo;
  re: RegExp | null;
  umbral: number | null;
  que: Par;
  porque: Par | null;
  arreglo: Par | null;
  accion: Arreglo | null;
  fuente: Fuente | null;
};

const ORDEN_NIVEL: Record<Nivel, number> = { bloquea: 0, advierte: 1, sugiere: 2 };
const TOPE_VALOR = 600;
const TOPE_SALIDA = 2000;
const TOPE_TEXTO_AVISO = 300;
const HTTP = /^https?:\/\//i;
const par = (es: string | null | undefined, en: string | null | undefined): Par | null => (es || en ? { es: es || en || "", en: en || es || "" } : null);

/** El jsonb `accion` de una regla → un Arreglo válido, o null (nunca se confía en la forma). */
export function accionDe(raw: unknown): Arreglo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.tipo) {
    case "tool":
      return typeof o.tool === "string" && (Object.keys(TOOL_INFO) as string[]).includes(o.tool) ? { tipo: "tool", tool: o.tool as Tool } : null;
    case "duracion":
      return Number.isFinite(Number(o.segundos)) ? { tipo: "duracion", segundos: Number(o.segundos) } : null;
    case "aspect":
      return typeof o.aspect === "string" && (ASPECTS as string[]).includes(o.aspect) ? { tipo: "aspect", aspect: o.aspect as Aspect } : null;
    case "recortar_texto":
      return Number.isFinite(Number(o.palabras)) && Number(o.palabras) > 0 ? { tipo: "recortar_texto", palabras: Math.round(Number(o.palabras)) } : null;
    case "modelo":
      return typeof o.modelo === "string" && o.modelo.length <= 60 ? { tipo: "modelo", modelo: o.modelo } : null;
    case "quitar_texto":
    case "prompt_fusion":
    case "usar_personaje":
    case "nota":
      return { tipo: o.tipo };
    default:
      return null;
  }
}

/** Una fila → regla lista para evaluar. null si no se puede confiar en ella (regex mala,
 *  campo desconocido…): se descarta con aviso en el log, nunca tumba el diagnóstico. */
export function compilarRegla(r: ReglaCliente): ReglaCompilada | null {
  if (!(CAMPOS as readonly string[]).includes(r.campo ?? "")) return null;
  if (!(NIVELES as readonly string[]).includes(r.nivel)) return null;
  const que = par(r.que_es, r.que_en);
  if (!que) return null;
  let re: RegExp | null = null;
  if (r.patron) {
    const s = regexSegura(r.patron);
    if (!s.ok) {
      console.warn(`[prisma] regla ${r.codigo} descartada: ${s.error}`);
      return null;
    }
    re = s.re;
  }
  if (!re && r.umbral === null) return null;
  const tool = r.tool && (Object.keys(TOOL_INFO) as string[]).includes(r.tool) ? (r.tool as Tool) : null;
  const kind = r.kind === "imagen" || r.kind === "video" || r.kind === "edicion" ? r.kind : null;
  return {
    codigo: r.codigo,
    tool,
    kind,
    nivel: r.nivel as Nivel,
    campo: r.campo as ReglaCampo,
    re,
    umbral: r.umbral,
    que,
    porque: par(r.porque_es, r.porque_en),
    arreglo: par(r.arreglo_es, r.arreglo_en),
    accion: accionDe(r.accion),
    fuente: r.fuente_url ? { url: r.fuente_url, fecha: r.fuente_fecha, tipo: r.fuente_tipo === "comunidad" ? "comunidad" : "oficial" } : null,
  };
}

export const compilarReglas = (filas: ReglaCliente[]): ReglaCompilada[] => filas.map(compilarRegla).filter((r): r is ReglaCompilada => !!r);

/** El valor que una regla mira, según su `campo`. */
function valorDe(e: EntradaDiagnostico, campo: ReglaCampo): string | null {
  switch (campo) {
    case "idea": return e.idea;
    case "texto": return e.texto;
    case "refs": return e.refs.map((r) => r.role).join(" ");
    case "duracion": return e.duracion === null ? null : String(e.duracion);
    case "aspect": return e.aspect;
    case "dialogo.idioma": return e.dialogo?.idioma ?? null;
    case "accion": return JOB_KIND[e.job] === "edicion" ? e.idea : null;
    case "camara": return e.movimiento;
    case "destino": return e.destino;
    case "salida": return e.salida ?? null;
  }
}

/** Cuánto "mide" un campo para el umbral: palabras en texto libre, cantidad en refs, valor en duración. */
function medidaDe(e: EntradaDiagnostico, campo: ReglaCampo, valor: string): number {
  if (campo === "refs") return e.refs.length;
  if (campo === "duracion") return Number(valor);
  return contarPalabras(valor);
}

function evaluar(regla: ReglaCompilada, e: EntradaDiagnostico): Aviso | null {
  if (regla.tool && regla.tool !== e.tool) return null;
  if (regla.kind && regla.kind !== JOB_KIND[e.job]) return null;
  const crudo = valorDe(e, regla.campo);
  if (crudo === null || (regla.campo !== "refs" && !crudo.trim())) return null;
  // La regex corre sobre una entrada ACOTADA: con ≤ 2 repeticiones sin tope por rama
  // (regexSegura) el peor caso es cuadrático sobre 600 / 2,000 letras = microsegundos.
  const valor = crudo.slice(0, regla.campo === "salida" ? TOPE_SALIDA : TOPE_VALOR);
  const empata = (regla.re ? regla.re.test(valor) : true) && (regla.umbral === null ? true : medidaDe(e, regla.campo, crudo) > regla.umbral);
  if (!empata) return null;
  return { codigo: regla.codigo, nivel: regla.nivel, que: regla.que, porque: regla.porque, arreglo: regla.arreglo, accion: regla.accion, fuente: regla.fuente };
}

// ── Reglas base (constantes del código; no dependen de la BD) ─────────────────────────────
const SIN_FUENTE = null;

/** El formato soportado más parecido al pedido (misma orientación si se puede). */
function aspectCercano(tool: Tool, aspect: Aspect): Aspect {
  const soportados = ASPECTS_POR_TOOL[tool];
  if (soportados.includes(aspect)) return aspect;
  const [w, h] = aspect.split(":").map(Number);
  const orientacion = w === h ? "cuadrado" : w > h ? "horizontal" : "vertical";
  const misma = soportados.find((a) => {
    const [aw, ah] = a.split(":").map(Number);
    return (aw === ah ? "cuadrado" : aw > ah ? "horizontal" : "vertical") === orientacion;
  });
  return misma ?? soportados[0];
}

export const REGLAS_BASE: ((e: EntradaDiagnostico) => Aviso | null)[] = [
  // Duración que la herramienta no ofrece.
  (e) => {
    const opciones = TOOL_INFO[e.tool].duraciones;
    if (!opciones.length || e.duracion === null || opciones.includes(e.duracion)) return null;
    const mejor = duracionValida(e.tool, e.duracion);
    return {
      codigo: "duracion_fuera", nivel: "advierte",
      que: t(`${TOOL_INFO[e.tool].nombre} no genera ${e.duracion} s.`, `${TOOL_INFO[e.tool].nombre} does not generate ${e.duracion} s.`),
      porque: t(`Sus duraciones son ${opciones.join(", ")} s.`, `Its durations are ${opciones.join(", ")} s.`),
      arreglo: t(`Usa ${mejor} s.`, `Use ${mejor} s.`), accion: { tipo: "duracion", segundos: mejor }, fuente: SIN_FUENTE,
    };
  },
  // Veo: 8 s obligatorio con referencias.
  (e) => {
    if (e.tool !== "veo" || !e.refs.length || e.duracion === null || e.duracion === 8) return null;
    return {
      codigo: "veo_8s_con_refs", nivel: "advierte",
      que: t("Con imágenes de referencia, Veo sólo genera 8 s.", "With reference images, Veo only generates 8 s."),
      porque: t("Es una regla de Veo 3.1: con referencias, primer/último cuadro o 1080p, la duración se fuerza a 8 s.", "It is a Veo 3.1 rule: with references, first/last frame or 1080p, duration is forced to 8 s."),
      arreglo: t("Deja 8 s.", "Keep 8 s."), accion: { tipo: "duracion", segundos: 8 }, fuente: { url: "https://ai.google.dev/gemini-api/docs/veo", fecha: "2026-09-09", tipo: "oficial" },
    };
  },
  // Formato que la herramienta no acepta.
  (e) => {
    if (ASPECTS_POR_TOOL[e.tool].includes(e.aspect)) return null;
    const mejor = aspectCercano(e.tool, e.aspect);
    return {
      codigo: "aspect_no_soportado", nivel: "advierte",
      que: t(`${TOOL_INFO[e.tool].nombre} no genera en ${e.aspect}.`, `${TOOL_INFO[e.tool].nombre} does not generate ${e.aspect}.`),
      porque: t(`Acepta ${ASPECTS_POR_TOOL[e.tool].join(", ")}.`, `It accepts ${ASPECTS_POR_TOOL[e.tool].join(", ")}.`),
      arreglo: t(`Genera en ${mejor} y recorta en edición.`, `Generate in ${mejor} and crop in editing.`), accion: { tipo: "aspect", aspect: mejor }, fuente: SIN_FUENTE,
    };
  },
  // Más referencias de las que acepta.
  (e) => {
    const max = REFS_MAX[e.tool];
    if (e.refs.length <= max) return null;
    const video = JOB_KIND[e.job] === "video";
    return {
      codigo: "refs_de_mas", nivel: "advierte",
      que: t(`${TOOL_INFO[e.tool].nombre} acepta ${max} referencia(s) y hay ${e.refs.length}.`, `${TOOL_INFO[e.tool].nombre} accepts ${max} reference(s) and there are ${e.refs.length}.`),
      porque: t("Las de más se ignoran o se mezclan mal.", "The extra ones are ignored or blended badly."),
      arreglo: video ? t("Funde dos referencias en una con Nano Banana y sube esa.", "Merge two references into one with Nano Banana and upload that one.") : t("Quita la referencia que menos aporte.", "Remove the reference that adds the least."),
      accion: video ? { tipo: "prompt_fusion" } : { tipo: "soltar_ref", role: e.refs[e.refs.length - 1].role }, fuente: SIN_FUENTE,
    };
  },
  // Diálogo en una herramienta sin voz.
  (e) => {
    if (!e.dialogo?.texto.trim() || TOOL_AUDIO[e.tool]) return null;
    const conVoz = TOOLS_POR_JOB[e.job].find((tl) => TOOL_AUDIO[tl]) ?? null;
    return {
      codigo: "dialogo_sin_voz", nivel: "advierte",
      que: t(`${TOOL_INFO[e.tool].nombre} no genera voz.`, `${TOOL_INFO[e.tool].nombre} does not generate voice.`),
      porque: t("El diálogo que escribiste no se va a oír.", "The dialogue you wrote will not be heard."),
      arreglo: conVoz ? t(`Usa ${TOOL_INFO[conVoz].nombre}, que sí pone voz y sonido.`, `Use ${TOOL_INFO[conVoz].nombre}, which does voice and sound.`) : t("Graba la voz aparte y móntala en edición.", "Record the voice separately and add it in editing."),
      accion: conVoz ? { tipo: "tool", tool: conVoz } : { tipo: "nota" }, fuente: SIN_FUENTE,
    };
  },
  // Texto en pantalla en video: se escribe mal.
  (e) => {
    if (JOB_KIND[e.job] !== "video" || !e.texto?.trim()) return null;
    return {
      codigo: "texto_en_video", nivel: "sugiere",
      que: t("Texto en pantalla en un video.", "On-screen text in a video."),
      porque: t("Los generadores de video escriben letras con errores y las mueven; el texto sale mejor si lo pones en edición.", "Video generators misspell and warp letters; text comes out better added in editing."),
      arreglo: t("Genera sin texto y agrégalo en edición.", "Generate without text and add it in editing."), accion: { tipo: "quitar_texto" }, fuente: SIN_FUENTE,
    };
  },
  // Dos movimientos de cámara (Kling / Higgsfield: uno por clip).
  (e) => {
    if (!e.movimiento || (e.tool !== "kling" && e.tool !== "higgsfield")) return null;
    const m = movimientos(e.movimiento);
    if (m.length < 2) return null;
    return {
      codigo: "dos_movimientos", nivel: "advierte",
      que: t(`Dos movimientos de cámara (${m.join(" y ")}).`, `Two camera moves (${m.join(" and ")}).`),
      porque: t(`${TOOL_INFO[e.tool].nombre} sólo sigue uno por clip; dos deforman la imagen.`, `${TOOL_INFO[e.tool].nombre} follows one per clip; two warp the image.`),
      arreglo: t("Elige uno y deja el otro para otro clip.", "Pick one and leave the other for another clip."), accion: { tipo: "nota" }, fuente: { url: "https://higgsfield.ai/camera-controls", fecha: "2026-09-11", tipo: "oficial" },
    };
  },
];

/** Sin repetidos (gana el primero) y por nivel: bloquea → advierte → sugiere. */
export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return avisos
    .filter((a) => (vistos.has(a.codigo) ? false : (vistos.add(a.codigo), true)))
    .sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
}

/** Antes de generar (cliente, instantáneo): reglas base + reglas de la BD sobre la entrada. */
export function diagnosticarEntrada(e: EntradaDiagnostico, reglas: ReglaCompilada[]): Aviso[] {
  const base = REGLAS_BASE.map((f) => f(e)).filter((a): a is Aviso => !!a);
  const db = reglas.filter((r) => r.campo !== "salida").map((r) => evaluar(r, e)).filter((a): a is Aviso => !!a);
  return ordenarAvisos([...base, ...db]);
}

/** La entrada del diagnóstico a partir de un spec ya escrito. */
export function entradaDeSpec(spec: PromptSpec, tool: Tool = spec.tool, salida: string | null = null): EntradaDiagnostico {
  return {
    job: spec.job, tool, destino: spec.destino ?? "libre", aspect: spec.aspect, duracion: spec.duracion,
    refs: spec.refs.map((r) => ({ role: r.role })), texto: textoDe(spec)?.contenido ?? null,
    dialogo: spec.dialogo?.texto.trim() ? { texto: spec.dialogo.texto, idioma: spec.dialogo.idioma } : null,
    movimiento: spec.camara.movimiento, idea: spec.idea, salida,
  };
}

/** Sobre el resultado: entrada + reglas (incluidas las de `salida`) + errores del validador +
 *  cuántos "qué evitar" quedaron sin volverse positivos. */
export function diagnosticar(spec: PromptSpec, tool: Tool, salida: string, errores: string[], reglas: ReglaCompilada[]): Aviso[] {
  const e = entradaDeSpec(spec, tool, salida);
  const base = REGLAS_BASE.map((f) => f(e)).filter((a): a is Aviso => !!a);
  const db = reglas.map((r) => evaluar(r, e)).filter((a): a is Aviso => !!a);
  const validador: Aviso[] = errores.map((err, i) => ({ codigo: `validador_${i + 1}`, nivel: "advierte", que: { es: err, en: err }, porque: null, arreglo: null, accion: null, fuente: null }));
  const sinMapear = tool === "nanobanana" || tool === "chatgpt" ? negativosSinMapear({ ...spec, tool }) : 0;
  const positivos: Aviso[] = sinMapear
    ? [{ codigo: "negativos_sin_mapear", nivel: "sugiere", que: t(`${sinMapear} cosa(s) a evitar quedaron como "Avoid".`, `${sinMapear} thing(s) to avoid stayed as "Avoid".`), porque: t("Esta herramienta no tiene campo negativo; lo que se pide en positivo sale mejor.", "This tool has no negative field; positive phrasing works better."), arreglo: t("Si se repite, se añade al mapa de positivos.", "If it repeats, it gets added to the positives map."), accion: null, fuente: null }]
    : [];
  return ordenarAvisos([...base, ...db, ...validador, ...positivos]);
}

/** La ortografía como aviso (misma tarjeta, mismo botón de arreglo). */
export function avisoOrtografia(campo: "texto" | "dialogo", original: string, rev: Revision): Aviso | null {
  if (!rev.cambios.length || rev.sugerido === original) return null;
  const motivos = rev.cambios.slice(0, 4).map((c) => `${c.de} → ${c.a}`).join(" · ");
  return {
    codigo: `ortografia_${campo}`, nivel: "advierte",
    que: t(`H.Ü.E sugiere: «${rev.sugerido}»`, `H.Ü.E suggests: “${rev.sugerido}”`),
    porque: { es: motivos, en: motivos },
    arreglo: t(campo === "texto" ? "El texto se pinta letra por letra: mejor que salga bien escrito." : "El diálogo se dice tal cual: mejor que salga bien escrito.", campo === "texto" ? "The text is rendered letter by letter: better to get it right." : "The dialogue is spoken as written: better to get it right."),
    accion: { tipo: campo, texto: rev.sugerido }, fuente: null,
  };
}

/** El jsonb `avisos` guardado con un prompt → Aviso[] de verdad. Nunca se confía en la forma
 *  (una fila la pudo escribir otra cosa): lo que no cuadra se descarta, las cadenas se acotan
 *  y una fuente sin http(s) se quita. */
export function avisosDe(raw: unknown): Aviso[] {
  if (!Array.isArray(raw)) return [];
  const out: Aviso[] = [];
  const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.replace(/[\p{Cc}\p{Cf}]+/gu, " ").trim().slice(0, TOPE_TEXTO_AVISO) : null);
  const parDe = (v: unknown): Par | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const es = texto(o.es);
    const en = texto(o.en);
    return es || en ? { es: es || en || "", en: en || es || "" } : null;
  };
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const codigo = typeof o.codigo === "string" && /^[a-z0-9_]{3,60}$/.test(o.codigo) ? o.codigo : null;
    const nivel = o.nivel === "bloquea" || o.nivel === "advierte" || o.nivel === "sugiere" ? o.nivel : null;
    const que = parDe(o.que);
    if (!codigo || !nivel || !que) continue;
    const f = o.fuente && typeof o.fuente === "object" ? (o.fuente as Record<string, unknown>) : null;
    const fuente: Fuente | null = f && typeof f.url === "string" && HTTP.test(f.url) ? { url: f.url.slice(0, 300), fecha: typeof f.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha) ? f.fecha : null, tipo: f.tipo === "comunidad" ? "comunidad" : "oficial" } : null;
    out.push({ codigo, nivel, que, porque: parDe(o.porque), arreglo: parDe(o.arreglo), accion: accionDe(o.accion) ?? accionTexto(o.accion), fuente });
  }
  return out;
}

/** Los arreglos con texto (ortografía) no pasan por accionDe (nacen en el cliente): se acotan aquí. */
function accionTexto(raw: unknown): Arreglo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ((o.tipo === "texto" || o.tipo === "dialogo") && typeof o.texto === "string" && o.texto.trim()) return { tipo: o.tipo, texto: o.texto.replace(/[\p{Cc}\p{Cf}]+/gu, " ").trim().slice(0, 600) };
  if (o.tipo === "soltar_ref" && typeof o.role === "string" && /^[a-z0-9_]{2,20}$/.test(o.role)) return { tipo: "soltar_ref", role: o.role as RefRole };
  return null;
}

/** Aplica un arreglo a la entrada: devuelve SÓLO lo que cambia (el wizard lo vuelca en su
 *  estado). Puro e idempotente: aplicar dos veces = una. */
export function aplicarArreglo(e: EntradaDiagnostico, a: Arreglo): Partial<EntradaDiagnostico> {
  switch (a.tipo) {
    case "tool": return TOOLS_POR_JOB[e.job].includes(a.tool) ? { tool: a.tool } : {};
    case "duracion": return { duracion: a.segundos };
    case "aspect": return { aspect: a.aspect };
    case "quitar_texto": return { texto: null };
    case "recortar_texto": return e.texto ? { texto: e.texto.split(/\s+/).slice(0, a.palabras).join(" ") } : {};
    case "soltar_ref": return { refs: e.refs.filter((r) => r.role !== a.role) };
    case "texto": return { texto: a.texto };
    case "dialogo": return e.dialogo ? { dialogo: { ...e.dialogo, texto: a.texto } } : {};
    case "prompt_fusion":
    case "usar_personaje":
    case "modelo":
    case "nota":
      return {};
  }
}

/** ¿Hay algo que impida generar? */
export const bloqueado = (avisos: Aviso[]): Aviso | null => avisos.find((a) => a.nivel === "bloquea") ?? null;
