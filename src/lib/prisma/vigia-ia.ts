import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "@/lib/prisma/writer";
import { bloqueVigia, PROPUESTAS_SCHEMA, type EntradaVigia } from "@/lib/prisma/prompts/vigia";
import { sanearPropuestas, type Propuesta } from "@/lib/prisma/vigia";
import { cercado } from "@/lib/prisma/texto";
import { listaDe } from "@/lib/prisma/json";

/** F6b — H.Ü.E lee lo nuevo de una fuente y propone. Lo que devuelve pasa por sanearPropuestas: sin cita
 *  literal (contra el MISMO texto que leyó) o con contenido fuera de forma, se tira. */
export async function proponerCambios(e: EntradaVigia): Promise<{ ok: true; propuestas: Propuesta[]; tokens: number } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  try {
    // 60 s por llamada y un reintento: una llamada colgada no puede llevarse la corrida entera (tope de 300 s).
    const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: "disabled" },
      tools: [{ name: "emitir_propuestas", description: "Report the proposed knowledge changes (possibly none).", input_schema: PROPUESTAS_SCHEMA as unknown as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "emitir_propuestas" },
      messages: [{ role: "user", content: bloqueVigia(e) }],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!bloque || res.stop_reason === "max_tokens") console.warn(`[prisma/vigia] ${bloque ? "cortado por max_tokens" : "sin tool_use"} (stop_reason=${res.stop_reason})`);
    const crudo = (bloque?.input as { propuestas?: unknown } | undefined)?.propuestas ?? bloque?.input;
    // La cita se compara contra el texto TAL COMO lo vio el modelo (cercado).
    const propuestas = sanearPropuestas(crudo, e.nuevos.map((p) => cercado(p)), e.fuente.tool);
    const tiradas = listaDe(crudo, "propuestas").length - propuestas.length;
    if (tiradas > 0) console.warn(`[prisma/vigia] ${e.fuente.url}: ${tiradas} propuesta(s) sin cita literal o fuera de forma, descartadas.`);
    return { ok: true, propuestas, tokens: res.usage.input_tokens + res.usage.output_tokens };
  } catch (err) {
    console.error("[prisma/vigia] proponerCambios:", err instanceof Error ? err.message : err);
    return { ok: false, error: "H.Ü.E no respondió." };
  }
}
