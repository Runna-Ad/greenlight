// Types for the `produccion` schema.
// HAND-MAINTAINED for now — regenerate from the real DB once linked:
//   supabase gen types typescript --linked --schema produccion > src/lib/database.types.gen.ts
// (Lesson: gen overwrites the whole file & drops manual aliases — keep aliases separate,
//  and run `tsc -b` after any regen.)

export type AppRole =
  | "master"
  | "admin"
  | "lead"
  | "specialist_lead"
  | "creative"
  | "delivery"
  | "client";
export type BriefStatus = "draft" | "active" | "delivered" | "archived";
export type AssetStatus =
  | "todo"
  | "in_progress"
  | "under_review"
  | "in_corrections"
  | "completed"
  | "published"
  | "delivered";
export type AssignmentRole = "creativo" | "produccion" | "diseno" | "copy" | "edicion";
export type CommentKind = "comment" | "correction_request" | "approval" | "client_change";
export type SnippetKind = "instruccion" | "legal" | "consideracion" | "referencia";
export type NamingKind = "real" | "normal" | "static";
export type NotifyChannel = "email" | "slack" | "in_app";
export type VocabSet =
  | "plataforma"
  | "tipo"
  | "formato"
  | "tamano"
  | "duracion"
  | "genero"
  | "origen_idea"
  | "red";

export type Pod = {
  id: string;
  name: string;
  slug: string;
  color: string;
  active: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  initials: string | null;
  role: AppRole;
  pod_id: string | null;
  specialties: string[];
  slack_user_id: string | null;
  client_id: string | null;
  notify_email: boolean;
  notify_slack: boolean;
  active: boolean;
};

export type Client = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo_url: string | null;
  brand_color: string;
  active: boolean;
};

export type Marca = {
  id: string;
  client_id: string;
  name: string;
  slug: string;
  active: boolean;
};

export type VocabTerm = {
  id: string;
  set: VocabSet;
  code: string;
  label_es: string;
  sort_order: number;
  active: boolean;
  meta: Record<string, unknown>;
};

export type Brief = {
  id: string;
  client_id: string;
  code: string;
  title: string;
  brief_name: string | null;
  month: string | null;
  status: BriefStatus;
  description: string | null;
  drive_url: string | null;
  created_by: string | null;
};

export type DeliveryWave = {
  id: string;
  brief_id: string;
  name: string;
  due_date: string | null;
  month: string | null;
  status: string;
  notes: string | null;
};

export type IdeaFamily = {
  id: string;
  brief_id: string;
  letter: string;
  name: string | null;
  tema: string | null;
  insight: string | null;
  origen: string[];
};

export type Idea = {
  id: string;
  family_id: string;
  brief_id: string;
  marca_id: string | null;
  variant_number: number;
  code: string | null;
  pod_id: string | null;
  wave_id: string | null;
  naming_base: string | null;
  naming_kind: NamingKind;
  genero_code: string | null;
  formato_code: string | null;
  mes_code: string | null;
  plataformas: string[];
  duracion: string[];
  tipo_code: string | null;
  topico: string | null;
  concepto: string | null;
  comunicacion: string | null;
  selling_points: string[];
  comentarios_creativo: string | null;
  comentarios_produccion: string | null;
  comentarios_diseno: string | null;
  p_tema: string | null;
  p_mensaje: string | null;
  p_insight: string | null;
  p_personaje: string | null;
  p_locacion: string | null;
  p_hook: string | null;
  p_graficos: string | null;
  peloteo_raw: string | null;
  due_date: string | null;
  published_at: string | null;
};

export type Plano = {
  id: string;
  idea_id: string;
  orden: number;
  titulo: string | null;
  hook_narrativo: string | null;
  hook_visual: string | null;
  accion: string | null;
  copy_in: string | null;
  gfx_sfx: string | null;
  edicion: string | null;
  dialogo: string | null;
  read_time_s: number | null;
};

export type Asset = {
  id: string;
  idea_id: string;
  brief_id: string;
  pod_id: string | null;
  wave_id: string | null;
  status: AssetStatus;
  naming_kind: NamingKind;
  naming_base: string;
  tamano_code: string;
  plataforma_code: string;
  duracion_code: string | null;
  genero_code: string | null;
  formato_code: string | null;
  idea_code: string;
  mes_code: string;
  version: number;
  filename: string;
  filename_override: string | null;
  storage_path: string | null;
  entrega_link: string | null;
  due_date: string | null;
  sort_order: number;
  completed_at: string | null;
  published_at: string | null;
  delivered_at: string | null;
};

export type Comment = {
  id: string;
  idea_id: string | null;
  asset_id: string | null;
  brief_id: string | null;
  parent_id: string | null;
  author_id: string | null;
  body: string;
  mentions: string[];
  kind: CommentKind;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  // Corrección localizada (0028): a qué campo apunta + dos estados de resolución.
  author_member_id: string | null;
  target_tabla: string | null;
  target_fila_id: string | null;
  target_campo: string | null;
  target_label: string | null;
  ronda: number | null;
  atendido_at: string | null;
  atendido_by: string | null;
  resolved_member_id: string | null;
  // Ancla por selección de texto (0029): el substring citado + offsets best-effort.
  target_quote: string | null;
  target_start: number | null;
  target_end: number | null;
  // Evaluación v2 (0040): cuándo el lead aplicó la sugerencia de H.Ü.E sobre esta nota.
  hue_aplicado_at: string | null;
};

// ── H.Ü.E HUB (0045) ────────────────────────────────────────
export type HueSuggestionKind = "correction_verdict" | "ortografia";
export type HueDecision = "applied" | "dismissed" | "ignored";
export type HueScope = "global" | "client" | "marca";
export type HueSource = "human" | "auto";

export type HueSuggestion = {
  id: string;
  idea_id: string;
  kind: HueSuggestionKind;
  correccion_id: string | null;
  target_tabla: string | null;
  target_fila_id: string | null;
  target_campo: string | null;
  hecho: "si" | "no" | "parcial" | null;
  tipo: string | null;
  sugerencia: string | null;
  decision: HueDecision | null;
  offered_at: string;
  decided_at: string | null;
  actor_member_id: string | null;
  created_at: string;
};

export type HueInstruction = {
  id: string;
  scope: HueScope;
  client_id: string | null;
  marca_id: string | null;
  title: string;
  body: string;
  version: number;
  active: boolean;
  source: HueSource;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HueKbDocument = {
  id: string;
  scope: HueScope;
  client_id: string | null;
  marca_id: string | null;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  extracted_text: string | null;
  indexed_at: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type HueTopPerformer = {
  id: string;
  idea_id: string;
  starred_by: string | null;
  reason: string | null;
  starred_at: string;
};

export type HueAdaptation = {
  id: string;
  at: string;
  trigger_summary: string | null;
  changed_instruction_id: string | null;
  from_version: number | null;
  to_version: number | null;
  applied_by: string;
  reverted_at: string | null;
};

// ── Plantilla Copies (0046) ──────────────────────────────────
export type CopyTema = {
  id: string;
  idea_id: string;
  tema: string | null;
  cuota: number;
  orden: number;
};
export type Copy = {
  id: string;
  tema_id: string;
  headline: string | null;
  descripcion: string | null;
  orden: number;
};
