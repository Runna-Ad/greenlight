import { JOB_KIND, TOOLS, type JobType, type Tool } from "./spec.ts";
import { plano, cercadoMultilinea } from "./texto.ts";
import { pares, PREGUNTA_IDS } from "./entrevista.ts";
import type { PrismaVariante } from "../database.types.ts";

/**
 * HÜE Prisma — APRENDIZAJE automático. De lo que los diseñadores HACEN con los prompts de
 * una marca (copiar, abrir en la herramienta, pedir otra versión, pedir un cambio, pulgar)
 * se destila, sin modelo y sin curaduría, lo que el writer debe saber la próxima vez:
 *   1) GANADORES: prompts que sirvieron (se copiaron / se abrieron / pulgar arriba, y sin
 *      pulgar abajo), del mismo trabajo primero; entran como ejemplares de estructura.
 *   2) PREFERENCIAS: qué versión suelen pedir y qué cambios piden últimamente.
 * Módulo puro (se prueba en node); las consultas viven en data.ts.
 */

export type EventoRow = { spec_id: string; prompt_id: string | null; job: string; tool: string; variante: string; tipo: string; detalle: string | null; created_at: string; /** F3: quién (para no confundir "la marca" con "una persona cuatro veces"). */ user_id?: string | null };
export type PromptCandidato = { id: string; spec_id: string; job: string; tool: string; variante: string; salida: string; valido: boolean };
export type Voto = { prompt_id: string; score: number };

export type Ganador = { tool: Tool; variante: PrismaVariante; salida: string };
/** `versiones` es una frase CALCULADA (porcentajes); `cambios` son textos de PERSONAS: van
 *  crudos aquí y se cercan al interpolar (prompts/writer.ts). */
export type Aprendizaje = {
  ganadores: Ganador[];
  versiones: string | null;
  cambios: string[];
  /** F3: frase CALCULADA con lo que esta marca siempre responde en la entrevista (o null). */
  respuestas: string | null;
  /** F3: ids de pregunta que ya no hace falta hacer (la marca siempre responde igual). */
  yaSabidas: string[];
};

export const MAX_GANADORES = 3;
/** Un ganador entra recortado: es referencia de estructura, no un prompt para copiar. */
export const MAX_CHARS_GANADOR = 500;
/** Con menos versiones pedidas no hay preferencia que valga la pena afirmar. */
export const MIN_VERSIONES_PARA_PREFERENCIA = 3;
export const MAX_CAMBIOS_RECIENTES = 5;
/** Una respuesta se "sabe" cuando se repite ≥ 4 veces en las últimas 10 de esa pregunta Y la
 *  dieron al menos 2 personas distintas (o una sola ≥ 6 veces): "la marca" no es "yo, cuatro veces". */
export const RESPUESTAS_VENTANA = 10;
export const RESPUESTAS_MIN_REPETIDAS = 4;
export const RESPUESTAS_MIN_PERSONAS = 2;
export const RESPUESTAS_MIN_UNA_PERSONA = 6;

const NOMBRE_VERSION: Record<string, string> = { segura: "safe", audaz: "bold", minima: "minimal" };
const VARIANTES = new Set(["base", "segura", "audaz", "minima"]);
/** Sólo herramientas y versiones que la app conoce: la columna `tool` no tiene check en la BD. */
const esCandidatoSano = (p: PromptCandidato): boolean => (TOOLS as string[]).includes(p.tool) && VARIANTES.has(p.variante);

export const hayAprendizaje = (a: Aprendizaje | null): a is Aprendizaje => !!a && (a.ganadores.length > 0 || !!a.versiones || a.cambios.length > 0 || !!a.respuestas);

/** Eventos (más recientes primero) + prompts recientes del cliente + votos → Aprendizaje. */
export function resumirAprendizaje(job: JobType, eventos: EventoRow[], prompts: PromptCandidato[], votos: Voto[]): Aprendizaje {
  const malos = new Set(votos.filter((v) => v.score < 0).map((v) => v.prompt_id));
  const buenos = votos.filter((v) => v.score > 0).map((v) => v.prompt_id);

  // 1) Ganadores. Orden de llegada = recencia (los eventos vienen del más nuevo al más viejo).
  const usados: string[] = [];
  for (const e of eventos) {
    if ((e.tipo === "copiado" || e.tipo === "abierto") && e.prompt_id && !usados.includes(e.prompt_id)) usados.push(e.prompt_id);
  }
  for (const id of buenos) if (!usados.includes(id)) usados.push(id);
  const porId = new Map(prompts.map((p) => [p.id, p]));
  const candidatos = usados
    .map((id) => porId.get(id))
    .filter((p): p is PromptCandidato => !!p && !malos.has(p.id) && p.valido && p.salida.trim().length > 0 && esCandidatoSano(p));
  const kind = JOB_KIND[job];
  const rango = (p: PromptCandidato): number => (p.job === job ? 0 : JOB_KIND[p.job as JobType] === kind ? 1 : 2);
  // sort es estable: dentro del mismo rango se conserva la recencia.
  const ordenados = [...candidatos].sort((a, b) => rango(a) - rango(b));
  const vistos = new Set<string>();
  const ganadores: Ganador[] = [];
  for (const p of ordenados) {
    if (vistos.has(p.spec_id)) continue; // un spec refinado 4 veces no cuenta 4 veces
    vistos.add(p.spec_id);
    // Multilínea a propósito: un ganador enseña ESTRUCTURA (tomas, JSON), no una frase.
    ganadores.push({ tool: p.tool as Tool, variante: p.variante as PrismaVariante, salida: cercadoMultilinea(p.salida).slice(0, MAX_CHARS_GANADOR) });
    if (ganadores.length >= MAX_GANADORES) break;
  }

  // 2) Preferencias.
  let versiones: string | null = null;
  const pedidas = eventos.filter((e) => e.tipo === "variante" && !!e.detalle && e.detalle in NOMBRE_VERSION);
  if (pedidas.length >= MIN_VERSIONES_PARA_PREFERENCIA) {
    const cuenta = new Map<string, number>();
    for (const e of pedidas) cuenta.set(e.detalle as string, (cuenta.get(e.detalle as string) ?? 0) + 1);
    const partes = [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([v, n]) => `${NOMBRE_VERSION[v]} ${Math.round((n / pedidas.length) * 100)}%`);
    versiones = `When they ask for another version, this brand's designers choose: ${partes.join(", ")}. Lean that way from the start.`;
  }
  const cambios = eventos
    .filter((e) => e.tipo === "refinado" && !!e.detalle)
    .map((e) => plano(e.detalle as string).slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_CAMBIOS_RECIENTES);

  // 3) Respuestas de la entrevista: si una pregunta se responde igual ≥ 4 de las últimas 10
  // veces, la marca "ya la sabe": el writer la asume y la entrevista deja de hacerla.
  const { respuestas, yaSabidas } = patronRespuestas(eventos);

  return { ganadores, versiones, cambios, respuestas, yaSabidas };
}

/** De los eventos `respondido` (más recientes primero) → lo que la marca siempre contesta. */
export function patronRespuestas(eventos: EventoRow[]): { respuestas: string | null; yaSabidas: string[] } {
  const porId = new Map<string, { valor: string; quien: string }[]>();
  for (const e of eventos) {
    if (e.tipo !== "respondido") continue;
    // pares() ya filtra por PREGUNTA_IDS; se repite aquí por si el detalle viene de otro sitio.
    for (const { id, valor } of pares(e.detalle)) {
      if (!(PREGUNTA_IDS as readonly string[]).includes(id)) continue;
      const lista = porId.get(id) ?? [];
      if (lista.length < RESPUESTAS_VENTANA) lista.push({ valor: valor.toLowerCase().slice(0, 60), quien: e.user_id ?? "?" });
      porId.set(id, lista);
    }
  }
  const asumidas: { id: string; valor: string }[] = [];
  for (const [id, lista] of porId) {
    const cuenta = new Map<string, { n: number; personas: Set<string> }>();
    for (const { valor, quien } of lista) {
      const c = cuenta.get(valor) ?? { n: 0, personas: new Set<string>() };
      c.n++;
      c.personas.add(quien);
      cuenta.set(valor, c);
    }
    const [valor, c] = [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? ["", { n: 0, personas: new Set<string>() }];
    if (c.n >= RESPUESTAS_MIN_REPETIDAS && (c.personas.size >= RESPUESTAS_MIN_PERSONAS || c.n >= RESPUESTAS_MIN_UNA_PERSONA)) asumidas.push({ id, valor });
  }
  if (!asumidas.length) return { respuestas: null, yaSabidas: [] };
  // Tope: una id por pregunta posible, y la frase acotada (los valores los eligió una persona:
  // cercados al interpolar en el writer).
  const pocas = asumidas.slice(0, PREGUNTA_IDS.length);
  const frase = `When asked, this brand's designers always answer: ${pocas.map((a) => `${a.id} → "${plano(a.valor).slice(0, 60)}"`).join("; ")}. Assume these unless the idea says otherwise.`.slice(0, 600);
  return { respuestas: frase, yaSabidas: pocas.map((a) => a.id) };
}
