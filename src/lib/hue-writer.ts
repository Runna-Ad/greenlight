import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cargarWinners } from "@/lib/hue-data";
import { legalSugerido, type LegalLite } from "@/lib/legal-sugerido";
import { voz, varianteGuion, readTimeS, presupuestoDialogoS } from "@/lib/plantilla";
import { convertirDialogo } from "@/lib/guion";
import { combinarConsideraciones } from "@/lib/consideraciones";
import type { PlanoParsed, EstaticoParsed } from "@/lib/guion";

/**
 * H.Ü.E · Fase 2 — el WRITER ("Crear guión"). Escribe un guión de anuncio COMPLETO
 * desde la info de la tarea, consumiendo lo que la Fase 1 hizo entrenable: el Cerebro
 * (hue_instructions activas), el KB (hue_kb_documents.extracted_text) y la Biblioteca
 * de Ganadores (hue_top_performers). Server-only.
 *
 * A diferencia de `extraerGuion` (que EXTRAE de un texto pegado y se guarda con el
 * guard submultiset `sinInventar`), el writer GENERA — su salida NO es subconjunto de
 * ninguna entrada, así que `sinInventar` NO aplica. La red de seguridad es la MISMA
 * vista previa humana editable + import (reusadas): el humano revisa antes de escribir.
 * El prompt aterriza el modelo en los datos REALES de la tarea (no inventa precios ni
 * legales) y respeta las reglas de marca.
 */

type IdeaRow = {
  id: string;
  concepto: string | null;
  comunicacion: string | null;
  topico: string | null;
  selling_points: string[] | null;
  genero_code: string | null;
  tipo_asset: string | null;
  formato_code: string | null;
  duracion: string[] | null;
  tamanos: string[] | null;
  plataformas: string[] | null;
  trend: string | null;
  notas: string | null;
  nota_guion: string | null;
  legales_libres: string | null;
  comentarios_creativo: string | null;
  comentarios_produccion: string | null;
  comentarios_diseno: string | null;
  p_tema: string | null;
  p_mensaje: string | null;
  p_insight: string | null;
  p_personaje: string | null;
  p_locacion: string | null;
  p_hook: string | null;
  p_graficos: string | null;
  peloteo_raw: string | null;
  marca_id: string | null;
  brief_id: string | null;
  family_id: string | null;
  track: string | null;
};

export type ContextoWriter = {
  idea: IdeaRow;
  marcaSlug: string | null;
  marcaName: string | null;
  briefTitle: string | null;
  familyTema: string | null;
  familyInsight: string | null;
  variante: "real" | "normal";
  voz: string;
  reglas: { titulo: string; mensaje: string }[];
  legal: { title: string; body: string; motivo: string } | null;
  brain: { title: string; body: string }[];
  kb: { title: string; extracted_text: string }[];
  winners: { etiqueta: string; guion: string }[];
};

const IDEA_COLS =
  "id, concepto, comunicacion, topico, selling_points, genero_code, tipo_asset, formato_code, " +
  "duracion, tamanos, plataformas, trend, notas, nota_guion, legales_libres, comentarios_creativo, " +
  "comentarios_produccion, comentarios_diseno, p_tema, p_mensaje, p_insight, p_personaje, p_locacion, " +
  "p_hook, p_graficos, peloteo_raw, marca_id, brief_id, family_id, track";

/** Junta TODO el contexto de una tarea para el writer. Devuelve null si la tarea no existe. */
export async function reunirContextoTarea(ideaId: string): Promise<ContextoWriter | null> {
  const db = supabaseAdmin();

  const { data: ideaRaw, error: ideaErr } = await db.from("ideas").select(IDEA_COLS).eq("id", ideaId).maybeSingle();
  if (ideaErr) throw new Error(`ideas: ${ideaErr.message}`);
  const idea = ideaRaw as IdeaRow | null;
  if (!idea) return null;

  // Marca + brief (para el scope de Cerebro/KB/legales y para el contexto).
  const [{ data: marcaRow }, { data: briefRow }] = await Promise.all([
    idea.marca_id ? db.from("marcas").select("slug, name, client_id").eq("id", idea.marca_id).maybeSingle() : Promise.resolve({ data: null }),
    idea.brief_id ? db.from("briefs").select("title, brief_name, client_id").eq("id", idea.brief_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const marca = marcaRow as { slug: string; name: string; client_id: string } | null;
  const brief = briefRow as { title: string | null; brief_name: string | null; client_id: string } | null;
  const clientId = marca?.client_id ?? brief?.client_id ?? null;
  // El slug del CLIENTE (no de la marca): cargarWinners devuelve clienteSlug (cliente),
  // así se filtran los ganadores al mismo cliente sin fugar los de otro (reap C1).
  const { data: clientRow } = clientId
    ? await db.from("clients").select("slug").eq("id", clientId).maybeSingle()
    : { data: null };
  const clientSlug = (clientRow as { slug: string } | null)?.slug ?? null;

  const family = idea.family_id
    ? ((await db.from("idea_families").select("tema, insight").eq("id", idea.family_id).maybeSingle()).data as { tema: string | null; insight: string | null } | null)
    : null;

  // Filtro de scope reutilizable (global + este cliente/marca). Se construye a mano
  // porque un `.eq(col, null)` es inválido cuando la tarea no tiene marca.
  const scopeOr = ["scope.eq.global"];
  if (clientId) scopeOr.push(`client_id.eq.${clientId}`);
  if (idea.marca_id) scopeOr.push(`marca_id.eq.${idea.marca_id}`);
  const scopeFilter = scopeOr.join(",");

  // Los LEGALES NO usan la pata `client_id` (a diferencia de Cerebro/KB): el legal de
  // marca es por-marca, no por-cliente. La pata client_id pescaría el legal de una
  // marca HERMANA (Card → Préstamos) por dos motivos: (1) el sync viejo guardaba mal
  // client_id en filas de marca, (2) aunque se corrija a NULL, un legal scope='client'
  // no es un patrón que la app soporte (la página de la tarea tampoco lo usa). Espeja
  // el filtro de page.tsx: marca_id + global. (reap 2026-08-26)
  const legalFilter = idea.marca_id ? `marca_id.eq.${idea.marca_id},scope.eq.global` : "scope.eq.global";

  // Proxy del "guión" (aún no escrito) desde el brief, para (a) las reglas condicionadas
  // por texto (CASHBACK/MSI → *Aplican) y (b) el legal sugerido determinista.
  const proxyTexto = [idea.concepto, idea.comunicacion, idea.peloteo_raw, ...(idea.selling_points ?? [])].filter(Boolean).join(" ");

  const [reglasRes, legalesRes, brainRes, kbRes] = await Promise.all([
    db.rpc("reglas_para_tarea", { p_idea_id: ideaId, p_texto: proxyTexto }),
    db.from("snippets").select("id, title, body").eq("kind", "legal").eq("active", true).or(legalFilter),
    db.from("hue_instructions").select("title, body").eq("active", true).or(scopeFilter).order("created_at"),
    db.from("hue_kb_documents").select("title, extracted_text").or(scopeFilter).order("created_at"),
  ]);
  // Un error de query NO debe degradar en silencio a "sin reglas / sin legal / sin Cerebro"
  // (el writer produciría copy sin *Aplican, sin CTA correcto, etc.) — fallar honesto (reap S1).
  if (reglasRes.error) throw new Error(`reglas: ${reglasRes.error.message}`);
  if (legalesRes.error) throw new Error(`legales: ${legalesRes.error.message}`);
  if (brainRes.error) throw new Error(`cerebro: ${brainRes.error.message}`);
  if (kbRes.error) throw new Error(`kb: ${kbRes.error.message}`);

  const reglas = ((reglasRes.data ?? []) as { titulo: string | null; mensaje: string | null }[])
    .filter((r) => r.mensaje)
    .map((r) => ({ titulo: r.titulo ?? "", mensaje: r.mensaje ?? "" }));

  // Legal sugerido (determinista) desde el mismo proxy.
  const legales = ((legalesRes.data ?? []) as LegalLite[]);
  const sug = legalSugerido(marca?.slug ?? null, proxyTexto, legales);
  const legalPrincipal = sug.principalId ? legales.find((l) => l.id === sug.principalId) ?? null : null;
  const legal = legalPrincipal ? { title: legalPrincipal.title, body: legalPrincipal.body, motivo: sug.motivo } : null;

  // Caps: no inflar el prefijo cacheable sin límite (reap M4).
  const brain = ((brainRes.data ?? []) as { title: string; body: string }[]).slice(0, 30);
  const kb = ((kbRes.data ?? []) as { title: string; extracted_text: string | null }[])
    .filter((d) => d.extracted_text)
    .slice(0, 6)
    .map((d) => ({ title: d.title, extracted_text: d.extracted_text as string }));

  // Ganadores del MISMO cliente como ejemplares (máx 3). SIN fallback a otros clientes:
  // el guión de otro cliente contaminaría el prompt con sus precios/legales (reap C1).
  const todosWinners = await cargarWinners();
  const winnersFuente = (clientSlug ? todosWinners.filter((w) => w.clienteSlug === clientSlug) : []).slice(0, 3);
  const winners = winnersFuente.map((w) => ({
    etiqueta: `${w.clienteName} · ${w.namingBase ?? w.code ?? "s/n"}`,
    guion: w.planos
      .map((p) => [p.accion && `Acción: ${p.accion}`, p.copy_in && `Copy: ${p.copy_in}`, p.dialogo && `Diálogo: ${p.dialogo}`].filter(Boolean).join(" · "))
      .filter(Boolean)
      .join("\n"),
  }));

  return {
    idea,
    marcaSlug: marca?.slug ?? null,
    marcaName: marca?.name ?? null,
    briefTitle: brief?.title ?? brief?.brief_name ?? null,
    familyTema: family?.tema ?? null,
    familyInsight: family?.insight ?? null,
    variante: varianteGuion(idea.tipo_asset),
    voz: voz(idea.tipo_asset),
    reglas,
    legal,
    brain,
    kb,
    winners,
  };
}

const lista = (xs: (string | null)[] | null | undefined): string =>
  (xs ?? []).filter(Boolean).join(", ") || "—";
const linea = (label: string, v: string | null | undefined): string => (v && v.trim() ? `- ${label}: ${v.trim()}\n` : "");

/** El prefijo ESTABLE (cacheable): rol + instrucciones + Cerebro + KB + ganadores.
 *  Idéntico entre tareas del mismo scope → cache hit. NO metas datos de la tarea aquí. */
function bloqueEstable(ctx: ContextoWriter, modo: "guion" | "copy"): string {
  let s =
    "Eres H.Ü.E, el escritor creativo de la agencia Rünna para anuncios de DiDi. Tu trabajo: " +
    (modo === "guion"
      ? "ESCRIBIR un guión de video COMPLETO (una serie de planos/tomas) desde el brief de la tarea. "
      : "ESCRIBIR el copy de un anuncio ESTÁTICO (título, subtítulo, botón CTA) desde el brief de la tarea. ") +
    "Repórtalo con la herramienta.\n\n" +
    "REGLAS ABSOLUTAS (aterriza en el brief, no inventes):\n" +
    "- NO INVENTES cifras: precios, porcentajes, montos, plazos/quincenas y fechas van SÓLO si aparecen " +
    "explícitamente en el brief o en un Selling Point del KB. Si un dato no está en ninguno de los dos, NO lo pongas.\n" +
    "- SELLING POINTS · DE DÓNDE SALEN: PRIMERO revisa los \"Selling points del brief\" de la tarea. Si traen " +
    "contenido y respetan las reglas del KB, úsalos. Si están VACÍOS o NO cumplen el KB, ELIGE los Selling " +
    "Points más relevantes de la BASE DE CONOCIMIENTO.\n" +
    "- SELLING POINTS · CÓMO SE USAN: intégralos de forma natural y lógica según las reglas del KB. Puedes " +
    "REDACTARLOS distinto para dar variedad, siempre que se respete el mensaje — PERO nunca cambies sus cifras, " +
    "montos, porcentajes, plazos ni términos legales/de marca (p. ej. \"6% de CASHBACK\", \"sin anualidad\", " +
    "\"MSI\"): esos van EXACTOS.\n" +
    "- NEGRITA obligatoria: encierra en `**…**` cada NOMBRE DE MARCA (DiDi, DiDi Card, DiDi Préstamos, " +
    "DiDi Finanzas) y cada SELLING POINT / beneficio clave (línea de crédito, CASHBACK*, sin anualidad, " +
    "MSI, aprobación en minutos, etc.) DENTRO del copy y del diálogo. Ej.: `con tu **DiDi Card** obtienes " +
    "**hasta 6% de CASHBACK***`. Es negrita de énfasis (markdown `**`), no toques su texto.\n" +
    "- NO escribas el texto legal ni el CAT: el legal se adjunta aparte desde la biblioteca. Sólo, si una " +
    "regla lo pide (p. ej. CASHBACK/MSI → `*Aplican`), deja el asterisco `*` donde corresponda en el copy.\n" +
    "- RESPETA las reglas de marca que te paso (CTA por plataforma, timeframes por marca, conteo de " +
    "beneficios por duración, asterisco de CASHBACK/MSI).\n";
  if (modo === "guion") {
    s +=
      "- Cada plano es un objeto con: titulo (encabezado tipo \"Plano 1 - …\"), accion (qué pasa en pantalla), " +
      "copy_in (texto en pantalla), sfx (audio), gfx (gráficos/emojis), edicion (transición/insert; vacío si no aplica), " +
      "dialogo. El diálogo va en el formato \"(Quién) texto\", con el locutor entre paréntesis; junta varios locutores " +
      "con saltos de línea.\n" +
      "- Arranca con un HOOK fuerte en los primeros segundos. Escribe un guión coherente de principio a fin " +
      "(no incluyas la cortinilla legal final: se agrega desde la biblioteca).\n" +
      "- En el PRIMER plano (los primeros 3–5 segundos) SIEMPRE menciona un Selling Point o nombra el " +
      "servicio (\"DiDi Card\" o \"DiDi Préstamos\").\n" +
      "- ⏱️ RESPETA LA DURACIÓN OBJETIVO: el diálogo TOTAL (todos los planos) debe LEERSE dentro del PRESUPUESTO " +
      "que te doy abajo. El sistema mide 'tiempo de lectura' = palabras de diálogo ÷ 2.5 (≈2.5 palabras/seg " +
      "locutadas). La cortinilla legal ocupa 2s aparte y YA está descontada del presupuesto, así que no la sumes. " +
      "Caber en el tiempo es OBLIGATORIO: si te pasas, recorta líneas o planos — un guión que cabe vale más que " +
      "uno que excede.\n";
  } else {
    s +=
      "- Devuelve copy_titulo (beneficio principal), copy_subtitulo (2–3 beneficios secundarios) y copy_cta " +
      "(texto del botón — si una regla dice que la plataforma NO lleva CTA, deja copy_cta vacío).\n";
  }

  if (ctx.brain.length) {
    s += "\nEL CEREBRO — lecciones aprendidas (patrones observados en los ganadores; guíate por ellas):\n";
    for (const l of ctx.brain) s += `• ${l.title}: ${l.body}\n`;
  }
  if (ctx.kb.length) {
    s += "\nBASE DE CONOCIMIENTO (documentos de referencia):\n";
    for (const d of ctx.kb) s += `### ${d.title}\n${d.extracted_text.slice(0, 8000)}\n\n`;
  }
  if (ctx.winners.length) {
    s += "\nGUIONES GANADORES (ejemplares — inspírate en su ESTRUCTURA y TONO, NO los copies; IGNORA por completo sus precios, cifras, legales y ofertas: usa SÓLO los datos del brief de esta tarea):\n";
    ctx.winners.forEach((w, i) => {
      s += `[Ganador ${i + 1} · ${w.etiqueta}]\n${w.guion || "(sin contenido)"}\n\n`;
    });
  }
  return s;
}

/** La parte VARIABLE: los datos específicos de ESTA tarea (después del breakpoint de cache). */
function bloqueVariable(ctx: ContextoWriter, modo: "guion" | "copy"): string {
  const i = ctx.idea;
  let s = "LA TAREA A ESCRIBIR:\n";
  s += linea("Marca", ctx.marcaName ? `${ctx.marcaName}${ctx.marcaSlug ? ` (${ctx.marcaSlug})` : ""}` : null);
  s += linea("Brief", ctx.briefTitle);
  s += linea("Tópico", i.topico);
  s += linea("Concepto", i.concepto);
  s += linea("Comunicación", i.comunicacion);
  s += `- Selling points del brief (si están vacíos o no cumplen el KB, elige del KB — ver reglas): ${lista(i.selling_points)}\n`;
  s += linea("Tema (familia)", ctx.familyTema);
  s += linea("Insight (familia)", ctx.familyInsight);
  s += linea("Tendencia/referencia", i.trend);
  s += linea("Notas", i.notas);
  s += linea("Nota de guión", i.nota_guion);
  // "Dile a H.Ü.E que quieres" — lo que el equipo pide EXPLÍCITAMENTE para esta tarea.
  // Vive consolidado en peloteo_raw (guardarConsideraciones deja comentarios_creativo en
  // null); se combinan por si es una tarea vieja sin consolidar. Guía de alta prioridad:
  // si trae algo relevante, tómalo como parte de todo lo que usas para escribir el guión.
  s += linea("LO QUE EL EQUIPO TE PIDE PARA ESTA TAREA (considéralo al escribir)", combinarConsideraciones(i.comentarios_creativo, i.peloteo_raw));
  // Peloteo (brief estructurado del lead)
  s += linea("Peloteo · tema", i.p_tema);
  s += linea("Peloteo · mensaje", i.p_mensaje);
  s += linea("Peloteo · insight", i.p_insight);
  s += linea("Peloteo · personaje", i.p_personaje);
  s += linea("Peloteo · locación", i.p_locacion);
  s += linea("Peloteo · hook", i.p_hook);
  s += linea("Peloteo · gráficos", i.p_graficos);
  s += `- Plataformas: ${lista(i.plataformas)}\n`;
  if (modo === "guion") {
    s += `- Duración: ${lista(i.duracion)}\n`;
    // Presupuesto de diálogo = objetivo (tope del rango − colchón: mitad del rango, mín 4s)
    // − 2s de cortinilla legal reservada, para que el video aterrice bajo el tope y no
    // pegado al borde. Un valor único ("30") apunta ≥4s por debajo (26). El writer debe
    // caber aquí; el guard determinista de escribirGuion lo vuelve a medir y pide recortar.
    const budget = presupuestoDialogoS(i.duracion);
    if (budget !== null) {
      s += `- ⏱️ PRESUPUESTO DE TIEMPO: el diálogo TOTAL de TODO el guión (sumando todos los planos) debe caber en ${budget}s de LECTURA — la cortinilla legal ocupa 2s aparte, ya descontados. A ~2.5 palabras/seg son ~${Math.round(budget * 2.5)} palabras de diálogo como TOPE. No te pases: recorta líneas o planos antes que exceder.\n`;
    }
    s += `- Estilo: ${ctx.variante === "real" ? "Real Person (persona real a cuadro)" : "Normal (V.O / formato innovador)"}\n`;
    s += `- Quién habla (locutor del diálogo): ${ctx.voz}\n`;
  } else {
    s += `- Tamaños: ${lista(i.tamanos)}\n`;
  }

  if (ctx.reglas.length) {
    s += "\nREGLAS DE MARCA QUE DEBES RESPETAR:\n";
    for (const r of ctx.reglas) s += `- ${r.mensaje}\n`;
  }
  if (ctx.legal) {
    s += `\nLEGAL APLICABLE (NO lo escribas en el copy; se adjunta desde la biblioteca): "${ctx.legal.title}" — ${ctx.legal.motivo}\n`;
  }
  s += "\nEscribe el " + (modo === "guion" ? "guión completo ahora." : "copy del estático ahora.");
  return s;
}

const s0 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Suma el read-time de TODO el diálogo del guión — MISMO cálculo que la barra
 *  inferior de la tarea (readTimeS por plano), para medir contra el mismo tope. */
function totalReadTimeS(planos: PlanoParsed[]): number {
  return planos.reduce((n, p) => n + readTimeS(p.dialogo), 0);
}

/** Una pasada del writer → PlanoParsed[]. `feedback` (en un retry) le entrega el
 *  sobrante EXACTO de tiempo a recortar. Reusa la misma tool-schema que extraerGuion. */
async function generarUnGuion(
  ctx: ContextoWriter,
  feedback: string | null,
): Promise<{ ok: true; planos: PlanoParsed[] } | { ok: false; error: string }> {
  const CAMPO = { type: "string" as const };
  const schema = {
    type: "object" as const,
    properties: {
      planos: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { titulo: CAMPO, accion: CAMPO, copy_in: CAMPO, sfx: CAMPO, gfx: CAMPO, edicion: CAMPO, dialogo: CAMPO },
          required: ["titulo", "accion", "copy_in", "sfx", "gfx", "edicion", "dialogo"],
          additionalProperties: false,
        },
      },
    },
    required: ["planos"],
    additionalProperties: false,
  };
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      thinking: { type: "disabled" },
      tools: [{ name: "emitir_planos", description: "Emite el guión escrito, un objeto por plano.", input_schema: schema }],
      tool_choice: { type: "tool", name: "emitir_planos" },
      messages: [
        {
          role: "user",
          // El bloque estable queda cacheado; en un retry sólo se agrega el feedback
          // al final, así el prefijo (rol+Cerebro+KB+ganadores) sigue haciendo cache hit.
          content: [
            { type: "text" as const, text: bloqueEstable(ctx, "guion"), cache_control: { type: "ephemeral" as const } },
            { type: "text" as const, text: bloqueVariable(ctx, "guion") },
            ...(feedback
              ? [{ type: "text" as const, text: `CORRECCIÓN OBLIGATORIA DE TIEMPO:\n${feedback}` }]
              : []),
          ],
        },
      ],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const crudos = (bloque?.input as { planos?: unknown[] } | undefined)?.planos;
    if (!Array.isArray(crudos) || crudos.length === 0) {
      return { ok: false, error: "H.Ü.E no devolvió un guión. Intenta de nuevo." };
    }
    const planos: PlanoParsed[] = crudos
      .slice(0, 40)
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          titulo: s0(o.titulo), accion: s0(o.accion), copy_in: s0(o.copy_in),
          sfx: s0(o.sfx), gfx: s0(o.gfx), edicion: s0(o.edicion),
          // El diálogo pasa por la MISMA normalización que "Pegar guión"
          // (convertirDialogo → "(Quién) texto"), para que la Vista cliente ponga el
          // locutor en negritas. Antes se guardaba crudo del modelo y no se seccionaba.
          dialogo: typeof o.dialogo === "string" ? s0(convertirDialogo(o.dialogo.split("\n"))) : null,
        };
      })
      .filter((p) => Object.values(p).some(Boolean)); // descarta planos totalmente vacíos (reap M6)
    if (!planos.length) return { ok: false, error: "H.Ü.E devolvió un guión vacío. Intenta de nuevo." };
    return { ok: true, planos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}

/**
 * Escribe el guión de video con un GUARD de tiempo determinista: genera, MIDE el
 * read-time total del diálogo y, si excede el presupuesto (objetivo bajo el tope − 2s de
 * cortinilla legal), REINTENTA (máx 2) dándole al modelo el sobrante exacto a recortar.
 * El prompt ya pedía caber en el tiempo pero el modelo se pasaba igual (guión de 48s en
 * un tope de ~38s): el prompt sugiere, el código mide y obliga — prompt + guard
 * determinista. Si tras los reintentos ninguno cabe, devuelve el MÁS CORTO (el humano
 * revisa/edita la vista previa igual). Sin duración legible, una sola pasada sin tope.
 */
export async function escribirGuion(ctx: ContextoWriter): Promise<{ ok: true; planos: PlanoParsed[] } | { ok: false; error: string }> {
  const budget = presupuestoDialogoS(ctx.idea.duracion);
  const MAX_INTENTOS = budget !== null ? 3 : 1;
  let mejor: { planos: PlanoParsed[]; segs: number } | null = null;
  let feedback: string | null = null;

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const r = await generarUnGuion(ctx, feedback);
    // Un error después de tener un candidato: quédate con el candidato (mejor eso que
    // fallar). Sin candidato: propaga el error.
    if (!r.ok) return mejor ? { ok: true, planos: mejor.planos } : r;
    if (budget === null) return { ok: true, planos: r.planos };

    const segs = totalReadTimeS(r.planos);
    if (segs <= budget) return { ok: true, planos: r.planos }; // cabe → listo
    if (!mejor || segs < mejor.segs) mejor = { planos: r.planos, segs }; // respaldo: el más corto

    const sobra = segs - budget;
    feedback =
      `Tu guión anterior dura ${segs}s de lectura y el TOPE es ${budget}s: se pasa por ${sobra}s ` +
      `(~${Math.round(sobra * 2.5)} palabras de más). Reescríbelo MÁS BREVE para caber en ${budget}s — quita o ` +
      `acorta líneas de diálogo (y planos enteros si hace falta), conservando el hook inicial y los selling ` +
      `points. CABER en el tiempo es la prioridad número uno.`;
  }
  // Ninguno cupo tras los reintentos → el más corto que logramos (el humano lo ajusta).
  return mejor
    ? { ok: true, planos: mejor.planos }
    : { ok: false, error: "H.Ü.E no devolvió un guión. Intenta de nuevo." };
}

/** Escribe el copy del estático → EstaticoParsed (legales_extra siempre null: el legal es de biblioteca). */
export async function escribirCopy(ctx: ContextoWriter): Promise<{ ok: true; estatico: EstaticoParsed } | { ok: false; error: string }> {
  const CAMPO = { type: "string" as const };
  const schema = {
    type: "object" as const,
    properties: { copy_titulo: CAMPO, copy_subtitulo: CAMPO, copy_cta: CAMPO },
    required: ["copy_titulo", "copy_subtitulo", "copy_cta"],
    additionalProperties: false,
  };
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "disabled" },
      tools: [{ name: "emitir_copy", description: "Emite el copy del estático (título/subtítulo/CTA).", input_schema: schema }],
      tool_choice: { type: "tool", name: "emitir_copy" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: bloqueEstable(ctx, "copy"), cache_control: { type: "ephemeral" } },
            { type: "text", text: bloqueVariable(ctx, "copy") },
          ],
        },
      ],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!bloque) return { ok: false, error: "H.Ü.E no devolvió el copy. Intenta de nuevo." };
    const o = bloque.input as Record<string, unknown>;
    const estatico: EstaticoParsed = {
      copy_titulo: s0(o.copy_titulo),
      copy_subtitulo: s0(o.copy_subtitulo),
      copy_cta: s0(o.copy_cta),
      legales_extra: null,
    };
    if (!estatico.copy_titulo && !estatico.copy_subtitulo && !estatico.copy_cta) {
      return { ok: false, error: "H.Ü.E devolvió un copy vacío. Intenta de nuevo." };
    }
    return { ok: true, estatico };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}
