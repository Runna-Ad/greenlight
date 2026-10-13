import "../../prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { prismaActivo, prismaFormatosActivo } from "@/lib/prisma/flags";
import { FormatosPsd } from "@/components/prisma/formatos/formatos-psd";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma › Formatos, puerta PSD — el anuncio llega en Photoshop y sale en N medidas. Server component: sólo
 * el gate (el mismo de HÜE Prisma: flag + rol). No carga nada: el PSD se lee en el navegador y no toca la base,
 * por eso NO depende del interruptor de la puerta de imagen plana (esa sí guarda en la base).
 */
export default async function FormatosPsdPage() {
  const role = await getViewAs();
  if (!prismaActivo() || !canSee(role, "prisma")) {
    // El mismo candado que /prisma (mismo gate): sin enlace de regreso, porque llevaría a este mismo candado.
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-base font-medium text-foreground">{prismaActivo() ? `Un ${ROLE_LABEL[role]} no tiene acceso a HÜE Prisma.` : "HÜE Prisma todavía no está activo."}</h1>
      </div>
    );
  }
  return <FormatosPsd planaActiva={prismaFormatosActivo()} />;
}
