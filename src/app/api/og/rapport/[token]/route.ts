import { getServiceClient } from "@/app/api/_lib/service-client";
import { resoudreRapport } from "@/lib/audit-site/rapport";
import { fontStack, loadOgFonts } from "@/lib/og/fonts";
import { publishCard } from "@/lib/og/render-card";
import { RapportCard } from "@/lib/og/rapport-card";

/**
 * GET /api/og/rapport/{token} — la vignette du rapport.
 *
 * Même mécanique que la carte du démo (nom haché, dépôt sur le CDN, redirection),
 * à une différence près : il n'y a pas de colonne où mémoriser l'URL sur la
 * table des jetons, et il n'en faut pas. Le nom du fichier étant un hash du
 * CONTENU, une note qui change produit une URL neuve, et une note inchangée
 * reproduit exactement le même chemin — donc le dépôt est un no-op et le CDN
 * ressert son objet. La persistance est dans le nom.
 *
 * Aucune authentification : la vignette ne montre que ce que la page montre
 * déjà à qui détient le jeton.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOM_AXE: Record<string, string> = {
  vitesse: "Vitesse",
  seo: "SEO",
  mobile: "Mobile",
  conversion: "Contact",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  const sb = getServiceClient();

  const res = await resoudreRapport(sb, token);
  if (!res.ok) return new Response("Rapport introuvable.", { status: 404 });

  const d = res.donnees;
  const fonts = await loadOgFonts();

  const card = await publishCard(sb, {
    prefix: `rapport/${d.entrepriseId}`,
    name: "card",
    element: RapportCard({
      companyName: d.nomEntreprise,
      city: d.content.page1.client_meta || null,
      noteGlobale: d.audit?.note_globale ?? null,
      libelle: d.audit?.libelle ?? null,
      axes: (d.audit?.axes ?? []).map((a) => ({
        id: a.id,
        nom: NOM_AXE[a.id] ?? a.id,
        note: a.note,
      })),
      displayFont: fontStack(fonts, "display"),
      bodyFont: fontStack(fonts, "body"),
    }),
  });

  if (!card.ok) return new Response(card.error, { status: 502 });
  return Response.redirect(card.url, 302);
}
