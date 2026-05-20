'use client'
// ConnectionsPage — onglet Connexions : grille d'intégrations.
// Porté depuis claude design/automations-app.jsx (ConnectionsPage).
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { XI } from './icons'
import { Field } from './atoms'
import type { AutomationConnection, ConnectionStatus } from './types'

interface FieldDef {
  key: string
  label: string
  placeholder?: string
  hint?: string
}

const META: Record<string, { icon: string; color: string; textCol: string; fields: FieldDef[] }> = {
  supabase: { icon: 'database', color: '#3ECF8E', textCol: 'var(--supa-dark)', fields: [] },
  resend: {
    icon: 'mail',
    color: '#E2552B',
    textCol: 'var(--accent-2)',
    fields: [
      { key: 'from_email', label: 'Email expéditeur', placeholder: 'contact@votredomaine.fr' },
      { key: 'from_name', label: 'Nom expéditeur', placeholder: 'Sama Digital' },
    ],
  },
  whatsapp: {
    icon: 'whatsapp',
    color: '#25D366',
    textCol: 'var(--ok)',
    fields: [{ key: 'sender_number', label: 'Numéro émetteur', placeholder: '+33 6 12 34 56 78' }],
  },
  slack: {
    icon: 'bell',
    color: '#4A154B',
    textCol: 'var(--magic)',
    fields: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/…' },
      { key: 'default_channel', label: 'Canal par défaut', placeholder: '#ventes' },
    ],
  },
  calcom: {
    icon: 'cal',
    color: '#292929',
    textCol: 'var(--text)',
    fields: [{ key: 'booking_link', label: 'Lien de réservation', placeholder: 'https://cal.com/votre-equipe' }],
  },
  linkedin: { icon: 'linkedin', color: '#0A66C2', textCol: 'var(--info)', fields: [] },
  claude: { icon: 'ai', color: '#D97757', textCol: 'var(--accent-2)', fields: [] },
  webhook: {
    icon: 'webhook',
    color: '#8A877F',
    textCol: 'var(--text-2)',
    fields: [
      { key: 'base_url', label: 'URL de base', placeholder: 'https://api.exemple.com' },
      { key: 'auth_header', label: 'Header Authorization', placeholder: 'Bearer xxx', hint: 'optionnel' },
    ],
  },
}

function statusBadge(status: ConnectionStatus) {
  const map: Record<ConnectionStatus, { label: string; cls: string }> = {
    on: { label: 'Connecté', cls: 'ok' },
    draft: { label: 'Non configuré', cls: '' },
    manual: { label: 'Manuel', cls: 'warn' },
    error: { label: 'Erreur', cls: 'danger' },
  }
  const s = map[status]
  return <span className={`pill ${s.cls}`}>{s.label}</span>
}

export function ConnectionsPage() {
  const router = useRouter()
  const [conns, setConns] = useState<AutomationConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AutomationConnection | null>(null)

  function reload() {
    supabase
      .from('automation_connections')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error('Chargement des connexions impossible')
        else setConns((data ?? []) as AutomationConnection[])
        setLoading(false)
      })
  }

  useEffect(reload, [])

  return (
    <div className="pane" style={{ background: 'var(--bg)', borderRight: 0 }}>
      <div className="pane-hd">
        <div className="title-row">
          <button
            className="btn ghost sm icon"
            type="button"
            onClick={() => router.push('/automations')}
            title="Retour"
          >
            <XI name="chevleft" className="ico-sm" />
          </button>
          <XI name="webhook" className="ico-sm" style={{ color: 'var(--text-3)' }} />
          <span>Connexions</span>
        </div>
      </div>
      <div className="pane-body" style={{ padding: 24 }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 26, letterSpacing: '-.01em', margin: 0 }}>
              Connexions
            </h1>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
              Toutes les sources de données et services utilisés par vos automatisations.
            </div>
          </div>
          {loading ? (
            <div className="empty-row" style={{ padding: 30 }}>Chargement…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {conns.map((c) => {
                const meta = META[c.id] ?? META.webhook
                return (
                  <div
                    key={c.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      gap: 14,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 9,
                        background: meta.color + '22',
                        color: meta.textCol,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <XI name={meta.icon} className="ico-lg" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-.005em' }}>{c.name}</div>
                        {statusBadge(c.status)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.45 }}>
                        {c.description}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--text-4)',
                          fontFamily: 'var(--font-mono)',
                          marginTop: 6,
                        }}
                      >
                        {c.status === 'manual'
                          ? 'mode manuel — pas d’authentification'
                          : c.status === 'draft'
                            ? 'non configuré'
                            : c.connected_at
                              ? `connecté · ${new Date(c.connected_at).toLocaleDateString('fr-FR')}`
                              : 'connecté'}
                      </div>
                    </div>
                    {meta.fields.length > 0 && (
                      <button
                        className="btn ghost xs icon"
                        type="button"
                        title="Configurer"
                        onClick={() => setEditing(c)}
                      >
                        <XI name="settings" className="ico-sm" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <ConnectionModal
          conn={editing}
          fields={(META[editing.id] ?? META.webhook).fields}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ConnectionModal({
  conn,
  fields,
  onClose,
  onSaved,
}: {
  conn: AutomationConnection
  fields: FieldDef[]
  onClose: () => void
  onSaved: () => void
}) {
  const [config, setConfig] = useState<Record<string, string>>(conn.config ?? {})
  const [status, setStatus] = useState<ConnectionStatus>(conn.status)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const filled = fields.every((f) => f.hint === 'optionnel' || (config[f.key] ?? '').trim())
      const nextStatus: ConnectionStatus = status === 'manual' ? 'manual' : filled ? 'on' : 'draft'
      const { error } = await supabase
        .from('automation_connections')
        .update({
          config,
          status: nextStatus,
          connected_at: nextStatus === 'on' ? new Date().toISOString() : conn.connected_at,
        })
        .eq('id', conn.id)
      if (error) throw error
      toast.success(`${conn.name} mis à jour`)
      onSaved()
    } catch {
      toast.error('Sauvegarde impossible')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="au-skin">
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <div className="grow">
              <div className="title">{conn.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{conn.description}</div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onClose}>
              <XI name="x" className="ico-sm" />
            </button>
          </div>
          <div className="modal-body">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  className="input"
                  value={config[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
            <Field label="Statut">
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ConnectionStatus)}
              >
                <option value="on">Activé</option>
                <option value="draft">Désactivé</option>
                <option value="manual">Manuel</option>
              </select>
            </Field>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-4)',
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Les clés API sensibles (Resend, Claude) restent dans les variables d&apos;environnement du serveur ;
              cette fiche ne stocke que les réglages non secrets.
            </div>
          </div>
          <div className="modal-ft">
            <button className="btn outline sm" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="btn accent" type="button" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
