import { redirect } from "next/navigation";
import { getViewAs } from "@/lib/view-as";
import { canSee } from "@/lib/roles";

// Aterrizaje por rol: un especialista no ve /clientes (canSee lo niega), así que
// mandarlo ahí lo dejaba en una tarjeta de "no entra" como primera pantalla tras el
// login. Va a su lista. El cliente lo amarra el proxy a su portal antes de llegar aquí.
// (reap pre-lanzamiento 2026-09-02)
export default async function Home() {
  const role = await getViewAs();
  redirect(canSee(role, "clientes") ? "/clientes" : "/mi-trabajo");
}
