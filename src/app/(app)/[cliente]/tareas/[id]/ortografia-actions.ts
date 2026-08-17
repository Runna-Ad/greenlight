"use server";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canMoveStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { fixSeguro } from "@/lib/ortografia";
import { guardarCampo, type Tabla, type GuardarResultado } from "./actions";

/** Un error de ortografía/gramática que H.Ü.E encontró, con su fix propuesto. */
export type ErrorOrtografia = {
  id: string;
  tabla: Tabla;
  filaId: string;
  campo: string;
  campoLabel: string;
  original: string;
  sugerencia: string;
  tipo: string;
};

// Campos que SÍ se revisan (con su etiqueta visible). Se EXCLUYEN los legales
// (legales_extra, cortinilla) — el texto legal es exacto, no lo toca un corrector.
const LABEL_PLANO: Record<string, string> = {
  titulo: "Plano",
  accion: "Acción",
  copy_in: "Copy in",
  sfx: "SFX",
  gfx: "GFX",
  edicion: "Edición",
  dialogo: "Diálogos",
};
const LABEL_ESTATICO: Record<string, string> = {
  copy_titulo: "Título",
  copy_subtitulo: "Subtítulo",
  copy_cta: "Botón CTA",
  referencia_nota: "Nota de diseño",
};

const TIPOS = new Set(["ortografía", "acento", "concordancia", "puntuación"]);
const MAX_ERRORES = 50;

type Campo = { campoId: string; tabla: Tabla; filaId: string; campo: string; label: string; texto: string };

/** Arma la lista de campos a revisar desde planos/estático (de la BD o del cliente). */
function reunirCampos(
  planos: Record<string, unknown>[],
  estatico: Record<string, unknown> | null,
): Campo[] {
  const campos: Campo[] = [];
  if (planos.length > 0) {
    for (const p of planos) {
      const filaId = typeof p.id === "string" ? p.id : "";
      if (!filaId) continue;
      const orden = typeof p.orden === "number" ? p.orden : 0;
      for (const campo of Object.keys(LABEL_PLANO)) {
        const texto = typeof p[campo] === "string" ? (p[campo] as string).trim() : "";
        if (!texto) continue;
        campos.push({ campoId: `${filaId}:${campo}`, tabla: "planos", filaId, campo, label: `Plano ${orden} · ${LABEL_PLANO[campo]}`, texto });
      }
    }
  } else if (estatico) {
    const filaId = typeof estatico.id === "string" ? estatico.id : "";
    if (filaId) {
      for (const campo of Object.keys(LABEL_ESTATICO)) {
        const texto = typeof estatico[campo] === "string" ? (estatico[campo] as string).trim() : "";
        if (!texto) continue;
        campos.push({ campoId: `${filaId}:${campo}`, tabla: "estaticos", filaId, campo, label: LABEL_ESTATICO[campo], texto });
      }
    }
  }
  return campos;
}

/**
 * Revisa ortografía + gramática (es-MX) de los campos de la tarea con H.Ü.E y
 * devuelve una lista de errores con su fix propuesto. NO escribe nada — el
 * especialista decide cuáles aplicar (y siempre puede mandar a revisión igual).
 *
 * Guardarraíl: cada fix se acepta SÓLO si (a) el `original` sigue presente en el
 * campo y (b) `fixSeguro` (números y legales * % $ intactos, es un arreglo no una
 * reescritura). Lo que no cumple, se descarta en silencio — nunca se muestra un
 * "fix" que podría cambiar un precio o un legal.
 */
export async function revisarOrtografia(
  ideaId: string,
  // El editor pasa su BORRADOR vivo (lo que hay en pantalla) para revisar el texto
  // ACTUAL, incl. lo recién tecleado que aún no se autoguardó (evita la carrera con
  // el autosave). Si no viene, cae a leer la BD.
  datos?: { planos?: unknown[]; estatico?: unknown } | null,
): Promise<{ ok: true; errores: ErrorOrtografia[] } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  }
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };

  let campos: Campo[];
  if (datos && ((Array.isArray(datos.planos) && datos.planos.length > 0) || datos.estatico)) {
    campos = reunirCampos(
      (Array.isArray(datos.planos) ? datos.planos : []) as Record<string, unknown>[],
      (datos.estatico ?? null) as Record<string, unknown> | null,
    );
  } else {
    const db = supabaseAdmin();
    const { data: planos } = await db
      .from("planos")
      .select("id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo")
      .eq("idea_id", ideaId)
      .order("orden");
    const planosArr = (planos ?? []) as Record<string, unknown>[];
    let estatico: Record<string, unknown> | null = null;
    if (planosArr.length === 0) {
      const { data: est } = await db
        .from("estaticos")
        .select("id, copy_titulo, copy_subtitulo, copy_cta, referencia_nota")
        .eq("idea_id", ideaId)
        .order("orden")
        .maybeSingle();
      estatico = (est ?? null) as Record<string, unknown> | null;
    }
    campos = reunirCampos(planosArr, estatico);
  }

  if (campos.length === 0) return { ok: true, errores: [] };

  const porId = new Map(campos.map((c) => [c.campoId, c]));

  const schema = {
    type: "object" as const,
    properties: {
      errores: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            campo_id: { type: "string" as const },
            original: { type: "string" as const },
            sugerencia: { type: "string" as const },
            tipo: { type: "string" as const, enum: ["ortografía", "acento", "concordancia", "puntuación"] },
          },
          required: ["campo_id", "original", "sugerencia", "tipo"],
          additionalProperties: false,
        },
      },
    },
    required: ["errores"],
    additionalProperties: false,
  };

  const bloques = campos
    .map((c) => `[id=${c.campoId}] ${c.label}:\n${c.texto}`)
    .join("\n\n");

  const prompt =
    "Eres un corrector de ortografía y gramática en ESPAÑOL DE MÉXICO (es-MX) para " +
    "copy publicitario. Te doy los campos de una tarea. Encuentra SÓLO errores CLAROS y " +
    "objetivos de: ortografía (palabras mal escritas), acentuación (tildes faltantes o " +
    "sobrantes), concordancia (género/número/conjugación) y puntuación evidente. " +
    "Repórtalos con la herramienta emitir_errores.\n\n" +
    "REGLAS ABSOLUTAS:\n" +
    "- NO cambies el estilo, el tono ni reescribas frases; sólo corrige errores objetivos.\n" +
    "- NO marques como error el uso informal (tú), la jerga, ni las mayúsculas/nombres de " +
    "marca (DiDi, DiDi Card, CASHBACK), ni los anglicismos deliberados.\n" +
    "- NO cambies NINGÚN número, porcentaje, precio, fecha ni signo de legal/oferta (* % $).\n" +
    "- 'original' debe ser el fragmento EXACTO y MÍNIMO que contiene el error (una palabra o " +
    "una frase corta), copiado TAL CUAL del campo (mismos acentos/mayúsculas que el texto). " +
    "'sugerencia' es ese MISMO fragmento ya corregido.\n" +
    "- 'campo_id' es el id entre corchetes del campo donde está el error.\n" +
    "- Si un campo no tiene errores, no lo incluyas. Si no hay ninguno, devuelve la lista vacía.\n\n" +
    "Campos:\n" + bloques;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      thinking: { type: "disabled" },
      tools: [{
        name: "emitir_errores",
        description: "Emite la lista de errores de ortografía/gramática encontrados.",
        input_schema: schema,
      }],
      tool_choice: { type: "tool", name: "emitir_errores" },
      messages: [{ role: "user", content: prompt }],
    });

    const bloque = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    // La IA a veces llena `errores` como ARRAY (lo normal) y a veces como STRING
    // JSON (observado en vivo, intermitente). Normalizamos ambos → si no queda un
    // array, no hay errores que mostrar (falla segura, nunca revienta el envío).
    let crudos: unknown = (bloque?.input as { errores?: unknown } | undefined)?.errores;
    if (typeof crudos === "string") {
      try {
        const p: unknown = JSON.parse(crudos);
        crudos = Array.isArray(p) ? p : (p as { errores?: unknown } | null)?.errores;
      } catch {
        crudos = undefined;
      }
    }
    if (!Array.isArray(crudos)) return { ok: true, errores: [] };

    const errores: ErrorOrtografia[] = [];
    for (const raw of crudos) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const campoId = typeof o.campo_id === "string" ? o.campo_id : "";
      const original = typeof o.original === "string" ? o.original : "";
      const sugerencia = typeof o.sugerencia === "string" ? o.sugerencia : "";
      const tipo = typeof o.tipo === "string" && TIPOS.has(o.tipo) ? o.tipo : "ortografía";
      const c = porId.get(campoId);
      // El fix se acepta SÓLO si el original sigue en el campo y no toca datos duros.
      if (!c || !c.texto.includes(original) || !fixSeguro(original, sugerencia)) continue;
      errores.push({
        id: String(errores.length),
        tabla: c.tabla,
        filaId: c.filaId,
        campo: c.campo,
        campoLabel: c.label,
        original,
        sugerencia,
        tipo,
      });
      if (errores.length >= MAX_ERRORES) break;
    }

    return { ok: true, errores };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al llamar a H.Ü.E." };
  }
}

/**
 * Aplica un fix de ortografía: reemplaza la PRIMERA aparición de `original` por
 * `sugerencia` en el campo, y guarda por el camino normal (compare-and-set +
 * permisos + revalidate). Best-effort: si el texto ya cambió y `original` no está,
 * no se aplica (se lo decimos al usuario). Re-valida `fixSeguro` en el servidor.
 */
export async function aplicarOrtografia(
  tabla: Tabla,
  filaId: string,
  campo: string,
  original: string,
  sugerencia: string,
): Promise<GuardarResultado> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  // Auth + whitelist ANTES de la lectura directa (el write ya lo re-valida
  // guardarCampo, pero la lectura usa `tabla`/`campo` del cliente — no dejamos
  // que un `tabla` arbitrario se lea, ni un rol sin permiso).
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  if (tabla !== "planos" && tabla !== "estaticos") {
    return { ok: false, error: "Tabla no permitida." };
  }
  if (!fixSeguro(original, sugerencia)) {
    return { ok: false, error: "Ese cambio no es seguro de aplicar automáticamente." };
  }

  const db = supabaseAdmin();
  const { data: fila } = await db.from(tabla).select(campo).eq("id", filaId).maybeSingle();
  const actual = (fila as Record<string, string | null> | null)?.[campo] ?? null;
  if (actual === null || !actual.includes(original)) {
    return { ok: false, error: "El texto cambió; ese fragmento ya no está. Revisa el campo." };
  }

  // Función replacer para que un `$` en la sugerencia (p. ej. "$60,000 pesos") no
  // se interprete como patrón de reemplazo — se inserta literal.
  const nuevo = actual.replace(original, () => sugerencia);
  return guardarCampo(tabla, filaId, campo, actual, nuevo);
}
