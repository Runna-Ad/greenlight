import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_ROLE, VIEW_ROLES, type ViewRole } from "./roles";

export const VIEW_AS_COOKIE = "gl_view_as";

/**
 * El rol con el que se está mirando la app ahora mismo.
 *
 * Se lee en el SERVIDOR (cookie, no localStorage) para que el menú y las
 * páginas ya salgan filtrados del render. Con localStorage se vería un
 * parpadeo del menú completo antes de recortarse — y en una vista previa de
 * cliente ese parpadeo enseña justo lo que no debe verse.
 */
export async function getViewAs(): Promise<ViewRole> {
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  return VIEW_ROLES.includes(raw as ViewRole) ? (raw as ViewRole) : DEFAULT_ROLE;
}

/** true cuando se está viendo la app como alguien que no eres. */
export async function isPreviewing(): Promise<boolean> {
  return (await getViewAs()) !== DEFAULT_ROLE;
}
