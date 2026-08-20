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
// El antiguo `specialist_lead` se FUSIONÓ con `lead` (Dept Head / Lead): el lead
// ya asigna Y revisa/aprueba/envía al cliente, así que no hacía falta un rol
// aparte. El valor sigue en el enum de la base (histórico, sin filas) pero la app
// ya no lo usa.
// `client` es el rol EXTERNO. Se MUESTRA como "Partner"; el id interno sigue
// siendo `client` a propósito, para no tocar el enum ni las policies de la base —
// sólo cambia la etiqueta de cara al usuario.
import type { Track } from "./vocab";

export type ViewRole = "master" | "admin" | "lead" | "creative" | "client";

export const VIEW_ROLES: ViewRole[] = ["master", "admin", "lead", "creative", "client"];

export const ROLE_LABEL: Record<ViewRole, string> = {
  master: "Master Builder",
  admin: "Admin",
  lead: "Dept Head / Lead",
  creative: "Especialista",
  client: "Partner",
};

export const ROLE_HINT: Record<ViewRole, string> = {
  master: "El dueño de la plataforma — ve y hace todo, incluso asignar admins",
  admin: "Ve y hace todo, incluida la configuración",
  lead: "Asigna, revisa, aprueba y envía al cliente",
  creative: "Sólo sus tareas asignadas",
  client: "Sólo lo publicado para su marca (Partner)",
};

/** El rol real de la cuenta. Con el login apagado, Pedro es admin. */
export const DEFAULT_ROLE: ViewRole = "admin";

// ── Secciones del menú ──────────────────────────────────────
// Los ids son estables; el orden y las etiquetas viven en el sidebar.
export type NavKey =
  | "clientes"
  | "mi-trabajo"
  | "performance"
  | "tablero"
  | "briefs"
  | "sync"
  | "entregas"
  | "admin"
  | "mi-perfil"
  | "portal";

const NAV_ALL: NavKey[] = [
  "clientes",
  "mi-trabajo",
  "performance",
  "tablero",
  "briefs",
  "sync",
  "entregas",
  "portal",
  "admin",
  "mi-perfil", // admin/master también tienen su "Mi perfil" directo (antes sólo editable
               // desde Configuración; Pedro lo quiere consistente con los demás roles).
];

const NAV_BY_ROLE: Record<ViewRole, NavKey[]> = {
  // El Master Builder ve todo, igual que admin.
  master: NAV_ALL,
  admin: NAV_ALL,
  // El lead reparte y revisa, pero no toca la configuración del sistema.
  lead: [
    "clientes",
    "mi-trabajo",
    "performance",
    "tablero",
    "briefs",
    "sync",
    "entregas",
    "portal",
    "mi-perfil",
  ],
  // El especialista entra a trabajar lo suyo: su lista, el tablero y los
  // bundles (donde sólo ve las tareas que tiene asignadas) + su Mi perfil.
  creative: ["mi-trabajo", "tablero", "briefs", "mi-perfil"],
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

/** Quién puede cambiar quién trabaja una tarea (asignar). El Dept Head / Lead
 *  asigna; el especialista no. */
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

/**
 * Quién puede CREAR o ASCENDER admins (o master). Sólo el Master Builder — un
 * admin gestiona al equipo pero no puede nombrar a otro admin. (Pedro.)
 */
export const canAssignAdmins = (role: ViewRole): boolean => role === "master";

/**
 * Qué EQUIPOS (tracks) ve un rol en Performance/Evaluación. `null` = todos.
 * Admin y Master ven todos los equipos; el Lead sólo el SUYO (puede haber varios
 * leads por equipo). Sin identidad (`soy`) el lead no puede acotar a "su equipo",
 * así que no ve a nadie — mejor vacío honesto que enseñar a todos por error.
 */
export function tracksVisibles(role: ViewRole, soyTrack: Track | null): Track[] | null {
  if (esNivelAdmin(role)) return null;
  if (role === "lead") return soyTrack ? [soyTrack] : [];
  return []; // creative/client no entran a la Evaluación
}
