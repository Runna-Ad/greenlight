import { SyncPanel } from "@/components/sync/sync-panel";
import { getSyncMode } from "./actions";

// La server action `importRows` hace una tanda de inserts por fila (todavía secuencial
// — el rewrite batched está pendiente, ver tasks/reap). Un sheet grande (50-100 filas)
// puede tardar; subimos el techo de Vercel a 60s para que no aborte a media importación.
export const maxDuration = 60;

export default async function SyncPage({
  params,
}: {
  params: Promise<{ cliente: string }>;
}) {
  const { cliente } = await params;
  // Only the MODE crosses to the client — credentials stay on the server.
  const { kind } = await getSyncMode();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        {cliente} · Sincronizar
      </div>
      <h2 className="mb-1 text-2xl font-semibold text-foreground">Traer del Google Sheet</h2>
      <p className="mb-5 max-w-[65ch] text-sm text-muted-foreground">
        Cada pestaña es un proyecto (Real o Normal, con su fecha). Trae solo lo nuevo;
        nada se crea hasta que revises y apruebes.
        {kind === "csv" && (
          <span className="mt-1 block text-[11px]">
            Modo lectura pública: solo se ven las pestañas configuradas. Conecta el
            Apps Script para listar todos los proyectos automáticamente.
          </span>
        )}
      </p>

      <SyncPanel cliente={cliente} />
    </div>
  );
}
