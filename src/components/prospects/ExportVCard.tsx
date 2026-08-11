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
}

export function ExportVCard() {
  const [portee, setPortee] = useState<Portee>('mine')
  const [compte, setCompte] = useState<Compte | null>(null)
  const [chargement, setChargement] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

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
        if (!annule) setCompte(c)
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
      const res = await authedFetch(`/api/prospects/vcard?portee=${portee}`)
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(payload.message || 'Export impossible')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = `prospects-${portee}-${new Date().toISOString().slice(0, 10)}.vcf`
      document.body.appendChild(lien)
      lien.click()
      document.body.removeChild(lien)
      URL.revokeObjectURL(url)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Export impossible')
    } finally {
      setEnCours(false)
    }
  }, [portee])

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

      <Button
        variant="outline"
        className="flex w-full items-center gap-2"
        onClick={exporter}
        disabled={enCours || chargement || vide}
      >
        {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Exporter les contacts (vCard)
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
