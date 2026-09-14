"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { compararResultado, recompilar, PROMPT_VERSION } from "@/lib/prisma/writer";
import { BUCKET, cargarReglas } from "@/lib/prisma/data";
import { MODELOS_POR_TOOL, pistasModelo, recomendarModelo } from "@/lib/prisma/modelo";
import { detalleFallos, fallosDe, scoreDe, specCorreccion, veredictoAFila, veredictoDe, type ResultadoVivo } from "@/lib/prisma/resultado";
import { JOB_KIND, TOOLS, type PromptSpec, type Tool } from "@/lib/prisma/spec";
import { TOOLS_POR_JOB } from "@/lib/prisma/tools";
import { avisosDe, type Aviso } from "@/lib/prisma/diagnostico";
import type { Salida } from "@/lib/prisma/compilers";
import type { PrismaPromptRow, PrismaRefGuardada, PrismaResultadoRow } from "@/lib/database.types";
import { FRENO, MAX_BYTES_VISION, MAX_MB_VISION_TEXTO, UUID, anotarEvento, diagnosticoDe, faltaMigracion, fallo, gate, guardarPrompt, leerImagen, reglasDe, resultadoVivoDe, saturado, sn, specDeFila, subirAlBucket, type Fail, type Sesion, type SpecCargado } from "./comun";

/**
 * HÜE Prisma — F4 "sube lo que salió". Tres acciones sobre lo que la herramienta devolvió:
 *   1) subirResultado: la imagen + el modelo usado → H.Ü.E la compara con lo pedido (una llamada
 *      con visión) → fila en prisma_resultados + evento `resultado_subido` (qué falló).
 *   2) corregirResultado: un spec HERMANO de edición sobre ESA imagen ("arregla X, todo lo demás
 *      igual"), compilado sin modelo → prompt nuevo + evento `correccion_generada`. Idempotente.
 *   3) aceptarResultado: marcar/desmarcar el resultado final → evento `resultado_aceptado` (la
 *      señal de aprendizaje más fuerte; desmarcar la retira).
 * Gate, freno, saneo, subida y guardado son los de comun.ts (los mismos que actions.ts).
 */

/** El modelo que dice haber usado: uno de los de ESA herramienta, "otro", o nada. Fail-closed:
 *  no se guarda texto libre (y un modelo de Kling no cuenta para un resultado de Nano Banana). */
function modeloDe(raw: unknown, tool: Tool): string | null | Fail {
  const m = sn(raw, 60);
  if (!m) return null;
  return MODELOS_POR_TOOL[tool].some((x) => x.id === m) || m === "otro" ? m : { ok: false, error: "Modelo no válido." };
}

/** El resultado + el spec al que pertenece (con el cerco de siempre: sólo lo que puedes tocar). */
async function resultadoDeFila(resultadoId: string, g: Sesion): Promise<{ r: PrismaResultadoRow; s: SpecCargado } | Fail> {
  const id = sn(resultadoId, 64);
  if (!id || !UUID.test(id)) return { ok: false, error: "Resultado no válido." };
  const db = supabaseAdmin();
  const { data: r, error } = await db.from("prisma_resultados").select("*").eq("id", id).maybeSingle<PrismaResultadoRow>();
  if (error) return faltaMigracion(error, "0070") ?? fallo("prisma_resultados.select", error.message);
  if (!r) return { ok: false, error: "Ese resultado ya no existe." };
  // Un resultado pertenece a un spec: el permiso es el del spec (puedeTocar), una sola regla.
  const s = await specDeFila(r.spec_id, g);
  if ("ok" in s) return s;
  return { r, s };
}

// ── 1) Subir lo que salió y compararlo ──────────────────────
export type ResultadoSubido = { ok: true; resultado: ResultadoVivo };

export async function subirResultado(form: FormData): Promise<ResultadoSubido | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  const specId = sn(form.get("specId"), 64);
  const promptId = sn(form.get("promptId"), 64);
  if (!specId || !UUID.test(specId) || !promptId || !UUID.test(promptId)) return { ok: false, error: "Prompt no válido." };
  // Visión (facturable): el mismo cubo que leer una referencia.
  if (saturado(g.soyId, Date.now(), "vision", 30)) return FRENO;
  const s = await specDeFila(specId, g);
  if ("ok" in s) return s;
  const db = supabaseAdmin();
  const { data: p } = await db.from("prisma_prompts").select("*").eq("id", promptId).eq("spec_id", specId).maybeSingle<PrismaPromptRow>();
  if (!p) return { ok: false, error: "Ese prompt ya no existe." };
  // Refinar cambia el spec en su sitio: un resultado de un prompt VIEJO se compararía contra un spec
  // que no lo produjo. Sólo se acepta el prompt vigente del spec (el que la pantalla enseña).
  const { data: vigente } = await db.from("prisma_prompts").select("id").eq("spec_id", specId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (vigente && vigente.id !== p.id) return { ok: false, error: "Ese prompt ya cambió (se refinó o cambió de herramienta): reábrelo desde el historial y sube ahí lo que salió." };
  // Tope de visión (base64 incluido): por encima no hay comparación, y se dice antes de pagar nada.
  const img = await leerImagen(form, MAX_BYTES_VISION, `Para compararla, la imagen debe pesar menos de ${MAX_MB_VISION_TEXTO}.`);
  if ("ok" in img) return img;
  const tool: Tool = (TOOLS as string[]).includes(p.tool) ? (p.tool as Tool) : s.spec.tool;
  const modelo = modeloDe(form.get("modelo"), tool);
  if (modelo && typeof modelo === "object") return modelo;

  // Primero comparar, luego guardar: si H.Ü.E no responde, no queda un archivo huérfano en el bucket.
  const cmp = await compararResultado({ ...s.spec, tool }, p.salida, Buffer.from(img.bytes).toString("base64"), img.mime);
  if (!cmp.ok) return cmp;
  const path = await subirAlBucket(db, "prisma/out", img.bytes, img.mime);
  if (typeof path !== "string") return path;
  const v = cmp.veredicto;
  const { data: row, error } = await db
    .from("prisma_resultados")
    .insert({ spec_id: specId, prompt_id: promptId, client_id: s.row.client_id, tool, modelo, storage_path: path, mime: img.mime, caption: v.caption, veredicto: veredictoAFila(v), score: scoreDe(v), created_by: g.soyId })
    .select("*")
    .single<PrismaResultadoRow>();
  if (error || !row) {
    // Sin fila no hay quien apunte al archivo: se retira del bucket (best-effort) para no dejar huérfanos.
    const { error: rmError } = await db.storage.from(BUCKET).remove([path]);
    if (rmError) console.warn(`[prisma] no se pudo retirar ${path}: ${rmError.message}`);
    return faltaMigracion(error, "0070") ?? fallo("prisma_resultados.insert", error?.message);
  }
  // La señal: qué puntos fallaron en esta herramienta con esta marca (aprendizaje.ts los cuenta).
  await anotarEvento(db, { spec_id: specId, prompt_id: promptId, client_id: s.row.client_id, job: s.row.job, tool, variante: p.variante, user_id: g.soyId, tipo: "resultado_subido", detalle: detalleFallos(v) });
  return { ok: true, resultado: await resultadoVivoDe(db, row, s.spec.job) };
}

// ── 2) Corregir ESE resultado (spec hermano de edición, sin modelo) ──────────────
export type ResultadoCorregir = { ok: true; specId: string; promptId: string; tool: Tool; spec: PromptSpec; salida: Salida; valido: boolean; errores: string[]; avisos: Aviso[] };

export async function corregirResultado(resultadoId: string): Promise<ResultadoCorregir | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  // No llama al modelo, pero guarda dos filas por click: el mismo freno que cambiar de herramienta.
  if (saturado(g.soyId)) return FRENO;
  const rs = await resultadoDeFila(resultadoId, g);
  if ("ok" in rs) return rs;
  const { r, s } = rs;
  if (JOB_KIND[s.spec.job] === "video") return { ok: false, error: "Un cuadro de video no se corrige con un prompt de imagen: refina el original." };
  const v = veredictoDe(r.veredicto);
  if (!v.correccion) return { ok: false, error: "H.Ü.E no encontró una edición que arregle este resultado; refina el original." };
  const db = supabaseAdmin();

  // Idempotente: si este resultado ya tiene su corrección, se devuelve (no se crea otra por doble click).
  const { data: previo } = await db.from("prisma_specs").select("id").eq("correccion_de", r.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (previo) {
    const sp = await specDeFila(previo.id, g);
    const { data: p } = await db.from("prisma_prompts").select("*").eq("spec_id", previo.id).order("created_at", { ascending: false }).limit(1).maybeSingle<PrismaPromptRow>();
    if (!("ok" in sp) && p && (TOOLS as string[]).includes(p.tool)) {
      // Los avisos que se calcularon la primera vez viven en la fila (mismo patrón que abrirSpec).
      return { ok: true, specId: previo.id, promptId: p.id, tool: p.tool as Tool, spec: sp.spec, salida: { texto: p.salida, formato: p.formato }, valido: p.valido, errores: p.errores ?? [], avisos: avisosDe(p.avisos) };
    }
  }

  // La corrección se hace en la MISMA herramienta de imagen; si el resultado vino de otra, Nano Banana.
  const tool: Tool = (TOOLS as string[]).includes(r.tool) && TOOLS_POR_JOB.correccion.includes(r.tool as Tool) ? (r.tool as Tool) : "nanobanana";
  const spec = specCorreccion(s.spec, tool, v.correccion, v.caption, fallosDe(v));
  const rc = recompilar(spec, tool);
  const refs: PrismaRefGuardada[] = [{ role: "resultado", storage_path: r.storage_path, caption: v.caption, dna: null }];
  const { data: nuevo, error } = await db
    .from("prisma_specs")
    .insert({ client_id: s.row.client_id, marca_id: s.row.marca_id, job: "correccion", tool, destino: s.row.destino, idea: s.row.idea, spec, refs, created_by: g.soyId, origen_spec_id: r.spec_id, correccion_de: r.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !nuevo) return faltaMigracion(error, "0070") ?? fallo("prisma_specs.insert", error?.message);
  const reglas = await cargarReglas(db);
  const avisos = await diagnosticoDe(spec, tool, rc.salida, rc.errores, reglasDe(reglas), null);
  const promptId = await guardarPrompt(nuevo.id, tool, rc.salida, rc.valido, rc.errores, null, "base", PROMPT_VERSION, recomendarModelo(pistasModelo(spec, tool)).modelo, avisos);
  if (typeof promptId !== "string") return promptId;
  // El evento queda en el spec ORIGINAL: "a este prompt hubo que corregirle X".
  await anotarEvento(db, { spec_id: r.spec_id, prompt_id: r.prompt_id, client_id: s.row.client_id, job: s.row.job, tool, variante: "base", user_id: g.soyId, tipo: "correccion_generada", detalle: fallosDe(v).join(",") || null });
  return { ok: true, specId: nuevo.id, promptId, tool, spec, salida: rc.salida, valido: rc.valido, errores: rc.errores, avisos };
}

// ── 3) Marcar (o desmarcar) el resultado final aceptado ────────────────────────
export async function aceptarResultado(resultadoId: string, aceptado: boolean): Promise<{ ok: true; aceptado: boolean } | Fail> {
  const g = await gate();
  if ("ok" in g) return g;
  if (typeof aceptado !== "boolean") return { ok: false, error: "Valor no válido." };
  // No llama al modelo; inserta/borra una fila de evento por click.
  if (saturado(g.soyId, Date.now(), "eventos", 120)) return FRENO;
  const rs = await resultadoDeFila(resultadoId, g);
  if ("ok" in rs) return rs;
  const { r, s } = rs;
  const db = supabaseAdmin();
  // El UPDATE debe PROBAR que cambió algo: si ya estaba así, no se suma (ni se resta) señal.
  const { data: upd, error } = await db.from("prisma_resultados").update({ aceptado }).eq("id", r.id).eq("aceptado", !aceptado).select("id").maybeSingle<{ id: string }>();
  if (error) return fallo("prisma_resultados.update", error.message);
  if (!upd) return { ok: true, aceptado };
  // El evento lleva el id del RESULTADO en `detalle`: un prompt puede tener varios resultados subidos y
  // desmarcar uno no debe borrar la señal de otro. Se retira sólo la señal que ESTA persona dio.
  if (aceptado) {
    await anotarEvento(db, { spec_id: r.spec_id, prompt_id: r.prompt_id, client_id: s.row.client_id, job: s.row.job, tool: r.tool, variante: "base", user_id: g.soyId, tipo: "resultado_aceptado", detalle: r.id });
  } else {
    const { error: delError } = await db.from("prisma_eventos").delete().eq("tipo", "resultado_aceptado").eq("spec_id", r.spec_id).eq("detalle", r.id).eq("user_id", g.soyId);
    if (delError) console.warn(`[prisma] resultado_aceptado no retirado: ${delError.message}`);
  }
  return { ok: true, aceptado };
}
