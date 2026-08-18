import Link from "next/link";
import { Eye, Hammer } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { ROLE_LABEL } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * Portal del cliente — TODAVÍA NO CONSTRUIDO (punto 4 del plan).
 *
 * Deliberadamente NO se pinta aquí una maqueta "parecida a lo que verá el
 * cliente". Una vista previa que no es la pantalla real no prueba nada: se
 * aprueba algo que el día del lanzamiento resulta ser otra cosa. Mejor decir
 * qué falta.
 */
export default async function PortalPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  const role = await getViewAs();

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        {cliente} · Portal del cliente
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-foreground">
        Todavía no está construido
      </h2>

      <div className="mt-5 rounded-xl border border-dashed border-border p-6">
        <div className="flex items-start gap-3">
          <Hammer className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm leading-relaxed text-muted-foreground">
            <p className="text-foreground">
              Esta pantalla existe para que el menú del rol Partner sea real, no
              para simular el portal.
            </p>
            <p className="mt-3">
              No se pinta aquí una maqueta parecida a propósito: una vista previa
              que no es la pantalla de verdad no prueba nada — se aprueba algo y
              el día del lanzamiento el cliente ve otra cosa.
            </p>
            <p className="mt-3">Cuando se construya (punto 4 del plan), mostrará:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Sólo las ideas <strong>publicadas</strong> de su cliente</li>
              <li>Estados Revisión / Cambios / Aprobado</li>
              <li>Hilo de comentarios por idea</li>
              <li>Vista por wave de entrega</li>
            </ul>
          </div>
        </div>
      </div>

      {role === "client" && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          Estás viéndolo como {ROLE_LABEL[role]}: el menú de la izquierda quedó
          reducido a lo que un Partner vería.
        </p>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        <Link href={`/${cliente}/tablero`} className="underline underline-offset-2">
          Ir al tablero
        </Link>{" "}
        (necesitas volver a un rol interno)
      </p>
    </div>
  );
}
