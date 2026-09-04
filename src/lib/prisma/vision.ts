import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { VisualDNA } from "@/lib/prisma/spec";
import { BLOQUE_VISION } from "@/lib/prisma/prompts/writer";
import { MODEL, type Uso } from "@/lib/prisma/writer";

/**
 * HÜE Prisma — el pase de VISIÓN. Lee una referencia y devuelve una caption corta +
 * el ADN visual (luz, lente, paleta, mood, composición, textura). Es lo que Roco NO
 * hacía (sólo captions): el ADN es lo que permite que el prompt IGUALE la referencia.
 * Server-only; la imagen llega en base64 desde la server action (bucket privado).
 */

export type Vision = { caption: string; dna: VisualDNA };

const ADN_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string" },
    dna: {
      type: "object",
      properties: {
        luz: { type: "string" },
        lente: { type: "string" },
        paleta: { type: "array", items: { type: "string" } },
        mood: { type: "string" },
        composicion: { type: "string" },
        textura: { type: "string" },
      },
      required: ["luz", "lente", "paleta", "mood", "composicion", "textura"],
    },
  },
  required: ["caption", "dna"],
};

type Mime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const s0 = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function analizarReferencia(base64: string, mime: Mime): Promise<{ ok: true; vision: Vision; usage: Uso } | { ok: false; error: string }> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: BLOQUE_VISION, cache_control: { type: "ephemeral" } }],
      tools: [{ name: "emitir_adn", description: "Report the caption and visual DNA of the image.", input_schema: ADN_SCHEMA as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "tool", name: "emitir_adn" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: "Analyze this reference image with emitir_adn." },
          ],
        },
      ],
    });
    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const input = (bloque?.input ?? {}) as Record<string, unknown>;
    const d = (input.dna ?? {}) as Record<string, unknown>;
    const vision: Vision = {
      caption: s0(input.caption),
      dna: {
        luz: s0(d.luz),
        lente: s0(d.lente),
        paleta: Array.isArray(d.paleta) ? d.paleta.filter((x): x is string => typeof x === "string").slice(0, 5) : [],
        mood: s0(d.mood),
        composicion: s0(d.composicion),
        textura: s0(d.textura),
      },
    };
    if (!vision.caption) return { ok: false, error: "H.Ü.E no pudo leer la imagen." };
    const u = res.usage;
    return { ok: true, vision, usage: { input: u.input_tokens, output: u.output_tokens, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0 } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al llamar a H.Ü.E." };
  }
}
