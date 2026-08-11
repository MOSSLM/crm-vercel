'use client'
// NumeroPicker — quel numéro composer, quand le prospect en a plusieurs.
//
// 47 entreprises du parc qualifié portent plusieurs numéros réellement
// distincts : un standard et le portable du gérant, deux mobiles, parfois trois
// lignes. L'interface n'en montrait qu'un, celui que le moteur avait retenu, et
// l'agent n'avait aucun moyen de savoir qu'il en existait d'autres — ni, quand
// ça ne répondait pas, d'en essayer un second.
//
// CE QUE CE COMPOSANT NE FAIT PAS
// Il n'écrit rien. Le choix vaut pour l'envoi en cours et disparaît avec lui :
// la file de démarchage n'est pas l'endroit où l'on corrige une fiche, et
// promouvoir en base le numéro qu'on vient d'essayer changerait le comportement
// du moteur pour toutes les étapes suivantes sans que personne l'ait demandé.

import { useMemo } from 'react'
import type { NumeroProspect, SourceNumeros, UsageNumero } from '@/lib/prospects/numeros'
import { numerosDuProspect } from '@/lib/prospects/numeros'
import { toE164 } from '@/lib/telephony/phone'
import type { ProspectionTaskFull } from './prospection-db'

/**
 * Ce qu'une tâche sait des numéros de son prospect.
 *
 * Le contact lié à la tâche est ajouté à ceux de l'entreprise : il en fait
 * partie, mais l'embed `entreprises.contacts` peut ne pas le contenir si la
 * tâche pointe une fiche rattachée autrement. Le dédoublonnage par E.164 rend
 * ce doublon inoffensif.
 */
export function sourceNumeros(task: ProspectionTaskFull): SourceNumeros {
  return {
    entreprise: {
      name: task.entreprises?.name ?? null,
      telephone: task.entreprises?.telephone ?? null,
      telephones: task.entreprises?.telephones ?? null,
    },
    contacts: [...(task.entreprises?.contacts ?? []), ...(task.contacts ? [task.contacts] : [])],
  }
}

const TYPE_LABEL: Record<NumeroProspect['type'], string> = {
  mobile: 'Mobile',
  fixe: 'Fixe',
  autre: 'Autre',
}

/**
 * Les numéros d'un prospect, et celui qui est sélectionné.
 *
 * `prefere` est le numéro que le moteur a retenu (`task.payload.phone`) : c'est
 * lui qui est coché par défaut, pour que rien ne change tant qu'on ne touche à
 * rien.
 */
export function useNumeros(
  source: SourceNumeros,
  usage: UsageNumero,
  prefere?: string | null,
): NumeroProspect[] {
  return useMemo(() => {
    const tous = numerosDuProspect(source, usage)
    const cible = toE164(prefere)
    if (!cible) return tous
    // Le préféré remonte en tête sans être dupliqué. S'il n'est pas dans la
    // liste — numéro retenu par le moteur puis retiré de la fiche — l'ordre
    // normal s'applique, plutôt que de proposer une ligne qui n'existe plus.
    const i = tous.findIndex((n) => n.e164 === cible)
    if (i <= 0) return tous
    return [tous[i], ...tous.slice(0, i), ...tous.slice(i + 1)]
  }, [source, usage, prefere])
}

export function NumeroPicker({
  numeros,
  selection,
  onSelect,
  label = 'Numéro',
}: {
  numeros: NumeroProspect[]
  selection: string | null
  onSelect: (e164: string) => void
  label?: string
}) {
  if (numeros.length === 0) {
    return (
      <div className="numero-picker vide">
        <span className="numero-picker-label">{label}</span>
        <span className="numero-picker-aucun">Aucun numéro exploitable</span>
      </div>
    )
  }

  // Un seul numéro : rien à choisir, donc pas de sélecteur — juste le numéro et
  // d'où il vient.
  if (numeros.length === 1) {
    const seul = numeros[0]
    return (
      <div className="numero-picker unique">
        <span className="numero-picker-label">{label}</span>
        <span className="numero-picker-valeur">{seul.affichage}</span>
        <span className="numero-picker-origine">{seul.libelleOrigine}</span>
      </div>
    )
  }

  return (
    <fieldset className="numero-picker">
      <legend className="numero-picker-label">
        {label} — {numeros.length} numéros connus
      </legend>
      {numeros.map((n) => (
        <label key={n.e164} className="numero-picker-choix" data-actif={n.e164 === selection}>
          <input
            type="radio"
            name={`numero-${label}`}
            value={n.e164}
            checked={n.e164 === selection}
            onChange={() => onSelect(n.e164)}
          />
          <span className="numero-picker-valeur">{n.affichage}</span>
          <span className="numero-picker-type">{TYPE_LABEL[n.type]}</span>
          <span className="numero-picker-origine">{n.libelleOrigine}</span>
        </label>
      ))}
    </fieldset>
  )
}
