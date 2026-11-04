/**
 * De quién es lo que se guarda en este navegador (tipografías recordadas, ediciones, textos). Dos personas pueden usar la
 * misma computadora: cada una ve lo suyo. La pantalla lo fija al abrir, antes de leer nada. Sin sesión, "sin-perfil".
 */
let perfil = "sin-perfil";

export const fijarPerfil = (id: string | null): string => (perfil = id ?? "sin-perfil");
export const perfilActual = (): string => perfil;
