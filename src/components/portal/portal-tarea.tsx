"use client";

import { WorkspaceProvider, useWorkspace } from "@/components/tarea/workspace-provider";
import { HeroTarea } from "@/components/tarea/hero-tarea";
import { TabsTarea } from "@/components/tarea/tabs-tarea";
import { DocumentoTarea } from "@/components/tarea/documento-tarea";
import { PLACEHOLDER_ESTATICO, placeholdersGuion } from "@/lib/plantilla";
import type { TareaPortal } from "@/app/(app)/[cliente]/portal/portal-data";

const noop = () => {};

/**
 * La "Vista cliente" de una tarea, SÓLO LECTURA, para el portal. Reusa las mismas
 * piezas del editor (Hero + Tabs + DocumentoTarea) que el revisor ve en su preview
 * "Vista cliente" — así lo que el partner ve ES lo mismo que el equipo aprobó.
 * `runna` se omite (oculta lead/equipo/consideraciones/archivos), verCliente=true y
 * todos los callbacks de edición son no-op.
 */
export function PortalTarea({ t }: { t: TareaPortal }) {
  return (
    <WorkspaceProvider
      key={t.ideaId}
      planosIniciales={t.planos}
      estaticoInicial={t.estatico}
      verClienteInicial={true}
    >
      <div className="space-y-4">
        <HeroTarea
          ideaId={t.ideaId}
          marca={t.marcaName}
          logoUrl={t.marcaLogo}
          briefLabel={t.briefLabel}
          naming={t.naming}
          status={t.status}
          notaGuion={t.notaGuion}
          notaPlaceholder=""
          esEstatico={t.esEstatico}
          entregaUrl={t.entregaUrl}
          soloLectura={true}
        />
        <TabsTarea
          ideaId={t.ideaId}
          esEstatico={t.esEstatico}
          soloLectura={true}
          detalles={{
            tipoAsset: t.tipoAsset,
            plataformas: t.plataformas,
            tamanos: t.tamanos,
            duracion: t.duracion,
            concepto: t.concepto,
            trend: t.trend,
          }}
          runna={undefined}
        />
        <CuerpoDoc t={t} />
      </div>
    </WorkspaceProvider>
  );
}

// El documento lee planos/estático del workspace (sembrados con los iniciales); en
// el portal nunca cambian. modo="lectura" y refs vacías (el portal no muestra las
// referencias internas de producción).
function CuerpoDoc({ t }: { t: TareaPortal }) {
  const { planos, estatico } = useWorkspace();
  return (
    <DocumentoTarea
      modo="lectura"
      esEstatico={t.esEstatico}
      planos={planos}
      estatico={estatico}
      refsPorPlano={{}}
      refsEstatico={[]}
      ph={placeholdersGuion(t.tipoAsset)}
      phEstatico={PLACEHOLDER_ESTATICO}
      soloLectura={true}
      onEditarPlano={noop}
      onEditarEstatico={noop}
      onNuevoPlano={noop}
      onQuitarPlano={noop}
    />
  );
}
