import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { urlInstalacion } from "@/lib/slack-routing";
import { paginaSlack } from "@/lib/slack-pagina";

export const dynamic = "force-dynamic";

/**
 * La liga corta que se le manda al admin del cliente: greenlight.runna.agency/slack/<id>.
 * Sólo reenvía a la página de Slack («Add to Slack») con el mismo id de un solo uso; no
 * aparta la liga (eso pasa al regresar de Slack). Liga usada, vencida o inexistente → aviso.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !hasSupabase() || !clientId) {
    return paginaSlack("Liga inválida", "Pide a Rünna una liga nueva.", 404);
  }
  const { data } = await supabaseAdmin().from("slack_instalaciones").select("redirect_uri")
    .eq("id", id).is("usado_at", null).gt("expira_at", new Date().toISOString())
    .maybeSingle<{ redirect_uri: string }>();
  if (!data) return paginaSlack("Esta liga ya se usó o venció", "Pide a Rünna una liga nueva.", 410);
  return Response.redirect(urlInstalacion({ clientId, state: id, redirectUri: data.redirect_uri }), 302);
}
