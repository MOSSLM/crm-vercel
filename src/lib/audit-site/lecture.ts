import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxeId, Confiance, ConstatGoogle, Preuve, SignauxSite } from "./types";
import { libelleDeNote, noteDepuisPreuves } from "./score";
import { baseDocument, noteDocument } from "./malus";
import { psiEstFraiche } from "./pagespeed";

/**
 * Lire une analyse, et savoir dire « pas disponible » sans faire croire à une
 * panne.
 *
 * La table `entreprises_audit_site` est neuve et les migrations s'appliquent à
 * la main : sur un environnement en retard, elle n'existe pas. La différence
 * entre « la table manque » et « le site du prospect est cassé » compte
 * énormément pour l'opérateur, qui n'a pas accès aux logs — d'où le
 * `{ disponible: false }` explicite plutôt qu'une erreur générique.
 *
 * C'est aussi ici qu'est appliquée la règle de publication : un axe en
 * confiance faible n'est PAS renvoyé au client, quel que soit l'appelant. La
 * régler au niveau de la lecture évite qu'un futur écran l'oublie.
 */

/** Postgres `undefined_table`. */
export const UNDEFINED_TABLE = "42P01";

/**
 * Ce qui peut être publié comme axe.
 *
 * Plus large que `AxeId` : quand Google a mesuré, ce sont SES catégories qu'on
 * affiche, et deux d'entre elles n'ont pas d'équivalent maison. Notre analyseur
 * ne sait pas juger l'accessibilité réelle ni les bonnes pratiques — il lit du
 * HTML, il n'exécute rien.
 */
export type AxePublieId =
  | AxeId
  | "accessibilite"
  | "bonnes_pratiques"
  /**
   * Ce que ni notre analyseur ni Lighthouse ne savent juger.
   *
   * `contenu` : combien de pages, quels métiers décrits, des avis affichés, des
   * photos de chantier, une date récente. C'est l'axe qui répond au site vide
   * qui charge vite — PageSpeed récompense le vide, ce comptage le sanctionne.
   *
   * `netlinking` : combien de sites pointent vers celui-ci. Il ne se répare pas
   * en achetant une vitrine, et c'est assumé : il fonde une offre SEO
   * optionnelle, pas une promesse de la colonne « Après ».
   */
  | "contenu"
  | "netlinking";

export interface AxePublie {
  id: AxePublieId;
  note: number;
  confiance: Confiance;
  /** Uniquement les preuves réellement mesurées : les autres n'existent pas. */
  preuves: Preuve[];
  /**
   * Vrai quand la note vient de PageSpeed Insights et non de notre analyseur.
   * La page l'affiche alors avec la mention « mesuré par Google » — qui vaut
   * caution auprès du prospect, et qu'on ne peut donc pas revendiquer à tort.
   */
  mesureGoogle?: boolean;
  /** Ce que Google relève sur cet axe, dans ses mots. Vide hors mesure Google. */
  constats?: ConstatGoogle[];
}

export interface AuditLu {
  entreprise_id: number;
  url_analysee: string | null;
  url_finale: string | null;
  http_status: number | null;
  bloque: boolean;
  injoignable: boolean;
  /**
   * La note du TRI, la nôtre, sur tout le parc. Sert à classer, jamais à montrer.
   */
  note_globale: number | null;
  /**
   * La note du DOCUMENT : celle de Google, moins ce que Google ne voit pas.
   *
   * `null` tant que PageSpeed n'a pas mesuré — et c'est le pendant de la
   * décision de ne plus publier nos axes vitesse et mobile sans lui. On ne
   * publie pas au prospect un chiffre qu'on n'a pas mesuré.
   */
  note_document: number | null;
  /** La base Google avant ajustement, pour montrer la soustraction. */
  note_document_base: number | null;
  /** Chaque point retiré, avec sa raison. C'est la démonstration. */
  note_document_malus: Array<{ libelle: string; points: number }>;
  libelle: string | null;
  /** Axes publiables — ceux en confiance faible en sont retirés. */
  axes: AxePublie[];
  /** Axes écartés, nommés : l'opérateur doit savoir POURQUOI c'est plus court. */
  axes_masques: AxePublieId[];
  issue_keys: string[];
  /**
   * Ce que Lighthouse relève, trié par gain. Vide quand aucune mesure Google n'a
   * été faite — ou quand elle a plus de trente jours : un constat périmé sur un
   * site refait entre-temps est une affirmation fausse, et une seule suffit à
   * discréditer le reste du rapport.
   */
  constats_google: ConstatGoogle[];
  /**
   * Ce que l'agent a relevé lui-même, dans le cadre de `lib/audit/observations`.
   *
   * Typé `unknown[]` ici et non `ObservationValidee[]` : `lecture` appartient à
   * `audit-site`, qui ne doit pas dépendre de `audit`. La forme est garantie à
   * l'écriture par `validerObservations` — c'est le seul chemin qui remplit
   * cette clé — et retypée à la lecture par `construireMesures`.
   */
  observations: unknown[];
  alertes: string[];
  ttfb_ms: number | null;
  chargement_ms: number | null;
  poids_octets: number | null;
  capture_url: string | null;
  note_globale_demo: number | null;
  analyse_le: string | null;
  psi_performance: number | null;
  psi_recupere_le: string | null;
}

export type LectureAudit =
  | { disponible: true; audit: AuditLu | null }
  | { disponible: false; motif: string };

export async function lireAudit(
  sb: SupabaseClient,
  entrepriseId: number,
): Promise<LectureAudit> {
  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { disponible: false, motif: "sql/20260810_audit_site.sql n'est pas appliquée." };
    }
    return { disponible: false, motif: error.message };
  }
  if (!data) return { disponible: true, audit: null };

  return { disponible: true, audit: versAuditLu(data as Record<string, unknown>) };
}

/** Plusieurs entreprises d'un coup — pour le pipeline, qui affiche des lignes. */
export async function lireAudits(
  sb: SupabaseClient,
  entrepriseIds: number[],
): Promise<Map<number, AuditLu> | null> {
  if (entrepriseIds.length === 0) return new Map();
  const { data, error } = await sb
    .from("entreprises_audit_site")
    .select("*")
    .in("entreprise_id", entrepriseIds);

  // null ⇒ « indisponible », que l'appelant traduit en badge caché.
  if (error) return null;

  const out = new Map<number, AuditLu>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const lu = versAuditLu(row);
    out.set(lu.entreprise_id, lu);
  }
  return out;
}

function versAuditLu(row: Record<string, unknown>): AuditLu {
  const detail = (row.detail ?? {}) as Partial<Record<AxeId, Preuve[]>> & {
    google?: ConstatGoogle[];
    observations?: unknown[];
  };
  const confiance = (row.confiance ?? {}) as Partial<Record<AxeId, Confiance>>;

  /**
   * COHABITATION DES DEUX VITESSES — la règle, écrite une seule fois.
   *
   * Quand une mesure PageSpeed est fraîche, elle REMPLACE la note vitesse
   * maison. Jamais les deux côte à côte : une page qui affiche « vitesse 64 »
   * et « performance Google 31 » se contredit sous les yeux du prospect, et
   * c'est la crédibilité de tout le rapport qui part avec.
   *
   * Le remplacement se fait ici, au point de lecture, pour que ni la page
   * publique ni le badge CRM n'aient à trancher — donc pour qu'ils ne puissent
   * pas trancher différemment.
   */
  const psiFraiche = psiEstFraiche(str(row.psi_recupere_le));
  const psiPerf = num(row.psi_performance);

  /**
   * Une mesure Google est exploitable dès qu'UNE catégorie est rendue.
   *
   * Cette condition portait auparavant sur la seule performance, ce qui liait le
   * sort des trois autres à la plus fragile : Lighthouse échoue sur la
   * performance bien plus souvent que sur le référencement ou l'accessibilité —
   * un site trop lent pour finir de charger, justement.
   */
  const psiUtilisable =
    psiFraiche &&
    (psiPerf != null ||
      num(row.psi_seo) != null ||
      num(row.psi_accessibilite) != null ||
      num(row.psi_bonnes_pratiques) != null);

  /**
   * La popularité n'a PAS de colonne dédiée, et c'est voulu.
   *
   * Sa note se recalcule depuis ses preuves stockées dans `detail`. Ajouter une
   * colonne aurait fait dépendre tout l'écrit d'une migration appliquée à la
   * main : un `upsert` qui nomme une colonne absente échoue ENTIÈREMENT, et
   * c'est exactement la panne déjà vécue avec `paywall_enabled`. Ici, migration
   * ou pas, l'axe apparaît dès que ses preuves sont là.
   */
  const google = psiUtilisable && Array.isArray(detail.google) ? detail.google : [];
  const constatsDe = (categorie: string) => google.filter((c) => c.categorie === categorie);

  const axes: AxePublie[] = [];
  const masques: AxePublieId[] = [];

  /** Un axe n'est publié que s'il a une note ET assez de confiance. */
  const publier = (a: AxePublie | null, id: AxePublieId) => (a ? axes.push(a) : masques.push(id));

  const axeGoogle = (
    id: AxePublieId,
    note: number | null,
    categorie: string,
    preuves: Preuve[] = [],
  ): AxePublie | null =>
    note == null
      ? null
      // Confiance haute sans condition : la mesure vient d'un vrai navigateur.
      // Notre réserve — « c'est peut-être une SPA » — n'a plus lieu d'être quand
      // le JavaScript a réellement été exécuté.
      : { id, note, confiance: "haute", preuves, mesureGoogle: true, constats: constatsDe(categorie) };

  /**
   * Les axes SANS COLONNE DÉDIÉE se recalculent depuis leurs preuves stockées.
   *
   * `popularite` avait déjà ce traitement ; `contenu` l'hérite pour la même
   * raison, et elle est concrète : un `upsert` qui nomme une colonne absente
   * échoue ENTIÈREMENT, et les migrations s'appliquent ici à la main. Faire
   * dépendre l'écriture de toute une ligne d'une migration non passée, c'est la
   * panne déjà vécue avec `paywall_enabled`. Recalculées à la lecture, ces notes
   * apparaissent dès que leurs preuves sont là, migration ou pas.
   */
  const SANS_COLONNE = new Set<AxeId>(["popularite", "contenu"]);

  const axeMaison = (id: AxeId): AxePublie | null => {
    const note = SANS_COLONNE.has(id)
      ? noteDepuisPreuves(detail[id] ?? [])
      : num(row[`note_${id}`]);
    const conf = confiance[id] ?? "faible";
    // La règle, à un seul endroit : sous le seuil de confiance, l'axe n'est pas
    // publié. Le griser reviendrait à publier le chiffre en le décorant.
    if (note == null || conf === "faible") return null;
    return {
      id,
      note,
      confiance: conf,
      preuves: (detail[id] ?? []).filter((p) => p.verdict !== "inconnu" && p.valeur !== null),
    };
  };

  const psiAccessibilite = num(row.psi_accessibilite);

  if (psiUtilisable) {
    /**
     * GOOGLE A MESURÉ : ON S'EFFACE, CATÉGORIE PAR CATÉGORIE.
     *
     * Nos notes ne sont plus publiées là où Google a rendu la sienne. Ce n'est
     * pas de la modestie : les nôtres se discutent, celles de Google se vérifient
     * en trente secondes sur pagespeed.web.dev, devant le prospect, depuis son
     * téléphone. Une note qu'on peut nous opposer vaut moins que la même note que
     * le prospect peut opposer à son prestataire actuel.
     *
     * Et elles sont surtout PLUS JUSTES. Notre `ttfb` chronomètre la réponse du
     * serveur — le premier octet. Un serveur prompt qui sert ensuite une page
     * injouable passe pour rapide chez nous : c'est ainsi qu'un site noté 70/100
     * mettait 18,6 secondes à afficher son contenu. Le temps d'affichage réel, le
     * LCP, exige d'exécuter le JavaScript et de charger les images — seul Google
     * le fait.
     *
     * CHAQUE CATÉGORIE EST INDÉPENDANTE, et ça n'a rien de théorique : sur une
     * entreprise réelle, Lighthouse a rendu le référencement, l'accessibilité et
     * les bonnes pratiques mais échoué sur la performance. Tout conditionner au
     * bloc performance faisait alors retomber le document sur nos cinq axes
     * maison TOUT EN affichant les quinze constats de Google — la page méthode
     * annonçait « mesuré avec notre analyseur » au-dessus de constats qui
     * venaient d'ailleurs. Et on perdait une accessibilité à 29/100 sur un site
     * où nous ne voyions rien d'anormal.
     *
     * L'axe `mobile` ne disparaît que si l'accessibilité le REMPLACE réellement.
     * Elle dit la même chose en mieux — cibles tactiles, contrastes, tailles de
     * police — mais seulement quand elle est là.
     */
    publier(axeGoogle("vitesse", psiPerf, "performance", preuvesPsi(row)) ?? axeMaison("vitesse"), "vitesse");
    publier(axeGoogle("seo", num(row.psi_seo), "seo") ?? axeMaison("seo"), "seo");
    publier(
      axeGoogle("accessibilite", psiAccessibilite, "accessibility") ?? axeMaison("mobile"),
      psiAccessibilite == null ? "mobile" : "accessibilite",
    );
    publier(
      axeGoogle("bonnes_pratiques", num(row.psi_bonnes_pratiques), "best-practices"),
      "bonnes_pratiques",
    );
  } else {
    /**
     * SANS GOOGLE, ON NE PARLE PLUS NI DE VITESSE NI DE MOBILE.
     *
     * Nos deux mesures les plus fragiles, et on l'a vérifié sur le parc. `ttfb`
     * chronomètre la réponse du serveur — le premier octet — pas l'affichage :
     * un site que nous notions 70/100 mettait 18,6 secondes à afficher son
     * contenu. Quant au mobile, il repose sur un comptage de règles CSS et de
     * largeurs figées, l'heuristique la plus grossière de tout l'analyseur.
     *
     * Ces deux axes sont donc RETIRÉS, pas masqués faute de confiance : ils sont
     * listés dans `axes_masques` pour que la page méthode les nomme, et le
     * document dit franchement qu'ils n'ont pas été testés. Un audit à trois axes
     * sûrs vaut mieux qu'un audit à cinq dont deux se discutent devant le
     * prospect — et c'est ce qui rend la mesure Google indispensable avant envoi.
     *
     * Le référencement reste : ses preuves sont des faits binaires — balise
     * présente ou absente, page indexable ou non — pas des seuils inventés.
     */
    publier(axeMaison("seo"), "seo");
    masques.push("vitesse", "mobile");
  }

  // Ce que Google ne mesure pas et ne mesurera jamais : est-ce qu'on peut vous
  // joindre, et est-ce qu'on parle de vous. Ces deux axes-là restent les nôtres
  // dans tous les cas — ce sont aussi les deux qui se vendent le mieux.
  /**
   * Le contenu et la prise de contact restent NOTRES dans tous les cas.
   *
   * Google ne mesure ni l'un ni l'autre, et ne les mesurera pas : ce sont des
   * comptages — combien de pages, combien de texte, combien de photos, un
   * formulaire, un numéro cliquable — pas des performances. Ce sont aussi les
   * deux axes que l'offre répare vraiment, donc les deux qui se vendent.
   */
  for (const id of ["contenu", "conversion", "popularite"] as const) publier(axeMaison(id), id);

  const noteGlobale = num(row.note_globale);

  /**
   * La note montrée au prospect se calcule ICI, à la lecture.
   *
   * Pas à l'analyse — elle a besoin de la performance de Google, qui arrive
   * après. Pas à la mesure PageSpeed non plus : la recalculer à l'écriture
   * obligerait à relire les signaux et le contexte CRM à ce moment-là, et une
   * ligne écrite avant qu'on conserve les signaux resterait sans note pour
   * toujours. À la lecture, tout est là.
   */
  const signaux = row.signaux as SignauxSite | null | undefined;
  /**
   * LA BASE EST LA MOYENNE DES AXES AFFICHÉS, plus la seule performance.
   *
   * Le document montrait 35 au-dessus d'une carte à 100 : la note valait la
   * catégorie performance de Google moins des malus, et les quatre autres
   * cartes ne pesaient rien. Personne ne pouvait retomber sur le grand nombre
   * en regardant les petits, ce qui est précisément ce qu'un prospect fait.
   *
   * La base se prend donc sur `axes` — les axes RÉELLEMENT publiés, ceux qu'il
   * a sous les yeux — et non sur une liste théorique. Ce qui n'est pas affiché
   * ne pèse pas ; ce qui est affiché pèse exactement ce que la page annonce.
   */
  const base = baseDocument(axes);
  const noteContenu = axes.find((a) => a.id === "contenu")?.note ?? null;
  const doc =
    signaux && base != null
      ? noteDocument(
          base,
          signaux,
          {
            // La ville n'est pas dans cette table ; le seul malus qui en dépend
            // ne se déclenche donc pas ici. C'est assumé — il vaut deux points,
            // et l'ajouter demanderait une jointure sur chaque lecture de liste.
            ville: null,
          },
          noteContenu,
        )
      : { note: null, base: null, lignes: [], plafondAtteint: false };

  return {
    entreprise_id: Number(row.entreprise_id),
    url_analysee: str(row.url_analysee),
    url_finale: str(row.url_finale),
    http_status: num(row.http_status),
    bloque: row.bloque === true,
    injoignable: row.injoignable === true,
    note_globale: noteGlobale,
    note_document: doc.note,
    note_document_base: doc.base,
    note_document_malus: doc.lignes,
    libelle: doc.note != null ? libelleDeNote(doc.note) : noteGlobale == null ? null : libelleDeNote(noteGlobale),
    axes,
    axes_masques: masques,
    issue_keys: Array.isArray(row.issue_keys) ? (row.issue_keys as string[]) : [],
    constats_google: psiFraiche && Array.isArray(detail.google) ? detail.google : [],
    // Pas de péremption ici, contrairement aux constats Google : une observation
    // est datée par l'audit qui l'a produite, et c'est ce document-là qu'on
    // renvoie. La périmer indépendamment viderait un audit déjà envoyé.
    observations: Array.isArray(detail.observations) ? detail.observations : [],
    alertes: Array.isArray(row.alertes) ? (row.alertes as string[]) : [],
    ttfb_ms: num(row.ttfb_ms),
    chargement_ms: num(row.chargement_ms),
    poids_octets: num(row.poids_octets),
    capture_url: str(row.capture_url),
    note_globale_demo: num(row.note_globale_demo),
    analyse_le: str(row.analyse_le),
    psi_performance: num(row.psi_performance),
    psi_recupere_le: str(row.psi_recupere_le),
  };
}

/**
 * Les preuves de l'axe vitesse quand c'est Google qui mesure : les Core Web
 * Vitals, que notre analyseur ne voit pas. Les seuils sont ceux de Google —
 * les reprendre plutôt que d'en inventer, c'est ce qui rend la ligne
 * vérifiable par le prospect s'il fait le test lui-même.
 */
function preuvesPsi(row: Record<string, unknown>): Preuve[] {
  const out: Preuve[] = [];
  const lcp = num(row.psi_lcp_ms);
  const cls = num(row.psi_cls);
  const tbt = num(row.psi_tbt_ms);

  if (lcp != null) {
    out.push({
      cle: "psi_lcp",
      libelle: "Affichage du contenu principal",
      valeur: `${(lcp / 1000).toFixed(1).replace(".", ",")} s`,
      seuil: "2,5 s",
      poids: 40,
      verdict: lcp <= 2500 ? "ok" : lcp <= 4000 ? "moyen" : "probleme",
    });
  }
  if (cls != null) {
    out.push({
      cle: "psi_cls",
      libelle: "Stabilité de la mise en page",
      valeur: cls.toFixed(2).replace(".", ","),
      seuil: "0,10",
      poids: 25,
      verdict: cls <= 0.1 ? "ok" : cls <= 0.25 ? "moyen" : "probleme",
    });
  }
  if (tbt != null) {
    out.push({
      cle: "psi_tbt",
      libelle: "Temps où la page ne répond pas",
      valeur: `${Math.round(tbt)} ms`,
      seuil: "200 ms",
      poids: 35,
      verdict: tbt <= 200 ? "ok" : tbt <= 600 ? "moyen" : "probleme",
    });
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
