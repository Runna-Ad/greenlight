// Lógica PURA de ruteo de emails de notificación (sin server, testeable).
// Dos compuertas, como SnapTrack: (1) el TIPO de notificación puede emailear;
// (2) la persona tiene el email activado y una dirección. In-app siempre le llega.

/** Los tipos EMAILEABLES (el resto sólo in-app). Es el catálogo — el DEFAULT cuando
 *  la persona no tiene una fila de preferencia; su fila por-evento (0050) manda. */
export const EMAIL_TYPES = new Set<string>([
  "task_assigned", // "se te asignó una tarea" → al asignado (evento nuevo, 0050)
  "brief_created", // "nuevo brief, tienes X tareas" → a cada especialista asignado
  "task_submitted", // "lista para revisar" → a leads
  "task_changes_requested", // "te pidieron cambios" → al asignado
  "task_approved", // "tu tarea fue aprobada" → al asignado
  "task_published", // "se envió al cliente" → al asignado
]);

export function tipoEmailea(type: string | null | undefined): boolean {
  return !!type && EMAIL_TYPES.has(type);
}

const esEmail = (v: string | null | undefined): boolean =>
  !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/**
 * ¿Se manda email para esta entrega? "send" o "skip" (con la razón). Dos compuertas:
 *   1) el EVENTO emailea para ESTA persona: su preferencia por-evento (`eventPref`, de
 *      notification_prefs) MANDA; si no tiene fila (undefined) → default del catálogo.
 *   2) `notify_email` maestro encendido + email válido.
 * In-app siempre le llega (amplio); esto sólo gobierna el email.
 */
export function decisionEmail(args: {
  type: string | null | undefined;
  notifyEmail: boolean;
  email: string | null | undefined;
  /** Preferencia por-evento de la persona (notification_prefs.email). undefined = sin fila → default. */
  eventPref?: boolean | null;
}): { enviar: boolean; razon: string } {
  const emailea = args.eventPref ?? tipoEmailea(args.type);
  if (!emailea) return { enviar: false, razon: "evento no emailea (pref/def)" };
  if (!args.notifyEmail) return { enviar: false, razon: "persona desactivó email" };
  if (!esEmail(args.email)) return { enviar: false, razon: "sin email válido" };
  return { enviar: true, razon: "ok" };
}
