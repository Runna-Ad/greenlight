"use server";

import { after } from "next/server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canMoveStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import { reunirContextoTarea, escribirGuion, escribirCopy } from "@/lib/hue-writer";
import type { PlanoParsed, EstaticoParsed } from "@/lib/guion";

// El modelo del writer (hue-writer.ts) — se guarda como metadata de la generación.
const MODELO = "claude-sonnet-5";

/**
 * Guarda el BORRADOR que H.Ü.E generó (going-forward), para que el loop de
 * "aprender de ediciones" pueda compararlo después contra lo publicado. Corre en
 * `after()` (no bloquea la respuesta) y es NO CRÍTICO: si falla, se registra y ya
 * — nunca rompe la generación (el humano ya tiene su borrador en pantalla).
 */
async function capturarGeneracion(ideaId: string, kind: "guion" | "copy", draft: unknown): Promise<void> {
  try {
    if (!hasSupabase()) return;
    await supabaseAdmin().from("hue_generations").insert({
      idea_id: ideaId,
      kind,
      draft: draft as never,
      model: MODELO,
      generated_by: await getSoyId(),
    });
  } catch (e) {
    console.error("[hue] no se pudo capturar la generación", e);
  }
}

/**
 * "Crear guión" — H.Ü.E ESCRIBE el guión desde la info de la tarea (Fase 2). Devuelve
 * PlanoParsed[] que entra a la MISMA vista previa editable + import que "Pegar guión"
 * (el humano revisa antes de escribir). Sólo genera; no toca la DB.
 *
 * Gates: como `importarGuion` — rol que edita (canMoveStatus) + assertCanActOnTask (la
 * acción LEE los datos de la tarea, así que necesita el scope check que extraerGuion,
 * al ser texto→planos puro, se salta).
 */
async function gate(ideaId: string): Promise<{ ok: false; error: string } | null> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  if (!canMoveStatus(await getViewAs())) return { ok: false, error: "Este rol no edita la plantilla." };
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };
  return null;
}

export async function crearGuion(
  ideaId: string,
): Promise<{ ok: true; planos: PlanoParsed[] } | { ok: false; error: string }> {
  const no = await gate(ideaId);
  if (no) return no;
  try {
    const ctx = await reunirContextoTarea(ideaId);
    if (!ctx) return { ok: false, error: "La tarea ya no existe." };
    const res = await escribirGuion(ctx);
    if (res.ok) after(() => capturarGeneracion(ideaId, "guion", res.planos));
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reunir el contexto de la tarea." };
  }
}

export async function crearCopy(
  ideaId: string,
): Promise<{ ok: true; estatico: EstaticoParsed } | { ok: false; error: string }> {
  const no = await gate(ideaId);
  if (no) return no;
  try {
    const ctx = await reunirContextoTarea(ideaId);
    if (!ctx) return { ok: false, error: "La tarea ya no existe." };
    const res = await escribirCopy(ctx);
    if (res.ok) after(() => capturarGeneracion(ideaId, "copy", res.estatico));
    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reunir el contexto de la tarea." };
  }
}
