// Notion → texto con estructura (markdown sencillo), PURO: sin red, se prueba con un árbol
// de ejemplo. Lo usa la sincronización de las páginas de marca (Onboarding y Lineamientos de
// DiDi Card / DiDi Préstamos) para que H.Ü.E las lea tal cual están hoy en Notion.
import { blockText, type Block } from "./notion-legales-parse.ts";

/** Las páginas de Notion que H.Ü.E lee, por marca. Los ids no son secretos (como el de
 *  legales); el TOKEN sí, y vive sólo en el servidor. Ubicadas el 2026-11-06 con
 *  /api/notion/explorar (lo que ve la conexión de Greenlight). */
export type PaginaMarca = { marca: "card" | "prestamos"; tipo: "onboarding" | "lineamientos"; id: string; titulo: string };
export const PAGINAS_MARCA: PaginaMarca[] = [
  { marca: "card", tipo: "onboarding", id: "326724f6-221e-8045-9813-cc1e86ef250e", titulo: "Onboarding | DiDi Card" },
  { marca: "card", tipo: "lineamientos", id: "33e724f6-221e-80bf-b07a-dc49e0b96ad8", titulo: "Lineamientos | DiDi Card" },
  { marca: "prestamos", tipo: "onboarding", id: "33d724f6-221e-804c-8d63-d92b88671ad2", titulo: "Onboarding | DiDi Préstamos" },
  { marca: "prestamos", tipo: "lineamientos", id: "326724f6-221e-8009-a576-d10868eda5a4", titulo: "Lineamientos | DiDi Préstamos" },
];

/** La llave con la que se guarda cada página en hue_kb_documents.storage_path. */
export const llaveNotion = (p: Pick<PaginaMarca, "tipo" | "id">) => `notion:${p.tipo}:${p.id}`;
export const esLlaveNotion = (s: string | null | undefined) => !!s && s.startsWith("notion:");

/** Árbol de bloques → texto. Encabezados con #, toggles como subtítulo en negrita,
 *  listas con guion y sangría por nivel. Imágenes y bloques vacíos se omiten. */
export function renderNotion(bloques: Block[], nivel = 0): string {
  const out: string[] = [];
  const sangria = "  ".repeat(nivel);
  let n = 0;
  for (const b of bloques) {
    const t = blockText(b).trim();
    const hijos = b.children?.length ? renderNotion(b.children, b.type === "column_list" || b.type === "column" ? nivel : nivel + 1) : "";
    n = b.type === "numbered_list_item" ? n + 1 : 0;
    switch (b.type) {
      case "heading_1": if (t) out.push(`\n# ${t}`); break;
      case "heading_2": if (t) out.push(`\n## ${t}`); break;
      case "heading_3": if (t) out.push(`\n### ${t}`); break;
      case "toggle": if (t) out.push(`${sangria}**${t}**`); break;
      case "bulleted_list_item": if (t) out.push(`${sangria}- ${t.replace(/\n/g, `\n${sangria}  `)}`); break;
      case "numbered_list_item": if (t) out.push(`${sangria}${n}. ${t.replace(/\n/g, `\n${sangria}   `)}`); break;
      case "to_do": if (t) out.push(`${sangria}- ${t}`); break;
      case "callout":
      case "quote": if (t) out.push(`${sangria}> ${t.replace(/\n/g, `\n${sangria}> `)}`); break;
      case "paragraph": if (t) out.push(`${sangria}${t}`); break;
      case "child_page": {
        const titulo = (b.child_page as { title?: string } | undefined)?.title;
        if (titulo) out.push(`${sangria}[Página: ${titulo}]`);
        break;
      }
      default: if (t) out.push(`${sangria}${t}`);
    }
    if (hijos) out.push(hijos);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
