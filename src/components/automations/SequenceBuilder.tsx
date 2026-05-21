'use client'
// SequenceBuilder — éditeur de séquence 3 colonnes (réglages / étapes / inspecteur).
// Porté depuis claude design/automations-sequences.jsx.
import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XI } from './icons'
import { Section, Field, ToggleRow, SegFull } from './atoms'
import { SupaSelect } from './SupaSelect'
import { useRefData } from './ref-data'
import { getAutomation, updateAutomation } from './automations-db'
import type { Automation, SequenceDefinition, SequenceStep, SeqStepKind, SequenceSettings } from './types'

const VARIABLES = [
  { v: '{{contact.first_name}}', desc: 'Prénom du contact' },
  { v: '{{contact.last_name}}', desc: 'Nom' },
  { v: '{{company.name}}', desc: 'Entreprise' },
  { v: '{{contact.role}}', desc: 'Poste' },
  { v: '{{owner.first_name}}', desc: 'Prénom du SDR' },
  { v: '{{calendar_link}}', desc: 'Lien de réservation' },
]

export function SequenceBuilder({ id }: { id: string }) {
  const router = useRouter()
  const [auto, setAuto] = useState<Automation | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Automation['status']>('draft')
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [settings, setSettings] = useState<SequenceSettings>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const dirty = useRef(false)

  useEffect(() => {
    getAutomation(id)
      .then((a) => {
        if (!a) {
          toast.error('Séquence introuvable')
          router.push('/automations/sequences')
          return
        }
        setAuto(a)
        setName(a.name)
        setStatus(a.status)
        const def = (a.definition as SequenceDefinition) || { steps: [] }
        setSteps(Array.isArray(def.steps) ? def.steps : [])
        setSettings((a.settings as SequenceSettings) || {})
      })
      .catch(() => toast.error('Chargement impossible'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => {
    if (!auto || !dirty.current) return
    const t = setTimeout(() => {
      updateAutomation(id, {
        name,
        status,
        definition: { steps },
        settings,
        trigger_type: 'sequence_entry',
        trigger_pipeline_id: settings.pipeline ?? null,
        trigger_stage_id: settings.stage != null ? Number(settings.stage) : null,
      })
        .then(() => {
          dirty.current = false
        })
        .catch(() => toast.error('Sauvegarde échouée'))
    }, 700)
    return () => clearTimeout(t)
  }, [steps, settings, name, status, auto, id])

  const touch = useCallback(() => {
    dirty.current = true
  }, [])

  const updateStep = useCallback(
    (sid: string, patch: Partial<SequenceStep>) => {
      touch()
      setSteps((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)))
    },
    [touch],
  )

  const removeStep = useCallback(
    (sid: string) => {
      touch()
      setSteps((prev) => prev.filter((s) => s.id !== sid))
      setSelectedId((cur) => (cur === sid ? null : cur))
    },
    [touch],
  )

  const addStep = useCallback(
    (kind: SeqStepKind) => {
      touch()
      setSteps((prev) => {
        let i = prev.length + 1
        while (prev.some((s) => s.id === `s${i}`)) i++
        const lastDay = prev.reduce((m, s) => Math.max(m, s.day), 0)
        const step: SequenceStep = {
          id: `s${i}`,
          kind,
          mode: kind === 'email' ? 'auto' : kind === 'wait' ? undefined : 'manual',
          day: prev.length === 0 ? 0 : lastDay + 2,
          ...(kind === 'email' ? { sendAt: '09:30', trackOpens: true, trackClicks: true } : {}),
        }
        setSelectedId(step.id)
        return [...prev, step]
      })
      setPicker(false)
    },
    [touch],
  )

  function toggleStatus() {
    if (status !== 'on') {
      if (!settings.pipeline || settings.stage == null) {
        toast.error('Configurez le pipeline et le stage d’entrée')
        return
      }
      if (steps.length === 0) {
        toast.error('Ajoutez au moins une étape')
        return
      }
      setStatus('on')
      touch()
      toast.success('Séquence activée')
    } else {
      setStatus('paused')
      touch()
    }
  }

  if (loading) {
    return (
      <div className="pane" style={{ gridColumn: '1 / -1' }}>
        <div className="pane-body" style={{ padding: 40, color: 'var(--text-3)' }}>
          Chargement…
        </div>
      </div>
    )
  }

  const selectedStep = steps.find((s) => s.id === selectedId)

  return (
    <>
      {/* LEFT — réglages */}
      <div className="pane" style={{ minWidth: 260 }}>
        <div className="pane-hd">
          <div className="title-row">
            <button className="btn ghost sm icon" type="button" onClick={() => router.push('/automations/sequences')} title="Retour">
              <XI name="chevleft" className="ico-sm" />
            </button>
            <XI name="flame" className="ico-sm" style={{ color: 'var(--accent)' }} />
            <span>Séquence</span>
          </div>
        </div>
        <div className="pane-body">
          <Section label="Cible">
            <Field label="Pipeline" required>
              <SupaSelect
                table="pipelines"
                icon="pipeline"
                value={settings.pipeline}
                onChange={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, pipeline: v as string, stage: null }))
                }}
              />
            </Field>
            <Field label="Stage d'entrée" required>
              <SupaSelect
                table="stages"
                icon="kanban"
                disabled={!settings.pipeline}
                filterFK={settings.pipeline ? { pipeline_id: settings.pipeline } : null}
                value={settings.stage as unknown as number}
                onChange={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, stage: v as unknown as string }))
                }}
              />
            </Field>
            <Field label="Stage de sortie" hint="si réponse">
              <SupaSelect
                table="stages"
                icon="kanban"
                disabled={!settings.pipeline}
                filterFK={settings.pipeline ? { pipeline_id: settings.pipeline } : null}
                value={settings.exitStage as unknown as number}
                onChange={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, exitStage: v as unknown as string }))
                }}
              />
            </Field>
          </Section>

          <Section label="Règles d'envoi">
            <Field label="Cadence">
              <select
                className="select"
                value={settings.cadence || 'bizday'}
                onChange={(e) => {
                  touch()
                  setSettings((s) => ({ ...s, cadence: e.target.value }))
                }}
              >
                <option value="bizday">Lun-Ven · 8h–19h</option>
                <option value="all">7j/7 · 8h–19h</option>
              </select>
            </Field>
            <Field label="Fuseau horaire">
              <select
                className="select"
                value={settings.timezone || 'Europe/Paris'}
                onChange={(e) => {
                  touch()
                  setSettings((s) => ({ ...s, timezone: e.target.value }))
                }}
              >
                <option>Europe/Paris</option>
                <option>UTC</option>
              </select>
            </Field>
            <ToggleRow
              label="Sortir si réponse"
              desc="Stoppe la séquence si le contact répond."
              checked={settings.exitOnReply !== false}
              onChange={(v) => {
                touch()
                setSettings((s) => ({ ...s, exitOnReply: v }))
              }}
              accent
            />
            <ToggleRow
              label="Limiter à 1 envoi / jour / contact"
              checked={settings.oncePerDay !== false}
              onChange={(v) => {
                touch()
                setSettings((s) => ({ ...s, oncePerDay: v }))
              }}
            />
          </Section>

          <Section label="Variables disponibles" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {VARIABLES.map((x) => (
                <div key={x.v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      background: 'var(--accent-tint)',
                      color: 'var(--accent-2)',
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}
                  >
                    {x.v}
                  </code>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{x.desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* CENTER — étapes */}
      <div className="pane" style={{ background: 'transparent' }}>
        <div className="pane-hd">
          <div className="title-row">
            <XI name="flame" className="ico-sm" style={{ color: 'var(--accent)' }} />
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                touch()
              }}
              style={{
                border: 0,
                background: 'transparent',
                font: 'inherit',
                fontWeight: 600,
                fontSize: 12.5,
                color: 'var(--text)',
                outline: 'none',
                width: Math.max(120, name.length * 7),
              }}
            />
            <span className="pill accent">Séquence</span>
          </div>
          <div className="actions">
            {status === 'on' ? (
              <button className="btn outline xs" type="button" onClick={toggleStatus}>
                <XI name="pause" className="ico-xs" />
                Pause
              </button>
            ) : (
              <button className="btn ok xs" type="button" onClick={toggleStatus}>
                <XI name="power" className="ico-xs" />
                Activer
              </button>
            )}
          </div>
        </div>
        <div className="seq-host">
          <div className="seq-stage">
            <SequenceSummary name={name} settings={settings} stepCount={steps.length} />

            <div
              style={{
                background: 'var(--text)',
                color: 'var(--bg)',
                padding: '12px 16px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <XI name="bolt" className="ico" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Entrée — opportunité atteint le stage</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                  Pipeline & stage d&apos;entrée configurés à gauche
                </div>
              </div>
              <span className="pill" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>
                déclencheur
              </span>
            </div>

            {steps.map((step, i) => (
              <Fragment key={step.id}>
                <div className="seq-conn">
                  {step.day > 0 && (
                    <span className="wait-chip">
                      <XI name="clock" className="ico-xs" />
                      J+{step.day}
                      {step.sendAt && ` · ${step.sendAt}`}
                    </span>
                  )}
                </div>
                <SeqStep step={step} index={i + 1} selected={selectedId === step.id} onSelect={() => setSelectedId(step.id)} onDelete={() => removeStep(step.id)} />
              </Fragment>
            ))}

            <div className="seq-conn" />
            <button type="button" className="add-step-pill" onClick={() => setPicker(true)}>
              <XI name="plus" className="ico-sm" />
              Ajouter une étape
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
              <div className="flow-end">
                <XI name="flag" className="ico-sm" />
                Fin de séquence
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — inspecteur d'étape */}
      <div className="pane">
        <SeqStepInspector step={selectedStep} onUpdate={(p) => selectedStep && updateStep(selectedStep.id, p)} />
      </div>

      {picker && <SeqStepPickerModal onClose={() => setPicker(false)} onPick={addStep} />}
    </>
  )
}

function SequenceSummary({ name, settings, stepCount }: { name: string; settings: SequenceSettings; stepCount: number }) {
  const ref = useRefData()
  const pipeline = settings.pipeline ? ref.pipelines.find((p) => p.id === settings.pipeline) : null
  const stage = settings.stage ? ref.stages.find((s) => String(s.id) === String(settings.stage)) : null
  return (
    <div className="seq-summary">
      <div>
        <h2>{name}</h2>
        <div className="meta">
          <span className="item">
            <XI name="pipeline" className="ico-sm" />
            {pipeline?.name ?? 'Pipeline ?'}
          </span>
          <span className="item">
            <XI name="kanban" className="ico-sm" />
            {stage?.name ?? 'Stage ?'}
          </span>
          <span className="item">
            <XI name="clock" className="ico-sm" />
            {settings.cadence === 'all' ? '7j/7' : 'L-V 8h–19h'}
          </span>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="v">{stepCount}</div>
          <div className="l">Étapes</div>
        </div>
        <div className="stat" style={{ color: 'var(--accent)' }}>
          <div className="v">{settings.exitOnReply !== false ? 'Oui' : 'Non'}</div>
          <div className="l">Exit reply</div>
        </div>
      </div>
    </div>
  )
}

interface StepMeta {
  icon: string
  title: string
  subtitle: string
}

function useStepMeta(step: SequenceStep): StepMeta {
  const ref = useRefData()
  if (step.kind === 'email') {
    const tpl = ref.email_templates.find((t) => t.id === step.template)
    return { icon: 'mail', title: tpl?.name || 'Email automatique', subtitle: 'Envoi automatique via Resend' }
  }
  if (step.kind === 'linkedin')
    return { icon: 'linkedin', title: step.label || 'LinkedIn', subtitle: 'Action manuelle — file de démarchage' }
  if (step.kind === 'whatsapp') {
    const tpl = ref.whatsapp_templates.find((t) => t.id === step.template)
    return { icon: 'whatsapp', title: tpl?.name || 'WhatsApp', subtitle: 'Message à valider manuellement' }
  }
  if (step.kind === 'call') {
    const sc = ref.call_scripts.find((s) => s.id === step.script)
    return { icon: 'phone', title: sc?.name || 'Appel à passer', subtitle: 'Action manuelle — file de démarchage' }
  }
  if (step.kind === 'wait') return { icon: 'clock', title: 'Attendre', subtitle: 'Délai avant la prochaine étape' }
  return { icon: 'task', title: 'Tâche', subtitle: 'Action manuelle' }
}

function SeqStep({
  step,
  index,
  selected,
  onSelect,
  onDelete,
}: {
  step: SequenceStep
  index: number
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const meta = useStepMeta(step)
  return (
    <div
      className="seq-step"
      data-kind={step.kind}
      data-selected={selected}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <div className="hd">
        <span className="num">{index}</span>
        <span className="ic-wrap">
          <XI name={meta.icon} className="ico" />
        </span>
        <div className="title" style={{ minWidth: 0 }}>
          <div>{meta.title}</div>
          <div className="sub">{meta.subtitle}</div>
        </div>
        {step.mode && (
          <span className={`step-mode-tag ${step.mode}`}>
            <XI name={step.mode === 'auto' ? 'bolt' : 'cursor'} className="ico-xs" />
            {step.mode === 'auto' ? 'AUTO' : 'MANUEL'}
          </span>
        )}
        <div className="tools">
          <button
            type="button"
            title="Supprimer"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <XI name="trash" className="ico-sm" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SeqStepInspector({ step, onUpdate }: { step: SequenceStep | undefined; onUpdate: (p: Partial<SequenceStep>) => void }) {
  if (!step) {
    return (
      <div className="pane-body" style={{ padding: 24, color: 'var(--text-3)', textAlign: 'center' }}>
        <XI name="cursor" className="ico-xl" style={{ color: 'var(--text-4)', margin: '40px auto 14px' }} />
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Aucune étape sélectionnée</div>
      </div>
    )
  }
  return (
    <div className="inspector">
      <div className="inspector-hd">
        <div className="top">
          <h3>Étape — {step.kind}</h3>
          {step.mode && <span className={`step-mode-tag ${step.mode}`}>{step.mode === 'auto' ? 'AUTO' : 'MANUEL'}</span>}
        </div>
      </div>
      <div className="inspector-body">
        <Section label="Timing">
          <Field label="Jour" hint="depuis le début">
            <input
              className="input mono"
              type="number"
              value={step.day}
              onChange={(e) => onUpdate({ day: Number(e.target.value) || 0 })}
            />
          </Field>
          {step.kind === 'email' && (
            <Field label="Heure d'envoi" hint="HH:MM">
              <input className="input mono" value={step.sendAt || '09:30'} onChange={(e) => onUpdate({ sendAt: e.target.value })} />
            </Field>
          )}
        </Section>

        {step.kind === 'email' && (
          <Section label="Email">
            <Field label="Template" required>
              <SupaSelect table="email_templates" icon="template" value={step.template} onChange={(v) => onUpdate({ template: v as string })} />
            </Field>
            <ToggleRow label="Tracker les ouvertures" checked={step.trackOpens !== false} onChange={(v) => onUpdate({ trackOpens: v })} accent />
            <ToggleRow label="Tracker les clics" checked={step.trackClicks !== false} onChange={(v) => onUpdate({ trackClicks: v })} accent />
          </Section>
        )}
        {step.kind === 'call' && (
          <Section label="Appel manuel">
            <Field label="Script d'appel" required>
              <SupaSelect table="call_scripts" icon="phone" value={step.script} onChange={(v) => onUpdate({ script: v as string })} />
            </Field>
            <Field label="Durée estimée">
              <input className="input mono" value={step.duration || '3 min'} onChange={(e) => onUpdate({ duration: e.target.value })} />
            </Field>
          </Section>
        )}
        {step.kind === 'whatsapp' && (
          <Section label="WhatsApp manuel">
            <Field label="Template" required>
              <SupaSelect table="whatsapp_templates" icon="whatsapp" value={step.template} onChange={(v) => onUpdate({ template: v as string })} />
            </Field>
          </Section>
        )}
        {step.kind === 'linkedin' && (
          <Section label="LinkedIn manuel">
            <Field label="Action">
              <SegFull
                value={step.action || 'connect'}
                onChange={(v) => onUpdate({ action: v })}
                options={[
                  { value: 'connect', label: 'Connexion' },
                  { value: 'inmail', label: 'InMail' },
                ]}
              />
            </Field>
            <Field label="Message de connexion" hint={`${(step.message || '').length}/300`}>
              <textarea className="textarea" rows={4} value={step.message || ''} onChange={(e) => onUpdate({ message: e.target.value })} />
            </Field>
          </Section>
        )}
        {step.kind === 'wait' && (
          <Section label="Délai">
            <div className="empty-row">Le délai est défini par le champ « Jour » ci-dessus.</div>
          </Section>
        )}
      </div>
    </div>
  )
}

function SeqStepPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (kind: SeqStepKind) => void }) {
  const cats: { label: string; cat: string; items: { kind: SeqStepKind; icon: string; name: string; desc: string }[] }[] = [
    {
      label: 'Étapes automatiques',
      cat: 'action',
      items: [
        { kind: 'email', icon: 'mail', name: 'Email', desc: "Envoi automatique d'un template via Resend" },
        { kind: 'wait', icon: 'clock', name: 'Attendre', desc: 'Pause avant la prochaine étape' },
      ],
    },
    {
      label: 'Étapes manuelles (file de démarchage)',
      cat: 'manual',
      items: [
        { kind: 'call', icon: 'phone', name: 'Appel téléphonique', desc: 'Avec script pré-rédigé' },
        { kind: 'whatsapp', icon: 'whatsapp', name: 'WhatsApp', desc: 'Message à valider et envoyer' },
        { kind: 'linkedin', icon: 'linkedin', name: 'LinkedIn', desc: 'Connexion ou InMail' },
        { kind: 'task', icon: 'task', name: 'Tâche personnalisée', desc: 'Action libre à valider' },
      ],
    },
  ]
  return createPortal(
    <div className="au-skin">
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <div className="grow">
              <div className="title">Ajouter une étape à la séquence</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Alternez emails automatiques et actions manuelles pour rester humain.
              </div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onClose}>
              <XI name="x" className="ico-sm" />
            </button>
          </div>
          <div className="modal-body">
            {cats.map((c) => (
              <div key={c.label}>
                <div className="picker-section-label">{c.label}</div>
                <div className="picker-grid">
                  {c.items.map((it) => (
                    <div key={it.kind} className={`picker-card ${c.cat}`} onClick={() => onPick(it.kind)}>
                      <div className="top">
                        <span className="ic">
                          <XI name={it.icon} className="ico" />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{it.name}</div>
                        </div>
                      </div>
                      <div className="desc">{it.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
