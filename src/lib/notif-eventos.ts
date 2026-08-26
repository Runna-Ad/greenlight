// Catálogo de eventos notificables + qué ve cada rol. Fuente única para las server
// actions (validación) Y la UI de Mi perfil (matriz). El in-app siempre llega dentro
// del scope; esto gobierna qué eventos EMAILEA cada persona. (0050)

export type NotifEvento =
  | "task_assigned"
  | "task_submitted"
  | "task_changes_requested"
  | "task_approved"
  | "task_published"
  | "brief_created";

export const NOTIF_EVENTOS: { key: NotifEvento; label: string; hint: string }[] = [
  { key: "task_assigned", label: "Se me asignó una tarea", hint: "Cuando te asignan una tarea" },
  { key: "task_submitted", label: "Lista para revisar", hint: "Cuando un especialista manda a revisión" },
  { key: "task_changes_requested", label: "Cambios pedidos", hint: "Cuando se piden cambios (lead o cliente)" },
  { key: "task_approved", label: "Tarea aprobada", hint: "Cuando el lead aprueba una tarea" },
  { key: "task_published", label: "Enviada al cliente", hint: "Cuando la tarea sale al cliente (greenlit)" },
  { key: "brief_created", label: "Nuevo brief", hint: "Cuando entra un brief nuevo" },
];

// Eventos de cara al CLIENTE (portal). Separados del catálogo interno: el cliente no
// ve la matriz interna. Hoy sólo "ready_for_review" (0051); su default de email es ON.
export const NOTIF_EVENTOS_CLIENTE: { key: string; label: string; hint: string }[] = [
  { key: "ready_for_review", label: "Listo para tu revisión", hint: "Cuando te mandan una pieza a revisar" },
];

export const EVENTOS_VALIDOS = new Set<string>([
  ...NOTIF_EVENTOS.map((e) => e.key),
  ...NOTIF_EVENTOS_CLIENTE.map((e) => e.key),
]);

/** Los eventos que un rol PUEDE recibir (los que se le muestran en su matriz). */
export function eventosParaRol(role: string): string[] {
  if (role === "client") return NOTIF_EVENTOS_CLIENTE.map((e) => e.key);
  if (role === "admin" || role === "master") return NOTIF_EVENTOS.map((e) => e.key);
  if (role === "lead")
    return ["task_submitted", "task_changes_requested", "task_approved", "task_published", "brief_created"];
  // creative / especialista: sólo eventos de SUS tareas
  return ["task_assigned", "task_changes_requested", "task_approved", "task_published"];
}

export type NotifScope = "all" | "my_track" | "only_mine";
export const SCOPES: { key: NotifScope; label: string; hint: string }[] = [
  { key: "all", label: "Todo", hint: "Toda la actividad" },
  { key: "my_track", label: "Mi equipo", hint: "Sólo tareas de mi track" },
  { key: "only_mine", label: "Sólo lo mío", hint: "Sólo las tareas que trabajo" },
];
export const SCOPES_VALIDOS = new Set<string>(SCOPES.map((s) => s.key));

/** Las preferencias de notificación de una persona (para pintar Mi perfil). */
export type MisPrefs = {
  scope: NotifScope;
  watchAll: boolean;
  prefs: Record<string, boolean>; // event_type → ¿emailea?
};
