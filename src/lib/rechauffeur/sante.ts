// sante.ts — « combien d'e-mails par jour puis-je envoyer ? »
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/warmup/health.ts`, module pur.
//
// LA RÉPONSE NE SORT PAS D'UN BARÈME. Elle sort de ce que l'expéditeur a
// réellement obtenu sur les sept derniers jours : où ses messages ont atterri,
// combien lui ont valu une réponse, combien ont échoué. Un barème théorique
// dirait la même chose à un domaine sain et à un domaine grillé.
//
// DEUX CORRECTIONS PAR RAPPORT À L'ORIGINAL, dues à l'envoi par Resend :
//
// 1. **Le plafond par famille de fournisseur disparaît du calcul.** Il valait
//    pour une boîte Gmail ou Outlook qui envoie elle-même — 50 destinataires
//    externes par jour chez Google, 30 chez Yahoo. Nous n'envoyons pas depuis
//    une boîte : nous passons par Resend, dont les limites sont celles du
//    forfait, pas d'un fournisseur de messagerie. Le plafond dur devient donc
//    un paramètre explicite, que l'appelant lit dans `regulator_settings`.
//    Le classement par famille reste utile — mais pour la DIVERSITÉ DES
//    TÉMOINS, pas pour brider l'expéditeur.
//
// 2. **`echecs` ne s'appelle plus « rebonds ».** Le réchauffeur d'origine
//    comptait là des échecs d'envoi SMTP, pas de vrais rebonds — l'avis de
//    non-remise qui revient dix minutes plus tard n'était pas lu. Le nom
//    promettait plus que la mesure ; il est corrigé plutôt que documenté.

import { palierDuJour } from './courbe'

/** Ce que l'expéditeur a obtenu sur la fenêtre glissante. */
export interface Glissant {
  envoyes: number
  enBoite: number
  enSpam: number
  introuvables: number
  reponses: number
  echecs: number
}

export type Verdict = 'monter' | 'tenir' | 'redescendre'

export interface Sante {
  /** 0 à 100. */
  score: number
  /** Part des messages mesurés arrivés en boîte de réception. */
  tauxPlacement: number
  tauxReponse: number
  tauxEchec: number
  verdict: Verdict
  /** La phrase qu'on affiche — jamais un score nu. */
  motif: string
  /**
   * A-T-ON MESURÉ QUELQUE CHOSE ? `false` quand aucun message n'a été retrouvé,
   * ni en boîte ni en spam.
   *
   * SANS CE CHAMP, L'ABSENCE DE MESURE SE LIT COMME UN MAUVAIS SCORE. `sante()`
   * traitait pourtant le cas correctement — verdict `tenir`, motif explicite —
   * mais le codait en `score: 0`, et `capacite()` ne lit que le score : elle
   * rendait donc 0 message autorisé avec le motif « prospection suspendue tant
   * que le score est sous 50 ». L'exact contraire de la règle écrite trois
   * paragraphes plus haut, et la faute que ce CRM corrige partout ailleurs.
   */
  mesure: boolean
}

/**
 * Familles de fournisseurs, pour la diversité des adresses témoins.
 *
 * Un maillage qui ne toucherait que Gmail ne dirait rien de ce que fait
 * Outlook — et surtout rien d'Orange et de Free, omniprésents chez les artisans
 * français et absents de tous les réseaux de chauffe américains.
 */
export const FAMILLES = ['google', 'microsoft', 'yahoo', 'orange', 'free', 'autre'] as const
export type Famille = (typeof FAMILLES)[number]

/**
 * Le score, et ce qu'il faut faire du palier.
 *
 * AUCUN PLACEMENT MESURÉ N'EST PAS UN MAUVAIS SCORE — c'est une absence de
 * mesure, et le palier gèle. C'est la même règle que partout ailleurs dans le
 * CRM : un zéro et une absence de mesure ne sont pas la même chose.
 */
export function sante(g: Glissant): Sante {
  const mesures = g.enBoite + g.enSpam
  const tauxPlacement = mesures > 0 ? g.enBoite / mesures : 0
  const tauxReponse = g.envoyes > 0 ? Math.min(1, g.reponses / g.envoyes) : 0
  const tauxEchec = g.envoyes > 0 ? g.echecs / g.envoyes : 0
  // Ni en boîte, ni en spam : le plus souvent un rejet silencieux, et c'est le
  // pire des trois — on ne saura même pas quoi corriger.
  const tauxIntrouvable = g.envoyes > 0 ? g.introuvables / g.envoyes : 0

  if (mesures === 0) {
    return {
      // Le score reste 0 pour l'affichage — il n'y a rien à afficher —, mais
      // `mesure: false` empêche quiconque de le lire comme « mauvais ».
      score: 0,
      tauxPlacement: 0,
      tauxReponse,
      tauxEchec,
      verdict: 'tenir',
      motif:
        'Aucun placement mesuré — le palier est gelé tant qu’on ne sait pas où atterrit le courrier.',
      mesure: false,
    }
  }

  const score = Math.round(
    100 *
      (0.55 * tauxPlacement +
        0.2 * Math.min(1, tauxReponse / 0.35) + // 35 % de réponses = plein pot
        0.15 * (1 - Math.min(1, tauxEchec / 0.05)) +
        0.1 * (1 - Math.min(1, tauxIntrouvable / 0.2))),
  )

  const pc = (x: number, d = 0) => `${(x * 100).toFixed(d)} %`

  if (tauxPlacement < 0.8) {
    return { score, tauxPlacement, tauxReponse, tauxEchec, mesure: true, verdict: 'redescendre',
      motif: `Placement à ${pc(tauxPlacement)} (plancher 80 %) — on redescend d’un palier.` }
  }
  if (tauxEchec > 0.05) {
    return { score, tauxPlacement, tauxReponse, tauxEchec, mesure: true, verdict: 'redescendre',
      motif: `Échecs d’envoi à ${pc(tauxEchec, 1)} (seuil 5 %) — on redescend d’un palier.` }
  }
  if (tauxPlacement >= 0.92 && tauxEchec <= 0.02 && mesures >= 5) {
    return { score, tauxPlacement, tauxReponse, tauxEchec, mesure: true, verdict: 'monter',
      motif: `Placement à ${pc(tauxPlacement)}, échecs à ${pc(tauxEchec, 1)} — feu vert.` }
  }
  if (mesures < 5) {
    return { score, tauxPlacement, tauxReponse, tauxEchec, mesure: true, verdict: 'tenir',
      motif: `Seulement ${mesures} message(s) mesuré(s) — pas assez pour trancher, on tient le palier.` }
  }
  return { score, tauxPlacement, tauxReponse, tauxEchec, mesure: true, verdict: 'tenir',
    motif: `Placement à ${pc(tauxPlacement)} : au-dessus du plancher, sous les 92 % requis pour monter.` }
}

export interface DemandeDeCapacite {
  jourDeChauffe: number
  /** Le palier de chauffe visé au bout de la montée. */
  cibleQuotidienne: number
  /** Le plafond dur de prospection — chez nous, `regulator_settings.daily_cap`. */
  plafondDur: number
  sante: Sante
  /** Paliers perdus par des verdicts « redescendre » successifs. */
  penalite?: number
}

export interface Capacite {
  chauffeAujourdhui: number
  froidAujourdhui: number
  /** Ce qu'on affiche pour que le chiffre soit défendable. */
  explication: string
}

/**
 * Traduit l'ancienneté et la santé en deux nombres.
 *
 * LA SANTÉ MODULE LA PROSPECTION, JAMAIS LA CHAUFFE. On ne réduit pas la
 * chauffe parce que ça va mal : c'est précisément le remède. Ce qu'on réduit,
 * c'est le volume inconnu — la prospection — jusqu'à ce que le placement
 * remonte.
 */
export function capacite(d: DemandeDeCapacite): Capacite {
  const penalite = d.penalite ?? 0
  // Une pénalité coûte quatre jours de courbe : redescendre d'un palier, c'est
  // revenir là où le placement tenait, pas s'arrêter.
  const jourEffectif = Math.max(1, d.jourDeChauffe - penalite * 4)
  const palier = palierDuJour(jourEffectif, d.cibleQuotidienne)

  // ── LA MESURE AVANT LE SEUIL ──────────────────────────────────────────────
  //
  // « Aucun placement mesuré » n'est pas « mauvais score ». Sans ce test, le
  // score 0 de l'absence de mesure tombait dans `< 50` et rendait `facteur = 0`
  // — zéro prospection autorisée, avec le motif « prospection suspendue tant
  // que le score est sous 50 ». Le premier jour d'une boîte neuve, avant le
  // moindre relevé, la chauffe se suspendait donc elle-même.
  let facteur = 1
  if (!d.sante.mesure) facteur = 1
  else if (d.sante.score < 50) facteur = 0
  else if (d.sante.score < 70) facteur = 0.4
  else if (d.sante.score < 85) facteur = 0.7

  const froidAujourdhui = Math.min(d.plafondDur, Math.floor(palier.froid * facteur))

  const morceaux = [`Jour ${d.jourDeChauffe} de chauffe`]
  if (penalite > 0) morceaux.push(`${penalite} palier(s) perdu(s), on repart du jour ${jourEffectif}`)
  morceaux.push(d.sante.mesure ? `score ${d.sante.score}/100` : 'aucun placement mesuré')
  if (!d.sante.mesure) morceaux.push('capacité non modulée — on ne module pas sur une absence de mesure')
  else if (facteur === 0) morceaux.push('prospection suspendue tant que le score est sous 50')
  else if (facteur < 1) morceaux.push(`prospection réduite à ${Math.round(facteur * 100)} % de la courbe`)
  if (froidAujourdhui === d.plafondDur && d.plafondDur > 0) {
    morceaux.push(`plafonné à ${d.plafondDur} par le régulateur`)
  }

  return { chauffeAujourdhui: palier.chauffe, froidAujourdhui, explication: morceaux.join(' · ') }
}
