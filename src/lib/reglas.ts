// Evaluador de reglas contextuales — espejo de produccion.reglas_para_tarea().
//
// Vive en TS porque la regla de CASHBACK/MSI depende del texto que la persona
// está escribiendo: el chip tiene que encenderse en la misma tecla, sin ir al
// servidor. La duplicación es deliberada y queda fijada con contract test en
// scripts/test-db.mjs, igual que buildFilename, canMove y missingRequired.

// Con extensión: scripts/test-*.mjs importa estos libs directamente en Node,
// que la exige para imports de VALOR (los `import type` se borran y no importa).
import { plantillaPara, parseDuracion } from "./plantilla.ts";

export type Severidad = "info" | "aviso" | "bloqueo";

export type Regla = {
  codigo: string;
  titulo: string;
  mensaje: string;
  severidad: Severidad;
  scope: "global" | "client" | "marca";
  cond_media: "video" | "static" | null;
  cond_tipo_group: "video" | "images" | "copies" | null;
  cond_plataformas: string[];
  cond_marca_slug: string | null;
  cond_duracion_min_s: number | null;
  cond_texto_contiene: string[];
  sort_order: number;
};

export type ContextoTarea = {
  tipoAsset: string | null;
  plataformas: string[];
  duracion: string[];
  marcaSlug: string | null;
  /** Lo que la persona lleva escrito, para las reglas que miran contenido. */
  texto?: string;
};

/** El grupo que usan las condiciones: video / images / copies. */
function grupoDe(tipo: string | null): "video" | "images" | "copies" {
  const p = plantillaPara(tipo);
  return p === "guion" ? "video" : p === "estatico" ? "images" : "copies";
}

/** Un guión es 'video'; todo lo demás cuenta como pieza 'static'. */
function mediaDe(tipo: string | null): "video" | "static" {
  return grupoDe(tipo) === "video" ? "video" : "static";
}

/**
 * Las reglas que aplican, en orden. Todas las condiciones se combinan con AND;
 * una condición vacía no restringe.
 */
export function reglasQueAplican(reglas: Regla[], ctx: ContextoTarea): Regla[] {
  const media = mediaDe(ctx.tipoAsset);
  const grupo = grupoDe(ctx.tipoAsset);
  // La duración es un arreglo de pastillas; la regla mira la MÁS larga (espejo
  // del max(...) en reglas_para_tarea). Sin pastillas → 0.
  const durS = Math.max(0, ...ctx.duracion.map((d) => parseDuracion(d)?.max ?? 0));
  const texto = (ctx.texto ?? "").toUpperCase();

  return reglas
    .filter((r) => {
      if (r.cond_media && r.cond_media !== media) return false;
      if (r.cond_tipo_group && r.cond_tipo_group !== grupo) return false;
      if (r.cond_plataformas.length && !r.cond_plataformas.some((p) => ctx.plataformas.includes(p)))
        return false;
      if (r.cond_marca_slug && r.cond_marca_slug !== ctx.marcaSlug) return false;
      if (r.cond_duracion_min_s !== null && durS < r.cond_duracion_min_s) return false;
      if (r.cond_texto_contiene.length && !r.cond_texto_contiene.some((w) => texto.includes(w)))
        return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Agrupadas por plataforma, que es como hay que enseñarlas.
 *
 * Una tarea puede llevar varias plataformas y sus reglas contradecirse: las 5
 * tareas de Images son FB+GG+TT, y GG estático NO lleva CTA mientras FB SÍ.
 * Ningún color resuelve eso — el creativo tiene que ver ambas y ajustar al
 * exportar cada archivo.
 */
export type GrupoDeReglas = { plataforma: string | null; reglas: Regla[] };

export function agruparPorPlataforma(reglas: Regla[], plataformas: string[]): GrupoDeReglas[] {
  const generales = reglas.filter((r) => r.cond_plataformas.length === 0);
  const porPlat = plataformas
    .map((p) => ({
      plataforma: p,
      reglas: reglas.filter((r) => r.cond_plataformas.includes(p)),
    }))
    .filter((g) => g.reglas.length > 0);

  return generales.length ? [{ plataforma: null, reglas: generales }, ...porPlat] : porPlat;
}
