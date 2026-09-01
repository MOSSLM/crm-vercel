/**
 * L'équipe, telle qu'elle se lit — et ce que les chiffres ne disent PAS.
 *
 * ── MODULE PUR ───────────────────────────────────────────────────────────
 * Ni base, ni React, ni `Date.now()` implicite : `activite_des_agents()` rend
 * des NOMBRES et des DATES, ce fichier en tire des verdicts. La séparation est
 * la même que pour le pourrissement d'une affaire (`opportunites/suivi.ts`), et
 * pour la même raison : un seuil d'équipe change, et il ne doit pas coûter une
 * migration.
 *
 * ── LE PIÈGE PRINCIPAL : `taches_ecartees` N'EST PAS UN GESTE ────────────
 * Quatre chemins de code écrivent `status = 'skipped'`, et deux ne sont pas
 * humains (réattribution d'un contact, canal devenu impossible). Sur les 722
 * lignes écartées au 27/08, 706 sont des tâches d'appel abandonnées EN MASSE
 * quand le canal téléphone a été laissé de côté — pas 706 refus.
 *
 * D'où `ecartees` rendu à part, jamais additionné au travail fait, et
 * `LIBELLE_ECARTEES` qui porte « toutes causes » dans son intitulé. Le jour où
 * la table portera un `ecarte_par`, cette précaution tombera.
 *
 * ── LE SECOND PIÈGE : « AUCUN SIGNE » N'EST PAS « ZÉRO JOUR » ────────────
 * `joursSansSigne` vaut `null` quand la personne n'a JAMAIS rien fait, pas 0.
 * Les confondre ferait passer un compte jamais utilisé pour quelqu'un qui vient
 * de travailler — exactement l'erreur que `jours_sans_echange` a déjà coûtée
 * sur le suivi des opportunités.
 */

/** La ligne brute, telle que PostgREST la rend. */
export interface LigneActivite {
  agent_id: string;
  nom: string | null;
  email: string | null;
  role: string;
  taches_en_attente: number | string;
  taches_en_retard: number | string;
  taches_reportees: number | string;
  taches_faites_jour: number | string;
  taches_faites_7j: number | string;
  taches_faites_total: number | string;
  taches_ecartees: number | string;
  gestes_7j: number | string;
  gestes_total: number | string;
  gestes_par_action: Record<string, number | string> | null;
  dernier_signe: string | null;
}

export interface GesteCompte {
  action: string;
  libelle: string;
  nombre: number;
}

export interface Activite {
  agentId: string;
  nom: string;
  email: string;
  role: "admin" | "freelance";
  file: {
    enAttente: number;
    enRetard: number;
    reportees: number;
  };
  faites: { jour: number; sur7j: number; total: number };
  /** Toutes causes confondues — voir l'en-tête. Jamais un compteur de refus. */
  ecartees: number;
  gestes: { sur7j: number; total: number; parAction: GesteCompte[] };
  dernierSigne: string | null;
  /** `null` = aucun signe, jamais 0. */
  joursSansSigne: number | null;
}

/**
 * Les natures de geste, dans l'ordre du cycle : on qualifie, on enrichit, on
 * fabrique, on valide. Une action inconnue garde sa clé brute plutôt que de
 * disparaître — un écran qui perd des lignes est pire qu'un écran qui affiche
 * un mot technique.
 */
export const LIBELLE_ACTION: Readonly<Record<string, string>> = {
  qualify: "Qualifiées",
  skip: "Écartées à la qualification",
  undo: "Décisions annulées",
  enrich: "Enrichissements lancés",
  validate_enrich: "Données validées",
  create_audit: "Audits créés",
  validate_audit: "Audits validés",
  create_site: "Sites démo créés",
  regenerate_site: "Sites régénérés",
  validate_site: "Sites validés",
  verifier_site: "Sites vérifiés à la main",
  create_plaquette: "Plaquettes préparées",
  // Répondre à un prospect entre deux étapes de séquence est du travail, et
  // c'est du travail qui ne laissait AUCUNE trace : ni tâche bouclée, ni carte
  // fermée. Sans cette ligne, une demi-heure de conversations consignées se lit
  // comme une demi-heure d'inactivité.
  echange_hors_file: "Échanges consignés hors file",
  archive: "Fiches archivées",
};

export const LIBELLE_ECARTEES = "Écartées de la file (toutes causes)";

const ORDRE_ACTIONS = Object.keys(LIBELLE_ACTION);

const nb = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

/** Jours pleins entre deux instants, jamais négatif. */
export const joursDepuis = (iso: string | null, maintenant: Date): number | null => {
  if (!iso) return null;
  const alors = new Date(iso).getTime();
  if (!Number.isFinite(alors)) return null;
  const ecart = maintenant.getTime() - alors;
  return ecart <= 0 ? 0 : Math.floor(ecart / 86_400_000);
};

export function lireActivite(ligne: LigneActivite, maintenant: Date = new Date()): Activite {
  const parAction = Object.entries(ligne.gestes_par_action ?? {})
    .map(([action, n]) => ({
      action,
      libelle: LIBELLE_ACTION[action] ?? action,
      nombre: nb(n),
    }))
    .filter((g) => g.nombre > 0)
    .sort((a, b) => {
      const ia = ORDRE_ACTIONS.indexOf(a.action);
      const ib = ORDRE_ACTIONS.indexOf(b.action);
      // Les actions connues d'abord, dans l'ordre du cycle ; les inconnues à la
      // fin, par fréquence — c'est le seul ordre qui ait un sens pour elles.
      if (ia === -1 && ib === -1) return b.nombre - a.nombre;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  return {
    agentId: ligne.agent_id,
    nom: ligne.nom?.trim() || ligne.email?.split("@")[0] || "Sans nom",
    email: ligne.email ?? "",
    role: ligne.role === "admin" ? "admin" : "freelance",
    file: {
      enAttente: nb(ligne.taches_en_attente),
      enRetard: nb(ligne.taches_en_retard),
      reportees: nb(ligne.taches_reportees),
    },
    faites: {
      jour: nb(ligne.taches_faites_jour),
      sur7j: nb(ligne.taches_faites_7j),
      total: nb(ligne.taches_faites_total),
    },
    ecartees: nb(ligne.taches_ecartees),
    gestes: {
      sur7j: nb(ligne.gestes_7j),
      total: nb(ligne.gestes_total),
      parAction,
    },
    dernierSigne: ligne.dernier_signe,
    joursSansSigne: joursDepuis(ligne.dernier_signe, maintenant),
  };
}

export type EtatEquipier = "aujourdhui" | "cette_semaine" | "en_sommeil" | "jamais";

/**
 * Les seuils. Une semaine, parce que c'est le rythme auquel on se parle : en
 * deçà, quelqu'un peut simplement avoir eu deux jours chargés ailleurs.
 */
export const SEUIL_SOMMEIL_JOURS = 7;

export const classer = (a: Activite): EtatEquipier => {
  if (a.joursSansSigne === null) return "jamais";
  if (a.joursSansSigne === 0) return "aujourdhui";
  return a.joursSansSigne <= SEUIL_SOMMEIL_JOURS ? "cette_semaine" : "en_sommeil";
};

export const LIBELLE_ETAT: Readonly<Record<EtatEquipier, string>> = {
  aujourdhui: "Actif aujourd'hui",
  cette_semaine: "Actif cette semaine",
  en_sommeil: "Sans geste depuis plus d'une semaine",
  jamais: "Aucun geste enregistré",
};

/**
 * L'ordre d'affichage : ce qui demande une attention d'abord.
 *
 * EN SOMMEIL EN PREMIER, et non « le plus actif en premier » : un écran
 * d'équipe sert à repérer qui décroche, pas à féliciter qui travaille — ça, le
 * détail de ses gestes le dit déjà. Un compte jamais utilisé passe en dernier :
 * ce n'est pas quelqu'un qui décroche, c'est un accès qui n'a jamais servi.
 */
const RANG_ETAT: Record<EtatEquipier, number> = {
  en_sommeil: 0,
  cette_semaine: 1,
  aujourdhui: 2,
  jamais: 3,
};

export const trierParAttention = (liste: Activite[]): Activite[] =>
  [...liste].sort((a, b) => {
    const dr = RANG_ETAT[classer(a)] - RANG_ETAT[classer(b)];
    if (dr !== 0) return dr;
    // À état égal, le plus de retard d'abord : c'est le seul chiffre sur lequel
    // un admin peut agir tout de suite (réattribuer, ou repousser).
    return b.file.enRetard - a.file.enRetard;
  });

/** Les totaux de l'équipe. Additionner les files a un sens ; les gestes aussi. */
export const totaux = (liste: Activite[]) =>
  liste.reduce(
    (t, a) => ({
      enAttente: t.enAttente + a.file.enAttente,
      enRetard: t.enRetard + a.file.enRetard,
      faitesJour: t.faitesJour + a.faites.jour,
      gestes7j: t.gestes7j + a.gestes.sur7j,
    }),
    { enAttente: 0, enRetard: 0, faitesJour: 0, gestes7j: 0 },
  );
