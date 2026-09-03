import type { AssetStatus } from "@/lib/brand";

/**
 * Las 3 cubetas del portal del cliente (Pedro 2026-09-03). Mapea la máquina de estados
 * interna a lo que el cliente entiende:
 *   · activas  = "Por revisar" (published, es su turno)
 *   · revision = "En revisión" (in_corrections, el equipo trabaja sus cambios)
 *   · aprobado = "Aprobado"    (delivered)
 * Fuente ÚNICA — la comparten el nav (pestañas) y la lista de tarjetas, para que no dividan
 * las mismas tareas de forma distinta.
 */
/**
 * Los ÚNICOS estados que el cliente ve en su portal: published (por revisar), in_corrections
 * (el equipo trabaja sus cambios) y delivered (aprobado). Si un admin saca una tarea de
 * Greenlit de vuelta a producción interna (in_progress/under_review/completed/todo), deja de
 * ser client-facing y DESAPARECE del portal — el `published_at` viejo no basta para mostrarla,
 * el estado ACTUAL manda (Pedro 2026-09-03). Fuente única del filtro de carga del portal.
 */
export const ESTADOS_PORTAL: AssetStatus[] = ["published", "in_corrections", "delivered"];

export type BucketPortal = "activas" | "revision" | "aprobado";

export function bucketPortal(status: AssetStatus): BucketPortal {
  return status === "delivered" ? "aprobado" : status === "in_corrections" ? "revision" : "activas";
}

export const BUCKETS_PORTAL: { k: BucketPortal; label: string }[] = [
  { k: "activas", label: "Activas" },
  { k: "revision", label: "En revisión" },
  { k: "aprobado", label: "Aprobadas" },
];

/**
 * Estado EN PALABRAS DEL CLIENTE (etiqueta + color). Una sola fuente para el badge del nav
 * y el de las tarjetas. El VERDE es sólo "Aprobado"; una tarea que volvió tras una ronda
 * (published + reReview) es "Cambios listos" (morado de marca), nunca verde.
 */
export function estadoCliente(status: AssetStatus, reReview: boolean): { label: string; tone: string } {
  if (status === "delivered") return { label: "Aprobado", tone: "var(--status-completed)" };
  if (status === "in_corrections") return { label: "En cambios", tone: "var(--status-corrections)" };
  if (status === "published" && reReview) return { label: "Cambios listos", tone: "var(--primary)" };
  return { label: "Por revisar", tone: "var(--status-progress)" };
}
