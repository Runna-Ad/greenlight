// Tipos y constantes del equipo (puro, sin "use server" — un archivo de server
// actions sólo puede exportar funciones async, así que esto vive aparte y lo
// comparten la action y los componentes cliente).

// Los roles asignables a una persona del equipo (subconjunto de app_role).
// delivery/client no aplican a un miembro del pool de producción.
export const ROLES_ASIGNABLES = ["master", "admin", "lead", "creative"] as const;
export type RolAsignable = (typeof ROLES_ASIGNABLES)[number];

export type MiembroRow = {
  id: string;
  name: string;
  /** null = rol global (admin/master): sin track, vista de todos los equipos. HOME track. */
  track: "real" | "normal" | null;
  /** Sólo rol lead: track(s) que puede tocar (grant multi-track). null/[] = usa el track
   *  home. El [0] es el home cuando hay grant. Ignorado para creative/admin/master. */
  lead_tracks: ("real" | "normal")[] | null;
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
  /** Tareas NO terminales asignadas a esta persona (el badge de carga). */
  carga: number;
};
