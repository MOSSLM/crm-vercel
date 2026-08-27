/**
 * Le vocabulaire du fil d'activité — partagé entre la vue SQL, la route et l'écran.
 *
 * POURQUOI CE FICHIER PLUTÔT QUE DES CHAÎNES EN DUR
 * `vue_fil_activite` normalise neuf sources sur un vocabulaire fermé de canaux.
 * Ce vocabulaire est une décision, pas une donnée : si l'écran filtre sur
 * « whatsapp » et que la vue écrit « WhatsApp », le filtre rend une page vide
 * sans qu'aucune erreur ne se déclenche. On le déclare donc une fois, et les
 * deux bouts s'y accrochent.
 *
 * LA DISTINCTION QUI COMPTE : ÉCHANGE vs TRACE
 * Le fil brut est bruyant, et pas par accident : un simple déplacement de carte
 * dans le pipeline écrit DEUX lignes (`activity_log` et `pipeline_events`), plus
 * une troisième dans `opportunite_etapes_journal`. Trois lignes pour un geste.
 *
 * On ne les déduplique pas — elles disent des choses légèrement différentes, et
 * masquer une source rendrait le fil menteur là où il doit être la référence.
 * On les CLASSE : un « échange » est un contact réel avec un humain (appel,
 * e-mail, SMS, WhatsApp, RDV, note, formulaire), une « trace » est ce que le
 * système a enregistré au passage. L'écran ouvre sur les échanges, parce que
 * c'est la question qu'on se pose en arrivant sur une fiche ; tout reste à un
 * clic.
 */

/** Le vocabulaire fermé produit par `vue_fil_activite.canal`. */
export const CANAUX = [
  "appel",
  "email",
  "sms",
  "whatsapp",
  "linkedin",
  "rdv",
  "note",
  "etape",
  "formulaire",
  "systeme",
] as const;

export type CanalFil = (typeof CANAUX)[number];

/**
 * Les canaux qui témoignent d'un contact avec un humain. Le complément
 * (`etape`, `systeme`) est ce que la machine a noté toute seule.
 */
export const CANAUX_ECHANGE: readonly CanalFil[] = [
  "appel",
  "email",
  "sms",
  "whatsapp",
  "linkedin",
  "rdv",
  "note",
  "formulaire",
];

export const estUnEchange = (canal: string): boolean =>
  (CANAUX_ECHANGE as readonly string[]).includes(canal);

/** Les deux modes de lecture du fil. `echanges` est le défaut de l'écran. */
export type FiltreFil = "echanges" | "tout";

/** Une ligne du fil, telle que la route la rend. */
export type EvenementFil = {
  /** Clé stable : `${source}:${ref}`. Deux sources peuvent porter le même id. */
  cle: string;
  survenu_le: string;
  source: string;
  canal: CanalFil;
  sens: "entrant" | "sortant" | null;
  titre: string;
  detail: string | null;
  opportunite_id: string | null;
  acteur_id: string | null;
  /** Résolu depuis `user_profiles` par la route ; nul si l'acteur est parti. */
  acteur_nom: string | null;
};

export type ReponseFil = {
  evenements: EvenementFil[];
  /**
   * Le curseur de la page suivante — l'horodatage du dernier événement rendu.
   * Nul quand la source est épuisée.
   */
  suite: string | null;
};

/** Libellés d'affichage. Le fil parle français, y compris pour les sources. */
export const LIBELLE_CANAL: Record<CanalFil, string> = {
  appel: "Appel",
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  rdv: "Rendez-vous",
  note: "Note",
  etape: "Étape",
  formulaire: "Formulaire",
  systeme: "Système",
};

/** Le nom de la table d'origine, pour remonter à la ligne quand un fil surprend. */
export const LIBELLE_SOURCE: Record<string, string> = {
  activity_log: "journal d'activité",
  opportunite_etapes_journal: "journal des étapes",
  pipeline_events: "événements pipeline",
  email_logs: "messagerie",
  calls: "téléphonie",
  sms_messages: "SMS",
  prospection_gestes: "gestes de prospection",
  rdv_comptes_rendus: "comptes-rendus",
  form_submissions: "formulaires du site",
};
