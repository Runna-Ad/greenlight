"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import {
  construirTarea,
  faltantesDraft,
  fold,
  idsIdeaRepetida,
  type CrearBriefInput,
  type TaskPayload,
} from "@/lib/intake-crear";
import type { SheetColumn } from "@/lib/sheet-sync";

export type CrearBriefResult = {
  ok: boolean;
  briefId?: string;
  code?: string;
  created: number;
  assets: number;
  /** Tarjetas rechazadas por campos obligatorios o # Idea repetido. */
  blocked: { titulo: string; missing: string[] }[];
  errors: string[];
};

/**
 * Crea un brief nuevo capturado a mano, con todas sus tareas, en UNA transacción
 * (rpc_crear_brief). TS resuelve vocab/members/marcas y valida; el RPC inserta.
 *
 * La puerta de obligatorios es la MISMA que el import (missingRequired): esto es
 * una server action = un POST; la UI también avisa, pero el gate de verdad vive
 * aquí para que nunca entre una tarea incompleta a la base.
 */
export async function crearBrief(
  clienteSlug: string,
  input: CrearBriefInput,
): Promise<CrearBriefResult> {
  const res: CrearBriefResult = {
    ok: false, created: 0, assets: 0, blocked: [], errors: [],
  };
  if (!hasSupabase()) {
    res.errors.push("La base de datos no está configurada.");
    return res;
  }

  const { header, tasks } = input;
  const track = header.track;

  if (!header.title.trim()) {
    res.errors.push("El brief necesita un título.");
    return res;
  }
  if (!tasks.length) {
    res.errors.push("Agrega al menos una tarea.");
    return res;
  }

  const db = supabaseAdmin();

  const { data: client } = await db
    .from("clients").select("id").eq("slug", clienteSlug).maybeSingle();
  if (!client) {
    res.errors.push(`Cliente "${clienteSlug}" no encontrado.`);
    return res;
  }

  const { data: vocab } = await db
    .from("vocab_terms").select("set, code, label_es, track");
  const V = (vocab ?? []) as { set: string; code: string; label_es: string; track: string }[];

  // Personas del track de ESTE brief (Real y Normal tienen pools distintos).
  const { data: memberRows } = await db
    .from("track_members").select("id, name, track").eq("active", true).eq("track", track);
  const memberIdPorNombre = new Map<string, string>(
    (memberRows ?? []).map((m) => [fold(m.name), m.id as string]),
  );

  const { data: marcaRows } = await db
    .from("marcas").select("id, name").eq("client_id", client.id);
  const marcaIdPorNombre = new Map<string, string>(
    (marcaRows ?? []).map((m) => [fold(m.name), m.id as string]),
  );

  // Con el login apagado, atribuimos al admin (igual que el import).
  const { data: actor } = await db
    .from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();

  const resuelto = { vocab: V, memberIdPorNombre, marcaIdPorNombre };

  // ── Gate por tarea + validación de identidad, ANTES de crear nada ──
  const repetidas = idsIdeaRepetida(tasks);
  const payloadTasks: TaskPayload[] = [];
  for (const t of tasks) {
    const missing: SheetColumn[] = faltantesDraft(t);
    const tarea = construirTarea(t, track, resuelto);

    // Un nombre tecleado que el pool no conoce es tan inválido como el vacío.
    if (!missing.includes("Asignación") && t.asignacion.length > 0 && tarea.member_ids.length === 0) {
      missing.push("Asignación");
    }

    const problemas: string[] = [...missing];
    if (repetidas.has(t.id)) problemas.push("# Idea repetido");

    if (problemas.length) {
      res.blocked.push({
        titulo: t.numIdea || t.naming || t.concepto.slice(0, 40) || "Tarea sin nombre",
        missing: problemas,
      });
      continue;
    }
    payloadTasks.push(tarea);
  }

  if (res.blocked.length) return res; // nada se crea si algo está bloqueado

  const mesToken = header.mes.trim() ? `${header.mes.trim().toUpperCase()}26` : null;
  const codeBase = `DIDI-${(header.mes.trim() || "BRIEF").toUpperCase()}-${track === "real" ? "REAL" : "NORMAL"}`;

  const payload = {
    client_id: client.id,
    code: codeBase,
    title: header.title.trim(),
    brief_name: header.briefName.trim() || null,
    track,
    mes_code: mesToken,
    created_by: actor?.id ?? null,
    tasks: payloadTasks,
  };

  const { data, error } = await db.rpc("rpc_crear_brief", { payload });
  if (error) {
    res.errors.push(error.message);
    return res;
  }

  const out = (data ?? {}) as { brief_id?: string; code?: string; created_tasks?: number; created_assets?: number };
  res.ok = true;
  res.briefId = out.brief_id;
  res.code = out.code;
  res.created = out.created_tasks ?? payloadTasks.length;
  res.assets = out.created_assets ?? 0;

  // Avisar a cada especialista: "nuevo brief, tienes X tareas". No es crítico
  // (el brief ya se creó); si falla, se traga sin romper la creación.
  if (out.brief_id) {
    const { error: notifErr } = await db.rpc("rpc_notificar_brief", { p_brief_id: out.brief_id });
    if (notifErr) res.errors.push(`aviso: ${notifErr.message}`);
    else after(() => dispatchPendingEmails());
  }

  revalidatePath(`/${clienteSlug}/briefs`);
  revalidatePath(`/${clienteSlug}/tablero`);
  return res;
}
