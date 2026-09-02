import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto de carga de la ruta: antes la navegación quedaba en blanco (o en la
// pantalla anterior) mientras el servidor agregaba los datos. (reap 2026-09-02)
export default function Loading() {
  return (
    <div className="animate-in fade-in duration-300">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-56" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
