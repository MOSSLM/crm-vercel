// /api/prospection/rapports — l'entonnoir, et il est une PARTITION.
//
// C'EST LE GRIEF N° 2, ET IL A UN NOM PRÉCIS : « les chiffres du haut comptent
// deux fois le même prospect ». Un prospect qui a répondu ET qui est chaud
// apparaissait dans les deux compteurs ; on additionnait, et le total dépassait
// le nombre de gens. Personne ne pouvait dire « où en est-on » sans recompter à
// la main.
//
// LA CORRECTION N'EST PAS UN CALCUL PLUS MALIN, C'EST UNE RÈGLE : **un lead est
// à UN SEUL étage — le plus loin qu'il ait atteint.** La somme des étages égale
// le nombre de leads, par construction (`entonnoir()` dans `statut-lead.ts`, et
// son test le vérifie sur des lots aléatoires).
//
// Les signaux, eux, restent cumulables — un prospect peut être « chaud » ET
// « en discussion ». Mais ce sont des FILTRES, pas des compteurs de prospects,
// et c'est la confusion des deux qui a produit le grief.
//
// CE QUE CETTE ROUTE NE FAIT PAS : les ouvertures et les clics. Ils ne se
// mesurent pas chez nous, et un rapport qui affiche « 0 ouverture » ferait
// croire à une absence de réaction là où il n'y a qu'une absence de mesure.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import type { MotifEcart, StatutListe } from '@/lib/automations/campagne'
import { entonnoir, type Engagement, type Progression } from '@/lib/automations/statut-lead'
import { releverLesStatuts, type LigneAJuger } from '@/lib/automations/statut-lead-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/**
 * Le plafond de lecture, et le pas des relevés.
 *
 * `releverLesStatuts` passe les identifiants à PostgREST dans l'URL : au-delà
 * de quelques centaines, la requête devient plus longue que ce que le proxy
 * accepte. On relève donc par paquets — et si le plafond est atteint, la route
 * le DIT. Un entonnoir tronqué en silence n'est plus une partition, c'est un
 * échantillon qui se fait passer pour un compte.
 */
const PLAFOND = 4000
const PAQUET = 400

const SANS_COHORTE = '(sans)'

/**
 * Le libellé d'une cohorte, relevé sur les codes réels.
 *
 * Le code porte déjà le critère (`A_site_faible`), et c'est ce critère qui doit
 * s'afficher : « cohorte A » ne dit rien à qui n'a pas le plan sous les yeux.
 * Un code inconnu ressort tel quel plutôt que d'être écrasé par un libellé
 * générique — mieux vaut un code brut qu'un mot qui ment.
 */
function libelleCohorte(code: string): string {
  if (code === SANS_COHORTE) return 'Hors cohorte'
  if (code === 'A_site_faible') return 'Cohorte A — site faible'
  if (code === 'B_sans_site') return 'Cohorte B — sans site'
  return code
}

type LigneListe = {
  entreprise_id: number
  statut: StatutListe
  motif_ecart: MotifEcart | null
}

export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const sb = getServiceClient()
  const sp = new URL(req.url).searchParams
  const automationId = sp.get('campagne')

  // Les campagnes qui ont une liste — celles qu'on peut mesurer. Une séquence
  // sans liste n'a pas d'entonnoir : elle a des inscriptions, ce qui n'est pas
  // la même chose et se lit ailleurs.
  const { data: autos, error: errAutos } = await sb
    .from('automations')
    .select('id, name, status')
    .eq('kind', 'sequence')
    .order('name')
  if (errAutos) return jsonError(errAutos.message, 500, { message: errAutos.message }, cors)

  let q = sb
    .from('campagne_leads')
    .select('automation_id, entreprise_id, statut, motif_ecart')
    .limit(PLAFOND + 1)
  if (automationId) q = q.eq('automation_id', automationId)

  const { data: leadsData, error } = await q
  if (error) {
    // La table peut ne pas exister : la migration se nomme, elle ne se devine pas.
    const code = (error as { code?: string }).code
    if (code === '42P01') {
      return jsonError(
        'migration_non_appliquee',
        503,
        { sql_file: 'sql/20260819_campagne_leads.sql', message: 'sql/20260819_campagne_leads.sql n’est pas appliquée.' },
        cors,
      )
    }
    return jsonError(error.message, 500, { message: error.message }, cors)
  }

  const brut = (leadsData ?? []) as (LigneListe & { automation_id: string })[]
  const tronque = brut.length > PLAFOND
  const lignes = tronque ? brut.slice(0, PLAFOND) : brut

  if (lignes.length === 0) {
    return json(
      { total: 0, tronque: false, entonnoir: [], parCohorte: [], campagnes: autos ?? [], campagne: automationId },
      { headers: cors },
    )
  }

  // La cohorte vit sur l'entreprise, pas sur la ligne de liste : c'est une
  // propriété du prospect, elle ne change pas parce qu'on l'inscrit ailleurs.
  const ids = [...new Set(lignes.map((l) => l.entreprise_id))]
  const cohortePar = new Map<number, string>()
  const emailPar = new Map<number, string | null>()
  for (let i = 0; i < ids.length; i += PAQUET) {
    const { data } = await sb
      .from('entreprises')
      .select('id, email, cohorte_demarchage')
      .in('id', ids.slice(i, i + PAQUET))
    for (const e of (data ?? []) as { id: number; email: string | null; cohorte_demarchage: string | null }[]) {
      cohortePar.set(Number(e.id), e.cohorte_demarchage ?? 'sans')
      emailPar.set(Number(e.id), e.email)
    }
  }

  // Un relevé par campagne : `releverLesStatuts` lit les inscriptions de LA
  // séquence qu'on lui nomme. Les mélanger ferait juger un lead de la campagne
  // A sur l'inscription qu'il a dans la campagne B.
  const parCampagne = new Map<string, LigneAJuger[]>()
  for (const l of lignes) {
    const liste = parCampagne.get(l.automation_id) ?? []
    liste.push({
      entrepriseId: l.entreprise_id,
      statutListe: l.statut,
      motifEcart: l.motif_ecart,
      email: emailPar.get(l.entreprise_id) ?? null,
    })
    parCampagne.set(l.automation_id, liste)
  }

  const juges: { entrepriseId: number; progression: Progression; engagement: Engagement }[] = []
  for (const [auto, liste] of parCampagne) {
    for (let i = 0; i < liste.length; i += PAQUET) {
      const paquet = liste.slice(i, i + PAQUET)
      const releve = await releverLesStatuts(sb, auto, paquet)
      for (const ligne of paquet) {
        const s = releve.get(ligne.entrepriseId)
        if (s) juges.push({ entrepriseId: ligne.entrepriseId, progression: s.progression, engagement: s.engagement })
      }
    }
  }

  const global = entonnoir(juges)

  // Par cohorte, la MÊME partition. C'est la comparaison qui gouverne toute la
  // campagne d'août — site faible contre sans site — et elle n'a de sens que si
  // les deux colonnes se lisent avec la même règle.
  // LES CODES NE SE DEVINENT PAS. Ils valent `A_site_faible` et `B_sans_site`
  // en base — pas `A` et `B`. Les écrire en dur rangeait tout le monde dans
  // « sans cohorte », et le rapport aurait annoncé que la comparaison d'août
  // n'existe pas. Elle est effectivement maigre (20 leads en A, 1 en B), mais
  // c'est une mesure, pas un bug de libellé : on lit donc ce qui est là.
  const presentes = [...new Set(juges.map((j) => cohortePar.get(j.entrepriseId) ?? SANS_COHORTE))]
  presentes.sort((a, b) => (a === SANS_COHORTE ? 1 : b === SANS_COHORTE ? -1 : a.localeCompare(b)))
  const parCohorte = presentes
    .map((c) => {
      const sous = juges.filter((j) => (cohortePar.get(j.entrepriseId) ?? SANS_COHORTE) === c)
      return { cohorte: c, label: libelleCohorte(c), total: sous.length, etages: entonnoir(sous) }
    })
    .filter((x) => x.total > 0)

  return json(
    {
      total: juges.length,
      tronque,
      entonnoir: global,
      parCohorte,
      campagnes: autos ?? [],
      campagne: automationId,
    },
    { headers: cors },
  )
})
