import { Lock } from "lucide-react";
import { SyncPanel } from "@/components/sync/sync-panel";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { type PoolMember } from "@/components/intake/task-card";
import { getViewAs } from "@/lib/view-as";
import { canSee, ROLE_LABEL } from "@/lib/roles";
import { getSyncMode } from "./actions";

// La server action `importRows` hace una tanda de inserts por fila (todavía secuencial
// — el rewrite batched está pendiente, ver tasks/reap). Un sheet grande (50-100 filas)
// puede tardar; subimos el techo de Vercel a 60s para que no aborte a media importación.
export const maxDuration = 60;

export default async function SyncPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  // Guard de ruta: sync trae el roster + la herramienta de import — no para
  // creative/client aunque tecleen la URL (el middleware ya los amarra). (reap pre-launch)
  const role = await getViewAs();
  if (!canSee(role, "sync")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Un {ROLE_LABEL[role]} no entra a Sync.</p>
      </div>
    );
  }
  // Only the MODE crosses to the client — credentials stay on the server.
  const { kind } = await getSyncMode();

  // Pool VIVO de asignables (lead + creative), por track — reemplaza la lista
  // hardcodeada de vocab.ts en el preview de la sync.
  const { data: poolRows } = hasSupabase()
    ? await supabaseAdmin()
        .from("track_members")
        .select("name, color, track, role")
        .eq("active", true)
        .in("role", ["lead", "creative"])
        .order("name")
    : { data: [] };
  const pool = (poolRows ?? []) as PoolMember[];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        {cliente} · Sincronizar
      </div>
      <h2 className="mb-1 text-2xl font-semibold text-foreground">Traer del Google Sheet</h2>
      <p className="mb-5 max-w-[65ch] text-sm text-muted-foreground">
        Cada pestaña es un proyecto (Real o Normal, con su fecha). Trae solo lo nuevo;
        nada se crea hasta que revises y apruebes.
        {kind === "csv" && (
          <span className="mt-1 block text-[11px]">
            Modo lectura pública: solo se ven las pestañas configuradas. Conecta el
            Apps Script para listar todos los proyectos automáticamente.
          </span>
        )}
      </p>

      <SyncPanel cliente={cliente} pool={pool} />
    </div>
  );
}
