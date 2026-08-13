import {
  agentPeutVoir,
  agentsParSequence,
  chargerAcces,
  filtrerPourAgent,
  libelleAcces,
  modeAcces,
  sequencesDeLAgent,
  type AttributionSequence,
} from '../acces'
import type { SequenceSettings } from '@/components/automations/types'

const ADA = 'agent-ada'
const BOB = 'agent-bob'

const seq = (id: string, settings?: SequenceSettings) => ({ id, settings: settings ?? {} })

const attributions: AttributionSequence[] = [
  { automation_id: 'restreinte', agent_id: ADA },
  { automation_id: 'restreinte', agent_id: BOB },
  { automation_id: 'ada-seule', agent_id: ADA },
]

describe('modeAcces', () => {
  it('vaut « tous » sans réglage — rien ne se ferme par omission', () => {
    expect(modeAcces(undefined)).toBe('tous')
    expect(modeAcces(null)).toBe('tous')
    expect(modeAcces({})).toBe('tous')
  })

  it('ne retient « choisis » que sur la valeur exacte', () => {
    expect(modeAcces({ acces: 'choisis' })).toBe('choisis')
    expect(modeAcces({ acces: 'tous' })).toBe('tous')
    // Une valeur inconnue écrite à la main en base ne doit pas verrouiller.
    expect(modeAcces({ acces: 'CHOISIS' } as unknown as SequenceSettings)).toBe('tous')
  })
})

describe('agentsParSequence', () => {
  it('regroupe par séquence et ignore les lignes incomplètes', () => {
    const map = agentsParSequence([
      ...attributions,
      { automation_id: '', agent_id: ADA },
      { automation_id: 'x', agent_id: '' },
    ])
    expect([...(map.get('restreinte') ?? [])].sort()).toEqual([ADA, BOB])
    expect(map.get('ada-seule')?.has(BOB)).toBe(false)
    expect(map.has('')).toBe(false)
    expect(map.has('x')).toBe(false)
  })
})

describe('sequencesDeLAgent', () => {
  it('ne remonte que les siennes', () => {
    expect([...sequencesDeLAgent(attributions, ADA)].sort()).toEqual(['ada-seule', 'restreinte'])
    expect([...sequencesDeLAgent(attributions, BOB)]).toEqual(['restreinte'])
    expect(sequencesDeLAgent(attributions, 'inconnu').size).toBe(0)
  })
})

describe('agentPeutVoir', () => {
  const map = agentsParSequence(attributions)

  it('laisse passer tout le monde sur une séquence ouverte', () => {
    expect(agentPeutVoir(seq('ouverte'), ADA, map)).toBe(true)
    expect(agentPeutVoir(seq('ouverte'), BOB, map)).toBe(true)
  })

  it('ne laisse passer que les agents nommés sur une séquence restreinte', () => {
    const s = seq('ada-seule', { acces: 'choisis' })
    expect(agentPeutVoir(s, ADA, map)).toBe(true)
    expect(agentPeutVoir(s, BOB, map)).toBe(false)
  })

  it('ferme la séquence restreinte à personne — pas l’inverse', () => {
    expect(agentPeutVoir(seq('orpheline', { acces: 'choisis' }), ADA, map)).toBe(false)
  })

  it('laisse tout voir à l’admin, y compris ce qui est restreint', () => {
    expect(agentPeutVoir(seq('orpheline', { acces: 'choisis' }), null, map)).toBe(true)
  })
})

describe('filtrerPourAgent', () => {
  const map = agentsParSequence(attributions)
  const liste = [
    seq('ouverte'),
    seq('restreinte', { acces: 'choisis' }),
    seq('ada-seule', { acces: 'choisis' }),
    seq('orpheline', { acces: 'choisis' }),
  ]

  it('rend la liste intacte côté admin', () => {
    expect(filtrerPourAgent(liste, null, map)).toBe(liste)
  })

  it('garde l’ordre reçu — les onglets ne doivent pas danser', () => {
    expect(filtrerPourAgent(liste, ADA, map).map((s) => s.id)).toEqual([
      'ouverte',
      'restreinte',
      'ada-seule',
    ])
    expect(filtrerPourAgent(liste, BOB, map).map((s) => s.id)).toEqual(['ouverte', 'restreinte'])
  })
})

describe('libelleAcces', () => {
  it('distingue l’état ouvert, la décision, et le cas où plus personne ne voit', () => {
    expect(libelleAcces('tous', 0)).toBe('Tous les agents')
    expect(libelleAcces('tous', 3)).toBe('Tous les agents')
    expect(libelleAcces('choisis', 0)).toBe('Aucun agent')
    expect(libelleAcces('choisis', 1)).toBe('1 agent')
    expect(libelleAcces('choisis', 2)).toBe('2 agents')
  })
})

describe('chargerAcces', () => {
  const client = (result: { data: unknown; error: unknown } | Error) => ({
    from: () => ({
      select: async () => {
        if (result instanceof Error) throw result
        return result
      },
    }),
  })

  it('construit la carte depuis la table', async () => {
    const map = await chargerAcces(client({ data: attributions, error: null }))
    expect([...(map.get('restreinte') ?? [])].sort()).toEqual([ADA, BOB])
  })

  it('rend une carte vide quand la table manque — sans vider le tableau de personne', async () => {
    expect((await chargerAcces(client(new Error('relation does not exist')))).size).toBe(0)
    expect((await chargerAcces(client({ data: null, error: { code: '42P01' } }))).size).toBe(0)
  })
})
