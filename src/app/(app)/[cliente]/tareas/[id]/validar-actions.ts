"use server";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { sinNegrita } from "@/lib/negrita";

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

  const db = supabaseAdmin();
  const { data: corrs } = await db
    .from("comments")
    .select("id, body, ronda, target_tabla, target_fila_id, target_campo, target_quote")
    .eq("idea_id", ideaId)
    .eq("kind", "correction_request")
    .order("created_at")
    .returns<(Corr & { ronda: number | null })[]>();
  const todas = corrs ?? [];
  // La ronda más reciente = lo último que el especialista trabajó. Se revisa esa
  // ronda completa (confirmados incluidos), no sólo lo que sigue sin cerrar.
  const maxRonda = todas.length ? Math.max(...todas.map((c) => c.ronda ?? 1)) : 0;
  const correcciones: Corr[] = todas.filter((c) => (c.ronda ?? 1) === maxRonda);
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
  const bloques = correcciones
    .map((c) => {
      const texto = sinNegrita(
        textoDe.get(`${c.target_tabla}|${c.target_fila_id}|${c.target_campo}`) ?? "(campo vacío)",
      );
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
          },
          required: ["correccion_id", "hecho", "razon", "sugerencia"],
          additionalProperties: false,
        },
      },
    },
    required: ["veredictos"],
    additionalProperties: false,
  };

  const prompt =
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
    "arreglo exacto. Si no está o quedó a medias, propón cómo lograrlo.\n\n" +
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
    "Cambios pedidos:\n" + bloques;

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
      messages: [{ role: "user", content: prompt }],
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
    if (!Array.isArray(crudos)) return { ok: true, veredictos: [] };

    const validas = new Set(correcciones.map((c) => c.id));
    const veredictos: VeredictoCambio[] = [];
    for (const raw of crudos) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const id = typeof o.correccion_id === "string" ? o.correccion_id : "";
      const hecho = o.hecho === "si" || o.hecho === "no" || o.hecho === "parcial" ? o.hecho : "parcial";
      const razon = typeof o.razon === "string" ? o.razon.slice(0, 160) : "";
      const sugerencia = typeof o.sugerencia === "string" ? o.sugerencia.slice(0, 240) : "";
      if (!validas.has(id)) continue; // sólo veredictos de correcciones reales
      veredictos.push({ correccionId: id, hecho, razon, sugerencia });
    }
    return { ok: true, veredictos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}
