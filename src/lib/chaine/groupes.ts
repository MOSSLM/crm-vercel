/**
 * LES GROUPES DE LA CHAÎNE — où en est chaque fiche, et qui doit agir.
 *
 * POURQUOI CE MODULE EXISTE. Le lot répond à « qui » : il est figé, c'est ce
 * qui rend une mesure reproductible. Il ne répond pas à « où ils en sont »,
 * parce que l'état d'une fiche BOUGE — le lissage lui trouve un site,
 * l'enrichissement lui trouve un logo, et elle change de groupe sans que le lot
 * ait bougé d'une ligne. Le grief, mot pour mot : « j'en crée mais parfois
 * après ça change, le lissage et enrichissement les font faire partie d'un
 * autre groupe etc donc je sais pas trop comment avoir un visu sur ça. »
 *
 * La couverture (`couverture.ts`) compte des PIÈCES par axe — « 206 sans
 * constat ». Elle ne dit pas dans quel état est une fiche, parce qu'une fiche
 * peut manquer de trois pièces à la fois et n'avoir qu'UN prochain geste. Ce
 * module range chaque fiche dans EXACTEMENT UN groupe, celui de son prochain
 * geste. C'est la lecture qui manquait, et c'est la seule qui permette de dire
 * « ce groupe-là, on le met en S1 ».
 *
 * ⚠️ MUTUELLEMENT EXCLUSIFS, ET C'EST TOUT L'INTÉRÊT. Deux groupes qui se
 * recouvrent redonnent le tableau de filtres qu'on cherche justement à
 * remplacer : on additionne les colonnes et on ne retombe pas sur l'effectif.
 * L'ordre de `GROUPES` EST la règle de classement — le premier qui accroche
 * gagne. Le test `groupes.test.ts` tient les deux propriétés.
 *
 * ⚠️ `qui` N'EST PAS DÉCORATIF. Onze des trente-trois bots du registre sont des
 * scripts locaux, et ce n'est pas une dette : Playwright, un profil Chrome
 * persistant, des CAPTCHA. Un écran qui affiche « 156 à faire » sans dire que
 * rien ne les fera avancer avant la prochaine séance au bureau ment par
 * omission. C'est la leçon de `lissage_leads.lieu`, reprise ici.
 *
 * Module PUR : ni base, ni React. La SQL rend des faits, ce fichier rend un
 * verdict. Une règle qui change se change ici, et les deux lecteurs — l'écran
 * et la chaîne de nuit — la suivent du même coup.
 */

/** Qui fait avancer ce groupe. La question que l'écran doit trancher d'un œil. */
export type Acteur =
  /** Un cron ou un trigger s'en charge : il n'y a rien à faire, juste à attendre. */
  | "auto"
  /** Un geste serveur existe — un bouton, une route. Faisable depuis un téléphone. */
  | "serveur"
  /** Exige la machine du bureau : Playwright, Chromium, un profil Chrome. */
  | "local"
  /** Demande un œil. Aucun bot ne tranchera à notre place. */
  | "humain"
  /** Terminé, ou hors chaîne : rien n'est attendu. */
  | "rien";

export type CleGroupe =
  | "metier_de_cote"
  | "a_lisser"
  | "site_inconnu"
  | "sans_site"
  | "a_enrichir"
  | "sans_logo"
  | "fiche_incomplete"
  | "a_fabriquer"
  | "site_a_publier"
  | "sans_vignette"
  | "sans_plaquette"
  | "a_attribuer"
  | "a_inscrire"
  | "garee"
  | "en_sequence"
  | "demarchee";

/** Les trois temps de la chaîne — pour que quinze groupes se lisent en trois blocs. */
export type Voie = "trouver" | "fabriquer" | "demarcher";

export interface Groupe {
  cle: CleGroupe;
  voie: Voie;
  /** Le nom du groupe, tel qu'il s'affiche en tête de colonne. */
  titre: string;
  /** Ce que le groupe contient, en une phrase — l'aide au survol. */
  aide: string;
  /** Le geste qui en fait sortir une fiche, tel qu'il s'écrit sur un bouton. */
  geste: string;
  qui: Acteur;
}

/**
 * LES FAITS, tels que `chaine_du_lot()` les rend. Un fait, jamais un verdict :
 * la base ne sait pas ce qu'est « prête », et si elle le savait il y aurait
 * deux définitions à faire converger.
 */
export interface FaitsFiche {
  /**
   * L'un de ses métiers est mis de côté (`enrichment_tag_settings.demarchable
   * = false`). Aujourd'hui : l'isolation et la menuiserie.
   *
   * ⚠️ LA PRÉSENCE SUFFIT, sans exception « il fait aussi de la clim » : un
   * poseur d'isolation recevrait une démo où son métier PRINCIPAL n'a aucune
   * page, ce qui est pire qu'aucune démo. Et une fiche SANS AUCUN TAG n'est
   * jamais mise de côté — l'absence n'est pas une information tant que
   * l'enrichissement n'est pas passé.
   */
  metier_de_cote: boolean;
  /**
   * `v_entreprises_presence_site.statut_site` : 'present', 'absent', 'inconnu'.
   *
   * ⚠️ ELLE NE REND JAMAIS `null`. Sans constat ET sans colonne, elle rend
   * 'inconnu' — c'est `origine_statut` qui distingue alors les deux, et lire
   * le seul statut confondrait « personne n'a regardé » avec « un outil a
   * cherché sans trancher ». Ce sont les deux populations que
   * `constats_presence` existe pour séparer.
   */
  statut_site: string | null;
  /**
   * D'où vient ce statut : 'constat', 'colonne', 'hote_sans_site', 'aucune'.
   *
   * 'aucune' = jamais regardée. 'colonne' = le CRM porte une URL que personne
   * n'a vérifiée — on la laisse passer à l'enrichissement (l'edge function n'a
   * besoin que d'une URL et DIT quand l'hôte ne répond pas), mais un constat
   * explicite l'emporte toujours sur une colonne.
   */
  origine_statut: string | null;
  /** Le dossier lead magnet est validé (`enrichment_validated`, à défaut `pret_pour_lm`). */
  enrichie: boolean;
  /** Il reste des champs requis pour fabriquer le site (cf. `missingForSite`). */
  champs_manquants: boolean;
  a_logo: boolean;
  /** Un site démo non gabarit existe. */
  site_existe: boolean;
  /** Ce site est publié ou marqué `pret` — la définition partagée par tout le dépôt. */
  site_pret: boolean;
  /** Sa carte de partage est fabriquée (`og_image_url`). */
  a_vignette: boolean;
  /** Un jeton de plaquette est posé. */
  a_plaquette: boolean;
  a_proprietaire: boolean;
  /** Inscrite dans la séquence d'entrée. */
  en_sequence: boolean;
  /**
   * Inscrite, active, mais sans échéance : le régulateur ne la reprendra
   * jamais. Dérivé, jamais stocké — cf. `contenu_du_lot`.
   */
  garee: boolean;
  /**
   * Quelqu'un lui a parlé. `premiere_touche_le` OU une tâche terminée : la date
   * manque sur 3 fiches de toute la base, et la tâche, elle, ne ment pas.
   */
  demarchee: boolean;
}

/**
 * LES QUINZE GROUPES, DANS L'ORDRE DE CLASSEMENT.
 *
 * L'ordre suit la chaîne : on ne fabrique pas un site avant de savoir si le
 * prospect en a déjà un, on ne démarche pas avant d'avoir quelque chose à
 * montrer. Le lire de haut en bas, c'est lire le plan de production.
 */
export const GROUPES: readonly Groupe[] = [
  /* ── Trouver : savoir à qui on parle ──────────────────────────────────── */
  {
    cle: "demarchee",
    voie: "demarcher",
    titre: "Démarchée",
    aide: "Quelqu'un lui a écrit ou l'a appelée. Elle ne retourne jamais dans le stock.",
    geste: "",
    qui: "rien",
  },
  {
    // AVANT TOUT LE RESTE, et ce n'est pas cosmétique : lisser puis enrichir
    // une fiche à qui on ne vendra pas dépense un appel LLM — le poste le plus
    // cher de la chaîne — pour un prospect qu'on écartera au bout.
    cle: "metier_de_cote",
    voie: "trouver",
    titre: "Métier mis de côté",
    aide: "Elle fait de l'isolation ou de la menuiserie. Le gabarit n'a pas de page pour ces services : la démo amputerait son métier principal. Elles reviendront toutes seules le jour où le métier sera rouvert dans les Paramètres.",
    geste: "Rouvrir le métier — Paramètres → tags",
    qui: "rien",
  },
  {
    cle: "a_lisser",
    voie: "trouver",
    titre: "À lisser",
    aide: "Personne n'a encore REGARDÉ si elle a un site, et le CRM n'en porte aucune URL. Ce n'est pas « elle n'en a pas ».",
    geste: "Ouvrir une passe de lissage",
    qui: "serveur",
  },
  {
    cle: "site_inconnu",
    voie: "trouver",
    titre: "Regardée sans conclure",
    aide: "Un outil a CHERCHÉ et n'a pas tranché — ce n'est pas « jamais regardée ». Le reste du chemin demande le poste local.",
    geste: "Relancer le dossier web",
    qui: "local",
  },
  {
    cle: "sans_site",
    voie: "trouver",
    titre: "Vérifié sans site",
    aide: "On a regardé, elle n'en a pas. Hors chaîne tant que le gabarit ne les sert pas.",
    geste: "File à part",
    qui: "rien",
  },
  /* ── Fabriquer : avoir quelque chose à montrer ────────────────────────── */
  {
    cle: "a_enrichir",
    voie: "fabriquer",
    titre: "À enrichir",
    aide: "Elle a un site à lire. L'edge function part toute seule dès que le dossier passe à « prêt ».",
    geste: "Marquer prêt pour le lead magnet",
    qui: "auto",
  },
  {
    cle: "sans_logo",
    voie: "fabriquer",
    titre: "Sans logo",
    aide: "Enrichie, mais l'enrichissement n'a pas trouvé de logo. Sur un grand lot il en trouve beaucoup — le reste se vérifie à l'œil.",
    geste: "Chercher le logo à la main",
    qui: "humain",
  },
  {
    cle: "fiche_incomplete",
    voie: "fabriquer",
    titre: "Fiche incomplète",
    aide: "Logo trouvé, mais un champ requis manque : le site sortirait avec un bloc vide.",
    geste: "Compléter la fiche",
    qui: "humain",
  },
  {
    cle: "a_fabriquer",
    voie: "fabriquer",
    titre: "À fabriquer",
    aide: "Tout est là. Le site se clone depuis le gabarit sans que personne n'intervienne.",
    geste: "Cloner le gabarit Agency",
    qui: "serveur",
  },
  {
    cle: "site_a_publier",
    voie: "fabriquer",
    titre: "Site à publier",
    aide: "Le site existe mais n'est ni publié ni marqué prêt : la plaquette n'a rien à montrer.",
    geste: "Publier le site",
    qui: "serveur",
  },
  {
    cle: "sans_vignette",
    voie: "fabriquer",
    titre: "Vignette en attente",
    aide: "Le cron des cartes de partage passe toutes les heures. Rien à faire, sinon attendre.",
    geste: "",
    qui: "auto",
  },
  {
    cle: "sans_plaquette",
    voie: "fabriquer",
    titre: "Sans plaquette",
    aide: "Le jeton et son lien ne sont pas posés. Coût nul, idempotent, par lot.",
    geste: "Préparer les plaquettes",
    qui: "serveur",
  },
  /* ── Démarcher : la mettre entre les mains de quelqu'un ───────────────── */
  {
    cle: "a_attribuer",
    voie: "demarcher",
    titre: "À attribuer",
    aide: "Prête à être travaillée, mais elle n'appartient à personne.",
    geste: "Attribuer à un agent",
    qui: "serveur",
  },
  {
    cle: "a_inscrire",
    voie: "demarcher",
    titre: "À mettre en séquence",
    aide: "Attribuée, mais aucune inscription : elle ne produira jamais la moindre tâche.",
    geste: "Mettre en séquence 1",
    qui: "serveur",
  },
  {
    cle: "garee",
    voie: "demarcher",
    titre: "Garée",
    aide: "Inscrite, active, sans échéance. Le régulateur ne la reprendra jamais — elle n'attend rien.",
    geste: "Lui reposer une échéance",
    qui: "serveur",
  },
  {
    cle: "en_sequence",
    voie: "demarcher",
    titre: "En séquence",
    aide: "Inscrite et datée. L'horloge s'en occupe.",
    geste: "",
    qui: "auto",
  },
];

const PAR_CLE = new Map<CleGroupe, Groupe>(GROUPES.map((g) => [g.cle, g]));

/** Le groupe d'une clé. Lève plutôt que de rendre `undefined` : une clé inconnue est un bug. */
export function groupe(cle: CleGroupe): Groupe {
  const g = PAR_CLE.get(cle);
  if (!g) throw new Error(`groupe inconnu : ${cle}`);
  return g;
}

/**
 * DANS QUEL GROUPE TOMBE CETTE FICHE.
 *
 * Un seul parcours, de haut en bas, premier qui accroche. Écrit comme une
 * cascade et non comme un tableau de prédicats : la lecture doit se faire dans
 * l'ordre de la chaîne, parce que c'est cet ordre qui est la règle.
 *
 * `demarchee` passe AVANT tout le reste, volontairement. Une fiche déjà touchée
 * ne redescend pas dans le stock parce qu'il lui manque une vignette — c'est
 * exactement la confusion qui renvoyait un prospect en rendez-vous se faire
 * démarcher le lendemain (cf. `aDemarcher` dans le pipeline marketing).
 */
export function classer(f: FaitsFiche): CleGroupe {
  if (f.demarchee) return "demarchee";

  // MIS DE CÔTÉ AVANT TOUT LE RESTE — sauf « déjà démarchée », qui reste au-
  // dessus : ce qui est parti est parti, et le nier ferait rappeler quelqu'un.
  // Le placer ici et pas plus bas évite de lisser puis d'enrichir (un appel LLM,
  // le poste le plus cher) une fiche qu'on écartera de toute façon.
  if (f.metier_de_cote) return "metier_de_cote";

  // Trouver. L'ORIGINE d'abord : c'est elle, et non le statut, qui dit si
  // quelqu'un a seulement regardé.
  if (f.origine_statut == null || f.origine_statut === "aucune") return "a_lisser";
  if (f.statut_site == null) return "a_lisser";
  if (f.statut_site === "inconnu") return "site_inconnu";
  if (f.statut_site === "absent") return "sans_site";

  // Fabriquer. On ne fabrique que pour celles qui ONT un site : c'est de leur
  // site que l'edge function tire le contenu de la démo.
  if (!f.enrichie) return "a_enrichir";
  if (!f.a_logo) return "sans_logo";
  if (f.champs_manquants) return "fiche_incomplete";
  if (!f.site_existe) return "a_fabriquer";
  if (!f.site_pret) return "site_a_publier";
  if (!f.a_vignette) return "sans_vignette";
  if (!f.a_plaquette) return "sans_plaquette";

  // Démarcher.
  if (!f.a_proprietaire) return "a_attribuer";
  if (!f.en_sequence) return "a_inscrire";
  if (f.garee) return "garee";
  return "en_sequence";
}

export interface CompteGroupe {
  cle: CleGroupe;
  n: number;
}

/**
 * Le compte par groupe, TOUS LES GROUPES PRÉSENTS, y compris à zéro.
 *
 * Un groupe absent de la liste se lit comme « pas encore mesuré », un groupe à
 * zéro comme « personne ici ». Les confondre ferait disparaître de l'écran la
 * colonne qui vient de se vider — c'est-à-dire la preuve que le travail a
 * marché.
 */
export function compter(faits: readonly FaitsFiche[]): CompteGroupe[] {
  const par = new Map<CleGroupe, number>(GROUPES.map((g) => [g.cle, 0]));
  for (const f of faits) {
    const cle = classer(f);
    par.set(cle, (par.get(cle) ?? 0) + 1);
  }
  return GROUPES.map((g) => ({ cle: g.cle, n: par.get(g.cle) ?? 0 }));
}

/**
 * Ce sur quoi on peut agir MAINTENANT, sans le bureau ni un œil : les groupes
 * `serveur` non vides, dans l'ordre de la chaîne.
 *
 * C'est ce que la chaîne de nuit consomme, et ce que l'écran met en avant. Les
 * groupes `auto` en sont exclus : un cron s'en occupe, proposer un bouton
 * ferait croire à une action nécessaire.
 */
export function gestesDisponibles(comptes: readonly CompteGroupe[]): CompteGroupe[] {
  return comptes.filter((c) => c.n > 0 && groupe(c.cle).qui === "serveur");
}

/**
 * Ce qui attend le bureau ou un œil — le total par acteur.
 *
 * L'absence doit être productive : savoir qu'il y a 156 lignes qui n'avanceront
 * qu'à la prochaine séance vaut mieux que de les voir dormir dans un total.
 */
export function attentes(comptes: readonly CompteGroupe[]): Record<Acteur, number> {
  const out: Record<Acteur, number> = { auto: 0, serveur: 0, local: 0, humain: 0, rien: 0 };
  for (const c of comptes) out[groupe(c.cle).qui] += c.n;
  return out;
}
