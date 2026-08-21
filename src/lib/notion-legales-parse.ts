// Parser PURO del árbol de bloques de Notion → legales. Sin red, sin server-only:
// así se puede testear con un fixture o contra un árbol real ya bajado.
//
// Estructura del doc (verificada en vivo, 2026-08-21): dos headings de marca
// ("DiDi Préstamos" / "DiDi Card") y bajo cada uno los legales. El CUERPO llega en
// DOS formas: Préstamos lo anida como HIJO del label subrayado; Card lo pone como
// bulleted_list_item HERMANO tras el label. Un callout bajo una marca (el 👀) es una
// NOTA/regla, no un legal.

export type Block = {
  id: string;
  type: string;
  has_children: boolean;
  children: Block[];
  [k: string]: unknown;
};
type RichText = { plain_text: string; annotations?: { underline?: boolean } };

/** Texto plano VERBATIM de un bloque — sin tocar asteriscos ni formato. */
export function blockText(b: Block): string {
  const body = b[b.type] as { rich_text?: RichText[] } | undefined;
  return (body?.rich_text ?? []).map((r) => r.plain_text).join("");
}

function isUnderlinedParagraph(b: Block): boolean {
  if (b.type !== "paragraph") return false;
  const rt = (b.paragraph as { rich_text?: RichText[] } | undefined)?.rich_text ?? [];
  return rt.length > 0 && rt[0]?.annotations?.underline === true && blockText(b).trim() !== "";
}

function mapMarca(headingText: string): "card" | "prestamos" | null {
  const t = headingText.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (t.includes("prestamos")) return "prestamos";
  if (t.includes("card")) return "card";
  return null;
}

export type ParsedLegal = {
  blockId: string;
  marcaSlug: "card" | "prestamos";
  title: string;
  body: string;
};
export type ParsedRule = { marcaSlug: "card" | "prestamos"; text: string };

/** Árbol de bloques → legales (+ reglas/notas). Puro, determinista, testeable. */
export function parseLegales(tree: Block[]): { legales: ParsedLegal[]; reglas: ParsedRule[] } {
  const legales: ParsedLegal[] = [];
  const reglas: ParsedRule[] = [];

  for (const top of tree) {
    if (top.type !== "heading_2") continue;
    const marca = mapMarca(blockText(top));
    if (!marca) continue;

    let current: ParsedLegal | null = null;
    for (const child of top.children) {
      if (isUnderlinedParagraph(child)) {
        // Nuevo legal: el label subrayado es la LLAVE ESTABLE (block id) + el título.
        current = {
          blockId: child.id,
          marcaSlug: marca,
          title: blockText(child).trim().replace(/:\s*$/, ""),
          body: "",
        };
        // Cuerpo anidado (Préstamos): hijos del label.
        const nested = child.children.map(blockText).filter((t) => t.trim() !== "");
        if (nested.length) current.body = nested.join("\n");
        legales.push(current);
      } else if (child.type === "callout") {
        // El 👀 = nota/regla de mantenimiento, no un legal.
        reglas.push({ marcaSlug: marca, text: blockText(child).trim() });
      } else {
        // Cuerpo hermano (Card: bullet; o párrafo no-subrayado no vacío) → al legal en curso.
        const t = blockText(child).trim();
        if (current && t !== "") current.body = current.body ? `${current.body}\n${t}` : t;
      }
    }
  }

  return { legales: legales.filter((l) => l.body.trim() !== ""), reglas };
}
