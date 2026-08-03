'use client'
// EmailVerdictBadge — l'état d'une adresse, là où elle s'affiche.
//
// Sur une fiche, savoir qu'une adresse est morte AVANT de lancer une séquence
// évite deux heures de gel et un aller-retour dans le pipeline. La pastille lit
// le verdict déjà connu (aucun réseau côté serveur, une simple lecture) et
// propose de le rafraîchir à la demande.
//
// Elle ne bloque rien et ne modifie rien toute seule : c'est une information,
// pas un garde-fou. Le garde-fou, lui, vit dans `src/lib/email/send-guard.ts`.

import React from 'react'
import { toast } from 'sonner'
import { authedFetch } from '@/utils/authedFetch'
import { STATUS_HINT, STATUS_LABEL, STATUS_TONE } from '@/lib/email/verify/labels'
import type { VerificationStatus } from '@/lib/email/verify/score'

type Verdict = {
  status: VerificationStatus
  reason: string
  suggestion: string | null
  checkedAt: number
  expiresAt: number
}

const TONE_STYLE: Record<'ok' | 'warn' | 'bad' | 'mute', React.CSSProperties> = {
  ok: { color: '#1E7A45', background: 'rgba(30,122,69,.10)', borderColor: 'rgba(30,122,69,.35)' },
  warn: { color: '#9A6400', background: 'rgba(154,100,0,.10)', borderColor: 'rgba(154,100,0,.35)' },
  bad: { color: '#B5322F', background: 'rgba(181,50,47,.10)', borderColor: 'rgba(181,50,47,.35)' },
  mute: { color: '#6B7280', background: 'rgba(107,114,128,.10)', borderColor: 'rgba(107,114,128,.30)' },
}

const dateFr = (ms: number) =>
  ms > 0 ? new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : null

export function EmailVerdictBadge({ email, compact = false }: { email: string | null | undefined; compact?: boolean }) {
  const [verdict, setVerdict] = React.useState<Verdict | null>(null)
  const [loading, setLoading] = React.useState(false)
  /** `false` quand la migration du vérificateur n'a pas été jouée : on n'affiche rien. */
  const [available, setAvailable] = React.useState(true)

  const read = React.useCallback(async () => {
    if (!email) return
    try {
      const res = await authedFetch(`/api/email/verify?email=${encodeURIComponent(email)}`)
      if (!res.ok) {
        setAvailable(false)
        return
      }
      const data = (await res.json()) as { verdict: Verdict | null }
      setVerdict(data.verdict)
    } catch {
      setAvailable(false)
    }
  }, [email])

  React.useEffect(() => {
    void read()
  }, [read])

  const recheck = async () => {
    if (!email || loading) return
    setLoading(true)
    try {
      const res = await authedFetch('/api/email/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails: [email], force: true }),
      })
      if (!res.ok) throw new Error()
      await read()
      toast.success('Adresse revérifiée')
    } catch {
      toast.error('Vérification impossible')
    } finally {
      setLoading(false)
    }
  }

  if (!email || !available) return null

  const status: VerificationStatus = verdict?.status ?? 'pending'
  const tone = STATUS_TONE[status]
  const checked = dateFr(verdict?.checkedAt ?? 0)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span
        title={verdict?.reason || STATUS_HINT[status]}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10.5,
          fontWeight: 600,
          lineHeight: 1.6,
          padding: '1px 7px',
          borderRadius: 999,
          border: '1px solid',
          ...TONE_STYLE[tone],
        }}
      >
        {STATUS_LABEL[status]}
      </span>

      {!compact && (
        <>
          <span style={{ fontSize: 10.5, color: 'var(--muted-foreground, #6B7280)' }}>
            {verdict?.reason || STATUS_HINT[status]}
            {checked ? ` · contrôlée le ${checked}` : ''}
          </span>
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={loading}
            style={{
              fontSize: 10.5,
              textDecoration: 'underline',
              color: 'var(--muted-foreground, #6B7280)',
              background: 'none',
              border: 0,
              padding: 0,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'vérification…' : 'revérifier'}
          </button>
        </>
      )}

      {/* Une faute de frappe se corrige à la main : on suggère, on n'applique
          jamais tout seul un changement de destinataire. */}
      {verdict?.suggestion && (
        <span style={{ fontSize: 10.5, color: '#9A6400' }}>
          vouliez-vous dire <b>{verdict.suggestion}</b> ?
        </span>
      )}
    </span>
  )
}
