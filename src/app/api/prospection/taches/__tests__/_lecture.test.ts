/**
 * @jest-environment node
 *
 * LE PÉRIMÈTRE DE L'AGENT, ET POURQUOI IL EST UNE UNION.
 *
 * L'espace agent réutilise le tableau de l'admin, filtré. Tout tient donc à
 * cette lecture, et elle a deux façons opposées de se tromper :
 *
 *   · TROP LARGE — l'agent voit les prospects d'un autre. C'est une fuite, et
 *     elle ne se voit pas à l'écran : une ligne de plus ressemble à une ligne.
 *   · TROP ÉTROITE — une tâche lui manque. Personne ne le remarque non plus,
 *     et c'est un rappel qui n'est jamais passé.
 *
 * Le second est le piège réel ici. « Ce qui m'est attribué » et « mes
 * entreprises » ne se recouvrent pas : le régulateur attribue des tâches sur
 * des fiches qui ne sont pas au nom de l'agent, et des tâches détachées
 * (`assignee_id` nul) pendent sur ses propres fiches. Prendre l'un des deux
 * seulement escamote silencieusement des lignes — d'où l'union, et d'où ce
 * fichier.
 */
import { lireLesTaches } from '../_lecture'

jest.mock('@/lib/automations/week', () => ({ readReplies: () => ({}) }))

const MOI = 'agent-1'
const AUTRE = 'agent-2'

type Ligne = Record<string, unknown>

/**
 * Faux client à trois tables. On n'implémente que ce que la lecture appelle —
 * un faux plus riche cacherait ce dont elle a vraiment besoin.
 */
function clientAvec(taches: Ligne[]) {
  const appels: { filtre: string; valeur: unknown }[] = []

  const chaineTaches = () => {
    const etat: { colonne?: string; valeur?: unknown; enSequence?: boolean } = {}
    const chaine: Record<string, unknown> = {
      select: (champs: string) => {
        etat.colonne = /entreprises!inner/.test(champs) ? 'proprietaire' : 'attribution'
        return chaine
      },
      eq: (colonne: string, valeur: unknown) => {
        appels.push({ filtre: colonne, valeur })
        etat.valeur = valeur
        return chaine
      },
      // La lecture écarte désormais tout ce qui n'appartient à aucune
      // inscription : « pas de séquence, pas de tâche ». Le faux client
      // l'applique pour de vrai, sinon le filtre pourrait disparaître du code
      // sans qu'aucun test ne bronche.
      // Volontairement HORS de `appels`, qui ne recense que les filtres de
      // périmètre : ce filtre-ci n'en est pas un, et il est vérifié par ce
      // qu'il retire réellement de la liste.
      not: () => {
        etat.enSequence = true
        return chaine
      },
      order: () => chaine,
      limit: () => {
        const gardees = taches.filter(
          (t) =>
            (etat.colonne === 'proprietaire'
              ? (t.entreprise as { owner_id?: string })?.owner_id === etat.valeur
              : t.assignee_id === etat.valeur) &&
            (!etat.enSequence || t.enrollment_id != null),
        )
        return Promise.resolve({ data: gardees, error: null })
      },
    }
    return chaine
  }

  const vide = () => {
    const chaine: Record<string, unknown> = {
      select: () => chaine,
      in: () => Promise.resolve({ data: [], error: null }),
    }
    return chaine
  }

  return {
    sb: { from: (table: string) => (table === 'prospection_tasks' ? chaineTaches() : vide()) } as never,
    appels,
  }
}

/** Une tâche telle que la lecture la reçoit, avec son embed d'entreprise. */
const tache = (id: string, attribuee: string | null, proprietaire: string | null): Ligne => ({
  id,
  kind: 'call',
  status: 'pending',
  title: null,
  due_at: `2026-08-2${id.length}T09:00:00Z`,
  done_at: null,
  entreprise_id: 1,
  assignee_id: attribuee,
  automation_id: 'a1',
  // Toute tâche de test appartient à une inscription : sans elle, la lecture
  // l'écarte — c'est la règle, pas un détail de montage.
  enrollment_id: `e-${id}`,
  step_id: null,
  routing_reason: null,
  entreprise: { name: `Ent ${id}`, ville: null, cohorte_demarchage: null, premiere_touche_le: null, owner_id: proprietaire },
})

describe('lireLesTaches — le périmètre de l’agent', () => {
  it('prend une tâche qui lui est attribuée sur la fiche d’un autre', async () => {
    const { sb } = clientAvec([tache('a', MOI, AUTRE)])
    const r = await lireLesTaches(sb, { agentId: MOI })
    expect(r.lignes.map((l) => l.id)).toEqual(['a'])
  })

  // LE CAS QUI MANQUERAIT AVEC UN SEUL FILTRE : une tâche détachée sur SA
  // fiche. Le régulateur en laisse — `assignee_id` nul — et personne ne les
  // verrait jamais si l'on ne lisait que « ce qui m'est attribué ».
  it('prend une tâche détachée posée sur une de ses entreprises', async () => {
    const { sb } = clientAvec([tache('b', null, MOI)])
    const r = await lireLesTaches(sb, { agentId: MOI })
    expect(r.lignes.map((l) => l.id)).toEqual(['b'])
  })

  it('écarte ce qui n’est ni à lui ni sur ses fiches', async () => {
    const { sb } = clientAvec([tache('c', AUTRE, AUTRE)])
    const r = await lireLesTaches(sb, { agentId: MOI })
    expect(r.lignes).toEqual([])
  })

  // Une tâche à la fois attribuée à l'agent ET sur sa fiche sort des DEUX
  // lectures : sans déduplication par identifiant, elle s'afficherait en
  // double, et le compteur du tableau annoncerait une file plus grosse qu'elle.
  it('ne rend jamais deux fois la tâche qui satisfait les deux critères', async () => {
    const { sb } = clientAvec([tache('d', MOI, MOI)])
    const r = await lireLesTaches(sb, { agentId: MOI })
    expect(r.lignes).toHaveLength(1)
  })

  /**
   * PAS D'INSCRIPTION, PAS DE TÂCHE.
   *
   * Ce qui entrait ici sans inscription, c'était le stock semé par l'ancienne
   * attribution — 631 appels en attente au 20/08/2026, dont 86 sur des
   * entreprises déjà inscrites ailleurs, c'est-à-dire du travail en double.
   * Une tâche sans séquence ne sait dire ni ce qui a été tenté avant, ni ce qui
   * vient après.
   */
  it('écarte une tâche qui n’appartient à aucune inscription', async () => {
    const orpheline = { ...tache('o', MOI, MOI), automation_id: null, enrollment_id: null }
    const { sb } = clientAvec([orpheline, tache('a', MOI, MOI)])
    const { lignes } = await lireLesTaches(sb, { agentId: MOI })
    expect(lignes.map((l) => l.id)).toEqual(['a'])
  })

  it('interroge bien les deux colonnes, et sur le bon agent', async () => {
    const { sb, appels } = clientAvec([])
    await lireLesTaches(sb, { agentId: MOI })
    expect(appels).toEqual([
      { filtre: 'assignee_id', valeur: MOI },
      { filtre: 'entreprise.owner_id', valeur: MOI },
    ])
  })

  // SANS `agentId`, AUCUN FILTRE — c'est la lecture de l'admin, et elle ne doit
  // pas hériter d'un filtre par défaut : une file d'administration amputée
  // cacherait précisément les inscriptions que personne ne suit.
  it('sans agent, ne pose aucun filtre de propriétaire', async () => {
    const { sb, appels } = clientAvec([])
    await lireLesTaches(sb)
    expect(appels).toEqual([])
  })
})
