'use client'
// ExportVCard — mettre les numéros des prospects dans le téléphone.
//
// Le bouton « Exporter les contacts (vCard) » existait déjà dans les Paramètres,
// sans `onClick` : du décor. Ce composant le remplace.
//
// LE DÉCOMPTE AVANT LE CLIC
// Un export silencieux qui rend un fichier vide est indiscernable d'un export
// cassé. On demande donc d'abord le compte au serveur et on l'affiche : « 68
// entreprises · 91 fiches · 84 numéros ». Si c'est zéro, on le dit au lieu de
// télécharger un fichier de zéro octet.

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { authedFetch } from '@/utils/authedFetch'

type Portee = 'mine' | 'sequence' | 'all'

const PORTEES: { valeur: Portee; label: string; aide: string }[] = [
  { valeur: 'mine', label: 'Mes prospects', aide: 'Les entreprises qui me sont attribuées.' },
  { valeur: 'sequence', label: 'Sous séquence', aide: 'Uniquement ceux que je démarche en ce moment.' },
  { valeur: 'all', label: 'Tout le parc qualifié', aide: 'Toutes les entreprises qualifiées.' },
]

interface Compte {
  entreprises: number
  cartes: number
  numeros: number
  /** Nombre de fichiers à télécharger — cf. `TAILLE_LOT`. */
  lots: number
  tailleLot: number
}

export function ExportVCard() {
  const [portee, setPortee] = useState<Portee>('mine')
  const [compte, setCompte] = useState<Compte | null>(null)
  const [chargement, setChargement] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Lot à télécharger. Les répertoires mobiles n'enregistrent qu'une fiche
  // au-delà de quelques dizaines : on descend le carnet lot par lot.
  const [lot, setLot] = useState(1)
  const [faits, setFaits] = useState<Set<number>>(new Set())

  useEffect(() => {
    let annule = false
    setChargement(true)
    setErreur(null)
    authedFetch(`/api/prospects/vcard?portee=${portee}&compte=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Décompte indisponible')
        return (await res.json()) as Compte
      })
      .then((c) => {
        if (annule) return
        setCompte(c)
        setLot(1)
        setFaits(new Set())
      })
      .catch(() => {
        if (!annule) setCompte(null)
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [portee])

  const exporter = useCallback(async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const res = await authedFetch(`/api/prospects/vcard?portee=${portee}&lot=${lot}`)
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Export impossible')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = `prospects-${portee}-lot${lot}.vcf`
      document.body.appendChild(lien)
      lien.click()
      document.body.removeChild(lien)
      URL.revokeObjectURL(url)
      setFaits((f) => new Set(f).add(lot))
      // On avance tout seul : le geste suivant est le lot suivant, et
      // l'oubli d'un lot ne se voit pas dans le répertoire.
      setLot((n) => (compte && n < compte.lots ? n + 1 : n))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Export impossible')
    } finally {
      setEnCours(false)
    }
  }, [portee, lot, compte])

  const vide = compte != null && compte.cartes === 0
  const aide = PORTEES.find((p) => p.valeur === portee)?.aide

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="portee-vcard">Contacts à exporter</Label>
        <Select value={portee} onValueChange={(v) => setPortee(v as Portee)}>
          <SelectTrigger id="portee-vcard">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PORTEES.map((p) => (
              <SelectItem key={p.valeur} value={p.valeur}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
      </div>

      {compte && compte.lots > 1 ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-medium">
            {compte.lots} fichiers de {compte.tailleLot} fiches
          </p>
          <p className="text-xs text-muted-foreground">
            Les répertoires de téléphone n’enregistrent qu’une fiche sur un fichier de plusieurs centaines — sans dire
            pourquoi. Téléchargez et ouvrez les lots un par un.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {Array.from({ length: compte.lots }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLot(n)}
                aria-current={n === lot}
                aria-label={`Lot ${n}${faits.has(n) ? ', téléchargé' : ''}`}
                className={
                  'h-7 min-w-7 rounded border px-2 text-xs transition-colors ' +
                  (n === lot
                    ? 'border-foreground bg-foreground text-background'
                    : faits.has(n)
                      ? 'border-border bg-background text-muted-foreground line-through'
                      : 'border-border bg-background hover:bg-muted')
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        variant="outline"
        className="flex w-full items-center gap-2"
        onClick={exporter}
        disabled={enCours || chargement || vide}
      >
        {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {compte && compte.lots > 1 ? `Télécharger le lot ${lot} sur ${compte.lots}` : 'Exporter les contacts (vCard)'}
      </Button>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {chargement
          ? 'Décompte en cours…'
          : erreur
            ? erreur
            : vide
              ? 'Aucun prospect avec un numéro exploitable dans cette sélection.'
              : compte
                ? `${compte.entreprises} entreprise${compte.entreprises > 1 ? 's' : ''} · ${compte.cartes} fiche${compte.cartes > 1 ? 's' : ''} · ${compte.numeros} numéro${compte.numeros > 1 ? 's' : ''}`
                : 'Décompte indisponible — l’export reste possible.'}
      </p>
      <p className="text-xs text-muted-foreground">
        Chaque fiche porte le numéro de la personne et celui de son entreprise, avec son rôle. Ouvrez le fichier depuis
        le téléphone pour l’ajouter au répertoire — WhatsApp affichera alors le nom de l’entreprise au lieu du numéro.
      </p>
    </div>
  )
}
