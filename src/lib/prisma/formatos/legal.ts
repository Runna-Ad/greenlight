/**
 * HÜE Prisma › Formatos — elegir el LEGAL de la biblioteca de Greenlight en la puerta PSD (B24; Pedro, 2026-10-21:
 * "select one of the saved legales… it gets changed on all the sizes", opción 1). Puro: corre en la página y en Node.
 *
 * Elegir un legal es lo mismo que escribirlo en el editor: un cambio de texto del ANUNCIO (`CambiosTexto`), que sale
 * en todas las medidas. Lo que se mueve o se agranda en el editor de una medida sigue siendo sólo de esa medida.
 */
import { claveTexto, type CambiosTexto } from "./cambios-texto.ts";
import { esNombreLegal, type Rol } from "./roles.ts";
import { limpiarTexto, TEXTO_CAMBIADO_MAX } from "./textos.ts";
import type { TextoPieza } from "./psd.ts";

/** Un legal guardado en la biblioteca (`snippets`, kind legal). `clienteId` null = global (sirve para todos). */
export type LegalGuardado = { id: string; titulo: string; texto: string; marca: string | null; clienteId: string | null };

/** El texto que es el legal en una mesa del PSD: dónde está y con qué se reconoce en todas las medidas. */
export type TextoLegal = { mi: number; pieza: number; j: number; clave: string; texto: string };

type PiezaConTextos = { nombre: string; rol: Rol | null; textos: readonly TextoPieza[]; partes?: readonly { nombre: string; textos: readonly TextoPieza[] }[] };

/** Un legal se escribe como lo escribiría el editor (`limpiarTexto`) y sin espacios a los lados (los de Notion a veces
 *  traen un salto al final). */
const limpio = (texto: string) => limpiarTexto(texto).trim();
/** Las mismas palabras aunque cambien los saltos de línea o los espacios: el legal del PSD trae los saltos que puso el
 *  diseñador y el de la Biblioteca es un solo párrafo. Iguales así, se queda el del PSD (con sus saltos). */
const mismo = (a: string, b: string) => limpio(a).replace(/\s+/g, " ") === limpio(b).replace(/\s+/g, " ");

/** ¿Cabe en la capa? Uno más largo saldría cortado (`textoCambiado` corta en TEXTO_CAMBIADO_MAX): no se escribe. */
export const legalCabe = (texto: string) => limpio(texto).length <= TEXTO_CAMBIADO_MAX;

/**
 * El legal de cada mesa: un texto de su FOOTER. Primero el de una carpeta o subcarpeta que se llame LEGAL (o LEGALES,
 * DISCLAIMER); si no hay, el texto con más letras del FOOTER (las tiendas casi nunca son texto, y cuando lo son, son
 * cortas). Una mesa sin texto en FOOTER no tiene legal que cambiar.
 */
export function legalDelPsd(maestros: readonly { piezas: readonly PiezaConTextos[] }[]): TextoLegal[] {
  const out: TextoLegal[] = [];
  for (const [mi, ma] of maestros.entries()) {
    let mejor: TextoLegal | null = null;
    let mejorPorNombre = false;
    for (const [pieza, p] of ma.piezas.entries()) {
      if (p.rol !== "FOOTER") continue;
      // Las claves de los textos que están en una pieza o parte con nombre de legal.
      const conNombre = esNombreLegal(p.nombre) ? p.textos : (p.partes ?? []).filter((d) => esNombreLegal(d.nombre)).flatMap((d) => d.textos);
      const claves = new Set(conNombre.map((tp) => claveTexto(tp)));
      for (const [j, tp] of p.textos.entries()) {
        const texto = tp.texto.texto, letras = limpio(texto).length;
        if (!letras) continue;
        const clave = claveTexto(tp), porNombre = claves.has(clave);
        // Gana el que tiene nombre de legal; entre iguales, el de más letras.
        if (!mejor || (porNombre && !mejorPorNombre) || (porNombre === mejorPorNombre && letras > limpio(mejor.texto).length)) {
          mejor = { mi, pieza, j, clave, texto };
          mejorPorNombre = porNombre;
        }
      }
    }
    if (mejor) out.push(mejor);
  }
  return out;
}

/**
 * Los cambios de texto con `nuevo` como legal en todas sus mesas (null = volver al del PSD). Un legal con las mismas
 * palabras que el del PSD no es cambio (se queda el del PSD, con sus saltos). Un legal vacío o que no cabe no se pone:
 * el legal nunca se borra ni sale cortado. Si nada cambia, devuelve EL MISMO objeto (la página no vuelve a escribir todo).
 */
export function conLegal(cambios: CambiosTexto, legal: readonly TextoLegal[], nuevo: string | null): CambiosTexto {
  const v = nuevo === null ? null : limpio(nuevo);
  if (v !== null && (!v || !legalCabe(v))) return cambios;
  let out: Record<string, string> | null = null;
  for (const l of legal) {
    if (v === null || mismo(v, l.texto)) {
      if (!(l.clave in cambios)) continue;
      out ??= { ...cambios };
      delete out[l.clave];
    } else if (cambios[l.clave] !== v) {
      out ??= { ...cambios };
      out[l.clave] = v;
    }
  }
  return out ?? cambios;
}

/** Para «Deshacer»: los cambios de ahora con el legal como estaba en `antes` (lo demás que se cambió después se queda). */
export function conLegalDe(cambios: CambiosTexto, legal: readonly TextoLegal[], antes: CambiosTexto): CambiosTexto {
  let out: Record<string, string> | null = null;
  for (const { clave } of legal) {
    if (cambios[clave] === antes[clave] && (clave in cambios) === (clave in antes)) continue;
    out ??= { ...cambios };
    if (clave in antes) out[clave] = antes[clave];
    else delete out[clave];
  }
  return out ?? cambios;
}

/** Qué legal va ahora: el del PSD (y si ése ya es uno de la biblioteca, cuál), uno de la biblioteca (el mismo texto en
 *  todas las mesas) o uno escrito a mano en el editor. */
export type LegalVigente = { tipo: "psd"; igualA: LegalGuardado | null } | { tipo: "biblioteca"; legal: LegalGuardado } | { tipo: "mano" };

export function legalVigente(cambios: CambiosTexto, legal: readonly TextoLegal[], guardados: readonly LegalGuardado[]): LegalVigente {
  const puestos = legal.map((l) => (l.clave in cambios ? cambios[l.clave] : l.texto));
  const de = guardados.find((g) => puestos.every((v) => mismo(v, g.texto))) ?? null;
  if (legal.every((l) => !(l.clave in cambios))) return { tipo: "psd", igualA: de };
  return de ? { tipo: "biblioteca", legal: de } : { tipo: "mano" };
}

/** Un grupo de la lista: los de una marca, o los globales (`marca` null). */
export type GrupoLegal = { marca: string | null; legales: LegalGuardado[] };

/** Los legales que se le ofrecen a un cliente: los de sus marcas (A-Z) y, al final, los globales; dentro de cada grupo
 *  en el orden en que llegan (por título). Sin cliente, ninguno: el legal de una marca no se ofrece a ciegas. */
export function legalesParaCliente(guardados: readonly LegalGuardado[], clienteId: string): GrupoLegal[] {
  if (!clienteId) return [];
  const grupos = new Map<string | null, GrupoLegal>();
  for (const g of guardados) {
    if (g.clienteId !== null && g.clienteId !== clienteId) continue;
    const marca = g.clienteId === null ? null : (g.marca ?? "");
    const grupo = grupos.get(marca) ?? { marca, legales: [] };
    grupo.legales.push(g);
    grupos.set(marca, grupo);
  }
  return [...grupos.values()].sort((a, b) => (a.marca === null ? 1 : b.marca === null ? -1 : a.marca.localeCompare(b.marca, "es")));
}

/** Qué tanto se tiene que parecer el legal leído de una imagen plana a uno guardado para ponerlo solo (Pedro,
 *  2026-10-28: "match it to one of the ones we have and then just copy paste the text"), y por cuánto le tiene que
 *  ganar al segundo: dos casi iguales (la misma promo con otra fecha) no se eligen a ciegas. */
export const LEGAL_PARECIDO_MIN = 0.7;
export const LEGAL_PARECIDO_VENTAJA = 0.1;

/** Las palabras de un legal sin acentos, mayúsculas ni signos: la IA lee «Términos» como «Terminos» o junta un punto. */
const palabras = (texto: string) =>
  limpio(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9ñ$%]+/)
    .filter(Boolean);

/** Cuántas palabras comparten (contando repetidas), de 0 a 1 (Dice): una o dos mal leídas en un legal largo no lo hunden. */
export function parecidoLegal(a: string, b: string): number {
  const pa = palabras(a), pb = palabras(b);
  if (!pa.length || !pb.length) return 0;
  const cuenta = new Map<string, number>();
  for (const p of pa) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  let comunes = 0;
  for (const p of pb) {
    const n = cuenta.get(p) ?? 0;
    if (n > 0) {
      comunes++;
      cuenta.set(p, n - 1);
    }
  }
  return (2 * comunes) / (pa.length + pb.length);
}

/** El legal guardado al que se parece el leído (de los que se le ofrecen al cliente), o null si ninguno se parece lo
 *  bastante o hay dos que se parecen casi igual. Uno que no cabe en la capa no se ofrece. */
export function legalParecido(leido: string, guardados: readonly LegalGuardado[]): { legal: LegalGuardado; parecido: number } | null {
  const notas = guardados.filter((g) => legalCabe(g.texto)).map((legal) => ({ legal, parecido: parecidoLegal(leido, legal.texto) })).sort((x, y) => y.parecido - x.parecido);
  const [mejor, segundo] = notas;
  if (!mejor || mejor.parecido < LEGAL_PARECIDO_MIN) return null;
  if (segundo && mejor.parecido - segundo.parecido < LEGAL_PARECIDO_VENTAJA) return null;
  return mejor;
}
