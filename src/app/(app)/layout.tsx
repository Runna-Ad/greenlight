import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { countSinLeer } from "./notification-actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved on the server from the authenticated session, so the menu comes out
  // already filtered by role and the avatar already named — no flash of a fuller
  // menu before it narrows.
  const [role, soy, avisos] = await Promise.all([getViewAs(), getSoy(), countSinLeer()]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} soy={soy} avisos={avisos} />
        {/* Sin overflow-y-auto: con la altura sin tope, main no hace scroll (lo
            hace la ventana), y un overflow≠visible aquí ROMPERÍA position:sticky
            de los menús internos. */}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
