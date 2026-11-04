/**
 * De quién es lo que se guarda en este navegador (tipografías recordadas, ediciones, textos). Dos personas pueden usar la
 * misma computadora: cada una ve lo suyo. La pantalla lo fija al abrir, antes de leer nada. Sin sesión, "sin-perfil".
 */
let perfil = "sin-perfil";

export const fijarPerfil = (id: string | null): string => (perfil = id ?? "sin-perfil");
export const perfilActual = (): string => perfil;

/** Otra pestaña de la misma persona, o sin perfil: no se escribe encima de lo guardado (lo que hagas se queda en esa pestaña). */
let escribe = true;
export const fijarEscritura = (si: boolean): void => void (escribe = si);
export const escribeAqui = (): boolean => escribe;
