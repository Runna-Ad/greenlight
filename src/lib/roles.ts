/**
 * Qué ve y qué puede hacer cada rol.
 *
 * Una sola fuente para el menú Y para los permisos: si vivieran en dos sitios,
 * acabarían discrepando y la vista previa dejaría de probar nada.
 *
 * OJO — hoy el login está apagado y las server actions usan la service-role key,
 * que se salta RLS. Así que esto gobierna las PANTALLAS de verdad, pero los
 * permisos sólo hasta donde el código los respeta; RLS todavía no participa.
 * El día que se encienda AUTH_ENABLED hay que volver a verificar cada vista,
 * porque RLS puede esconder más de lo que la vista previa enseñaba.
 */
export type ViewRole = "admin" | "lead" | "creative" | "client";

export const VIEW_ROLES: ViewRole[] = ["admin", "lead", "creative", "client"];

export const ROLE_LABEL: Record<ViewRole, string> = {
  admin: "Admin",
  lead: "Lead",
  creative: "Especialista",
  client: "Cliente",
};

export const ROLE_HINT: Record<ViewRole, string> = {
  admin: "Ve y hace todo, incluida la configuración",
  lead: "Reparte trabajo, revisa y aprueba",
  creative: "Sólo sus tareas asignadas",
  client: "Sólo lo publicado para su cliente",
};

/** El rol real de la cuenta. Con el login apagado, Pedro es admin. */
export const DEFAULT_ROLE: ViewRole = "admin";

// ── Secciones del menú ──────────────────────────────────────
// Los ids son estables; el orden y las etiquetas viven en el sidebar.
export type NavKey =
  | "clientes"
  | "mi-trabajo"
  | "carga"
  | "entrega-check"
  | "tablero"
  | "briefs"
  | "sync"
  | "entregas"
  | "admin"
  | "portal";

const NAV_BY_ROLE: Record<ViewRole, NavKey[]> = {
  admin: [
    "clientes",
    "mi-trabajo",
    "carga",
    "entrega-check",
    "tablero",
    "briefs",
    "sync",
    "entregas",
    "portal",
    "admin",
  ],
  // El lead reparte y revisa, pero no toca la configuración del sistema.
  lead: [
    "clientes",
    "mi-trabajo",
    "carga",
    "entrega-check",
    "tablero",
    "briefs",
    "sync",
    "entregas",
    "portal",
  ],
  // El especialista entra a trabajar lo suyo: su lista y el tablero.
  creative: ["mi-trabajo", "tablero"],
  // El cliente no entra a la app interna en absoluto — sólo a su portal.
  client: ["portal"],
};

export const canSee = (role: ViewRole, key: NavKey): boolean =>
  NAV_BY_ROLE[role].includes(key);

// ── Permisos ────────────────────────────────────────────────

/** Quién puede sacar una tarea de las transiciones permitidas (queda auditado). */
export const canOverrideStatus = (role: ViewRole): boolean =>
  role === "admin" || role === "lead";

/** Quién puede cambiar quién trabaja una tarea. */
export const canAssign = (role: ViewRole): boolean =>
  role === "admin" || role === "lead";

/** Quién puede mover una tarea por el flujo normal. */
export const canMoveStatus = (role: ViewRole): boolean => role !== "client";
