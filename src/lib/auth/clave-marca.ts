/**
 * Contraseñas que un Master Builder le pone a un cliente desde Admin › Clientes
 * («Crear login»). Pedro pidió que sean fáciles de dictar por chat: el nombre de la
 * marca + "@" + números (DiDi@657). El cliente la puede cambiar después en su menú
 * de cuenta («Cambiar contraseña»).
 *
 * Puro (sin I/O ni crypto de Node) para usarse en el navegador (botón «Generar») y
 * en las pruebas. El azar se inyecta.
 */

/** Mínimo y máximo de una contraseña de cliente. 8 es el mismo mínimo que ya pide
 *  la página de entrada al crearla con código; 72 es el tope de bcrypt en Supabase. */
export const CLAVE_MIN = 8;
export const CLAVE_MAX = 72;

/** Cuántos números lleva la contraseña de marca. Con 3 hay 1,000 combinaciones por marca. */
export const DIGITOS_CLAVE_MARCA = 3;

/** Letras del nombre de la marca, sin acentos ni espacios, máximo 12 ("La Comer" → "LaComer"). */
export function raizDeMarca(nombre: string): string {
  const letras = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12);
  return letras || "Cliente";
}

/**
 * "DiDi" → "DiDi@657". Si la marca es muy corta, lleva más números para llegar al
 * mínimo (una marca de 2 letras daría "AB@123" = 6, demasiado corta).
 * `azar()` devuelve un número en [0, 1).
 */
export function claveDeMarca(nombre: string, azar: () => number): string {
  const raiz = raizDeMarca(nombre);
  const digitos = Math.max(DIGITOS_CLAVE_MARCA, CLAVE_MIN - raiz.length - 1);
  let numeros = "";
  for (let i = 0; i < digitos; i++) numeros += String(Math.min(9, Math.floor(azar() * 10)));
  return `${raiz}@${numeros}`;
}

/** null = la contraseña sirve; si no, el motivo en palabras para el usuario. */
export function motivoClaveInvalida(clave: string): string | null {
  if (clave.length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (clave.length > CLAVE_MAX) return `La contraseña es demasiado larga (máximo ${CLAVE_MAX} caracteres).`;
  if (/\s/.test(clave)) return "La contraseña no puede llevar espacios.";
  return null;
}

/** Azar del navegador o de Node 19+ (globalThis.crypto), nunca Math.random. */
export function azarSeguro(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
}
