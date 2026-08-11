'use client'
// TemplatesPage — la bibliothèque de messages réutilisables.
//
// POURQUOI CET ÉCRAN EXISTE
// Les tables `whatsapp_templates` et `call_scripts` existaient depuis la v2 des
// automatisations, et le moteur les lisait déjà — mais AUCUN écran n'y écrivait.
// Elles étaient donc vides, et le sélecteur du builder n'avait rien à proposer :
// chaque message WhatsApp devait être retapé dans chaque étape de chaque
// séquence, sans aperçu et sans réutilisation.
//
// Or les séquences multicanal partagent leurs messages : l'accroche « bonjour,
// je suis bien avec X ? » et l'envoi du site démo servent à la fois à la
// séquence WhatsApp seule et à la séquence mixte. Les écrire une fois est tout
// l'intérêt.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { XI } from './icons'
import { Field, Section } from './atoms'
import { MessageEditor } from './MessageEditor'
import { useRefData } from './ref-data'
import { listAutomations } from './automations-db'
import {
  TEMPLATE_LABELS,
  createTemplate,
  deleteTemplate,
  listAllTemplates,
  updateTemplate,
  type MessageTemplate,
  type TemplateFamily,
} from './templates-db'
import { authedFetch } from '@/utils/authedFetch'
import { sampleVars, type VarBag } from '@/lib/automations/variables'
import type { Automation, SequenceDefinition } from './types'

const FAMILIES: TemplateFamily[] = ['whatsapp', 'email', 'call']

const FAMILY_ICON: Record<TemplateFamily, string> = {
  whatsapp: 'whatsapp',
  email: 'mail',
  call: 'phone',
}

/** Le débounce de l'enregistrement, aligné sur le builder de séquences. */
const SAVE_DELAY = 700

export function TemplatesPage() {
  const ref = useRefData()
  const [byFamily, setByFamily] = useState<Record<TemplateFamily, MessageTemplate[]>>({
    whatsapp: [],
    email: [],
    call: [],
  })
  const [selected, setSelected] = useState<{ family: TemplateFamily; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [sequences, setSequences] = useState<Automation[]>([])
  const [vars, setVars] = useState<VarBag>(() => sampleVars())
  const [previewOn, setPreviewOn] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setByFamily(await listAllTemplates())
    } catch {
      toast.error('Chargement des modèles impossible')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    listAutomations('sequence').then(setSequences).catch(() => {})
  }, [reload])

  const current = useMemo(() => {
    if (!selected) return null
    return byFamily[selected.family].find((t) => t.id === selected.id) ?? null
  }, [selected, byFamily])

  /**
   * Les séquences qui se servent de ce modèle.
   *
   * Sans ça, supprimer un modèle est un pari : le moteur retomberait sur le
   * message libre de l'étape — souvent vide — et l'étape partirait muette.
   */
  const usedBy = useMemo(() => {
    if (!current) return []
    return sequences.filter((s) => {
      const def = (s.definition as SequenceDefinition) ?? { steps: [] }
      return (Array.isArray(def.steps) ? def.steps : []).some(
        (step) => step.template === current.id || step.script === current.id,
      )
    })
  }, [current, sequences])

  /** Charge le sac de variables d'une vraie entreprise pour l'aperçu. */
  const chargerApercu = useCallback(async (entrepriseId: string) => {
    if (!entrepriseId) {
      setVars(sampleVars())
      setPreviewOn(null)
      return
    }
    try {
      const res = await authedFetch(`/api/automations/preview?entreprise_id=${entrepriseId}`)
      const payload = (await res.json()) as { vars?: VarBag; company?: string | null }
      setVars(payload.vars ?? sampleVars())
      setPreviewOn(payload.company ?? null)
    } catch {
      toast.error('Aperçu indisponible — valeurs d’exemple conservées')
    }
  }, [])

  const patch = useCallback(
    (p: Partial<MessageTemplate>) => {
      if (!selected) return
      setByFamily((prev) => ({
        ...prev,
        [selected.family]: prev[selected.family].map((t) => (t.id === selected.id ? { ...t, ...p } : t)),
      }))
    },
    [selected],
  )

  // Enregistrement différé : on écrit ce qui est à l'écran, pas ce qui était
  // dans la closure au moment de la frappe.
  useEffect(() => {
    if (!current || !selected) return
    const t = setTimeout(() => {
      updateTemplate(selected.family, selected.id, {
        name: current.name,
        body: current.body,
        subject: current.subject,
        duration: current.duration,
      }).catch(() => toast.error('Enregistrement échoué'))
    }, SAVE_DELAY)
    return () => clearTimeout(t)
  }, [current, selected])

  async function ajouter(family: TemplateFamily) {
    try {
      const created = await createTemplate(family, { name: `Nouveau ${TEMPLATE_LABELS[family].one.toLowerCase()}` })
      await reload()
      setSelected({ family, id: created.id })
      // Le builder lit ses sélecteurs depuis le référentiel : sans ce
      // rafraîchissement, le modèle qu'on vient d'écrire n'y apparaît qu'après
      // un rechargement de page.
      ref.reload()
    } catch {
      toast.error('Création impossible')
    }
  }

  async function supprimer(t: MessageTemplate) {
    if (usedBy.length > 0) {
      toast.error(`Utilisé par ${usedBy.length} séquence${usedBy.length > 1 ? 's' : ''} — retirez-le d’abord`)
      return
    }
    try {
      await deleteTemplate(t.family, t.id)
      setSelected(null)
      await reload()
      ref.reload()
    } catch {
      toast.error('Suppression impossible')
    }
  }

  return (
    <div className="pane" style={{ gridColumn: '1 / -1' }}>
      <div className="pane-hd">
        <div className="title-row">
          <XI name="template" className="ico-sm" style={{ color: 'var(--accent)' }} />
          <span>Modèles de messages</span>
        </div>
        <div className="actions">
          <ApercuPicker onPick={chargerApercu} />
        </div>
      </div>

      <div className="tpl-layout">
        <div className="tpl-list">
          {loading && <div className="tpl-empty">Chargement…</div>}
          {!loading &&
            FAMILIES.map((family) => (
              <div key={family} className="tpl-fam">
                <div className="tpl-fam-hd">
                  <XI name={FAMILY_ICON[family]} className="ico-xs" />
                  <span>{TEMPLATE_LABELS[family].many}</span>
                  <span className="count">{byFamily[family].length}</span>
                </div>
                {byFamily[family].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="tpl-item"
                    // `aria-pressed` et non `aria-selected` : ce sont des
                    // boutons, pas des options d'une liste ARIA.
                    aria-pressed={selected?.id === t.id}
                    onClick={() => setSelected({ family, id: t.id })}
                  >
                    <span className="nm">{t.name}</span>
                  </button>
                ))}
                <button type="button" className="tpl-add" onClick={() => ajouter(family)}>
                  <XI name="plus" className="ico-xs" />
                  Nouveau
                </button>
              </div>
            ))}
        </div>

        <div className="tpl-editor">
          {!current ? (
            <div className="tpl-empty">
              <XI name="cursor" className="ico-xl" style={{ color: 'var(--text-4)', margin: '0 auto 14px' }} />
              <div>Choisissez un modèle, ou créez-en un.</div>
              <p style={{ maxWidth: '52ch', margin: '8px auto 0', fontSize: 12 }}>
                Un modèle s’écrit une fois et sert à plusieurs séquences — c’est le cas des deux messages WhatsApp,
                partagés par la séquence « WhatsApp seul » et la séquence mixte.
              </p>
            </div>
          ) : (
            <>
              <div className="tpl-editor-hd">
                <XI name={FAMILY_ICON[current.family]} className="ico-sm" style={{ color: 'var(--accent)' }} />
                <input
                  className="input"
                  value={current.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Nom du modèle"
                />
                <button
                  type="button"
                  className="btn ghost sm icon"
                  title={usedBy.length > 0 ? 'Utilisé par une séquence' : 'Supprimer'}
                  onClick={() => supprimer(current)}
                >
                  <XI name="trash" className="ico-sm" />
                </button>
              </div>

              <p className="rg-hint" style={{ marginTop: -6, marginBottom: 12 }}>
                {TEMPLATE_LABELS[current.family].hint}
              </p>

              <Section label="Message">
                {current.family === 'email' && (
                  <Field label="Objet" required>
                    <input
                      className="input"
                      value={current.subject ?? ''}
                      onChange={(e) => patch({ subject: e.target.value })}
                      placeholder="Votre site, vu par un client"
                    />
                  </Field>
                )}
                {current.family === 'call' && (
                  <Field label="Durée estimée">
                    <input
                      className="input mono"
                      value={current.duration ?? ''}
                      onChange={(e) => patch({ duration: e.target.value })}
                      placeholder="3 min"
                    />
                  </Field>
                )}
                <MessageEditor
                  value={current.body}
                  onChange={(body) => patch({ body })}
                  vars={vars}
                  previewOn={previewOn ?? 'des valeurs d’exemple'}
                  rows={current.family === 'whatsapp' ? 5 : 10}
                  placeholder={
                    current.family === 'whatsapp'
                      ? 'Bonjour, je suis bien avec {{company.name}} ?'
                      : 'Bonjour {{contact.first_name}},'
                  }
                />
              </Section>

              <Section label="Utilisé par" count={usedBy.length} defaultOpen={usedBy.length > 0}>
                {usedBy.length === 0 ? (
                  <div className="empty-row">Aucune séquence ne s’en sert pour l’instant.</div>
                ) : (
                  <div className="tpl-used">
                    {usedBy.map((s) => (
                      <span key={s.id} className="seq">
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Sur quelle entreprise l'aperçu se calcule.
 *
 * Volontairement une vraie entreprise et pas des valeurs inventées : c'est le
 * seul moyen de voir qu'un lien de site démo manque, ou qu'un rapport d'audit
 * n'a pas encore de jeton — deux trous qui, sinon, se découvrent à l'envoi.
 */
function ApercuPicker({ onPick }: { onPick: (entrepriseId: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--text-4)',
        }}
      >
        Aperçu sur
      </span>
      <input
        className="input mono"
        style={{ width: 130, height: 26, fontSize: 11.5 }}
        placeholder="n° entreprise"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onPick(value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onPick(value.trim())
        }}
      />
    </label>
  )
}
