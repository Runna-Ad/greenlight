import type { PresetGuardado } from "@/lib/prisma/preset";

// Tipos compartidos del panel de administración (puro — lo usan las server
// actions y los componentes cliente).

/** Los conteos de Admin › Actividad, iguales por persona y por proyecto (funciones SQL de 0091). */
export type ConteosActividad = {
  movimientos: number; cambios: number; rondas: number; respuestas: number;
  prompts: number; variantes: number; resultados: number; lotes: number; psdAbiertos: number; descargas: number; ediciones: number;
  iaLlamadas: number;
  /** Suma de lo que sí reportó costo. null = ninguna llamada con costo conocido (nunca US$0). */
  iaUsd: number | null;
  iaSinCosto: number;
  errores: number;
  ultima: string | null;
};
export type PersonaActividad = ConteosActividad & { personaId: string | null; persona: string; color: string | null };
export type ProyectoActividad = ConteosActividad & { clienteId: string | null; cliente: string; tipoElemento: "archivo" | "tarea" | null; elemento: string | null };
export type LineaActividad = {
  id: string; tipo: string; persona: string; color: string | null; cliente: string;
  tipoElemento: "archivo" | "tarea" | null; elemento: string | null;
  usd: number | null; ruta: string | null; de: string | null; a: string | null; override: boolean; detalle: string | null; createdAt: string;
};
export type PanelActividad =
  | {
      ok: true;
      personas: PersonaActividad[]; totalPersonas: ConteosActividad | null;
      /** Cada cliente con sus archivos y tareas, ya en orden. */
      proyectos: (ProyectoActividad & { elementos: ProyectoActividad[] })[]; totalProyectos: ConteosActividad | null;
      linea: LineaActividad[];
    }
  | { ok: false; error: string; sinMigracion?: boolean };

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

/** Una marca (sub-marca) con su logo y su preset de HÜE Prisma, para el panel de Marcas. */
export type MarcaLogo = { id: string; name: string; slug: string; logo_url: string | null; prisma_preset: PresetGuardado };

/** Una tipografía de la biblioteca de Formatos: el archivo, los nombres que trae y si es sólo de su cliente. */
export type TipografiaGuardada = { id: string; archivo: string; nombres: string[]; bytes: number; exclusiva: boolean };
/** "sin-tabla" = la base todavía no guarda tipografías (falta la migración 0079); "error" = no se pudieron leer. */
export type TipografiasEstado = TipografiaGuardada[] | "sin-tabla" | "error";

/** Un cliente con sus marcas (sub-marcas) — DiDi → Card / Préstamos. */
export type ClienteConMarcas = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  marcas: MarcaLogo[];
  tipografias: TipografiasEstado;
};

export type IntegracionesEstado = {
  sheetConfigurado: boolean;
  ultimaSync: string | null;
  tareasImportadas: number;
  notionConfigurado: boolean;
};
