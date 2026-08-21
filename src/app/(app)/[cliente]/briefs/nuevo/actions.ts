"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { dispatchPendingEmails } from "@/lib/notif-email";
import { getCurrentUser } from "@/lib/identity";
import { canCreateBrief } from "@/lib/roles";
import { sendEmail, hasEmail } from "@/lib/email";
import { htmlFor, textFor } from "@/lib/email-template";
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
  /** Fail-safe: personas nombradas en la asignación que AÚN no están en la
   *  plataforma. Si viene con datos, no se creó nada — el builder pregunta si
   *  agregarlas antes de reintentar. */
  personasFaltantes?: string[];
  errors: string[];
};

/** Una persona a dar de alta desde el fail-safe del brief (con correo opcional). */
export type NuevaPersona = { nombre: string; email: string | null; enviarCorreo: boolean };

const APP_URL = process.env.APP_URL ?? "https://runna-greenlight.vercel.app";

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
  nuevos?: NuevaPersona[],
): Promise<CrearBriefResult> {
  const res: CrearBriefResult = {
    ok: false, created: 0, assets: 0, blocked: [], errors: [],
  };
  if (!hasSupabase()) {
    res.errors.push("La base de datos no está configurada.");
    return res;
  }

  // Server-side gate: una server action es un POST público — el gate de la página
  // no basta. Sólo lead/admin/master crean briefs (crearBrief además manda emails).
  const u = await getCurrentUser();
  if (!u || !canCreateBrief(u.role)) {
    res.errors.push("Sólo un lead o un admin puede crear un brief.");
    return res;
  }

  const { header, tasks } = input;
  const track = header.track;

  // Un lead es departamental: sólo crea briefs de SU equipo (Gap 2).
  if (u.role === "lead" && u.member && track !== u.member.track) {
    res.errors.push("Un lead sólo crea briefs de su propio equipo.");
    return res;
  }

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

  // ── Fail-safe: personas nombradas en la asignación que NO están en el pool ──
  // Pass 1 (sin `nuevos`): si hay nombres desconocidos, NO se crea nada — se
  // devuelven para que el builder pregunte "¿las agrego?". Pass 2 (con `nuevos`):
  // se dan de alta como Especialista (role 'creative') y se sigue.
  if (!nuevos) {
    // Dedup por fold() (insensible a acento/caso), la MISMA clave del pool — si no,
    // "Juan" y "juan" en dos tarjetas se contarían como dos personas nuevas.
    const faltantes = new Map<string, string>();
    for (const t of tasks) {
      for (const n of t.asignacion) {
        const nombre = n.trim();
        const key = fold(nombre);
        if (nombre && !memberIdPorNombre.has(key) && !faltantes.has(key)) faltantes.set(key, nombre);
      }
    }
    if (faltantes.size) {
      res.personasFaltantes = [...faltantes.values()];
      return res;
    }
  } else if (nuevos.length) {
    // Dedup incremental por fold(): dos variantes de caso del mismo nombre nuevo NO
    // deben insertar dos filas (unique(track,name) es sensible a caso y no las caza).
    const vistos = new Set<string>();
    const aCrear: { nombre: string; email: string | null; enviarCorreo: boolean }[] = [];
    for (const p of nuevos) {
      const nombre = p.nombre.trim();
      const key = fold(nombre);
      if (!nombre || memberIdPorNombre.has(key) || vistos.has(key)) continue;
      vistos.add(key);
      aCrear.push({ nombre, email: p.email?.trim() || null, enviarCorreo: p.enviarCorreo });
    }
    if (aCrear.length) {
      const { data: creados, error: mErr } = await db
        .from("track_members")
        .insert(aCrear.map((p) => ({ track, name: p.nombre, role: "creative", email: p.email })))
        .select("id, name");
      if (mErr) {
        res.errors.push(`No se pudieron agregar las personas: ${mErr.message}`);
        return res;
      }
      for (const c of (creados ?? []) as { id: string; name: string }[]) {
        memberIdPorNombre.set(fold(c.name), c.id);
      }
      const aEmail = aCrear.filter((p) => p.enviarCorreo && p.email);
      if (aEmail.length) after(() => enviarBienvenida(aEmail));
    }
  }

  const { data: marcaRows } = await db
    .from("marcas").select("id, name").eq("client_id", client.id);
  const marcaIdPorNombre = new Map<string, string>(
    (marcaRows ?? []).map((m) => [fold(m.name), m.id as string]),
  );

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
    created_by: u.userId,
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

/** Correo de bienvenida a las personas recién agregadas desde el brief. */
async function enviarBienvenida(personas: { nombre: string; email: string | null }[]): Promise<void> {
  if (!hasEmail()) return;
  const title = "Te agregaron a Greenlight";
  const body =
    "Ya eres parte del equipo en Greenlight. Entra con tu correo @runna.com.mx para ver y trabajar tus tareas.";
  const ctaUrl = `${APP_URL}/mi-trabajo`;
  await Promise.allSettled(
    personas
      .filter((p) => p.email)
      .map((p) =>
        sendEmail({
          to: p.email!,
          subject: "Greenlight · Te agregaron al equipo",
          text: textFor(title, body, ctaUrl),
          html: htmlFor({ type: "team_welcome", title, body, ctaUrl }),
        }),
      ),
  );
}
