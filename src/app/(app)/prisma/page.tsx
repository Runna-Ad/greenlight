import "./prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canVerTodoPrisma } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo } from "@/lib/prisma/flags";
import { cargarHistorial, cargarMarcas, cargarPersonajes } from "@/lib/prisma/data";
import { PrismaStudio, type MarcaUI, type PersonajeUI } from "@/components/prisma/studio";
import type { ItemHistorialUI } from "@/components/prisma/historial";
import { specVacio, type JobType, type Tool } from "@/lib/prisma/spec";
import { compilar } from "@/lib/prisma/compilers";
import type { PromptVivo } from "@/components/prisma/resultado";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma — estudio de prompts. Una idea → un prompt para cada herramienta.
 * Server component: gate por rol + flag, carga marcas/personajes/historial y monta
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
  return { specId: "demo", promptId: "demo", tool: "kling", spec, salida, valido: true, errores: [], porque: "Para un clip vertical corto sin voz, Kling anima la foto con buen movimiento." };
}

export default async function PrismaPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const [role, soy, sp] = await Promise.all([getViewAs(), getSoy(), searchParams]);
  const demo = sp.demo === "resultado" ? demoResultado() : null;

  if (!prismaActivo() || !canSee(role, "prisma")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          {prismaActivo() ? `Un ${ROLE_LABEL[role]} no entra a HÜE Prisma.` : "HÜE Prisma todavía no está encendido."}
        </p>
      </div>
    );
  }

  let marcas: MarcaUI[] = [];
  let personajes: PersonajeUI[] = [];
  let historial: ItemHistorialUI[] = [];
  if (hasSupabase()) {
    const db = supabaseAdmin();
    // lead/admin/master ven el historial de todos; el especialista, el suyo. Misma
    // regla que puedeTocar en actions.ts (una sola fuente: lib/roles).
    const todos = canVerTodoPrisma(role);
    const [m, p, h] = await Promise.all([cargarMarcas(db), cargarPersonajes(db, null), cargarHistorial(db, soy?.id ?? null, todos)]);
    marcas = m.map((x) => ({ id: x.id, name: x.name, client_id: x.client_id, client_name: x.client_name, preset: x.preset }));
    personajes = p.map((x) => ({ id: x.id, name: x.name, client_id: x.client_id }));
    historial = h.map((it) => ({
      specId: it.spec.id,
      job: it.spec.job as JobType,
      tool: (it.prompt?.tool ?? it.spec.tool) as Tool,
      idea: it.spec.idea,
      thumb: it.thumb,
      fecha: it.spec.created_at,
      valido: it.prompt?.valido ?? null,
    }));
  }

  return <PrismaStudio marcas={marcas} personajes={personajes} historial={historial} demo={demo} />;
}
