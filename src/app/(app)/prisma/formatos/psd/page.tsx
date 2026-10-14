import "../../prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo, prismaFormatosActivo } from "@/lib/prisma/flags";
import { FormatosPsd, type ClientePsd } from "@/components/prisma/formatos/formatos-psd";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma › Formatos, puerta PSD — el anuncio llega en Photoshop y sale en N medidas. Server component: el gate
 * (el mismo de HÜE Prisma: flag + rol) y la lista de clientes para elegir arriba (decide qué tipografías exclusivas
 * se pueden usar). El PSD se lee en el navegador y no toca la base, por eso NO depende del interruptor de la
 * puerta de imagen plana (esa sí guarda en la base).
 */
export default async function FormatosPsdPage() {
  const [role, soyId] = await Promise.all([getViewAs(), getSoyId()]);
  if (!prismaActivo() || !canSee(role, "prisma")) {
    // El mismo candado que /prisma (mismo gate): sin enlace de regreso, porque llevaría a este mismo candado.
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-base font-medium text-foreground">{prismaActivo() ? `Un ${ROLE_LABEL[role]} no tiene acceso a HÜE Prisma.` : "HÜE Prisma todavía no está activo."}</h1>
      </div>
    );
  }
  // Los clientes activos: los mismos a los que Admin › Marcas les sube tipografías (también uno sin marcas). Sin
  // sesión no se mandan: la pantalla sigue sirviendo, sin selector (y sin tipografías de Greenlight, que piden sesión).
  let clientes: ClientePsd[] = [];
  if (hasSupabase() && soyId) {
    const { data, error } = await supabaseAdmin().from("clients").select("id, name").eq("active", true).order("name");
    if (error) console.error("[prisma] clientes para Formatos:", error.message);
    clientes = ((data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, nombre: c.name }));
  }
  return <FormatosPsd planaActiva={prismaFormatosActivo()} clientes={clientes} />;
}
