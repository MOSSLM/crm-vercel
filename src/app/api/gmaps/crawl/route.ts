import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import {
  CrawlRequestInputSchema,
  CrawlResponseSchema,
  type CrawlRequest,
} from "@/lib/gmaps/contract";

export const runtime = "nodejs";

/**
 * Lance un crawl sur le scraper GoogleMapsScrape.
 *
 * Cette route relayait auparavant le corps BRUT (`await req.text()`), donc le
 * `{ keyword, ... }` envoyé par le formulaire arrivait tel quel à un serveur qui
 * exige `businessTypes` (tableau non vide) et répond 400 sinon : la recherche ne
 * partait jamais. On parse désormais l'entrée et on RÉÉMET le CONTRAT 3
 * (cf. `src/lib/gmaps/contract.ts`), quelle que soit la forme d'origine.
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return jsonError("invalid_body", 400, {}, cors);
  }

  const entree = CrawlRequestInputSchema.safeParse(brut);
  if (!entree.success) {
    return jsonError("invalid_body", 400, { details: entree.error.flatten() }, cors);
  }
  const charge: CrawlRequest = entree.data;

  const amont = await proxyToGmaps("/crawl", {
    method: "POST",
    body: JSON.stringify(charge),
    forwardAuthFromReq: req,
  });

  const texte = await amont.text();
  if (!amont.ok) {
    // On laisse remonter le statut et le message du scraper tels quels : c'est
    // la seule information exploitable pour diagnostiquer (401, 400, 502…).
    return new Response(texte, {
      status: amont.status,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  let chargeAmont: unknown;
  try {
    chargeAmont = JSON.parse(texte);
  } catch {
    return jsonError("reponse_scraper_illisible", 502, { corps: texte.slice(0, 500) }, cors);
  }

  const reponse = CrawlResponseSchema.safeParse(chargeAmont);
  if (!reponse.success) {
    return jsonError(
      "reponse_scraper_invalide",
      502,
      { details: reponse.error.flatten() },
      cors,
    );
  }

  return json(reponse.data, { headers: cors });
});
