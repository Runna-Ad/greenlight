import { Skeleton } from "@/components/ui/skeleton";

// Feedback de carga del tablero: el esqueleto del kanban mientras llega la data
// (antes la ruta cargaba en seco — pantalla previa o blanco en conexión lenta).
export default function LoadingTablero() {
  return (
    <div className="animate-in fade-in duration-300">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-48" />

      <div className="mt-4 flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-44 rounded-lg" />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="w-full lg:w-72">
            <Skeleton className="h-9 rounded-t-lg" />
            <div className="space-y-2 rounded-b-lg border border-t-0 border-border bg-secondary/25 p-2">
              {Array.from({ length: col === 0 ? 3 : 2 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
