import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PreviewBanner } from "@/components/shell/view-as-switch";
import { SoyBanner, type PoolMember } from "@/components/shell/soy-switch";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { countSinLeer } from "./notification-actions";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";

async function loadPool(): Promise<PoolMember[]> {
  if (!hasSupabase()) return [];
  const { data } = await supabaseAdmin()
    .from("track_members")
    .select("id, name, color, track")
    .eq("active", true)
    .order("track")
    .order("sort_order");
  return (data as PoolMember[]) ?? [];
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Se resuelve en el servidor para que el menú salga YA filtrado y el nombre
  // ya puesto: si se decidiera en el cliente, se vería un parpadeo del menú
  // completo antes de recortarse — inaceptable en una vista previa de cliente.
  const [role, soy, pool, avisos] = await Promise.all([
    getViewAs(),
    getSoy(),
    loadPool(),
    countSinLeer(),
  ]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} soy={soy} pool={pool} avisos={avisos} />
        <PreviewBanner role={role} />
        <SoyBanner soy={soy} />
        {/* Sin overflow-y-auto: con la altura sin tope, main no hace scroll (lo
            hace la ventana), y un overflow≠visible aquí ROMPERÍA position:sticky
            de los menús internos (se anclarían a main, que no scrollea). Así el
            contexto de scroll es la ventana y los sticky (sidebar, sub-header,
            barra inferior) funcionan. */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
