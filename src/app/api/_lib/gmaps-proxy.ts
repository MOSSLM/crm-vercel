import { ensureServiceRunning, getCurrentIP } from "@/lib/aws/gmaps-ip";
import { GMAPS_API_TOKEN } from "@/env";

export type ProxyOptions = {
  method?: "GET" | "POST";
  body?: BodyInit | null;
  /** Optional querystring to append (e.g. `?format=csv`). Includes the leading `?`. */
  search?: string;
  /**
   * Forward the original Authorization header so the upstream can attribute the
   * call (le scraper lit le JWT utilisateur dans `Authorization`, cf. ci-dessous).
   */
  forwardAuthFromReq?: Request;
  /**
   * Ne pas réveiller le service avant d'appeler. Indispensable pour /scale-down :
   * démarrer une tâche ECS (et attendre 60 s qu'elle soit stable) pour pouvoir
   * ensuite l'éteindre est exactement la dépense qu'on cherche à éviter.
   */
  skipEnsureRunning?: boolean;
};

const HEADERS_TO_STRIP = ["authorization", "x-api-token", "x-user-auth"] as const;

/**
 * Proxies a request to the gmaps crawler service.
 *
 * Replaces 4 near-identical handlers (crawl, job, results, scale-down) that
 * each duplicated: ensureServiceRunning → getCurrentIP → fetch with the service
 * token + the caller's JWT → strip sensitive response headers.
 *
 * ⚠️ LES DEUX EN-TÊTES ÉTAIENT INVERSÉS. Le middleware d'auth de `server.js` est
 * GLOBAL (il s'exécute avant tout routage, donc même une route inexistante répond
 * 401 avant de répondre 404) et il lit :
 *   - le jeton de service dans `x-api-token: Bearer <API_TOKEN>` (il accepte
 *     aussi `Authorization`, mais l'un des deux suffit à autoriser) ;
 *   - le JWT de l'utilisateur dans `Authorization: Bearer <jwt>`, conservé pour
 *     la seule TRAÇABILITÉ. Il n'ouvre AUCUN contexte utilisateur côté scraper :
 *     `supabase.auth.setAuth` n'existe plus en @supabase/supabase-js v2, l'appel
 *     jetait à chaque requête et son exception était avalée ; il a été supprimé
 *     (cf. la note du middleware dans `GoogleMapsScrape/server.js`). Le client
 *     Supabase du scraper travaille avec la clé service_role.
 * On envoyait exactement l'inverse, d'où un 401 systématique sur tous les appels.
 */
export const proxyToGmaps = async (path: string, opts: ProxyOptions = {}): Promise<Response> => {
  if (!opts.skipEnsureRunning) await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL(`${path}${opts.search ?? ""}`, base);

  const headers: Record<string, string> = {
    // Jeton de service : le serveur fait `x-api-token`.slice(7) après avoir
    // vérifié le préfixe « Bearer », le préfixe est donc obligatoire.
    "x-api-token": `Bearer ${GMAPS_API_TOKEN}`,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.forwardAuthFromReq) {
    const forwarded = opts.forwardAuthFromReq.headers.get("authorization");
    if (forwarded) headers.Authorization = forwarded;
  }

  const upstream = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
  });

  const safeHeaders = new Headers(upstream.headers);
  for (const h of HEADERS_TO_STRIP) safeHeaders.delete(h);

  return new Response(upstream.body, { status: upstream.status, headers: safeHeaders });
};
