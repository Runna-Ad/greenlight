/**
 * Contrato compartido de la PAPELERA (0057).
 *
 * Vive APARTE de `papelera-actions.ts` porque un módulo `"use server"` sólo puede
 * exportar funciones async: una constante o un tipo exportados desde ahí rompen el
 * build. Aquí quedan la ventana de retención y la forma de una fila, que usan tanto
 * las server actions como la pestaña de admin.
 */

/** Días que algo borrado sigue siendo recuperable. Una sola fuente: la usan la
 *  purga (server) y el texto de la UI ("los últimos 30 días"). */
export const DIAS_RETENCION = 30;

export type ItemPapelera = {
  id: string;
  tipo: "brief" | "tarea";
  titulo: string;
  /** Cliente · brief, para ubicarlo de un vistazo. */
  contexto: string | null;
  borradoEn: string;
  borradoPor: string | null;
  diasRestantes: number;
  /** Una tarea cuyo BRIEF también está en la papelera: se restaura con el brief. */
  bloqueadaPorBrief: boolean;
};
