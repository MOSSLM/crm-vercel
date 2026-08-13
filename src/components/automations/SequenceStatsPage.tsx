'use client'
// SequenceStatsPage — rapport de performance des séquences : envoyés,
// ouvertures, clics, réponses, RDV. Cf. `/api/automations/sequences/stats`
// (route + `_view.ts`) pour la méthodologie exacte et ses limites — elles sont
// résumées ici dans `MethodoNote` plutôt que dupliquées.
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { authedFetch } from '@/utils/authedFetch'
import { XI } from './icons'
import { SearchInput, StatusBadge, type AutomationStatus } from './atoms'

interface SequenceStatsRow {
  id: string
  name: string
  status: AutomationStatus
  emailSteps: number
  enrollmentsTotal: number
  enrollmentsActive: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  bouncedHard: number
  bouncedSoft: number
  openRate: number | null
  clickRate: number | null
  bounceRate: number | null
  repliedCount: number
  replyRate: number | null
  firstTouchRepliedCount: number
  firstTouchReplyRate: number | null
  rdvCount: number
  rdvRate: number | null
  rdvFromReplyRate: number | null
  utmCampaign: string
}

interface SequenceStatsView {
  generatedAt: string
  since: string | null
  rows: SequenceStatsRow[]
  totals: Omit<SequenceStatsRow, 'id' | 'name' | 'status' | 'utmCampaign' | 'emailSteps'>
  gaps: string[]
}

type Period = '30' | '90' | '365' | 'all'

const PERIODS: { v: Period; l: string }[] = [
  { v: '30', l: '30 j' },
  { v: '90', l: '90 j' },
  { v: '365', l: '12 mois' },
  { v: 'all', l: 'Toute la période' },
]

const pct = (n: number | null): string => (n == null ? '—' : `${(n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`)
const int = (n: number): string => n.toLocaleString('fr-FR')

export function SequenceStatsPage() {
  const [period, setPeriod] = useState<Period>('90')
  const [view, setView] = useState<SequenceStatsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const days = period === 'all' ? '' : `?days=${period}`
        const res = await authedFetch(`/api/automations/sequences/stats${days}`)
        if (!res.ok) throw new Error(await res.text().catch(() => res.statusText))
        const data = (await res.json()) as SequenceStatsView
        if (!cancelled) setView(data)
      } catch (err) {
        if (!cancelled) toast.error('Chargement des statistiques impossible', { description: err instanceof Error ? err.message : undefined })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [period])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = view?.rows ?? []
    if (!needle) return all
    return all.filter((r) => r.name.toLowerCase().includes(needle))
  }, [view, q])

  async function copyUtm(row: SequenceStatsRow) {
    const tag = `utm_source=sequence&utm_medium=email&utm_campaign=${row.utmCampaign}`
    try {
      await navigator.clipboard.writeText(tag)
      toast.success('Tag UTM copié', { description: tag })
    } catch {
      toast.error('Copie impossible — copiez-le à la main', { description: tag })
    }
  }

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Statistiques des séquences</h1>
          <div className="desc">
            Envois, ouvertures, clics, réponses et rendez-vous — par séquence.{' '}
            <Link href="/automations/sequences" style={{ color: 'var(--accent-2)' }}>
              ← Retour aux séquences
            </Link>
          </div>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.v} type="button" aria-pressed={period === p.v} onClick={() => setPeriod(p.v)}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {view && view.gaps.length > 0 && (
        <div className="acces-warn" style={{ marginBottom: 14 }}>
          <XI name="warning" className="ico-xs" />
          Données incomplètes — {view.gaps.length === 1 ? 'la table' : 'les tables'} <b>{view.gaps.join(', ')}</b>{' '}
          {view.gaps.length === 1 ? "n'est pas encore" : 'ne sont pas encore'} en base sur ce CRM. Les compteurs concernés
          restent à 0 tant que la migration correspondante n'est pas jouée.
        </div>
      )}

      {loading || !view ? (
        <div className="empty-row" style={{ padding: 32 }}>
          Chargement…
        </div>
      ) : (
        <>
          <div className="summary-grid">
            <SummaryCard icon="send" color="var(--accent)" bg="var(--accent-tint)" value={int(view.totals.sent)} label="Emails envoyés" desc={periodLabel(period)} />
            <SummaryCard icon="mailOpen" color="var(--info)" bg="var(--info-tint)" value={pct(view.totals.openRate)} label="Taux d'ouverture" desc="sur emails livrés" />
            <SummaryCard icon="check" color="var(--ok)" bg="var(--ok-tint)" value={pct(view.totals.replyRate)} label="Taux de réponse" desc={`${int(view.totals.repliedCount)} sur ${int(view.totals.enrollmentsTotal)} inscrits`} />
            <SummaryCard icon="cal" color="var(--manual)" bg="var(--manual-tint)" value={int(view.totals.rdvCount)} label="RDV pris" desc={pct(view.totals.rdvRate) + ' des inscrits'} />
          </div>

          <div className="alist-filters">
            <SearchInput value={q} onChange={setQ} placeholder="Rechercher une séquence…" style={{ flex: 1, maxWidth: 320 }} />
          </div>

          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Séquence</th>
                  <th className="num">Inscrits</th>
                  <th className="num">Envoyés</th>
                  <th className="num">Ouverture</th>
                  <th className="num">Clic</th>
                  <th className="num">Rebond</th>
                  <th className="num">Réponse</th>
                  <th className="num" title="Réponse alors que la séquence n'avait pas dépassé son tout premier contact.">
                    dont 1ᵉʳ contact
                  </th>
                  <th className="num">RDV</th>
                  <th className="num" title="RDV pris parmi ceux ayant répondu.">
                    RDV / réponse
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/automations/sequences/${r.id}`} className="stats-seq-name">
                        {r.name}
                      </Link>
                      <div className="stats-seq-sub">
                        <StatusBadge status={r.status} />
                        {r.emailSteps > 0 && <span> · {r.emailSteps} étape{r.emailSteps > 1 ? 's' : ''} email</span>}
                      </div>
                    </td>
                    <td className="num">{int(r.enrollmentsTotal)}</td>
                    <td className="num">{int(r.sent)}</td>
                    <td className="num">{pct(r.openRate)}</td>
                    <td className="num">{pct(r.clickRate)}</td>
                    <td className="num">{pct(r.bounceRate)}</td>
                    <td className="num">{pct(r.replyRate)}</td>
                    <td className="num">{pct(r.firstTouchReplyRate)}</td>
                    <td className="num">{int(r.rdvCount)}</td>
                    <td className="num">{pct(r.rdvFromReplyRate)}</td>
                    <td>
                      <button type="button" className="btn ghost xs" title="Copier le tag UTM pour cette séquence" onClick={() => copyUtm(r)}>
                        <XI name="copyClip" className="ico-xs" />
                        UTM
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <div className="empty-row" style={{ padding: 28 }}>
                        {view.rows.length === 0 ? 'Aucune séquence pour l’instant.' : 'Aucune séquence ne correspond à cette recherche.'}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <MethodoNote />
          <ClarityGaCard />
        </>
      )}
    </div>
  )
}

function periodLabel(p: Period): string {
  if (p === 'all') return 'toute la période'
  return `sur ${p} derniers jours`
}

function SummaryCard({
  icon,
  color,
  bg,
  value,
  label,
  desc,
}: {
  icon: string
  color: string
  bg: string
  value: React.ReactNode
  label: string
  desc: string
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: bg,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <XI name={icon} className="ico-lg" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26, lineHeight: 1, letterSpacing: '-.01em' }}>{value}</div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  )
}

/**
 * Ce que les taux veulent dire, et où ils s'arrêtent — pour qu'on ne lise pas
 * « Réponse » comme une mesure exacte alors que c'est la meilleure
 * approximation que les données actuelles permettent.
 */
function MethodoNote() {
  return (
    <div className="seq-explain" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 18 }}>
      <ExplainCard
        icon="mailOpen"
        title="Ouverture, clic, rebond"
        desc="Comptés depuis le journal brut des webhooks Resend (email_events), pas depuis le statut résumé de chaque email — ce dernier ne garde que le pire état vu, un « livré » y masque les ouvertures qui suivent."
      />
      <ExplainCard
        icon="check"
        title="Réponse et RDV"
        desc="Aucune boîte mail n'est lue automatiquement : la réponse vient du bouton « Le prospect a réagi » du pipeline commercial, posé sur l'opportunité — pas sur l'envoi précis. « Dont 1ᵉʳ contact » veut dire que la séquence s'est arrêtée dès le tout premier message, quel que soit le canal."
      />
    </div>
  )
}

/** Section « Clarity / Google Analytics » — rien n'est branché, on le dit, et on prépare le terrain. */
function ClarityGaCard() {
  return (
    <div className="seq-explain-card" style={{ marginTop: 14, maxWidth: 720 }}>
      <span className="ic">
        <XI name="globe" className="ico" />
      </span>
      <div className="t">Analytics externe (Clarity / Google Analytics)</div>
      <p>
        Rien n'est encore connecté — aucune stat de session, de scroll ou de conversion sur le site n'apparaît ici tant que
        Clarity et/ou GA4 ne sont pas installés. Dès que ce sera fait, ce qui les relie à une séquence précise, c'est le tag
        UTM des liens de ses emails : <code>utm_source=sequence&amp;utm_medium=email&amp;utm_campaign=&lt;slug&gt;</code>.
        Le bouton « UTM » de chaque ligne copie le tag prêt à coller dans les liens de ses modèles — GA4 et Clarity le
        liront alors comme une campagne à part entière, filtrable indépendamment des autres séquences.
      </p>
    </div>
  )
}

function ExplainCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="seq-explain-card">
      <span className="ic">
        <XI name={icon} className="ico" />
      </span>
      <div className="t">{title}</div>
      <p>{desc}</p>
    </div>
  )
}
