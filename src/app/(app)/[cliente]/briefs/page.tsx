import Link from "next/link";
import { FileText, Lock, Plus, UserRound } from "lucide-react";

import { hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canAdmin, canCreateBrief, canSee } from "@/lib/roles";
import { cargarBundles } from "@/lib/bundle-data";
import { BundleCard } from "@/components/briefs/bundle-card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * La vista de BUNDLES (wireframe "Brief View"): un card por brief con sus
 * tareas adentro. Clic → el workspace de la primera tarea, con flechas para
 * recorrer el bundle. El especialista ve los mismos cards pero sólo con las
 * tareas que tiene asignadas — el filtro vive en lib/bundle.ts, la ÚNICA
 * fuente que también alimenta las flechas del workspace.
 */
export default async function BriefsPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);

  if (!canSee(role, "briefs")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no entra a los briefs.
        </p>
      </div>
    );
  }

  const bundles = hasSupabase() ? await cargarBundles(cliente, role, soy?.id ?? null, soy?.tracks ?? null) : [];
  const esEspecialista = role === "creative";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {cliente} · Briefs
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Briefs</h1>
          {esEspecialista && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sólo ves las tareas que tienes asignadas dentro de cada brief.
            </p>
          )}
        </div>
        {canCreateBrief(role) && (
          <Button asChild>
            <Link href={`/${cliente}/briefs/nuevo`}>
              <Plus className="size-4" /> Nuevo brief
            </Link>
          </Button>
        )}
      </div>

      {esEspecialista && !soy && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
          <UserRound className="size-3.5 shrink-0" />
          Inicia sesión con tu cuenta de Rünna para ver tus tareas.
        </p>
      )}

      {bundles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <FileText className="size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {esEspecialista
              ? "Ningún brief tiene tareas tuyas todavía."
              : "Aún no hay briefs con tareas. Crea el primero para capturar ideas."}
          </p>
          {canCreateBrief(role) && (
            <Button asChild variant="outline" className="mt-4">
              <Link href={`/${cliente}/briefs/nuevo`}>Capturar idea</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bundles.map((b) => (
            <BundleCard key={b.brief_id} bundle={b} cliente={cliente} puedeBorrar={canAdmin(role)} />
          ))}
        </div>
      )}
    </div>
  );
}
