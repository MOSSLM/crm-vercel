/**
 * AVEC SITE / SANS SITE — et la différence entre « vérifié » et « jamais
 * regardé ». Pur, sans base ni React.
 *
 * POURQUOI TROIS ÉTATS ET NON UN BOOLÉEN
 * Mesuré le 01/09/2026 sur les 60 442 fiches vivantes : 26 124 ont une URL,
 * 74 ont une ABSENCE CONFIRMÉE, et 34 244 n'ont jamais été regardées. Un
 * booléen « a un site » rangerait les 34 244 avec les 74 — c'est-à-dire qu'il
 * annoncerait 34 318 artisans sans site quand on n'en a démontré que 74. Le
 * jour où l'un des 34 244 décroche et répond « j'ai un site », c'est l'accroche
 * entière qui tombe. `constats_presence` existe exactement pour ça
 * (`sql/20260817_constats_presence_trois_etats.sql`), et cet écran le lit.
 *
 * QUELLE DÉFINITION DE « SANS SITE », PUISQU'IL Y EN A DEUX
 * Le CRM en porte deux, volontairement (cf. CLAUDE.md) : chez
 * `chercher_entreprises`, `sans_site` passe par `host_est_generique` — une page
 * Facebook compte comme « pas de site » ; chez l'explorateur, `site=['absent']`
 * lit l'URL en base et les constats. Les fusionner changerait en silence ce que
 * « sans site » veut dire sur les deux écrans à la fois.
 *
 * Ici on lit la SECONDE, celle de `v_entreprises_presence_site` : une URL en
 * base est un site. Conséquence à connaître avant de s'en étonner — au
 * 01/09/2026, quinze tâches de la file portent une URL `facebook.`,
 * `sites.google.com` ou `wixsite.` et comptent donc « avec site ». C'est
 * discutable au téléphone, ce n'est pas discutable dans les données : quelque
 * chose est en ligne, et l'agent le verra en ouvrant la fiche.
 *
 * LE PIÈGE DE LA CHAÎNE VIDE
 * `site_web_canonique` vaut `''` — pas `null` — sur sept tâches de la file, et
 * six d'entre elles portent un constat « absent ». Un `is not null` les
 * rangerait donc « avec site » CONTRE leur propre constat. La vue de référence
 * fait le `nullif(btrim(...), '')` ; ce module aussi, et c'est la seule raison
 * pour laquelle `etatSiteDe` prend l'URL brute plutôt qu'un booléen déjà calculé
 * par l'appelant.
 *
 * CE QUE LA COHORTE NE DIT PAS
 * `cohorte_demarchage` répond à une question voisine et n'est pas une réponse à
 * celle-ci : elle est FIGÉE le jour du démarchage et jamais reprise. Au
 * 01/09/2026, 115 tâches étiquetées `B_sans_site` portent une URL — la cohorte
 * dit ce qu'on croyait en août, `etat_site` dit ce qu'il y a en base
 * aujourd'hui. Les deux filtres coexistent pour cette raison.
 */

/** Les trois états, mot pour mot ceux de `v_entreprises_presence_site`. */
export type EtatSite = "present" | "absent" | "inconnu";

/**
 * L'ordre des pastilles : ce qu'on a, puis les deux façons de ne pas l'avoir.
 * « vérifié » avant « à vérifier » parce que c'est le stock exploitable — celui
 * qu'on peut démarcher en promettant qu'il n'a rien en ligne.
 */
export const ETAT_SITE_ORDER: readonly EtatSite[] = ["present", "absent", "inconnu"] as const;

/** Le libellé de la pastille de filtre — deux mots, la place est comptée. */
export const ETAT_SITE_LABEL: Record<EtatSite, string> = {
  present: "avec site",
  absent: "sans site · vérifié",
  inconnu: "sans site · à vérifier",
};

/**
 * Ce que la ligne de file affiche — et pourquoi ces mots-là.
 *
 * La ligne porte DÉJÀ une étiquette de cohorte qui dit « sans site » : deux
 * étiquettes voisines écrivant les mêmes mots ne se lisent plus (constaté à
 * l'écran en montant le filtre). Celles-ci disent donc la VÉRIFICATION, qui est
 * l'information neuve — la cohorte dit ce qu'on croyait en août, celles-ci
 * disent ce qui a été démontré. Côte à côte, la ligne se lit
 * « sans site · absence vérifiée », et c'est exactement ce qu'on veut savoir.
 *
 * `present` ne s'affiche pas toujours : voir la condition dans `DemRail`, qui
 * ne le sort que face à une cohorte qui prétend l'inverse.
 */
export const ETAT_SITE_TAG: Record<EtatSite, string> = {
  present: "a un site",
  absent: "absence vérifiée",
  inconnu: "jamais vérifié",
};

/** L'infobulle — c'est elle qui empêche de lire « à vérifier » comme « rien ». */
export const ETAT_SITE_AIDE: Record<EtatSite, string> = {
  present: "Une URL est en base : il a quelque chose en ligne.",
  absent:
    "Absence CONFIRMÉE : cherché et non trouvé. C'est le seul cas où on peut lui dire qu'il n'a pas de site.",
  inconnu:
    "Personne n'a encore vérifié. Ce n'est pas « il n'a pas de site », c'est « on ne sait pas » — à ne jamais annoncer au téléphone.",
};

export const estEtatSite = (v: unknown): v is EtatSite =>
  typeof v === "string" && (ETAT_SITE_ORDER as readonly string[]).includes(v);

/**
 * La règle, recopiée de `v_entreprises_presence_site` :
 *   une URL en base fait foi → `present` ;
 *   sinon le dernier constat, s'il y en a un ;
 *   sinon `inconnu`.
 *
 * Un constat « present » sans URL en base reste `present` : le bot a trouvé
 * quelque chose que personne n'a recopié sur la fiche, et ce n'est pas une
 * raison pour aller lui vendre son premier site.
 */
export function etatSiteDe(
  urlCrm: string | null | undefined,
  constat: string | null | undefined,
): EtatSite {
  if ((urlCrm ?? "").trim() !== "") return "present";
  return estEtatSite(constat) ? constat : "inconnu";
}

/**
 * L'URL telle qu'un agent la tape, ramenée à quelque chose qu'on peut écrire en
 * base — ou `null` si ce n'en est pas une.
 *
 * CE QUI EST TOLÉRÉ, ET POURQUOI
 * On saisit cette adresse en écoutant quelqu'un l'épeler au téléphone :
 * « plombier-annecy point fr ». Exiger `https://` ferait rejeter la moitié des
 * saisies pour une raison que l'artisan au bout du fil ne comprendrait pas. Le
 * schéma est donc AJOUTÉ quand il manque, les espaces parasites tombent, et
 * l'hôte est mis en minuscules — deux fiches ne doivent pas différer par une
 * majuscule.
 *
 * CE QUI EST REFUSÉ : tout ce qui n'a pas d'hôte pointé (`plombier`), et tout
 * schéma autre que http/https (`javascript:`, `mailto:`). Une saisie refusée
 * rend `null` et l'appelant répond 400 — écrire une adresse invalide en base
 * coûterait plus cher que la refuser tout de suite : `etat_site` la lirait comme
 * un site, et la fiche sortirait du stock « sans site » sans que rien ne le
 * signale.
 */
export function normaliserUrlSite(saisie: string | null | undefined): string | null {
  const brut = (saisie ?? "").trim().replace(/^["'<]+|["'>]+$/g, "").trim();
  if (!brut || /\s/.test(brut)) return null;

  const avecAutorite = /^[a-z][a-z0-9+.-]*:\/\//i.test(brut);
  // Un schéma SANS `//` (`mailto:`, `tel:`, `javascript:`) n'est pas une adresse
  // de site. Le préfixer de `https://` le ferait passer pour un identifiant
  // d'utilisateur et rendrait un domaine tiré du hasard — refuser est la seule
  // réponse honnête. `exemple.fr:8080` en est exclu : c'est un port, pas un
  // schéma.
  const schemaNu = !avecAutorite && /^[a-z][a-z0-9+.-]*:/i.test(brut) && !/^[^:]+:\d+(\/|$)/.test(brut);
  if (schemaNu) return null;

  let u: URL;
  try {
    u = new URL(avecAutorite ? brut : `https://${brut}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  // Des identifiants dans une adresse de site vitrine : c'est un copier-coller
  // qui a mal tourné, jamais une saisie voulue.
  if (u.username || u.password) return null;
  // Un hôte sans point n'est pas un domaine : « localhost », « plombier », ou
  // le début d'une phrase que quelqu'un a collée par erreur.
  if (!u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
  u.hostname = u.hostname.toLowerCase();
  // `https://exemple.fr/` et `https://exemple.fr` sont la même adresse : sans
  // ça, deux vérifications successives poseraient deux constats différents.
  return u.pathname === "/" && !u.search && !u.hash ? `${u.protocol}//${u.host}` : u.href;
}

/** Combien de lignes portent chaque état — ce que les pastilles annoncent. */
export function countByEtatSite(
  taches: readonly { etat_site?: EtatSite | null }[],
): Record<EtatSite, number> {
  const par: Record<EtatSite, number> = { present: 0, absent: 0, inconnu: 0 };
  for (const t of taches) {
    if (t.etat_site) par[t.etat_site] += 1;
  }
  return par;
}
