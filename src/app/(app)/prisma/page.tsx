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
    { id: "angulo", pregunta: { es: "¿Desde qué ángulo ves la tarjeta?", en: "From which angle do you see the card?" }, opciones: [{ valor: "top-down flat lay", label: { es: "Cenital", en: "Top-down" } }, { valor: "45-degree angle", label: { es: "En ángulo", en: "Angled" } }, { valor: "eye-level close-up", label: { es: "A nivel de ojos", en: "Eye level" } }], campo: "lente" },
    { id: "fondo", pregunta: { es: "¿Qué superficie de fondo?", en: "Which background surface?" }, opciones: [{ valor: "white marble counter", label: { es: "Mármol blanco", en: "White marble" } }, { valor: "light wood table", label: { es: "Madera clara", en: "Light wood" } }], campo: null },
    { id: "luz", pregunta: { es: "¿Qué luz quieres?", en: "Which light?" }, opciones: [{ valor: "soft morning window light", label: { es: "Ventana suave", en: "Soft window" } }, { valor: "bright studio light", label: { es: "Estudio", en: "Studio" } }], campo: "luz" },
  ];
}

export default async function PrismaPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [role, soy, sp] = await Promise.all([getViewAs(), getSoy(), searchParams]);
  const demo = sp.demo === "resultado" || sp.demo === "veredicto" ? demoResultado(sp.demo === "veredicto") : null;
  const demoPreguntas = sp.demo === "entrevista" ? demoEntrevista() : null;

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

  let marcas: MarcaUI[] = [];
  let historial: ItemHistorialUI[] = [];
  let reglas: ReglaCliente[] = [];
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

  return <PrismaStudio marcas={marcas} historial={historial} demo={demo} demoPreguntas={demoPreguntas} verTodo={canVerTodoPrisma(role)} reglas={reglas} />;
}
