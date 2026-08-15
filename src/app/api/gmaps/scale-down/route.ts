import { proxyToGmaps } from "@/app/api/_lib/gmaps-proxy";
import { withAuth } from "@/app/api/_lib/with-auth";
import { json } from "@/app/api/_lib/respond";
import { scaleDown } from "@/lib/aws/gmaps-ip";

export const runtime = "nodejs";

/**
 * Éteint le service de scraping.
 *
 * ⚠️ CE N'EST PAS le seul endroit qui remet `desiredCount` à 0 — le commentaire
 * qui l'affirmait est faux depuis que le scraper éteint lui-même :
 *   - `GoogleMapsScrape/server.js` : minuteur d'inactivité (`IDLE_SHUTDOWN_MS`,
 *     15 min) réarmé tant qu'un crawl est en vol, et délai de grâce court après
 *     la fin d'un job (`POST_JOB_GRACE_MS`) ;
 *   - `GoogleMapsScrape/autoScaleDown.js` : l'appel ECS proprement dit.
 * Ces deux couches ne dépendent d'aucun navigateur : elles sont la RÉFÉRENCE.
 * Cette route n'est plus qu'un accélérateur appelé par le client quand il quitte
 * un job DÉJÀ TERMINÉ ; l'appeler pendant un crawl tuerait la tâche en vol.
 *
 * Prévenir le conteneur est un bonus (il peut refermer proprement ses
 * navigateurs) mais ne doit jamais empêcher l'extinction : s'il est déjà éteint,
 * ou injoignable, on passe outre. On ne le réveille surtout pas pour ça —
 * `ensureServiceRunning` démarrerait une tâche et attendrait sa stabilisation
 * juste avant de la tuer.
 */
export const POST = withAuth({}, async ({ req, cors }) => {
  let previenu = false;
  try {
    const amont = await proxyToGmaps("/scale-down", {
      method: "POST",
      forwardAuthFromReq: req,
      skipEnsureRunning: true,
    });
    previenu = amont.ok;
    // Le corps doit être consommé (ou annulé) : `proxyToGmaps` renvoie le flux
    // amont tel quel et undici garde la socket ouverte tant qu'il pend. Les
    // routes /crawl et /job font déjà leur `.text()` ; ici on ne lit que le
    // statut, il faut donc vider explicitement.
    await amont.text().catch(() => {});
  } catch {
    // Conteneur déjà éteint / pas de tâche en cours : rien à prévenir.
  }

  await scaleDown();
  return json({ ok: true, conteneurPrevenu: previenu }, { headers: cors });
});
