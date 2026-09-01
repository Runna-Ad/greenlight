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

/**
 * Fallback role for client-component PROPS only (the server always passes the real
 * role down). This is NOT an auth fallback anymore: with login on, the role comes
 * from the authenticated session (see lib/identity.ts). No session ⇒ least
 * privilege, NEVER admin — the old `= "admin"` default meant "no identity = admin",
 * which is exactly the hole login closes. Kept at 'creative' (least internal role).
 */
export const DEFAULT_ROLE: ViewRole = "creative";

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
  // `mi-perfil` se queda en los sets de rol para el GUARD de la página (canSee), pero ya
  // NO se muestra en la nav lateral: se accede desde el menú del avatar (Topbar). (Pedro)
  "mi-perfil",
];

const NAV_BY_ROLE: Record<ViewRole, NavKey[]> = {
  // El Master Builder ve todo, igual que admin.
  master: NAV_ALL,
  admin: NAV_ALL,
  // El lead reparte y revisa, pero no toca la configuración del sistema.
  // NO ve el "Portal": es el portal FUNCIONAL del cliente (actuar como cliente),
  // reservado a master/admin (Pedro 2026-08-21). La preview del cliente vive en la
  // tarea (Vista cliente/editor). `canSee(role,'portal')` gatea nav Y la ruta
  // /{slug}/portal (server component), así que quitarlo aquí cierra ambas.
  lead: [
    "clientes",
    "mi-trabajo",
    "performance",
    "tablero",
    "briefs",
    "sync",
    "entregas",
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
 * Quién entra al H.Ü.E HUB. Sólo el Master Builder — el HUB entrena y mide a
 * H.Ü.E (Cerebro, KB, ganadores, adopción) y es exclusivo del master. `canAdmin`
 * dejaría entrar a admins, por eso el HUB tiene su propio gate. (Pedro.)
 */
export const canHue = (role: ViewRole): boolean => role === "master";

/**
 * ¿Este miembro puede ser el LEAD de una tarea de `trackTarea`?
 *
 * FUENTE ÚNICA — la usan el gate del SERVIDOR (`asignarTarea`) y los DOS pickers
 * (el de la tarea y el del tablero). Si cada uno decidiera por su cuenta, la UI
 * ofrecería a alguien que el servidor rechaza (o al revés): exactamente el drift de
 * asignación que ya nos mordió una vez.
 *
 * Reglas:
 *  · `lead` → sí, pero SÓLO en su track (es departamental).
 *  · `admin`/`master` → sí, en CUALQUIER track: son globales (track = null), así que
 *    exigirles coincidencia de track los dejaría fuera de todo.
 *    [PEDRO 2026-09-01, cambia su decisión del 2026-08-21 de "admins/master NO son
 *    asignables": un admin puede llevar tareas como lead si así lo decide.]
 *  · `creative` → nunca lead (va de especialista); inactivos, nunca.
 */
export function puedeSerLead(
  m: { role: string | null; track: Track | null; tracks?: Track[] | null; active?: boolean },
  trackTarea: Track | null,
): boolean {
  if (m.active === false) return false;
  if (m.role === "admin" || m.role === "master") return true; // globales, sin track
  if (m.role !== "lead") return false;
  // Mismo grant multi-track que los especialistas (0059): pertenencia, no igualdad.
  const suyos = m.tracks && m.tracks.length ? m.tracks : m.track ? [m.track] : [];
  return trackTarea !== null && suyos.includes(trackTarea);
}

/** ¿Puede ser ESPECIALISTA (doer) de una tarea de `trackTarea`? Sólo `creative` de su
 *  track — los globales llevan, no ejecutan. Espejo de `puedeSerLead`. */
export function puedeSerEspecialista(
  m: { role: string | null; track: Track | null; tracks?: Track[] | null; active?: boolean },
  trackTarea: Track | null,
): boolean {
  if (m.active === false) return false;
  if (m.role !== "creative") return false;
  // PERTENENCIA, no igualdad: un creativo puede tener grant de varios tracks (0059).
  // Sin grant se cae a su track HOME — mismo comportamiento que antes.
  const suyos = m.tracks && m.tracks.length ? m.tracks : m.track ? [m.track] : [];
  return trackTarea !== null && suyos.includes(trackTarea);
}

/**
 * Qué EQUIPOS (tracks) ve un rol en Performance/Evaluación. `null` = todos.
 * Admin y Master ven todos los equipos; el Lead sólo los SUYOS — su alcance efectivo
 * de tracks (`member.tracks`/`soy.tracks`), que con el grant multi-track puede ser uno
 * o ambos. Sin identidad (tracks vacío) el lead no ve a nadie — mejor vacío honesto que
 * enseñar a todos por error.
 */
export function tracksVisibles(role: ViewRole, soyTracks: Track[] | null): Track[] | null {
  if (esNivelAdmin(role)) return null;
  if (role === "lead") return soyTracks && soyTracks.length ? soyTracks : [];
  return []; // creative/client no entran a la Evaluación
}
