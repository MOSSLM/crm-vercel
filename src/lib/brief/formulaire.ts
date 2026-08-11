/**
 * Le questionnaire de reprise, décrit en données.
 *
 * IL EST ICI ET PAS DANS LE COMPOSANT parce qu'il va bouger : on ajoute une
 * question après trois appels où elle a manqué, on retire celle à laquelle
 * personne ne répond jamais. Décrit en données, ce mouvement ne touche ni le
 * rendu, ni la route, ni la base — `site_briefs.reponses` est un jsonb qui ne
 * connaît aucune de ces clés.
 *
 * L'ORDRE DES ÉTAPES EST L'ORDRE D'UNE CONVERSATION, pas celui d'une base de
 * données. On commence par ce qu'un artisan répond sans réfléchir (son nom, son
 * téléphone) et on garde pour la fin ce qui demande une décision (le domaine,
 * le prix, l'acompte). Poser « quel nom de domaine voulez-vous ? » en question 2
 * fait perdre l'appel.
 *
 * AUCUN CHAMP N'EST OBLIGATOIRE, et c'est un choix. Un formulaire qui refuse
 * d'avancer tant qu'une case est vide se remplit mal en parlant : l'agent
 * saute, revient, complète après. `requis` ne bloque donc rien — il alimente
 * seulement le compteur de complétude, qui dit ce qui manquera à la production.
 */

export type TypeChamp = "texte" | "long" | "choix" | "liste" | "oui_non" | "date" | "fichiers";

export interface Champ {
  cle: string;
  label: string;
  /** Phrase à dire au client, telle quelle. Affichée sous le label. */
  souffleur?: string;
  type: TypeChamp;
  /** Valeurs proposées pour `choix`. */
  options?: string[];
  placeholder?: string;
  /** Compte dans la complétude de l'étape. N'empêche jamais d'avancer. */
  requis?: boolean;
  /** Le champ occupe toute la largeur (défaut : demi-largeur). */
  pleineLargeur?: boolean;
}

export interface Etape {
  cle: string;
  titre: string;
  /** Ce que l'étape sert à obtenir, en une phrase, pour l'agent. */
  intention: string;
  champs: Champ[];
}

export const ETAPES: Etape[] = [
  {
    cle: "entreprise",
    titre: "L'entreprise",
    intention:
      "Le nom exact qui ira partout sur le site. C'est la seule étape où une faute se paie sur toutes les pages.",
    champs: [
      {
        cle: "nom_affiche",
        label: "Nom affiché sur le site",
        souffleur: "Vous voulez qu'on affiche quoi exactement, en haut du site ?",
        type: "texte",
        requis: true,
      },
      {
        cle: "raison_sociale",
        label: "Raison sociale",
        souffleur: "Et le nom officiel, celui des devis ?",
        type: "texte",
      },
      {
        cle: "dirigeant",
        label: "Dirigeant",
        souffleur: "C'est vous le gérant ? Vous vous appelez comment, prénom et nom ?",
        type: "texte",
      },
      {
        cle: "forme_juridique",
        label: "Forme juridique",
        type: "choix",
        options: ["Auto-entrepreneur", "EI", "EURL", "SARL", "SAS", "SASU", "Autre"],
      },
      { cle: "siret", label: "SIRET", type: "texte", placeholder: "14 chiffres" },
      {
        cle: "annee_creation",
        label: "Depuis quelle année",
        souffleur: "Vous avez démarré en quelle année ? — ça devient « X ans d'expérience » sur le site.",
        type: "texte",
        placeholder: "2011",
      },
      {
        cle: "effectif",
        label: "Effectif",
        type: "choix",
        options: ["Seul", "2 à 3", "4 à 10", "Plus de 10"],
      },
    ],
  },

  {
    cle: "coordonnees",
    titre: "Joindre et être joint",
    intention:
      "Le téléphone affiché est le premier chiffre d'affaires du site. On vérifie qu'il sonne au bon endroit.",
    champs: [
      {
        cle: "telephone_affiche",
        label: "Téléphone à afficher",
        souffleur: "On met quel numéro sur le site ? Le même que celui-là, ou un autre ?",
        type: "texte",
        requis: true,
      },
      {
        cle: "email_pro",
        label: "Email qui reçoit les demandes",
        souffleur: "Les demandes du formulaire, elles arrivent sur quelle adresse ?",
        type: "texte",
        requis: true,
      },
      {
        cle: "adresse",
        label: "Adresse",
        souffleur: "Vous avez un local, ou vous travaillez de chez vous ? (on peut n'afficher que la ville)",
        type: "long",
        pleineLargeur: true,
      },
      {
        cle: "zone_intervention",
        label: "Zone d'intervention",
        souffleur: "Vous vous déplacez jusqu'où ? Les communes, ou un rayon en kilomètres.",
        type: "long",
        requis: true,
        pleineLargeur: true,
      },
      {
        cle: "horaires",
        label: "Horaires",
        souffleur: "Vous répondez de quelle heure à quelle heure, et le samedi ?",
        type: "long",
        pleineLargeur: true,
      },
      {
        cle: "urgences",
        label: "Urgences / astreinte",
        souffleur: "Vous intervenez en urgence ? La nuit, le week-end ?",
        type: "texte",
      },
      {
        cle: "reseaux",
        label: "Réseaux et fiche Google",
        souffleur: "Vous avez une page Facebook, un Instagram, une fiche Google ?",
        type: "liste",
        placeholder: "Une adresse par ligne",
        pleineLargeur: true,
      },
    ],
  },

  {
    cle: "prestations",
    titre: "Ce qu'il vend",
    intention:
      "Les prestations mises en avant, et surtout celles qu'il ne veut PAS qu'on lui demande.",
    champs: [
      {
        cle: "metier_principal",
        label: "Métier principal",
        souffleur: "Si vous deviez ne dire qu'un mot sur ce que vous faites ?",
        type: "texte",
        requis: true,
      },
      {
        cle: "clientele",
        label: "Clientèle",
        type: "choix",
        options: ["Particuliers", "Professionnels", "Les deux", "Collectivités"],
      },
      {
        cle: "prestations_phares",
        label: "Prestations à mettre en avant",
        souffleur:
          "Sur tout ce que vous faites, qu'est-ce qui rapporte le plus ? On met celles-là devant.",
        type: "liste",
        placeholder: "Une prestation par ligne — 4 à 6 idéalement",
        requis: true,
        pleineLargeur: true,
      },
      {
        cle: "specialite",
        label: "Ce qu'il fait mieux que les autres",
        souffleur: "Vos clients vous rappellent pour quoi, précisément ?",
        type: "long",
        pleineLargeur: true,
      },
      {
        cle: "ne_fait_pas",
        label: "Ce qu'on ne doit PAS lui demander",
        souffleur:
          "Et à l'inverse : il y a des chantiers que vous refusez ? On évitera de les faire remonter.",
        type: "long",
        requis: true,
        pleineLargeur: true,
      },
      {
        cle: "gamme_prix",
        label: "Ordre de prix / panier moyen",
        souffleur: "Un chantier moyen chez vous, c'est quel budget ?",
        type: "texte",
      },
      {
        cle: "devis_gratuit",
        label: "Devis gratuit",
        type: "oui_non",
      },
    ],
  },

  {
    cle: "preuves",
    titre: "Preuves et confiance",
    intention:
      "Ce qui fait qu'un inconnu décroche son téléphone : certifications, assurances, chantiers, avis.",
    champs: [
      {
        cle: "certifications",
        label: "Certifications et qualifications",
        souffleur: "Vous êtes RGE, Qualibat, Qualifelec, autre chose ?",
        type: "liste",
        placeholder: "Une par ligne — RGE, Qualibat 1234, …",
        pleineLargeur: true,
      },
      {
        cle: "assurance_decennale",
        label: "Décennale",
        souffleur: "Vous avez une décennale ? Chez qui ?",
        type: "texte",
      },
      {
        cle: "garanties",
        label: "Garanties proposées",
        souffleur: "Vous garantissez vos travaux combien de temps ?",
        type: "texte",
      },
      {
        cle: "avis_google",
        label: "Avis Google",
        souffleur: "Vous avez des avis en ligne ? Combien, quelle note ?",
        type: "texte",
        placeholder: "4,8 / 5 — 37 avis",
      },
      {
        cle: "realisations",
        label: "Trois chantiers dont il est fier",
        souffleur:
          "Racontez-moi trois chantiers dont vous êtes fier — c'est ce qu'on montrera en photo.",
        type: "long",
        requis: true,
        pleineLargeur: true,
      },
      {
        cle: "marques",
        label: "Marques et partenaires",
        souffleur: "Vous travaillez avec quelles marques ? Les logos rassurent.",
        type: "liste",
        pleineLargeur: true,
      },
    ],
  },

  {
    cle: "contenu",
    titre: "Contenu et visuels",
    intention:
      "Ce qu'on a déjà, ce qu'il faut aller chercher. C'est ce qui décide de la date de livraison.",
    champs: [
      {
        cle: "logo_statut",
        label: "Logo",
        souffleur: "Vous avez un logo en bonne qualité, ou on en fabrique un ?",
        type: "choix",
        options: ["Il l'envoie", "À récupérer sur son ancien site", "À créer", "Pas de logo"],
        requis: true,
      },
      {
        cle: "photos_statut",
        label: "Photos de chantier",
        souffleur:
          "Des photos de vos chantiers, vous en avez sur votre téléphone ? Même non retouchées, ça vaut mieux que des banques d'images.",
        type: "choix",
        options: ["Il envoie les siennes", "À récupérer sur ses réseaux", "Photos génériques", "À planifier"],
        requis: true,
      },
      {
        cle: "fichiers",
        label: "Fichiers déposés",
        souffleur:
          "Envoyez-les-moi sur WhatsApp pendant qu'on est au téléphone, je les mets tout de suite.",
        type: "fichiers",
        pleineLargeur: true,
      },
      {
        cle: "a_changer_du_demo",
        label: "Ce qu'il veut changer sur la démo",
        souffleur:
          "Vous avez vu la démo — qu'est-ce qui ne va pas, ou qui ne vous ressemble pas ?",
        type: "long",
        requis: true,
        pleineLargeur: true,
      },
      {
        cle: "a_garder_du_demo",
        label: "Ce qu'il ne faut surtout pas toucher",
        souffleur: "Et au contraire, qu'est-ce qui vous a plu et qu'on garde tel quel ?",
        type: "long",
        pleineLargeur: true,
      },
      {
        cle: "ton",
        label: "Ton",
        souffleur: "Vous vous adressez à vos clients comment — vous ou tu, sérieux ou proche ?",
        type: "choix",
        options: ["Vouvoiement sobre", "Proche et direct", "Technique", "Haut de gamme"],
      },
    ],
  },

  {
    cle: "site",
    titre: "Le site lui-même",
    intention: "Adresse, boîte mail, formulaire. Les décisions qui demandent un accord explicite.",
    champs: [
      {
        cle: "domaine_existant",
        label: "Domaine déjà possédé",
        souffleur: "Vous avez déjà une adresse de site, même inutilisée ?",
        type: "texte",
        placeholder: "exemple.fr — ou vide",
      },
      {
        cle: "domaine_souhaite",
        label: "Adresse souhaitée",
        souffleur: "On prendrait quelle adresse ? Je vérifie si elle est libre pendant qu'on parle.",
        type: "texte",
        requis: true,
        placeholder: "monentreprise.fr",
      },
      {
        cle: "email_pro_a_creer",
        label: "Créer les adresses email pro",
        souffleur: "Vous voulez une adresse contact@ à votre nom plutôt qu'un gmail ?",
        type: "oui_non",
      },
      {
        cle: "pages_supplementaires",
        label: "Pages en plus de la démo",
        souffleur: "Il manque une page ? Une prestation qui mériterait la sienne ?",
        type: "liste",
        pleineLargeur: true,
      },
      {
        cle: "formulaire_champs",
        label: "Ce qu'il veut savoir dans une demande",
        souffleur:
          "Quand quelqu'un vous contacte, qu'est-ce que vous avez besoin de savoir tout de suite ?",
        type: "long",
        pleineLargeur: true,
      },
      { cle: "rdv_en_ligne", label: "Prise de RDV en ligne", type: "oui_non" },
      { cle: "acces_fournis", label: "Accès fournis (ancien site, domaine, Google)", type: "long", pleineLargeur: true },
    ],
  },

  {
    cle: "vente",
    titre: "Vente et suite",
    intention:
      "Ce qui a été dit sur l'argent et sur la date. À remplir pendant l'appel, jamais après : c'est là qu'on oublie.",
    champs: [
      {
        cle: "offre_retenue",
        label: "Offre retenue",
        type: "choix",
        options: ["Site clé en main (base démo)", "Site sur mesure", "En réflexion", "Refus"],
        requis: true,
      },
      { cle: "prix_convenu", label: "Prix convenu (HT)", type: "texte", placeholder: "490 €", requis: true },
      { cle: "hebergement", label: "Hébergement mensuel", type: "texte", placeholder: "19 €/mois" },
      {
        cle: "moyen_paiement",
        label: "Moyen de paiement",
        souffleur: "Je vous envoie le lien de paiement par SMS, vous réglez quand vous voulez.",
        type: "choix",
        options: ["Lien de paiement (Stripe)", "Virement", "Chèque", "À décider"],
      },
      { cle: "acompte", label: "Acompte", type: "texte" },
      {
        cle: "delai_annonce",
        label: "Délai annoncé au client",
        souffleur: "Je vous livre ça sous quinze jours — ça vous va ?",
        type: "texte",
        requis: true,
      },
      { cle: "date_relance", label: "À relancer le", type: "date" },
      {
        cle: "prochaine_etape",
        label: "Prochaine étape",
        souffleur: "On se rappelle quand, et qui fait quoi d'ici là ?",
        type: "long",
        requis: true,
        pleineLargeur: true,
      },
    ],
  },
];

/** Toutes les valeurs possibles d'une réponse, telles qu'elles sont stockées. */
export type Reponse = string | string[] | boolean | null;
export type Reponses = Record<string, Reponse>;

/** Vrai quand la réponse compte comme remplie (une liste vide ne compte pas). */
export function estRemplie(valeur: Reponse | undefined): boolean {
  if (valeur === undefined || valeur === null) return false;
  if (typeof valeur === "boolean") return true;
  if (Array.isArray(valeur)) return valeur.some((v) => v.trim() !== "");
  return valeur.trim() !== "";
}

/**
 * Avancement d'une étape : rempli / total sur les seuls champs `requis`.
 *
 * On ne compte que les requis parce qu'un compteur qui inclut tout n'atteint
 * jamais 100 % et cesse d'être lu. Les champs `fichiers` sont exclus : leur
 * contenu vit dans le stockage des assets, pas dans les réponses.
 */
export function avancementEtape(etape: Etape, reponses: Reponses): { fait: number; total: number } {
  const requis = etape.champs.filter((c) => c.requis && c.type !== "fichiers");
  return {
    fait: requis.filter((c) => estRemplie(reponses[c.cle])).length,
    total: requis.length,
  };
}

/** Les champs requis encore vides, tous étapes confondues — ce qui manquera à la production. */
export function manquants(reponses: Reponses): Array<{ etape: string; label: string }> {
  return ETAPES.flatMap((e) =>
    e.champs
      .filter((c) => c.requis && c.type !== "fichiers" && !estRemplie(reponses[c.cle]))
      .map((c) => ({ etape: e.titre, label: c.label })),
  );
}
