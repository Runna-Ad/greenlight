/**
 * HÜE Prisma › Formatos — qué papel tiene cada carpeta de un PSD (puro y chico: lo usan el lector del PSD, el
 * acomodo y la pantalla).
 *
 * La guía de diseño pide 7 carpetas con nombre fijo (BRAND / TITULO / SUBTITULO / CTA / HERO / FOOTER /
 * BACKGROUND). Los PSD reales a veces traen otros nombres ("Logo", "Copy", "CARD", "Legales"): los más comunes se
 * reconocen solos y, en la pantalla, cada carpeta fuera de la guía tiene un selector ya puesto en lo que parece
 * (Pedro, 2026-10-14, opción 3), para corregirlo con un clic.
 */
export const ROLES = ["BACKGROUND", "HERO", "TITULO", "SUBTITULO", "CTA", "BRAND", "FOOTER"] as const;
export type Rol = (typeof ROLES)[number];

/** Sin mayúsculas, acentos ni espacios a los lados ("Subtítulo " → SUBTITULO). */
const normal = (nombre: string) => nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

/** Otros nombres que usa el equipo para lo mismo. Nombre COMPLETO, nunca "contiene" ("LOGO 2" no es BRAND). */
const OTROS_NOMBRES: Record<string, Rol> = {
  LOGO: "BRAND", LOGOS: "BRAND", MARCA: "BRAND", BRANDING: "BRAND",
  COPY: "TITULO", TITULAR: "TITULO", HEADLINE: "TITULO", TITLE: "TITULO", TEXTO: "TITULO", TEXTOS: "TITULO",
  SUBTITLE: "SUBTITULO", SUBHEAD: "SUBTITULO", BAJADA: "SUBTITULO", BENEFICIOS: "SUBTITULO", BENEFITS: "SUBTITULO",
  BOTON: "CTA", BUTTON: "CTA",
  CARD: "HERO", TARJETA: "HERO", PRODUCTO: "HERO", PRODUCT: "HERO", IMAGEN: "HERO", IMAGE: "HERO", KV: "HERO",
  LEGAL: "FOOTER", LEGALES: "FOOTER", DISCLAIMER: "FOOTER", PIE: "FOOTER",
  FONDO: "BACKGROUND", BG: "BACKGROUND",
};

/** ¿Es exactamente uno de los 7 nombres de la guía? */
export const nombreDeGuia = (nombre: string) => (ROLES as readonly string[]).includes(normal(nombre));

/** El papel de una carpeta: su nombre de la guía, o el de uno de los otros nombres conocidos. null = no se sabe. */
export function rolDe(nombre: string): Rol | null {
  const n = normal(nombre);
  return (ROLES as readonly string[]).includes(n) ? (n as Rol) : (OTROS_NOMBRES[n] ?? null);
}

/** Cómo se nombra una pieza en los avisos: el nombre de su carpeta (el que ve el diseñador en Photoshop) y, si no es
 *  un nombre de la guía, también su papel: «TITULO», «Copy» (TITULO), «Capa suelta». */
export const etiquetaPieza = (p: { nombre: string; rol: Rol | null }): string =>
  p.rol && !nombreDeGuia(p.nombre) ? `«${p.nombre}» (${p.rol})` : `«${p.nombre}»`;
