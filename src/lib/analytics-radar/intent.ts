/**
 * Transforme des mesures GA4 brutes en SIGNAL D'INTENTION exploitable au
 * téléphone : « qui rappeler, quand, et pourquoi ».
 *
 * Règle de fond, valable pour tout ce fichier : chaque point marqué doit
 * correspondre à une mesure réellement observée, et chaque `reason` affichée
 * à l'écran doit être une phrase que l'on peut prouver avec la donnée. Aucun
 * score n'est inventé, aucune raison n'est décorative — c'est ce qui permet à
 * un commercial de dire au prospect « vous êtes revenu hier soir » sans
 * risquer de se tromper.
 *
 * Ce que GA4 permet (vérifié en direct sur la propriété) et qui alimente le
 * score : sessions et visiteurs distincts par site, durée d'engagement, pages
 * vues, appareils, heures de visite, jours de visite, événements de
 * formulaire, et consultation du rapport d'audit (le rapport porte le même tag
 * GA4 sur son propre sous-domaine).
 *
 * Ce que GA4 ne permet PAS et qu'on ne prétend donc pas savoir : relier deux
 * sessions à un même individu nommé. « Revenu » signifie « le même
 * identifiant navigateur GA4 est revenu », ce qui reste la meilleure preuve
 * disponible sans BigQuery.
 */

/** Signaux mesurés pour un site démo, sur la fenêtre analysée. */
export interface IntentSignals {
  /** Visites (sessions GA4). */
  sessions: number;
  /** Visiteurs distincts (totalUsers GA4). sessions > visitors ⇒ retour. */
  visitors: number;
  /** Secondes d'engagement cumulées sur le site. */
  engagementSec: number;
  pageViews: number;
  /** Chemins de page distincts réellement vus. */
  pages: string[];
  /** Catégories d'appareil distinctes (desktop/mobile/tablet). */
  devices: string[];
  /** Heures (0-23) où au moins une session a démarré. */
  hours: number[];
  /** Jours distincts (YYYY-MM-DD) avec au moins une session. */
  days: string[];
  formStarted: boolean;
  formSubmitted: boolean;
  /** Le rapport d'audit de ce prospect a été ouvert. */
  auditViewed: boolean;
  /** Une séquence attend une réponse de ce prospect (CRM). */
  awaitingReply: boolean;
  /** Le prospect a répondu à une séquence (CRM). */
  replied: boolean;
}

export type IntentTier = "none" | "tiede" | "chaud" | "tres_chaud" | "brulant";

/** Quand rappeler — reprend la grille de priorité commerciale. */
export type CallWhen = "maintenant" | "aujourdhui" | "j1" | "j2" | "plus_tard";

export interface IntentVerdict {
  score: number;
  tier: IntentTier;
  /** Rendu visuel de l'intensité (vide quand aucun signal). */
  flame: string;
  callWhen: CallWhen;
  /** Justifications, chacune adossée à une mesure réelle. */
  reasons: string[];
}

/** Pages qui trahissent une intention d'achat, pas une simple curiosité. */
const KEY_PAGE = /service|presta|realisation|réalisation|projet|tarif|prix|devis|contact|avis/i;

/** En dessous, la démo a été ouverte puis refermée : signal faible. */
const GLANCE_SEC = 15;
/** Au-dessus, le prospect a vraiment lu la page. */
const READ_SEC = 60;

export const TIER_FLAME: Record<IntentTier, string> = {
  none: "",
  tiede: "🟡",
  chaud: "🔥",
  tres_chaud: "🔥🔥",
  brulant: "🔥🔥🔥",
};

export const CALL_WHEN_LABEL: Record<CallWhen, string> = {
  maintenant: "Appeler maintenant",
  aujourdhui: "Appeler aujourd'hui",
  j1: "Appeler demain",
  j2: "Appeler sous 48 h",
  plus_tard: "Plus tard",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** Deux visites séparées d'au moins ce nombre d'heures = deux moments distincts. */
const SEPARATE_HOURS = 3;

/**
 * Vrai quand deux sessions ont eu lieu à des moments nettement différents de
 * la journée (ex. 13 h puis 18 h) — un retour délibéré, pas un rechargement.
 */
export function hasSeparateVisitTimes(hours: number[]): boolean {
  if (hours.length < 2) return false;
  const sorted = [...hours].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0] >= SEPARATE_HOURS;
}

/**
 * Note l'intention d'un prospect à partir de ses signaux mesurés.
 *
 * Les seuils sont volontairement explicites plutôt que pondérés finement :
 * un commercial doit pouvoir lire la raison et comprendre pourquoi la fiche
 * est remontée en haut de sa liste.
 */
export function scoreIntent(s: IntentSignals): IntentVerdict {
  const reasons: string[] = [];
  let score = 0;

  // ── Le signal le plus fort : il a rempli le formulaire ──────────────────
  if (s.formSubmitted) {
    score += 60;
    reasons.push("A envoyé le formulaire depuis la démo");
  } else if (s.formStarted) {
    score += 35;
    reasons.push("A commencé le formulaire sans l'envoyer");
  }

  // ── Retour : la même personne est revenue ───────────────────────────────
  const returned = s.sessions > Math.max(1, s.visitors) || s.days.length > 1;
  if (returned) {
    score += 30;
    reasons.push(
      s.days.length > 1
        ? `Revenu sur ${plural(s.days.length, "jour")} différents`
        : `${plural(s.sessions, "visite")} pour ${plural(Math.max(1, s.visitors), "visiteur")}`,
    );
  }
  if (hasSeparateVisitTimes(s.hours)) {
    score += 15;
    const sorted = [...s.hours].sort((a, b) => a - b);
    reasons.push(`Visites à des moments distincts (${sorted[0]} h puis ${sorted[sorted.length - 1]} h)`);
  }

  // ── Changement d'appareil : il y a repensé ailleurs ─────────────────────
  if (s.devices.length > 1) {
    score += 15;
    reasons.push(`Consulté depuis ${s.devices.join(" puis ")}`);
  }

  // ── Profondeur de lecture ───────────────────────────────────────────────
  const keyPages = s.pages.filter((p) => KEY_PAGE.test(p));
  if (keyPages.length) {
    score += Math.min(20, 8 * keyPages.length);
    reasons.push(`A ouvert ${keyPages.slice(0, 3).join(", ")}`);
  }
  if (s.engagementSec >= READ_SEC) {
    score += 15;
    reasons.push(`${Math.round(s.engagementSec)} s passées sur le site`);
  } else if (s.sessions > 0 && s.engagementSec > 0 && s.engagementSec < GLANCE_SEC) {
    reasons.push(`Ouvert ${Math.round(s.engagementSec)} s seulement`);
  }
  if (s.pageViews >= 3) {
    score += 10;
    reasons.push(`${plural(s.pageViews, "page")} vues`);
  }

  // ── Signaux croisés avec le CRM ─────────────────────────────────────────
  if (s.auditViewed) {
    score += 15;
    reasons.push("A aussi consulté son audit");
  }
  if (s.replied) {
    score += 25;
    reasons.push("A répondu à la séquence");
  } else if (s.awaitingReply && s.sessions > 0) {
    // Il regarde la démo mais ne répond pas : à relancer par téléphone,
    // justement parce que l'écrit ne suffit pas.
    score += 10;
    reasons.push("Visite la démo mais ne répond pas encore");
  }

  if (s.sessions === 0) {
    return {
      score: s.replied ? 25 : 0,
      tier: s.replied ? "tiede" : "none",
      flame: s.replied ? TIER_FLAME.tiede : TIER_FLAME.none,
      callWhen: s.replied ? "j1" : "plus_tard",
      reasons: s.replied ? ["A répondu à la séquence", "Démo pas encore ouverte"] : ["Aucun signal pour l'instant"],
    };
  }

  const tier: IntentTier =
    score >= 85 ? "brulant" : score >= 60 ? "tres_chaud" : score >= 35 ? "chaud" : "tiede";

  // La grille d'appel suit l'intensité, avec deux raccourcis explicites :
  // un formulaire envoyé ou une réponse + visite se rappellent tout de suite.
  const callWhen: CallWhen = s.formSubmitted
    ? "maintenant"
    : s.replied && s.sessions > 0
      ? "aujourdhui"
      : tier === "brulant" || tier === "tres_chaud"
        ? "aujourdhui"
        : tier === "chaud"
          ? "j1"
          : "j2";

  return { score, tier, flame: TIER_FLAME[tier], callWhen, reasons };
}

/** Ordre d'appel : le plus chaud d'abord, puis le plus récent. */
export function compareIntent(a: { score: number }, b: { score: number }): number {
  return b.score - a.score;
}
