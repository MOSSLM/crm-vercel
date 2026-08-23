'use client'
// DerniersGestes — le retour en arrière qui manquait.
//
// LE BESOIN, DIT PAR MATTEO : « il se peut qu'on ait fait des erreurs en
// appuyant sur le fait que le message a été envoyé, ou en sautant une étape
// sans faire exprès, et il n'y a pas de retour en arrière. Pas un Ctrl-Z à
// faire direct après, mais un réel bouton pour revenir à la tâche précédente. »
//
// D'OÙ LA FORME : une liste persistante, pas une notification qui passe. Une
// annulation qu'il faut attraper dans les trois secondes ne sert qu'à celui qui
// se rend compte tout de suite — or on se rend compte plus tard, en relisant sa
// file et en trouvant une tâche qui n'aurait pas dû être faite.
//
// CE QU'ON NE CACHE PAS : quand un geste n'est PLUS annulable, la ligne reste
// affichée avec sa raison en clair. Un bouton grisé sans motif est exactement
// ce qu'on remplace — la phrase dit quoi faire, le plus souvent « annule
// l'autre d'abord ».
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Undo2 } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import './lem-skin.css'

interface Geste {
  id: string
  geste: 'terminer' | 'ignorer' | 'reporter'
  faitLe: string
  entreprise: string | null
  titre: string | null
  resume: string
  verdict: { possible: boolean; motif: string }
}

const LIBELLE: Record<Geste['geste'], string> = {
  terminer: 'Terminée',
  ignorer: 'Ignorée',
  reporter: 'Reportée',
}

/** « il y a 4 min », « il y a 2 h », « le 21/08 » — jamais un horodatage brut. */
function depuis(iso: string): string {
  const quand = new Date(iso).getTime()
  if (Number.isNaN(quand)) return ''
  const minutes = Math.floor((Date.now() - quand) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 60 * 24) return `il y a ${Math.floor(minutes / 60)} h`
  return `le ${new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

export function DerniersGestes({
  endpoint = '/api/prospection/gestes',
  apres,
}: {
  endpoint?: string
  /** Rappelé après une annulation réussie : l'écran d'à côté doit se relire. */
  apres?: () => void
}) {
  const [gestes, setGestes] = useState<Geste[]>([])
  const [enCours, setEnCours] = useState<string | null>(null)

  const recharger = useCallback(async () => {
    try {
      const res = await authedFetch(`${endpoint}?limite=8`)
      if (!res.ok) return // migration absente ou droits : on ne montre rien
      const data = await res.json()
      setGestes(Array.isArray(data?.gestes) ? data.gestes : [])
    } catch {
      // silencieux : ce bloc est un confort, il ne doit jamais casser la page
    }
  }, [endpoint])

  useEffect(() => {
    void recharger()
  }, [recharger])

  const annuler = async (g: Geste) => {
    setEnCours(g.id)
    try {
      const res = await authedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: g.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Annulation impossible')
      toast.success(`C’est revenu en arrière : ${data.motif}`)
      await recharger()
      apres?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Annulation impossible')
    } finally {
      setEnCours(null)
    }
  }

  // RIEN À MONTRER, RIEN À AFFICHER. Un bloc vide « aucun geste récent » n'aide
  // personne et occupe le haut d'un écran qui sert à autre chose.
  if (gestes.length === 0) return null

  return (
    <div className="lem-carte" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Undo2 size={15} />
        <strong style={{ fontSize: 14 }}>Revenir en arrière</strong>
        <span className="lem-pill" data-ton="neutre">{gestes.length} geste(s) récent(s)</span>
      </div>
      <p className="lem-second" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        Annuler repose l’état d’avant : la tâche revient dans la file, la séquence retrouve son
        étape. Cela ne rappelle aucun message déjà parti — quand il y en a eu un, c’est dit ici
        et l’annulation est refusée.
      </p>

      <table className="lem-table">
        <tbody>
          {gestes.map((g) => (
            <tr key={g.id}>
              <td style={{ width: 92 }}>
                <span className="lem-pill" data-ton={g.geste === 'ignorer' ? 'attention' : 'neutre'}>
                  {LIBELLE[g.geste]}
                </span>
              </td>
              <td>
                <div>{g.entreprise ?? g.titre ?? 'Tâche'}</div>
                <div className="lem-second" style={{ fontSize: 11.5 }}>
                  {g.titre && g.entreprise ? `${g.titre} · ` : ''}
                  {depuis(g.faitLe)}
                  {g.verdict.possible ? ` · ${g.resume}` : ''}
                </div>
              </td>
              <td style={{ width: 260, textAlign: 'right' }}>
                {g.verdict.possible ? (
                  <button
                    className="lem-btn"
                    disabled={enCours === g.id}
                    onClick={() => void annuler(g)}
                  >
                    <Undo2 size={13} /> {enCours === g.id ? 'Annulation…' : 'Annuler'}
                  </button>
                ) : (
                  <span
                    className="lem-second"
                    style={{ fontSize: 11.5, display: 'inline-flex', gap: 5, textAlign: 'left' }}
                  >
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    {g.verdict.motif}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
