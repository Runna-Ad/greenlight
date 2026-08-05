import { Lock } from "lucide-react";

import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canCreateBrief } from "@/lib/roles";
import { IntakeForm } from "@/components/intake/intake-form";

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

  return <IntakeForm cliente={cliente} />;
}
