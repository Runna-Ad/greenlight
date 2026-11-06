import { getViewAs } from "@/lib/view-as";
import { canAdmin } from "@/lib/roles";
import { NOTION_LEGALES_PAGE_ID } from "@/lib/notion-legales";

/**
 * Sólo lectura, sólo admin: qué páginas de Notion ve la conexión de Greenlight y el texto
 * de una de ellas. Sirve para ubicar los selling points (Pedro, 2026-11-06) sin que nadie
 * tenga que copiar el token: la llave se queda en el servidor.
 *   GET /api/notion/explorar            → lista de páginas/bases que ve la conexión
 *   GET /api/notion/explorar?page=<id>  → el texto de esa página, con su estructura
 */
export const dynamic = "force-dynamic";

const NOTION_VERSION = "2022-06-28";
type Bloque = { id: string; type: string; has_children: boolean; [k: string]: unknown };

async function notion(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const texto = (b: Bloque): string => {
  const v = b[b.type] as { rich_text?: { plain_text: string }[]; title?: string } | undefined;
  if (b.type === "child_page" || b.type === "child_database") return `[${b.type}] ${v?.title ?? ""} (${b.id})`;
  return (v?.rich_text ?? []).map((r) => r.plain_text).join("");
};

async function volcar(id: string, nivel: number, out: string[], tope: { n: number }): Promise<void> {
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: "100" });
    if (cursor) q.set("start_cursor", cursor);
    const r = (await notion(`blocks/${id}/children?${q}`)) as { results: Bloque[]; has_more: boolean; next_cursor: string | null };
    for (const b of r.results) {
      if (tope.n-- <= 0) return;
      const t = texto(b);
      out.push(`${"  ".repeat(nivel)}[${b.type}] ${t}`);
      if (b.has_children && b.type !== "child_page" && b.type !== "child_database" && nivel < 6) await volcar(b.id, nivel + 1, out, tope);
    }
    cursor = r.has_more ? r.next_cursor ?? undefined : undefined;
  } while (cursor);
}

export async function GET(req: Request) {
  if (!canAdmin(await getViewAs())) return new Response("Sólo admin.", { status: 403 });
  if (!process.env.NOTION_TOKEN) return new Response("Falta NOTION_TOKEN en este entorno.", { status: 503 });
  const page = new URL(req.url).searchParams.get("page");
  try {
    if (!page) {
      const r = (await notion("search", { method: "POST", body: JSON.stringify({ page_size: 100 }) })) as {
        results: { object: string; id: string; url?: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }>; title?: { plain_text: string }[] }[];
      };
      const lineas = r.results.map((x) => {
        const props = Object.values(x.properties ?? {});
        const t = (x.title ?? props.find((p) => p.type === "title")?.title ?? []).map((p) => p.plain_text).join("");
        return `${x.object}\t${t || "(sin título)"}\t${x.id}${x.id.replace(/-/g, "") === NOTION_LEGALES_PAGE_ID.replace(/-/g, "") ? "\t← legales" : ""}`;
      });
      return new Response(`La conexión ve ${lineas.length} elementos:\n\n${lineas.join("\n")}\n`, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    const out: string[] = [];
    await volcar(page, 0, out, { n: 1500 });
    return new Response(out.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 502 });
  }
}
