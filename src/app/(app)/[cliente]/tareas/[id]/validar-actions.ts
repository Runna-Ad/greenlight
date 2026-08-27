"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import { sinNegrita } from "@/lib/negrita";
import { registrarVeredictos, marcarVeredictoAplicado, ignorarVeredicto } from "@/lib/hue-log";

/**
 * Veredicto ADVISORY de la IA sobre si un cambio pedido ya se hizo en el texto
 * actual. Nunca cierra la corrección sola — sólo ayuda al revisor a confirmar más
 * rápido (y a no perder los que se ancla­ron a texto que ya cambió). El humano
 * decide; la IA opina. Misma disciplina que H.Ü.E.
 */
export type VeredictoCambio = {
  correccionId: string;
  hecho: "si" | "no" | "parcial";
  razon: string;
  /** Qué hacer: si no está (o quedó a medias), cómo lograrlo; si está, confírmalo. */
  sugerencia: string;
  /** Texto COMPLETO y final que debería tener el campo con la sugerencia ya aplicada,
   *  listo para reemplazar de un clic ("Aplicar"). null si no hay algo concreto que aplicar. */
  aplicar: string | null;
};

const LABEL_PLANO: Record<string, string> = {
  titulo: "Plano",
  accion: "Acción",
  copy_in: "Copy in",
  sfx: "SFX",
  gfx: "GFX",
  edicion: "Edición",
  dialogo: "Diálogos",
};
const LABEL_ESTATICO: Record<string, string> = {
  copy_titulo: "Título",
  copy_subtitulo: "Subtítulo",
  copy_cta: "Botón CTA",
  legales_extra: "Legales",
  referencia_nota: "Nota de diseño",
};
const CAMPOS_PLANO = Object.keys(LABEL_PLANO);
const CAMPOS_ESTATICO = Object.keys(LABEL_ESTATICO);

type Corr = {
  id: string;
  body: string;
  target_tabla: string | null;
  target_fila_id: string | null;
  target_campo: string | null;
  target_quote: string | null;
};

/**
 * Para cada cambio de la RONDA MÁS RECIENTE de la tarea, pregunta a la IA si el
 * texto ACTUAL del campo ya refleja lo pedido. Incluye cambios que el lead ya
 * confirmó: H.Ü.E es un asistente de revisión que debe estar disponible en el
 * momento de revisar, no sólo mientras quedan cambios sin cerrar (antes se ataba
 * a `resolved_at is null`, así que desaparecía justo cuando el lead ya había
 * confirmado todo — que es cuando lo buscaba). Sólo lectura + una llamada a
 * Claude; no escribe nada ni cierra nada. Lo llama el revisor.
 */
export async function validarCambios(
  ideaId: string,
): Promise<{ ok: true; veredictos: VeredictoCambio[] } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  }
  const role = await getViewAs();
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead valida cambios." };
  // Scope: el lead sólo valida tareas de SU track (admin/master, todas). Sin esto
  // se podían leer correcciones + texto actual de una tarea de otro track/cliente
  // por ideaId. (reap 2026-08-26)
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

  const db = supabaseAdmin();
  // Incluye los cambios del CLIENTE enviados (ronda not null): son correcciones de
  // primera clase (0038) → H.Ü.E también los analiza (¿ya se hizo lo que pidió el
  // cliente?). Los borradores (ronda null) no existen en revisión, no entran.
  const { data: corrs } = await db
    .from("comments")
    .select("id, body, ronda, target_tabla, target_fila_id, target_campo, target_quote")
    .eq("idea_id", ideaId)
    .or("kind.eq.correction_request,and(kind.eq.client_change,ronda.not.is.null)")
    .order("created_at")
    .returns<(Corr & { ronda: number | null })[]>();
  const todas = corrs ?? [];
  // La ronda más reciente = lo último que el especialista trabajó. Se revisa esa
  // ronda completa (confirmados incluidos), no sólo lo que sigue sin cerrar. Las
  // correcciones legacy SIN ronda (ronda=null) se bucketean en la ronda ACTUAL (no en la
  // 1), para no quedar fuera si un client_change ya va en ronda ≥2 (reap 2026-08-20).
  const maxRonda = todas.length ? Math.max(1, ...todas.map((c) => c.ronda ?? 0)) : 0;
  const correcciones: Corr[] = todas.filter((c) => (c.ronda ?? maxRonda) === maxRonda);
  if (!correcciones.length) return { ok: true, veredictos: [] };

  // Texto ACTUAL de cada campo (planos/estáticos). La corrección se pidió sobre una
  // versión vieja; comparamos contra lo que hay HOY (ya autoguardado).
  const [{ data: planos }, { data: est }] = await Promise.all([
    db
      .from("planos")
      .select("id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo")
      .eq("idea_id", ideaId),
    db
      .from("estaticos")
      // referencia_nota va incluido: CAMPOS_ESTATICO lo itera y sin traerlo la IA
      // vería "(campo vacío)" y daría un veredicto falso para ese campo.
      .select("id, copy_titulo, copy_subtitulo, copy_cta, legales_extra, referencia_nota")
      .eq("idea_id", ideaId)
      .order("orden")
      .limit(1)
      .maybeSingle(),
  ]);

  const textoDe = new Map<string, string>();
  const ordenDe = new Map<string, number>();
  for (const p of (planos ?? []) as Record<string, unknown>[]) {
    const id = typeof p.id === "string" ? p.id : "";
    if (!id) continue;
    ordenDe.set(id, typeof p.orden === "number" ? p.orden : 0);
    for (const campo of CAMPOS_PLANO) {
      const v = p[campo];
      if (typeof v === "string") textoDe.set(`planos|${id}|${campo}`, v);
    }
  }
  if (est) {
    const e = est as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    if (id) for (const campo of CAMPOS_ESTATICO) {
      const v = e[campo];
      if (typeof v === "string") textoDe.set(`estaticos|${id}|${campo}`, v);
    }
  }

  const etiqueta = (c: Corr): string => {
    const base =
      c.target_tabla === "estaticos"
        ? LABEL_ESTATICO[c.target_campo ?? ""] ?? c.target_campo ?? "Campo"
        : `Plano ${ordenDe.get(c.target_fila_id ?? "") ?? "?"} · ${LABEL_PLANO[c.target_campo ?? ""] ?? c.target_campo ?? "Campo"}`;
    return base;
  };

  // Se quitan los marcadores de negrita `**` del texto actual y de la cita: la IA
  // juzga el copy limpio (los `**` son formato, no contenido) — así el veredicto no
  // se confunde por los marcadores.
  // Texto ACTUAL con su negrita markdown INTACTA (`**…**`): H.Ü.E debe CONSERVAR esos
  // marcadores en `aplicar`, o "Aplicar" borraría la negrita del campo (precios/ofertas
  // llevan negrita). Sólo la CITA va limpia (se capturó en espacio limpio). Para contenido
  // SIN negrita el input es idéntico al de antes (no hay `**` que mostrar) → el veredicto no
  // cambia; sólo difiere cuando el campo trae `**`, que es justo lo que hay que preservar.
  const rawDe = new Map<string, string>();
  for (const c of correcciones) {
    rawDe.set(c.id, textoDe.get(`${c.target_tabla}|${c.target_fila_id}|${c.target_campo}`) ?? "(campo vacío)");
  }
  const bloques = correcciones
    .map((c) => {
      const texto = rawDe.get(c.id) ?? "(campo vacío)";
      const sobre = c.target_quote ? `«${sinNegrita(c.target_quote)}»` : "(todo el campo)";
      return `[id=${c.id}] ${etiqueta(c)}\nCambio pedido sobre ${sobre}: ${c.body}\nTexto ACTUAL del campo:\n${texto}`;
    })
    .join("\n\n---\n\n");

  const schema = {
    type: "object" as const,
    properties: {
      veredictos: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            correccion_id: { type: "string" as const },
            hecho: { type: "string" as const, enum: ["si", "no", "parcial"] },
            razon: { type: "string" as const },
            sugerencia: { type: "string" as const },
            aplicar: { type: "string" as const },
          },
          required: ["correccion_id", "hecho", "razon", "sugerencia", "aplicar"],
          additionalProperties: false,
        },
      },
    },
    required: ["veredictos"],
    additionalProperties: false,
  };

  // Instrucciones ESTABLES (idénticas en cada llamada y en cada tarea). Se mandan como un
  // bloque de contenido aparte de los `bloques` variables para poder cachearlas (abajo).
  const instrucciones =
    "Eres el asistente de un LEAD creativo. Tu trabajo tiene DOS partes: (1) decidir si el " +
    "especialista ya hizo el cambio pedido, y (2) — aquí está tu mayor valor como IA — detectar si " +
    "el cambio dejó un PROBLEMA NUEVO. Te doy, para cada cambio: la frase original citada, lo que se " +
    "pidió, y el texto ACTUAL del campo. Repórtalo con la herramienta emitir_veredictos.\n\n" +
    "Para cada correccion_id devuelve:\n" +
    "- hecho='si' → el texto actual ya cumple lo pedido (aunque el cambio sea pequeño).\n" +
    "- hecho='parcial' → se intentó (el texto CAMBIÓ respecto a la cita) pero quedó incompleto o " +
    "distinto a lo pedido.\n" +
    "- hecho='no' → SÓLO si el texto NO cambió o sigue con el mismo problema original.\n" +
    "- razon → UNA frase corta (máx ~15 palabras) que explique tu veredicto.\n" +
    "- sugerencia → UNA frase concreta y accionable. AUNQUE el cambio esté HECHO, revisa si dejó un " +
    "problema NUEVO (concordancia de número/género, gramática, coherencia, sentido) y proponlo con el " +
    "arreglo exacto. Si no está o quedó a medias, propón cómo lograrlo.\n" +
    "- aplicar → el TEXTO COMPLETO Y FINAL que debería tener el campo con tu sugerencia YA aplicada " +
    "(todo el campo, no sólo la frase; edición MÍNIMA sobre el texto actual, conservando lo demás tal " +
    "cual). Si el texto trae **negrita** en markdown, CONSÉRVALA EXACTA en aplicar (los mismos `**`, sin " +
    "quitarlos ni agregarlos). Debe quedar listo para reemplazar el campo de un clic. Deja aplicar='' " +
    "(vacío) SÓLO si no hay un texto concreto que aplicar (petición ambigua, o ya está perfecto y sólo " +
    "hay que confirmarlo).\n\n" +
    "CÓMO LEER LA PETICIÓN (aquí se falla más):\n" +
    "- La petición a veces ES el reemplazo deseado: cita «X» + petición 'Y' significa 'cambia «X» por " +
    "Y'. Si el texto ya dice Y, está HECHO ('si'). EJEMPLO: cita «elementos», petición 'elemento' = " +
    "hazlo singular; si ahora el texto dice 'elemento', es 'si' — y si quedó 'elemento importantes' " +
    "(no concuerda en número), la sugerencia debe ser 'usa el elemento importante'.\n" +
    "- La cita original CASI SIEMPRE ya cambió (por eso se pidió): eso es un INTENTO, nunca 'no'. Si el " +
    "texto cambió respecto a la cita, el mínimo es 'parcial'.\n" +
    "- Peticiones vagas o telegráficas ('más punch', 'especificar'): interpreta la intención con " +
    "generosidad; juzga por SIGNIFICADO, no por palabras exactas; ante duda real usa 'parcial', no 'no'.\n" +
    "- Sé justo, no castigues. Devuelve EXACTAMENTE un veredicto por cada correccion_id.\n\n" +
    "Cambios pedidos:\n";

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4000,
      thinking: { type: "disabled" },
      tools: [
        {
          name: "emitir_veredictos",
          description: "Emite el veredicto (hecho/no/parcial) de cada cambio pedido.",
          input_schema: schema,
        },
      ],
      tool_choice: { type: "tool", name: "emitir_veredictos" },
      // Prompt caching: el prefijo estable (tools + instrucciones, idéntico en cada llamada
      // y tarea) se marca cacheable con un breakpoint en el bloque de instrucciones. Un cache
      // hit cuesta 0.1x el precio de input (y baja la latencia). El modelo ve el MISMO texto
      // concatenado (instrucciones + bloques), sólo repartido en dos bloques de contenido →
      // cero cambio de comportamiento sobre el prompt ya tuneado. Los `bloques` variables
      // quedan después del breakpoint, así que no rompen el cache.
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instrucciones, cache_control: { type: "ephemeral" } },
            { type: "text", text: bloques },
          ],
        },
      ],
    });

    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    let crudos: unknown = (bloque?.input as { veredictos?: unknown } | undefined)?.veredictos;
    if (typeof crudos === "string") {
      try {
        const p: unknown = JSON.parse(crudos);
        crudos = Array.isArray(p) ? p : (p as { veredictos?: unknown } | null)?.veredictos;
      } catch {
        crudos = undefined;
      }
    }
    // Respuesta no parseable ≠ "no hay nada que validar": devolvemos error (si no, el
    // cliente muestra "no hay cambios pendientes" cuando en realidad H.Ü.E falló) (reap).
    if (!Array.isArray(crudos))
      return { ok: false, error: "H.Ü.E no devolvió un resultado válido. Intenta de nuevo." };

    const validas = new Set(correcciones.map((c) => c.id));
    const veredictos: VeredictoCambio[] = [];
    for (const raw of crudos) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const id = typeof o.correccion_id === "string" ? o.correccion_id : "";
      const hecho = o.hecho === "si" || o.hecho === "no" || o.hecho === "parcial" ? o.hecho : "parcial";
      const razon = typeof o.razon === "string" ? o.razon.slice(0, 160) : "";
      const sugerencia = typeof o.sugerencia === "string" ? o.sugerencia.slice(0, 240) : "";
      // aplicar: el texto completo del campo con la sugerencia; vacío → null (nada que aplicar).
      let aplicar = typeof o.aplicar === "string" && o.aplicar.trim() ? o.aplicar : null;
      if (!validas.has(id)) continue; // sólo veredictos de correcciones reales
      // Guardas DETERMINISTAS sobre el texto que se escribiría de un clic (el prompt no basta
      // — H.Ü.E reescribe TODO el campo). El lead además ve el texto completo antes de aplicar.
      const orig = rawDe.get(id) ?? "";
      if (aplicar) {
        // (a) Negrita: si el campo traía `**` y aplicar los perdió, aplicarlo borraría la
        //     negrita (precios/ofertas) → no ofrecer el botón.
        if (orig.includes("**") && !aplicar.includes("**")) aplicar = null;
        // (b) El placeholder "(campo vacío)" NUNCA es contenido real → nunca escribirlo.
        else if (aplicar.includes("(campo vacío)")) aplicar = null;
        // (c) Longitud desbocada (el modelo se fue de largo) → no ofrecer un reemplazo gigante.
        else if (aplicar.length > 8000) aplicar = null;
      }
      veredictos.push({ correccionId: id, hecho, razon, sugerencia, aplicar });
    }
    // Bitácora de adopción (best-effort): registra lo que H.Ü.E ofreció, con el campo
    // destino de cada corrección. Idempotente por corrección (upsert). Se DIFIERE con
    // after() para no acoplar la latencia de la respuesta a este write.
    const porCorr = new Map(correcciones.map((c) => [c.id, c]));
    const soyId = await getSoyId();
    const filas = veredictos.map((v) => {
      const c = porCorr.get(v.correccionId);
      return {
        correccionId: v.correccionId,
        hecho: v.hecho,
        sugerencia: v.sugerencia,
        targetTabla: c?.target_tabla ?? null,
        targetFilaId: c?.target_fila_id ?? null,
        targetCampo: c?.target_campo ?? null,
      };
    });
    after(() => registrarVeredictos(ideaId, soyId, filas));
    return { ok: true, veredictos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}

/**
 * Aplica la sugerencia de H.Ü.E directo al campo: escribe `textoNuevo` (el texto
 * completo que propuso H.Ü.E) en el campo al que apunta la corrección. Sólo el lead
 * (canOverrideStatus). ADVISORY→acción: el lead decide aplicar; la IA sólo propuso.
 * No cierra la corrección — el lead revisa el resultado y confirma.
 */
export async function aplicarSugerencia(
  ideaId: string,
  clienteSlug: string,
  correccionId: string,
  textoNuevo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  const role = await getViewAs();
  if (!canOverrideStatus(role)) return { ok: false, error: "Sólo un lead aplica sugerencias." };
  // Scope: sin esto un lead podía ESCRIBIR texto arbitrario en el campo de una
  // tarea de otro track/cliente (sólo se validaba correccionId↔ideaId, no que la
  // tarea fuera suya). (reap 2026-08-26)
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  if (!textoNuevo.trim()) return { ok: false, error: "No hay texto que aplicar." };

  const db = supabaseAdmin();
  // La corrección dice a qué campo aplicar. Scope por idea_id: no se toca otra tarea.
  const { data: corr } = await db
    .from("comments")
    .select("target_tabla, target_fila_id, target_campo")
    .eq("id", correccionId)
    .eq("idea_id", ideaId)
    .maybeSingle<{ target_tabla: string | null; target_fila_id: string | null; target_campo: string | null }>();
  if (!corr?.target_tabla || !corr.target_fila_id || !corr.target_campo) {
    return { ok: false, error: "Esta corrección no apunta a un campo." };
  }
  // Whitelist de tabla + campo (nunca un nombre de columna arbitrario).
  if (corr.target_tabla !== "planos" && corr.target_tabla !== "estaticos") {
    return { ok: false, error: "Destino no válido." };
  }
  const campos = corr.target_tabla === "estaticos" ? CAMPOS_ESTATICO : CAMPOS_PLANO;
  if (!campos.includes(corr.target_campo)) return { ok: false, error: "Campo no válido." };

  const { data: escritos, error } = await db
    .from(corr.target_tabla)
    .update({ [corr.target_campo]: textoNuevo })
    .eq("id", corr.target_fila_id)
    .eq("idea_id", ideaId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // 0 filas = la fila objetivo ya no existe (p. ej. el plano se borró): el update no tocó
  // nada pero devuelve error=null. Sin este check reportaríamos "aplicado" en falso y el
  // cliente parchearía memoria con un texto que la DB no tiene (reap 2026-08-20).
  if (!escritos?.length) return { ok: false, error: "El campo ya no existe (¿se borró el plano?)." };

  // Evaluación v2: sella que el lead APLICÓ la sugerencia de H.Ü.E sobre esta corrección
  // (rework fallido del especialista si la nota ya estaba atendida). Best-effort — el apply
  // ya valió; si el sello falla no revertimos ni bloqueamos.
  await db
    .from("comments")
    .update({ hue_aplicado_at: new Date().toISOString() })
    .eq("id", correccionId)
    .eq("idea_id", ideaId);

  // Bitácora de adopción: sella la sugerencia como APLICADA (best-effort, diferido).
  after(() => marcarVeredictoAplicado(ideaId, correccionId));

  // Ruta como PATRÓN (no con ids concretos, que serían un no-op silencioso — lección guardarCampo).
  revalidatePath("/[cliente]/tareas/[id]", "page");
  return { ok: true };
}

/**
 * Marca el veredicto de una corrección como IGNORADO (el lead la confirmó/cerró sin
 * aplicar la sugerencia de H.Ü.E). Señal de adopción; best-effort, no pisa un 'applied'.
 * La llama el provider al confirmar una corrección.
 */
export async function marcarVeredictoIgnorado(
  ideaId: string,
  correccionId: string,
): Promise<{ ok: boolean }> {
  if (!hasSupabase()) return { ok: false };
  const role = await getViewAs();
  if (!canOverrideStatus(role)) return { ok: false };
  // Scope: un lead sólo sobre tareas de su track — como sus hermanas del archivo. (reap I2)
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false };
  await ignorarVeredicto(ideaId, correccionId);
  return { ok: true };
}
