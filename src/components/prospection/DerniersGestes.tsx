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
//
// La mécanique (lecture, annulation, refus) vit dans `useGestes` : le même
// bloc existe dans « Ma journée » sous la charte de la maquette — voir
// `DemRetour`. Ici, il ne reste que l'habillage lemlist.
import React from 'react'
import { AlertTriangle, Undo2 } from 'lucide-react'
import { LIBELLE_GESTE, depuis, useGestes } from '@/hooks/useGestes'
import './lem-skin.css'

export function DerniersGestes({
  endpoint = '/api/prospection/gestes',
  apres,
}: {
  endpoint?: string
  /** Rappelé après une annulation réussie : l'écran d'à côté doit se relire. */
  apres?: () => void
}) {
  const { gestes, enCours, annuler } = useGestes({ endpoint, apres })

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
                  {LIBELLE_GESTE[g.geste]}
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
