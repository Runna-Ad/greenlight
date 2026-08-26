"use server";

import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { canMoveStatus } from "@/lib/roles";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import { fixSeguro } from "@/lib/ortografia";
import { sinNegrita } from "@/lib/negrita";
import { registrarOrtografia, marcarOrtografiaAplicada, ignorarOrtografia } from "@/lib/hue-log";
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

/**
 * Un AVISO (no un fix auto-aplicable): matemática o legal. A diferencia de un error
 * de ortografía, NO trae un {original→sugerencia} que se pueda aplicar de un clic
 * —cambiar un número/legal jamás es automático—: describe el problema para que el
 * humano lo verifique y corrija a mano.
 */
export type FlagRevision = {
  id: string;
  campoLabel: string;
  problema: string;
  tipo: "matemática" | "legal";
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
): Promise<{ ok: true; errores: ErrorOrtografia[]; flags: FlagRevision[] } | { ok: false; error: string }> {
  if (!hasSupabase()) return { ok: false, error: "La base de datos no está configurada." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "H.Ü.E no está configurado (falta la clave)." };
  }
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false, error: "Este rol no edita la plantilla." };
  // Scope: sin esto se leía el texto de planos/estáticos de una tarea de otro
  // track/cliente por ideaId (cuando `datos` no viene). (reap 2026-08-26)
  const scope = await assertCanActOnTask(ideaId);
  if (!scope.ok) return { ok: false, error: scope.error };

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

  if (campos.length === 0) return { ok: true, errores: [], flags: [] };

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
      // AVISOS (no auto-aplicables): matemática y legal.
      flags: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            campo_id: { type: "string" as const },
            problema: { type: "string" as const },
            tipo: { type: "string" as const, enum: ["matemática", "legal"] },
          },
          required: ["campo_id", "problema", "tipo"],
          additionalProperties: false,
        },
      },
    },
    required: ["errores", "flags"],
    additionalProperties: false,
  };

  // Se quitan los marcadores de negrita `**` ANTES de mandarlos: la IA revisa el
  // copy limpio (los `**` no son errores) y el guard `fixSeguro` —que cuenta `*`—
  // no se descuadra. El `original` volverá sin `**`; el guard `includes` sobre el
  // texto crudo lo reencuentra (la negrita envuelve la frase, no la parte por dentro).
  const bloques = campos
    .map((c) => `[id=${c.campoId}] ${c.label}:\n${sinNegrita(c.texto)}`)
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
    "ADEMÁS, en 'flags' emite AVISOS (no correcciones automáticas — son para que un humano " +
    "verifique y corrija a mano). Dos tipos:\n" +
    "- 'matemática': una cifra o cuenta que NO cuadra. Ej.: en una simulación de crédito, el pago " +
    "quincenal × el nº de quincenas no corresponde al monto + intereses; un total mal sumado; un " +
    "porcentaje o rango inconsistente; una cifra que se contradice con otra del guión. En 'problema' " +
    "DESCRIBE la inconsistencia concreta (qué cifras y por qué no cuadran). NO propongas el número " +
    "correcto (no lo sabes con certeza) — sólo señálalo para revisión humana. Si las cuentas cuadran, no marques nada.\n" +
    "- 'legal': falta o está mal un marcador legal REQUERIDO. Reglas ESTRICTAS:\n" +
    "  · Todo VALOR MONETARIO en pesos (p. ej. '$48,000', '$4,836') DEBE terminar con 'M.N.' o 'm.n.' " +
    "(moneda nacional). Si un monto en pesos NO lleva 'M.N.'/'m.n.', márcalo — es obligatorio y muy específico.\n" +
    "  · 'CASHBACK' sin el asterisco '*'; 'MSI'/'meses sin intereses' sin '*'.\n" +
    "  · una simulación de crédito SIN su nota al pie ('*Ejemplo de un crédito … interés ordinario anual del …%').\n" +
    "  · una cifra MÁXIMA (línea de crédito, cashback, quincenas, minutos) sin la palabra 'hasta'.\n" +
    "  En 'problema' di QUÉ falta y dónde (cita el fragmento). " +
    "(NO escribas el texto legal completo; sólo señala la falta.)\n" +
    "- 'campo_id' del flag = el id entre corchetes del campo. Si no hay avisos, devuelve 'flags' vacío.\n\n" +
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
    const erroresCrudos = Array.isArray(crudos) ? crudos : [];

    const errores: ErrorOrtografia[] = [];
    for (const raw of erroresCrudos) {
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

    // Avisos (matemática/legal): NO pasan por fixSeguro (no se auto-aplican); sólo se
    // validan la forma (campo conocido, problema no vacío, tipo válido).
    let flagsCrudos: unknown = (bloque?.input as { flags?: unknown } | undefined)?.flags;
    if (typeof flagsCrudos === "string") {
      try {
        const p: unknown = JSON.parse(flagsCrudos);
        flagsCrudos = Array.isArray(p) ? p : (p as { flags?: unknown } | null)?.flags;
      } catch { flagsCrudos = undefined; }
    }
    const flags: FlagRevision[] = [];
    for (const raw of Array.isArray(flagsCrudos) ? flagsCrudos : []) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const c = porId.get(typeof o.campo_id === "string" ? o.campo_id : "");
      const problema = typeof o.problema === "string" ? o.problema.trim() : "";
      const tipo = o.tipo === "matemática" || o.tipo === "legal" ? o.tipo : null;
      if (!c || !problema || !tipo) continue;
      flags.push({ id: `f${flags.length}`, campoLabel: c.label, problema, tipo });
      if (flags.length >= MAX_ERRORES) break;
    }

    // Bitácora de adopción (best-effort): registra las sugerencias ofrecidas. Diferida
    // con after() para no acoplar la latencia de la respuesta al write.
    const soyId = await getSoyId();
    const filasLog = errores.map((e) => ({ tabla: e.tabla, filaId: e.filaId, campo: e.campo, sugerencia: e.sugerencia, tipo: e.tipo }));
    after(() => registrarOrtografia(ideaId, soyId, filasLog));

    return { ok: true, errores, flags };
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
  const r = await guardarCampo(tabla, filaId, campo, actual, nuevo);
  // Bitácora de adopción: sella la sugerencia de ortografía como aplicada (best-effort, diferido).
  if (r.ok) after(() => marcarOrtografiaAplicada(filaId, campo, sugerencia));
  return r;
}

/**
 * Marca como IGNORADAS las sugerencias de ortografía que quedaron sin aplicar al
 * cerrar el diálogo o mandar de todos modos. Señal de adopción; best-effort.
 */
export async function marcarOrtografiaIgnorada(
  filas: { filaId: string; campo: string; sugerencia: string }[],
): Promise<{ ok: boolean }> {
  if (!hasSupabase()) return { ok: false };
  const role = await getViewAs();
  if (!canMoveStatus(role)) return { ok: false };
  await ignorarOrtografia(filas);
  return { ok: true };
}
