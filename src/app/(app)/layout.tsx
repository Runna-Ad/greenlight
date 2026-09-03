import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { countSinLeer } from "./notification-actions";
import { getCurrentUser } from "@/lib/identity";
import { liveTopic } from "@/lib/live";
import { LiveRefresh } from "@/components/shell/live-refresh";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved on the server from the authenticated session, so the menu comes out
  // already filtered by role and the avatar already named — no flash of a fuller
  // menu before it narrows.
  const [role, soy, avisos, user] = await Promise.all([getViewAs(), getSoy(), countSinLeer(), getCurrentUser()]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Live refresh (0062): la página se re-lee sola cuando cambia un estado o una
          asignación. Sin sesión (login apagado en local) no se suscribe a nada. */}
      <LiveRefresh topic={user ? liveTopic(user.userId) : null} />
      {/* Skip link: primer elemento enfocable — evita que el teclado tenga que
          recorrer todo el nav de la Sidebar en cada página para llegar al main. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-ring focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:ring-1 focus:ring-ring/50 focus:outline-none"
      >
        Saltar al contenido principal
      </a>
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} soy={soy} avisos={avisos} />
        {/* Sin overflow-y-auto: con la altura sin tope, main no hace scroll (lo
            hace la ventana), y un overflow≠visible aquí ROMPERÍA position:sticky
            de los menús internos. */}
        <main id="main" className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
