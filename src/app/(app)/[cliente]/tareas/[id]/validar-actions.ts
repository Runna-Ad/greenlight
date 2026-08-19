"use server";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canOverrideStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";

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
 * Para cada corrección VIVA (sin resolver) de la tarea, pregunta a la IA si el
 * texto ACTUAL del campo ya refleja el cambio pedido. Sólo lectura + una llamada a
 * Claude; no escribe nada. Lo llama el revisor desde el panel.
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
    .select("id, body, target_tabla, target_fila_id, target_campo, target_quote")
    .eq("idea_id", ideaId)
    .eq("kind", "correction_request")
    .is("resolved_at", null)
    .order("created_at")
    .returns<Corr[]>();
  const correcciones = corrs ?? [];
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

  const bloques = correcciones
    .map((c) => {
      const texto = textoDe.get(`${c.target_tabla}|${c.target_fila_id}|${c.target_campo}`) ?? "(campo vacío)";
      const sobre = c.target_quote ? `«${c.target_quote}»` : "(todo el campo)";
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
          },
          required: ["correccion_id", "hecho", "razon"],
          additionalProperties: false,
        },
      },
    },
    required: ["veredictos"],
    additionalProperties: false,
  };

  const prompt =
    "Eres el asistente de un LEAD creativo que revisa si un especialista ya HIZO los " +
    "cambios que se le pidieron. Te doy una lista de cambios pedidos y, para cada uno, el " +
    "texto ACTUAL del campo. Para cada cambio, decide si el texto actual YA REFLEJA lo " +
    "pedido y repórtalo con la herramienta emitir_veredictos.\n\n" +
    "Para cada correccion_id:\n" +
    "- hecho='si' → el texto actual ya cumple lo pedido (el cambio se hizo).\n" +
    "- hecho='no' → el texto sigue igual o ignora la petición (no se hizo).\n" +
    "- hecho='parcial' → se intentó pero quedó incompleto, distinto a lo pedido, o no puedes " +
    "estar seguro.\n" +
    "- razon → UNA frase corta (máx ~15 palabras) en español explicando por qué.\n\n" +
    "REGLAS:\n" +
    "- Juzga por el SIGNIFICADO, no por coincidencia exacta de palabras: el texto original de " +
    "la cita casi siempre YA cambió (por eso se pidió el cambio) — eso es normal, no lo tomes " +
    "como 'no hecho'.\n" +
    "- Sé estricto pero justo. Ante la duda real, 'parcial'.\n" +
    "- Devuelve EXACTAMENTE un veredicto por cada correccion_id que te di.\n\n" +
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
      if (!validas.has(id)) continue; // sólo veredictos de correcciones reales
      veredictos.push({ correccionId: id, hecho, razon });
    }
    return { ok: true, veredictos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}
