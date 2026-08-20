'use client'
// Delivrabilite — l'état d'authentification de nos domaines.
//
// LA DÉLIVRABILITÉ EST UN PRODUIT, PAS UNE CASE À COCHER : c'est l'un des huit
// principes relevés chez lemlist, et c'est celui qui manquait le plus. Le CRM
// portait déjà toute la mécanique — vérificateur d'adresses, suppressions,
// disjoncteur de rebonds, plages et plafonds — mais aucun écran ne disait si le
// domaine lui-même était en règle. On réglait le débit d'un robinet sans savoir
// si le tuyau était branché.
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { authedFetch } from '@/utils/authedFetch'
import type { Constat, RapportDns } from '@/lib/email/dns-delivrabilite'
import './lem-skin.css'

interface Etat {
  expediteur: string | null
  adresseDeReponse: string | null
  sousAdressage: boolean
  envoi: RapportDns | null
  reception: RapportDns | null
  reglages: {
    daily_cap: number | null
    paused: boolean | null
    bounce_guard: boolean | null
    bounce_guard_threshold: number | null
    verify_before_send: boolean | null
    test_mode: boolean | null
    canaux_suspendus: string[] | null
  } | null
}

const LIGNES: { cle: keyof Pick<RapportDns, 'spf' | 'dkim' | 'dmarc' | 'mx'>; titre: string; quoi: string }[] = [
  { cle: 'spf', titre: 'SPF', quoi: 'qui a le droit d’envoyer pour ce domaine' },
  { cle: 'dkim', titre: 'DKIM', quoi: 'la signature qui prouve que le message n’a pas été modifié' },
  { cle: 'dmarc', titre: 'DMARC', quoi: 'ce qu’un serveur doit faire quand SPF et DKIM échouent' },
  { cle: 'mx', titre: 'MX', quoi: 'où arrive le courrier adressé à ce domaine' },
]

function Ligne({ titre, quoi, constat, bloquant }: { titre: string; quoi: string; constat: Constat; bloquant: boolean }) {
  return (
    <tr>
      <td style={{ width: 78 }}>
        {constat.ok ? (
          <span className="lem-pill" data-ton="ok"><Check size={12} /> {titre}</span>
        ) : (
          <span className="lem-pill" data-ton={bloquant ? 'danger' : 'attention'}>
            <X size={12} /> {titre}
          </span>
        )}
      </td>
      <td>
        <div className="lem-second" style={{ fontSize: 12 }}>{quoi}</div>
        {constat.valeur && (
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, marginTop: 3, wordBreak: 'break-all' }}>
            {constat.valeur}
          </div>
        )}
        {constat.erreur && (
          <div style={{ fontSize: 12.5, marginTop: 3, color: bloquant ? 'var(--lem-danger)' : 'var(--lem-attention)' }}>
            {constat.erreur}
          </div>
        )}
        {constat.note && (
          <div style={{ fontSize: 12.5, marginTop: 3, color: 'var(--lem-gris-2)' }}>{constat.note}</div>
        )}
      </td>
    </tr>
  )
}

function Domaine({ rapport, role }: { rapport: RapportDns; role: string }) {
  return (
    <div className="lem-carte" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{rapport.domaine}</h2>
        <span className="lem-pill" data-ton="neutre">{role}</span>
        {rapport.ok ? (
          <span className="lem-pill" data-ton="ok">en règle</span>
        ) : (
          <span className="lem-pill" data-ton="danger">{rapport.bloquants.join(' · ')} à corriger</span>
        )}
      </div>
      <table className="lem-table" style={{ marginTop: 10 }}>
        <tbody>
          {LIGNES.map((l) => (
            <Ligne
              key={l.cle}
              titre={l.titre}
              quoi={l.quoi}
              constat={rapport[l.cle]}
              bloquant={rapport.bloquants.includes(l.titre)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Delivrabilite() {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    authedFetch('/api/prospection/delivrabilite')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.message ?? j?.error ?? 'Contrôle impossible')
        setEtat(j)
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setChargement(false))
  }, [])

  return (
    <div className="lem-skin">
      <div className="lem-page">
        <header className="lem-entete">
          <div>
            <h1 className="lem-titre">Délivrabilité</h1>
            <p className="lem-sous">
              Avant le rythme et avant le contenu : est-ce que ce qu’on envoie a une chance
              d’arriver. Deux domaines, deux rôles — celui d’où les messages partent, et celui où
              les réponses arrivent.
            </p>
          </div>
        </header>

        {chargement ? (
          <div className="lem-carte"><div className="lem-vide">Contrôle DNS en cours…</div></div>
        ) : !etat ? (
          <div className="lem-carte"><div className="lem-vide">Contrôle indisponible.</div></div>
        ) : (
          <>
            <div className="lem-alerte" data-gravite="info" style={{ marginBottom: 16 }}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                Les messages partent de <b>{etat.expediteur ?? '— non configuré —'}</b> et les
                réponses reviennent sur <b>{etat.adresseDeReponse ?? '— aucune —'}</b>
                {etat.sousAdressage && ', avec sous-adressage par inscription'}.
                {' '}
                {/* La tentation d'aligner les deux adresses est réelle, et elle
                    coûterait tous les envois : le SPF du domaine des boîtes se
                    termine par -all SANS Resend. */}
                Ces deux domaines sont <b>différents à dessein</b> : le domaine des boîtes
                n’autorise pas Resend à envoyer pour lui, aligner l’expéditeur dessus enverrait
                tout en quarantaine.
              </div>
            </div>

            {etat.envoi && <Domaine rapport={etat.envoi} role="domaine d’envoi" />}
            {etat.reception && <Domaine rapport={etat.reception} role="domaine des boîtes" />}

            {etat.reglages && (
              <div className="lem-carte" style={{ padding: 18 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600 }}>Ce qui limite les envois</h2>
                <table className="lem-table">
                  <tbody>
                    <tr>
                      <td>Plafond quotidien</td>
                      <td className="num">{etat.reglages.daily_cap ?? '—'}</td>
                    </tr>
                    <tr>
                      <td>File</td>
                      <td>{etat.reglages.paused ? 'en pause' : 'active'}</td>
                    </tr>
                    <tr>
                      <td>Disjoncteur de rebonds</td>
                      <td>
                        {etat.reglages.bounce_guard
                          ? `armé à ${etat.reglages.bounce_guard_threshold ?? '—'} %`
                          : 'désarmé'}
                      </td>
                    </tr>
                    <tr>
                      <td>Vérification des adresses avant envoi</td>
                      <td>{etat.reglages.verify_before_send ? 'oui' : 'non'}</td>
                    </tr>
                    <tr>
                      <td>Canaux suspendus</td>
                      <td>
                        {(etat.reglages.canaux_suspendus ?? []).length > 0 ? (
                          <span className="lem-pill" data-ton="attention">
                            <AlertTriangle size={12} /> {(etat.reglages.canaux_suspendus ?? []).join(', ')} — rien ne
                            part par là
                          </span>
                        ) : (
                          'aucun'
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Phase de test</td>
                      <td>
                        {etat.reglages.test_mode ? (
                          <span className="lem-pill" data-ton="attention">
                            <AlertTriangle size={12} /> active — seules les adresses de test reçoivent
                          </span>
                        ) : (
                          'coupée'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
