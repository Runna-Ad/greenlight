"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Sign out and return to the login screen. Clears the Supabase session cookie. */
export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
