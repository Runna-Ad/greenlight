"use client";

import { createContext, useContext, type ReactNode } from "react";
import { CATALOGO_BASE, type Catalogo } from "@/lib/prisma/catalogo";

/** F6a: el catálogo VIGENTE (Hub › Herramientas) que cargó la página. Sin proveedor (demo, tests),
 *  las constantes: el estudio nunca se queda sin datos de herramienta. */
const CatalogoCtx = createContext<Catalogo>(CATALOGO_BASE);

export function CatalogoProvider({ value, children }: { value: Catalogo; children: ReactNode }) {
  return <CatalogoCtx value={value}>{children}</CatalogoCtx>;
}

export const useCatalogo = (): Catalogo => useContext(CatalogoCtx);
