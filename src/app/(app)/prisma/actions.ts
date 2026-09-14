"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { analizarReferencia } from "@/lib/prisma/vision";
import { escribirSpec, refinarSpec, variarSpec, recompilar, explicarPrompt, describirPersonajeIA, estableCon, versionCon, juzgarSpec, revisarTexto, preguntarFaltante, PROMPT_VERSION, type Uso } from "@/lib/prisma/writer";
import { avisosDe, bloqueado, diagnosticar, diagnosticarEntrada, type Aviso } from "@/lib/prisma/diagnostico";
import { idiomaDe, revisarAcentos, type Cambio, type Idioma } from "@/lib/prisma/ortografia";
import { aplicarRespuestas, detalleRespuestas, necesitaEntrevista, sanearRespuestas, type Pregunta, type Respuesta } from "@/lib/prisma/entrevista";
import type { EntradaWriter } from "@/lib/prisma/prompts/writer";
import { plano } from "@/lib/prisma/texto";
import { cargarAprendizaje, cargarMarcas, cargarPersonajes, cargarReglas, firmar } from "@/lib/prisma/data";
import { ASPECTS, DESTINOS, JOB_KIND, JOBS_POR_KIND, NOMBRE_HISTORICO, REFS_POR_JOB, VIDEO_TYPES, TOOLS, type Aspect, type Destino, type JobType, type PromptSpec, type RefRole, type Tool, type VisualDNA } from "@/lib/prisma/spec";
import { t, type Par } from "@/lib/prisma/copy";
import { TOOL_INFO, TOOLS_POR_JOB } from "@/lib/prisma/tools";
import { PRISMA_VARIANTES_PEDIBLES, type PrismaCharacterRow, type PrismaEventoTipo, type PrismaPromptRow, type PrismaRefGuardada, type PrismaVariante } from "@/lib/database.types";
import { personajeUI, type PersonajeUI } from "@/lib/prisma/personajes";
import { pistasModelo, recomendarModelo } from "@/lib/prisma/modelo";
import type { Salida } from "@/lib/prisma/compilers";
// Lo compartido con resultado-actions.ts (gate, freno, saneos, subir imagen, guardar prompt…):
// UNA implementación para las dos familias de acciones.
import { CODIGO_AVISO, FRENO, RUTA_REF, UUID, anotarEvento, diagnosticoDe, entradaDesdeSpec, estadoActual, fallo, gate, guardarPrompt, leerImagen, puedeTocar, reglasDe, s0, saturado, sn, specDeFila, subirAlBucket, ultimoResultadoDe, type Fail, type ResultadoVivo } from "./comun";

// ── 1) Subir + leer una referencia ──────────────────────────
export type RefAnalizada = {
  ok: true;
  storage_path: string;
  url: string;
  caption: string | null;
  dna: VisualDNA | null;
  /** Si la imagen subió pero H.Ü.E no pudo leerla, va el motivo (la referencia sirve igual). */
  aviso: string | null;
};

export async function analizarImagen(form: FormData): Promise<RefAnalizada | Fail> {
  const g = await gate();
  if ("ok" in g) return g;

  // Subida a storage + visión (facturable): mismo freno que el resto, con su cubo.
  if (saturado(g.soyId, Date.now(), "vision", 30)) return FRENO;
  const img = await leerImagen(form);
  if ("ok" in img) return img;
  const { bytes, mime } = img;

  const db = supabaseAdmin();
  const path = await subirAlBucket(db, "prisma", bytes, mime);
  if (typeof path !== "string") return path;

  const [urls, vision] = await Promise.all([
    firmar(db, [path]),
    analizarReferencia(Buffer.from(bytes).toString("base64"), mime),
  ]);
  const url = urls.get(path) ?? "";
  if (!vision.ok) {
    // El error crudo del proveedor va al log; al navegador, una frase (regla de la casa).
    console.warn(`[prisma] visión no leyó la referencia: ${vision.error}`);
    return { ok: true, storage_path: path, url, caption: null, dna: null, aviso: "H.Ü.E no pudo leer la imagen; la referencia sirve igual." };
  }
  return { ok: true, storage_path: path, url, caption: vision.vision.caption, dna: vision.vision.dna, aviso: null };
}

// ── 2) Generar el prompt ─────────────────────────────────────
export type RefEntrada = { role: RefRole; storage_path: string; caption: string | null; dna: VisualDNA | null };

export type InputGenerar = {
  job: JobType;
  tool: Tool;
  idea: string;
  destino: Destino;
  aspect: Aspect;
  duracion: number | null;
  refs: RefEntrada[];
  look: { luz: string | null; movimiento: string | null; lente: string | null; mood: string | null; estilo: string | null };
  dialogo: { texto: string; idioma: string; voz: string | null } | null;
  marcaId: string | null;
  personajeId: string | null;
  videoType: string | null;
  /** Texto que debe verse en la pieza (campo propio del wizard). */
  texto: string | null;
  /** F2: códigos de los avisos cuyo arreglo el diseñador aplicó ANTES de generar (evento aviso_aplicado). */
  avisosAplicados?: string[];
  /** F3: respuestas de la entrevista (chips o texto libre). */
  respuestas?: Respuesta[];
  /** F3: el diseñador pidió "sin preguntas" (preferencia local). */
  sinPreguntas?: boolean;
};

export type ResultadoGenerar = {
  ok: true;
  specId: string;
  promptId: string;
  spec: PromptSpec;
  salida: Salida;
  valido: boolean;
  errores: string[];
  usage: Uso;
  reparado: boolean;
  /** Cuánto aprendizaje de la marca entró a esta generación (para decírselo al diseñador). */
  aprendio: { ganadores: number; preferencias: number };
  /** F2: diagnóstico del resultado (reglas + validador + juicio de H.Ü.E en video). */
  avisos: Aviso[];
};

const ROLES_REF: RefRole[] = ["sujeto", "producto", "outfit", "pose", "escena", "objeto", "logo", "estilo", "empaque", "personaje2", "inicio", "fin"];
const JOBS_OFRECIDOS = new Set<JobType>(Object.values(JOBS_POR_KIND).flat());
const IDIOMAS_DIALOGO = ["es-MX", "en"] as const;

/** Sanea el ADN que viene del cliente (no se confía en él aunque lo haya escrito H.Ü.E). */
function dnaLimpio(v: unknown): VisualDNA | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  // La lista Y cada ítem con tope: sin esto, 6 strings de megabytes entrarían al prompt y al jsonb.
  const paleta = Array.isArray(o.paleta) ? o.paleta.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 6) : [];
  const d: VisualDNA = { luz: s0(o.luz, 200), lente: s0(o.lente, 200), paleta, mood: s0(o.mood, 100), composicion: s0(o.composicion, 200), textura: s0(o.textura, 200) };
  return d.luz || d.lente || d.mood ? d : null;
}

/** Valida y normaliza la entrada del wizard. Fail-closed: nada se completa con un default
 *  silencioso si el valor viene mal (lección 2026-09-02, "default en write-path"). */
function normalizar(raw: InputGenerar): InputGenerar | Fail {
  // Sólo los trabajos que el wizard OFRECE: `correccion` (F4) nace en el servidor, nunca del navegador.
  if (!(raw.job in JOB_KIND) || !JOBS_OFRECIDOS.has(raw.job)) return { ok: false, error: "Ese tipo de trabajo no existe." };
  if (!TOOLS.includes(raw.tool) || !TOOLS_POR_JOB[raw.job].includes(raw.tool)) return { ok: false, error: "Esa herramienta no sirve para este trabajo." };
  if (!ASPECTS.includes(raw.aspect)) return { ok: false, error: "Formato no válido." };
  if (!DESTINOS.includes(raw.destino)) return { ok: false, error: "Destino no válido." };
  const videoType = sn(raw.videoType, 60);
  if (videoType && !(VIDEO_TYPES as string[]).includes(videoType)) return { ok: false, error: "Tipo de video no válido." };
  const refs: RefEntrada[] = [];
  const rolesDelJob = REFS_POR_JOB[raw.job].map((s) => s.role);
  for (const r of raw.refs ?? []) {
    if (!ROLES_REF.includes(r.role) || !rolesDelJob.includes(r.role)) return { ok: false, error: "Una de las referencias no es válida para este trabajo." };
    if (typeof r.storage_path !== "string" || !RUTA_REF.test(r.storage_path)) return { ok: false, error: "Referencia inválida." };
    refs.push({ role: r.role, storage_path: r.storage_path, caption: sn(r.caption), dna: dnaLimpio(r.dna) });
  }
  if (refs.length > 4) return { ok: false, error: "Puedes subir hasta 4 referencias." };
  const dur = raw.duracion === null || raw.duracion === undefined ? null : Number(raw.duracion);
  if (dur !== null && (!Number.isFinite(dur) || dur < 1 || dur > 60)) return { ok: false, error: "Duración no válida." };
  return {
    job: raw.job,
    tool: raw.tool,
    idea: s0(raw.idea),
    destino: raw.destino,
    aspect: raw.aspect,
    duracion: dur,
    refs,
    look: {
      luz: sn(raw.look?.luz),
      movimiento: sn(raw.look?.movimiento),
      lente: sn(raw.look?.lente),
      mood: sn(raw.look?.mood),
      estilo: sn(raw.look?.estilo),
    },
    dialogo: raw.dialogo && s0(raw.dialogo.texto, 600) ? { texto: s0(raw.dialogo.texto, 600), idioma: (IDIOMAS_DIALOGO as readonly string[]).includes(raw.dialogo.idioma) ? raw.dialogo.idioma : "es-MX", voz: sn(raw.dialogo.voz, 120) } : null,
    marcaId: sn(raw.marcaId, 64),
    personajeId: sn(raw.personajeId, 64),
    videoType,
    texto: sn(raw.texto, 200),
    avisosAplicados: Array.isArray(raw.avisosAplicados) ? [...new Set(raw.avisosAplicados.filter((c): c is string => typeof c === "string" && CODIGO_AVISO.test(c)))].slice(0, 10) : [],
    respuestas: sanearRespuestas(raw.respuestas),
    sinPreguntas: raw.sinPreguntas === true,
  };
}

async function entradaDe(inp: InputGenerar): Promise<{ entrada: EntradaWriter; clientId: string | null } | Fail> {
  const db = supabaseAdmin();
  let marca: EntradaWriter["marca"] = null;
  let clientId: string | null = null;
  if (inp.marcaId) {
    const m = (await cargarMarcas(db)).find((x) => x.id === inp.marcaId);
    if (!m) return { ok: false, error: "Esa marca ya no existe." };
    marca = m.preset;
    clientId = m.client_id;
  }
  let personaje: string | null = null;
  if (inp.personajeId) {
    // Un personaje pertenece a UN cliente: sin marca (→ sin cliente) no hay forma de
    // comprobar que sea suyo, así que no se acepta (no se cargan los de todos).
    if (!clientId) return { ok: false, error: "Primero elige la marca para usar un personaje guardado." };
    const p = (await cargarPersonajes(db, clientId)).find((x) => x.id === inp.personajeId);
    if (!p) return { ok: false, error: "Ese personaje ya no existe." };
    personaje = p.descripcion;
  }
  // Las respuestas de la entrevista con `campo` llenan el wizard desde el CÓDIGO: la luz, la
  // duración, el formato o el idioma no dependen de que el modelo "las lea".
  const respuestas = inp.respuestas ?? [];
  // Sólo el look: formato, duración e idioma los decide el wizard (ya llegan aplicados desde el
  // cliente, y un destino elegido DESPUÉS de la entrevista manda sobre la respuesta).
  const con = aplicarRespuestas({ look: inp.look, duracion: inp.duracion, aspect: inp.aspect, dialogoIdioma: inp.dialogo?.idioma ?? null }, respuestas, "look");
  return {
    clientId,
    entrada: {
      job: inp.job,
      tool: inp.tool,
      idea: inp.idea,
      destino: inp.destino,
      aspect: con.aspect,
      duracion: con.duracion,
      refs: inp.refs.map((r) => ({ role: r.role, caption: r.caption, dna: r.dna })),
      look: con.look,
      dialogo: inp.dialogo ? { ...inp.dialogo, idioma: con.dialogoIdioma ?? inp.dialogo.idioma } : null,
      marca,
      personaje,
      videoType: inp.videoType,
      texto: inp.texto,
      aprendizaje: null, // se llena en generarPrompt (necesita el cliente)
      respuestas: respuestas.map((r) => ({ id: r.id, valor: r.valor })),
    },
  };
}

export async function generarPrompt(raw: InputGenerar): Promise<ResultadoGenerar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (saturado(g.soyId)) return FRENO;
  const inp = normalizar(raw);
  if ("ok" in inp) return inp;
  const ent = await entradaDe(inp);
  if ("ok" in ent) return ent;

  const db = supabaseAdmin();
  // Aprendizaje automático: lo que ya sirvió para esta marca (y lo que sus diseñadores piden)
  // entra al writer en cada generación, sin que nadie lo cure.
  // El conocimiento vivo (TOOL NOTES) va en el bloque cacheado; en paralelo con el aprendizaje.
  const [aprendizaje, reglas] = await Promise.all([ent.clientId ? cargarAprendizaje(db, ent.clientId, inp.job) : Promise.resolve(null), cargarReglas(db)]);
  // Un aviso que BLOQUEA se impone aquí, no sólo en el navegador, y antes de pagar la llamada.
  // Con los valores YA aplicados (las respuestas de la entrevista pueden cambiar formato, duración o movimiento).
  const bloqueo = bloqueado(diagnosticarEntrada({ job: inp.job, tool: inp.tool, destino: inp.destino, aspect: ent.entrada.aspect, duracion: ent.entrada.duracion, refs: inp.refs.map((r) => ({ role: r.role })), texto: inp.texto, dialogo: ent.entrada.dialogo ? { texto: ent.entrada.dialogo.texto, idioma: ent.entrada.dialogo.idioma } : null, movimiento: ent.entrada.look.movimiento, idea: inp.idea }, reglasDe(reglas)));
  if (bloqueo) return { ok: false, error: bloqueo.que.es };
  // "Úsalo en…": el modelo/nivel donde se va a pegar; el writer dimensiona el spec para él.
  const modelo = recomendarModelo({ job: inp.job, tool: inp.tool, destino: inp.destino, refs: inp.refs.length, texto: !!inp.texto?.trim(), dialogo: !!inp.dialogo?.texto.trim(), duracion: inp.duracion }).modelo;
  const r = await escribirSpec({ ...ent.entrada, aprendizaje, modelo }, estableCon(reglas.notas, reglas.clave), reglasDe(reglas));
  if (!r.ok) return r;

  const refsGuardadas: PrismaRefGuardada[] = inp.refs.map((x) => ({ role: x.role, storage_path: x.storage_path, caption: x.caption, dna: x.dna as Record<string, unknown> | null }));
  const { data: specRow, error } = await db
    .from("prisma_specs")
    .insert({ client_id: ent.clientId, marca_id: inp.marcaId, job: inp.job, tool: inp.tool, destino: inp.destino, idea: inp.idea, spec: r.spec, refs: refsGuardadas, created_by: g.soyId, respuestas: inp.respuestas ?? [] })
    .select("id")
    .single<{ id: string }>();
  if (error || !specRow) return fallo("prisma_specs.insert", error?.message);

  // Se guarda el modelo calculado sobre el spec RESULTANTE (el modelo puede inferir texto en la
  // pieza desde la idea): es exactamente lo que el resultado le enseña al diseñador.
  const avisos = await diagnosticoDe(r.spec, inp.tool, r.salida, r.errores, reglasDe(reglas), { ...ent.entrada, aprendizaje, modelo });
  const promptId = await guardarPrompt(specRow.id, inp.tool, r.salida, r.valido, r.errores, r.usage, "base", versionCon(reglas.clave), recomendarModelo(pistasModelo(r.spec, inp.tool)).modelo, avisos);
  if (typeof promptId !== "string") return promptId;
  // Lo que contestó en la entrevista: con esto la marca "aprende" sus respuestas fijas.
  if (inp.respuestas?.length) {
    await anotarEvento(db, { spec_id: specRow.id, prompt_id: promptId, client_id: ent.clientId, job: inp.job, tool: inp.tool, variante: "base", user_id: g.soyId, tipo: "respondido", detalle: detalleRespuestas(inp.respuestas) });
  }
  // Los arreglos que el diseñador aplicó ANTES de generar: señal de qué avisos ayudan (un solo insert).
  if (inp.avisosAplicados?.length) {
    const { error: evError } = await db.from("prisma_eventos").insert(inp.avisosAplicados.map((codigo) => ({ spec_id: specRow.id, prompt_id: promptId, client_id: ent.clientId, job: inp.job, tool: inp.tool, variante: "base" as PrismaVariante, user_id: g.soyId, tipo: "aviso_aplicado" as PrismaEventoTipo, detalle: codigo })));
    if (evError) console.warn(`[prisma] avisos aplicados no registrados: ${evError.message}`);
  }

  return { ok: true, specId: specRow.id, promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, usage: r.usage, reparado: r.reparado, aprendio: { ganadores: aprendizaje?.ganadores.length ?? 0, preferencias: (aprendizaje?.versiones ? 1 : 0) + (aprendizaje?.cambios.length ? 1 : 0) }, avisos };
}

// ── 3) Misma idea, otra herramienta (sin modelo) ─────────────
export type ResultadoRecompilar = { ok: true; promptId: string; salida: Salida; valido: boolean; errores: string[]; variante: PrismaVariante; avisos: Aviso[] };

export async function cambiarHerramienta(specId: string, tool: Tool): Promise<ResultadoRecompilar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (!TOOLS.includes(tool)) return { ok: false, error: "Herramienta no válida." };
  // No llama al modelo, pero guarda una fila por click: el mismo freno evita el goteo infinito.
  if (saturado(g.soyId)) return FRENO;
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  if (!TOOLS_POR_JOB[s.spec.job].includes(tool)) return { ok: false, error: "Esa herramienta no sirve para este trabajo." };

  const r = recompilar(s.spec, tool);
  // La versión (audaz, mínima…) se hereda: cambiar de herramienta no la vuelve "base".
  const db = supabaseAdmin();
  const [{ variante }, reglas] = await Promise.all([estadoActual(db, s), cargarReglas(db)]);
  const avisos = await diagnosticoDe(s.spec, tool, r.salida, r.errores, reglasDe(reglas), null);
  const promptId = await guardarPrompt(specId, tool, r.salida, r.valido, r.errores, null, variante, PROMPT_VERSION, recomendarModelo(pistasModelo(s.spec, tool)).modelo, avisos);
  if (typeof promptId !== "string") return promptId;
  return { ok: true, promptId, salida: r.salida, valido: r.valido, errores: r.errores, variante, avisos };
}

// ── 4) Refinar ("que sea de día") ────────────────────────────
export type ResultadoRefinar = { ok: true; promptId: string; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; usage: Uso; avisos: Aviso[] };

export async function refinarPrompt(specId: string, cambio: string): Promise<ResultadoRefinar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (saturado(g.soyId)) return FRENO;
  const texto = plano(s0(cambio, 600));
  if (!texto) return { ok: false, error: "Escribe qué quieres cambiar." };
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;

  const db = supabaseAdmin();
  const [{ tool, variante }, reglas] = await Promise.all([estadoActual(db, s), cargarReglas(db)]);
  const spec = { ...s.spec, tool };
  const modelo = recomendarModelo(pistasModelo(spec)).modelo;
  const r = await refinarSpec({ ...entradaDesdeSpec(s), tool, modelo }, spec, texto, estableCon(reglas.notas, reglas.clave), reglasDe(reglas));
  if (!r.ok) return r;

  const { error } = await db.from("prisma_specs").update({ spec: r.spec }).eq("id", specId);
  if (error) return fallo("prisma_specs.update", error.message);
  const avisos = await diagnosticoDe(r.spec, tool, r.salida, r.errores, reglasDe(reglas), { ...entradaDesdeSpec(s), tool, modelo });
  const promptId = await guardarPrompt(specId, tool, r.salida, r.valido, r.errores, r.usage, variante, versionCon(reglas.clave), recomendarModelo(pistasModelo(r.spec, tool)).modelo, avisos);
  if (typeof promptId !== "string") return promptId;
  // Señal de aprendizaje: qué tuvo que pedir el diseñador (el texto, recortado).
  await anotarEvento(db, { spec_id: specId, prompt_id: promptId, client_id: s.row.client_id, job: spec.job, tool, variante, user_id: g.soyId, tipo: "refinado", detalle: texto.slice(0, 300) });
  return { ok: true, promptId, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, usage: r.usage, avisos };
}

// ── 5) Explicar (se genera una vez por idioma y se guarda) ───
export async function explicar(promptId: string, lang: "es" | "en"): Promise<{ ok: true; texto: string } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (!UUID.test(promptId)) return { ok: false, error: "Prompt no válido." };
  const db = supabaseAdmin();
  const { data: p, error: leerError } = await db.from("prisma_prompts").select("*").eq("id", promptId).maybeSingle<PrismaPromptRow>();
  if (leerError) return fallo("prisma_prompts.select", leerError.message);
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  const s = await specDeFila(p.spec_id, g);
  if ("ok" in s) return s;

  // Una columna por idioma (0065): la explicación en español y la de inglés conviven, así
  // cambiar de idioma no pisa (ni vuelve a cobrar) la que ya se pagó.
  const col = lang === "en" ? "explicacion_en" : "explicacion_es";
  const cacheada = p[col];
  if (typeof cacheada === "string" && cacheada.trim()) return { ok: true, texto: cacheada };

  if (saturado(g.soyId)) return FRENO;
  const r = await explicarPrompt(p.salida, p.tool as Tool, lang);
  if (!r.ok) return r;
  // Si el preview corre ANTES de aplicar la 0065 la columna no existe: la explicación se
  // entrega igual (sólo no queda cacheada) y se avisa en el log — mismo patrón que
  // cargarMarcas con prisma_presets. Una migración pendiente nunca debe dar un 500.
  const { error } = await db.from("prisma_prompts").update({ [col]: r.texto }).eq("id", promptId);
  if (error) console.warn(`[prisma] no se pudo cachear la explicación (${col}): ${error.message}`);
  return { ok: true, texto: r.texto };
}

// ── 5b) Reabrir desde el historial ───────────────────────────
export type ResultadoAbrir = { ok: true; promptId: string; tool: Tool; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; variante: PrismaVariante; /** "Antes era Sora 2…" cuando la fila venía de una herramienta retirada. */ nota: Par | null; avisos: Aviso[]; /** F4: es un prompt de corrección (edita un resultado subido). */ correccion: boolean; /** F4: el último resultado subido para este prompt (con su veredicto y si quedó aceptado). */ resultado: ResultadoVivo | null };

export async function abrirSpec(specId: string): Promise<ResultadoAbrir | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  const db = supabaseAdmin();
  const { data: p } = await db
    .from("prisma_prompts")
    .select("*")
    .eq("spec_id", specId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PrismaPromptRow>();
  if (!p) return { ok: false, error: "Ese prompt no tiene texto guardado." };
  if ((TOOLS as string[]).includes(p.tool)) {
    // Los avisos guardados con el prompt (si la fila es de antes de F2, se recalculan los deterministas).
    const guardados = avisosDe(p.avisos);
    const avisosFila = guardados.length ? guardados : diagnosticar(s.spec, p.tool as Tool, p.salida, p.errores ?? [], reglasDe(await cargarReglas(db)));
    return { ok: true, promptId: p.id, tool: p.tool as Tool, spec: s.spec, salida: { texto: p.salida, formato: p.formato }, valido: p.valido, errores: p.errores ?? [], variante: p.variante, nota: null, avisos: avisosFila, correccion: !!s.row.correccion_de, resultado: await ultimoResultadoDe(db, p.id, s.spec.job) };
  }
  // El prompt guardado es de una herramienta retirada (Sora 2): su texto ya no sirve. Se
  // recompila el spec para la sucesora y se guarda como prompt nuevo (copiar/eventos apuntan
  // a él) — UNA sola vez: si ya existe un prompt de la sucesora para este spec, se reutiliza.
  const antes = NOMBRE_HISTORICO[p.tool] ?? p.tool;
  const ahora = TOOL_INFO[s.spec.tool].nombre;
  const nota = t(`Antes era ${antes}, que ya no está en Prisma; ahora se escribe para ${ahora}.`, `It used to be ${antes}, which is no longer in Prisma; it is now written for ${ahora}.`);
  const { data: previo } = await db.from("prisma_prompts").select("*").eq("spec_id", specId).eq("tool", s.spec.tool).order("created_at", { ascending: false }).limit(1).maybeSingle<PrismaPromptRow>();
  if (previo) {
    return { ok: true, promptId: previo.id, tool: s.spec.tool, spec: s.spec, salida: { texto: previo.salida, formato: previo.formato }, valido: previo.valido, errores: previo.errores ?? [], variante: previo.variante, nota, avisos: avisosDe(previo.avisos), correccion: !!s.row.correccion_de, resultado: await ultimoResultadoDe(db, previo.id, s.spec.job) };
  }
  const r = recompilar(s.spec, s.spec.tool);
  const avisos = diagnosticar(s.spec, s.spec.tool, r.salida.texto, r.errores, reglasDe(await cargarReglas(db)));
  const nuevoId = await guardarPrompt(specId, s.spec.tool, r.salida, r.valido, r.errores, null, p.variante, PROMPT_VERSION, recomendarModelo(pistasModelo(s.spec)).modelo, avisos);
  if (typeof nuevoId !== "string") return nuevoId;
  return { ok: true, promptId: nuevoId, tool: s.spec.tool, spec: s.spec, salida: r.salida, valido: r.valido, errores: r.errores, variante: p.variante, nota, avisos, correccion: !!s.row.correccion_de, resultado: null };
}

// ── 6) Calificar (pulgar arriba/abajo) ───────────────────────
export async function calificar(promptId: string, score: 1 | -1, nota?: string): Promise<{ ok: true } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (score !== 1 && score !== -1) return { ok: false, error: "Calificación no válida." };
  const db = supabaseAdmin();
  // Mismo cerco que el resto: sólo se califica un prompt que se puede tocar (IDOR).
  const { data: p } = await db.from("prisma_prompts").select("spec_id").eq("id", promptId).maybeSingle<{ spec_id: string }>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  const s = await specDeFila(p.spec_id, g);
  if ("ok" in s) return s;
  const { error } = await db
    .from("prisma_ratings")
    .upsert({ prompt_id: promptId, user_id: g.soyId, score, nota: sn(nota, 300) }, { onConflict: "prompt_id,user_id" });
  if (error) return fallo("prisma_ratings.upsert", error.message);
  return { ok: true };
}

// ── 7) Personajes / productos guardados ──────────────────────
// La persona, el producto o la mascota que se repite. Pertenece a UN cliente. Flujo:
// H.Ü.E PROPONE la descripción (en inglés) → el diseñador la lee y corrige → se guarda
// tal cual. Retirar = active=false (soft delete: los specs que ya lo usaron no cambian).

export async function describirPersonaje(raw: { nombre: string; notas: string; caption: string | null; dna: VisualDNA | null }): Promise<{ ok: true; descripcion: string } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (saturado(g.soyId)) return FRENO;
  const nombre = s0(raw.nombre, 60);
  const notas = s0(raw.notas, 600);
  const caption = sn(raw.caption, 300);
  const dna = dnaLimpio(raw.dna);
  if (!nombre) return { ok: false, error: "Ponle nombre primero." };
  if (!notas && !caption) return { ok: false, error: "Sube una foto o escribe cómo es." };
  const r = await describirPersonajeIA({ nombre, notas, caption, dna });
  if (!r.ok) return r;
  return { ok: true, descripcion: r.texto };
}

export async function crearPersonaje(raw: { marcaId: string; nombre: string; descripcion: string; storage_path: string | null }): Promise<{ ok: true; personaje: PersonajeUI } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const nombre = plano(s0(raw.nombre, 60));
  // En una sola línea: esta frase entra VERBATIM como "sujeto" de los prompts de todos.
  const descripcion = plano(s0(raw.descripcion, 600));
  const marcaId = sn(raw.marcaId, 64);
  const path = sn(raw.storage_path, 80);
  if (!marcaId || !UUID.test(marcaId)) return { ok: false, error: "Elige primero la marca." };
  if (!nombre) return { ok: false, error: "Ponle nombre." };
  if (!descripcion) return { ok: false, error: "Falta la descripción." };
  if (path && !RUTA_REF.test(path)) return { ok: false, error: "Foto inválida." };

  const db = supabaseAdmin();
  // El cliente NO lo manda el navegador: se deriva de la marca (activa) en el servidor, igual
  // que en entradaDe. Un id inventado no puede colgar un personaje de otro cliente.
  const m = (await cargarMarcas(db)).find((x) => x.id === marcaId);
  if (!m) return { ok: false, error: "Esa marca ya no existe." };

  const { data, error } = await db
    .from("prisma_characters")
    .insert({ client_id: m.client_id, name: nombre, descripcion, storage_path: path, created_by: g.soyId })
    .select("*")
    .single<PrismaCharacterRow>();
  if (error || !data) return fallo("prisma_characters.insert", error?.message);
  const urls = path ? await firmar(db, [path]) : new Map<string, string>();
  return { ok: true, personaje: personajeUI(data, path ? urls.get(path) ?? null : null, g.soyId) };
}

export async function retirarPersonaje(id: string): Promise<{ ok: true } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const pid = sn(id, 64);
  if (!pid || !UUID.test(pid)) return { ok: false, error: "Personaje no válido." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("prisma_characters").select("id, created_by").eq("id", pid).eq("active", true).maybeSingle<{ id: string; created_by: string | null }>();
  if (!p) return { ok: false, error: "Ese personaje ya no existe." };
  // Misma regla que con los specs (puedeTocar): lo tuyo siempre; lead/admin/master, todo.
  if (!puedeTocar(p, g)) return { ok: false, error: "Sólo quien lo guardó (o un lead) puede retirarlo." };
  // El UPDATE debe PROBAR que tocó la fila: 0 filas (se retiró en la carrera) no es éxito.
  const { data: upd, error } = await db.from("prisma_characters").update({ active: false }).eq("id", pid).eq("active", true).select("id").maybeSingle();
  if (error) return fallo("prisma_characters.update", error.message);
  if (!upd) return { ok: false, error: "Ese personaje ya se había retirado." };
  return { ok: true };
}

/** Los personajes de la marca elegida (paso 3), con sus fotos firmadas. Se piden AL ELEGIR
 *  la marca, no al cargar la página: así la página no manda a todo el mundo los nombres,
 *  descripciones y fotos (URLs firmadas del bucket privado) de TODOS los clientes. */
export async function listarPersonajes(marcaId: string): Promise<{ ok: true; personajes: PersonajeUI[] } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const mid = sn(marcaId, 64);
  if (!mid || !UUID.test(mid)) return { ok: false, error: "Marca no válida." };
  const db = supabaseAdmin();
  const m = (await cargarMarcas(db)).find((x) => x.id === mid);
  if (!m) return { ok: false, error: "Esa marca ya no existe." };
  const filas = await cargarPersonajes(db, m.client_id);
  const fotos = await firmar(db, filas.map((x) => x.storage_path).filter((s): s is string => !!s));
  return { ok: true, personajes: filas.map((x) => personajeUI(x, x.storage_path ? fotos.get(x.storage_path) ?? null : null, g.soyId)) };
}

// ── 8) Otra versión, bajo demanda (segura / audaz / mínima) ───
// Una llamada extra SÓLO cuando el diseñador la pide (Pedro, 2026-09-11). La versión nace
// como un spec HERMANO (misma idea, refs y marca; otro spec) para que refinar, cambiar de
// herramienta, explicar e historial funcionen igual que con cualquier prompt. El evento
// "variante" queda en el spec ORIGINAL: es la señal de qué versiones pide esta marca.
export type ResultadoVariar = { ok: true; specId: string; promptId: string; tool: Tool; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; variante: PrismaVariante; avisos: Aviso[] };

export async function variar(specId: string, variante: string): Promise<ResultadoVariar | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (!(PRISMA_VARIANTES_PEDIBLES as readonly string[]).includes(variante)) return { ok: false, error: "Versión no válida." };
  const v = variante as Exclude<PrismaVariante, "base">;
  if (saturado(g.soyId)) return FRENO;
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  const db = supabaseAdmin();
  // La versión se pide sobre la herramienta que el diseñador está VIENDO (la del último prompt).
  const [{ tool }, reglas] = await Promise.all([estadoActual(db, s), cargarReglas(db)]);
  const modelo = recomendarModelo(pistasModelo(s.spec, tool)).modelo;
  const r = await variarSpec({ ...entradaDesdeSpec(s), tool, modelo }, { ...s.spec, tool }, v, estableCon(reglas.notas, reglas.clave), reglasDe(reglas));
  if (!r.ok) return r;

  const fila = { client_id: s.row.client_id, marca_id: s.row.marca_id, job: s.row.job, tool, destino: s.row.destino, idea: s.row.idea, spec: r.spec, refs: s.row.refs, created_by: g.soyId };
  let ins = await db.from("prisma_specs").insert({ ...fila, origen_spec_id: specId }).select("id").single<{ id: string }>();
  // Antes de la 0066 la columna origen_spec_id no existe: se guarda sin el enlace (mismo patrón que prisma_presets).
  if (ins.error && /origen_spec_id/.test(ins.error.message)) {
    console.warn("[prisma] prisma_specs.origen_spec_id no existe todavía (falta la 0066); versión sin enlace.");
    ins = await db.from("prisma_specs").insert(fila).select("id").single<{ id: string }>();
  }
  const { data: nuevo, error } = ins;
  if (error || !nuevo) return fallo("prisma_specs.insert", error?.message);
  const avisos = await diagnosticoDe(r.spec, tool, r.salida, r.errores, reglasDe(reglas), { ...entradaDesdeSpec(s), tool, modelo });
  const promptId = await guardarPrompt(nuevo.id, tool, r.salida, r.valido, r.errores, r.usage, v, versionCon(reglas.clave), recomendarModelo(pistasModelo(r.spec, tool)).modelo, avisos);
  if (typeof promptId !== "string") return promptId;
  await anotarEvento(db, { spec_id: specId, prompt_id: promptId, client_id: s.row.client_id, job: s.row.job, tool, variante: v, user_id: g.soyId, tipo: "variante", detalle: v });
  return { ok: true, specId: nuevo.id, promptId, tool, spec: r.spec, salida: r.salida, valido: r.valido, errores: r.errores, variante: v, avisos };
}

// ── 9) Lo que el diseñador HACE con el prompt (copiar / abrir en la herramienta) ──
// Es la señal más fuerte de que un prompt SIRVIÓ. Se registra y ya: si falla, no se le
// avisa al diseñador (copiar tiene que ser instantáneo) — queda en el log del servidor.
export async function registrarEvento(promptId: string, tipo: "copiado" | "abierto" | "aviso_aplicado", detalle?: string): Promise<{ ok: true } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (tipo !== "copiado" && tipo !== "abierto" && tipo !== "aviso_aplicado") return { ok: false, error: "Evento no válido." };
  const det = tipo === "aviso_aplicado" ? sn(detalle, 60) : null;
  if (tipo === "aviso_aplicado" && (!det || !CODIGO_AVISO.test(det))) return { ok: false, error: "Evento no válido." };
  // No llama al modelo, pero inserta una fila por click (y el índice único ya no cubre este tipo).
  if (saturado(g.soyId, Date.now(), "eventos", 120)) return FRENO;
  const pid = sn(promptId, 64);
  if (!pid || !UUID.test(pid)) return { ok: false, error: "Prompt no válido." };
  const db = supabaseAdmin();
  const { data: p } = await db.from("prisma_prompts").select("spec_id, tool, variante, avisos").eq("id", pid).maybeSingle<{ spec_id: string; tool: string; variante: PrismaVariante; avisos: unknown }>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  // Un aviso aplicado tiene que ser uno de los que ESE prompt enseñó (o una sugerencia ortográfica).
  if (det && !det.startsWith("ortografia_") && !avisosDe(p.avisos).some((a) => a.codigo === det)) return { ok: false, error: "Evento no válido." };
  const s = await specDeFila(p.spec_id, g); // mismo cerco que calificar: sólo prompts que puedes tocar
  if ("ok" in s) return s;
  await anotarEvento(db, { spec_id: p.spec_id, prompt_id: pid, client_id: s.row.client_id, job: s.row.job, tool: p.tool, variante: p.variante, user_id: g.soyId, tipo, detalle: det });
  return { ok: true };
}

// ── F2) Ortografía y gramática del texto que va en la pieza (o se dice) ────────────────────
export type ResultadoRevision = { ok: true; idioma: Idioma; original: string; sugerido: string; cambios: Cambio[] };

/**
 * Dos capas: el diccionario de acentos (gratis, instantáneo) y H.Ü.E como corrector
 * (una llamada corta). El resultado es una SUGERENCIA: el diseñador decide (una marca puede
 * escribirse sin acento a propósito). Facturable → freno por identidad.
 */
export async function revisarOrtografia(campo: "texto" | "dialogo", raw: string, idiomaPedido?: string): Promise<ResultadoRevision | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (campo !== "texto" && campo !== "dialogo") return { ok: false, error: "Campo no válido." };
  const max = campo === "texto" ? 200 : 600;
  const original = s0(raw, max);
  if (!original) return { ok: false, error: "No hay texto que revisar." };
  if (saturado(g.soyId, Date.now(), "revision", 20)) return FRENO;
  const idioma: Idioma = idiomaPedido === "en" ? "en" : idiomaPedido === "es" || idiomaPedido === "es-MX" ? "es" : idiomaDe(original);
  const det = revisarAcentos(original, idioma);
  const r = await revisarTexto(det.sugerido, idioma, campo, max);
  if (!r.ok) {
    // Sin modelo, la capa determinista sigue valiendo.
    return { ok: true, idioma, original, sugerido: det.sugerido, cambios: det.cambios };
  }
  const sugerido = r.corregido;
  const cambios = [...det.cambios, ...r.cambios].slice(0, 8);
  return { ok: true, idioma, original, sugerido, cambios: sugerido === original ? [] : cambios };
}

// ── F2) "Revísalo bien": el juicio de H.Ü.E a petición (imagen; en video ya corre solo) ────
export async function revisarBien(promptId: string): Promise<{ ok: true; avisos: Aviso[] } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const pid = sn(promptId, 64);
  if (!pid || !UUID.test(pid)) return { ok: false, error: "Prompt no válido." };
  if (saturado(g.soyId)) return FRENO;
  const db = supabaseAdmin();
  const { data: p } = await db.from("prisma_prompts").select("*").eq("id", pid).maybeSingle<PrismaPromptRow>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  const s = await specDeFila(p.spec_id, g);
  if ("ok" in s) return s;
  const tool = (TOOLS as string[]).includes(p.tool) ? (p.tool as Tool) : s.spec.tool;
  const { avisos: juicio } = await juzgarSpec({ ...entradaDesdeSpec(s), tool }, { ...s.spec, tool }, p.salida);
  const previos = avisosDe(p.avisos);
  const codigos = new Set(previos.map((a) => a.codigo));
  const avisos = [...previos, ...juicio.filter((a) => !codigos.has(a.codigo))].slice(0, 20);
  const { error } = await db.from("prisma_prompts").update({ avisos }).eq("id", pid);
  if (error) console.warn(`[prisma] revisarBien: no se guardaron los avisos: ${error.message}`);
  return { ok: true, avisos };
}

// ── F3) La entrevista: qué falta preguntar antes de escribir ──────────────────────────────
export type ResultadoEntrevista = { ok: true; preguntas: Pregunta[] };

/**
 * ≤ 3 preguntas rápidas, o ninguna. La heurística (sin modelo) decide si vale la pena
 * preguntar; sólo entonces se paga la llamada. Las preguntas que esta marca "ya sabe"
 * (misma respuesta ≥ 4 de las últimas 10 veces) no se hacen.
 */
export async function entrevistar(raw: InputGenerar): Promise<ResultadoEntrevista | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const inp = normalizar(raw);
  if ("ok" in inp) return inp;
  // La heurística va ANTES de tocar la BD: cuando la idea ya lo dice todo, la llamada es gratis.
  const roles = new Set(inp.refs.map((r) => r.role));
  const refsFaltan = REFS_POR_JOB[inp.job].some((s) => !s.opcional && !roles.has(s.role));
  const chipsLook = Object.values(inp.look).filter((v) => v && v.trim()).length;
  const refsConDna = inp.refs.filter((r) => !!r.dna).length;
  if (!necesitaEntrevista({ idea: inp.idea, refsFaltan, chipsLook, refsConDna, sinPreguntas: !!inp.sinPreguntas })) return { ok: true, preguntas: [] };
  // Cubo propio: ir y volver entre el paso 1 y el 2 nunca gasta el cupo de generar.
  if (saturado(g.soyId, Date.now(), "entrevista", 20)) return FRENO;
  const ent = await entradaDe(inp);
  if ("ok" in ent) return ent;
  const db = supabaseAdmin();
  const aprendizaje = ent.clientId ? await cargarAprendizaje(db, ent.clientId, inp.job) : null;
  const r = await preguntarFaltante(ent.entrada, aprendizaje?.yaSabidas ?? []);
  if (!r.ok) return r;
  return { ok: true, preguntas: r.preguntas };
}
