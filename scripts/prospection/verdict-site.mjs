// verdict-site.mjs — le verdict de présence d'un site, en un seul endroit.
//
// POURQUOI CE FICHIER EXISTE
// Cette règle vivait dans `appliquer-dossiers.mjs`, et elle est juste : elle
// distingue « on a cherché, il n'y en a pas » de « personne n'a cherché », et
// elle refuse d'écrire « absent » sans la preuve qu'une recherche a EU LIEU.
//
// Le lissage depuis l'app avait besoin exactement de la même règle. La
// réécrire ailleurs aurait donné deux définitions de « sans site » — et deux
// définitions finissent toujours par diverger, avec l'inconfort qu'on ne sait
// plus laquelle a produit le chiffre qu'on lit. Elle est donc SORTIE ici, sans
// une virgule de changement, et les deux appelants l'importent.

/**
 * TROIS ÉTATS, PARCE QUE DEUX NE SUFFISENT PAS.
 *
 * `entreprises.canonical_url is null` dit « pas de site » et « on ne sait pas »
 * avec le même silence. La question posée le 17/08 — « comment tu confirmes
 * qu'on a vérifié et qu'elles n'ont aucun site ? » — n'a pas de réponse dans ce
 * modèle : il n'y a rien à écrire pour dire « cherché, rien trouvé ».
 *
 * Le constat le dit, et dit surtout d'où il vient :
 *
 *   présent  une URL a été trouvée, et `valeur` la porte.
 *
 *   absent   CHERCHÉ ET NON TROUVÉ. Deux conditions, toutes les deux
 *            nécessaires : la fiche Google existe et ne déclare aucun site
 *            (l'entreprise elle-même n'en annonce pas), ET une recherche web a
 *            bien eu lieu et n'a rendu que des annuaires. Sans la seconde, on
 *            n'a pas cherché — et sur les 297 fiches de la cohorte B, 59
 *            étaient exactement dans ce cas parce qu'un CAPTCHA avait coupé la
 *            passe web. Les compter « absentes » aurait été un mensonge de
 *            plus, écrit celui-là dans une colonne.
 *
 *   inconnu  tout le reste, et il n'y a pas de honte à l'écrire.
 *
 * La table est APPEND-ONLY : un constat de la semaine dernière n'est pas effacé
 * par celui d'aujourd'hui, il est daté et dépassé. `v_presence_actuelle` rend le
 * dernier. C'est ce qui permet de répondre « depuis quand ? » et « sur quelle
 * preuve ? », pas seulement « quoi ».
 */
export function constatSite(l) {
  const preuve = {
    requete: `${l.nom ?? ""} ${l.ville ?? ""}`.trim(),
    moteur: l.web?.moteur ?? l.moteur,
    resultats: l.web?.resultats ?? l.resultats ?? 0,
    motif: l.motif,
    dossier: l.fichier,
    fiche_google: l.ficheGoogle,
    site_declare_sur_fiche: l.siteSurFiche,
    // Une vitrine de plateforme (artizo.fr, chauffagiste-viessmann.fr) est un
    // site présent, mais qui n'appartient pas à l'artisan. La nuance se perdrait
    // dans un simple « présent ».
    plateforme: l.plateforme ?? false,
  };

  if (l.url) {
    return { etat: "present", valeur: l.url, confiance: l.confiance, preuve };
  }

  // Le CRM détient déjà une URL : le site EXISTE, même si ce passage n'a rien
  // trouvé de neuf. Sans ce cas, une fiche dont la recherche ne rendait que des
  // annuaires était déclarée « absente » alors qu'on avait son adresse en base
  // depuis des mois — un constat qui contredit sa propre table.
  if (l.siteCrm) {
    return {
      etat: "present",
      valeur: l.siteCrm,
      confiance: "moyenne",
      preuve: { ...preuve, pourquoi: "URL déjà en base ; ce passage n'a rien trouvé de plus" },
    };
  }

  // `web` porte le fait qu'une recherche a EU LIEU, même infructueuse — c'est
  // lui, et lui seul, qui autorise à écrire « absent » plutôt qu'« inconnu ».
  const webFouille = Boolean(l.web?.moteur);
  const ficheMuette = l.ficheGoogle && !l.siteSurFiche;

  if (webFouille && ficheMuette) {
    return {
      etat: "absent",
      valeur: null,
      // « Haute » et non « certaine » : on a regardé la première page d'un
      // moteur, pas tout le web. Un site sans aucun référencement existe.
      confiance: "haute",
      preuve: { ...preuve, pourquoi: "fiche Google sans site déclaré + recherche web sans candidat" },
    };
  }
  if (webFouille) {
    return {
      etat: "absent",
      valeur: null,
      // Sans fiche Google, il manque la moitié du faisceau.
      confiance: "moyenne",
      preuve: { ...preuve, pourquoi: "recherche web sans candidat, mais aucune fiche Google pour recouper" },
    };
  }
  return {
    etat: "inconnu",
    valeur: null,
    confiance: "faible",
    preuve: {
      ...preuve,
      pourquoi: ficheMuette
        ? "la fiche Google ne déclare pas de site, mais AUCUNE recherche web n'a été faite"
        : "ni fiche Google exploitable ni recherche web",
    },
  };
}
