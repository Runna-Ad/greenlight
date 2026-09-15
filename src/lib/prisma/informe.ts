/**
 * F5a — el INFORME del Hub: lo que la ronda de prueba mide, calculado desde lo que Prisma ya
 * registra (prompts, eventos, resultados, specs). Sin instrumentación nueva: si nadie sube
 * resultados, esa parte sale en cero y se ve. Módulo puro (se prueba en node).
 */
import { avisosDe } from "./diagnostico.ts";
import { CAMPOS_VEREDICTO, fallosDeDetalle, type CampoVeredicto } from "./resultado.ts";

export type FilaPromptInforme = { id: string; spec_id: string; tool: string; modelo_sug: string | null; avisos: unknown; valido: boolean };
export type FilaEventoInforme = { spec_id: string; prompt_id: string | null; tool: string; tipo: string; detalle: string | null; user_id: string | null };
export type FilaResultadoInforme = { id: string; spec_id: string; prompt_id: string | null; tool: string; modelo: string | null; score: number | null; aceptado: boolean };
export type FilaSpecInforme = {
  id: string;
  job: string;
  respuestas: unknown;
  correccion_de: string | null;
  created_by?: string | null;
  /** 0066: una COPIA (otra versión / adaptar / corrección) apunta a su original — no es una idea nueva. */
  origen_spec_id?: string | null;
};

export type Informe = {
  dias: number;
  specs: number;
  prompts: number;
  personas: number;
  porHerramienta: { tool: string; prompts: number; copiados: number; copiadosSinRefinar: number; refinados: number; refinesPorPrompt: number }[];
  avisos: { codigo: string; mostrados: number; aplicados: number }[];
  /** F5c: `porRonda` = ideas por la ronda más alta contestada, y cuántas llegaron a un resultado aceptado. */
  entrevista: { specs: number; conRespuestas: number; respuestas: number; porRonda: { ronda: number; ideas: number; aceptadas: number }[] };
  resultados: {
    subidos: number;
    aceptados: number;
    aceptadosPrimera: number;
    aceptadosTrasCorreccion: number;
    correcciones: number;
    scoreMedio: number | null;
    fallosPorCampo: { campo: CampoVeredicto; n: number }[];
    recomendacionSeguida: { seguida: number; total: number };
  };
};

export function resumirInforme(dias: number, d: { prompts: FilaPromptInforme[]; eventos: FilaEventoInforme[]; resultados: FilaResultadoInforme[]; specs: FilaSpecInforme[] }): Informe {
  const porTool = new Map<string, { prompts: Set<string>; copiados: Set<string>; refinados: number }>();
  const tool = (t: string) => {
    const x = porTool.get(t) ?? { prompts: new Set<string>(), copiados: new Set<string>(), refinados: 0 };
    porTool.set(t, x);
    return x;
  };
  const promptPorId = new Map(d.prompts.map((p) => [p.id, p]));
  for (const p of d.prompts) tool(p.tool).prompts.add(p.id);
  const specsRefinados = new Set<string>();
  const aplicados = new Map<string, number>();
  const fallos = new Map<CampoVeredicto, number>();
  let correcciones = 0;
  // Personas = quien hizo algo con un prompt O quien sólo generó (los specs traen su autor).
  const personas = new Set<string>(d.specs.map((s) => s.created_by).filter((u): u is string => !!u));
  for (const e of d.eventos) {
    if (e.user_id) personas.add(e.user_id);
    if ((e.tipo === "copiado" || e.tipo === "abierto") && e.prompt_id) tool(promptPorId.get(e.prompt_id)?.tool ?? e.tool).copiados.add(e.prompt_id);
    if (e.tipo === "refinado") {
      tool(e.tool).refinados++;
      specsRefinados.add(e.spec_id);
    }
    if (e.tipo === "aviso_aplicado" && e.detalle) aplicados.set(e.detalle, (aplicados.get(e.detalle) ?? 0) + 1);
    if (e.tipo === "resultado_subido") for (const c of fallosDeDetalle(e.detalle)) fallos.set(c, (fallos.get(c) ?? 0) + 1);
    if (e.tipo === "correccion_generada") correcciones++;
  }
  // "Copiado sin refinar" es a nivel de IDEA (spec): si esa idea se refinó alguna vez —antes o después
  // del copiado— no cuenta como "salió bien a la primera". Es la lectura estricta del criterio de F5.
  const porHerramienta = [...porTool.entries()]
    .map(([t, x]) => {
      const copiadosSinRefinar = [...x.copiados].filter((id) => !specsRefinados.has(promptPorId.get(id)?.spec_id ?? "")).length;
      return { tool: t, prompts: x.prompts.size, copiados: x.copiados.size, copiadosSinRefinar, refinados: x.refinados, refinesPorPrompt: x.prompts.size ? Math.round((x.refinados / x.prompts.size) * 100) / 100 : 0 };
    })
    .sort((a, b) => b.prompts - a.prompts);

  // Avisos: mostrados (guardados con cada prompt, sin los internos) vs aplicados (evento).
  const mostrados = new Map<string, number>();
  for (const p of d.prompts) for (const a of avisosDe(p.avisos)) if (!a.interno) mostrados.set(a.codigo, (mostrados.get(a.codigo) ?? 0) + 1);
  const codigos = new Set([...mostrados.keys(), ...aplicados.keys()]);
  const avisos = [...codigos].map((codigo) => ({ codigo, mostrados: mostrados.get(codigo) ?? 0, aplicados: aplicados.get(codigo) ?? 0 })).sort((a, b) => b.mostrados - a.mostrados);

  // Ideas = sólo los specs ORIGINALES: una copia no es una idea nueva ni una entrevista nueva (antes de
  // filaHermana, adaptar copiaba las respuestas y la misma entrevista contaba una vez por formato).
  // `specPorId` (abajo) sí usa TODOS: una corrección es una copia y hace falta para "tras corrección".
  const ideas = d.specs.filter((s) => !s.origen_spec_id);
  const conRespuestas = ideas.filter((s) => Array.isArray(s.respuestas) && s.respuestas.length > 0);
  const respuestas = conRespuestas.reduce((n, s) => n + (s.respuestas as unknown[]).length, 0);
  // F5c: ¿profundizar ayuda? La ronda más alta contestada por idea y si esa idea llegó a un resultado
  // ACEPTADO — en ella o en una copia suya (versión, adaptación, corrección: se sube por origen_spec_id).
  const padre = new Map(d.specs.map((s) => [s.id, s.origen_spec_id ?? null]));
  const raiz = (id: string): string => {
    let x = id;
    for (let i = 0; i < 4; i++) {
      const p = padre.get(x);
      if (!p) break;
      x = p;
    }
    return x;
  };
  const conAceptado = new Set(d.resultados.filter((r) => r.aceptado).map((r) => raiz(r.spec_id)));
  const rondaMax = (s: FilaSpecInforme): number => (Array.isArray(s.respuestas) && s.respuestas.length ? Math.max(1, ...s.respuestas.map((r) => (r && typeof r === "object" && Number.isInteger((r as { ronda?: unknown }).ronda) ? (r as { ronda: number }).ronda : 1))) : 0);
  const porRonda = [1, 2, 3].map((ronda) => {
    const deRonda = ideas.filter((s) => rondaMax(s) === ronda);
    return { ronda, ideas: deRonda.length, aceptadas: deRonda.filter((s) => conAceptado.has(s.id)).length };
  });

  const specPorId = new Map(d.specs.map((s) => [s.id, s]));
  const aceptados = d.resultados.filter((r) => r.aceptado);
  const esCorreccion = (r: FilaResultadoInforme) => !!specPorId.get(r.spec_id)?.correccion_de;
  const scores = d.resultados.map((r) => r.score).filter((s): s is number => typeof s === "number");
  const conModelo = d.resultados.filter((r) => r.modelo && r.modelo !== "otro" && r.prompt_id && promptPorId.get(r.prompt_id)?.modelo_sug);
  const seguida = conModelo.filter((r) => promptPorId.get(r.prompt_id as string)?.modelo_sug === r.modelo).length;

  return {
    dias,
    specs: ideas.length,
    prompts: d.prompts.length,
    personas: personas.size,
    porHerramienta,
    avisos,
    entrevista: { specs: ideas.length, conRespuestas: conRespuestas.length, respuestas, porRonda },
    resultados: {
      subidos: d.resultados.length,
      aceptados: aceptados.length,
      aceptadosPrimera: aceptados.filter((r) => !esCorreccion(r)).length,
      aceptadosTrasCorreccion: aceptados.filter(esCorreccion).length,
      correcciones,
      scoreMedio: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      fallosPorCampo: CAMPOS_VEREDICTO.map((campo) => ({ campo, n: fallos.get(campo) ?? 0 })).filter((f) => f.n > 0).sort((a, b) => b.n - a.n),
      recomendacionSeguida: { seguida, total: conModelo.length },
    },
  };
}
