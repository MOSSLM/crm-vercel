import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { resolveSite } from "@/lib/site-resolver";
import { parseEnterpriseTags, slugsServis } from "@/lib/site-builder/pages-servies";
import { trouverRedirection } from "@/lib/site-builder/redirections";

/**
 * Le plan de redirection, appliqué à une requête réelle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI ET PAS DANS LE MIDDLEWARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le middleware serait l'endroit naturel — c'est là que vivent les autres
 * redirections — mais il tourne sur l'edge, sur CHAQUE requête de CHAQUE hôte,
 * et n'a pas le droit de consulter la base (cf. l'en-tête de
 * `deciderDestination`). Le plan, lui, est propre à un site et vit dans son
 * instantané de publication. Il est donc appliqué par la route, qui a déjà
 * résolu le site — `resolveSite` est enveloppé dans `cache()`, donc cet appel
 * ne coûte pas une lecture de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE COMPTE : SERVIE D'ABORD, REDIRIGÉE ENSUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * On calcule `pageEstServie` AVANT de chercher une règle, et on le passe à
 * `trouverRedirection`. C'est la garde anti-masquage : une ligne malheureuse
 * dans un plan de cent lignes rendrait sinon une page du site inatteignable,
 * sans que rien ne le signale — ni en base, ni dans les journaux, ni à l'œil.
 * Seule exception, assumée : une règle qui EXIGE une query (`/?page_id=12`)
 * s'applique même sur un chemin servi, parce qu'un permalien hérité n'est
 * jamais ambigu.
 *
 * La cible reste RELATIVE : le visiteur finit sur l'hôte qu'il a demandé. C'est
 * la même décision que le robots.txt par tenant — on ne redirige pas le
 * sous-domaine démo vers le domaine du client, parce que des liens de démo déjà
 * envoyés pointent dessus. C'est aussi ce qui permet de VÉRIFIER un plan sur
 * `{label}.samadigitalstudio.fr` avant de basculer le DNS.
 */
export async function appliquerRedirection(
  segment: string,
  host: string,
  pageSlug: string,
  query?: Record<string, string | string[] | undefined> | null,
): Promise<void> {
  const site = await resolveSite(segment, host);
  // Hôte inconnu ou site dépublié : la route rendra son 404, rien à rediriger.
  if (!site?.redirections?.length) return;

  const instances = (site.publishedInstances ?? []) as Array<{ page_slug: string; is_hidden?: boolean }>;
  // La LISTE des chemins servis, pas seulement le verdict sur celui-ci : la
  // garde anti-masquage doit valoir à chaque saut de la chaîne (cf.
  // `OptionsRecherche`). Même expression de la règle que le rendu et que le
  // sitemap.xml — c'est tout l'objet de `pages-servies.ts`.
  const servis = slugsServis({
    sitemap: site.publishedSitemap,
    instances,
    enterpriseTags: parseEnterpriseTags(site.enterpriseVariables ?? {}),
  });

  const cible = trouverRedirection(pageSlug, query ?? null, site.redirections, { cheminsServis: servis });
  if (!cible) return;

  // `permanentRedirect` émet un 308, `redirect` un 307. Les deux conservent la
  // méthode ; le 308 est l'équivalent permanent que les moteurs suivent en
  // transférant l'ancienneté de l'ancienne URL — c'est tout l'objet du plan.
  if (cible.permanent) permanentRedirect(cible.vers);
  redirect(cible.vers);
}
