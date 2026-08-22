import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { cargarWinners } from "@/lib/hue-data";

/**
 * El job de SÍNTESIS del loop de auto-aprendizaje (Fase 1 Etapa 2, sección E).
 *
 * UN SOLO TRABAJO (one-prompt-one-job): leer la Biblioteca de Ganadores y MINAR
 * PATRONES RECURRENTES, proponiendo lecciones nuevas al Cerebro (`hue_instructions`,
 * source='auto', con `reason` que cita los ganadores) + registrarlas en `hue_adaptations`.
 *
 * SEATBELT (no negociable): las lecciones auto son VISIBLES (badge auto + reason),
 * REVERSIBLES (el master las desactiva/borra) y el auto-run está detrás del switch
 * `hue_settings.auto_learn`. HONESTIDAD: son "patrones observados en tus ganadores",
 * NUNCA causas probadas — la síntesis NO sabe por qué ganaron en el mercado
 * (targeting/budget/timing pesan más que las palabras). Guarda determinista además del
 * prompt: dedupe vs lecciones activas + tope de cantidad/longitud.
 */

export type SintesisResultado =
  | { ok: true; nuevas: number; mensaje: string }
  | { ok: false; error: string };

const MAX_LECCIONES = 6;
const MAX_BODY = 500;

export async function correrSintesis(actorMemberId: string | null): Promise<SintesisResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };

  const winners = await cargarWinners();
  if (winners.length < 2) {
    return { ok: false, error: "Se necesitan al menos 2 guiones ganadores para encontrar patrones." };
  }

  const db = supabaseAdmin();
  // Dedupe vs TODAS las lecciones (activas E INACTIVAS): si el master revierte/desactiva
  // una lección auto, NO debe resucitar en el siguiente run (reap S2 — revert durable).
  const { data: existentesRaw } = await db.from("hue_instructions").select("title");
  const titulosExistentes = new Set(
    ((existentesRaw ?? []) as { title: string }[]).map((r) => r.title.toLowerCase().trim()),
  );

  // Corpus: el contenido de los ganadores (acción/copy/diálogo por plano).
  const corpus = winners
    .map((w, i) => {
      const guion = w.planos
        .map((p) =>
          [
            p.accion && `Acción: ${p.accion}`,
            p.copy_in && `Copy: ${p.copy_in}`,
            p.dialogo && `Diálogo: ${p.dialogo}`,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .filter(Boolean)
        .join("\n—\n");
      return `[Ganador ${i + 1} · ${w.clienteName} · ${w.namingBase ?? w.code ?? "s/n"}]\n${guion || "(sin contenido de guión)"}`;
    })
    .join("\n\n═══\n\n")
    .slice(0, 40000);

  const schema = {
    type: "object" as const,
    properties: {
      lecciones: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            body: { type: "string" as const },
            reason: { type: "string" as const },
          },
          required: ["title", "body", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["lecciones"],
    additionalProperties: false,
  };

  const instrucciones =
    "Eres un analista de guiones publicitarios. Te doy varios guiones que un humano marcó como " +
    "GANADORES. Tu ÚNICO trabajo: encontrar PATRONES RECURRENTES entre ellos y proponer lecciones " +
    "accionables para escribir futuros guiones. Repórtalas con la herramienta emitir_lecciones.\n\n" +
    "REGLAS ABSOLUTAS:\n" +
    "- Describe PATRONES OBSERVADOS ('los ganadores tienden a abrir con el beneficio en los primeros " +
    "2 segundos'), NUNCA causas probadas ('esto hace que el anuncio gane'). NO sabes por qué ganaron " +
    "en el mercado: el targeting, el presupuesto, el timing y el producto pesan más que las palabras. " +
    "Sólo estás observando qué tienen en COMÚN.\n" +
    "- Sólo patrones REALMENTE recurrentes (aparecen en 2+ ganadores). No inventes un patrón a partir " +
    "de un solo guión.\n" +
    "- Cada lección: title = etiqueta corta; body = la guía accionable (≤ ~80 palabras, en español); " +
    "reason = en qué ganadores/qué evidencia observaste el patrón.\n" +
    `- Máximo ${MAX_LECCIONES} lecciones — las más claras y útiles.\n` +
    "- NO repitas una lección que ya existe. Lecciones activas actuales (no las dupliques):\n" +
    (titulosExistentes.size ? [...titulosExistentes].map((t) => `  · ${t}`).join("\n") : "  (ninguna todavía)") +
    "\n\nGuiones ganadores:\n";

  let lecciones: { title: string; body: string; reason: string }[];
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 3000,
      thinking: { type: "disabled" },
      tools: [
        {
          name: "emitir_lecciones",
          description: "Emite las lecciones (patrones observados) minadas de los guiones ganadores.",
          input_schema: schema,
        },
      ],
      tool_choice: { type: "tool", name: "emitir_lecciones" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instrucciones, cache_control: { type: "ephemeral" } },
            { type: "text", text: corpus },
          ],
        },
      ],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    let crudos: unknown = (bloque?.input as { lecciones?: unknown } | undefined)?.lecciones;
    if (typeof crudos === "string") {
      try {
        const p: unknown = JSON.parse(crudos);
        crudos = Array.isArray(p) ? p : (p as { lecciones?: unknown } | null)?.lecciones;
      } catch {
        crudos = undefined;
      }
    }
    if (!Array.isArray(crudos)) return { ok: false, error: "H.Ü.E no devolvió lecciones válidas. Intenta de nuevo." };
    lecciones = crudos
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return {
          title: typeof o.title === "string" ? o.title.slice(0, 120).trim() : "",
          body: typeof o.body === "string" ? o.body.slice(0, MAX_BODY).trim() : "",
          reason: typeof o.reason === "string" ? o.reason.slice(0, 300).trim() : "",
        };
      })
      // Guarda determinista: descarta vacías y dedupe vs lecciones activas.
      .filter((l) => l.title && l.body && !titulosExistentes.has(l.title.toLowerCase().trim()))
      .slice(0, MAX_LECCIONES);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }

  // Marca que corrimos síntesis sobre este set de ganadores (debounce del auto-run: no
  // re-sintetizar sin un ganador nuevo — reap S3).
  await db.from("hue_settings").update({ last_synth_at: new Date().toISOString() }).eq("id", 1);

  if (!lecciones.length) {
    return { ok: true, nuevas: 0, mensaje: "H.Ü.E no encontró patrones nuevos (ya están todos en el Cerebro)." };
  }

  // Inserta cada lección auto como PROPUESTA (active=false): visible + auditable, pero NO
  // cuenta hasta que el master la active (reap S3 — propose, master aprueba; evita inundar
  // el Cerebro de parafraseos que alimentarían al writer sin revisión). + su fila de auditoría.
  let nuevas = 0;
  for (const l of lecciones) {
    const { data: ins, error } = await db
      .from("hue_instructions")
      .insert({
        scope: "global",
        title: l.title,
        body: l.body,
        source: "auto",
        active: false,
        reason: l.reason || `Patrón observado en ${winners.length} guiones ganadores`,
        created_by: actorMemberId,
      })
      .select("id, version")
      .single();
    if (error || !ins) continue;
    const fila = ins as { id: string; version: number };
    await db.from("hue_adaptations").insert({
      trigger_summary: `Síntesis de ${winners.length} ganadores → lección "${l.title}"`,
      changed_instruction_id: fila.id,
      from_version: null,
      to_version: fila.version,
      applied_by: "auto",
    });
    nuevas++;
  }

  return {
    ok: true,
    nuevas,
    mensaje: `H.Ü.E propuso ${nuevas} ${nuevas === 1 ? "lección nueva (inactiva)" : "lecciones nuevas (inactivas)"} — revísalas y actívalas en el Cerebro.`,
  };
}

/** Corre la síntesis SÓLO si el switch global auto_learn está encendido. La llama el
 *  seam de "estrellar un ganador" (after()). Silenciosa si está apagado o falla. */
export async function sintetizarSiAuto(actorMemberId: string | null): Promise<void> {
  try {
    if (!hasSupabase()) return;
    const db = supabaseAdmin();
    const { data: st } = await db.from("hue_settings").select("auto_learn, last_synth_at").eq("id", 1).maybeSingle();
    const s = st as { auto_learn: boolean; last_synth_at: string | null } | null;
    if (!s?.auto_learn) return;
    // Debounce: sólo re-sintetiza si el ganador MÁS RECIENTE es más nuevo que el último
    // run — así un re-estrellado (mismo starred_at) o un run reciente no dispara otra
    // corrida completa (reap S3). starred_at NO se toca en el upsert de re-estrellar.
    const { data: ultimo } = await db
      .from("hue_top_performers")
      .select("starred_at")
      .order("starred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultStar = (ultimo as { starred_at: string } | null)?.starred_at ?? null;
    if (s.last_synth_at && ultStar && ultStar <= s.last_synth_at) return;
    await correrSintesis(actorMemberId);
  } catch (e) {
    console.error("[hue-sintesis] sintetizarSiAuto falló", e);
  }
}
