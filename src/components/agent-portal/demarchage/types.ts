// types.ts — formes partagées entre les composants du poste de travail Démarchage.
// Reflètent exactement ce que renvoient `GET /api/agent/tasks` et
// `GET /api/agent/demarchage/company` : un seul endroit à corriger si l'une
// des deux routes change de forme.

import type { ProspectionKind, ProspectionStatus, ProspectionTaskPayload } from "@/components/automations/types";
import type { StageRole } from "@/lib/opportunites/stage-roles";

export type DemarchageContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  email: string | null;
};

export type DemarchageEntrepriseRef = {
  id: number;
  name: string | null;
  ville: string | null;
  telephone: string | null;
};

export type DemarchageSequenceInfo = {
  name: string | null;
  stepLabel: string;
  stepIndex: number | null;
  totalSteps: number;
};

/**
 * Ce que le prospect a fait de sa démo, mesuré par GA4 (cf.
 * src/lib/analytics-radar/site-intent.ts). `null` quand aucun site démo n'est
 * rattaché à l'entreprise, ou quand GA4 n'a rien vu — jamais un score inventé.
 */
export type DemarchageIntent = {
  score: number;
  tier: "none" | "tiede" | "chaud" | "tres_chaud" | "brulant";
  flame: string;
  callWhen: "maintenant" | "aujourdhui" | "j1" | "j2" | "plus_tard";
  reasons: string[];
  sessions: number;
  pageViews: number;
  engagementSec: number;
  lastDay: string | null;
};

export type DemarchageTask = {
  id: string;
  kind: ProspectionKind;
  status: ProspectionStatus;
  title: string | null;
  due_at: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  automation_id: string | null;
  enrollment_id: string | null;
  step_id: string | null;
  payload: ProspectionTaskPayload;
  contact: DemarchageContact | DemarchageContact[] | null;
  entreprise: DemarchageEntrepriseRef | DemarchageEntrepriseRef[] | null;
  sequence: DemarchageSequenceInfo | null;
  intent: DemarchageIntent | null;
};

export type DemarchageQueueMeta = { due_today: number; done_today: number };

export type DemarchagePatchBody = {
  id: string;
  status: ProspectionStatus;
  opportunite_id?: string;
  outcome?: StageRole;
  step_outcome?: string;
  note?: string;
  snooze_until?: string;
};

export type CompanyContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  is_decision_maker: boolean | null;
  linkedin_url: string | null;
};

export type CompanyEntreprise = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web_canonique: string | null;
  siret: string | null;
  owner_id: string | null;
};

export type CompanyDonneesPubliques = {
  entreprise_id: number;
  denomination: string | null;
  date_creation: string | null;
  etat_administratif: string | null;
  naf_code: string | null;
  categorie_entreprise: string | null;
  tranche_effectif_code: string | null;
  tranche_effectif_annee: string | null;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  exercice_annee: number | null;
  dirigeants: unknown[] | null;
} | null;

export type CompanySite = {
  id: string;
  name: string | null;
  published_subdomain: string | null;
  published_domain: string | null;
  is_published: boolean | null;
  build_stage: string | null;
  paywall_enabled: boolean | null;
} | null;

export type CompanyUpcomingBooking = {
  id: string;
  event_title: string;
  start_at: string;
  end_at: string;
  status: string;
  invitee_name: string;
} | null;

export type CompanyBundle = {
  entreprise: CompanyEntreprise;
  donneesPubliques: CompanyDonneesPubliques;
  contacts: CompanyContact[];
  site: CompanySite;
  upcomingBooking: CompanyUpcomingBooking;
};
