import type { ReactNode } from "react";
import { partirNegrita } from "@/lib/negrita";

/**
 * Convierte las URLs de un texto en nodos clicables (más el texto entre ellas).
 * Núcleo puro y reutilizable: `Linkify` y `TextoRico` lo comparten. Los dominios
 * pelones se dejan fuera (falsos positivos con "p.ej.").
 */
function linkificarTexto(texto: string, keyBase = 0): ReactNode[] {
  if (!texto) return [];
  // Regex FRESCO por llamada (lastIndex propio): http(s):// o www.
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let key = keyBase;
  let m: RegExpExecArray | null;

  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) out.push(texto.slice(last, m.index));

    // Se recorta la puntuación final para no meterla dentro del link.
    let url = m[0];
    let cola = "";
    while (/[.,;:)\]]$/.test(url)) {
      cola = url.slice(-1) + cola;
      url = url.slice(0, -1);
    }
    const href = url.toLowerCase().startsWith("http") ? url : `https://${url}`;
    out.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline-offset-2 hover:underline"
      >
        {url}
      </a>,
    );
    if (cola) out.push(cola);
    last = m.index + m[0].length;
  }
  if (last < texto.length) out.push(texto.slice(last));

  return out;
}

/**
 * Muestra un texto volviendo CLICABLE cualquier URL que contenga. Para
 * superficies de SÓLO LECTURA (preview del cliente, subtítulos, notas) — en un
 * textarea editable no aplica. Sin "use client": sirve en server y client.
 */
export function Linkify({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const texto = children ?? "";
  if (!texto) return null;
  return (
    <span className={className} style={{ whiteSpace: "pre-line" }}>
      {linkificarTexto(texto)}
    </span>
  );
}

/**
 * Renderiza un texto pintando en <strong> los tramos `**…**` (negrita del copy).
 * SÓLO negrita (sin links) — para segmentos donde no queremos linkificar (p. ej.
 * el diálogo, o los segmentos de corrección de CampoLectura). Devuelve un Fragment
 * (sin wrapper) para poder anidarlo dentro de un <mark>/<span>/<p> existente.
 */
export function Negrita({ children }: { children: string | null | undefined }) {
  const runs = partirNegrita(children ?? "");
  return (
    <>
      {runs.map((r, i) =>
        r.fuerte ? (
          <strong key={i} className="font-semibold">
            {r.texto}
          </strong>
        ) : (
          <span key={i}>{r.texto}</span>
        ),
      )}
    </>
  );
}

/**
 * Texto rico de sólo lectura: negrita `**…**` + URLs clicables, compuestos. Cada
 * tramo (negrita o normal) se linkifica por dentro, así una URL dentro de una
 * negrita también queda clicable. Reemplaza a `Linkify` en las vistas de documento.
 */
export function TextoRico({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const texto = children ?? "";
  if (!texto) return null;
  const runs = partirNegrita(texto);
  return (
    <span className={className} style={{ whiteSpace: "pre-line" }}>
      {runs.map((r, i) => {
        const nodos = linkificarTexto(r.texto, i * 1000);
        return r.fuerte ? (
          <strong key={i} className="font-semibold">
            {nodos}
          </strong>
        ) : (
          <span key={i}>{nodos}</span>
        );
      })}
    </span>
  );
}
