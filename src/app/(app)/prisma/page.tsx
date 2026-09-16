import "./prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canVerTodoPrisma } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo } from "@/lib/prisma/flags";
import { cargarHistorial, cargarMarcas, cargarReglas } from "@/lib/prisma/data";
import type { ReglaCliente } from "@/lib/prisma/diagnostico";
import type { Pregunta } from "@/lib/prisma/entrevista";
import { PrismaStudio, type MarcaUI } from "@/components/prisma/studio";
import { CatalogoProvider } from "@/components/prisma/catalogo-contexto";
import { CATALOGO_BASE, type Catalogo } from "@/lib/prisma/catalogo";
import type { ItemHistorialUI } from "@/components/prisma/historial";
import { specVacio, type JobType, type Tool } from "@/lib/prisma/spec";
import { compilar } from "@/lib/prisma/compilers";
import type { PromptVivo } from "@/components/prisma/resultado";
import type { ResultadoVivo } from "@/lib/prisma/resultado";
import type { PrismaVariante } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma — estudio de prompts. Una idea → un prompt para cada herramienta.
 * Server component: gate por rol + flag, carga marcas/historial y monta
 * el estudio (client). El historial llega como props y se re-lee con router.refresh().
 */
/** Un resultado de muestra, SÓLO en desarrollo (`?demo=resultado`): prompt real del
 *  compiler de Kling sobre un spec fijo. Nunca se construye en producción. Con
 *  `?demo=veredicto` trae además un resultado subido de mentira (F4) para ver el veredicto. */
function demoResultado(conVeredicto = false): PromptVivo | null {
  if (process.env.NODE_ENV !== "development") return null;
  const spec = specVacio("animar_foto", "kling", "que la modelo respire y sonría");
  Object.assign(spec, {
    sujeto: "the woman in the black coat from the reference",
    accion: "breathes softly, then turns to the camera and smiles",
    entorno: "as in the reference",
    camara: { angulo: "eye level", movimiento: "slow dolly in", lente: "85mm, shallow depth of field" },
    luz: "warm lantern light from the right, soft shadows",
    mood: "nostalgic, warm, intimate",
    estilo: "cinematic video",
    aspect: "9:16",
    duracion: 5,
    refs: [{ role: "sujeto", caption: "a woman in a black coat in a night market", dna: null }],
  });
  const salida = compilar(spec);
  const resultado: ResultadoVivo | null = conVeredicto
    ? {
        id: "demo",
        promptId: "demo",
        url: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#1b211e"/><circle cx="48" cy="48" r="26" fill="#f2c57c"/></svg>'),
        modelo: "kling-3.0-turbo",
        veredicto: {
          caption: "a woman in a black coat, still, in a night market",
          cumple: [
            { campo: "sujeto", ok: true, nota: { es: "La modelo del abrigo negro en el mercado, como se pidió.", en: "The model in the black coat at the market, as asked." } },
            { campo: "luz", ok: false, nota: { es: "La luz es fría y azul; se pidió luz cálida de farol.", en: "The light is cold and blue; warm lantern light was asked for." } },
            { campo: "encuadre", ok: true, nota: { es: "Vertical 9:16, a la altura de los ojos.", en: "Vertical 9:16, eye level." } },
          ],
          refine: { es: "Que la luz sea cálida, de farol, no azul", en: "Make the light warm, from lanterns, not blue" },
          correccion: null,
        },
        score: 67,
        aceptado: false,
        corregible: false,
      }
    : null;
  return { specId: "demo", promptId: "demo", tool: "kling", spec, salida, valido: true, errores: [], porque: { es: "Para un clip vertical corto y sin voz, Kling le da buen movimiento a la foto.", en: "For a short vertical clip with no voice, Kling animates the photo with good motion." }, resultado };
}

/** La entrevista de muestra, SÓLO en desarrollo (`?demo=entrevista`): tres preguntas fijas
 *  para ver la pantalla sin sesión (la real necesita login y una llamada a H.Ü.E). */
function demoEntrevista(): Pregunta[] | null {
  if (process.env.NODE_ENV !== "development") return null;
  return [
    { id: "angulo", pregunta: { es: "¿Desde qué ángulo ves la tarjeta?", en: "From which angle do you see the card?" }, opciones: [{ valor: "top-down flat lay", label: { es: "Cenital", en: "Top-down" } }, { valor: "45-degree angle", label: { es: "En ángulo", en: "Angled" } }, { valor: "eye-level close-up", label: { es: "A nivel de ojos", en: "Eye level" } }], campo: "angulo" },
    { id: "fondo", pregunta: { es: "¿Qué superficie de fondo?", en: "Which background surface?" }, opciones: [{ valor: "white marble counter", label: { es: "Mármol blanco", en: "White marble" } }, { valor: "light wood table", label: { es: "Madera clara", en: "Light wood" } }], campo: null },
    { id: "luz", pregunta: { es: "¿Qué luz quieres?", en: "Which light?" }, opciones: [{ valor: "soft morning window light", label: { es: "Ventana suave", en: "Soft window" } }, { valor: "bright studio light", label: { es: "Estudio", en: "Studio" } }], campo: "luz" },
  ];
}

/** Sólo dev (`?demo=entrevista`): las preguntas de "Profundizar" (rondas 2 y 3), fijas. */
function demoProfundas(): Pregunta[] | null {
  if (process.env.NODE_ENV !== "development") return null;
  return [
    { id: "mood", pregunta: { es: "¿Qué debe sentir quien la vea?", en: "What should the viewer feel?" }, opciones: [{ valor: "calm and premium", label: { es: "Calma, lujo", en: "Calm, premium" } }, { valor: "bold and energetic", label: { es: "Energía", en: "Energy" } }], campo: "mood" },
    { id: "detalle", pregunta: { es: "¿Qué detalle de la tarjeta hay que lucir?", en: "Which card detail should shine?" }, opciones: [{ valor: "the embossed logo", label: { es: "El logo en relieve", en: "Embossed logo" } }, { valor: "the metallic edge", label: { es: "El canto metálico", en: "Metallic edge" } }], campo: null },
    { id: "hora", pregunta: { es: "¿A qué hora del día?", en: "What time of day?" }, opciones: [{ valor: "golden hour", label: { es: "Atardecer", en: "Golden hour" } }, { valor: "bright midday", label: { es: "Mediodía", en: "Midday" } }], campo: null },
    { id: "composicion", pregunta: { es: "¿Dónde va la tarjeta en la foto?", en: "Where is the card in the frame?" }, opciones: [{ valor: "centered", label: { es: "Al centro", en: "Centered" } }, { valor: "off to one side, rule of thirds", label: { es: "A un lado", en: "Off to one side" } }], campo: null },
    { id: "color", pregunta: { es: "¿Algún color que deba dominar?", en: "Any dominant color?" }, opciones: [{ valor: "the brand color", label: { es: "El de la marca", en: "Brand color" } }, { valor: "neutral whites", label: { es: "Blancos neutros", en: "Neutral whites" } }], campo: null },
  ];
}

export default async function PrismaPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [role, soy, sp] = await Promise.all([getViewAs(), getSoy(), searchParams]);
  const demo = sp.demo === "resultado" || sp.demo === "veredicto" ? demoResultado(sp.demo === "veredicto") : null;
  const demoPreguntas = sp.demo === "entrevista" ? demoEntrevista() : null;
  const profundasDemo = sp.demo === "entrevista" ? demoProfundas() : null;

  if (!prismaActivo() || !canSee(role, "prisma")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          {prismaActivo() ? `Un ${ROLE_LABEL[role]} no tiene acceso a HÜE Prisma.` : "HÜE Prisma todavía no está activo."}
        </p>
      </div>
    );
  }

  // Sólo dev (`?demo=herramientas`): la pestaña Hub › Prisma › Herramientas con los valores del
  // código, sin sesión master y sin guardar — para ver la pantalla en local.
  if (sp.demo === "herramientas" && process.env.NODE_ENV === "development") {
    // Import dinámico: el editor del Hub no viaja en el bundle de /prisma de nadie.
    const { PrismaHerramientas } = await import("@/components/admin/hue-hub/prisma-herramientas");
    return (
      <div className="mx-auto max-w-4xl">
        <PrismaHerramientas demo={CATALOGO_BASE} />
      </div>
    );
  }

  // Sólo dev (`?demo=vigia`): la pestaña Hub › Prisma › Vigía con datos de muestra, sin servidor.
  if (sp.demo === "vigia" && process.env.NODE_ENV === "development") {
    const { PrismaVigia } = await import("@/components/admin/hue-hub/prisma-vigia");
    const ahora = new Date().toISOString();
    return (
      <div className="mx-auto max-w-4xl">
        <PrismaVigia
          demo={{
            enEspera: 1,
            fuentes: [
              { id: "f1", url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling", nombre: "Higgsfield — Kling", tool: "kling", origen: "oficial", activa: true, ultima_lectura: ahora, ultimo_error: null, updated_at: ahora, created_at: ahora, leida: true },
              { id: "f2", url: "https://ai.google.dev/gemini-api/docs/veo", nombre: "Google — Veo (Gemini API)", tool: "veo", origen: "oficial", activa: true, ultima_lectura: ahora, ultimo_error: "respondió 503", updated_at: ahora, created_at: ahora, leida: true },
              { id: "f3", url: "https://higgsfield.ai/blog/seedance-2-5-prompting-guide", nombre: "Higgsfield — guía de prompts de Seedance 2.5", tool: "seedance", origen: "oficial", activa: false, ultima_lectura: null, ultimo_error: null, updated_at: ahora, created_at: ahora, leida: false },
            ],
            pendientes: [
              { id: "p1", tipo: "limite", tool: "kling", origen: "oficial", fuentes: ["f1"], resumen_es: "Kling 3.0 ahora genera hasta 20 s en Higgsfield.", contenido: { campo: "duraciones", valor: [5, 10, 15, 20] }, cita: "Kling 3.0 now supports clips of up to 20 seconds", cita_url: "https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-use-kling", cita_fecha: ahora.slice(0, 10), estado: "pendiente", motivo: null, decidido_at: null, created_at: ahora },
              { id: "p2", tipo: "nota", tool: "veo", origen: "oficial", fuentes: ["f2"], resumen_es: "Veo 3.1 lee mejor el diálogo cuando va entre comillas.", contenido: { nota_en: "Veo 3.1 follows dialogue more reliably when the line is quoted." }, cita: "Put spoken lines in quotation marks for more reliable dialogue", cita_url: "https://ai.google.dev/gemini-api/docs/veo", cita_fecha: ahora.slice(0, 10), estado: "pendiente", motivo: null, decidido_at: null, created_at: ahora },
            ],
            decididas: [
              { id: "p3", tipo: "codigo", tool: null, origen: "oficial", fuentes: ["f1"], resumen_es: "Higgsfield agregó un modelo de audio nuevo.", contenido: { detalle_es: "Nueva familia de audio." }, cita: "…", cita_url: "https://higgsfield.ai/", cita_fecha: ahora.slice(0, 10), estado: "descartada", motivo: "No usamos audio suelto.", decidido_at: ahora, created_at: ahora },
            ],
          }}
        />
      </div>
    );
  }

  let marcas: MarcaUI[] = [];
  let historial: ItemHistorialUI[] = [];
  let reglas: ReglaCliente[] = [];
  let catalogo: Catalogo = CATALOGO_BASE;
  if (hasSupabase()) {
    const db = supabaseAdmin();
    // lead/admin/master ven el historial de todos; el especialista, el suyo. Misma
    // regla que puedeTocar en actions.ts (una sola fuente: lib/roles).
    const todos = canVerTodoPrisma(role);
    // Los personajes NO se cargan aquí: se piden al elegir la marca (listarPersonajes), para no
    // mandarle a todo el mundo las fotos firmadas de todos los clientes en cada carga.
    const [m, h, r] = await Promise.all([cargarMarcas(db), cargarHistorial(db, soy?.id ?? null, todos), cargarReglas(db)]);
    // Sólo lo que el diagnóstico necesita (sin ids, fechas ni notas): el cliente las compila.
    reglas = r.filas.filter((f) => f.clase === "regla").map((f) => ({ codigo: f.codigo, tool: f.tool, kind: f.kind, nivel: f.nivel, campo: f.campo, patron: f.patron, umbral: f.umbral, que_es: f.que_es, que_en: f.que_en, porque_es: f.porque_es, porque_en: f.porque_en, arreglo_es: f.arreglo_es, arreglo_en: f.arreglo_en, accion: f.accion, fuente_url: f.fuente_url, fuente_fecha: f.fuente_fecha, fuente_tipo: f.fuente_tipo }));
    // F6a: límites, fortalezas y modelos vigentes (Hub › Herramientas) — el wizard, el routing y
    // "Úsalo en…" del cliente usan los mismos que el servidor.
    catalogo = r.catalogo;
    marcas = m.map((x) => ({ id: x.id, name: x.name, client_id: x.client_id, client_name: x.client_name, preset: x.preset }));
    historial = h.map((it) => ({
      specId: it.spec.id,
      job: it.spec.job as JobType,
      tool: (it.prompt?.tool ?? it.spec.tool) as Tool,
      idea: it.spec.idea,
      thumb: it.thumb,
      fecha: it.spec.created_at,
      valido: it.prompt?.valido ?? null,
      variante: (it.prompt?.variante ?? "base") as PrismaVariante,
      correccion: !!it.spec.correccion_de,
    }));
  }

  return (
    <CatalogoProvider value={catalogo}>
      <PrismaStudio marcas={marcas} historial={historial} demo={demo} demoPreguntas={demoPreguntas} demoProfundas={profundasDemo} verTodo={canVerTodoPrisma(role)} reglas={reglas} />
    </CatalogoProvider>
  );
}
