import type { ReactNode } from "react";

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

  // Regex FRESCO por llamada: http(s):// o www. Los dominios pelones se dejan
  // fuera del inline (falsos positivos con "p.ej."); parseReferencias sí los
  // acepta porque ahí cada línea es una referencia entera.
  const re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
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

  return (
    <span className={className} style={{ whiteSpace: "pre-line" }}>
      {out}
    </span>
  );
}
