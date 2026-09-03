"use client";

import { WorkspaceProvider, useWorkspace } from "@/components/tarea/workspace-provider";
import { LegalLectura } from "@/components/tarea/legal-lectura";
import { HeroTarea } from "@/components/tarea/hero-tarea";
import { TabsTarea } from "@/components/tarea/tabs-tarea";
import { DocumentoTarea } from "@/components/tarea/documento-tarea";
import { DocumentoCopies } from "@/components/tarea/documento-copies";
import { CorreccionesClienteProvider } from "@/components/portal/correcciones-cliente-provider";
import { PortalAcciones } from "@/components/portal/portal-acciones";
import { PanelControlCambios } from "@/components/portal/panel-control-cambios";
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
export function PortalTarea({ t, puedeActuar }: { t: TareaPortal; puedeActuar: boolean }) {
  return (
    <WorkspaceProvider
      key={t.ideaId}
      planosIniciales={t.planos}
      estaticoInicial={t.estatico}
      verClienteInicial={true}
    >
      {/* El cliente pide cambios seleccionando texto (igual que un lead), sólo
          mientras la idea siga en su cancha (published). Un visor SIN permiso de
          actuar (admin en sólo-lectura) NUNCA edita, aunque la idea esté published. */}
      <CorreccionesClienteProvider
        ideaId={t.ideaId}
        clienteSlug={t.clienteSlug}
        cambios={t.cambios}
        revisiones={t.revisiones}
        enProceso={t.enProceso}
        editable={puedeActuar && t.status === "published"}
      >
      {/* Barra de acción PEGADA ARRIBA (Aprobar ⇄ Pedir cambios). Vive dentro del
          provider para leer cuántos cambios anotó el cliente. `reReview` cambia el
          copy a "el equipo aplicó los N cambios que pediste" en la re-revisión.
          `puedeActuar=false` (admin viendo) → barra de sólo-lectura, sin botones. */}
      <PortalAcciones
        clienteSlug={t.clienteSlug}
        ideaId={t.ideaId}
        status={t.status}
        reReview={t.status === "published" && t.revisiones.length > 0}
        nRevisados={t.revisiones.length}
        puedeActuar={puedeActuar}
      />
      <CuerpoTarea t={t} />
      </CorreccionesClienteProvider>
    </WorkspaceProvider>
  );
}

// El cuerpo de la tarea: contenido (Hero + Tabs + documento) y, cuando el cliente tiene
// cambios (sin enviar o aplicados), el panel "Control de Cambios" — a la DERECHA en
// desktop (sticky, mismo formato que el interno) y COLAPSABLE arriba en móvil (Pedro).
function CuerpoTarea({ t }: { t: TareaPortal }) {
  const hayPanel = t.cambios.length > 0 || t.revisiones.length > 0 || t.enProceso.length > 0;
  const hero = (
    <HeroTarea
      ideaId={t.ideaId}
      marca={t.marcaName}
      logoUrl={t.marcaLogo}
      briefLabel={t.briefLabel}
      naming={t.naming}
      status={t.status}
      notaGuion={t.notaGuion}
      notaPlaceholder=""
      plantilla={t.plantilla}
      entregaUrl={t.entregaUrl}
      soloLectura={true}
    />
  );
  const tabs = (
    <TabsTarea
      ideaId={t.ideaId}
      plantilla={t.plantilla}
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
  );

  if (!hayPanel)
    return (
      <div className="space-y-4">
        {hero}
        {tabs}
        <CuerpoDoc t={t} />
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Móvil: Control de Cambios colapsable arriba del contenido. */}
      <div className="lg:hidden">
        <PanelControlCambios mobile />
      </div>
      {hero}
      {tabs}
      {/* El panel vive JUNTO A LOS PLANOS (ahí están los cambios), no arriba con los
          detalles. 2-col sólo alrededor del documento; sticky BAJO la barra de acción
          (top-32) y con scroll interno (max-h) para que un panel alto no se corte (Pedro). */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="min-w-0">
          <CuerpoDoc t={t} />
        </div>
        <div className="hidden lg:sticky lg:top-[11.75rem] lg:block lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto">
          <PanelControlCambios />
        </div>
      </div>
    </div>
  );
}

// El documento lee planos/estático del workspace (sembrados con los iniciales); en
// el portal nunca cambian. modo="lectura". Las referencias (imágenes/videos) SÍ se
// muestran al cliente — es la dirección visual del anuncio (Pedro).
function CuerpoDoc({ t }: { t: TareaPortal }) {
  const { planos, estatico } = useWorkspace();
  // Copies: documento propio en modo lectura (el WorkspaceProvider siembra
  // verCliente=true → DocumentoCopies renderiza `CampoLectura`, con lo que el cliente
  // ancla cambios igual que en un plano/estático). No usa planos/estático.
  const doc =
    t.plantilla === "copies" ? (
      <DocumentoCopies ideaId={t.ideaId} temasIniciales={t.temas} soloLectura />
    ) : (
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
  // El cliente también ve la CORTINILLA/legales (Pedro), y ahora puede PEDIR CAMBIOS
  // sobre ella: LegalLectura reusa el mismo anclado de selección de los planos.
  return (
    <div className="space-y-3">
      {doc}
      {t.legal && (
        <LegalLectura
          ideaId={t.ideaId}
          legal={t.legal}
          titulo={t.esEstatico ? "Legales" : "Cortinilla de Cierre"}
        />
      )}
    </div>
  );
}
