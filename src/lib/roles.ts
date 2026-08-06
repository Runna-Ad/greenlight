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
// `master` = Master Builder: el dueño de la plataforma (Pedro), el tier superior
// por encima de admin. Espeja el valor de enum produccion.app_role 'master'
// (migración 0023). Hoy, con el login apagado, es sobre todo etiqueta + jerarquía
// lista para cuando el login entre; en permisos se comporta como admin.
export type ViewRole = "master" | "admin" | "lead" | "creative" | "client";

export const VIEW_ROLES: ViewRole[] = ["master", "admin", "lead", "creative", "client"];

export const ROLE_LABEL: Record<ViewRole, string> = {
  master: "Master Builder",
  admin: "Admin",
  lead: "Lead",
  creative: "Especialista",
  client: "Cliente",
};

export const ROLE_HINT: Record<ViewRole, string> = {
  master: "El dueño de la plataforma — ve y hace todo",
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

const NAV_ALL: NavKey[] = [
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
];

const NAV_BY_ROLE: Record<ViewRole, NavKey[]> = {
  // El Master Builder ve todo, igual que admin.
  master: NAV_ALL,
  admin: NAV_ALL,
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
  // El especialista entra a trabajar lo suyo: su lista, el tablero y los
  // bundles (donde sólo ve las tareas que tiene asignadas).
  creative: ["mi-trabajo", "tablero", "briefs"],
  // El cliente no entra a la app interna en absoluto — sólo a su portal.
  client: ["portal"],
};

export const canSee = (role: ViewRole, key: NavKey): boolean =>
  NAV_BY_ROLE[role].includes(key);

// ── Permisos ────────────────────────────────────────────────

/** Nivel admin o superior (master/admin). */
const esNivelAdmin = (role: ViewRole): boolean =>
  role === "master" || role === "admin";

/** Quién puede sacar una tarea de las transiciones permitidas (queda auditado). */
export const canOverrideStatus = (role: ViewRole): boolean =>
  esNivelAdmin(role) || role === "lead";

/** Quién puede cambiar quién trabaja una tarea. */
export const canAssign = (role: ViewRole): boolean =>
  esNivelAdmin(role) || role === "lead";

/** Quién puede mover una tarea por el flujo normal. */
export const canMoveStatus = (role: ViewRole): boolean => role !== "client";

/**
 * Quién puede CREAR un brief. Aparte de canSee("briefs"): el especialista ahora
 * ve los bundles, pero capturar un brief sigue siendo del lead.
 */
export const canCreateBrief = (role: ViewRole): boolean =>
  esNivelAdmin(role) || role === "lead";

/** Quién entra al panel de administración. Sólo master/admin. */
export const canAdmin = (role: ViewRole): boolean => esNivelAdmin(role);
