// Lógica PURA de ruteo de emails de notificación (sin server, testeable).
// Dos compuertas, como SnapTrack: (1) el TIPO de notificación puede emailear;
// (2) la persona tiene el email activado y una dirección. In-app siempre le llega.

/** Los tipos que SÍ mandan email (los demás sólo in-app). */
export const EMAIL_TYPES = new Set<string>([
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

/** ¿Se manda email para esta entrega? "send" o "skip" (con la razón). */
export function decisionEmail(args: {
  type: string | null | undefined;
  notifyEmail: boolean;
  email: string | null | undefined;
}): { enviar: boolean; razon: string } {
  if (!tipoEmailea(args.type)) return { enviar: false, razon: "tipo no emailea" };
  if (!args.notifyEmail) return { enviar: false, razon: "persona desactivó email" };
  if (!esEmail(args.email)) return { enviar: false, razon: "sin email válido" };
  return { enviar: true, razon: "ok" };
}
