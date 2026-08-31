import { type ReactNode } from "react";
import { desmarcarNegrita, unirRangos, type RangoNegrita } from "@/lib/negrita";
import { rangosLocutor } from "@/lib/dialogo";

/**
 * Pinta el tramo [a, b) del texto LIMPIO aplicando negrita POR RANGO (los `negritas`
 * vienen en coordenadas de `limpio`, ordenados y sin traslape). Se usa por segmento
 * de corrección: como la negrita y los resaltados comparten el mismo espacio, un
 * resaltado puede quedar dentro/encima de una negrita sin partir ningún marcador `**`.
 *
 * Vive AQUÍ (no en campo-lectura) para ser la ÚNICA fuente de pintado de negrita: el
 * modo interactivo (campo-lectura) y la vista de sólo-lectura (DialogoLectura) la
 * comparten, así el diálogo se ve idéntico en las dos rutas.
 */
export function pintarNegrita(limpio: string, negritas: RangoNegrita[], a: number, b: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = a;
  let k = 0;
  for (const r of negritas) {
    if (r.end <= a || r.start >= b) continue; // sin traslape con este segmento
    const bs = Math.max(r.start, a);
    const be = Math.min(r.end, b);
    if (bs > i) nodes.push(<span key={k++}>{limpio.slice(i, bs)}</span>);
    nodes.push(
      <strong key={k++} className="font-semibold">
        {limpio.slice(bs, be)}
      </strong>,
    );
    i = be;
  }
  if (i < b) nodes.push(<span key={k++}>{limpio.slice(i, b)}</span>);
  return nodes;
}

/**
 * Diálogo en SÓLO-LECTURA: el texto CRUDO ("(Actor) texto") con el locutor en negrita,
 * SIN reformatear. Es EXACTAMENTE lo que ve el revisor/cliente en el modo interactivo
 * (campo-lectura pinta el mismo `limpio` con `rangosLocutor`), para que el diálogo NO
 * cambie de forma entre estados: antes esta vista reformateaba a «Actor: "texto"» vía
 * `parseDialogo`, así que el cliente lo veía de una forma mientras revisaba (publicado,
 * ruta interactiva) y de OTRA tras aprobar (entregado, esta ruta) — el fork que cerró el
 * reap pre-launch. Reformatear aquí no es opción: rompería los offsets/cita con los que
 * el cliente ancla sus cambios en la ruta interactiva. Una sola forma, la que respeta el
 * anclaje. Devuelve null si no hay diálogo.
 */
export function DialogoLectura({ texto }: { texto: string | null }) {
  const { texto: limpio, negritas } = desmarcarNegrita(texto ?? "");
  if (!limpio.trim()) return null;
  const negritasVista = unirRangos(negritas, rangosLocutor(limpio));
  return (
    <div className="whitespace-pre-wrap px-1.5 py-1 text-[13px] leading-relaxed text-foreground">
      {pintarNegrita(limpio, negritasVista, 0, limpio.length)}
    </div>
  );
}
