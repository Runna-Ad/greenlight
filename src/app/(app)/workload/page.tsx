import { redirect } from "next/navigation";

// "Workload" ahora es un sub-tab de Performance. Se conserva la ruta como
// redirección para no romper enlaces/marcadores viejos.
export default function WorkloadRedirect() {
  redirect("/performance");
}
