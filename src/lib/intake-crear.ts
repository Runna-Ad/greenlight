// Lógica PURA para capturar un brief nuevo (y compartida con el import del sheet).
//
// Sin `server-only`, sin Supabase, sin alias `@/` en imports de VALOR (el harness
// de tests corre los .ts con node directo y no resuelve `@/`). Así este módulo se
// puede probar solo, importar desde un client component (BriefBuilder) Y desde la
// server action (crearBrief) — una sola fuente para el mapeo draft → tarea.
//
// El import del sheet (sync/import.ts) reusa labelToCode/splitIdeaCode/cleanSize/
// list de aquí, para que capturar-a-mano y capturar-del-sheet nunca discrepen.

import { buildFilename, namingKindForTipo } from "./filename.ts";
import { SIZE_PLATFORMS, type Platform } from "./brand.ts";
import { missingRequired } from "./required.ts";
import type { SheetColumn, SheetRow } from "./sheet-sync.ts";
import type { Track } from "./vocab.ts";

// ── Helpers puros (movidos desde sync/import.ts — una sola definición) ──

/** "Card, Préstamos" → ["Card","Préstamos"]. Vacío → []. */
export const list = (v?: string): string[] =>
  v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

/**
 * El sheet a veces trae píxeles: "1:1 (1080*1080)". Sólo la proporción va al
 * nombre de archivo — el paréntesis es una nota. Sin esto el token salía
 * "1X110801080".
 */
export const cleanSize = (s: string): string => s.replace(/\s*\(.*?\)\s*/g, "").trim();

/** Quita acentos y normaliza para comparar nombres/labels. */
export const fold = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * El sheet guarda LABELS ("Ilustración"); los nombres de archivo necesitan CODES
 * ("ILLUS"). Pasar el label directo producía "ILUSTRACIN". Los valores
 * desconocidos pasan tal cual en vez de desaparecer.
 */
export function labelToCode(
  vocab: { set: string; code: string; label_es: string; track: string }[],
  set: string,
  track: string,
  label: string,
): string {
  if (!label) return "";
  const target = fold(label);
  const match =
    vocab.find(
      (v) => v.set === set && fold(v.label_es) === target && (v.track === track || v.track === "both"),
    ) ?? vocab.find((v) => v.set === set && fold(v.code) === target);
  return match?.code ?? label;
}

/** "A4" → {letter:"A", variant:4}.  "B" → {letter:"B", variant:1}. */
export function splitIdeaCode(raw: string): { letter: string; variant: number } {
  const m = (raw || "").trim().match(/^([A-Za-z]+)\s*(\d*)$/);
  if (!m) return { letter: "X", variant: 1 };
  return { letter: m[1].toUpperCase(), variant: m[2] ? Number(m[2]) : 1 };
}

// ── Validez tamaño × plataforma (mismo criterio que el preview del intake) ──
// Sólo GG/FB/TT tienen reglas documentadas; EC o un valor tecleado son casos
// raros que quedan ABIERTOS (pueden ser cualquier cosa).
const RULED_PLATFORMS = new Set(["GG", "FB", "TT"]);

export function isAllowed(media: "video" | "static", size: string, plat: string): boolean {
  if (!RULED_PLATFORMS.has(plat)) return true; // EC / custom → abierto
  const allowed = SIZE_PLATFORMS[media]?.[size];
  if (!allowed) return true; // tamaño desconocido (2736 x 1260, custom) → abierto
  return allowed.includes(plat as Platform);
}

// ── El borrador de una tarea, tal cual lo edita el BriefBuilder ──
// Los campos de ChipSelect son arrays (los single-select traen 0 o 1 elemento,
// igual que el intake-form original). Los de texto libre son strings.
export type TaskDraft = {
  id: string; // id de cliente (crypto.randomUUID)
  entrega: string[]; // # Entrega (single)
  asignacion: string[];
  marca: string[]; // single
  comentariosLeads: string;
  peloteo: string;
  concepto: string;
  sellingPoints: string;
  referencias: string; // → trend
  plataforma: string[];
  tipoAsset: string[]; // single
  formato: string[]; // single
  tamano: string[];
  duracion: string[]; // pastillas de duración (10-15, 20-30…); cada una es un juego de archivos
  numIdea: string; // # Idea, ej. "A1"
  version: string; // "V1"
  genero: string[]; // single
  naming: string;
};

/** Lo que vive en el ENCABEZADO del brief (no por tarjeta). */
export type BriefHeader = {
  track: Track;
  title: string; // requerido — briefs.title es NOT NULL
  briefName: string;
  mes: string; // alimenta mes_code en cada tarea
};

export type CrearBriefInput = {
  header: BriefHeader;
  tasks: TaskDraft[];
};

const first = (a: string[]): string => a[0] ?? "";

/** Un borrador → objeto tipo SheetRow, para reusar missingRequired() tal cual. */
export function draftToSheetRow(t: TaskDraft): SheetRow {
  const row = {
    "# Entrega": first(t.entrega),
    Asignación: t.asignacion.join(", "),
    "Comentarios Leads": t.comentariosLeads,
    Peloteo: t.peloteo,
    Marca: first(t.marca),
    Plataforma: t.plataforma.join(", "),
    "Tipo de Asset": first(t.tipoAsset),
    Formato: first(t.formato),
    Concepto: t.concepto,
    "Selling Points": t.sellingPoints,
    Referencias: t.referencias,
    Tamaño: t.tamano.join(", "),
    Duración: t.duracion.join(", "),
    "# Idea": t.numIdea,
    Versión: t.version,
    Género: first(t.genero),
    Naming: t.naming,
  } as Partial<Record<SheetColumn, string>>;
  return row as SheetRow;
}

/** Los campos obligatorios que le faltan a un borrador (mismo gate que el import). */
export function faltantesDraft(t: TaskDraft): SheetColumn[] {
  return missingRequired(draftToSheetRow(t));
}

/**
 * La siguiente variante libre para una letra, entre los borradores actuales.
 * Se usa al DUPLICAR una tarjeta (A1 → A2), para no chocar por defecto.
 */
export function nextVariantForLetter(drafts: TaskDraft[], letter: string): number {
  let max = 0;
  for (const d of drafts) {
    const s = splitIdeaCode(d.numIdea);
    if (s.letter === letter && s.variant > max) max = s.variant;
  }
  return max + 1;
}

/**
 * Detecta `# Idea` repetidos DENTRO del brief. En la base no pueden existir dos
 * "A1" en la misma familia (unique (family_id, variant_number)); en vez de
 * renombrar en silencio (que sería inventar), se bloquean y la persona los
 * corrige. Devuelve el set de ids de tarjeta en conflicto.
 */
export function idsIdeaRepetida(drafts: TaskDraft[]): Set<string> {
  const porClave = new Map<string, string[]>();
  for (const d of drafts) {
    const s = splitIdeaCode(d.numIdea);
    const clave = `${s.letter}${s.variant}`;
    porClave.set(clave, [...(porClave.get(clave) ?? []), d.id]);
  }
  const dup = new Set<string>();
  for (const ids of porClave.values()) {
    if (ids.length > 1) ids.forEach((id) => dup.add(id));
  }
  return dup;
}

// ── Cálculo de entregables (tamaño × plataforma × duración), reusado en preview y payload ──
export type AssetCombo = { tamano_code: string; plataforma_code: string; duracion_code: string };

/**
 * Los combos válidos de una tarjeta: tamaño × plataforma × DURACIÓN. Cada
 * duración (pastilla) genera su propio juego de archivos. Los estáticos no duran
 * → una sola "duración" vacía. Un video sin duración también usa la vacía (el
 * token se omite del nombre, como antes con "-"). Los Copies (que no generan
 * archivos) devuelven []. WYSIWYG: esto alimenta el conteo del preview Y las
 * filas de assets que crea el RPC — nunca pueden discrepar.
 */
export function combosDeTarjeta(t: TaskDraft): AssetCombo[] {
  const tipo = first(t.tipoAsset);
  if (!tipo) return [];
  // Copies no generan archivos (un copy es texto: ni proporción ni archivo).
  if (tipo === "Copies") return [];
  const kind = namingKindForTipo(tipo);
  const media = kind === "static" ? "static" : "video";
  // Dedupe: dos pastillas iguales generarían dos combos idénticos (mismo nombre
  // de archivo). El intake ya lo evita, pero se blinda aquí también.
  const cleanDurs = [...new Set(t.duracion.map((d) => d.trim()).filter(Boolean))];
  const durs = media === "static" ? [""] : cleanDurs.length ? cleanDurs : [""];
  const out: AssetCombo[] = [];
  for (const size of t.tamano.map(cleanSize).filter(Boolean)) {
    for (const plat of t.plataforma) {
      if (!isAllowed(media, size, plat)) continue;
      for (const dur of durs) {
        out.push({ tamano_code: size, plataforma_code: plat, duracion_code: dur });
      }
    }
  }
  return out;
}

/** Los nombres de archivo que se verán/crearán para una tarjeta (para el preview). */
export function nombresDeTarjeta(t: TaskDraft, mes: string): string[] {
  const tipo = first(t.tipoAsset);
  if (!tipo) return [];
  const kind = namingKindForTipo(tipo);
  const mesToken = mes ? `${mes.toUpperCase()}26` : "";
  const version = Number(t.version.replace(/\D/g, "")) || 1;
  return combosDeTarjeta(t).map((c) =>
    buildFilename({
      kind,
      base: t.naming,
      tamano: c.tamano_code,
      duracion: c.duracion_code,
      genero: first(t.genero),
      formato: first(t.formato),
      idea: t.numIdea,
      plataforma: c.plataforma_code,
      version,
      mes: mesToken,
    }),
  );
}

// ── Construcción del payload para el RPC (lo llama la server action) ──
// La server action resuelve vocab/members/marcas contra la base y pasa esto puro.

export type TaskPayload = {
  family_letter: string;
  variant_number: number;
  marca_id: string | null;
  naming_base: string | null;
  naming_kind: "real" | "normal" | "static";
  genero_code: string | null;
  formato_code: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string[];
  tipo_code: string | null;
  tipo_asset: string | null;
  entrega_num: string | null;
  entrega_final: string | null;
  concepto: string | null;
  selling_points: string[];
  comentarios_creativo: string | null;
  peloteo_raw: string | null;
  trend: string | null;
  member_ids: string[];
  assets: AssetCombo[];
};

type Resuelto = {
  vocab: { set: string; code: string; label_es: string; track: string }[];
  memberIdPorNombre: Map<string, string>; // fold(name) → id (ya filtrado por track)
  marcaIdPorNombre: Map<string, string>; // fold(name) → id
};

const nn = (s: string): string | null => (s.trim() ? s.trim() : null);

/** Un borrador → la tarea resuelta que entiende el RPC. */
export function construirTarea(t: TaskDraft, track: Track, r: Resuelto): TaskPayload {
  const tipo = first(t.tipoAsset);
  const kind = tipo ? namingKindForTipo(tipo) : "real";
  const { letter, variant } = splitIdeaCode(t.numIdea);
  const memberIds = t.asignacion
    .map((n) => r.memberIdPorNombre.get(fold(n)))
    .filter((id): id is string => Boolean(id));
  const marcaId = r.marcaIdPorNombre.get(fold(first(t.marca))) ?? null;
  return {
    family_letter: letter,
    variant_number: variant,
    marca_id: marcaId,
    naming_base: nn(t.naming),
    naming_kind: kind,
    genero_code: labelToCode(r.vocab, "genero", track, first(t.genero)) || null,
    formato_code: labelToCode(r.vocab, "formato", track, first(t.formato)) || null,
    plataformas: t.plataforma,
    tamanos: t.tamano.map(cleanSize).filter(Boolean),
    duracion: t.duracion.map((d) => d.trim()).filter(Boolean),
    tipo_code: nn(tipo),
    tipo_asset: nn(tipo),
    entrega_num: nn(first(t.entrega)),
    entrega_final: null,
    concepto: nn(t.concepto),
    selling_points: t.sellingPoints.trim() ? [t.sellingPoints.trim()] : [],
    comentarios_creativo: nn(t.comentariosLeads),
    peloteo_raw: nn(t.peloteo),
    trend: nn(t.referencias),
    member_ids: memberIds,
    assets: combosDeTarjeta(t),
  };
}

/**
 * Los campos que se pueden copiar a otras tarjetas (por campo o en lote).
 * `# Idea` NO está: es la identidad y se maneja aparte (duplicar autoincrementa).
 * El orden es el de lectura de la tarjeta.
 */
export const CAMPOS_COPIABLES: { key: keyof TaskDraft; label: string }[] = [
  { key: "naming", label: "Naming" },
  { key: "version", label: "Versión" },
  { key: "marca", label: "Marca" },
  { key: "entrega", label: "# Entrega" },
  { key: "asignacion", label: "Asignación" },
  { key: "tipoAsset", label: "Tipo de Asset" },
  { key: "formato", label: "Formato" },
  { key: "plataforma", label: "Plataforma" },
  { key: "tamano", label: "Tamaño" },
  { key: "genero", label: "Género" },
  { key: "duracion", label: "Duración" },
  { key: "concepto", label: "Concepto" },
  { key: "comentariosLeads", label: "Comentarios Leads" },
  { key: "peloteo", label: "Peloteo" },
  { key: "sellingPoints", label: "Selling Points" },
  { key: "referencias", label: "Referencias" },
];

/** ¿El campo de una tarjeta tiene valor? (para ofrecer sólo lo lleno al copiar). */
export function campoLleno(v: string | string[]): boolean {
  return Array.isArray(v) ? v.length > 0 : v.trim().length > 0;
}

/** Los campos copiables que YA tienen valor en una tarjeta. */
export function camposLlenos(t: TaskDraft): { key: keyof TaskDraft; label: string }[] {
  return CAMPOS_COPIABLES.filter((c) => campoLleno(t[c.key]));
}

/** Una tarjeta en blanco lista para editar. `id` lo pone quien llama. */
export function tarjetaEnBlanco(id: string): TaskDraft {
  return {
    id,
    entrega: [],
    asignacion: [],
    marca: [],
    comentariosLeads: "",
    peloteo: "",
    concepto: "",
    sellingPoints: "",
    referencias: "",
    plataforma: [],
    tipoAsset: [],
    formato: [],
    tamano: [],
    duracion: [],
    numIdea: "",
    version: "V1",
    genero: [],
    naming: "",
  };
}
