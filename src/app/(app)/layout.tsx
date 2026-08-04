import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PreviewBanner } from "@/components/shell/view-as-switch";
import { getViewAs } from "@/lib/view-as";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Se resuelve en el servidor para que el menú salga YA filtrado: si se
  // decidiera en el cliente, se vería un parpadeo del menú completo antes de
  // recortarse — inaceptable en una vista previa de cliente.
  const role = await getViewAs();

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} />
        <PreviewBanner role={role} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
