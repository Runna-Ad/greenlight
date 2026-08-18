// Tipos compartidos del panel de administración (puro — lo usan las server
// actions y los componentes cliente).

export type ActividadRow = {
  id: string;
  ideaCode: string | null;
  ideaNaming: string | null;
  from: string | null;
  to: string;
  actor: string | null; // nombre de quien actuó (member o profile)
  actorColor: string | null;
  override: boolean;
  reason: string | null;
  createdAt: string;
};

export type SnippetRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  scope: string;
  marca_id: string | null;
  active: boolean;
  sort_order: number;
};

export const SNIPPET_KINDS = [
  "legal",
  "selling_point",
  "instruccion",
  "consideracion",
  "referencia",
] as const;
export type SnippetKind = (typeof SNIPPET_KINDS)[number];

export const SNIPPET_KIND_LABEL: Record<string, string> = {
  legal: "Legales",
  selling_point: "Selling points",
  instruccion: "Instrucciones",
  consideracion: "Consideraciones",
  referencia: "Referencias",
};

export type MarcaOpt = { id: string; name: string };

/** Una marca (sub-marca) con su logo, para el panel de Marcas. */
export type MarcaLogo = { id: string; name: string; slug: string; logo_url: string | null };

/** Un cliente con sus marcas (sub-marcas) — DiDi → Card / Préstamos. */
export type ClienteConMarcas = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  marcas: MarcaLogo[];
};

export type IntegracionesEstado = {
  sheetConfigurado: boolean;
  ultimaSync: string | null;
  tareasImportadas: number;
  notionConfigurado: boolean;
};
