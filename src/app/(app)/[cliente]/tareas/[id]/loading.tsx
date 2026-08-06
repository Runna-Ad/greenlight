import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto del workspace mientras carga la tarea.
export default function LoadingTarea() {
  return (
    <div className="animate-in fade-in duration-300">
      <Skeleton className="h-3 w-28" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-10 rounded" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded" />
      </div>
      <Skeleton className="mt-2 h-7 w-64" />

      {/* Rünna details + cabecera */}
      <Skeleton className="mt-4 h-40 rounded-xl" />
      <Skeleton className="mt-4 h-52 rounded-xl" />

      {/* cuerpo + preview */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <Skeleton className="h-8 rounded-t-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="hidden h-80 rounded-lg lg:block" />
      </div>
    </div>
  );
}
