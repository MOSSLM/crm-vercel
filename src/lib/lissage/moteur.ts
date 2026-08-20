// moteur.ts — le tour de file du lissage. Ce qui décide, exécute, et recommence.
//
// LE CYCLE, ET POURQUOI IL A CETTE FORME
//
//   réclamer → charger les faits → décider → exécuter → enregistrer → recharger
//
// Trois choses le gouvernent, et chacune vient d'une erreur déjà payée :
//
// 1. PLUSIEURS TOURS PAR APPEL. Un prospect a quatre sujets. Un tour par sujet
//    ferait quatre appels de tick pour une seule fiche, et une passe de mille
//    prospects tiendrait la semaine. On rejoue donc le cycle sur le même lot,
//    en rechargeant les faits entre chaque tour — parce qu'un outil vient
//    justement de les changer, et décider sur des faits périmés relancerait ce
//    qu'on vient de faire.
//
// 2. LE LOT EST RECHARGÉ EN BLOC. Trois lectures par tour, jamais trois par
//    prospect. C'est la règle de `campagne-db` et elle vaut ici : vingt
//    prospects × quatre tours × trois requêtes chacun, ce serait 240
//    allers-retours pour ce qui en demande douze.
//
// 3. LE SERVEUR NE SE SUBSTITUE JAMAIS AU LOCAL. Une étape qui demande
//    Playwright est POSÉE puis RELÂCHÉE : elle attend que Matteo ouvre son
//    localhost. Prétendre la faire ici, c'est réapprendre que le CAPTCHA de
//    Google ne se résout pas.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  candidatsDeLaFile,
  chargerFaits,
  enregistrerResultat,
  planDe,
  poserProchaineEtape,
  reclamerLot,
  relacherLigne,
  type LigneFile,
} from '@/lib/lissage/passe-db'
import { executerOutilServeur, outilBranche } from '@/lib/lissage/outils-serveur'
import type { PlanPasse } from '@/lib/lissage/passe'

/** Quatre tours : autant que de sujets. Au-delà, il n'y a plus rien à enchaîner. */
const TOURS = 4

export interface BilanTick {
  /** Lignes effectivement prises dans la file. */
  prises: number
  /** Outils serveur réellement lancés. */
  lances: number
  /** Lignes qui ont fini la passe. */
  complets: number
  /** Lignes qu'aucun outil ne peut plus prendre — avec leur motif sur la ligne. */
  sans_prise: number
  /** Lignes posées sur une étape locale ou humaine : elles attendent une machine. */
  en_attente_local: number
  /**
   * CE QU'IL RESTE APRÈS CE TOUR, et pourquoi il faut le dire.
   *
   * Un tick prend UN lot et s'arrête — c'est ce qui le rend borné, et c'est
   * voulu. Mais sans ces trois nombres, `prises: 0` ne se distingue pas de
   * « tout est fini » : on appuie, rien ne bouge, et l'écran se tait. C'est le
   * même défaut que partout ailleurs dans ce projet — un résultat vide qui ne
   * dit pas de quoi il est fait.
   */
  reste: {
    /** Encore prenables par le serveur au prochain appel. */
    serveur: number
    /** Attendent le poste local — aucun clic ici ne les fera avancer. */
    local: number
    /** Attendent une relecture à l'écran (choix du SIRET, dossiers). */
    humain: number
  }
  /**
   * PANNES D'OUTIL, en clair. Un tick muet serait pire qu'un tick qui rate.
   *
   * ⚠️ ELLES NE CONTIENNENT QUE DE VRAIES PANNES — la source n'a pas répondu.
   * « L'annuaire ne propose aucun candidat » et « code postal différent du
   * registre » sont des RÉPONSES : elles vont dans `remarques`. Les mélanger a
   * fait crier l'écran à presque chaque tour, sur du fonctionnement normal, et
   * une alerte qui crie tout le temps finit par ne plus être lue.
   */
  pannes: string[]
  /**
   * Ce que les outils ont répondu sans que ce soit un échec. Se consultent,
   * ne s'alarment pas.
   */
  remarques: string[]
}

/**
 * Avancer un lot de la file.
 *
 * `passeId` optionnel : sans lui, le tick sert toutes les passes en cours, ce
 * qui est ce qu'un cron doit faire. Avec lui, c'est le bouton d'un écran.
 */
export async function tickLissage(
  sb: SupabaseClient,
  options: { passeId?: string; taille?: number; par?: string } = {},
): Promise<BilanTick> {
  const bilan: BilanTick = {
    prises: 0,
    lances: 0,
    complets: 0,
    sans_prise: 0,
    en_attente_local: 0,
    pannes: [],
    remarques: [],
    reste: { serveur: 0, local: 0, humain: 0 },
  }
  const par = options.par ?? 'tick-serveur'

  // Le serveur prend les lignes non encore décidées (`lieu` nul) et les siennes.
  // Il ne peut PAS prendre `local` ni `humain` : c'est l'index partiel de la
  // migration qui garde ces deux-là pour l'exécuteur local.
  let lignes = await reclamerLot(sb, {
    passeId: options.passeId,
    lieux: [null, 'serveur'],
    par,
    taille: options.taille ?? 20,
  })
  bilan.prises = lignes.length
  if (lignes.length === 0) {
    bilan.reste = await resteAFaire(sb, options.passeId)
    return bilan
  }

  const plan = await planDeLaPasse(sb, lignes)

  for (let tour = 0; tour < TOURS && lignes.length > 0; tour += 1) {
    const faits = await chargerFaits(
      sb,
      lignes.map((l) => l.entrepriseId),
      candidatsDeLaFile(lignes),
    )
    const suite: LigneFile[] = []

    for (const ligne of lignes) {
      const f = faits.get(ligne.entrepriseId)
      if (!f) {
        // L'entreprise a disparu sous la passe — fusionnée, supprimée. On le
        // dit sur la ligne plutôt que de la laisser tourner indéfiniment.
        await enregistrerResultat(sb, ligne, {
          outil: 'introuvable',
          erreur: 'l’entreprise n’existe plus',
        })
        bilan.pannes.push(`entreprise ${ligne.entrepriseId} introuvable`)
        continue
      }

      const apres = await poserProchaineEtape(sb, ligne, f, plan.get(ligne.passeId) ?? planDe(null), {
        relacher: false,
      })
      if (apres.statut === 'complet') {
        bilan.complets += 1
        continue
      }
      if (apres.statut === 'sans_prise') {
        bilan.sans_prise += 1
        continue
      }
      if (apres.lieu !== 'serveur' || !apres.outil) {
        await relacherLigne(sb, apres)
        bilan.en_attente_local += 1
        continue
      }

      // Un outil non branché n'est pas une panne à réessayer : c'est un manque
      // à dire. Il entre dans `tentes`, la file passe au suivant, et l'écran
      // portera « pas encore lançable depuis l'app ».
      const resultat = await executerOutilServeur(sb, apres.outil, f)
      if (outilBranche(apres.outil)) bilan.lances += 1
      if (resultat.erreur) bilan.pannes.push(`${apres.outil} · ${resultat.erreur}`)
      // `remarques` était DÉCLARÉ, initialisé, sérialisé et lu par l'écran —
      // et personne n'y poussait rien. La note de l'outil s'arrêtait à
      // `enregistrerResultat`, donc « l'annuaire ne propose aucun candidat »
      // n'arrivait jamais jusqu'au bilan. Séparer panne et réponse ne sert à
      // rien si la moitié « réponse » reste vide.
      if (resultat.note) bilan.remarques.push(`${apres.outil} · ${resultat.note}`)

      await enregistrerResultat(sb, apres, {
        outil: apres.outil,
        constats: resultat.constats,
        dossier: resultat.dossier,
        note: resultat.note,
        erreur: resultat.erreur,
      })
      suite.push({
        ...apres,
        statut: 'a_faire',
        tentes: apres.tentes.includes(apres.outil) ? apres.tentes : [...apres.tentes, apres.outil],
        outil: null,
        lieu: null,
        dossier: { ...apres.dossier, ...(resultat.dossier ?? {}) },
      })
    }
    lignes = suite
  }

  // Ce qui reste en vol après quatre tours est déjà relâché par
  // `enregistrerResultat` : le tick suivant le reprendra là où il en est.
  bilan.reste = await resteAFaire(sb, options.passeId)
  return bilan
}

/** Le plan de chaque passe touchée par le lot. Une lecture, pas une par ligne. */
async function planDeLaPasse(
  sb: SupabaseClient,
  lignes: readonly LigneFile[],
): Promise<Map<string, PlanPasse>> {
  const ids = [...new Set(lignes.map((l) => l.passeId))]
  const m = new Map<string, PlanPasse>()
  if (ids.length === 0) return m
  const { data } = await sb.from('lissage_passes').select('id, plan').in('id', ids)
  for (const p of (data ?? []) as { id: string; plan: unknown }[]) m.set(p.id, planDe(p.plan))
  return m
}

/**
 * Ce qui reste à faire, par lieu. UNE lecture, pas une par ligne.
 *
 * Sans ce compte, un tick qui ne prend rien est indistinguable d'une passe
 * terminée : c'est ce qui a fait croire à un blocage alors que la file était
 * simplement en attente du poste local. L'écran doit pouvoir dire « il reste
 * 521 prospects que je peux prendre » ou « les 19 qui restent attendent votre
 * localhost », et ce ne sont pas les mêmes phrases.
 */
async function resteAFaire(
  sb: SupabaseClient,
  passeId?: string,
): Promise<BilanTick['reste']> {
  let q = sb.from('lissage_leads').select('lieu').eq('statut', 'a_faire')
  if (passeId) q = q.eq('passe_id', passeId)
  const { data, error } = await q
  if (error) return { serveur: 0, local: 0, humain: 0 }

  const reste = { serveur: 0, local: 0, humain: 0 }
  for (const r of (data ?? []) as { lieu: string | null }[]) {
    if (r.lieu === 'local') reste.local += 1
    else if (r.lieu === 'humain') reste.humain += 1
    // `null` (pas encore décidé) et `serveur` sont tous deux prenables ici.
    else reste.serveur += 1
  }
  return reste
}
