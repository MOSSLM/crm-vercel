/**
 * Ce que l'écran d'envoi doit dire de vrai AVANT d'ouvrir WhatsApp.
 *
 * Deux défauts que ces tests tiennent fermés :
 *   · la carte affichait le texte préparé par le moteur même après qu'on ait
 *     basculé sur l'autre version — on lisait l'un, on envoyait l'autre ;
 *   · 47 entreprises du parc portent plusieurs numéros distincts, et l'écran
 *     n'en montrait aucun : impossible de savoir à qui on écrivait.
 */
import { numerosWhatsApp, texteDeLaVersion, versionsDisponibles } from '../EnvoiWhatsAppDialog'
import { taskForColumn } from '../SalesCells'
import type { SalesBoardRow, SalesColumn, SalesTaskInfo } from '../types'

const tache = (patch: Partial<SalesTaskInfo> = {}): SalesTaskInfo => ({
  id: 't1',
  kind: 'whatsapp',
  dueAt: '2026-08-16T09:00:00Z',
  message: 'Bonjour, je suis bien avec Toiture Martin ?',
  scriptName: null,
  phone: '+33642826963',
  linkedin: null,
  assigneeId: null,
  routingReason: null,
  stepId: 's1',
  variant: 'company',
  variantAlt: { variant: 'contact', message: 'Bonjour, je suis bien avec Julien de Toiture Martin ?' },
  ...patch,
})

const ligne = (patch: Partial<SalesBoardRow> = {}): SalesBoardRow =>
  ({
    id: 'opp-1',
    companyName: 'Toiture Martin',
    phone: null,
    contact: null,
    tasks: [],
    ...patch,
  }) as SalesBoardRow

const colonne = (patch: Partial<SalesColumn> = {}): SalesColumn => ({
  id: 'step:s3',
  group: 'sequence',
  label: 'WhatsApp 2',
  hint: null,
  mode: 'manual',
  color: '#000',
  kind: 'whatsapp',
  cta: 'Ouvrir WhatsApp',
  index: 2,
  ...patch,
})

describe('texteDeLaVersion', () => {
  it('rend le texte de la version demandée, pas celui que le moteur a choisi', () => {
    expect(texteDeLaVersion(tache(), 'company')).toMatch(/avec Toiture Martin/)
    expect(texteDeLaVersion(tache(), 'contact')).toMatch(/avec Julien de Toiture Martin/)
  })

  it('retombe sur le texte préparé quand le modèle n’a qu’une version', () => {
    const seule = tache({ variantAlt: null })
    expect(texteDeLaVersion(seule, 'contact')).toBe(seule.message)
  })

  it('ne rend rien plutôt qu’un texte inventé quand il n’y a pas de tâche', () => {
    expect(texteDeLaVersion(undefined, 'company')).toBe('')
  })
})

describe('versionsDisponibles', () => {
  it('n’annonce deux versions que s’il y en a réellement deux', () => {
    expect(versionsDisponibles(tache())).toEqual(['company', 'contact'])
    expect(versionsDisponibles(tache({ variantAlt: null }))).toEqual(['company'])
  })

  it('ne double pas une version que la tâche répète', () => {
    // Une tâche mal formée qui porterait deux fois la même version afficherait
    // sinon deux onglets identiques, dont l'un ne change rien.
    expect(versionsDisponibles(tache({ variantAlt: { variant: 'company', message: 'idem' } }))).toEqual(['company'])
  })
})

describe('taskForColumn', () => {
  it('prend la tâche de CETTE étape, pas la première du même canal', () => {
    // Une séquence à deux WhatsApp (s1 puis s3) : la carte de « WhatsApp 2 »
    // retrouvait le message de « WhatsApp 1 » simplement parce qu'il était
    // en tête de `row.tasks` — le prospect voyait « aucun message préparé »
    // ou, pire, le mauvais texte.
    const s1 = tache({ id: 't-s1', stepId: 's1', message: 'Accroche' })
    const s3 = tache({ id: 't-s3', stepId: 's3', message: 'Envoi du site démo' })
    const row = ligne({ tasks: [s1, s3] })
    expect(taskForColumn(row, colonne({ id: 'step:s3' }))?.id).toBe('t-s3')
    expect(taskForColumn(row, colonne({ id: 'step:s1' }))?.id).toBe('t-s1')
  })

  it('retombe sur le canal seul quand aucune tâche ne porte cette étape', () => {
    // Tâche hors moteur de séquence (ex. un appel posé à la main) : elle ne
    // porte pas de `stepId`, mais reste la seule candidate pour ce canal.
    const call = tache({ id: 't-call', kind: 'call', stepId: null })
    const row = ligne({ tasks: [call] })
    expect(taskForColumn(row, colonne({ id: 'step:s2', kind: 'call' }))?.id).toBe('t-call')
  })

  it('ne renvoie rien pour une colonne hors séquence', () => {
    const row = ligne({ tasks: [tache()] })
    expect(taskForColumn(row, colonne({ id: 'entry', kind: null }))).toBeUndefined()
  })
})

describe('numerosWhatsApp', () => {
  it('rend les numéros du prospect, mobiles d’abord, avec leur origine', () => {
    const numeros = numerosWhatsApp(
      ligne({
        joignable: {
          companyPhones: ['02 41 00 00 00'],
          contacts: [
            { id: 'c1', first_name: 'Julien', last_name: 'Martin', tel: '06 42 82 69 63', role_title: 'Gérant' },
          ],
        },
      }),
    )
    expect(numeros.map((n) => n.affichage)).toEqual(['06 42 82 69 63', '02 41 00 00 00'])
    expect(numeros[0].libelleOrigine).toBe('Julien Martin · Gérant')
    expect(numeros[1].libelleOrigine).toBe('fiche entreprise')
  })

  it('dédoublonne le même numéro écrit des deux côtés, et garde la personne', () => {
    // `Acticlimat` porte `06 42 82 69 63` sur la fiche entreprise et
    // `+33642826963` sur celle du gérant : un numéro, deux écritures. Deux
    // lignes à l'écran feraient croire à un choix qui n'existe pas.
    const numeros = numerosWhatsApp(
      ligne({
        joignable: {
          companyPhones: ['+33642826963'],
          contacts: [{ id: 'c1', first_name: 'Julien', last_name: 'Martin', tel: '06 42 82 69 63' }],
        },
      }),
    )
    expect(numeros).toHaveLength(1)
    expect(numeros[0].origine.kind).toBe('contact')
  })

  it('reste debout sur une réponse d’API antérieure au champ `joignable`', () => {
    // Le déploiement du front précède celui de l'API : sans ce repli, une carte
    // afficherait « aucun numéro » sur un prospect parfaitement joignable.
    const numeros = numerosWhatsApp(
      ligne({
        phone: '06 42 82 69 63',
        contact: { id: 'c1', name: 'Julien Martin', role: 'Gérant', email: null, phone: null },
      }),
    )
    expect(numeros.map((n) => n.affichage)).toEqual(['06 42 82 69 63'])
  })

  it('ne propose rien quand la fiche ne porte aucun numéro composable', () => {
    expect(numerosWhatsApp(ligne({ joignable: { companyPhones: [], contacts: [] } }))).toEqual([])
  })
})
