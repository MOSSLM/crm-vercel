'use client'
// GestesDuLot — l'en-tête de la fiche d'un lot : ce qu'il est, et quoi lancer.
//
// POURQUOI CET EN-TÊTE EXISTE. La fiche d'un lot listait ses entreprises et ce
// qui les bloque, sans jamais dire quoi FAIRE du lot. Les gestes existaient
// pourtant tous : le lissage accepte un `lotId` depuis le 26/08, les plaquettes
// aussi, et verser un lot dans une campagne est une route. Ils vivaient à trois
// endroits différents, dont deux réservés au téléphone.
//
// UN SEUL BOUTON EST MIS EN AVANT, et c'est la même règle que l'écran des lots
// applique à sa dernière colonne. Montrer les trois à égalité laisse choisir par
// quoi commencer, et on choisira le plus gros — alors que chercher la présence
// web d'entreprises non rapprochées du registre, c'est chercher sur des noms
// faux. `gesteConseille` décide, à partir de l'ordre des sept axes.
//
// CE QUI NE SE LANCE PAS D'ICI EST NOMMÉ, PAS CACHÉ. Fabriquer une démo,
// préparer un audit, attribuer : trois axes qui se comblent ailleurs, dont un
// qui demande le poste local. Un lot bloqué là-dessus n'a plus de bouton — sans
// la ligne « et ce qui n'est pas ici », il paraîtrait fini.
import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileText, Loader2, Play, Send, Sparkles } from 'lucide-react'

import { authedFetch } from '@/utils/authedFetch'
import { avancement, pretADemarcher, type Couverture } from '@/lib/lots/couverture'
import { GESTES, ailleurs, gesteConseille, porteeDuGeste, type CleGeste } from '@/lib/lots/gestes'
import { partPrete, type PretDemo } from '@/lib/lots/pret-demo'

const nombre = (n: number): string => n.toLocaleString('fr-FR')
const pourcent = (v: number): string => `${Math.round(v * 100)} %`

const ICONE: Record<CleGeste, React.ComponentType<{ size?: number }>> = {
  lisser: Play,
  campagne: Send,
  plaquettes: FileText,
}

interface CampagneChoisissable {
  id: string
  nom: string
  statut: string
}

export function GestesDuLot({ lot, pretDemo, onLance }: {
  lot: Couverture
  pretDemo: PretDemo | null
  onLance: () => void
}) {
  const [enCours, setEnCours] = useState<CleGeste | null>(null)
  const [campagnes, setCampagnes] = useState<CampagneChoisissable[]>([])
  const [campagneChoisie, setCampagneChoisie] = useState('')

  // Les campagnes ne se chargent qu'une fois : elles ne dépendent pas du lot.
  // Un échec laisse le menu vide et le bouton désactivé — le reste de l'écran
  // n'a pas à tomber pour autant.
  useEffect(() => {
    void (async () => {
      try {
        const r = await authedFetch('/api/automations/campagnes')
        if (!r.ok) return
        const j = (await r.json()) as { campagnes?: CampagneChoisissable[] }
        // Les archivées ne se proposent pas : y verser des leads serait un
        // geste sans suite, et le menu doit refuser ce qu'il ne sert pas.
        setCampagnes((j.campagnes ?? []).filter((c) => c.statut !== 'archived'))
      } catch {
        /* le menu restera vide */
      }
    })()
  }, [])

  const lisser = useCallback(async () => {
    const r = await authedFetch('/api/lissage/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: lot.lotId }),
    })
    const c = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) throw new Error(String(c.message ?? c.error ?? `Échec (${r.status})`))

    const ajoutes = Number(c.ajoutes ?? 0)
    const dispo = Number(c.total_disponible ?? ajoutes)
    toast.success(`Passe créée — ${nombre(ajoutes)} fiches en file`, {
      description:
        dispo > ajoutes
          ? `Le lot en compte ${nombre(dispo)} : le reste attendra une passe suivante.`
          : 'La file avance depuis Prospection → Lissage.',
    })
  }, [lot.lotId])

  const preparerPlaquettes = useCallback(async () => {
    const r = await authedFetch('/api/atelier/plaquettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: lot.lotId }),
    })
    const c = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) throw new Error(String(c.error ?? `Échec (${r.status})`))

    const preparees = Number(c.preparees ?? 0)
    const restantes = Number(c.restantes ?? 0)
    if (preparees === 0 && restantes === 0) {
      toast.info('Toutes les plaquettes de ce lot sont déjà prêtes')
      return
    }
    toast.success(`${nombre(preparees)} plaquette${preparees > 1 ? 's' : ''} préparée${preparees > 1 ? 's' : ''}`, {
      description: restantes > 0 ? `${nombre(restantes)} restent à préparer.` : undefined,
    })
  }, [lot.lotId])

  const verserEnCampagne = useCallback(async () => {
    const r = await authedFetch(`/api/automations/campagnes/${campagneChoisie}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origine: 'lot', lot_id: lot.lotId }),
    })
    const c = (await r.json().catch(() => ({}))) as {
      error?: string
      message?: string
      ajoutes?: number
      deja?: number
      restant?: number
      revue?: { ecartes: number; parMotif: { label: string; n: number }[] }
    }
    if (!r.ok) throw new Error(c.message ?? c.error ?? `Échec (${r.status})`)

    const ajoutes = c.ajoutes ?? 0
    // LES ÉCARTÉS SE DISENT AVEC LEUR MOTIF, jamais comme un simple reste.
    // « 41 écartés » ne dit ni quoi corriger ni si c'est grave ; « dont 22 sans
    // canal » désigne le geste suivant, qui est d'enrichir.
    const premier = c.revue?.parMotif?.[0]
    const morceaux = [
      c.deja ? `${nombre(c.deja)} y étaient déjà` : null,
      c.revue?.ecartes
        ? `${nombre(c.revue.ecartes)} écarté${c.revue.ecartes > 1 ? 's' : ''}${premier ? ` (dont ${nombre(premier.n)} : ${premier.label})` : ''}`
        : null,
      c.restant ? `${nombre(c.restant)} encore à verser` : null,
    ].filter(Boolean)

    toast.success(`${nombre(ajoutes)} lead${ajoutes > 1 ? 's' : ''} versé${ajoutes > 1 ? 's' : ''} dans la campagne`, {
      description: morceaux.length ? morceaux.join(' · ') : 'Rien n’est parti : la revue avant lancement décide.',
    })
  }, [campagneChoisie, lot.lotId])

  const lancer = async (cle: CleGeste) => {
    setEnCours(cle)
    try {
      if (cle === 'lisser') await lisser()
      else if (cle === 'plaquettes') await preparerPlaquettes()
      else await verserEnCampagne()
      onLance()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Geste impossible')
    } finally {
      setEnCours(null)
    }
  }

  const conseille = gesteConseille(lot)
  const restes = ailleurs(lot)
  const pret = pretADemarcher(lot)

  return (
    <div className="lot-gestes">
      <div className="lot-gestes-etat">
        <span className="lot-gestes-jauge" aria-hidden="true">
          <i style={{ width: `${Math.round(avancement(lot) * 100)}%` }} />
        </span>
        <span className="lot-gestes-chiffres">
          <b>{nombre(lot.total)}</b> entreprise{lot.total > 1 ? 's' : ''} · préparé à{' '}
          <b>{pourcent(avancement(lot))}</b>
          {pretDemo && pretDemo.total > 0 ? (
            <>
              {' '}· <b>{nombre(pretDemo.pretes)}</b> fabricable
              {pretDemo.pretes > 1 ? 's' : ''} tout de suite ({pourcent(partPrete(pretDemo))})
            </>
          ) : null}
        </span>
        {pret && <span className="lem-pill">Prêt à démarcher</span>}
      </div>

      <div className="lot-gestes-rangee">
        {GESTES.map((g) => {
          const Icone = ICONE[g.cle]
          const principal = conseille?.cle === g.cle
          const portee = porteeDuGeste(lot, g)
          const occupe = enCours === g.cle
          const bloque = enCours !== null || (g.cle === 'campagne' && !campagneChoisie)
          return (
            <div key={g.cle} className="lot-geste" data-principal={principal ? 'oui' : undefined}>
              {g.cle === 'campagne' && (
                <select
                  className="lem-champ"
                  value={campagneChoisie}
                  onChange={(e) => setCampagneChoisie(e.target.value)}
                  aria-label="Campagne où verser le lot"
                >
                  <option value="">
                    {campagnes.length ? 'Choisir une campagne…' : 'Aucune campagne'}
                  </option>
                  {campagnes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className={principal ? 'lem-btn principal' : 'lem-btn'}
                onClick={() => void lancer(g.cle)}
                disabled={bloque}
                title={g.fait}
              >
                {occupe ? <Loader2 size={14} className="lot-tourne" aria-hidden="true" /> : <Icone size={14} />}
                {g.libelle}
              </button>
              <span className="lot-geste-aide">
                {portee > 0 ? `${nombre(portee)} fiches à faire avancer` : g.fait}
              </span>
            </div>
          )
        })}
      </div>

      {restes.length > 0 && (
        <p className="lot-gestes-ailleurs">
          <Sparkles size={13} aria-hidden="true" />
          <span>
            Et ce qui ne se lance pas d’ici :{' '}
            {restes.map((r, i) => (
              <React.Fragment key={r.axe}>
                {i > 0 && ' · '}
                <b>{nombre(r.combien)}</b> — {r.axe.toLowerCase()} ({r.ou})
              </React.Fragment>
            ))}
            .{' '}
            <Link className="lem-lien" href="/atelier">
              L’atelier
            </Link>{' '}
            compte ce qui attend le poste local.
          </span>
        </p>
      )}
    </div>
  )
}
