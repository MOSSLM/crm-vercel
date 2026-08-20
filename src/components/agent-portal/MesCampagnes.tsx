'use client'
// MesCampagnes — où en sont MES prospects. Lecture seule, et c'est le sujet.
//
// UN AGENT NE CONÇOIT PAS D'AUDIENCE : ni constructeur, ni segment, ni
// délivrabilité, aucun bouton qui écrit. C'est la décision qui garde son écran
// lisible — et c'est aussi ce qui permet à cet écran de tout montrer sans
// danger.
//
// LA COLONNE QUI COMPTE EST « GARÉES », PAS « TOTAL ».
// Une campagne peut afficher 153 inscrits et n'avancer sur aucun : c'est
// exactement l'état dans lequel 59 inscriptions ont dormi des semaines sans que
// personne le voie, parce qu'aucun écran ne montrait autre chose qu'un total.
// Ici le motif de gel est rendu en français (les 18 libellés du régulateur) et
// avec trois exemples nommés : un agent doit pouvoir dire « pourquoi Untel
// n'avance pas », pas seulement « 12 sont bloqués ».
//
// TROIS VIDES, TROIS PHRASES — comme partout ailleurs dans cette refonte :
// aucun portefeuille · aucune campagne · la lecture a échoué. Les fondre ferait
// lire « vous n'avez pas de campagne » à quelqu'un dont la session a expiré.
import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, PauseCircle, RefreshCw, Send } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Motif {
  motif: string
  libelle: string
  /** Aucune date de réveil : celle-là ne repartira jamais toute seule. */
  sansReveil: boolean
  combien: number
  exemples: string[]
}

interface Campagne {
  id: string
  nom: string
  statut: string
  total: number
  actives: number
  garees: number
  sorties: number
  ontRepondu: number
  prochaine: string | null
  motifs: Motif[]
}

const quand = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

const STATUT: Record<string, string> = {
  on: 'en service',
  draft: 'brouillon',
  paused: 'en pause',
  off: 'arrêtée',
}

function Chiffre({ valeur, libelle, alerte }: { valeur: number; libelle: string; alerte?: boolean }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: alerte && valeur > 0 ? 'var(--destructive, #b3261e)' : undefined }}>
        {valeur}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{libelle}</div>
    </div>
  )
}

export default function MesCampagnes() {
  const [campagnes, setCampagnes] = useState<Campagne[] | null>(null)
  const [sansPortefeuille, setSansPortefeuille] = useState(false)
  const [panne, setPanne] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)

  const charger = useCallback(async () => {
    setChargement(true)
    setPanne(null)
    try {
      const r = await authedFetch('/api/agent/campagnes')
      const j = await r.json()
      if (!r.ok) {
        setPanne(j?.message || j?.error || 'lecture impossible')
        setCampagnes(null)
        return
      }
      setCampagnes(j.campagnes ?? [])
      setSansPortefeuille(Boolean(j.sansPortefeuille))
    } catch {
      setPanne('le serveur n’a pas répondu')
      setCampagnes(null)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Send size={18} /> Mes campagnes
          </h1>
          <p className="text-sm opacity-70 max-w-2xl">
            En lecture seule : vous voyez où en sont vos prospects, vous ne modifiez pas la
            campagne. <strong>Regardez d’abord la colonne « garées »</strong> — une campagne peut
            porter cent inscrits et n’avancer sur aucun.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void charger()} disabled={chargement}>
          <RefreshCw size={14} className="mr-1" /> Rafraîchir
        </Button>
      </div>

      {panne ? (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} /> Vos campagnes n’ont pas pu être lues.
            </div>
            <p className="text-sm opacity-70 mt-1">
              {panne}. Ce n’est pas « aucune campagne » — on ne sait pas.
            </p>
          </CardContent>
        </Card>
      ) : chargement ? (
        <p className="text-sm opacity-70">Lecture…</p>
      ) : sansPortefeuille ? (
        // « On ne vous a attribué personne » et « vous n'êtes dans aucune
        // campagne » ne se corrigent pas de la même façon : le premier est une
        // attribution à demander, le second une inscription à faire.
        <Card>
          <CardContent className="p-6">
            <div className="font-medium">Aucune entreprise ne vous est attribuée.</div>
            <p className="text-sm opacity-70 mt-1">
              La lecture a réussi : votre portefeuille est vide. Demandez une attribution à
              l’administrateur — sans entreprise, aucune campagne ne peut vous concerner.
            </p>
          </CardContent>
        </Card>
      ) : (campagnes ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="font-medium">Aucun de vos prospects n’est dans une campagne.</div>
            <p className="text-sm opacity-70 mt-1">
              Vous avez bien un portefeuille : ce sont les inscriptions qui manquent. C’est
              l’administrateur qui verse les leads dans une campagne.
            </p>
          </CardContent>
        </Card>
      ) : (
        (campagnes ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {c.nom}
                <span className="text-xs font-normal rounded-full px-2 py-0.5 border">
                  {STATUT[c.statut] ?? c.statut}
                </span>
                {c.prochaine && (
                  <span className="text-xs font-normal opacity-70">
                    prochaine échéance {quand(c.prochaine)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-6 flex-wrap">
                <Chiffre valeur={c.total} libelle="de vos prospects" />
                <Chiffre valeur={c.actives} libelle="avancent" />
                <Chiffre valeur={c.garees} libelle="garées" alerte />
                <Chiffre valeur={c.ontRepondu} libelle="ont répondu" />
                <Chiffre valeur={c.sorties} libelle="sorties" />
              </div>

              {c.garees > 0 && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <PauseCircle size={14} /> Pourquoi elles n’avancent pas
                  </div>
                  {/* UNE ATTENTE AVEC RELANCE PRÉVUE SE TERMINE TOUTE SEULE ;
                      une attente sans réveil, jamais. C'est la seule ligne sur
                      laquelle un agent doit agir aujourd'hui — elle est donc la
                      seule à porter la teinte d'alerte. */}
                  {c.motifs.map((m) => (
                    <div key={`${m.motif}-${m.sansReveil}`} className="flex gap-2">
                      <span className="font-medium">{m.combien}</span>
                      <span className={m.sansReveil ? 'font-medium' : undefined}>{m.libelle}</span>
                      {m.exemples.length > 0 && (
                        <span className="opacity-60">— {m.exemples.join(', ')}…</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Ne JAMAIS peindre une réponse normale en panne : zéro garée est
                  une bonne nouvelle, pas un vide à expliquer. */}
              {c.garees === 0 && c.total > 0 && (
                <p className="text-sm opacity-70">Aucune de vos inscriptions n’est bloquée.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
