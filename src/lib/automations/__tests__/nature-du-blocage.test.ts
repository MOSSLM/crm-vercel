/**
 * @jest-environment node
 *
 * « ÇA REPART TOUT SEUL » ET « ÇA ATTEND QUELQU'UN » NE SONT PAS LA MÊME CHOSE.
 *
 * Les dix-neuf motifs de retenue s'affichaient dans la même colonne, avec la
 * même allure. « Plafond du jour atteint » repart dans l'heure ; « le message
 * promet l'audit » ne repartira jamais seul. Cinquante-neuf inscriptions ont
 * dormi des semaines parce que rien à l'écran ne séparait les deux.
 *
 * Ce fichier tient la frontière — et surtout le cas qui la traverse.
 */

import {
  natureDuBlocage,
  holdReasonLabel,
  NATURE_LABEL,
  type HoldReason,
  type NatureDuBlocage,
} from '../regulator'

/** Tous les motifs du type, pour qu'un ajout futur ne passe pas inaperçu. */
const TOUS: HoldReason[] = [
  'out_of_window', 'next_day', 'company_gap', 'daily_cap', 'sequence_paused',
  'global_pause', 'one_per_day', 'no_email', 'test_hold', 'email_invalid',
  'email_pending', 'risky_cap', 'domain_probe', 'awaiting_reply',
  'lien_manquant', 'demo_manquante', 'message_vide', 'tache_annulee',
  'canal_suspendu',
]

describe('le robinet : ça repart au rythme autorisé, sans personne', () => {
  const debit: HoldReason[] = [
    'out_of_window', 'next_day', 'company_gap', 'daily_cap',
    'one_per_day', 'risky_cap', 'domain_probe', 'email_pending',
  ]
  it.each(debit)('%s repart toute seule', (r) => {
    expect(natureDuBlocage(r)).toBe('debit')
  })

  it('le plafond du jour en fait partie — c’est LUI que la chauffe pilote', () => {
    // Le compte-gouttes du réchauffeur passe par `daily_cap` : c'est bien du
    // débit, pas une panne. Un prospect retenu là n'a besoin de rien.
    expect(natureDuBlocage('daily_cap')).toBe('debit')
  })
})

describe('les interrupteurs : ça repart au clic qui les lève', () => {
  const reglage: HoldReason[] = ['global_pause', 'sequence_paused', 'test_hold', 'canal_suspendu']
  it.each(reglage)('%s attend un réglage', (r) => {
    expect(natureDuBlocage(r)).toBe('reglage')
  })
})

describe('ce qui manque : aucun quota ne le fournira', () => {
  const humain: HoldReason[] = [
    'no_email', 'email_invalid', 'lien_manquant',
    'demo_manquante', 'message_vide', 'tache_annulee',
  ]
  it.each(humain)('%s attend un geste', (r) => {
    expect(natureDuBlocage(r)).toBe('humain')
  })
})

describe('« en attente de réponse » traverse la frontière', () => {
  it('avec une date de relance : l’horloge la libère, c’est du débit', () => {
    expect(natureDuBlocage('awaiting_reply', Date.parse('2026-08-25T09:00:00Z'))).toBe('debit')
  })

  it('sans date : rien ne la réveillera, c’est un blocage humain', () => {
    // `replyTimeoutDays: 0` met `next_run_at` à null — l'inscription a quitté
    // la file. C'est EXACTEMENT le cas des 59, et le seul moyen de les compter
    // à part est de le dire ici.
    expect(natureDuBlocage('awaiting_reply', null)).toBe('humain')
    expect(natureDuBlocage('awaiting_reply')).toBe('humain')
  })

  it('et le libellé dit déjà l’impasse — les deux doivent concorder', () => {
    expect(holdReasonLabel('awaiting_reply', null)).toContain('rien ne la réveillera')
    expect(holdReasonLabel('awaiting_reply', Date.now())).toContain('relance prévue')
  })
})

describe('la table est complète', () => {
  it('chaque motif du type est classé, et dans une famille connue', () => {
    const familles: NatureDuBlocage[] = ['debit', 'reglage', 'humain']
    for (const r of TOUS) expect(familles).toContain(natureDuBlocage(r))
  })

  it('aucun motif n’est laissé sans libellé', () => {
    for (const r of TOUS) expect(holdReasonLabel(r)).not.toBe('')
  })

  it('rien du tout — pas de motif — n’est pas un blocage humain', () => {
    // `null` veut dire « elle avance ». La ranger dans « attend un geste »
    // ferait clignoter une alerte pour des inscriptions en parfaite santé.
    expect(natureDuBlocage(null)).toBe('debit')
  })

  it('les trois familles ont un libellé lisible', () => {
    expect(Object.keys(NATURE_LABEL).sort()).toEqual(['debit', 'humain', 'reglage'])
  })
})
