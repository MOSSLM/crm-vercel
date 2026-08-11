/**
 * Types du module « compte rendu de rendez-vous ».
 *
 * Le compte rendu est ancré sur une **entreprise** — la seule entité qui existe
 * toujours, y compris pour un prospect jamais travaillé. Tous les autres liens
 * (rendez-vous planifié, opportunité, contact, appel) sont facultatifs et se
 * remplissent selon le contexte d'ouverture : depuis un RDV du calendrier, ils
 * sont préremplis ; depuis le cockpit sur un appel entrant, ils sont vides.
 */

import type { Form } from '@/types';

/** Par quel canal l'échange a eu lieu. */
export type CanalCompteRendu = 'appel' | 'rdv' | 'visio' | 'terrain' | 'autre';

/** Brouillon = ouvert pendant l'échange, sauvegardé au fil de l'eau. */
export type StatutCompteRendu = 'brouillon' | 'termine';

/** Où on en est avec ce prospect à la fin de l'échange. */
export type IssueCompteRendu =
  | 'interesse'
  | 'a_relancer'
  | 'reflexion'
  | 'pas_interesse'
  | 'injoignable'
  | 'vendu';

export interface CompteRendu {
  id: string;
  entreprise_id: number;
  auteur_id: string;
  form_id: string | null;
  booking_id: string | null;
  opportunite_id: string | null;
  contact_id: string | null;
  call_id: string | null;
  canal: CanalCompteRendu;
  statut: StatutCompteRendu;
  issue: IssueCompteRendu | null;
  titre: string | null;
  /** Réponses au questionnaire : `{ [idQuestion]: valeur }`. */
  reponses: Record<string, unknown>;
  resume: string | null;
  prochaine_etape: string | null;
  date_prochaine_etape: string | null;
  demarre_le: string;
  termine_le: string | null;
  created_at: string;
  updated_at: string;
}

/** Ce qu'on a besoin de savoir d'un compte rendu dans une liste. */
export type CompteRenduListe = CompteRendu & {
  entreprise_nom?: string | null;
  auteur_nom?: string | null;
};

// ─── Contexte entreprise ──────────────────────────────────────────────────────

/**
 * Tout ce que le cockpit affiche quand on choisit une entreprise. Une seule
 * requête serveur : en plein appel, enchaîner cinq allers-retours réseau avant
 * d'avoir le numéro à l'écran n'est pas tenable.
 */
export interface ContexteEntreprise {
  entreprise: EntrepriseCockpit;
  rdvAVenir: RdvCockpit[];
  rdvPasses: RdvCockpit[];
  comptesRendus: CompteRendu[];
  appels: AppelCockpit[];
  notes: NoteCockpit[];
  opportunites: OpportuniteCockpit[];
  liens: LiensCockpit;
}

export interface EntrepriseCockpit {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  telephones: string[];
  email: string | null;
  site_web: string | null;
  google_url: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  logo_url: string | null;
  premiers_tags: string | null;
  owner_id: string | null;
}

export interface RdvCockpit {
  id: string;
  event_title: string;
  start_at: string;
  end_at: string;
  status: string;
  meeting_url: string | null;
  location_text: string | null;
  invitee_name: string | null;
  /** Un RDV passé sans compte rendu est une ligne à rattraper. */
  a_un_compte_rendu: boolean;
}

export interface AppelCockpit {
  id: string;
  direction: string | null;
  disposition: string | null;
  started_at: string | null;
  duration_sec: number | null;
}

export interface NoteCockpit {
  id: number;
  theme: string | null;
  contenu: string | null;
  created_at: string;
}

export interface OpportuniteCockpit {
  id: string;
  name: string | null;
  montant: number | null;
  stage_id: number | null;
  note_base: string | null;
  date_prochain_suivi: string | null;
}

/**
 * Les liens qu'on doit pouvoir ouvrir en un clic pendant l'appel : la fiche
 * Google du prospect, son site actuel, le site démo qu'on lui a fait, son
 * audit, ses lead magnets.
 */
export interface LiensCockpit {
  google: string | null;
  siteActuel: string | null;
  siteDemo: string | null;
  captureDemo: string | null;
  audit: string | null;
  noteAudit: number | null;
  noteAuditDemo: number | null;
  leadMagnets: LienLeadMagnet[];
}

export interface LienLeadMagnet {
  id: string;
  titre: string;
  url: string | null;
  statut: string | null;
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

/** Un formulaire du form builder utilisable comme grille de compte rendu. */
export interface FormulaireCompteRendu {
  form: Form;
  /** Vrai pour celui qu'on propose par défaut. */
  defaut: boolean;
}
