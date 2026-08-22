import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Bitácora de adopción de H.Ü.E (tabla `hue_suggestions`). Registra qué sugirió
 * H.Ü.E (validador + ortografía) y qué decidió el humano (aplicar / ignorar).
 * Alimenta la "tasa de adopción" del HUB (Fase 1 Etapa 2).
 *
 * TODO es BEST-EFFORT y NO bloqueante: si el logging falla, la acción principal
 * (validar / aplicar / enviar) NUNCA se rompe. Los callers lo difieren con `after()`
 * para que la latencia de la respuesta no dependa de estos writes. Los errores se
 * REGISTRAN (console.error) — un fallo silencioso dejaría de capturar datos sin señal,
 * y el HUB se construiría sobre datos vacíos (reap 2026-08-21). Escribe vía service_role
 * (bypassa RLS): la captura la disparan lead/creative durante su trabajo, no el master.
 */

export type VeredictoLog = {
  correccionId: string;
  hecho: "si" | "no" | "parcial";
  sugerencia: string;
  targetTabla: string | null;
  targetFilaId: string | null;
  targetCampo: string | null;
};

/**
 * Registra los veredictos ofrecidos en una corrida del validador. Idempotente por
 * (idea_id, correccion_id): un re-run ACTUALIZA el veredicto sin duplicar. `decision`,
 * `decided_at` y `offered_at` se OMITEN del payload → el upsert no los toca en el
 * conflicto, así que una decisión ya tomada (applied/ignored) se preserva y `offered_at`
 * conserva el PRIMER ofrecimiento (no se reinicia en cada re-validate).
 */
export async function registrarVeredictos(
  ideaId: string,
  actorMemberId: string | null,
  filas: VeredictoLog[],
): Promise<void> {
  if (!filas.length) return;
  try {
    await supabaseAdmin()
      .from("hue_suggestions")
      .upsert(
        filas.map((f) => ({
          idea_id: ideaId,
          kind: "correction_verdict" as const,
          correccion_id: f.correccionId,
          target_tabla: f.targetTabla,
          target_fila_id: f.targetFilaId,
          target_campo: f.targetCampo,
          hecho: f.hecho,
          sugerencia: f.sugerencia || null,
          actor_member_id: actorMemberId,
        })),
        { onConflict: "idea_id,correccion_id" },
      );
  } catch (e) {
    console.error("[hue-log] registrarVeredictos falló", e);
  }
}

/** Sella `decision='applied'` sobre el veredicto de una corrección (applied gana). */
export async function marcarVeredictoAplicado(ideaId: string, correccionId: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("hue_suggestions")
      .update({ decision: "applied", decided_at: new Date().toISOString() })
      .eq("idea_id", ideaId)
      .eq("correccion_id", correccionId)
      .eq("kind", "correction_verdict");
  } catch (e) {
    console.error("[hue-log] marcarVeredictoAplicado falló", e);
  }
}

/**
 * Marca 'ignored' el veredicto de una corrección SÓLO si sigue sin decidir (no pisa
 * un 'applied'). Señal barata: el lead confirmó/cerró la corrección sin aplicar la
 * sugerencia de H.Ü.E.
 */
export async function ignorarVeredicto(ideaId: string, correccionId: string): Promise<void> {
  try {
    await supabaseAdmin()
      .from("hue_suggestions")
      .update({ decision: "ignored", decided_at: new Date().toISOString() })
      .eq("idea_id", ideaId)
      .eq("correccion_id", correccionId)
      .eq("kind", "correction_verdict")
      .is("decision", null);
  } catch (e) {
    console.error("[hue-log] ignorarVeredicto falló", e);
  }
}

export type OrtografiaLog = {
  tabla: string;
  filaId: string;
  campo: string;
  sugerencia: string;
  tipo: string;
};

/**
 * Registra las sugerencias de ortografía ofrecidas en un chequeo (append — cada
 * corrida es un lote propio; la ortografía no tiene un id estable como la corrección).
 */
export async function registrarOrtografia(
  ideaId: string,
  actorMemberId: string | null,
  filas: OrtografiaLog[],
): Promise<void> {
  if (!filas.length) return;
  try {
    await supabaseAdmin()
      .from("hue_suggestions")
      .insert(
        filas.map((f) => ({
          idea_id: ideaId,
          kind: "ortografia" as const,
          target_tabla: f.tabla,
          target_fila_id: f.filaId,
          target_campo: f.campo,
          tipo: f.tipo,
          sugerencia: f.sugerencia || null,
          actor_member_id: actorMemberId,
        })),
      );
  } catch (e) {
    console.error("[hue-log] registrarOrtografia falló", e);
  }
}

/**
 * Sella 'applied' sobre la sugerencia de ortografía que coincide (la más reciente sin
 * decidir). Se identifica por (target_fila_id, target_campo, sugerencia): la fila es un
 * uuid único de planos/estaticos, así que no hace falta el idea_id.
 */
export async function marcarOrtografiaAplicada(
  filaId: string,
  campo: string,
  sugerencia: string,
): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { data } = await db
      .from("hue_suggestions")
      .select("id")
      .eq("kind", "ortografia")
      .eq("target_fila_id", filaId)
      .eq("target_campo", campo)
      .eq("sugerencia", sugerencia)
      .is("decision", null)
      .order("offered_at", { ascending: false })
      .limit(1);
    const id = (data as { id: string }[] | null)?.[0]?.id;
    if (id) {
      await db
        .from("hue_suggestions")
        .update({ decision: "applied", decided_at: new Date().toISOString() })
        .eq("id", id);
    }
  } catch (e) {
    console.error("[hue-log] marcarOrtografiaAplicada falló", e);
  }
}

/** Marca 'ignored' las sugerencias de ortografía que quedaron sin aplicar al cerrar el
 *  diálogo / mandar de todos modos. Sólo las que siguen sin decidir. */
export async function ignorarOrtografia(
  filas: { filaId: string; campo: string; sugerencia: string }[],
): Promise<void> {
  if (!filas.length) return;
  try {
    const db = supabaseAdmin();
    for (const f of filas) {
      await db
        .from("hue_suggestions")
        .update({ decision: "ignored", decided_at: new Date().toISOString() })
        .eq("kind", "ortografia")
        .eq("target_fila_id", f.filaId)
        .eq("target_campo", f.campo)
        .eq("sugerencia", f.sugerencia)
        .is("decision", null);
    }
  } catch (e) {
    console.error("[hue-log] ignorarOrtografia falló", e);
  }
}
