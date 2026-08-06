import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto de la vista de bundles mientras cargan los briefs.
export default function LoadingBriefs() {
  return (
    <div className="mx-auto max-w-4xl animate-in fade-in duration-300">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-40" />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
