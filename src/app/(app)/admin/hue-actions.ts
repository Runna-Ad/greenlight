"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canHue } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { cargarHubIntelligence, cargarWinners, cargarEdiciones, type HubIntel, type Winner, type AdaptacionRow, type EdicionesResumen } from "@/lib/hue-data";
import { correrSintesis, correrSintesisEdiciones, sintetizarEdicionesSiAuto, type SintesisResultado } from "@/lib/hue-sintesis";
import { extraerTextoKb, esKbValido } from "@/lib/hue-kb-extract";
import type { HueInstruction, HueKbDocument, HueScope } from "@/lib/database.types";

const KB_BUCKET = "greenlight-kb";
const MAX_KB_BYTES = 20 * 1024 * 1024;

type Fail = { ok: false; error: string };
type Ok<T = object> = { ok: true } & T;

/** Un cliente con sus marcas, para el selector de scope del HUB (KB + Cerebro). */
export type ClienteScope = { id: string; name: string; marcas: { id: string; name: string }[] };

type ScopeResuelto = { scope: HueScope; client_id: string | null; marca_id: string | null };

/**
 * Resuelve el scope de un doc/lección desde lo que manda el picker (`scope` + `scopeId`),
 * validando que el id exista (no confía en el cliente).
 *
 * ⚠️ INVARIANTE DE AISLAMIENTO — un doc de MARCA guarda `client_id = NULL` a propósito
 * (igual que los snippets legales por marca). El writer filtra con un OR PLANO:
 *   `scope.eq.global, client_id.eq.<clienteDeLaTarea>, marca_id.eq.<marcaDeLaTarea>`
 * Si un doc de marca llevara `client_id`, la clause `client_id.eq` lo pescaría para
 * TODAS las marcas del cliente → un doc de "DiDi Card" se filtraría a un guión de
 * "DiDi Préstamos" (fuga cross-marca). Con `client_id = NULL` sólo `marca_id.eq` lo
 * pesca → queda aislado a su marca. **NO derivar client_id en la rama de marca.**
 *
 * Fail-closed: marca/cliente SIN id NO degrada a global (global = visible para TODOS
 * los clientes — el peor default para una feature de aislamiento).
 */
async function resolverScope(scope: string, scopeId: string | null): Promise<ScopeResuelto | Fail> {
  const db = supabaseAdmin();
  if (scope === "marca") {
    if (!scopeId) return { ok: false, error: "Elige la marca a la que aplica." };
    const { data, error } = await db.from("marcas").select("id").eq("id", scopeId).maybeSingle<{ id: string }>();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Esa marca ya no existe." };
    return { scope: "marca", client_id: null, marca_id: scopeId };
  }
  if (scope === "client") {
    if (!scopeId) return { ok: false, error: "Elige el cliente al que aplica." };
    const { data, error } = await db.from("clients").select("id").eq("id", scopeId).maybeSingle<{ id: string }>();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Ese cliente ya no existe." };
    return { scope: "client", client_id: scopeId, marca_id: null };
  }
  return { scope: "global", client_id: null, marca_id: null };
}

/** Gate del HUB: sólo master. Devuelve null si pasa, o un Fail si no. */
async function noMaster(): Promise<Fail | null> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!canHue(await getViewAs())) return { ok: false, error: "El H.Ü.E HUB es sólo del Master Builder." };
  return null;
}

// ── Loaders (lectura, master-gated) ──────────────────────────

export async function hubIntelligence(mes: string | null): Promise<Ok<{ intel: HubIntel | null }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  try {
    return { ok: true, intel: await cargarHubIntelligence(mes) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cargar la analítica." };
  }
}

export async function hubWinners(): Promise<Ok<{ winners: Winner[] }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  try {
    return { ok: true, winners: await cargarWinners() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cargar la biblioteca." };
  }
}

/** El Cerebro + su auditoría + los ajustes, en una sola llamada (lo que la pestaña
 *  Entrenamiento necesita para pintar de un jalón). */
export async function hubTraining(): Promise<
  | Ok<{ instrucciones: HueInstruction[]; kb: HueKbDocument[]; adaptaciones: AdaptacionRow[]; autoLearn: boolean; autoLearnEdits: boolean; clientes: ClienteScope[] }>
  | Fail
> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();
  const [ri, rk, ra, rs, rc, rm] = await Promise.all([
    db.from("hue_instructions").select("*").order("active", { ascending: false }).order("created_at", { ascending: false }),
    db.from("hue_kb_documents").select("*").order("created_at", { ascending: false }),
    db.from("hue_adaptations").select("id, at, trigger_summary, changed_instruction_id, reverted_at").order("at", { ascending: false }).limit(50),
    db.from("hue_settings").select("auto_learn, auto_learn_edits").eq("id", 1).maybeSingle(),
    db.from("clients").select("id, name").order("name"),
    db.from("marcas").select("id, name, client_id").order("name"),
  ]);
  // Un error de query NO debe leerse como "Cerebro vacío" — fallar honesto (reap S1).
  if (ri.error) return { ok: false, error: `Cerebro: ${ri.error.message}` };
  if (rk.error) return { ok: false, error: `KB: ${rk.error.message}` };
  if (ra.error) return { ok: false, error: `Auditoría: ${ra.error.message}` };
  if (rs.error) return { ok: false, error: `Ajustes: ${rs.error.message}` };
  if (rc.error) return { ok: false, error: `Clientes: ${rc.error.message}` };
  if (rm.error) return { ok: false, error: `Marcas: ${rm.error.message}` };
  const { data: instr } = ri;
  const { data: kb } = rk;
  const { data: adap } = ra;
  const { data: settings } = rs;
  // Clientes con sus marcas (agrupadas), para el selector de scope.
  const marcaRows = (rm.data ?? []) as { id: string; name: string; client_id: string | null }[];
  const clientes: ClienteScope[] = ((rc.data ?? []) as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
    marcas: marcaRows.filter((m) => m.client_id === c.id).map((m) => ({ id: m.id, name: m.name })),
  }));
  const instrucciones = (instr ?? []) as HueInstruction[];
  const titleById = new Map(instrucciones.map((i) => [i.id, i.title]));
  const adaptaciones: AdaptacionRow[] = ((adap ?? []) as {
    id: string;
    at: string;
    trigger_summary: string | null;
    changed_instruction_id: string | null;
    reverted_at: string | null;
  }[]).map((a) => ({
    id: a.id,
    at: a.at,
    trigger_summary: a.trigger_summary,
    instruccionTitle: a.changed_instruction_id ? titleById.get(a.changed_instruction_id) ?? null : null,
    reverted_at: a.reverted_at,
  }));
  const st = settings as { auto_learn: boolean; auto_learn_edits: boolean } | null;
  return {
    ok: true,
    instrucciones,
    kb: (kb ?? []) as HueKbDocument[],
    adaptaciones,
    autoLearn: st?.auto_learn === true,
    autoLearnEdits: st?.auto_learn_edits === true,
    clientes,
  };
}

/** El material del loop de ediciones para el HUB (visor + métrica). Dispara la
 *  síntesis auto (si `auto_learn_edits`) en background al cargar. */
export async function hubEdiciones(): Promise<Ok<{ ediciones: EdicionesResumen }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  try {
    const ediciones = await cargarEdiciones();
    const soyId = await getSoyId();
    after(() => sintetizarEdicionesSiAuto(soyId));
    return { ok: true, ediciones };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo cargar el aprendizaje de ediciones." };
  }
}

// ── Cerebro (hue_instructions) ───────────────────────────────

export async function crearInstruccion(
  title: string,
  body: string,
  scope: HueScope = "global",
  scopeId: string | null = null,
): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { ok: false, error: "El título y el cuerpo son obligatorios." };
  const sc = await resolverScope(scope, scopeId);
  if ("ok" in sc) return sc; // Fail
  const { error } = await supabaseAdmin().from("hue_instructions").insert({
    scope: sc.scope,
    client_id: sc.client_id,
    marca_id: sc.marca_id,
    title: t,
    body: b,
    source: "human",
    created_by: await getSoyId(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function editarInstruccion(id: string, title: string, body: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { ok: false, error: "El título y el cuerpo son obligatorios." };
  const db = supabaseAdmin();
  const { data: cur } = await db.from("hue_instructions").select("version").eq("id", id).maybeSingle();
  const version = ((cur as { version: number } | null)?.version ?? 1) + 1;
  const { data: upd, error } = await db.from("hue_instructions").update({ title: t, body: b, version }).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!upd?.length) return { ok: false, error: "Esa lección ya no existe." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleInstruccion(id: string, active: boolean): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const { error } = await supabaseAdmin().from("hue_instructions").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Revert de una lección (borrado duro). Marca la fila de auditoría como revertida si era auto. */
export async function borrarInstruccion(id: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();
  await db.from("hue_adaptations").update({ reverted_at: new Date().toISOString() }).eq("changed_instruction_id", id).is("reverted_at", null);
  const { error } = await db.from("hue_instructions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

// ── KB (hue_kb_documents + bucket greenlight-kb) ─────────────

export async function subirKb(form: FormData): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File)) return { ok: false, error: "No se recibió el archivo." };
  if (file.size > MAX_KB_BYTES) return { ok: false, error: "El archivo supera los 20MB." };
  if (!esKbValido(file.type, file.name)) return { ok: false, error: "Tipo no permitido (usa pdf, docx, txt o md)." };

  // Scope (marca/cliente/global) del picker — se resuelve ANTES de subir el objeto, para
  // no dejar un archivo huérfano en el bucket si el scope es inválido.
  const sc = await resolverScope(String(form.get("scope") ?? "global"), String(form.get("scope_id") ?? "").trim() || null);
  if ("ok" in sc) return sc; // Fail

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Extensión saneada (sólo [a-z0-9]) — un nombre raro como "x.pd/f" no debe meter el
  // objeto en un sub-path del bucket.
  const ext = ((file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin").slice(0, 8);
  const key = `${crypto.randomUUID()}.${ext}`;
  const db = supabaseAdmin();

  const { error: upErr } = await db.storage.from(KB_BUCKET).upload(key, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) return { ok: false, error: `No se pudo subir: ${upErr.message}` };

  let extracted = "";
  try {
    extracted = await extraerTextoKb(bytes, file.type, file.name);
  } catch (e) {
    console.error("[hue] extracción de KB falló", e);
    // Se sube igual; el texto queda vacío y se puede re-subir. No bloquea.
  }

  const { error: insErr } = await db.from("hue_kb_documents").insert({
    scope: sc.scope,
    client_id: sc.client_id,
    marca_id: sc.marca_id,
    title: title || file.name,
    storage_path: key,
    mime_type: file.type || null,
    size_bytes: file.size,
    extracted_text: extracted || null,
    uploaded_by: await getSoyId(),
  });
  if (insErr) {
    // Rollback del objeto si el registro falla (no dejar huérfanos).
    const { error: rmErr } = await db.storage.from(KB_BUCKET).remove([key]);
    if (rmErr) console.error("[hue] rollback del objeto de KB falló", rmErr);
    return { ok: false, error: insErr.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

export async function borrarKb(id: string): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const db = supabaseAdmin();
  const { data: doc } = await db.from("hue_kb_documents").select("storage_path").eq("id", id).maybeSingle();
  const key = (doc as { storage_path: string } | null)?.storage_path;
  const { error } = await db.from("hue_kb_documents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (key) {
    const { error: rmErr } = await db.storage.from(KB_BUCKET).remove([key]);
    if (rmErr) console.error("[hue] no se pudo borrar el objeto de storage del KB", rmErr);
  }
  revalidatePath("/admin");
  return { ok: true };
}

/** Texto extraído de un doc (para la vista previa). */
export async function kbTexto(id: string): Promise<Ok<{ texto: string }> | Fail> {
  const no = await noMaster();
  if (no) return no;
  const { data } = await supabaseAdmin().from("hue_kb_documents").select("extracted_text").eq("id", id).maybeSingle();
  return { ok: true, texto: (data as { extracted_text: string | null } | null)?.extracted_text ?? "" };
}

// ── Loop de auto-aprendizaje (switch + síntesis manual) ──────

export async function setAutoLearn(on: boolean): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const { data: upd, error } = await supabaseAdmin().from("hue_settings").update({ auto_learn: on }).eq("id", 1).select("id");
  if (error) return { ok: false, error: error.message };
  if (!upd?.length) return { ok: false, error: "No se encontró la configuración de H.Ü.E." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function correrSintesisAhora(): Promise<SintesisResultado> {
  const no = await noMaster();
  if (no) return no;
  const res = await correrSintesis(await getSoyId());
  if (res.ok) revalidatePath("/admin");
  return res;
}

/** Switch del loop de EDICIONES (independiente de auto_learn). */
export async function setAutoLearnEdits(on: boolean): Promise<Ok | Fail> {
  const no = await noMaster();
  if (no) return no;
  const { data: upd, error } = await supabaseAdmin().from("hue_settings").update({ auto_learn_edits: on }).eq("id", 1).select("id");
  if (error) return { ok: false, error: error.message };
  if (!upd?.length) return { ok: false, error: "No se encontró la configuración de H.Ü.E." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function correrSintesisEdicionesAhora(): Promise<SintesisResultado> {
  const no = await noMaster();
  if (no) return no;
  const res = await correrSintesisEdiciones(await getSoyId());
  if (res.ok) revalidatePath("/admin");
  return res;
}
