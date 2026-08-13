import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Contraste WCAG, resuelto en código ────────────────────────────────────────
const relLum = (hex: string): number => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string): number => {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** Oscurece un hex hacia negro dejando `pct`% del color (= color-mix(hex pct%, #000)). */
const oscurecer = (hex: string, pct: number): string => {
  const h = hex.replace("#", "");
  return (
    "#" +
    [0, 2, 4]
      .map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) * pct) / 100))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};
/**
 * Par {fondo, texto} SÓLIDO garantizado ≥4.5:1 para CUALQUIER color. Prueba el
 * color crudo con tinta oscura y con blanca; si ninguna pasa (tonos medios como el
 * verde de Google o el azul de FB — blanco da ~3–4:1), OSCURECE el fondo hasta que
 * el blanco pase. Así una pastilla sólida nunca queda ilegible.
 */
export function parSolido(color: string): { backgroundColor: string; color: string } {
  // No-hex (var(--plat-gg), rgb(), nombre): no se puede medir en JS → oscurecer en
  // CSS y usar blanco (seguro para los tonos de marca de canal, medios/oscuros).
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { backgroundColor: `color-mix(in srgb, ${color} 62%, #000)`, color: "#ffffff" };
  }
  const hex = color;
  const cDark = contraste(hex, "#1f1f1f"), cWhite = contraste(hex, "#ffffff");
  if (cDark >= 4.5 && cDark >= cWhite) return { backgroundColor: hex, color: "#1f1f1f" };
  if (cWhite >= 4.5) return { backgroundColor: hex, color: "#ffffff" };
  for (let p = 85; p >= 40; p -= 5) {
    if (contraste(oscurecer(hex, p), "#ffffff") >= 4.6) return { backgroundColor: oscurecer(hex, p), color: "#ffffff" };
  }
  return { backgroundColor: oscurecer(hex, 40), color: "#ffffff" };
}

// UNA pastilla para todo el app. Antes había ~10 implementaciones a mano, cada una
// re-decidiendo (y re-rompiendo) el contraste. Aquí el contraste se resuelve UNA
// vez, así que no puede volver a fallar. Dos modos:
//
//   • color dinámico (hex de la BD: persona, canal, marca)
//       - soft  (default): tinte del color + TINTA OSCURA (+ punto opcional). El
//                 patrón AA del tablero. Ideal para nombres de personas.
//       - solid: fondo = el color, texto = chipTextColor(color) (auto claro/oscuro).
//   • estado semántico (status="corrections"…): fondo SÓLIDO oscurecido + blanco
//       (la receta de las correcciones, medida en 5.0–5.6:1). Nunca color-sobre-
//       tinte-del-mismo-tono (falla AA — lección de los chips).

export type PillStatus =
  | "todo" | "progress" | "review" | "corrections"
  | "completed" | "published" | "delivered" | "warning";

// Cuánto oscurecer cada token para que el BLANCO pase AA encima (los ámbar/verde
// claros necesitan más). Valores heredados de la receta probada de correcciones.
const SOLID_MIX: Record<PillStatus, string> = {
  corrections: "78%",
  progress: "80%",
  warning: "80%",
  todo: "82%",
  review: "82%",
  published: "82%",
  completed: "92%",
  delivered: "92%",
};

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap";

export function Pill({
  children,
  color,
  status,
  fill = "soft",
  dot = false,
  className,
  title,
}: {
  children: ReactNode;
  /** Color dinámico de la BD (hex): persona, canal, marca. */
  color?: string;
  /** Estado semántico → usa el token --status-*. Tiene prioridad sobre `color`. */
  status?: PillStatus;
  /** "soft" = tinte + tinta; "solid" = fondo fuerte + texto auto/blanco. */
  fill?: "soft" | "solid";
  /** Punto del color a la izquierda (sólo en soft con color). */
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  // 1) Estado semántico: fondo sólido oscurecido + blanco.
  if (status) {
    return (
      <span
        title={title}
        className={cn(BASE, "font-semibold text-white", className)}
        style={{ backgroundColor: `color-mix(in srgb, var(--status-${status}) ${SOLID_MIX[status]}, #000)` }}
      >
        {children}
      </span>
    );
  }

  // 2) Color dinámico, relleno sólido: par {fondo, texto} garantizado AA (oscurece
  //    el fondo si un tono medio no pasa ni con blanco ni con oscuro).
  if (color && fill === "solid") {
    return (
      <span title={title} className={cn(BASE, "font-semibold", className)} style={parSolido(color)}>
        {children}
      </span>
    );
  }

  // 3) Color dinámico, relleno suave (default): tinte + tinta oscura + punto.
  if (color) {
    return (
      <span
        title={title}
        className={cn(BASE, "border font-medium text-foreground", className)}
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 26%, var(--card))`,
          borderColor: `color-mix(in srgb, ${color} 55%, var(--card))`,
        }}
      >
        {dot && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        {children}
      </span>
    );
  }

  // 4) Sin color ni estado: pastilla neutra (secondary).
  return (
    <span title={title} className={cn(BASE, "bg-secondary font-medium text-secondary-foreground", className)}>
      {children}
    </span>
  );
}
