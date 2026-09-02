import { Lock } from "lucide-react";

import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canAdmin } from "@/lib/roles";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  listarEquipo,
  listarActividad,
  estadoIntegraciones,
  listarBiblioteca,
  listarMarcasPorCliente,
} from "./actions";
import { listarInvitaciones, listarClientesUsuarios } from "./clientes-actions";

export const dynamic = "force-dynamic";

// El panel de administración. Sólo master/admin. Con el login apagado (beta)
// todos son admin, así que en la práctica está abierto — es a propósito: la app
// no sale de beta test sin login (decisión de Pedro).
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const role = await getViewAs();
  const { tab } = await searchParams;
  const TABS_VALIDAS = new Set([
    "perfil", "equipo", "invitaciones", "clientes", "marcas",
    "actividad", "integraciones", "biblioteca", "hue", "papelera",
  ]);
  const initialTab = tab && TABS_VALIDAS.has(tab) ? (tab as never) : undefined;

  if (!canAdmin(role)) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} no entra a la configuración.
        </p>
      </div>
    );
  }

  const [equipo, soy, actividad, integraciones, biblioteca, marcas, invitaciones, clientesUsuarios] =
    await Promise.all([
      listarEquipo(),
      getSoy(),
      listarActividad(),
      estadoIntegraciones(),
      listarBiblioteca(),
      listarMarcasPorCliente(),
      listarInvitaciones(),
      listarClientesUsuarios(),
    ]);

  return (
    <AdminShell
      equipoInicial={equipo}
      soy={soy}
      marcas={marcas}
      actividad={actividad}
      integraciones={integraciones}
      biblioteca={biblioteca}
      invitaciones={invitaciones}
      clientesUsuarios={clientesUsuarios}
      esMaster={role === "master"}
      initialTab={initialTab}
    />
  );
}
