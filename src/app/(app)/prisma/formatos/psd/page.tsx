import "../../prisma.css";
import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaActivo, prismaFormatosActivo } from "@/lib/prisma/flags";
import { iaActiva } from "@/lib/prisma/formatos/proveedor";
import { FormatosPsd, type ClientePsd } from "@/components/prisma/formatos/formatos-psd";
import type { LegalGuardado } from "@/lib/prisma/formatos/legal";
import { limpiarTexto } from "@/lib/prisma/formatos/textos";

export const dynamic = "force-dynamic";

/** Más que esto no es una biblioteca de legales: se leen los primeros (y se dice en el registro). */
const LEGALES_MAX = 500;
type FilaLegal = { id: string; title: string; body: string; scope: string; marcas: { name: string; client_id: string; active: boolean } | null };

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
  let legales: LegalGuardado[] = [];
  let legalesFallaron = false;
  if (hasSupabase() && soyId) {
    const db = supabaseAdmin();
    const [cl, lg] = await Promise.all([
      db.from("clients").select("id, name").eq("active", true).order("name"),
      // Los legales de la Biblioteca (B24), los mismos que se eligen en una tarea: los de una marca (su cliente es el de
      // la marca: una fila de marca guarda client_id NULL) y los globales. La Biblioteca y Notion sólo crean esos dos.
      db
        .from("snippets")
        .select("id, title, body, scope, marcas(name, client_id, active)")
        .eq("kind", "legal")
        .eq("active", true)
        .in("scope", ["marca", "global"])
        .order("title")
        .limit(LEGALES_MAX)
        .returns<FilaLegal[]>(),
    ]);
    if (cl.error) console.error("[prisma] clientes para Formatos:", cl.error.message);
    clientes = ((cl.data ?? []) as { id: string; name: string }[]).map((c) => ({ id: c.id, nombre: c.name }));
    // Sin legales la pantalla sigue y la fila dice que no se pudieron leer (no que no hay); el error, al registro.
    if (lg.error) {
      legalesFallaron = true;
      console.error("[prisma] legales para Formatos:", lg.error.message);
    }
    if ((lg.data?.length ?? 0) >= LEGALES_MAX) console.error(`[prisma] legales para Formatos: se leyeron sólo los primeros ${LEGALES_MAX}`);
    const activos = new Set(clientes.map((c) => c.id));
    legales = (lg.data ?? []).flatMap((f) => {
      const clienteId = f.scope === "global" ? null : (f.marcas?.client_id ?? null);
      // Sólo los de una marca activa de un cliente activo (los que tienen a quién elegir arriba), o los globales.
      if (f.scope !== "global" && (!clienteId || !activos.has(clienteId) || !f.marcas?.active)) return [];
      // Las letras como las escribiría el editor; uno vacío no se ofrece (el legal nunca se borra).
      const texto = limpiarTexto(f.body ?? "").trim();
      if (!texto) return [];
      return [{ id: f.id, titulo: limpiarTexto(f.title ?? "").replace(/\s+/g, " ").trim(), texto, marca: f.marcas?.name ?? null, clienteId }];
    });
  }
  // El respaldo con IA sólo se ofrece con sesión: la ruta que llama a la IA la pide (y cobra).
  return <FormatosPsd planaActiva={prismaFormatosActivo()} clientes={clientes} legales={legales} legalesFallaron={legalesFallaron} iaCopia={!!soyId && iaActiva()} />;
}

