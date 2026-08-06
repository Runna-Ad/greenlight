import type { LucideIcon } from "lucide-react";

/**
 * Estado vacío consistente para todo el app. Antes cada superficie inventaba su
 * propio "no hay nada" con padding e ícono distintos (o sin ícono). Esto los
 * unifica: ícono en burbuja, título, descripción opcional y un CTA opcional.
 */
export function EmptyState({
  icon: Icon,
  titulo,
  descripcion,
  children,
  className,
}: {
  icon?: LucideIcon;
  titulo: string;
  descripcion?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center ${className ?? ""}`}
    >
      {Icon && (
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="size-6" />
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descripcion && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{descripcion}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
