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

  // Pool VIVO de asignables (lead + creative), por track — reemplaza la lista
  // hardcodeada de vocab.ts. Admins/master no son asignables (no salen).
  const { data: poolRows } = hasSupabase()
    ? await supabaseAdmin()
        .from("track_members")
        .select("name, color, track")
        .eq("active", true)
        .in("role", ["lead", "creative"])
        .order("name")
    : { data: [] };
  const pool = (poolRows ?? []) as PoolMember[];

  return <BriefBuilder cliente={cliente} pool={pool} />;
}
