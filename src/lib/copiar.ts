/**
 * Copia texto al portapapeles. Del más compatible al menos: (1) copia clásica DENTRO del clic
 * (funciona aunque el navegador niegue el portapapeles moderno, p. ej. embebido o sin foco),
 * (2) el portapapeles moderno. false = no se pudo: quien llama deja el texto seleccionado.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  const ta = document.createElement("textarea");
  ta.value = texto;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  if (ok) return true;
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}
