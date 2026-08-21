import "server-only";
import { parseLegales, type Block, type ParsedLegal, type ParsedRule } from "./notion-legales-parse";

// Baja los LEGALES desde el doc de Notion (fuente de verdad; cambian con el tiempo)
// y los parsea a snippets. Sólo lectura — nunca escribe a Notion. El parser vive en
// `notion-legales-parse.ts` (puro, testeable); aquí sólo va la red (server-only).

const NOTION_VERSION = "2022-06-28";

// La página de legales de DiDi (del URL que compartió Pedro). NO es secreto;
// override por env si algún día hay otra página. El TOKEN sí es secreto (env).
export const NOTION_LEGALES_PAGE_ID =
  process.env.NOTION_LEGALES_PAGE_ID ?? "201724f6-221e-8045-ace4-db7b6e590863";

export function hasNotion(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

/** Baja el árbol de bloques COMPLETO (recursivo, paginado). GET only. */
async function fetchTree(token: string, blockId: string): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      results: Block[];
      has_more: boolean;
      next_cursor: string | null;
    };
    out.push(...json.results);
    cursor = json.has_more ? json.next_cursor ?? undefined : undefined;
  } while (cursor);
  for (const b of out) {
    b.children = b.has_children ? await fetchTree(token, b.id) : [];
  }
  return out;
}

/** Baja + parsea los legales del doc de Notion (server-only; usa NOTION_TOKEN). */
export async function fetchLegalesFromNotion(): Promise<{
  legales: ParsedLegal[];
  reglas: ParsedRule[];
}> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("Falta NOTION_TOKEN en el entorno.");
  const tree = await fetchTree(token, NOTION_LEGALES_PAGE_ID);
  return parseLegales(tree);
}
