/**
 * HÜE Prisma › Formatos — qué papel tiene cada carpeta de un PSD (puro y chico: lo usan el lector del PSD, el
 * acomodo y la pantalla).
 *
 * La guía de diseño pide 7 carpetas con nombre fijo (BRAND / TITULO / SUBTITULO / CTA / HERO / FOOTER /
 * BACKGROUND). Los PSD reales a veces traen otros nombres ("Logo", "Copy", "CARD", "Legales"): los más comunes se
 * reconocen solos y, en la pantalla, cada carpeta fuera de la guía tiene un selector ya puesto en lo que parece
 * (Pedro, 2026-10-14, opción 3), para corregirlo con un clic.
 */
import type { Layer } from "ag-psd";

export const ROLES = ["BACKGROUND", "HERO", "TITULO", "SUBTITULO", "CTA", "BRAND", "FOOTER"] as const;
export type Rol = (typeof ROLES)[number];

/** La carpeta en que se juntan, al abrir envolturas, las capas que quedan debajo del fondo (`desenvolver`): va con el fondo. */
export const CAPA_DEBAJO_FONDO = "Debajo del fondo (HÜE)";

/** El nombre de una capa o carpeta como lo usa la herramienta: sin caracteres de control ni invisibles, con tope. El
 *  lector del PSD y el PSD editable de cada medida (psd-editable.ts) lo limpian igual, para que la carpeta se reconozca. */
export const nombreDeCapa = (s: string | undefined): string => (s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 120);

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

/** Los nombres de carpeta o subcarpeta que SON el legal (dentro de FOOTER, junto a las tiendas). Nombre completo. */
const NOMBRES_LEGAL = new Set(["LEGAL", "LEGALES", "LEGALS", "DISCLAIMER"]);
export const esNombreLegal = (nombre: string) => NOMBRES_LEGAL.has(normal(nombre));

/** ¿Es exactamente uno de los 7 nombres de la guía? */
export const nombreDeGuia = (nombre: string) => (ROLES as readonly string[]).includes(normal(nombre));

/** El papel de una carpeta: su nombre de la guía, o el de uno de los otros nombres conocidos. null = no se sabe. */
export function rolDe(nombre: string): Rol | null {
  if (nombre === CAPA_DEBAJO_FONDO) return "BACKGROUND";
  const n = normal(nombre);
  return (ROLES as readonly string[]).includes(n) ? (n as Rol) : (OTROS_NOMBRES[n] ?? null);
}

/** ¿Va con el fondo? La carpeta de fondo de la guía, o lo que la persona eligió como fondo (`Origen.fondo`). El lector
 *  del PSD y el PSD editable deciden con esta misma función. */
export const esDelFondo = (nombre: string, elegidos: readonly string[] | undefined) => rolDe(nombre) === "BACKGROUND" || !!elegidos?.includes(nombre);

/** El fondo de la guía (BACKGROUND, Background, Fondo, BG), visible. */
const esFondoGuia = (l: Layer) => !l.hidden && rolDe(nombreDeCapa(l.name)) === "BACKGROUND";

/** ¿Trae adentro, en algún nivel, una carpeta visible con nombre de la guía? */
const traeGuia = (l: Layer, nivel = 0): boolean =>
  nivel < 8 && (l.children ?? []).some((h) => !h.hidden && !!h.children && (rolDe(nombreDeCapa(h.name)) !== null || traeGuia(h, nivel + 1)));

/** Una envoltura: carpeta visible sin nombre de la guía que trae carpetas de la guía adentro, y que no cambia cómo se ve
 *  lo de adentro (sin opacidad, fusión, máscara ni efectos propios; nada recortado a ella). Abrirla no cambia el anuncio. */
const esEnvoltura = (l: Layer, siguiente: Layer | undefined) =>
  !!l.children && !l.hidden && !l.artboard && !l.clipping && !siguiente?.clipping && rolDe(nombreDeCapa(l.name)) === null &&
  (l.opacity ?? 1) >= 1 && (!l.blendMode || l.blendMode === "pass through" || l.blendMode === "normal") &&
  !(l.mask && !l.mask.disabled) && !l.vectorMask && !(l.effects && !l.effects.disabled) && traeGuia(l);

/**
 * Las capas de primer nivel de una mesa, con las carpetas de la guía sacadas de las carpetas que las envuelven
 * (SPAPTOYBOX, 2026-10-30: «4-5» › «4:5» › «1:1» › Background…). Sólo si el primer nivel no trae fondo de la guía:
 * un PSD que ya sigue la guía no cambia. Lo que queda debajo del fondo de más arriba (otra versión del anuncio tapada
 * por él) se junta en una carpeta aparte (`debajo`) que es parte del fondo: se pinta con él (por si el fondo de arriba
 * deja ver algo) y nunca se vuelve pieza.
 * El lector del PSD y el PSD editable la llaman igual, sobre el mismo árbol: así las `ruta` y `carpeta` coinciden.
 * null = no hay nada que abrir.
 */
export function desenvolver(hijos: readonly Layer[]): { capas: Layer[]; abiertas: string[]; debajo: Layer | null } | null {
  if (hijos.some(esFondoGuia)) return null;
  const abiertas: string[] = [];
  const abrir = (ls: readonly Layer[]): Layer[] =>
    ls.flatMap((l, i) => (esEnvoltura(l, ls[i + 1]) ? (abiertas.push(nombreDeCapa(l.name)), abrir(l.children ?? [])) : [l]));
  const capas = abrir(hijos);
  if (!abiertas.length) return null;
  const k = capas.findLastIndex((l) => esFondoGuia(l) && !l.clipping);
  if (k <= 0) return { capas, abiertas, debajo: null };
  const debajo: Layer = { name: CAPA_DEBAJO_FONDO, children: capas.slice(0, k) };
  return { capas: [debajo, ...capas.slice(k)], abiertas, debajo };
}

/** Cómo se nombra una pieza en los avisos: el nombre de su carpeta (el que ve el diseñador en Photoshop) y, si no es
 *  un nombre de la guía, también su papel: «TITULO», «Copy» (TITULO), «Capa suelta». */
export const etiquetaPieza = (p: { nombre: string; rol: Rol | null }): string =>
  p.rol && !nombreDeGuia(p.nombre) ? `«${p.nombre}» (${p.rol})` : `«${p.nombre}»`;
