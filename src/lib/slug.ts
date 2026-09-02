// Slug de una cadena legible: minúsculas, sin acentos, sólo [a-z0-9-]. Fuente ÚNICA
// (la usan crearMarca y crearCliente); antes vivía privada en admin/actions.ts.
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
