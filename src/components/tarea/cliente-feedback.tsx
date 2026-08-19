import { MessageSquareText } from "lucide-react";

export type ComentarioCliente = { id: string; body: string; fecha: string | null };

/**
 * Lo que el CLIENTE pidió cambiar desde el portal (comentarios kind='client_change').
 * Es texto libre, no anclado a un campo — por eso vive aquí como su propia tarjeta,
 * separada del panel de correcciones internas. Se muestra prominente para que el
 * especialista vea qué pidió el cliente cuando la tarea vuelve a cambios.
 */
export function ClienteFeedback({ comentarios }: { comentarios: ComentarioCliente[] }) {
  if (!comentarios.length) return null;
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--status-corrections) 40%, var(--border))",
        background: "color-mix(in srgb, var(--status-corrections) 7%, transparent)",
      }}
    >
      <p
        className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
      >
        <MessageSquareText className="size-4" />
        {comentarios.length === 1 ? "El cliente pidió un cambio" : `El cliente pidió ${comentarios.length} cambios`}
      </p>
      <ul className="space-y-2">
        {comentarios.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-3">
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">{c.body}</p>
            {c.fecha && <p className="mt-1.5 text-[11px] text-muted-foreground">{c.fecha}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
