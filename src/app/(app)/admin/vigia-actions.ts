"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSoyId } from "@/lib/soy";
import type { PrismaFuenteRow, PrismaPropuestaRow } from "@/lib/database.types";
import { catalogoDesdeFilas, validarFicha, type FilaHerramienta } from "@/lib/prisma/catalogo";
import { validarRegla } from "@/lib/prisma/reglas";
import { olvidarConocimiento } from "@/lib/prisma/data";
import { plano } from "@/lib/prisma/texto";
import { TOOLS, type Tool } from "@/lib/prisma/spec";
import { ESCRIBE_FICHA, ESCRIBE_REGLA, aplicarAFicha, codigoDeHuella, reglaDePropuesta, validarFuente, visible, type Origen, type TipoPropuesta } from "@/lib/prisma/vigia";
import { correrVigia, type ResumenVigia } from "@/lib/prisma/vigia-run";
import { noMaster } from "./gate";

/** F6b — Hub › Prisma › Vigía. Todo master-only (noMaster, la misma puerta del resto del Hub). */

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_TABLA = "Falta aplicar la migración 0074 (vigía).";
/** El error crudo de la BD va al log; al navegador, una frase (regla de la casa). */
function fallo(donde: string, msg: string | undefined): Fail {
  console.error(`[hub/vigia] ${donde}: ${msg ?? "?"}`);
  return /prisma_(fuentes|propuestas)/.test(msg ?? "") ? { ok: false, error: SIN_TABLA } : { ok: false, error: "No se pudo completar. Inténtalo de nuevo." };
}
const refrescar = () => {
  revalidatePath("/admin");
  revalidatePath("/prisma");
};

export type FuenteUI = Omit<PrismaFuenteRow, "ultimo_texto" | "ultimo_hash" | "updated_by"> & { leida: boolean };
export type PropuestaUI = Omit<PrismaPropuestaRow, "huella" | "decidido_por">;

/** Las fuentes (sin el texto guardado) + las propuestas: pendientes visibles y las últimas decididas. */
export async function hubVigia(): Promise<Ok<{ fuentes: FuenteUI[]; pendientes: PropuestaUI[]; decididas: PropuestaUI[]; enEspera: number }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();
  const [f, p, d] = await Promise.all([
    db.from("prisma_fuentes").select("id, url, nombre, tool, origen, activa, ultima_lectura, ultimo_error, updated_at, created_at, ultimo_hash").order("created_at").returns<(Omit<FuenteUI, "leida"> & { ultimo_hash: string | null })[]>(),
    db.from("prisma_propuestas").select("id, tipo, tool, origen, fuentes, resumen_es, contenido, cita, cita_url, cita_fecha, estado, motivo, decidido_at, created_at").eq("estado", "pendiente").order("created_at", { ascending: false }).limit(100).returns<PropuestaUI[]>(),
    db.from("prisma_propuestas").select("id, tipo, tool, origen, fuentes, resumen_es, contenido, cita, cita_url, cita_fecha, estado, motivo, decidido_at, created_at").neq("estado", "pendiente").order("decidido_at", { ascending: false }).limit(30).returns<PropuestaUI[]>(),
  ]);
  if (f.error) return fallo("fuentes", f.error.message);
  if (p.error) return fallo("pendientes", p.error.message);
  if (d.error) return fallo("decididas", d.error.message);
  const todas = p.data ?? [];
  // Comunidad: se enseña cuando la confirman 2 fuentes; mientras, "en espera".
  const pendientes = todas.filter((x) => visible({ origen: x.origen as Origen, fuentes: x.fuentes }));
  return {
    ok: true,
    fuentes: (f.data ?? []).map(({ ultimo_hash, ...x }) => ({ ...x, leida: !!ultimo_hash })),
    pendientes,
    decididas: d.data ?? [],
    enEspera: todas.length - pendientes.length,
  };
}

/** Alta (sin id) o edición (con id) de una fuente. */
export async function guardarFuenteVigia(raw: unknown, id?: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (id !== undefined && !UUID_RE.test(id)) return { ok: false, error: "Esa fuente ya no existe." };
  const v = validarFuente(raw);
  if (!v.ok) return v;
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para editar las fuentes." };
  const db = supabaseAdmin();
  const fila = { ...v.fila, updated_by: soyId, updated_at: new Date().toISOString() };
  let error: { code?: string; message: string } | null = null;
  if (id) {
    const { data: actual, error: e0 } = await db.from("prisma_fuentes").select("url").eq("id", id).maybeSingle<{ url: string }>();
    if (e0) return fallo("leer fuente", e0.message);
    if (!actual) return { ok: false, error: "Esa fuente ya no existe." };
    // Otra liga = otra página: la lectura guardada ya no sirve para comparar (la siguiente es línea base).
    const reinicio = actual.url !== fila.url ? { ultimo_hash: null, ultimo_texto: null } : {};
    ({ error } = await db.from("prisma_fuentes").update({ ...fila, ...reinicio }).eq("id", id));
  } else {
    ({ error } = await db.from("prisma_fuentes").insert(fila));
  }
  if (error) return error.code === "23505" ? { ok: false, error: "Esa liga ya está en la lista." } : fallo("guardar", error.message);
  refrescar();
  return { ok: true };
}

export async function activarFuenteVigia(id: string, activa: boolean): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (!UUID_RE.test(id)) return { ok: false, error: "Esa fuente ya no existe." };
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para editar las fuentes." };
  const { data, error } = await supabaseAdmin().from("prisma_fuentes").update({ activa: !!activa, updated_by: soyId, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error) return fallo("activar", error.message);
  if (!data) return { ok: false, error: "Esa fuente ya no existe." };
  refrescar();
  return { ok: true };
}

/** "Revisar ahora": una corrida a la vez y no más de una cada 2 minutos, en todas las instancias (candado en la BD,
 *  el mismo que usa el cron). Cada lote con cambios es una llamada a H.Ü.E. */
export async function revisarAhoraVigia(soloId?: string): Promise<Ok<{ resumen: ResumenVigia }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (soloId !== undefined && !UUID_RE.test(soloId)) return { ok: false, error: "Esa fuente ya no existe." };
  try {
    const r = await correrVigia(supabaseAdmin(), 120, { soloId, maxLlamadas: 8 });
    if (!r.ok) return r;
    refrescar();
    return { ok: true, resumen: r.resumen };
  } catch (e) {
    return fallo("revisar", e instanceof Error ? e.message : String(e));
  }
}

/** Aprobar = RECLAMAR la propuesta (pendiente → aprobada, en un solo UPDATE condicionado: un descarte o una
 *  segunda aprobación al mismo tiempo no pueden cruzarse), escribir con el MISMO validador del Hub y, si la
 *  escritura falla, devolverla a pendiente. Idempotente: el código de la regla sale de la huella. */
export async function aprobarPropuestaVigia(id: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (!UUID_RE.test(id)) return { ok: false, error: "Esa propuesta ya no existe." };
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para aprobar." };
  const db = supabaseAdmin();
  const ahora = new Date().toISOString();
  const { data: p, error } = await db.from("prisma_propuestas").update({ estado: "aprobada", decidido_por: soyId, decidido_at: ahora }).eq("id", id).eq("estado", "pendiente").select("*").maybeSingle<PrismaPropuestaRow>();
  if (error) return fallo("reclamar propuesta", error.message);
  if (!p) return { ok: false, error: "Esa propuesta ya se decidió (o ya no existe)." };
  const devolver = async (msg: string): Promise<Fail> => {
    const { error: e } = await db.from("prisma_propuestas").update({ estado: "pendiente", decidido_por: null, decidido_at: null }).eq("id", id).eq("estado", "aprobada").eq("decidido_at", ahora);
    if (e) console.error(`[hub/vigia] devolver a pendiente: ${e.message}`);
    return { ok: false, error: msg };
  };
  try {
    return await escribirAprobada(db, p, soyId, ahora, devolver);
  } catch (e) {
    // Reclamada pero sin escribir: vuelve a pendiente (nunca "aprobada" sin nada detrás).
    fallo("aprobar", e instanceof Error ? e.message : String(e));
    return devolver("No se pudo completar. Inténtalo de nuevo.");
  }
}

async function escribirAprobada(db: ReturnType<typeof supabaseAdmin>, p: PrismaPropuestaRow, soyId: string, ahora: string, devolver: (msg: string) => Promise<Fail>): Promise<Ok | Fail> {
  const tipo = p.tipo as TipoPropuesta;
  const tool = p.tool && (TOOLS as string[]).includes(p.tool) ? (p.tool as Tool) : null;

  if (ESCRIBE_REGLA.includes(tipo)) {
    const v = validarRegla(reglaDePropuesta({ tipo, tool, contenido: p.contenido }, codigoDeHuella(p.huella), { url: p.cita_url, origen: p.origen }, ahora.slice(0, 10)));
    if (!v.ok) return devolver(`No pasa la validación del Hub: ${v.error}`);
    const { error: e } = await db.from("prisma_reglas").insert({ ...v.row, updated_by: soyId, updated_at: ahora });
    if (e && e.code !== "23505") {
      fallo("escribir regla", e.message);
      return devolver("No se pudo escribir la nota/regla. Inténtalo de nuevo.");
    }
  } else if (ESCRIBE_FICHA.includes(tipo)) {
    if (!tool) return devolver("La propuesta no dice a qué herramienta aplica.");
    const { data: fila, error: e1 } = await db.from("prisma_herramientas").select("tool, limites, fortalezas, modelos, fuente_url, fuente_fecha, updated_at").eq("tool", tool).maybeSingle<FilaHerramienta & { updated_at: string }>();
    if (e1) {
      fallo("leer herramienta", e1.message);
      return devolver("No se pudo leer la herramienta. Inténtalo de nuevo.");
    }
    // Si la ficha guardada no pasa la validación estricta, la carga tolerante la completaría con el código y el
    // upsert pisaría campos que la propuesta no toca: mejor que una persona la revise primero.
    if (fila && !validarFicha(tool, fila).ok) return devolver("La ficha guardada de esa herramienta tiene datos raros: revísala en Herramientas antes de aprobar.");
    const ficha = catalogoDesdeFilas(fila ? [fila] : [])[tool];
    const v = validarFicha(tool, aplicarAFicha(ficha, tool, { tipo, contenido: p.contenido }));
    if (!v.ok) return devolver(`No pasa la validación del Hub: ${v.error}`);
    const cambios = { ...v.fila, updated_by: soyId, updated_at: ahora };
    if (fila) {
      // Sólo si nadie la editó entre la lectura y la escritura (si no, se pisaría su cambio).
      const { data: hecha, error: e2 } = await db.from("prisma_herramientas").update(cambios).eq("tool", tool).eq("updated_at", fila.updated_at).select("tool").maybeSingle();
      if (e2) {
        fallo("escribir herramienta", e2.message);
        return devolver("No se pudo escribir la herramienta. Inténtalo de nuevo.");
      }
      if (!hecha) return devolver("Alguien editó esa herramienta hace un momento: vuelve a intentar.");
    } else {
      const { error: e2 } = await db.from("prisma_herramientas").insert(cambios);
      if (e2) {
        if (e2.code !== "23505") fallo("crear herramienta", e2.message);
        return devolver(e2.code === "23505" ? "Alguien editó esa herramienta hace un momento: vuelve a intentar." : "No se pudo escribir la herramienta. Inténtalo de nuevo.");
      }
    }
  }
  // tipo "codigo": no se escribe nada; queda aprobado como ticket (lo implementa Claude en la siguiente tanda).
  olvidarConocimiento();
  refrescar();
  return { ok: true };
}

export async function descartarPropuestaVigia(id: string, motivo: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  if (!UUID_RE.test(id)) return { ok: false, error: "Esa propuesta ya no existe." };
  const soyId = await getSoyId();
  if (!soyId) return { ok: false, error: "Inicia sesión para descartar." };
  const m = typeof motivo === "string" ? plano(motivo).slice(0, 300) : "";
  if (!m) return { ok: false, error: "Di por qué se descarta (así el vigía aprende qué no proponer)." };
  const { data, error } = await supabaseAdmin().from("prisma_propuestas").update({ estado: "descartada", motivo: m, decidido_por: soyId, decidido_at: new Date().toISOString() }).eq("id", id).eq("estado", "pendiente").select("id").maybeSingle();
  if (error) return fallo("descartar", error.message);
  if (!data) return { ok: false, error: "Esa propuesta ya se decidió." };
  refrescar();
  return { ok: true };
}
