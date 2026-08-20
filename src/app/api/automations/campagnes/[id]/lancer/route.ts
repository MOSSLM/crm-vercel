// /api/automations/campagnes/[id]/lancer — inscrire un paquet de leads.
//
// LE LANCEMENT EST UNE BOUCLE SUR `enrollInSequence`, ET C'EST VOLONTAIRE. Le
// moteur porte déjà les deux gardes qui comptent : « ce qu'il faut pour
// démarcher, c'est un canal, pas une fiche contact », et la déduplication sur
// les inscriptions `active|paused`. Les réécrire ici, c'est se donner deux
// versions de la même règle et attendre qu'elles divergent.
//
// TROIS PRÉCAUTIONS, TOUTES PAYÉES D'AVANCE
//
// 1. **On rafraîchit les statuts d'abord.** `enrollInSequence` écrit
//    `current_step: 0` en dur : réinscrire quelqu'un qui a déjà répondu
//    écraserait son avancée et lui renverrait un premier contact. Le
//    rafraîchissement recalcule les motifs sur les faits du jour — dont
//    `a_deja_reagi`, qui se lit dans `vars.replies` — et ces leads sortent de
//    la file avant même d'être regardés.
//
// 2. **On lance PAR PAQUETS.** Le régulateur espace les e-mails, mais une étape
//    manuelle crée sa tâche TOUT DE SUITE. Lancer 300 WhatsApp d'un coup, c'est
//    300 cartes le même matin dans la file d'un agent qui en fait 60 : la file
//    devient illisible et les 240 autres ne se font jamais.
//
// 3. **Les contrôles bloquants refusent le lancement**, à commencer par
//    l'attente-réponse sans délai. C'est ce contrôle qui n'existait pas quand
//    59 inscriptions se sont garées sans réveil.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { enrollInSequence, processSequenceEnrollment } from '@/lib/automations/engine'
import type { SequenceEnrollment } from '@/components/automations/types'
import { controlesAvantLancement, lancementPermis } from '@/lib/automations/campagne'
import {
  ecarterLead,
  leadsALancer,
  marquerInscrit,
  rafraichirStatuts,
} from '@/lib/automations/campagne-db'
import {
  MIGRATION_LISTE,
  chargerCampagne,
  lancementSchema,
  migrationAbsente,
  type LancementBody,
} from '../../_campagne'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

/** Ce qu'est devenu chaque lead du paquet. Un mot par sort, jamais un booléen. */
type Sort = 'inscrit' | 'deja_inscrit' | 'sans_canal' | 'erreur'

export const POST = withAuth<LancementBody, Params>(
  { role: 'admin', body: lancementSchema },
  async ({ body, params, user, cors }) => {
    const sc = getServiceClient()
    const campagne = await chargerCampagne(sc, params.id)
    if (!campagne) return jsonError('campagne_introuvable', 404, { message: 'Cette campagne n’existe pas.' }, cors)

    const controles = controlesAvantLancement(campagne.steps, campagne.automation.status)
    if (!lancementPermis(controles)) {
      return jsonError(
        'lancement_refuse',
        409,
        {
          controles,
          message: controles.find((c) => c.gravite === 'bloquant')?.message ?? 'Cette campagne ne peut pas être lancée.',
        },
        cors,
      )
    }

    try {
      // L'état du jour, pas celui de l'ajout.
      const { misAJour } = await rafraichirStatuts(sc, params.id, campagne.cible)
      const leads = await leadsALancer(sc, params.id, body.taille)
      if (leads.length === 0) {
        return json({ lances: 0, statutsMisAJour: misAJour, resultats: [], restant: 0 }, { headers: cors })
      }

      // L'affaire de chaque prospect, en une requête pour tout le paquet.
      // L'inscription la porte pour que la ligne du pipeline commercial suive
      // la séquence — sans elle, le prospect avance et son affaire ne bouge pas.
      const ids = leads.map((l) => l.entrepriseId)
      const { data: oppData } = await sc
        .from('opportunites')
        .select('id, entreprise_id, contact_id, created_at')
        .in('entreprise_id', ids)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      const affaire = new Map<number, { id: string; contact_id: string | null }>()
      for (const o of (oppData ?? []) as { id: string; entreprise_id: number; contact_id: string | null }[]) {
        const cle = Number(o.entreprise_id)
        if (!affaire.has(cle)) affaire.set(cle, { id: o.id, contact_id: o.contact_id })
      }

      const premiereEtape = campagne.steps[0]?.kind ?? null
      const resultats: { entrepriseId: number; sort: Sort; enrollmentId: string | null }[] = []

      for (const lead of leads) {
        const opp = affaire.get(lead.entrepriseId) ?? null
        try {
          const { enrolled, enrollmentId } = await enrollInSequence(
            campagne.automation,
            {
              contact_id: lead.contactId ?? opp?.contact_id ?? null,
              entreprise_id: lead.entrepriseId,
              opportunite_id: opp?.id ?? null,
              event: 'campagne_lancement',
            },
            { createdBy: user.id },
          )

          if (!enrolled && !enrollmentId) {
            // Le moteur n'a trouvé ni adresse ni numéro. Ce n'est pas une
            // erreur, c'est un motif : il rejoint les écartés réparables et la
            // revue dira « enrichir » plutôt que « réessayer ».
            await ecarterLead(sc, params.id, lead.entrepriseId, 'sans_canal')
            resultats.push({ entrepriseId: lead.entrepriseId, sort: 'sans_canal', enrollmentId: null })
            continue
          }

          // Déjà inscrit : le lead EST dans la séquence, la liste doit le dire.
          await marquerInscrit(sc, params.id, lead.entrepriseId, enrollmentId)

          if (opp) {
            // La position de la ligne est dérivée de l'inscription : rien à
            // écrire de plus qu'un état propre. Sans risque d'écraser une date
            // posée à la main — un prospect qu'on a mis en attente a réagi,
            // donc il est déjà écarté par `a_deja_reagi`.
            await sc
              .from('sales_pipeline_state')
              .upsert(
                { opportunite_id: opp.id, state: 'progress', state_reason: null, nurture_at: null },
                { onConflict: 'opportunite_id' },
              )
          }

          // Une étape manuelle du jour 0 crée sa tâche tout de suite ; un
          // e-mail attend son créneau auprès du régulateur.
          if (enrolled && enrollmentId && premiereEtape && premiereEtape !== 'email') {
            const { data: enr } = await sc
              .from('sequence_enrollments')
              .select('*')
              .eq('id', enrollmentId)
              .maybeSingle()
            if (enr) await processSequenceEnrollment(enr as SequenceEnrollment).catch(() => {})
          }

          resultats.push({
            entrepriseId: lead.entrepriseId,
            sort: enrolled ? 'inscrit' : 'deja_inscrit',
            enrollmentId,
          })
        } catch {
          resultats.push({ entrepriseId: lead.entrepriseId, sort: 'erreur', enrollmentId: null })
        }
      }

      // Ce qui reste à lancer après ce paquet — le nombre qui dit s'il faut
      // recliquer demain, plutôt qu'un « lancé ! » qui laisse 200 leads en rade.
      const { count: restant } = await sc
        .from('campagne_leads')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', params.id)
        .eq('statut', 'a_lancer')

      return json(
        {
          lances: resultats.filter((r) => r.sort === 'inscrit').length,
          statutsMisAJour: misAJour,
          resultats,
          restant: restant ?? 0,
          avertissements: controles.filter((c) => c.gravite === 'avertissement'),
        },
        { headers: cors },
      )
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (migrationAbsente(err)) {
        return jsonError('migration_non_appliquee', 503, { sql_file: MIGRATION_LISTE, message: `${MIGRATION_LISTE} n’est pas appliquée.` }, cors)
      }
      return jsonError(err.message ?? 'erreur', 500, { message: err.message }, cors)
    }
  },
)
