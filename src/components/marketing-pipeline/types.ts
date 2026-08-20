/* Shared types for the Marketing & Web pipeline board (mirrors
 * /api/marketing-pipeline/board). Used by the data container
 * (MarketingWebPipeline) and the matrix view (PipelineMatrix). */

import type { Canal } from "@/lib/prospects/canal";
import { motifSortieLabel, sortieARedemarcher } from "@/lib/automations/sortie-sequence";

export interface BoardItem {
  id: string;
  name: string;
  entreprise_id: number | null;
  pipeline_id: string | null;
  company_name: string | null;
  company_url: string | null;
  logo_url: string | null;
  ville: string | null;
  /**
   * LES MÉTIERS DU PROSPECT — `entreprises.service_tags`, normalisé en tableau
   * par l'API (le jsonb porte tantôt un tableau, tantôt une chaîne).
   *
   * C'est la donnée qui manquait pour dire « ceux-là font de l'isolation par
   * l'extérieur, je n'ai pas encore d'offre pour eux » : 8 464 entreprises la
   * portent, et aucun écran ne la lisait.
   *
   * Optionnel : une réponse d'API antérieure au 20/08/2026 ne le porte pas.
   */
  service_tags?: string[];
  /** Fiche Google Business du prospect, quand l'enrichissement Maps l'a trouvée. */
  google_url: string | null;
  google_maps_url: string | null;
  priorite: string | null;
  montant: number | null;
  type: string | null;
  mrr: number | null;
  recurrence_months: number | null;
  tags: string | null;
  enriched: boolean;
  enrichment: { status: string | null; website_url: string | null } | null;
  project: {
    id: string;
    pret_pour_lm: boolean;
    enrichment_validated: boolean;
    statut: string | null;
    enrichment_error: string | null;
    enrichment_attempts: number | null;
  } | null;
  site: {
    id: string;
    name: string | null;
    build_stage: string;
    is_published: boolean;
    url: string | null;
    /** Sous-domaine déployé, ou null quand le site n'est encore qu'un brouillon.
     *  Distinct de `url`, qui vaut null dans ce second cas : c'est ce champ qui
     *  permet à `demoShareUrl` de produire le lien d'aperçu. */
    published_subdomain?: string | null;
    /** Vignette de partage déjà fabriquée, ou null si elle reste à faire. */
    og_image_url?: string | null;
    is_claude_design: boolean;
    /** Template dont le site est issu — absent tant que la migration
     *  `20260730_sites_source_template.sql` n'est pas appliquée, ou pour un
     *  site créé avant elle. */
    template_id?: string | null;
    template_name?: string | null;
  } | null;
  /**
   * `prepare` : une rédaction a eu lieu (`content.page3.avant_apres` non vide).
   *
   * C'est ce qui autorise la validation. Sans lui, « validé » ne dit que
   * « quelqu'un a cliqué » — voir `auditPrepare` dans l'API du tableau.
   */
  audit: { id: string; statut: string; pdf_url: string | null; prepare: boolean } | null;
  /**
   * Note du site actuel, mesurée par l'analyseur.
   *
   * Optionnel : absent tant que `sql/20260810_audit_site.sql` n'est pas
   * appliquée, ou pour une entreprise jamais analysée. La colonne se cache alors
   * plutôt que d'afficher un tiret, parce qu'une fonctionnalité absente ne doit
   * pas ressembler à une donnée manquante.
   */
  note_site?: {
    globale: number;
    libelle: string | null;
    vitesse: number | null;
    seo: number | null;
    mobile: number | null;
    conversion: number | null;
    /** Un axe au moins a été écarté faute de confiance : l'analyse est partielle. */
    partielle: boolean;
  } | null;
  /**
   * Le site DU PROSPECT — trois états, jamais deux.
   *
   * Lu dans `v_entreprises_presence_site`, la même vue que le moteur : un
   * constat l'emporte sur la colonne `canonical_url`, qui ment dans les deux
   * sens (612 lignes seraient « présent » sur sa seule foi, dont 124 ont un
   * constat « absent »). `origine` dit qui a tranché — `constat` vaut mieux que
   * `colonne`.
   *
   * `null` n'est pas un quatrième état à afficher comme les autres : c'est
   * « la vue n'a rien pour cette fiche », donc rien n'a jamais été regardé.
   * Optionnel : absent d'une réponse d'API antérieure au 20/08/2026.
   */
  presence_site?: {
    statut: "present" | "absent" | "inconnu";
    origine: string | null;
    confiance: string | null;
  } | null;
  agent: { id: string; name: string } | null;
  /**
   * Par quoi ce prospect est joignable — entreprise ET contacts confondus.
   * C'est ce qui décide de la séquence : « sans e-mail + mobile » n'est pas
   * démarché comme « e-mail + fixe ».
   *
   * Optionnel : une réponse d'API antérieure à la fonctionnalité ne le porte pas.
   */
  canaux?: Canal[];
  /**
   * L'inscription en séquence de cette ligne — `null` seulement si elle n'a
   * JAMAIS été inscrite.
   *
   * Elle survit à la fin de la séquence : `status` dit si elle court encore
   * (`inscriptionVivante`) ou comment elle s'est terminée. Ne garder que les
   * vivantes renvoyait un prospect qui vient de finir ses relances dans le
   * stock « pas encore en séquence », à démarcher une deuxième fois.
   */
  /**
   * La première fois qu'un geste réel est parti vers ce prospect — appel passé,
   * message envoyé —, posée par `PATCH /api/agent/tasks` quand une tâche est
   * bouclée.
   *
   * C'est la seule trace qui survit à la sortie de séquence : `exit_reason` dit
   * POURQUOI on est sorti, jamais si quelque chose était parti avant.
   *
   * Optionnel : une réponse d'API antérieure au 20/08/2026 ne le porte pas.
   */
  premiereTouche?: string | null;
  sequence?: {
    enrollmentId: string;
    automationId: string;
    name: string;
    status: string;
    holdReason: string | null;
    /**
     * Pourquoi elle s'est fermée, quand c'est une sortie. C'est lui qui décide
     * si le prospect retourne au stock : `hors_canal` veut dire que rien ne lui
     * est jamais parvenu (cf. `src/lib/automations/sortie-sequence.ts`).
     */
    exitReason?: string | null;
  } | null;
  /**
   * La plaquette de ce prospect — le lien nominatif et ce qu'il a fait.
   *
   * PORTÉE PAR L'ENTREPRISE, PAS PAR L'AFFAIRE : `entreprises_rapport_public` est
   * indexée par `entreprise_id`, et deux affaires d'une même entreprise
   * partagent donc le même jeton. C'est voulu — on n'envoie pas deux plaquettes
   * à la même personne parce qu'elle a deux lignes au tableau.
   *
   * Optionnel : absent tant que `sql/20260816_plaquettes_par_prospect.sql` n'est
   * pas appliquée. La colonne se cache alors, plutôt que d'annoncer « aucune
   * plaquette » sur une base qui n'a pas encore de quoi en porter.
   */
  plaquette?: {
    /** L'URL nominative, déjà composée. Null tant qu'aucun jeton n'est frappé. */
    url: string | null;
    cree_le: string | null;
    /** Combien de fois le prospect a ouvert le document. Le signal qui vaut une relance. */
    vues: number;
    vu_le: string | null;
  } | null;
  missing_for_site: string[];
  /**
   * Tickets (notes agent ↔ admin) de la ligne. Optionnel : une réponse d'API
   * antérieure à la fonctionnalité ne le porte pas.
   */
  notes?: NoteSummary | null;
  /**
   * Archivage. Optionnel : une réponse d'API antérieure à la migration
   * `20260809_archivage_motive_et_concurrents.sql` ne les porte pas.
   */
  archived_at?: string | null;
  archive_reason?: string | null;
  archive_note?: string | null;
  column: number;
}

/** Étape visée par un ticket — sert à poser le badge sur la bonne carte. */
export type NoteSubject = "enrichment" | "site" | "audit" | "other";
export type NoteSeverity = "info" | "probleme" | "bloquant";
export type NoteStatus = "open" | "in_progress" | "resolved";

export interface NoteSummary {
  open: number;
  total: number;
  open_subjects: NoteSubject[];
}

export interface NoteMessage {
  id: string;
  author_id: string | null;
  author_name: string;
  author_role: "agent" | "admin";
  body: string;
  created_at: string;
}

export interface Note {
  id: string;
  opportunite_id: string;
  entreprise_id: number | null;
  subject: NoteSubject;
  severity: NoteSeverity;
  title: string;
  status: NoteStatus;
  created_by: string | null;
  created_by_name: string;
  created_by_role: "agent" | "admin";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  company_name: string | null;
  messages: NoteMessage[];
}

export interface TemplateRef {
  id: string;
  name: string;
  is_claude_design: boolean;
}

export interface AgentRef {
  id: string;
  name: string;
}

/**
 * Une séquence proposable, avec le public qu'elle déclare viser.
 *
 * Le tableau CALCULE la suggestion à partir de ces règles ; aucun rapprochement
 * n'est écrit en dur. Une séquence créée demain, avec ses propres cases, entre
 * dans la suggestion sans qu'on retouche le tableau.
 */
export interface SequenceRef {
  id: string;
  name: string;
  status: string;
  requireCanaux: Canal[];
  excludeCanaux: Canal[];
}

/**
 * Une séquence ne DÉMARRE que si elle est activée.
 *
 * Tout le moteur pose la même condition — l'inscription (`handleEnroll`), le
 * ticker (`processSequenceEnrollment` gèle une inscription dont la séquence
 * n'est plus `on`) et le régulateur. Le tableau doit donc dire la même chose :
 * proposer un brouillon sans le nommer envoyait l'inscription contre un 409
 * `sequence_inactive`, sans que rien à l'écran n'explique pourquoi.
 */
export const sequenceLancable = (s: { status: string }): boolean => s.status === "on";

/**
 * Ce qui manque à une séquence pour partir, en clair. `null` quand rien ne
 * manque.
 *
 * « Brouillon », « en pause » et « archivée » ne se réparent pas pareil : le
 * premier n'a jamais été lancé (un bouton Activer suffit), le deuxième a été
 * arrêté volontairement, la troisième a été RANGÉE — la proposer reviendrait à
 * défaire un choix. Les confondre enverrait chercher la mauvaise cause.
 */
export const sequenceEtatLabel = (status: string): string | null =>
  status === "on" ? null : status === "draft" ? "brouillon" : status === "archived" ? "archivée" : "en pause";

/**
 * Une séquence rangée ne se propose plus.
 *
 * Elle reste en base avec ses inscriptions — on lit encore son nom sur les
 * tâches qu'elle a produites — mais elle sort de tout écran où l'on CHOISIT une
 * séquence. Sans quoi archiver n'aurait rien rangé du tout.
 */
export const sequenceArchivee = (s: { status: string }): boolean => s.status === "archived";

/**
 * Une inscription qui travaille encore.
 *
 * `finished`, `replied` et `exited` sont des FINS : la séquence a fait son
 * tour, le prospect a répondu, ou on l'en a sorti. Une ligne dans cet état
 * n'est pas « à inscrire » — elle a déjà été démarchée, et la reproposer au
 * stock est le meilleur moyen de la relancer une deuxième fois.
 */
export const inscriptionVivante = (s: { status: string } | null | undefined): boolean =>
  s?.status === "active" || s?.status === "paused";

/**
 * Cette ligne reste-t-elle à démarcher ?
 *
 * Deux cas s'y retrouvent, et c'est voulu : jamais inscrite, et sortie sans que
 * rien ne parte (canal mort, changement d'agent). Dans les deux cas personne
 * n'a jamais reçu le moindre message — c'est le stock, celui qu'on attribue.
 *
 * Une séquence TERMINÉE, elle, n'en fait pas partie : les relances sont bien
 * parties. C'est la confusion qui renvoyait un prospect passé en rendez-vous
 * se faire démarcher le lendemain.
 */
export const aDemarcher = (item: {
  sequence?: { status: string; exitReason?: string | null } | null;
  premiereTouche?: string | null;
}): boolean => {
  // DÉJÀ TOUCHÉ = PLUS JAMAIS DANS LE STOCK. `premiere_touche_le` est posée
  // quand une tâche est bouclée — un appel passé, un message envoyé. Elle
  // survit à tout : à la fin de la séquence, à la sortie, au changement
  // d'agent. `exit_reason`, lui, dit pourquoi on est sorti et jamais si
  // quelque chose était parti avant.
  //
  // Sans cette ligne, `reattribution` renvoie au stock un prospect qui en
  // était à sa quatrième relance : on lui réenverrait l'accroche. Le cas ne
  // mord pas aujourd'hui (aucune inscription en `reattribution` en base) mais
  // il mordra à la première désattribution — et c'est exactement le genre de
  // faute qu'on ne voit qu'en la lisant chez le prospect.
  if (item.premiereTouche) return false;
  const s = item.sequence;
  return !s || (s.status === "exited" && sortieARedemarcher(s.exitReason));
};

/**
 * Comment une inscription s'est terminée, en clair. `null` si elle court encore.
 *
 * Les trois fins ne se lisent pas pareil : « terminée » veut dire que toutes
 * les relances sont parties sans réponse, « a répondu » qu'il y a quelqu'un au
 * bout du fil, « sortie » qu'on l'a arrêtée (attribution à un agent, archivage,
 * passage en rendez-vous). Les confondre ferait relancer le mauvais prospect.
 */
export const inscriptionFinLabel = (status: string, exitReason?: string | null): string | null =>
  status === "finished"
    ? "séquence terminée"
    : status === "replied"
      ? "a répondu"
      : status === "exited"
        ? motifSortieLabel(exitReason) ?? "sortie de séquence"
        : null;

/** Nom de séquence suffixé de son état, pour les listes déroulantes. */
export const sequenceOptionLabel = (s: { name: string; status: string }): string => {
  const etat = sequenceEtatLabel(s.status);
  return etat ? `${s.name} — ${etat}` : s.name;
};

/**
 * Valeur sentinelle de `onEnroll` : « la séquence que son canal appelle ».
 *
 * Sert aux actions de masse sur un lot mélangé — chaque ligne part vers la
 * séquence dont elle remplit le public, sans qu'on ait à trier le lot d'abord.
 */
export const AUTO_SEQUENCE = "auto";

export interface PipelineRef {
  id: string;
  nom: string;
  is_default: boolean;
}

export interface BoardData {
  items: BoardItem[];
  templates: TemplateRef[];
  agents: AgentRef[];
  /** Optionnel : une réponse d'API antérieure à la colonne « Séquence » ne le porte pas. */
  sequences?: SequenceRef[];
  pipelines: PipelineRef[];
  has_validated_column: boolean;
  /** `false` tant que la migration d'archivage n'est pas jouée : pas de bascule. */
  has_archivage?: boolean;
  /**
   * `false` tant que `sql/20260816_plaquettes_par_prospect.sql` n'est pas jouée.
   * La colonne « Plaquette » disparaît alors entièrement : une colonne qui
   * afficherait « aucune » sur toutes les lignes ferait cliquer pour rien.
   */
  has_plaquette?: boolean;
}

/**
 * Actions de masse, déclenchées depuis la barre de sélection sur toutes les
 * lignes cochées. Chaque action ne reçoit que les lignes pour lesquelles elle a
 * un sens (la barre filtre en amont et affiche ce compte), et tape sur les mêmes
 * fonctions batch que les actions par carte — elles ont toujours pris un tableau.
 */
export interface BulkHandlers {
  onEnrich: (items: BoardItem[], overwrite: boolean) => void;
  /**
   * Ouvre la grille de complétion sur ces lignes. Sert aussi bien la barre de
   * sélection que le bouton de la toolbar, qui lui passe toutes les lignes
   * visibles encore incomplètes — cocher soixante cases avant de commencer
   * n'aurait rien fait gagner.
   */
  onComplete: (items: BoardItem[]) => void;
  onValidateEnrich: (items: BoardItem[]) => void;
  onCreateSites: (items: BoardItem[]) => void;
  /**
   * Refait des sites DÉJÀ existants depuis le template choisi en haut de page.
   *
   * Distinct de `onCreateSites`, qui ne sait traiter que les lignes SANS site :
   * changer de modèle sur un parc déjà construit n'était possible qu'une ligne
   * à la fois. Chaque site garde son id — donc son URL publiée, son audit et
   * son avancement — seules ses pages sont reconstruites.
   */
  onRegenerateSites: (items: BoardItem[]) => void;
  /**
   * Analyse le site ACTUEL des entreprises sélectionnées (pas notre démo) et
   * enregistre les notes. Sert à prioriser le démarchage : on appelle d'abord
   * ceux dont le site est le plus faible, avec les mesures sous les yeux.
   */
  onAnalyserSites: (items: BoardItem[]) => void;
  /** Mesure Google PageSpeed — quarante secondes par site, quota journalier. */
  onMesurerPsi: (items: BoardItem[]) => void;
  /**
   * Retire au sort les photos des sites sélectionnés depuis la médiathèque,
   * selon les services de chaque entreprise.
   *
   * Même tirage que le panneau « Images » de l'éditeur, mais sur tout un lot :
   * ouvrir chaque site pour cliquer le même bouton est ce qui faisait renoncer,
   * et un parc entier restait avec les photos du modèle.
   *
   * À relancer APRÈS une refonte : « Refaire les sites » repart du modèle et
   * jette les retouches d'instance — donc le tirage précédent avec elles.
   */
  onTirerImages: (items: BoardItem[]) => void;
  /**
   * Fabrique à l'avance la vignette de partage des sites sélectionnés.
   *
   * Indispensable AVANT une campagne automatique : une séquence n'ouvre aucun
   * dialogue, et un robot d'unfurl abandonne bien avant qu'une carte soit
   * fabriquée. Sans carte préparée, le lien part en URL nue — et le vide est
   * mis en cache par le destinataire.
   */
  onPreparerVignettes: (items: BoardItem[]) => void;
  onValidateSites: (items: BoardItem[]) => void;
  /**
   * Met les sites sélectionnés en ligne, chacun sur un sous-domaine tiré du nom
   * de l'entreprise.
   *
   * C'est ce qui change l'adresse envoyée au prospect : tant qu'un site n'est
   * pas déployé, son lien de partage est l'identifiant technique
   * (`3f2b…-….samadigitalstudio.fr`) ; publié, il devient
   * `entreprise.samadigitalstudio.fr`, qui se lit et se reconnaît.
   *
   * Vaut aussi pour les sites DÉJÀ en ligne : la page publique sert
   * l'instantané de la dernière publication, donc tout ce qui a été refait
   * depuis — photos comprises — n'y est visible qu'après republication.
   */
  onPublierSites: (items: BoardItem[]) => void;
  onCreateAudits: (items: BoardItem[]) => void;
  onValidateAudits: (items: BoardItem[]) => void;
  /**
   * Prépare une plaquette PAR PROSPECT : un jeton par entreprise, donc une URL
   * par entreprise pour un document strictement identique.
   *
   * C'est le pendant de « Créer les audits » pour la cohorte SANS site : il n'y
   * a rien à mesurer chez elle, donc pas d'audit à rédiger, mais il faut quand
   * même savoir qui ouvre le document — sinon l'étage « document ouvert » de
   * l'entonnoir reste vide pour la moitié de la campagne.
   *
   * Rejouable : une entreprise déjà pourvue garde son jeton, et l'action dit
   * combien ont été créées et combien existaient déjà.
   */
  onCreerPlaquettes: (items: BoardItem[]) => void;
  /**
   * Envoie les lignes cochées dans la file de LISSAGE (Prospection → Lissage) :
   * celle qui va chercher le SIRET, la fiche Google, le site et le RGE.
   *
   * C'est le préalable à l'enrichissement, pas son doublon. Enrichir travaille
   * sur ce que la fiche PORTE ; lisser va chercher ce qu'elle n'a pas. Une
   * fiche sans SIRET n'a rien à donner à l'annuaire ni à l'ADEME — l'enrichir
   * d'abord, c'est enrichir du vide.
   *
   * Absent en mode agent : le lissage dépense des appels d'API sur le parc,
   * c'est une décision d'admin.
   */
  onLisser?: (items: BoardItem[]) => void;
  /**
   * Déduit les chiffres clés (années d'expérience, installations, clients) de
   * la DATE DE CRÉATION au registre, sans aucun appel ni crédit d'IA.
   *
   * C'est la variable qui manque le plus après un enrichissement — 564 dossiers
   * sur 882 au 20/08 — alors que 352 d'entre eux portent déjà la date en base.
   * Ne remplit que les cases vides, et jamais les chiffres confirmés par le
   * client. Les fiches sans date relèvent du lissage, pas de ce bouton.
   */
  onCompleterChiffres?: (items: BoardItem[]) => void;
  /** Absent en mode agent : l'attribution ne fait pas partie de son pipeline. */
  onAssign?: (items: BoardItem[], agentId: string) => void;
  /**
   * Inscrit un lot dans une séquence. `automationId` vaut `"auto"` pour
   * « celle que son canal appelle » : chaque ligne part alors vers la séquence
   * qui correspond à ses canaux, ce qui permet de traiter un lot mélangé sans
   * le trier à la main d'abord.
   */
  onEnroll?: (items: BoardItem[], automationId: string) => void;
  onMove: (items: BoardItem[], pipelineId: string) => void;
  /**
   * Archive les lignes cochées. `kind` distingue « la fiche entreprise, et ses
   * opportunités avec elle » de « cette opportunité seule ».
   */
  onArchive: (items: BoardItem[], kind: "entreprise" | "opportunite") => void;
}

/** Per-item action callbacks the matrix cells invoke (bound to real handlers). */
export interface MatrixHandlers {
  onEnrich: (item: BoardItem) => void;
  onValidateEnrich: (item: BoardItem) => void;
  onCreateSite: (item: BoardItem) => void;
  onRegenerateSite: (item: BoardItem) => void;
  onValidateSite: (item: BoardItem) => void;
  onCreateAudit: (item: BoardItem) => void;
  onValidateAudit: (item: BoardItem) => void;
  /** Absent en mode agent : l'attribution ne fait pas partie de son pipeline. */
  onAssign?: (item: BoardItem, agentId: string) => void;
  /** Inscrit cette ligne dans une séquence, depuis la cellule « Séquence ». */
  onEnroll?: (item: BoardItem, automationId: string) => void;
  onMove: (item: BoardItem, pipelineId: string) => void;
  onDetails: (item: BoardItem) => void;
  /**
   * Ouvre le panneau des tickets de la ligne. `subject` pré-remplit l'étape
   * concernée quand on arrive depuis une carte (site, audit…).
   */
  onNotes: (item: BoardItem, subject?: NoteSubject) => void;
  /**
   * Archive cette ligne. `kind` distingue « la fiche entreprise, et ses
   * opportunités avec elle » de « cette opportunité seule ».
   */
  onArchive: (item: BoardItem, kind: "entreprise" | "opportunite") => void;
  /** Sort la ligne des archives — proposé à la place quand elle y est déjà. */
  onUnarchive: (item: BoardItem) => void;
}
