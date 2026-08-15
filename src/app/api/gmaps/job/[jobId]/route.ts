import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { JobStatusSchema } from "@/lib/gmaps/contract";

export const runtime = "nodejs";

type Params = { jobId: string };

/**
 * Suivi d'un job de crawl.
 *
 * ⚠️ Le scraper expose `GET /crawl/:jobId`, pas `/job/:jobId` : on appelait une
 * route inexistante, et comme son middleware d'auth est global, elle répondait
 * 401 (jamais 404). Côté navigateur `res.ok` était donc toujours faux, le
 * polling ne s'arrêtait jamais et le service ECS ne redescendait jamais à 0.
 * Le chemin public du CRM reste `/api/gmaps/job/:jobId` (l'autre chantier ajoute
 * aussi un alias `/job/:jobId` côté serveur — ceinture et bretelles).
 */
export const GET = withAuth<undefined, Params>({}, async ({ req, params, cors }) => {
  // Suivi INCRÉMENTAL des points de la carte : le navigateur dit combien il en a
  // déjà, le scraper ne renvoie que la suite. Sans ce curseur, une recherche de
  // 500 fiches réexpédierait 500 points toutes les 3 secondes — et cet écran est
  // justement celui qu'on regarde depuis un mobile. On revalide le paramètre ici
  // plutôt que de relayer la chaîne telle quelle : ce qui part vers le scraper
  // ne doit jamais venir directement de l'URL du navigateur.
  //
  // `Number()` et non `parseInt()` : ce dernier tronque au lieu de refuser
  // (« 1.5 » devenait 1, « 12abc » devenait 12), ce qui laissait passer vers le
  // scraper une valeur que le navigateur n'avait jamais voulu dire.
  const brutDepuis = new URL(req.url).searchParams.get("pointsDepuis");
  const depuis = brutDepuis === null || brutDepuis === "" ? null : Number(brutDepuis);
  const requete =
    depuis !== null && Number.isInteger(depuis) && depuis >= 0
      ? `?pointsDepuis=${depuis}`
      : "";

  const amont = await proxyToGmaps(
    `/crawl/${encodeURIComponent(params.jobId)}${requete}`,
    { forwardAuthFromReq: req },
  );

  const texte = await amont.text();
  if (!amont.ok) {
    return new Response(texte, {
      status: amont.status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return jsonError("reponse_scraper_illisible", 502, { corps: texte.slice(0, 500) }, cors);
  }

  // Le scraper ne réémet pas l'identifiant du job dans son statut ; on le réinjecte
  // depuis l'URL pour que le CONTRAT 2 soit complet côté client.
  const statut = JobStatusSchema.safeParse({
    jobId: params.jobId,
    ...(brut && typeof brut === "object" ? brut : {}),
  });
  if (!statut.success) {
    // Erreur lisible plutôt qu'un `undefined` silencieux qui s'afficherait « 0 ».
    return jsonError(
      "statut_scraper_invalide",
      502,
      { details: statut.error.flatten() },
      cors,
    );
  }

  return json(statut.data, { headers: cors });
});
