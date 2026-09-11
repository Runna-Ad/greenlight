import "./prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canVerTodoPrisma } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo } from "@/lib/prisma/flags";
import { cargarHistorial, cargarMarcas, cargarReglas } from "@/lib/prisma/data";
import type { ReglaCliente } from "@/lib/prisma/diagnostico";
import { PrismaStudio, type MarcaUI } from "@/components/prisma/studio";
import type { ItemHistorialUI } from "@/components/prisma/historial";
import { specVacio, type JobType, type Tool } from "@/lib/prisma/spec";
import { compilar } from "@/lib/prisma/compilers";
import type { PromptVivo } from "@/components/prisma/resultado";
import type { PrismaVariante } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma — estudio de prompts. Una idea → un prompt para cada herramienta.
 * Server component: gate por rol + flag, carga marcas/historial y monta
 * el estudio (client). El historial llega como props y se re-lee con router.refresh().
 */
/** Un resultado de muestra, SÓLO en desarrollo (`?demo=resultado`): prompt real del
 *  compiler de Kling sobre un spec fijo. Nunca se construye en producción. */
function demoResultado(): PromptVivo | null {
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
  return { specId: "demo", promptId: "demo", tool: "kling", spec, salida, valido: true, errores: [], porque: { es: "Para un clip vertical corto y sin voz, Kling le da buen movimiento a la foto.", en: "For a short vertical clip with no voice, Kling animates the photo with good motion." } };
}

export default async function PrismaPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [role, soy, sp] = await Promise.all([getViewAs(), getSoy(), searchParams]);
  const demo = sp.demo === "resultado" ? demoResultado() : null;

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
    }));
  }

  return <PrismaStudio marcas={marcas} historial={historial} demo={demo} verTodo={canVerTodoPrisma(role)} reglas={reglas} />;
}
