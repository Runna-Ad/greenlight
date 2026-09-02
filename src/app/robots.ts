import type { MetadataRoute } from "next";

// Herramienta interna: los buscadores no tienen nada que hacer aquí. Complementa el
// `robots: { index: false }` del layout (meta) con el /robots.txt clásico.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
