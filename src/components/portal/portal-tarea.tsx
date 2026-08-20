"use client";

import { WorkspaceProvider, useWorkspace } from "@/components/tarea/workspace-provider";
import { HeroTarea } from "@/components/tarea/hero-tarea";
import { TabsTarea } from "@/components/tarea/tabs-tarea";
import { DocumentoTarea } from "@/components/tarea/documento-tarea";
import { CorreccionesClienteProvider } from "@/components/portal/correcciones-cliente-provider";
import { PortalAcciones } from "@/components/portal/portal-acciones";
import { PanelRevisionesCliente } from "@/components/portal/panel-revisiones-cliente";
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
      {/* El cliente pide cambios seleccionando texto (igual que un lead), sólo
          mientras la idea siga en su cancha (published). Al enviarlos vuelve al
          equipo y la vista queda sólo-lectura. */}
      <CorreccionesClienteProvider
        ideaId={t.ideaId}
        clienteSlug={t.clienteSlug}
        cambios={t.cambios}
        revisiones={t.revisiones}
        editable={t.status === "published"}
      >
      {/* Barra de acción PEGADA ARRIBA (Aprobar ⇄ Pedir cambios). Vive dentro del
          provider para leer cuántos cambios anotó el cliente. `reReview` cambia el
          copy a "el equipo aplicó los N cambios que pediste" en la re-revisión. */}
      <PortalAcciones
        clienteSlug={t.clienteSlug}
        ideaId={t.ideaId}
        status={t.status}
        reReview={t.status === "published" && t.revisiones.length > 0}
        nRevisados={t.revisiones.length}
      />
      <div className="space-y-4">
        {/* Resumen read-only de "lo que pediste, ya aplicado" — sólo en la re-revisión
            (published con cambios de rondas pasadas). Encabeza el contenido para que el
            cliente sepa de una que esto es una vuelta con cambios hechos. */}
        {t.status === "published" && t.revisiones.length > 0 && <PanelRevisionesCliente />}
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
      </CorreccionesClienteProvider>
    </WorkspaceProvider>
  );
}

// El documento lee planos/estático del workspace (sembrados con los iniciales); en
// el portal nunca cambian. modo="lectura". Las referencias (imágenes/videos) SÍ se
// muestran al cliente — es la dirección visual del anuncio (Pedro).
function CuerpoDoc({ t }: { t: TareaPortal }) {
  const { planos, estatico } = useWorkspace();
  return (
    <DocumentoTarea
      modo="lectura"
      esEstatico={t.esEstatico}
      planos={planos}
      estatico={estatico}
      refsPorPlano={t.refsPorPlano}
      refsEstatico={t.refsEstatico}
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
