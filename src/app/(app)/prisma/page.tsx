import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canVerTodoPrisma } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo } from "@/lib/prisma/flags";
import { cargarHistorial, cargarMarcas, cargarPersonajes } from "@/lib/prisma/data";
import { PrismaStudio, type MarcaUI, type PersonajeUI } from "@/components/prisma/studio";
import type { ItemHistorialUI } from "@/components/prisma/historial";
import type { JobType, Tool } from "@/lib/prisma/spec";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma — estudio de prompts. Una idea → un prompt para cada herramienta.
 * Server component: gate por rol + flag, carga marcas/personajes/historial y monta
 * el estudio (client). El historial llega como props y se re-lee con router.refresh().
 */
export default async function PrismaPage() {
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);

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

  return <PrismaStudio marcas={marcas} personajes={personajes} historial={historial} />;
}
