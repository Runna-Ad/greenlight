import { NextResponse, type NextRequest } from "next/server";

// Antigua entrada por ENLACE de un solo uso para clientes. Ya no se emiten enlaces: los
// clientes entran con contraseña (creada con un código) o con Google. Esta ruta ya NO
// abre sesiones — sólo manda cualquier enlace viejo que siga en un buzón a la entrada de
// clientes con un mensaje claro. Antes canjeaba cualquier `type`/`token_hash` y, al
// rechazar, cerraba TODAS las sesiones del usuario. (security review 2026-09-21)
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/portal/login?error=link-expired", request.url));
}
