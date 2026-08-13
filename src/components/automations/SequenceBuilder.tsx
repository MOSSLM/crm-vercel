'use client'
// SequenceBuilder — éditeur de séquence 3 colonnes (réglages / étapes / inspecteur).
// Porté depuis claude design/automations-sequences.jsx.
import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/utils/supabase/client'
import { XI } from './icons'
import { Section, Field, ToggleRow, SegFull } from './atoms'
import { SupaSelect } from './SupaSelect'
import { useRefData } from './ref-data'
import { getAutomation, updateAutomation } from './automations-db'
import { RangeSlider, Segmented, WindowEditor } from './regulator/parts'
import { moveStep } from './sequence-steps'
import {
  attentesEnAmont,
  ISSUE_LABEL,
  planEditeur,
  positionDInsertion,
  type IssueAttente,
} from '@/lib/automations/branches'
import { MessageEditor } from './MessageEditor'
import { normalizeWindows } from '@/lib/automations/regulator'
import {
  interpolateVars,
  pickVariant,
  sampleVars,
  variantText,
  VARIABLES,
  VARIANTS,
  VARIANT_LABELS,
  type MessageVariant,
  type VarBag,
  type VariantPair,
} from '@/lib/automations/variables'
import { CANAL_LABEL, CANAUX, type Canal } from '@/lib/prospects/canal'
import { authedFetch } from '@/utils/authedFetch'
import type { Automation, SequenceDefinition, SequenceStep, SeqStepKind, SequenceSettings } from './types'
import './regulator.css'

export function SequenceBuilder({ id }: { id: string }) {
  const router = useRouter()
  const [auto, setAuto] = useState<Automation | null>(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Automation['status']>('draft')
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [settings, setSettings] = useState<SequenceSettings>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * `false` fermé · `true` ouvert sur le tronc · `{waitId, on}` ouvert depuis
   * une voie, où l'étape choisie ira directement.
   */
  const [picker, setPicker] = useState<boolean | { waitId: string; on: IssueAttente }>(false)
  const [loading, setLoading] = useState(true)
  const [vars, setVars] = useState<VarBag>(() => sampleVars())
  const [previewOn, setPreviewOn] = useState<string | null>(null)
  /** Le numéro de la fiche d'aperçu — rempli tout seul, modifiable à la main. */
  const [previewId, setPreviewId] = useState('')
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

  /**
   * L'aperçu se calcule sur une VRAIE entreprise du public visé.
   *
   * C'est le seul moyen de voir qu'un lien de site démo manque ou qu'un rapport
   * d'audit n'a pas encore de jeton : sur des valeurs inventées, tout est
   * toujours rempli, et le trou se découvre à l'envoi.
   */
  const chargerApercu = useCallback(
    /**
     * `null` — « choisis pour moi », le serveur prend une fiche du public visé.
     * `''`   — le champ a été vidé à la main : valeurs d'exemple, et rien d'autre.
     * sinon  — la fiche demandée.
     */
    async (entrepriseId: string | null) => {
      try {
        const q = new URLSearchParams({ automation_id: id })
        if (entrepriseId) q.set('entreprise_id', entrepriseId)
        else if (entrepriseId === '') q.set('auto', '0')
        const res = await authedFetch(`/api/automations/preview?${q}`)
        const payload = (await res.json()) as {
          vars?: VarBag
          company?: string | null
          entrepriseId?: number | null
        }
        setVars(payload.vars ?? sampleVars())
        setPreviewOn(payload.company ?? null)
        setPreviewId(payload.entrepriseId != null ? String(payload.entrepriseId) : '')
      } catch {
        toast.error('Aperçu indisponible — valeurs d’exemple conservées')
      }
    },
    [id],
  )

  /**
   * Une vraie fiche dès l'ouverture, sans rien demander.
   *
   * L'aperçu ne servait qu'à qui pensait à coller un numéro d'entreprise dans un
   * champ replié ; tous les autres relisaient des valeurs d'exemple où tout est
   * toujours rempli. Le serveur prend donc une fiche du public que la séquence
   * déclare viser — de préférence une déjà inscrite — et c'est elle qu'on lit.
   */
  // `chargerApercu` ne dépend que de `id` : l'effet ne se rejoue donc pas à
  // chaque frappe, et la fiche choisie à la main n'est jamais écrasée.
  useEffect(() => {
    if (loading) return
    void chargerApercu(null)
  }, [loading, chargerApercu])

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

  /**
   * Déplacer une étape. Sans ce geste, la seule façon d'intercaler un appel
   * entre deux emails était de supprimer et tout refaire.
   */
  const reorder = useCallback(
    (sid: string, dir: -1 | 1) => {
      setSteps((prev) => {
        const next = moveStep(prev, sid, dir)
        if (next !== prev) touch()
        return next
      })
    },
    [touch],
  )

  const addStep = useCallback(
    (kind: SeqStepKind, preset?: Partial<SequenceStep>) => {
      touch()
      // Le picker sait s'il a été ouvert depuis une voie : l'étape y entre
      // directement, insérée à la bonne place plutôt qu'ajoutée à la fin —
      // recoller ensuite une étape dans la bonne branche à coups de flèches est
      // exactement ce que la fourche est censée éviter.
      const cible = typeof picker === 'object' ? picker : null
      setSteps((prev) => {
        let i = prev.length + 1
        while (prev.some((s) => s.id === `s${i}`)) i++
        const lastDay = prev.reduce((m, s) => Math.max(m, s.day), 0)
        const step: SequenceStep = {
          id: `s${i}`,
          kind,
          mode: kind === 'email' ? 'auto' : kind === 'wait' ? undefined : 'manual',
          day: prev.length === 0 ? 0 : lastDay + 2,
          // Pas de `sendAt` : l'heure d'un email appartient au régulateur.
          ...(kind === 'email' ? { trackOpens: true, trackClicks: true } : {}),
          ...(cible ? { branch: { waitId: cible.waitId, on: cible.on } } : {}),
          ...preset,
        }
        setSelectedId(step.id)
        if (!cible) return [...prev, step]
        const at = positionDInsertion(prev, cible.waitId, cible.on)
        return [...prev.slice(0, at), step, ...prev.slice(at)]
      })
      setPicker(false)
    },
    [touch, picker],
  )

  /**
   * Rattacher une étape existante à une voie, ou la ramener sur le tronc.
   *
   * Le déplacement suit : une étape de la voie « sans réponse » doit vivre dans
   * le tableau après celles de la voie « il a répondu », sinon la fourche se
   * dessine à l'envers et l'insertion suivante tombe au mauvais endroit.
   */
  const setBranche = useCallback(
    (stepId: string, branch: SequenceStep['branch']) => {
      touch()
      setSteps((prev) => {
        const from = prev.findIndex((s) => s.id === stepId)
        if (from < 0) return prev
        const modifiee = { ...prev[from], branch: branch ?? null }
        const sans = prev.filter((_, i) => i !== from)
        if (!branch) return [...sans.slice(0, from), modifiee, ...sans.slice(from)]
        const at = positionDInsertion(sans, branch.waitId, branch.on)
        return [...sans.slice(0, at), modifiee, ...sans.slice(at)]
      })
    },
    [touch],
  )

  function toggleStatus() {
    if (status !== 'on') {
      // Sans pipeline/stage d'entrée, la séquence ne s'auto-déclenche jamais :
      // elle n'est utilisable qu'en lancement manuel (agents / test).
      const manualOnly = !settings.pipeline || settings.stage == null
      if (steps.length === 0) {
        toast.error('Ajoutez au moins une étape')
        return
      }
      setStatus('on')
      touch()
      toast.success(manualOnly ? 'Séquence activée (lancement manuel uniquement)' : 'Séquence activée')
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
  // Plages d'envoi de la séquence. Vide = celles du régulateur s'appliquent.
  const windows = normalizeWindows(settings.sendWindows)
  // Le plan de la colonne centrale : tronc, fourches, voies — y compris vides.
  const plan = planEditeur(steps)

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
            <Field label="Pipeline" hint="vide = lancement manuel">
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
            <Field label="Stage d'entrée" hint="vide = lancement manuel">
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
            <Field label="Étape de reprise du pipeline" hint="vide = première étape « RDV »">
              <SupaSelect
                table="stages"
                icon="kanban"
                disabled={!settings.pipeline}
                filterFK={settings.pipeline ? { pipeline_id: settings.pipeline } : null}
                value={settings.handoffStage as unknown as number}
                onChange={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, handoffStage: v == null ? null : Number(v) }))
                }}
              />
              <p className="rg-hint">
                Dans le pipeline commercial, les colonnes de gauche sont les étapes de cette séquence ; celles du
                pipeline commencent à partir d’ici, quand le commercial reprend la main.
              </p>
            </Field>
          </Section>

          <Section label="Règles d'envoi">
            <Field
              label="Plages d'envoi"
              hint={
                windows.length === 0
                  ? 'vide = plages par défaut du régulateur'
                  : `${windows.length} plage${windows.length > 1 ? 's' : ''}`
              }
            >
              <WindowEditor
                windows={windows}
                onChange={(w) => {
                  touch()
                  setSettings((s) => ({ ...s, sendWindows: w as [number, number][] }))
                }}
              />
              <p className="rg-hint">
                Hors de ces créneaux, la séquence se met en pause d’elle-même : rien n’est perdu, tout reprend à
                l’ouverture suivante. Les plages ne peuvent pas se chevaucher.
              </p>
            </Field>

            <Field label="Priorité dans la file" hint="1 passe devant 5">
              <Segmented
                value={Math.min(5, Math.max(1, settings.queuePriority ?? 2))}
                ariaLabel="Priorité de cette séquence dans la file"
                options={[1, 2, 3, 4, 5].map((n) => ({
                  value: n,
                  label: String(n),
                  title: n === 1 ? 'passe devant tout le reste' : n === 5 ? 'passe en dernier' : undefined,
                }))}
                onChange={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, queuePriority: v }))
                }}
              />
            </Field>

            <Field
              label="Plafond de cette séquence"
              hint={settings.dailyCap ? `${settings.dailyCap} emails / jour` : 'pas de limite dédiée'}
            >
              <RangeSlider
                value={Math.min(200, settings.dailyCap ?? 0)}
                min={0}
                max={200}
                step={5}
                ariaLabel="Plafond d’emails par jour pour cette séquence"
                onPreview={(v) => setSettings((s) => ({ ...s, dailyCap: v > 0 ? v : null }))}
                onCommit={(v) => {
                  touch()
                  setSettings((s) => ({ ...s, dailyCap: v > 0 ? v : null }))
                }}
              />
              <div className="rg-rnglb">
                <span>0 = pas de limite</span>
                <span>200</span>
              </div>
            </Field>

            <div className="rg-hint" style={{ marginBottom: 8 }}>
              L’heure exacte de chaque email est décidée par le{' '}
              <Link href="/automations/regulateur" style={{ color: 'var(--accent-2)' }}>
                régulateur
              </Link>{' '}
              — une seule file pour tout le CRM, avec un écart aléatoire entre deux départs.
            </div>

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

          <PublicViseSection
            settings={settings}
            onChange={(p) => {
              touch()
              setSettings((s) => ({ ...s, ...p }))
            }}
          />

          <Section label="Aperçu des messages" defaultOpen={false}>
            <Field label="Entreprise d’essai" hint={previewOn ?? 'valeurs d’exemple'}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input mono"
                  placeholder="n° entreprise"
                  value={previewId}
                  onChange={(e) => setPreviewId(e.target.value)}
                  onBlur={(e) => chargerApercu(e.target.value.trim())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') chargerApercu((e.target as HTMLInputElement).value.trim())
                  }}
                />
                <button
                  className="btn outline sm"
                  type="button"
                  title="Reprendre une fiche du public visé"
                  onClick={() => chargerApercu(null)}
                >
                  <XI name="refresh" className="ico-sm" />
                </button>
              </div>
              <p className="rg-hint">
                Une fiche réelle du public visé est prise à l’ouverture — de préférence une déjà inscrite. Les messages
                de chaque étape se rendent avec ses données, liens du rapport et du site démo compris : c’est le seul
                moyen de voir qu’une démo n’est pas prête ou qu’un prénom manque avant que le prospect ne le découvre.
              </p>
            </Field>
          </Section>

          <Section label="Variables disponibles" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {VARIABLES.map((x) => (
                <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px' }}>
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
                    {`{{${x.key}}}`}
                  </code>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{x.desc}</span>
                </div>
              ))}
            </div>
            <p className="rg-hint">
              Plus besoin de les recopier : les boutons au-dessus de chaque message les insèrent au curseur.
            </p>
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

            {plan.map((ligne) => {
              if (ligne.type === 'reprise') {
                return (
                  <Fragment key={`reprise-${ligne.waitId}`}>
                    <div className="seq-conn" />
                    {/* Les deux chemins se rejoignent : ce qui suit part quoi
                        qu'il se soit passé. Le dire évite de croire qu'une
                        étape de tronc appartient encore à la dernière voie. */}
                    <div className="seq-merge">
                      <XI name="branch" className="ico-xs" />
                      les deux chemins se rejoignent
                    </div>
                  </Fragment>
                )
              }
              if (ligne.type === 'branche') {
                return (
                  <div key={`${ligne.waitId}-${ligne.on}`} className="seq-lane" data-on={ligne.on}>
                    <div className="seq-lane-hd">
                      <XI name={ligne.on === 'reply' ? 'check' : 'clock'} className="ico-xs" />
                      {ISSUE_LABEL[ligne.on].titre}
                      <span className="hint">{ISSUE_LABEL[ligne.on].aide}</span>
                    </div>
                    {ligne.etapes.length === 0 && (
                      <div className="seq-lane-vide">
                        Rien d’écrit pour ce cas — la séquence enchaîne directement sur la suite commune.
                      </div>
                    )}
                    {ligne.etapes.map((i) => (
                      <Fragment key={steps[i].id}>
                        <ConnStep step={steps[i]} />
                        <SeqStep
                          step={steps[i]}
                          index={i + 1}
                          selected={selectedId === steps[i].id}
                          canMoveUp={i > 0}
                          canMoveDown={i < steps.length - 1}
                          onSelect={() => setSelectedId(steps[i].id)}
                          onDelete={() => removeStep(steps[i].id)}
                          onMove={(dir) => reorder(steps[i].id, dir)}
                        />
                      </Fragment>
                    ))}
                    <button
                      type="button"
                      className="add-step-pill sm"
                      onClick={() => setPicker({ waitId: ligne.waitId, on: ligne.on })}
                    >
                      <XI name="plus" className="ico-sm" />
                      Ajouter une étape ici
                    </button>
                  </div>
                )
              }
              const step = steps[ligne.index]
              return (
                <Fragment key={step.id}>
                  <ConnStep step={step} />
                  <SeqStep
                    step={step}
                    index={ligne.index + 1}
                    selected={selectedId === step.id}
                    canMoveUp={ligne.index > 0}
                    canMoveDown={ligne.index < steps.length - 1}
                    onSelect={() => setSelectedId(step.id)}
                    onDelete={() => removeStep(step.id)}
                    onMove={(dir) => reorder(step.id, dir)}
                    // Une étape rendue dans le flux principal alors qu'elle
                    // déclare une voie n'a pas trouvé sa fourche : attente
                    // supprimée, ou fourche imbriquée que l'éditeur ne dessine
                    // pas. On la signale plutôt que de la masquer.
                    orpheline={!!step.branch}
                  />
                </Fragment>
              )
            })}

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
        <SeqStepInspector
          steps={steps}
          step={selectedStep}
          settings={settings}
          vars={vars}
          previewOn={previewOn}
          onUpdate={(p) => selectedStep && updateStep(selectedStep.id, p)}
          onBranche={(b) => selectedStep && setBranche(selectedStep.id, b)}
        />
      </div>

      {picker && <SeqStepPickerModal onClose={() => setPicker(false)} onPick={addStep} />}
    </>
  )
}

/**
 * Le public visé — à qui cette séquence s'adresse, exprimé en canaux.
 *
 * C'est ce qui permet au tableau de SUGGÉRER la bonne séquence pour chaque
 * ligne, sans qu'aucun rapprochement ne soit codé en dur : une séquence créée
 * demain avec ses propres cases entre dans la suggestion toute seule.
 *
 * Volontairement en canaux et jamais en préfixes : « il me faut un mobile », pas
 * « 06 ou 07 ». La règle de numérotation vit dans `src/lib/prospects/canal.ts`.
 */
function PublicViseSection({
  settings,
  onChange,
}: {
  settings: SequenceSettings
  onChange: (p: Partial<SequenceSettings>) => void
}) {
  const require = settings.requireCanaux ?? []
  const exclude = settings.excludeCanaux ?? []

  /**
   * Bascule un canal. Un même canal ne peut pas être requis ET exclu : le
   * cocher d'un côté le décoche de l'autre, sinon on déclarerait un public vide
   * sans qu'aucun écran ne le signale.
   */
  const set = (canal: Canal, mode: 'require' | 'exclude') => {
    const source = mode === 'require' ? require : exclude
    const suivant = source.includes(canal) ? source.filter((c) => c !== canal) : [...source, canal]
    onChange(
      mode === 'require'
        ? { requireCanaux: suivant, excludeCanaux: exclude.filter((c) => c !== canal) }
        : { requireCanaux: require.filter((c) => c !== canal), excludeCanaux: suivant },
    )
  }

  const rien = require.length === 0 && exclude.length === 0

  return (
    <Section label="Public visé" count={rien ? undefined : require.length + exclude.length}>
      <Field label="Doit avoir" hint="tous ces canaux">
        <div className="seq-canaux">
          {CANAUX.map((c) => (
            <button
              key={c}
              type="button"
              className="seq-canal"
              aria-pressed={require.includes(c)}
              onClick={() => set(c, 'require')}
            >
              {CANAL_LABEL[c]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Ne doit pas avoir" hint="un seul suffit à écarter">
        <div className="seq-canaux">
          {CANAUX.map((c) => (
            <button
              key={c}
              type="button"
              className="seq-canal danger"
              aria-pressed={exclude.includes(c)}
              onClick={() => set(c, 'exclude')}
            >
              {CANAL_LABEL[c]}
            </button>
          ))}
        </div>
      </Field>
      <p className="rg-hint">
        {rien
          ? 'Sans public déclaré, cette séquence ne sera jamais suggérée dans le tableau — elle restera choisissable à la main.'
          : 'Le tableau proposera cette séquence aux entreprises qui correspondent. Rien n’est bloqué : on peut toujours inscrire une ligne hors public.'}
      </p>
    </Section>
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
  if (step.kind === 'wait') {
    // Deux attentes très différentes ne doivent pas se ressembler dans le flux :
    // l'une passe toute seule, l'autre exige un geste humain.
    return step.waitMode === 'reply'
      ? {
          icon: 'user',
          title: 'Attendre une réponse',
          subtitle: step.replyTimeoutDays
            ? `Relance automatique à J+${step.replyTimeoutDays} sans réponse`
            : 'Reprend quand on clique « Il a répondu »',
        }
      : { icon: 'clock', title: 'Attendre', subtitle: 'Délai avant la prochaine étape' }
  }
  return { icon: 'task', title: 'Tâche', subtitle: 'Action manuelle' }
}

/**
 * Ce que la maquette dit sur chaque liaison : le délai, qui décide l'heure, et
 * si l'étape attend un humain.
 */
function ConnStep({ step }: { step: SequenceStep }) {
  return (
    <div className="seq-conn">
      <span className="wait-chip">
        <XI name="clock" className="ico-xs" />
        {step.day > 0 ? `J+${step.day}` : 'immédiat'}
      </span>
      {step.kind === 'email' && (
        <span className="wait-chip accent">
          <XI name="settings" className="ico-xs" />
          heure décidée par le régulateur
        </span>
      )}
      {step.mode === 'manual' && (
        <span className="wait-chip manual">
          <XI name="user" className="ico-xs" />
          tâche à un humain
        </span>
      )}
    </div>
  )
}

function SeqStep({
  step,
  index,
  selected,
  canMoveUp,
  canMoveDown,
  onSelect,
  onDelete,
  onMove,
  orpheline = false,
}: {
  step: SequenceStep
  index: number
  selected: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  /**
   * Étape qui déclare une voie sans être dessinée dedans — attente supprimée,
   * ou fourche imbriquée que l'éditeur ne dessine pas. On la montre quand même,
   * signalée : une étape qu'on ne voit plus est pire qu'une étape mal placée.
   */
  orpheline?: boolean
}) {
  const meta = useStepMeta(step)
  return (
    <div
      className="seq-step"
      data-kind={step.kind}
      data-reply={step.kind === 'wait' && step.waitMode === 'reply'}
      data-orpheline={orpheline || undefined}
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
            title="Monter l’étape"
            disabled={!canMoveUp}
            onClick={(e) => {
              e.stopPropagation()
              onMove(-1)
            }}
          >
            <XI name="chevup" className="ico-sm" />
          </button>
          <button
            type="button"
            title="Descendre l’étape"
            disabled={!canMoveDown}
            onClick={(e) => {
              e.stopPropagation()
              onMove(1)
            }}
          >
            <XI name="chevdown" className="ico-sm" />
          </button>
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

/**
 * Sur quel chemin cette étape se trouve.
 *
 * N'apparaît que s'il y a réellement une fourche au-dessus d'elle : proposer un
 * choix entre « tronc » et rien d'autre ferait chercher une branche qui n'existe
 * pas. Changer de voie DÉPLACE l'étape dans le tableau — la voie « sans
 * réponse » vient après la voie « il a répondu », sinon la fourche se dessine à
 * l'envers.
 */
function BrancheSection({
  steps,
  step,
  onBranche,
}: {
  steps: SequenceStep[]
  step: SequenceStep
  onBranche: (branch: SequenceStep['branch']) => void
}) {
  const idx = steps.findIndex((s) => s.id === step.id)
  const attentes = attentesEnAmont(steps, idx < 0 ? steps.length : idx)
  if (attentes.length === 0) return null

  const courant = step.branch
  const valeur = courant ? `${courant.waitId}:${courant.on}` : ''

  return (
    <Section label="Chemin">
      <Field label="Cette étape part…" hint={courant ? 'sur une voie' : 'toujours'}>
        <select
          className="select"
          value={valeur}
          onChange={(e) => {
            const v = e.target.value
            if (!v) return onBranche(null)
            const [waitId, on] = v.split(':')
            onBranche({ waitId, on: on as IssueAttente })
          }}
        >
          <option value="">Toujours — tronc commun</option>
          {attentes.map((w) =>
            (['reply', 'timeout'] as const).map((on) => (
              <option key={`${steps[w].id}:${on}`} value={`${steps[w].id}:${on}`}>
                Étape {w + 1} · {ISSUE_LABEL[on].titre}
              </option>
            )),
          )}
        </select>
        <p className="rg-hint">
          {courant
            ? ISSUE_LABEL[courant.on].aide
            : 'Traversée quoi qu’il arrive. Placez-la sur une voie pour qu’elle ne parte que dans ce cas-là.'}
        </p>
      </Field>
    </Section>
  )
}

function SeqStepInspector({
  steps,
  step,
  settings,
  vars,
  previewOn,
  onUpdate,
  onBranche,
}: {
  steps: SequenceStep[]
  step: SequenceStep | undefined
  settings: SequenceSettings
  /** Valeurs de l'entreprise d'essai, pour rendre les messages tels qu'ils partiront. */
  vars: VarBag
  previewOn: string | null
  onUpdate: (p: Partial<SequenceStep>) => void
  onBranche: (branch: SequenceStep['branch']) => void
}) {
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
        <BrancheSection steps={steps} step={step} onBranche={onBranche} />
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
            // L'heure n'est plus un réglage d'étape : c'est le régulateur qui
            // la choisit au moment du départ. Un champ modifiable ici mentait —
            // rien ne le lisait.
            <Field label="Heure d'envoi" hint="hors de vos mains">
              <div className="seq-regchip">
                <XI name="settings" className="ico-sm" />
                <span>
                  Décidée par le <Link href="/automations/regulateur">régulateur</Link> — premier créneau libre des
                  plages ci-contre, avec l’écart aléatoire du CRM.
                </span>
              </div>
            </Field>
          )}
          {step.mode === 'manual' && (
            <Field label="Heure" hint="à l'ouverture">
              <div className="seq-regchip manual">
                <XI name="user" className="ico-sm" />
                <span>
                  Une tâche est posée dans la file de la personne qui suit le contact. La séquence attend qu’elle soit
                  faite avant l’étape suivante.
                </span>
              </div>
            </Field>
          )}
        </Section>

        {step.kind === 'email' && (
          <Section label="Email">
            <Field label="Template" required>
              <SupaSelect table="email_templates" icon="template" value={step.template} onChange={(v) => onUpdate({ template: v as string })} />
            </Field>
            <EmailTemplatePreview templateId={step.template ?? null} vars={vars} previewOn={previewOn} />
            <ToggleRow label="Tracker les ouvertures" checked={step.trackOpens !== false} onChange={(v) => onUpdate({ trackOpens: v })} accent />
            <ToggleRow label="Tracker les clics" checked={step.trackClicks !== false} onChange={(v) => onUpdate({ trackClicks: v })} accent />
            {/*
              La case reste, désactivée et expliquée. `audits.pdf_url` n'est
              écrit par AUCUN code du dépôt — `savePdfUrl` n'a pas d'appelant et
              l'export de l'éditeur passe par l'impression du navigateur sans
              rien téléverser. Aucune entreprise n'a de PDF en base. Cochée, la
              case ne joignait donc rien, en silence : l'opérateur croyait
              envoyer un document et le prospect ne recevait qu'un texte.
              Le lien du rapport web ({'{{'}company.audit_url{'}}'}), lui,
              fonctionne — il se lit sur téléphone et compte ses vues.
            */}
            <ToggleRow
              label="Joindre l'audit PDF"
              checked={false}
              onChange={() => {}}
              disabled
              desc="Indisponible : aucun PDF n’est produit aujourd’hui. Le modèle peut porter le lien du rapport, qui se lit sur téléphone et compte ses vues."
              accent
            />
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
            <Field label="Modèle" hint="vide = message ci-dessous">
              <SupaSelect table="whatsapp_templates" icon="whatsapp" value={step.template} onChange={(v) => onUpdate({ template: v as string })} />
            </Field>
            {step.template ? (
              <WhatsappTemplatePreview templateId={step.template} vars={vars} previewOn={previewOn} />
            ) : (
              <Field label="Message pré-rédigé">
                <MessageEditor
                  value={step.message || ''}
                  onChange={(message) => onUpdate({ message })}
                  vars={vars}
                  rows={4}
                  previewOn={previewOn ?? 'des valeurs d’exemple'}
                  placeholder="Bonjour, je suis bien avec {{company.name}} ?"
                />
                <p className="rg-hint">
                  WhatsApp n’est jamais envoyé par le CRM : le message est préparé, prêt à coller, dans la file de la
                  bonne personne. Écrit ici, il ne sert qu’à cette étape — passez par les{' '}
                  <Link href="/automations/modeles" style={{ color: 'var(--accent-2)' }}>
                    modèles
                  </Link>{' '}
                  pour le réutiliser ailleurs.
                </p>
              </Field>
            )}
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
              <MessageEditor
                value={step.message || ''}
                onChange={(message) => onUpdate({ message })}
                vars={vars}
                rows={4}
                previewOn={previewOn ?? 'des valeurs d’exemple'}
              />
            </Field>
          </Section>
        )}
        {step.kind === 'wait' && (
          <Section label="Ce qu’on attend">
            <Field label="Type d’attente">
              <SegFull
                value={step.waitMode === 'reply' ? 'reply' : 'days'}
                onChange={(v) => onUpdate({ waitMode: v as 'days' | 'reply' })}
                options={[
                  { value: 'days', label: 'Un délai' },
                  { value: 'reply', label: 'Une réponse' },
                ]}
              />
            </Field>
            {step.waitMode === 'reply' ? (
              <>
                <Field
                  label="Relancer sans réponse au bout de"
                  hint={step.replyTimeoutDays ? `${step.replyTimeoutDays} jours` : 'jamais'}
                >
                  <input
                    className="input mono"
                    type="number"
                    min={0}
                    value={step.replyTimeoutDays ?? 0}
                    onChange={(e) => onUpdate({ replyTimeoutDays: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <p className="rg-hint">
                    0 = on attend indéfiniment. Le prospect reste garé, visible dans « En attente de réponse », et rien
                    ne part tant que personne n’a cliqué.
                  </p>
                </Field>
                <div className="seq-regchip manual">
                  <XI name="user" className="ico-sm" />
                  <span>
                    La séquence s’arrête ici jusqu’à ce qu’on clique sur <strong>« Il a répondu »</strong>, depuis la
                    file de démarchage ou le pipeline commercial. Les jours des étapes suivantes se comptent à partir de
                    ce clic.
                  </span>
                </div>
              </>
            ) : (
              <div className="empty-row">Le délai est défini par le champ « Jour » ci-dessus.</div>
            )}
          </Section>
        )}

        {/* Ce qui s'applique déjà à cette étape sans qu'on ait à le cocher :
            l'afficher évite de recréer, étape par étape, des interrupteurs que
            le régulateur tient globalement. */}
        <Section label="Garde-fous appliqués">
          <ul className="seq-guards">
            <li data-on={settings.exitOnReply !== false}>
              <XI name={settings.exitOnReply !== false ? 'check' : 'x'} className="ico-xs" />
              {settings.exitOnReply !== false
                ? 'Le contact sort de la séquence dès qu’il répond — cette étape ne partira pas.'
                : 'La séquence continue même si le contact répond.'}
            </li>
            <li data-on={settings.oncePerDay !== false}>
              <XI name={settings.oncePerDay !== false ? 'check' : 'x'} className="ico-xs" />
              {settings.oncePerDay !== false
                ? 'Un seul email par jour et par contact, toutes séquences confondues.'
                : 'Plusieurs emails le même jour sont autorisés.'}
            </li>
            {step.kind === 'email' && (
              <li data-on>
                <XI name="check" className="ico-xs" />
                Sans adresse email, l’étape ne s’exécute pas : le prospect attend dans « Sans email — hors file ».
              </li>
            )}
            {step.mode === 'manual' && (
              <li data-on>
                <XI name="check" className="ico-xs" />
                L’étape suivante attend que la tâche soit marquée faite.
              </li>
            )}
          </ul>
          <p className="rg-hint">
            Ces règles se règlent au niveau de la séquence (à gauche) et du{' '}
            <Link href="/automations/regulateur" style={{ color: 'var(--accent-2)' }}>
              régulateur
            </Link>
            , pas étape par étape.
          </p>
        </Section>
      </div>
    </div>
  )
}

/**
 * Le rendu d'un modèle d'e-mail choisi dans une étape.
 *
 * Sans lui, la seule chose visible était le NOM du modèle : on ne savait ni ce
 * que le prospect allait lire, ni si l'objet portait une variable qui partirait
 * vide. Charge à la demande — l'inspecteur n'affiche qu'une étape à la fois.
 */
function EmailTemplatePreview({
  templateId,
  vars,
  previewOn,
}: {
  templateId: string | null
  vars: VarBag
  previewOn: string | null
}) {
  const tpl = useTemplateBody('email_templates', templateId)
  if (!templateId) return null
  if (!tpl) return <div className="empty-row">Chargement du modèle…</div>
  return (
    <DeuxVersions
      pairs={[tpl.subject, tpl.body]}
      vars={vars}
      previewOn={previewOn}
      rendu={(variant) => (
        <>
          <strong>{interpolateVars(variantText(tpl.subject, variant), vars) || '(sans objet)'}</strong>
          {'\n\n'}
          {interpolateVars(variantText(tpl.body, variant), vars)}
        </>
      )}
    />
  )
}

/** Même chose pour un modèle WhatsApp, qui n'a pas d'objet. */
function WhatsappTemplatePreview({
  templateId,
  vars,
  previewOn,
}: {
  templateId: string
  vars: VarBag
  previewOn: string | null
}) {
  const tpl = useTemplateBody('whatsapp_templates', templateId)
  if (!tpl) return <div className="empty-row">Chargement du modèle…</div>
  return (
    <DeuxVersions
      pairs={[tpl.body]}
      vars={vars}
      previewOn={previewOn}
      rendu={(variant) => interpolateVars(variantText(tpl.body, variant), vars)}
      pied={
        <p className="rg-hint">
          Ce texte vient des{' '}
          <Link href="/automations/modeles" style={{ color: 'var(--accent-2)' }}>
            modèles
          </Link>{' '}
          — le modifier là-bas le change dans toutes les séquences qui s’en servent.
        </p>
      }
    />
  )
}

/**
 * Les DEUX versions du modèle, sur la fiche d'essai, avec celle qui partirait.
 *
 * CE QUE MONTRER UNE SEULE VERSION CACHAIT
 * `pickVariant` tranche par prospect : la version contact ne part que si TOUTES
 * les variables du contact qu'elle cite ont une valeur. L'inspecteur n'affichait
 * donc que le gagnant du jour, et une phrase pour dire que l'autre existait —
 * on relisait la moitié de ce qui part, sans jamais voir l'autre moitié ni
 * pouvoir la corriger. Les deux sont maintenant côte à côte, et le badge dit
 * laquelle cette fiche-là recevrait.
 *
 * Un modèle sans version contact n'affiche qu'un bloc, sans onglet : proposer un
 * choix entre un texte et rien ferait douter de tout l'écran.
 */
function DeuxVersions({
  pairs,
  vars,
  previewOn,
  rendu,
  pied,
}: {
  pairs: VariantPair[]
  vars: VarBag
  previewOn: string | null
  rendu: (variant: MessageVariant) => React.ReactNode
  pied?: React.ReactNode
}) {
  const retenue = pickVariant(pairs, vars)
  const aUneVersionContact = pairs.some((p) => (p.contact ?? '').trim())
  const [montree, setMontree] = useState<MessageVariant>(retenue)
  // La fiche d'essai change → la version retenue change. Rester sur l'onglet
  // précédent laisserait croire que c'est celle-là qui partirait.
  useEffect(() => setMontree(retenue), [retenue])

  if (!aUneVersionContact) {
    return (
      <Field label="Ce que le prospect lira" hint={previewOn ?? 'valeurs d’exemple'}>
        <div className="msg-ed-preview">{rendu('company')}</div>
        <p className="rg-hint" style={{ marginTop: 4 }}>
          Une seule version écrite — elle part à tout le monde. La version contact s’ajoute depuis les modèles.
        </p>
        {pied}
      </Field>
    )
  }

  return (
    <Field label="Ce que le prospect lira" hint={previewOn ?? 'valeurs d’exemple'}>
      <div className="seg" style={{ width: '100%', marginBottom: 6 }}>
        {VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            style={{ flex: 1, justifyContent: 'center', gap: 6 }}
            aria-pressed={montree === v}
            title={VARIANT_LABELS[v].hint}
            onClick={() => setMontree(v)}
          >
            {VARIANT_LABELS[v].tab}
            {retenue === v && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ok)',
                }}
              >
                celle-ci
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="msg-ed-preview">{rendu(montree)}</div>
      <p className="rg-hint" style={{ marginTop: 4 }}>
        <XI name="user" className="ico-xs" /> Sur cette fiche, c’est la {VARIANT_LABELS[retenue].short} qui part
        {retenue === 'company'
          ? ' — la version contact cite une variable que la fiche ne remplit pas.'
          : ' — la fiche porte tout ce que le texte nomme.'}
      </p>
      {pied}
    </Field>
  )
}

/**
 * Charge un modèle et ses deux versions, quelle que soit la table.
 *
 * `select('*')` : `body_contact` n'existe qu'après la migration `20260814`, et
 * PostgREST fait échouer la requête entière sur une colonne inconnue — l'aperçu
 * afficherait « Chargement du modèle… » pour toujours si le code arrivait
 * avant elle.
 */
function useTemplateBody(
  table: string,
  id: string | null,
): { subject: VariantPair; body: VariantPair } | null {
  const [row, setRow] = useState<{ subject: VariantPair; body: VariantPair } | null>(null)
  useEffect(() => {
    if (!id) {
      setRow(null)
      return
    }
    let vivant = true
    supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivant) return
        const d = data as {
          subject?: string | null
          subject_contact?: string | null
          body?: string | null
          body_contact?: string | null
        } | null
        setRow({
          subject: { company: d?.subject ?? null, contact: d?.subject_contact ?? null },
          body: { company: d?.body ?? '', contact: d?.body_contact ?? null },
        })
      })
    return () => {
      vivant = false
    }
  }, [table, id])
  return row
}

function SeqStepPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (kind: SeqStepKind, preset?: Partial<SequenceStep>) => void
}) {
  const cats: {
    label: string
    cat: string
    items: { kind: SeqStepKind; icon: string; name: string; desc: string; waitMode?: 'reply' }[]
  }[] = [
    {
      label: 'Étapes automatiques',
      cat: 'action',
      items: [
        { kind: 'email', icon: 'mail', name: 'Email', desc: "Envoi automatique d'un template via Resend" },
        { kind: 'wait', icon: 'clock', name: 'Attendre un délai', desc: 'Pause avant la prochaine étape' },
      ],
    },
    {
      label: 'Étapes qui attendent quelqu’un',
      cat: 'manual',
      items: [
        {
          kind: 'wait',
          icon: 'user',
          name: 'Attendre une réponse',
          desc: 'Rien ne part tant qu’on n’a pas cliqué « Il a répondu »',
          waitMode: 'reply' as const,
        },
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
                    <div
                      key={`${it.kind}-${it.waitMode ?? 'default'}`}
                      className={`picker-card ${c.cat}`}
                      onClick={() => onPick(it.kind, it.waitMode ? { waitMode: it.waitMode, replyTimeoutDays: 3 } : undefined)}
                    >
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
