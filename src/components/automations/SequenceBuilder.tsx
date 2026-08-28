'use client'
// SequenceBuilder — éditeur de séquence 3 colonnes (réglages / étapes / inspecteur).
// Porté depuis claude design/automations-sequences.jsx.
import React, { useState, useEffect, useRef, useCallback } from 'react'
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
import { SequenceCanvas } from './SequenceCanvas'
import {
  attentesEnAmont,
  casDeLaCondition,
  ciblesDeRedirection,
  incoherencesDeSuite,
  ISSUE_LABEL,
  libelleIssue,
  positionDInsertion,
  sortiesDeLaFourche,
  suiteDeLEtape,
  type Issue,
} from '@/lib/automations/branches'
import {
  CHAMPS_CONDITION,
  CHAMP_LABEL,
  OPERATEUR_LABEL,
  SORTIE_SINON,
  VALEURS_DE,
  libelleCas,
  libelleCondition,
  operateursDe,
  raisonDeRefus,
  raisonDeRefusAiguillage,
  type CasAiguillage,
  type ChampCondition,
  type Condition,
} from '@/lib/automations/conditions'
import { deplacerVers, type CibleDepot } from '@/lib/automations/canvas'
import { MessageEditor } from './MessageEditor'
import { rendreMessage } from '@/lib/automations/redaction'
import { normalizeWindows } from '@/lib/automations/regulator'
import {
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
  const [picker, setPicker] = useState<boolean | { waitId: string; on: Issue }>(false)
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
          // Pas de `trackOpens`/`trackClicks` non plus : rien ne les lit, et on
          // ne veut ni pixel ni réécriture de liens (voir l'étape Email).
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
   * Une carte tirée puis lâchée sur le plan.
   *
   * `deplacerVers` fait tout le travail — nouvel ordre, nouvelle voie — et rend
   * le tableau INTACT quand le dépôt n'a pas de sens. D'où la comparaison par
   * identité : on ne marque la séquence à sauvegarder que si elle a vraiment
   * changé, sinon un aller-retour de la souris déclencherait une écriture.
   */
  const deplacer = useCallback(
    (stepId: string, cible: CibleDepot) => {
      setSteps((prev) => {
        const next = deplacerVers(prev, stepId, cible)
        if (next !== prev) touch()
        return next
      })
    },
    [touch],
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

  /**
   * Renvoyer une carte vers une autre — ou couper le renvoi.
   *
   * `null` remet la suite à « continuer », ce qui est aussi ce qu'on veut quand
   * on annule : une étape sans suite déclarée descend au suivant, comme avant
   * qu'on ne touche à rien.
   */
  const rediriger = useCallback(
    (stepId: string, cibleId: string | null) => {
      touch()
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, suite: cibleId ? { type: 'aller_a' as const, cible: cibleId } : { type: 'suivre' as const } }
            : s,
        ),
      )
    },
    [touch],
  )

  /** Une réécriture d'ensemble — bascule d'une condition en aiguillage, par ex. */
  const reecrire = useCallback(
    (fn: (prev: SequenceStep[]) => SequenceStep[]) => {
      touch()
      setSteps((prev) => fn(prev))
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
          {/* L'AUTRE FACE DU MÊME OBJET, à portée de clic. Cet éditeur dit ce
              que la séquence FERA ; sa campagne dit à qui, combien restent à
              lancer, et pourquoi les autres sont écartés. On ouvrait l'éditeur
              pour y chercher une liste qui n'y est pas — il n'y a pas de table
              `campagnes`, c'est la même ligne d'`automations`. */}
          <Link href={`/prospection/campagnes/${id}`} className="btn outline sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
            <XI name="users" className="ico-sm" />
            Voir l’audience de cette campagne
          </Link>
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
          <SequenceSummary name={name} settings={settings} stepCount={steps.length} />
          <SequenceCanvas
            steps={steps}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={removeStep}
            onMove={reorder}
            onDeplacer={deplacer}
            onAjouter={(branch) => setPicker(branch ?? true)}
            onRediriger={rediriger}
            carte={({ step, index, orpheline }) => (
              <SeqStep step={step} index={index} orpheline={orpheline} />
            )}
          />
          <AvertissementsSequence steps={steps} onSelect={setSelectedId} />
          <button
            type="button"
            className="seq-ajout"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPicker(true)}
          >
            <XI name="plus" className="ico-sm" />
            Ajouter une étape
          </button>
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
          onReecrire={reecrire}
          sequenceId={id}
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

      {/* LA SÉQUENCE D'ENTRÉE — le contraire d'un public, et c'est voulu.
          Une séquence qui commence par une condition (« a-t-il un mobile ? »)
          et aiguille elle-même n'a pas de public à déclarer : le sien est
          « joignable ». La suggestion ne peut donc pas la trouver — elle ignore
          exprès les séquences sans besoin de canal, sinon la première séquence
          sans règle s'imposerait à tout le parc. On la désigne à la main. */}
      <Field label="Séquence d’entrée" hint="où atterrit un prospect que personne ne réclame">
        <label className="seq-entree">
          <input
            className="seq-check"
            type="checkbox"
            checked={settings.entree === true}
            onChange={(e) => onChange({ entree: e.target.checked })}
          />
          <span>
            Attribuer une entreprise l’inscrit ici, quand aucun public ne lui correspond.
          </span>
        </label>
      </Field>
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
  if (step.kind === 'sms')
    return { icon: 'sms', title: step.label || 'SMS', subtitle: 'Texto préparé — ouvert dans le téléphone' }
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
  if (step.kind === 'condition') {
    // Le libellé de la fourche EST la question qu'elle pose : sans lui, toutes
    // les conditions d'une séquence se ressemblent sur le plan.
    const cas = casDeLaCondition(step)
    return cas.length > 0
      ? {
          icon: 'filter',
          title: 'Aiguillage',
          subtitle: `${cas.length + 1} voies · ${cas.map((c) => libelleCas(c)).join(' · ')}`,
        }
      : {
          icon: 'branch',
          title: libelleCondition((step.condition ?? {}) as Partial<Condition>),
          subtitle: 'Sépare le chemin — n’envoie rien',
        }
  }
  if (step.kind === 'transition') {
    const seq = ref.sequences?.find((x) => x.id === step.transition?.automationId)
    return {
      icon: 'share',
      title: seq?.name || 'Passer à une autre séquence',
      subtitle: step.transition?.automationId
        ? 'Sort d’ici et ouvre là-bas'
        : 'Destination à choisir',
    }
  }
  return { icon: 'task', title: 'Tâche', subtitle: 'Action manuelle' }
}

/**
 * Le contenu d'une carte d'étape. Le plan la place et l'outille (poignée,
 * flèches, corbeille) ; elle ne s'occupe que de ce qu'il y a à lire.
 *
 * Le délai, l'heure décidée par le régulateur et « tâche à un humain » vivaient
 * jusqu'ici dans le connecteur entre deux cartes. Sur un plan, il n'y a plus
 * d'interligne où les loger : ils descendent en pied de carte, ce qui les
 * rattache d'ailleurs à la bonne étape — au-dessus, on lisait le délai de la
 * suivante.
 */
function SeqStep({
  step,
  index,
  orpheline = false,
}: {
  step: SequenceStep
  index: number
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
      </div>
      <div className="ft">
        <span className="wait-chip">
          <XI name="clock" className="ico-xs" />
          {step.day > 0 ? `J+${step.day}` : 'immédiat'}
        </span>
        {step.kind === 'email' && (
          <span className="wait-chip accent">
            <XI name="settings" className="ico-xs" />
            régulateur
          </span>
        )}
        {step.mode === 'manual' && (
          <span className="wait-chip manual">
            <XI name="user" className="ico-xs" />à la main
          </span>
        )}
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
            // La clé de sortie peut contenir n'importe quoi ; seul le PREMIER
            // deux-points sépare l'identifiant de la fourche de la sortie.
            const coupe = v.indexOf(':')
            onBranche({ waitId: v.slice(0, coupe), on: v.slice(coupe + 1) })
          }}
        >
          <option value="">Toujours — tronc commun</option>
          {attentes.map((w) =>
            /* MÊME STOCKAGE, PLUSIEURS LECTURES : sur une attente ça se lit
               « il a répondu / sans réponse », sur une condition « oui / non »,
               sur un aiguillage le libellé du cas. `sortiesDeLaFourche` est le
               seul endroit qui sait combien il y en a et comment elles
               s'appellent — l'éditeur n'a pas à connaître la nature de l'étape. */
            sortiesDeLaFourche(steps[w]).map((sortie) => (
              <option key={`${steps[w].id}:${sortie.cle}`} value={`${steps[w].id}:${sortie.cle}`}>
                Étape {w + 1} · {sortie.titre}
              </option>
            )),
          )}
        </select>
        <p className="rg-hint">
          {courant
            ? libelleIssue(
                steps[steps.findIndex((x) => x.id === courant.waitId)],
                courant.on,
              ).aide
            : 'Traversée quoi qu’il arrive. Placez-la sur une voie pour qu’elle ne parte que dans ce cas-là.'}
        </p>
      </Field>
    </Section>
  )
}

/**
 * Les trois champs d'un test : ce qu'on regarde, comment, et à quoi on compare.
 *
 * Le même bloc sert à la question unique et à chaque cas d'un aiguillage. Deux
 * copies auraient fini par ne plus proposer les mêmes opérateurs — et personne
 * ne s'en apercevrait avant qu'une voie ne se vide.
 */
function TestCondition({
  c,
  onChange,
}: {
  c: Partial<Condition>
  onChange: (p: Record<string, unknown>) => void
}) {
  const champ = c.champ as ChampCondition
  const connu = CHAMPS_CONDITION.includes(champ)
  const ops = connu ? operateursDe(champ) : []
  const valeurs = connu ? VALEURS_DE[champ] : undefined

  return (
    <>
      <select
        className="input"
        aria-label="Champ testé"
        value={connu ? champ : ''}
        onChange={(e) => {
          const nouveau = e.target.value as ChampCondition
          // Changer de champ jette l'opérateur et les valeurs : ils ne veulent
          // plus rien dire, et les garder ferait une condition incohérente
          // qu'on ne verrait qu'au premier prospect.
          onChange({
            champ: nouveau,
            operateur: operateursDe(nouveau)[0],
            valeurs: undefined,
            seuil: undefined,
          })
        }}
      >
        <option value="">Choisir…</option>
        {CHAMPS_CONDITION.map((k) => (
          <option key={k} value={k}>
            {CHAMP_LABEL[k]}
          </option>
        ))}
      </select>

      {connu && ops.length > 1 && (
        <select
          className="input"
          aria-label="Opérateur"
          value={c.operateur}
          onChange={(e) => onChange({ operateur: e.target.value })}
          style={{ marginTop: 6 }}
        >
          {ops.map((o) => (
            <option key={o} value={o}>
              {OPERATEUR_LABEL[o]}
            </option>
          ))}
        </select>
      )}

      {connu && (c.operateur === 'est' || c.operateur === 'nest_pas') && valeurs && (
        <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
          {valeurs.map((v) => (
            <label key={v.valeur} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={(c.valeurs ?? []).includes(v.valeur)}
                onChange={() => {
                  const actuelles = c.valeurs ?? []
                  onChange({
                    valeurs: actuelles.includes(v.valeur)
                      ? actuelles.filter((x) => x !== v.valeur)
                      : [...actuelles, v.valeur],
                  })
                }}
              />
              {v.libelle}
            </label>
          ))}
        </div>
      )}

      {connu && (c.operateur === 'au_moins' || c.operateur === 'au_plus') && (
        <input
          className="input mono"
          type="number"
          aria-label="Seuil"
          value={c.seuil ?? ''}
          onChange={(e) => onChange({ seuil: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ marginTop: 6 }}
        />
      )}
    </>
  )
}

/** La première clé de cas encore libre — `c1`, `c2`… Stable une fois posée. */
function nouvelleCle(cas: readonly CasAiguillage[]): string {
  let n = cas.length + 1
  while (cas.some((c) => c.cle === `c${n}`)) n++
  return `c${n}`
}

/**
 * Écrire une condition — ce qu'on teste, et où va-t-on quand on ne sait pas.
 *
 * DEUX FORMES, ET ON CHOISIT LAQUELLE.
 *
 * · **Une question** : deux voies, oui et non. `siInconnu` dit où envoyer celui
 *   dont la donnée manque — et ce cas n'est pas rare : 672 entreprises sur
 *   2 884 ont un effectif « inconnu », 374 des 933 tâches n'ont pas de cohorte.
 *   Sans ce réglage visible, la voie « non » ramasserait silencieusement tous
 *   les prospects mal renseignés.
 *
 * · **Un aiguillage** : autant de voies que de cas, plus « sinon ». Le premier
 *   cas vrai gagne, donc l'ORDRE compte, et c'est pour ça qu'on peut le
 *   changer ici. `siInconnu` disparaît : dans une cascade, un cas qu'on ne sait
 *   pas trancher n'attrape personne, il laisse passer au suivant. C'est
 *   « sinon » qui ramasse — et il faut l'écrire en le sachant.
 *
 * ON REFUSE D'ÉCRIRE PLUTÔT QUE D'ÉCRIRE UNE CONDITION QUI NE TRANCHERA JAMAIS.
 * `raisonDeRefus` et `raisonDeRefusAiguillage` disent en français ce qui manque,
 * à l'endroit où ça manque : une condition incohérente déployée enverrait tout
 * le monde dans la même voie sans que personne le voie.
 */
function ConditionSection({
  step,
  onUpdate,
  onReecrire,
}: {
  step: SequenceStep
  onUpdate: (p: Partial<SequenceStep>) => void
  onReecrire: (fn: (prev: SequenceStep[]) => SequenceStep[]) => void
}) {
  const c = step.condition ?? { champ: '', operateur: '' }
  const cas = casDeLaCondition(step)
  const aiguillage = cas.length > 0
  const refus = aiguillage
    ? raisonDeRefusAiguillage(cas)
    : raisonDeRefus(c as Partial<Condition>)

  const maj = (p: Record<string, unknown>) =>
    onUpdate({ condition: { ...c, ...p } as SequenceStep['condition'] })

  const majCas = (cle: string, p: Record<string, unknown>) =>
    maj({ cas: cas.map((x) => (x.cle === cle ? { ...x, ...p } : x)) })

  /**
   * Passer d'une question à un aiguillage — EN EMPORTANT LES VOIES.
   *
   * Les étapes déjà écrites portent `on: 'reply'` et `on: 'timeout'`. Si l'on
   * se contentait d'ajouter les cas, ces deux clés ne correspondraient plus à
   * aucune sortie : les voies deviendraient orphelines et rien n'en partirait
   * plus. On les renomme donc dans le même geste — « oui » devient le premier
   * cas, « non » devient « sinon ».
   */
  const versAiguillage = () =>
    onReecrire((prev) =>
      prev.map((s) => {
        if (s.id === step.id) {
          return {
            ...s,
            condition: {
              ...c,
              cas: [
                {
                  cle: 'c1',
                  champ: c.champ,
                  operateur: c.operateur,
                  ...(c.valeurs ? { valeurs: c.valeurs } : {}),
                  ...(c.seuil != null ? { seuil: c.seuil } : {}),
                },
              ],
            } as SequenceStep['condition'],
          }
        }
        if (s.branch?.waitId !== step.id) return s
        return { ...s, branch: { waitId: step.id, on: s.branch.on === 'reply' ? 'c1' : SORTIE_SINON } }
      }),
    )

  /**
   * Revenir à une question — offert SEULEMENT quand il ne reste qu'un cas.
   *
   * À deux cas ou plus, revenir en arrière obligerait à verser deux voies dans
   * une seule : les messages de l'une et de l'autre s'entremêleraient dans le
   * tableau, et personne ne saurait plus lequel part à qui. Retirer les cas un
   * par un est plus long, mais on voit ce qu'on perd.
   */
  const versQuestion = () =>
    onReecrire((prev) =>
      prev.map((s) => {
        if (s.id === step.id) {
          const premier = cas[0]
          return {
            ...s,
            condition: {
              champ: premier.champ,
              operateur: premier.operateur,
              ...(premier.valeurs ? { valeurs: premier.valeurs } : {}),
              ...(premier.seuil != null ? { seuil: premier.seuil } : {}),
              ...(c.siInconnu ? { siInconnu: c.siInconnu } : {}),
            } as SequenceStep['condition'],
          }
        }
        if (s.branch?.waitId !== step.id) return s
        return {
          ...s,
          branch: { waitId: step.id, on: s.branch.on === cas[0].cle ? 'reply' : 'timeout' },
        }
      }),
    )

  const bougerCas = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= cas.length) return
    const copie = [...cas]
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
    maj({ cas: copie })
  }

  return (
    <Section label={aiguillage ? 'L’aiguillage' : 'Ce qu’on teste'}>
      <Field label="Forme" hint={aiguillage ? `${cas.length + 1} voies` : '2 voies'}>
        <SegFull
          value={aiguillage ? 'aiguillage' : 'question'}
          options={[
            { value: 'question', label: 'Une question' },
            { value: 'aiguillage', label: 'Un aiguillage' },
          ]}
          onChange={(v) => {
            if (v === 'aiguillage' && !aiguillage) versAiguillage()
            if (v === 'question' && aiguillage && cas.length === 1) versQuestion()
          }}
        />
        {aiguillage && cas.length > 1 && (
          <p className="rg-hint">
            Pour revenir à une simple question, retirez les cas jusqu’à n’en garder qu’un : verser deux voies
            dans une seule mélangerait leurs messages sans qu’on puisse dire lequel part à qui.
          </p>
        )}
      </Field>

      {!aiguillage && (
        <>
          <Field label="Test">
            <TestCondition c={c as Partial<Condition>} onChange={maj} />
          </Field>

          <Field label="Si on ne sait pas" hint="la donnée manque pour ce prospect">
            <select
              className="input"
              value={c.siInconnu ?? 'non'}
              onChange={(e) => maj({ siInconnu: e.target.value as 'oui' | 'non' })}
            >
              <option value="non">Prendre la voie « non »</option>
              <option value="oui">Prendre la voie « oui »</option>
            </select>
            <p className="rg-hint">
              Une condition ne gèle JAMAIS l’inscription — c’est un gel sans réveil qui a laissé 59 inscriptions
              dormir des semaines. Elle tranche, et elle note qu’elle a tranché sans savoir : on peut donc compter
              après coup combien de prospects sont partis dans une voie devinée.
            </p>
          </Field>
        </>
      )}

      {aiguillage && (
        <>
          {cas.map((cs, i) => (
            <Field
              key={cs.cle}
              label={`Cas ${i + 1}`}
              hint={i === 0 ? 'testé en premier' : `testé après le cas ${i}`}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  aria-label={`Nom de la voie du cas ${i + 1}`}
                  placeholder={libelleCondition(cs)}
                  value={cs.libelle ?? ''}
                  onChange={(e) => majCas(cs.cle, { libelle: e.target.value })}
                />
                <button
                  className="btn ghost sm icon"
                  type="button"
                  title="Tester plus tôt"
                  disabled={i === 0}
                  onClick={() => bougerCas(i, -1)}
                >
                  <XI name="chevup" className="ico-sm" />
                </button>
                <button
                  className="btn ghost sm icon"
                  type="button"
                  title="Tester plus tard"
                  disabled={i === cas.length - 1}
                  onClick={() => bougerCas(i, 1)}
                >
                  <XI name="chevdown" className="ico-sm" />
                </button>
                <button
                  className="btn ghost sm icon"
                  type="button"
                  title="Retirer ce cas"
                  onClick={() => maj({ cas: cas.filter((x) => x.cle !== cs.cle) })}
                >
                  <XI name="trash" className="ico-sm" />
                </button>
              </div>
              <TestCondition c={cs} onChange={(p) => majCas(cs.cle, p)} />
            </Field>
          ))}

          <button
            className="btn outline sm"
            type="button"
            onClick={() => maj({ cas: [...cas, { cle: nouvelleCle(cas), champ: '', operateur: '' }] })}
          >
            <XI name="plus" className="ico-sm" />
            Ajouter un cas
          </button>

          <p className="rg-hint" style={{ marginTop: 10 }}>
            Le premier cas vrai gagne. Un cas qu’on ne sait pas mesurer n’attrape personne : il laisse passer au
            suivant, et « sinon » ramasse. <b>Écrivez donc « sinon » pour quelqu’un dont on ne sait rien</b>, pas
            seulement pour ceux qu’aucun cas ne décrit.
          </p>
        </>
      )}

      {refus && (
        <div className="seq-regchip manual" style={{ marginTop: 8 }}>
          <XI name="warning" className="ico-sm" />
          <span>
            {refus}{' '}
            {aiguillage
              ? 'Tant que c’est le cas, ce cas n’attrapera personne et les prospects iront dans « sinon ».'
              : 'Tant que c’est le cas, tous les prospects prendront la voie choisie ci-dessus.'}
          </span>
        </div>
      )}

      {!refus && (
        <p className="rg-hint" style={{ marginTop: 8 }}>
          Se lira :{' '}
          <b>
            {aiguillage
              ? cas.map((x) => libelleCas(x)).join(' · sinon ') + ' · sinon…'
              : libelleCondition(c as Partial<Condition>)}
          </b>
        </p>
      )}
    </Section>
  )
}

/**
 * Choisir la séquence suivante.
 *
 * PLUSIEURS SÉQUENCES PLUTÔT QU'UNE ÉNORME, et c'est un choix de lisibilité
 * autant que de moteur : « premier contact », « démo envoyée », « engagé »,
 * « nurture » posent chacune UNE question et se relisent seules. La même chose
 * écrite d'un bloc tiendrait sur cinq écrans et personne n'oserait la retoucher.
 *
 * ⚠️ LE PROSPECT SORT D'ICI EN ENTRANT LÀ-BAS. Il n'est jamais dans deux
 * séquences de démarchage à la fois — sinon deux fils de messages partiraient
 * en parallèle chez le même artisan, chacun ignorant l'autre.
 */
function TransitionSection({
  sequenceId,
  step,
  onUpdate,
}: {
  sequenceId: string
  step: SequenceStep
  onUpdate: (p: Partial<SequenceStep>) => void
}) {
  const ref = useRefData()
  const choisie = step.transition?.automationId ?? ''
  // Soi-même est exclu : une séquence qui se repasse le prospect à elle-même
  // rouvrirait une inscription identique à l'infini. Le moteur le refuse déjà
  // (`processTransitionStep`) ; ne pas le proposer évite d'avoir à l'expliquer.
  const autres = ref.sequences.filter((x) => x.id !== sequenceId)

  return (
    <Section label="Séquence suivante">
      <Field label="Passer le prospect à" hint={choisie ? undefined : 'à choisir'}>
        <select
          className="select"
          value={choisie}
          onChange={(e) =>
            onUpdate({
              transition: e.target.value
                ? { automationId: e.target.value, ...(step.transition?.motif ? { motif: step.transition.motif } : {}) }
                : null,
            })
          }
        >
          <option value="">Choisir une séquence…</option>
          {autres.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.status !== 'on' ? ` — ${x.status}` : ''}
            </option>
          ))}
        </select>
        <p className="rg-hint">
          L’inscription courante se ferme (motif « passée à une autre séquence », qui ne renvoie pas le prospect
          au stock) et une inscription s’ouvre en face. Une séquence en pause gèle ce qu’elle reçoit avec un
          motif visible plutôt que de le perdre : on peut donc poser le relais avant de l’avoir lancée.
        </p>
      </Field>
      {!choisie && (
        <div className="seq-regchip manual">
          <XI name="warning" className="ico-sm" />
          <span>
            Sans destination, la séquence s’arrête ici pour ce prospect — elle ne le fera pas continuer plus bas.
          </span>
        </div>
      )}
    </Section>
  )
}

/**
 * CE QUI SE PASSE APRÈS CETTE ÉTAPE.
 *
 * C'est la section qui manquait, et son absence a un nom : « après le premier
 * contact et l'appel, c'est le flou ». Une voie ne savait que rejoindre le
 * tronc ; aucune ne pouvait s'arrêter pour de bon, aucune ne pouvait renvoyer
 * ailleurs. Les six séquences finissaient donc toutes sur un appel, sans rien
 * derrière — le flou était écrit dans les séquences, pas dans le pipeline.
 *
 * LA JONCTION N'EST PAS UN TYPE DE CARTE, C'EST UN RENVOI PARTAGÉ. Trois voies
 * qui renvoient toutes vers la même étape SONT un point de rendez-vous, et le
 * plan le montre en trois traits qui convergent. Une carte « rejoindre » en
 * plus aurait fallu la placer, la déplacer, la supprimer — pour ne rien dire de
 * plus.
 */
function SuiteSection({
  steps,
  step,
  onUpdate,
}: {
  steps: SequenceStep[]
  step: SequenceStep
  onUpdate: (p: Partial<SequenceStep>) => void
}) {
  const idx = steps.findIndex((s) => s.id === step.id)
  const suite = suiteDeLEtape(step)
  const cibles = idx < 0 ? [] : ciblesDeRedirection(steps, idx)

  return (
    <Section label="Et après ?">
      <Field
        label="À la fin de cette étape"
        hint={suite.type === 'suivre' ? 'la suite normale' : suite.type === 'fin' ? 'terminé' : 'renvoi'}
      >
        <SegFull
          value={suite.type}
          options={[
            { value: 'suivre', label: 'Continuer' },
            { value: 'aller_a', label: 'Renvoyer' },
            { value: 'fin', label: 'Finir' },
          ]}
          onChange={(v) => {
            if (v === 'suivre') return onUpdate({ suite: { type: 'suivre' } })
            if (v === 'fin') return onUpdate({ suite: { type: 'fin' } })
            const premiere = cibles[0]
            onUpdate({
              suite:
                premiere == null
                  ? { type: 'suivre' }
                  : { type: 'aller_a', cible: steps[premiere].id },
            })
          }}
        />
      </Field>

      {suite.type === 'aller_a' && (
        <Field label="Renvoyer vers" hint={cibles.length === 0 ? 'aucune cible possible' : undefined}>
          <select
            className="select"
            value={suite.cible}
            onChange={(e) => onUpdate({ suite: { type: 'aller_a', cible: e.target.value } })}
          >
            {!cibles.some((i) => steps[i].id === suite.cible) && (
              <option value={suite.cible}>Étape supprimée — à corriger</option>
            )}
            {cibles.map((i) => (
              <option key={steps[i].id} value={steps[i].id}>
                Étape {i + 1} · {steps[i].kind}
                {i <= idx ? ' (en arrière)' : ''}
              </option>
            ))}
          </select>
          <p className="rg-hint">
            Une redirection ne peut viser que le tronc commun ou sa propre voie. Viser une voie sœur ferait
            recevoir au prospect la première carte d’un chemin et rien de la suite — sans que rien ne le dise.
            Un renvoi en arrière reboucle : il lui faut une fourche ou une fin pour en sortir, sinon le moteur
            s’arrête au bout de 12 tours.
          </p>
        </Field>
      )}

      {suite.type === 'fin' && (
        <Field label="Motif" hint="écrit sur la carte, et gardé sur l’inscription">
          <input
            className="input"
            placeholder="sans réponse après 3 relances"
            value={suite.motif ?? ''}
            onChange={(e) => onUpdate({ suite: { type: 'fin', motif: e.target.value } })}
          />
          <p className="rg-hint">
            La séquence se termine ici pour ceux qui passent par cette carte. C’est ce qui remplace le prospect
            qui reste « en attente » sans que rien ne le réveille : une fin datée et motivée se compte, un silence
            non.
          </p>
        </Field>
      )}
    </Section>
  )
}

/**
 * Ce qui, dans la séquence entière, ne tient pas debout.
 *
 * POSÉ SUR LE PLAN, PAS DANS L'INSPECTEUR. Une incohérence de renvoi concerne
 * deux cartes : la montrer dans le panneau de l'une des deux obligerait à
 * l'avoir sélectionnée pour la découvrir. Ici elle se voit sans rien cliquer,
 * et un clic emmène sur la carte fautive.
 */
function AvertissementsSequence({
  steps,
  onSelect,
}: {
  steps: SequenceStep[]
  onSelect: (id: string) => void
}) {
  const soucis = incoherencesDeSuite(steps)
  if (soucis.length === 0) return null
  return (
    <div className="seq-avertis">
      {soucis.map((s) => (
        <button key={s.stepId + s.phrase} type="button" onClick={() => onSelect(s.stepId)}>
          <XI name="warning" className="ico-xs" />
          {s.phrase}
        </button>
      ))}
    </div>
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
  onReecrire,
  sequenceId,
}: {
  steps: SequenceStep[]
  step: SequenceStep | undefined
  settings: SequenceSettings
  /** Valeurs de l'entreprise d'essai, pour rendre les messages tels qu'ils partiront. */
  vars: VarBag
  previewOn: string | null
  onUpdate: (p: Partial<SequenceStep>) => void
  onBranche: (branch: SequenceStep['branch']) => void
  onReecrire: (fn: (prev: SequenceStep[]) => SequenceStep[]) => void
  sequenceId: string
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
        {step.kind === 'condition' && (
          <ConditionSection step={step} onUpdate={onUpdate} onReecrire={onReecrire} />
        )}
        {step.kind === 'transition' && (
          <TransitionSection sequenceId={sequenceId} step={step} onUpdate={onUpdate} />
        )}
        {/* Un passage de relais n'a pas de suite : il sort. */}
        {step.kind !== 'transition' && <SuiteSection steps={steps} step={step} onUpdate={onUpdate} />}
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
            {/*
              Les deux interrupteurs restent, éteints et expliqués, comme celui
              du PDF juste en dessous.

              Ils promettaient un réglage PAR ÉTAPE qui n'existe nulle part :
              Resend n'a aucune option de suivi dans son appel d'envoi (vérifié
              dans le SDK), c'est un réglage de domaine. Les valeurs écrites ici
              n'ont donc jamais été transmises — cochées ou non, il ne se passait
              rien, et l'opérateur croyait mesurer.

              Et on n'active pas non plus le réglage de domaine : le pixel
              d'ouverture et la réécriture des liens dégradent tous deux la
              réputation de la boîte. Décision de Matteo, 19/08/2026.

              Ce qui se mesure sans rien dégrader : les liens à jeton (rapport
              d'audit, plaquette, démo) comptent leurs vues côté serveur, par
              prospect. C'est la même information, sans pixel.
            */}
            <ToggleRow
              label="Tracker les ouvertures"
              checked={false}
              onChange={() => {}}
              disabled
              desc="Volontairement absent : le pixel d’ouverture dégrade la réputation de la boîte. Le rapport d’audit et la plaquette comptent déjà leurs vues, par prospect."
              accent
            />
            <ToggleRow
              label="Tracker les clics"
              checked={false}
              onChange={() => {}}
              disabled
              desc="Volontairement absent : la réécriture des liens dégrade la délivrabilité. Les liens à jeton comptent leurs visites sans être réécrits."
              accent
            />
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
                  canal="whatsapp"
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
        {step.kind === 'sms' && (
          <Section label="SMS manuel">
            <Field label="Message">
              <MessageEditor
                value={step.message || ''}
                onChange={(message) => onUpdate({ message })}
                vars={vars}
                rows={4}
                canal="sms"
                previewOn={previewOn ?? 'des valeurs d’exemple'}
                placeholder="Bonjour {{company.name}}, "
              />
            </Field>
            {/* Le compteur de l'éditeur dit déjà le coût. Ce qu'il ne peut pas
                dire, c'est POURQUOI le CRM n'envoie pas lui-même. */}
            <p className="rg-hint">
              Le SMS n’est pas envoyé par le CRM : la tâche ouvre l’application de messagerie du
              téléphone avec le texte déjà écrit. Un fournisseur existe côté téléphonie, mais il n’a
              jamais envoyé un seul message — le brancher dans une boucle automatique se paierait au
              premier lot.
            </p>
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
            {/*
              LE DÉCOMPTE ÉTAIT FAUX DEUX FOIS, et il s'affichait ici.
              « /300 » : LinkedIn plafonne la note d'invitation à 200 caractères,
              pas 300. Et il comptait `step.message`, c'est-à-dire la SOURCE :
              un message de 190 caractères dont 40 sont `{{company.name}}` en
              fait 180 ou 210 selon le prospect. Le compteur vit désormais dans
              l'éditeur, qui mesure le rendu et connaît la limite du canal.
            */}
            <Field label={step.action === 'inmail' ? 'Message InMail' : 'Note d’invitation'}>
              <MessageEditor
                value={step.message || ''}
                onChange={(message) => onUpdate({ message })}
                vars={vars}
                rows={4}
                canal={step.action === 'inmail' ? 'linkedin_message' : 'linkedin_invitation'}
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
                    Au bout de ce délai, la voie « sans réponse » part toute seule. Les jours des étapes suivantes se
                    comptent depuis la relance.
                  </p>
                </Field>
                {/*
                  L'AVERTISSEMENT QUI MANQUAIT. Un délai nul ne se lit pas comme
                  une impasse — il se lit comme un réglage prudent, et c'est
                  exactement pour ça que 59 inscriptions ont dormi des semaines
                  sans que personne ne le voie. Il faut le dire au moment où on
                  le pose, et le dire en danger : aucune horloge ne les
                  réveillera, et la voie « sans réponse » ne peut même pas être
                  dessinée tant que le délai vaut 0.
                */}
                {!step.replyTimeoutDays && (
                  <div className="seq-regchip impasse">
                    <XI name="warning" className="ico-sm" />
                    <span>
                      <strong>Attente sans limite.</strong> Aucune horloge ne réveillera ces prospects : seul un clic
                      sur « Il a répondu » les fera repartir. Tant que ce champ vaut 0, la voie{' '}
                      <strong>« Sans réponse »</strong> n’existe pas et rien ne peut y être écrit — c’est ce réglage qui
                      a laissé <strong>59 inscriptions</strong> dormir sans date de réveil. Poser un délai est presque
                      toujours le bon choix.
                    </span>
                  </div>
                )}
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
          <strong>{rendreMessage(variantText(tpl.subject, variant), vars) || '(sans objet)'}</strong>
          {'\n\n'}
          {rendreMessage(variantText(tpl.body, variant), vars)}
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
      rendu={(variant) => rendreMessage(variantText(tpl.body, variant), vars)}
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
    items: {
      kind: SeqStepKind
      icon: string
      name: string
      desc: string
      waitMode?: 'reply'
      /** Ouvre directement la condition en mode aiguillage, avec un premier cas. */
      cas?: boolean
    }[]
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
      label: 'Aiguillage',
      cat: 'action',
      items: [
        {
          kind: 'condition',
          icon: 'branch',
          name: 'Condition',
          desc: 'Sépare le chemin en deux — « oui » et « non » — sans rien envoyer',
        },
        {
          kind: 'condition',
          icon: 'filter',
          name: 'Aiguillage à plusieurs voies',
          desc: 'Une voie par cas, plus « sinon » — le premier cas vrai gagne',
          cas: true,
        },
        {
          kind: 'transition',
          icon: 'share',
          name: 'Passer à une autre séquence',
          desc: 'Ferme cette séquence pour ce prospect et l’ouvre dans une autre',
        },
      ],
    },
    {
      label: 'Étapes manuelles (file de démarchage)',
      cat: 'manual',
      items: [
        { kind: 'call', icon: 'phone', name: 'Appel téléphonique', desc: 'Avec script pré-rédigé' },
        { kind: 'whatsapp', icon: 'whatsapp', name: 'WhatsApp', desc: 'Message à valider et envoyer' },
        { kind: 'sms', icon: 'sms', name: 'SMS', desc: 'Texto préparé, ouvert dans le téléphone' },
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
                      key={`${it.kind}-${it.waitMode ?? (it.cas ? 'cas' : 'default')}`}
                      className={`picker-card ${c.cat}`}
                      onClick={() =>
                        onPick(
                          it.kind,
                          it.waitMode
                            ? { waitMode: it.waitMode, replyTimeoutDays: 3 }
                            : it.cas
                              ? {
                                  condition: {
                                    champ: '',
                                    operateur: '',
                                    cas: [{ cle: 'c1', champ: '', operateur: '' }],
                                  },
                                }
                              : undefined,
                        )
                      }
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
