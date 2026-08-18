import { Lock } from "lucide-react";
import { getSoy } from "@/lib/soy";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { PerfilTab } from "@/components/admin/perfil-tab";

export const dynamic = "force-dynamic";

/**
 * "Mi perfil" para leads y especialistas (los admin lo editan dentro de
 * Configuración). Reusa el MISMO componente PerfilTab que la pestaña de admin.
 */
export default async function MiPerfilPage() {
  const [soy, role] = await Promise.all([getSoy(), getViewAs()]);

  if (!canSee(role, "mi-perfil")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">
          Un {ROLE_LABEL[role]} gestiona su perfil en otra parte.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground font-[family-name:var(--font-poppins)]">
        Mi perfil
      </h1>
      <PerfilTab soy={soy} />
    </div>
  );
}
