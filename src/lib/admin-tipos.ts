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

// La Biblioteca ahora es SÓLO Legales (Pedro 2026-08-21). Los otros kinds
// (selling_point/instruccion/consideracion/referencia) se retiraron: sólo se
// administraban aquí y nada más en la app los consume — la tarea sólo lee
// snippets `kind='legal'`. El enum `snippet_kind` en la DB conserva esos valores
// (dropear un valor de enum en Postgres no vale la pena); simplemente no se usan.
export const SNIPPET_KINDS = ["legal"] as const;
export type SnippetKind = (typeof SNIPPET_KINDS)[number];

export const SNIPPET_KIND_LABEL: Record<string, string> = {
  legal: "Legales",
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
