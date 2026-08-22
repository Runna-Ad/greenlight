import "server-only";

/**
 * Extrae texto plano de un documento del KB de H.Ü.E (pdf / docx / txt / md). El texto
 * se guarda en `hue_kb_documents.extracted_text` para que el writer de Fase 2 lo inyecte
 * ENTERO en su prompt cacheado — sin embeddings, sin RAG (el KB es un binder delgado).
 *
 * Server-only: unpdf y mammoth son de Node. Se importan DINÁMICAMENTE para que sólo se
 * carguen cuando de verdad se procesa una subida (no en cada request del admin).
 */
export async function extraerTextoKb(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<string> {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const esPdf = mime === "application/pdf" || ext === "pdf";
  const esDocx = mime.includes("wordprocessingml") || ext === "docx";

  if (esPdf) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  }

  if (esDocx) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value.trim();
  }

  // txt / md / cualquier texto plano
  return Buffer.from(bytes).toString("utf8").trim();
}

/** MIME types aceptados en el KB (espejo de la config del bucket greenlight-kb). */
export const KB_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);

/** True si un mime/nombre es un tipo de KB aceptado (defensa además del bucket). */
export function esKbValido(mime: string, filename: string): boolean {
  if (KB_MIMES.has(mime)) return true;
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  return ["pdf", "docx", "txt", "md"].includes(ext);
}
