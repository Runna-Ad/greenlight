// Tipos y constantes del equipo (puro, sin "use server" — un archivo de server
// actions sólo puede exportar funciones async, así que esto vive aparte y lo
// comparten la action y los componentes cliente).

// Los roles asignables a una persona del equipo (subconjunto de app_role).
// delivery/client no aplican a un miembro del pool de producción.
export const ROLES_ASIGNABLES = ["master", "admin", "lead", "creative"] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

// La rama de cada persona (0089). Una sola por persona; dentro de ella es Lead o Especialista.
export const RAMAS = ["creativo", "diseno", "produccion"] as const;
export type Rama = (typeof RAMAS)[number];
export const RAMA_LABEL: Record<Rama, string> = { creativo: "Creativo", diseno: "Diseño", produccion: "Producción" };
export const esRama = (v: unknown): v is Rama => (RAMAS as readonly unknown[]).includes(v);
/** La rama que cuenta: admin y master son globales y no tienen ninguna, aunque la fila guarde una. */
export const ramaDe = (m: { role: string; rama: Rama }): Rama | null => (m.role === "admin" || m.role === "master" ? null : m.rama);

export type MiembroRow = {
  id: string;
  name: string;
  /** null = rol global (admin/master): sin track, vista de todos los equipos. HOME track. */
  track: "real" | "normal" | null;
  /** Sólo rol lead: track(s) que puede tocar (grant multi-track). null/[] = usa el track
   *  home. El [0] es el home cuando hay grant. Ignorado para creative/admin/master. */
  /** Tracks OTORGADOS (lead o creative, 0059). null/vacío = usa el track HOME. */
  tracks: ("real" | "normal")[] | null;
  /** Rama guardada (0089). Para leerla usa `ramaDe`: admin y master no cuentan con ella. */
  rama: Rama;
  color: string;
  role: string;
  email: string | null;
  slack_user_id: string | null;
  es_lead: boolean;
  active: boolean;
  sort_order: number;
  /** ¿Recibe emails de notificación? (in-app siempre le llega). */
  notify_email: boolean;
  /** ¿Recibe avisos por Slack? */
  notify_slack: boolean;
  /** ¿Puede usar HÜE Prisma? (0090). Lo decide el Master; para leerlo usa `tieneAccesoPrisma`. */
  prisma_acceso: boolean;
  /** ¿Puede crear guión y copy con H.Ü.E? (0092). Lo decide el Master; para leerlo usa `tieneHueCreativo`. */
  hue_creativo: boolean;
  /** Tareas NO terminales asignadas a esta persona (el badge de carga). */
  carga: number;
};
