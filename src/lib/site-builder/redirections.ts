/**
 * Le plan de redirection d'un site qui prend la place d'un ancien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA SAUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le jour où le domaine du client bascule sur notre site, Google connaît encore
 * l'ARBORESCENCE DE L'ANCIEN : `/nos-services.html`, `/index.php?page=contact`,
 * `/blog/2019/chaudiere-a-condensation/`. Ces URLs ont de l'ancienneté, des
 * liens entrants, parfois des positions. Sans plan de redirection elles rendent
 * 404 — et le client perd, en une nuit, ce que son vieux site avait mis dix ans
 * à accumuler. C'est le seul risque réel de la mise en ligne : le design, lui,
 * se corrige le lendemain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES DE CONCEPTION, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. UNE REDIRECTION NE MASQUE JAMAIS UNE PAGE QUI EXISTE. Le plan est saisi à
 *    la main, souvent en masse, et une seule ligne malheureuse
 *    (`/contact → /nous-contacter`) rendrait une page du site inatteignable
 *    sans que rien ne le signale. D'où la garde côté appelant : une règle SANS
 *    query ne s'applique qu'à un chemin qui, sinon, rendrait 404. Les règles
 *    AVEC query (`/?page_id=12`) échappent à cette garde — un chemin servi
 *    portant une query héritée n'est jamais ambigu.
 *
 * 2. LES CHAÎNES SONT APLATIES ICI, PAS CHEZ LE VISITEUR. Un plan écrit en
 *    plusieurs passes finit par contenir A→B et B→C. Servir deux 308 successifs
 *    coûte un aller-retour de plus et dilue le signal côté moteur. On résout
 *    donc la chaîne en mémoire, avec détection de cycle : un plan qui boucle
 *    rend la dernière cible atteinte, jamais une boucle infinie chez le client.
 *
 * 3. LA COMPARAISON EST INSENSIBLE À LA CASSE ET AU SLASH FINAL. Les URLs
 *    d'anciens sites sont recopiées depuis Search Console, un export, un mail —
 *    avec `/Nos-Services.html` ici et `/nos-services.html/` là. Exiger la forme
 *    exacte ne protège de rien et fait échouer des règles justes. Nos propres
 *    slugs sont minuscules et sans slash final : la normalisation ne peut pas
 *    créer de collision de notre côté.
 *
 * Module PUR : aucune dépendance Next ni Supabase, pour que la table de
 * décision soit figée par des tests plutôt que par l'expérience en production.
 */

/** Une ligne du plan. `de` peut porter une query et se terminer par `/*`. */
export interface RegleRedirection {
  /** Chemin d'origine : « /nos-services.html », « /blog/* », « /?page_id=12 ». */
  de: string;
  /** Cible : chemin du nouveau site (« /services ») ou URL absolue. */
  vers: string;
  /** 307 au lieu de 308. À réserver aux bascules qu'on compte défaire. */
  temporaire?: boolean;
}

/** Le verdict rendu à la route publique. */
export interface Redirection {
  /** Cible finale, chaîne aplatie. Relative ou absolue selon la règle. */
  vers: string;
  permanent: boolean;
}

/** Nombre de sauts résolus avant d'abandonner. Au-delà, le plan est fautif. */
const SAUTS_MAX = 5;

/**
 * Le chemin sous sa forme comparable : minuscule, une seule barre, pas de
 * barre finale, jamais vide. `/Nos-Services.html/` et `//nos-services.html`
 * deviennent le même « /nos-services.html ».
 */
export function normaliserChemin(chemin: string | null | undefined): string {
  // Les caractères de contrôle sont retirés AVANT toute autre chose : la valeur
  // finit dans un en-tête `Location`, et un `\r\n` au milieu est une tentative
  // d'injection d'en-tête. Node refuserait l'en-tête — donc une 500 plutôt
  // qu'une faille — mais compter là-dessus, c'est confier notre garde à la
  // couche HTTP d'une plateforme qu'on ne choisit pas.
  let c = (chemin ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!c) return "/";
  // Une URL entière est acceptée : c'est ce qu'on copie depuis Search Console.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(c)) {
    try {
      c = new URL(c).pathname;
    } catch {
      c = c.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") || "/";
    }
  }
  c = c.split("#")[0] ?? c;
  c = c.split("?")[0] ?? c;
  try {
    c = decodeURIComponent(c);
  } catch {
    /* séquence %XX invalide : on garde la forme brute plutôt que de jeter la règle */
  }
  c = c.toLowerCase().replace(/\/{2,}/g, "/");
  if (!c.startsWith("/")) c = `/${c}`;
  if (c.length > 1) c = c.replace(/\/+$/, "");
  return c || "/";
}

/** La query d'une saisie, ou null quand la règle n'en porte pas. */
function queryDe(saisie: string): URLSearchParams | null {
  const i = saisie.indexOf("?");
  if (i === -1) return null;
  const brut = saisie.slice(i + 1).split("#")[0] ?? "";
  if (!brut) return null;
  const params = new URLSearchParams(brut);
  return [...params.keys()].length > 0 ? params : null;
}

/** Une règle prête à être comparée. */
interface RegleCompilee {
  /** Chemin normalisé, sans le `/*` terminal. */
  chemin: string;
  /** Vrai quand la règle couvre tout ce qui est sous `chemin`. */
  joker: boolean;
  query: URLSearchParams | null;
  vers: string;
  /** Vrai quand la cible se termine par `/*` : le reste du chemin est reporté. */
  versJoker: boolean;
  permanent: boolean;
}

/**
 * Une cible absolue, c'est-à-dire http(s) — et RIEN d'autre.
 *
 * La règle était `^[a-z][a-z0-9+.-]*://`, qui accepte n'importe quel schéma :
 * `javascript://x%0aalert(1)` passait pour une URL absolue et partait tel quel
 * en `Location`. Les navigateurs refusent d'exécuter un `javascript:` reçu
 * ainsi, donc ce n'était pas exploitable aujourd'hui — mais c'est une garde qui
 * ne tient que par la clémence du client. Les schémas exotiques (`mailto:`,
 * `data:`, `file:`) n'ont de toute façon aucun sens comme cible de redirection.
 */
function estAbsolue(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Porte un schéma, quel qu'il soit. Sert à REFUSER ce qui n'est pas http(s). */
function porteUnSchema(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url.trim());
}

/** Normalise une cible : absolue telle quelle, relative comme un chemin. */
function normaliserCible(vers: string): { vers: string; versJoker: boolean } {
  const brut = (vers ?? "").trim();
  const versJoker = /\/\*$/.test(brut);
  const sansJoker = versJoker ? brut.replace(/\/\*$/, "") : brut;
  if (estAbsolue(sansJoker)) return { vers: sansJoker.replace(/\/+$/, ""), versJoker };
  // Une cible relative garde sa query si elle en a une — c'est rare mais légitime
  // (« /services?utm_source=ancien-site » n'a aucun sens, « /recherche?q=x » si).
  const [chemin, query] = sansJoker.split("?");
  const normalise = normaliserChemin(chemin);
  return { vers: query ? `${normalise}?${query}` : normalise, versJoker };
}

function compiler(regle: RegleRedirection): RegleCompilee | null {
  const de = (regle?.de ?? "").trim();
  const vers = (regle?.vers ?? "").trim();
  if (!de || !vers) return null;
  // Une cible qui porte un schéma sans être http(s) est écartée, pas réparée :
  // la « réparer » la transformerait en chemin relatif absurde, et l'opérateur
  // croirait sa règle posée. `verifierPlan` le lui dit.
  if (porteUnSchema(vers) && !estAbsolue(vers)) return null;
  const joker = /\/\*$/.test(de.split("?")[0] ?? de);
  const cheminBrut = (de.split("?")[0] ?? de).replace(/\/\*$/, "");
  const chemin = normaliserChemin(cheminBrut || "/");
  const cible = normaliserCible(vers);
  return {
    chemin,
    joker,
    query: queryDe(de),
    vers: cible.vers,
    versJoker: cible.versJoker,
    permanent: regle.temporaire !== true,
  };
}

/**
 * Lit les règles telles qu'elles dorment dans `site_config` (JSONB, donc
 * `unknown`). Tout ce qui n'a pas la forme attendue est ignoré en silence :
 * une ligne mal formée ne doit pas priver le site de TOUTES ses redirections.
 */
export function parseRegles(brut: unknown): RegleRedirection[] {
  if (!Array.isArray(brut)) return [];
  const regles: RegleRedirection[] = [];
  for (const item of brut) {
    if (!item || typeof item !== "object") continue;
    const de = (item as { de?: unknown }).de;
    const vers = (item as { vers?: unknown }).vers;
    if (typeof de !== "string" || typeof vers !== "string") continue;
    if (!de.trim() || !vers.trim()) continue;
    const temporaire = (item as { temporaire?: unknown }).temporaire === true;
    regles.push({ de: de.trim(), vers: vers.trim(), ...(temporaire ? { temporaire: true } : {}) });
  }
  return regles;
}

/**
 * Le plan saisi au clavier, une règle par ligne.
 *
 * Séparateurs acceptés : « → », « -> », « => », une virgule, un point-virgule,
 * une tabulation ou deux espaces. C'est délibérément large : le plan arrive
 * d'un tableur, d'un export Search Console ou d'un mail, et refuser une forme
 * de flèche ferait retaper cent lignes à la main.
 *
 * Un « ! » en fin de ligne marque une redirection temporaire (307).
 */
export function parsePlanTexte(texte: string): { regles: RegleRedirection[]; erreurs: string[] } {
  const regles: RegleRedirection[] = [];
  const erreurs: string[] = [];
  const lignes = (texte ?? "").split(/\r?\n/);

  lignes.forEach((ligneBrute, i) => {
    const ligne = ligneBrute.trim();
    if (!ligne || ligne.startsWith("#")) return;
    const temporaire = /\s!$/.test(ligne) || ligne.endsWith(" !");
    const utile = temporaire ? ligne.replace(/\s*!$/, "").trim() : ligne;

    const parts = utile.split(/\s*(?:→|->|=>|;|,|\t|\s{2,})\s*/).filter(Boolean);
    if (parts.length < 2) {
      // Dernier recours : « /de /vers », séparés par un seul espace.
      const simple = utile.split(/\s+/).filter(Boolean);
      if (simple.length === 2) parts.splice(0, parts.length, ...simple);
    }
    if (parts.length < 2) {
      erreurs.push(`Ligne ${i + 1} : il manque la cible — « ${ligne} »`);
      return;
    }
    if (parts.length > 2) {
      erreurs.push(`Ligne ${i + 1} : plus de deux colonnes, seules les deux premières sont retenues`);
    }
    regles.push({ de: parts[0], vers: parts[1], ...(temporaire ? { temporaire: true } : {}) });
  });

  return { regles, erreurs };
}

/** Le plan rendu au format saisissable, pour rouvrir l'éditeur sur l'existant. */
export function formatPlanTexte(regles: RegleRedirection[]): string {
  return regles.map((r) => `${r.de} → ${r.vers}${r.temporaire ? " !" : ""}`).join("\n");
}

/** Vrai quand toutes les paires de `attendue` sont présentes à l'identique. */
function queryCouvre(attendue: URLSearchParams, recue: URLSearchParams): boolean {
  for (const [cle, valeur] of attendue.entries()) {
    if (recue.get(cle) !== valeur) return false;
  }
  return true;
}

/** La query d'une requête, quelle que soit la forme rendue par la plateforme. */
export function versParams(
  query: string | URLSearchParams | Record<string, string | string[] | undefined> | null | undefined,
): URLSearchParams {
  if (!query) return new URLSearchParams();
  if (query instanceof URLSearchParams) return query;
  if (typeof query === "string") return new URLSearchParams(query.replace(/^\?/, ""));
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(query)) {
    if (valeur === undefined) continue;
    if (Array.isArray(valeur)) valeur.forEach((v) => params.append(cle, v));
    else params.append(cle, valeur);
  }
  return params;
}

export interface OptionsRecherche {
  /**
   * Les chemins que le site sert RÉELLEMENT (`slugsServis`).
   *
   * Porte la garde anti-masquage : sur un chemin servi, seules les règles
   * EXIGEANT une query s'appliquent — une redirection ne masque jamais une page
   * qui existe (règle de conception n°1).
   *
   * C'est une LISTE et pas un booléen sur le seul chemin demandé, parce que la
   * garde doit valoir à CHAQUE saut de la chaîne. Sans ça, une règle inerte
   * — celle dont la source est une page servie, qu'on signale déjà comme
   * inutile — reprenait vie au milieu d'une chaîne et détournait l'arrivée :
   * `/vieux.html → /climatisation` suivi de `/climatisation → /chauffage`
   * envoyait sur `/chauffage`, alors que `/climatisation` existe et se sert
   * parfaitement toute seule. Constaté en sonde, pas déduit.
   */
  cheminsServis?: readonly string[];
}

/** Un seul saut : la première règle qui matche, ou null. */
function unSaut(
  chemin: string,
  params: URLSearchParams,
  compilees: RegleCompilee[],
  pageServie: boolean,
): { vers: string; permanent: boolean } | null {
  const candidates = pageServie ? compilees.filter((r) => r.query) : compilees;

  // 1. Le plus spécifique d'abord : chemin exact + query exigée.
  for (const r of candidates) {
    if (r.joker || !r.query) continue;
    if (r.chemin === chemin && queryCouvre(r.query, params)) {
      return { vers: r.vers, permanent: r.permanent };
    }
  }
  // 2. Chemin exact, sans exigence de query.
  for (const r of candidates) {
    if (r.joker || r.query) continue;
    if (r.chemin === chemin) return { vers: r.vers, permanent: r.permanent };
  }
  // 3. Jokers, du préfixe le plus long au plus court : « /blog/2019/* » passe
  //    avant « /blog/* », sinon l'ordre de saisie déciderait du résultat.
  const jokers = candidates
    .filter((r) => r.joker)
    .sort((a, b) => b.chemin.length - a.chemin.length);
  for (const r of jokers) {
    const prefixe = r.chemin === "/" ? "/" : `${r.chemin}/`;
    if (chemin !== r.chemin && !chemin.startsWith(prefixe)) continue;
    if (r.query && !queryCouvre(r.query, params)) continue;
    const reste = chemin === r.chemin ? "" : chemin.slice(prefixe.length);
    const vers = r.versJoker && reste ? `${r.vers}/${reste}` : r.vers;
    return { vers, permanent: r.permanent };
  }
  return null;
}

/**
 * La redirection à servir pour ce chemin, chaîne aplatie, ou null.
 *
 * `pageServie` porte la garde anti-masquage : voir `OptionsRecherche`.
 */
export function trouverRedirection(
  cheminDemande: string,
  query: string | URLSearchParams | Record<string, string | string[] | undefined> | null | undefined,
  regles: RegleRedirection[],
  opts: OptionsRecherche = {},
): Redirection | null {
  const compilees = regles.map(compiler).filter((r): r is RegleCompilee => r !== null);
  if (compilees.length === 0) return null;

  const params = versParams(query);
  const depart = normaliserChemin(cheminDemande);
  const servis = new Set((opts.cheminsServis ?? []).map((c) => normaliserChemin(c)));

  let courant = depart;
  // `cible` et `permanent` séparés plutôt qu'un objet : dans une boucle, le
  // flux de contrôle de TypeScript garde l'objet à `null` au premier tour et
  // refuse d'en lire un champ.
  let cible: string | null = null;
  let permanent = true;
  const vus = new Set<string>([depart]);

  for (let i = 0; i < SAUTS_MAX; i++) {
    const saut = unSaut(
      courant,
      // Seul le PREMIER saut connaît la query de la requête : une fois redirigé,
      // on ne trimballe pas les paramètres hérités sur la cible.
      i === 0 ? params : new URLSearchParams(),
      compilees,
      servis.has(courant),
    );
    if (!saut) break;
    permanent = permanent && saut.permanent;

    // Cible absolue : on ne peut pas la re-résoudre chez nous, la chaîne s'arrête.
    if (estAbsolue(saut.vers)) {
      cible = saut.vers;
      break;
    }

    const cheminCible = normaliserChemin(saut.vers.split("?")[0] ?? saut.vers);
    // Cycle : on garde la dernière cible atteinte plutôt que d'y renvoyer le
    // visiteur en boucle. Un plan qui boucle est un plan à corriger — mais pas
    // au prix d'un navigateur bloqué.
    if (vus.has(cheminCible)) {
      // On ne FAIT PAS ce dernier saut : il ramène sur un chemin déjà traversé,
      // donc il enverrait le visiteur tourner. On garde la dernière cible saine
      // — et rien du tout quand la chaîne revient à son point de départ, parce
      // qu'alors aucune étape n'est saine.
      if (cheminCible === depart) cible = null;
      break;
    }
    vus.add(cheminCible);
    cible = saut.vers;
    courant = cheminCible;
  }

  const resultat: Redirection | null = cible === null ? null : { vers: cible, permanent };
  if (!resultat) return null;
  // Une redirection vers soi-même n'est pas une redirection.
  if (!estAbsolue(resultat.vers)) {
    const arrivee = normaliserChemin(resultat.vers.split("?")[0] ?? resultat.vers);
    if (arrivee === depart && !params.toString()) return null;
  }
  return resultat;
}

/* ── Relecture du plan ─────────────────────────────────────────────────────── */

export type GraviteDiagnostic = "erreur" | "avertissement";

export interface DiagnosticRedirection {
  gravite: GraviteDiagnostic;
  /** L'index de la règle concernée dans le tableau fourni, -1 si transverse. */
  index: number;
  message: string;
}

/**
 * Relit un plan AVANT de l'enregistrer.
 *
 * L'intérêt est entièrement préventif : ces quatre défauts ne se voient pas à
 * l'œil sur cent lignes, et chacun coûte du trafic sans rien signaler en
 * production — une cible qui 404 transforme la redirection en cul-de-sac, une
 * source déjà servie rend la ligne inerte, une boucle fait deux allers-retours
 * pour rien.
 */
export function verifierPlan(
  regles: RegleRedirection[],
  cheminsServis: readonly string[] = [],
): DiagnosticRedirection[] {
  const diags: DiagnosticRedirection[] = [];
  const servis = new Set(cheminsServis.map((c) => normaliserChemin(c)));
  const vues = new Map<string, number>();

  regles.forEach((regle, index) => {
    const compilee = compiler(regle);
    if (!compilee) {
      const vers = (regle?.vers ?? "").trim();
      diags.push({
        gravite: "erreur",
        index,
        message:
          porteUnSchema(vers) && !estAbsolue(vers)
            ? `Cible refusée : « ${vers} ». Une redirection ne peut viser qu'un chemin du site ou une adresse http(s).`
            : "Règle incomplète : il faut une source et une cible.",
      });
      return;
    }

    const cle = `${compilee.chemin}${compilee.joker ? "/*" : ""}?${compilee.query?.toString() ?? ""}`;
    const deja = vues.get(cle);
    if (deja !== undefined) {
      diags.push({
        gravite: "avertissement",
        index,
        message: `Doublon de la ligne ${deja + 1} : seule la première s'appliquera.`,
      });
    } else {
      vues.set(cle, index);
    }

    if (!estAbsolue(compilee.vers)) {
      const cibleChemin = normaliserChemin(compilee.vers.split("?")[0] ?? compilee.vers);
      if (cibleChemin === compilee.chemin && !compilee.query) {
        diags.push({ gravite: "erreur", index, message: "La source et la cible sont identiques." });
      } else if (servis.size > 0 && !compilee.versJoker && !servis.has(cibleChemin) && !cibleChemin.startsWith("/blog/")) {
        diags.push({
          gravite: "avertissement",
          index,
          message: `La cible « ${cibleChemin} » n'est pas une page servie par ce site — la redirection mènerait à un 404.`,
        });
      }
    }

    if (!compilee.query && !compilee.joker && servis.has(compilee.chemin)) {
      diags.push({
        gravite: "avertissement",
        index,
        message: `« ${compilee.chemin} » est une page du nouveau site : la règle ne s'appliquera pas (une redirection ne masque jamais une page existante).`,
      });
    }
  });

  // Boucles : on rejoue la résolution depuis chaque source.
  regles.forEach((regle, index) => {
    const compilee = compiler(regle);
    if (!compilee || compilee.joker) return;
    const vus = new Set<string>([compilee.chemin]);
    let courant = compilee.chemin;
    for (let i = 0; i < SAUTS_MAX + 1; i++) {
      const saut = unSaut(courant, compilee.query ?? new URLSearchParams(), regles.map(compiler).filter((r): r is RegleCompilee => r !== null), false);
      if (!saut || estAbsolue(saut.vers)) return;
      const cible = normaliserChemin(saut.vers.split("?")[0] ?? saut.vers);
      if (vus.has(cible)) {
        diags.push({ gravite: "erreur", index, message: `Boucle de redirection : ${[...vus, cible].join(" → ")}` });
        return;
      }
      vus.add(cible);
      courant = cible;
    }
  });

  return diags;
}
