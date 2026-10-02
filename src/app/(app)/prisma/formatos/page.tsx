import "../prisma.css";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoyId } from "@/lib/soy";
import { ROLE_LABEL, canSee } from "@/lib/roles";
import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { prismaFormatosActivo } from "@/lib/prisma/flags";
import { cargarMarcas } from "@/lib/prisma/data";
import { HEX } from "@/lib/prisma/formatos/geometria";
import { iaActiva } from "@/lib/prisma/formatos/proveedor";
import type { LoteVista, SalidaVista } from "@/lib/prisma/formatos/vista";
import { FormatosStudio, type MarcaColores } from "@/components/prisma/formatos/formatos-studio";
import { UUID } from "../comun";

export const dynamic = "force-dynamic";

/**
 * HÜE Prisma › Formatos — un anuncio terminado → N tamaños. Server component: gate por rol + flag, carga
 * las marcas (para sus colores) y monta la pantalla (client). `?resultado=<id>` llega desde "Adaptar
 * formatos" en "¿Cómo salió?": la pantalla pide ese lote al montar (nunca se escribe en un GET).
 */
function demoFormatos(): { lote: LoteVista; salidas: SalidaVista[] } | null {
  if (process.env.NODE_ENV !== "development") return null;
  const lote: LoteVista = { id: "demo", nombre: "promo-demo", w: 480, h: 358, url: "/prisma/looks/atardecer_calido.jpg", colorBorde: "#3a2f4b", resultadoId: null, clientId: null };
  const base = { color: null, jpgUrl: lote.url, costoEstimadoUsd: 0, costoRealUsd: null, deriva: null, revisarUnion: false, pixelLockOk: null, error: null };
  const s = (preset: string, ancho: number, alto: number, x: Partial<SalidaVista>): SalidaVista => ({ ...base, id: preset, preset, ancho, alto, modo: "blur", estado: "listo", pngUrl: lote.url, ...x });
  return {
    lote,
    salidas: [
      s("meta-1080x1080", 1080, 1080, { modo: "ia", pixelLockOk: true, deriva: 6.2, costoEstimadoUsd: 0.068, costoRealUsd: 0.0702 }),
      s("meta-1080x1920", 1080, 1920, { modo: "ia", pixelLockOk: true, deriva: 24.5, revisarUnion: true, costoEstimadoUsd: 0.102, costoRealUsd: 0.1031 }),
      s("google-300x250", 300, 250, { estado: "procesando", pngUrl: null, jpgUrl: null }),
      s("linkedin-1200x627", 1200, 627, { pixelLockOk: true, costoRealUsd: 0 }),
      s("x-1600x900", 1600, 900, { modo: "ia", estado: "error", pngUrl: null, jpgUrl: null, error: "La IA está saturada. Reintenta en un minuto." }),
      s("pinterest-1000x1500", 1000, 1500, { estado: "pendiente", pngUrl: null, jpgUrl: null }),
    ],
  };
}

export default async function FormatosPage({ searchParams }: { searchParams: Promise<{ demo?: string; resultado?: string }> }) {
  const [role, soyId, sp] = await Promise.all([getViewAs(), getSoyId(), searchParams]);
  const demo = sp.demo === "formatos" ? demoFormatos() : null;
  // Identidad obligatoria (como las acciones): sin sesión no se mandan las marcas ni sus colores. La muestra de
  // desarrollo no la necesita.
  const motivo = !prismaFormatosActivo()
    ? "Formatos todavía no está activo."
    : !canSee(role, "prisma")
      ? `Un ${ROLE_LABEL[role]} no tiene acceso a HÜE Prisma.`
      : !soyId && !demo
        ? "Inicia sesión para usar Formatos."
        : null;
  if (motivo) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center" role="status">
        <Lock className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-base font-medium text-foreground">{motivo}</h1>
        <Link href="/prisma" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Volver a HÜE Prisma
        </Link>
      </div>
    );
  }
  let marcas: MarcaColores[] = [];
  if (hasSupabase() && !demo) {
    const m = await cargarMarcas(supabaseAdmin());
    marcas = m.map((x) => ({ id: x.id, clientId: x.client_id, nombre: `${x.client_name} · ${x.name}`, colores: x.preset.paleta.filter((c) => HEX.test(c)).map((c) => c.toLowerCase()) }));
  }
  const resultadoId = typeof sp.resultado === "string" && UUID.test(sp.resultado) ? sp.resultado : null;
  return <FormatosStudio marcas={marcas} iaOn={iaActiva()} resultadoId={resultadoId} demo={demo} />;
}
