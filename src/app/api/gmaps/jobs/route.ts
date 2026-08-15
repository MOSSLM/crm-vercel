import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json, jsonError } from "@/app/api/_lib/respond";
import { FileJobsSchema } from "@/lib/gmaps/contract";

export const runtime = "nodejs";

/**
 * La file des recherches : ce qui tourne, et ce qui attend.
 *
 * Le scraper ne traite qu'un crawl à la fois et empile le reste. Jusqu'ici le
 * CRM l'ignorait : lancer une seconde recherche pendant qu'une première tournait
 * donnait un écran muet, alors que la demande était bel et bien enregistrée.
 *
 * ⚠️ `skipEnsureRunning` : cette route ne doit JAMAIS réveiller la machine. Elle
 * est sondée en boucle par l'écran de recherche ; sans ce garde-fou, ouvrir la
 * page suffirait à rallumer le service et à le maintenir allumé indéfiniment.
 */
export const GET = withAuth({}, async ({ req, cors }) => {
  const amont = await proxyToGmaps("/jobs", {
    forwardAuthFromReq: req,
    skipEnsureRunning: true,
  });

  const texte = await amont.text();
  if (!amont.ok) {
    // Service éteint ou injoignable : une file vide, pas une erreur. C'est
    // l'état normal quand aucune recherche n'a été lancée depuis un moment.
    return json({ jobs: [], service: "injoignable" }, { headers: cors });
  }

  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return jsonError("reponse_scraper_illisible", 502, { corps: texte.slice(0, 300) }, cors);
  }

  const file = FileJobsSchema.safeParse(brut);
  if (!file.success) {
    return jsonError("file_scraper_invalide", 502, { details: file.error.flatten() }, cors);
  }
  return json({ jobs: file.data.jobs, service: "joignable" }, { headers: cors });
});
