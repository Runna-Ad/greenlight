import { Lock } from "lucide-react";

import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canCreateBrief } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { BriefBuilder } from "@/components/intake/brief-builder";
import { type PoolMember } from "@/components/intake/task-card";

// Puerta propia: el especialista ahora VE /briefs (los bundles), pero capturar
// un brief sigue siendo del lead. Sin esta puerta heredaría el permiso.
export default async function NuevoBriefPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const role = await getViewAs();

  if (!canCreateBrief(role)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no captura briefs — eso es del lead.
        </p>
      </div>
    );
  }

  // Pool VIVO del roster. Quién es asignable a CADA track lo decide `puedeSerAsignado`
  // (lib/roles) en el picker — la misma regla que el tablero y el gate del servidor:
  // grant multi-track, y admin/master pueden ser lead (Pedro 2026-09-01). `tracks` es
  // obligatorio en el select (sin él el grant no cuenta). (reap 2026-09-02, sweep C1)
  const { data: poolRows } = hasSupabase()
    ? await supabaseAdmin()
        .from("track_members")
        .select("name, color, track, tracks, role")
        .eq("active", true)
        .order("name")
    : { data: [] };
  const pool = (poolRows ?? []) as PoolMember[];

  return <BriefBuilder cliente={cliente} pool={pool} />;
}
