'use client'
// WorkflowBuilder — éditeur visuel 3 colonnes (bibliothèque / canvas / inspecteur).
// Porté depuis claude design/automations-workflows.jsx.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XI } from './icons'
import { Section, Field, ToggleRow, SegFull, OpSelect, SearchInput } from './atoms'
import { SupaSelect, FieldSelect } from './SupaSelect'
import { useRefData } from './ref-data'
import { NODE_CATALOG, catalogItem, CAT_LABEL } from './node-catalog'
import { getAutomation, updateAutomation } from './automations-db'
import {
  asWorkflow,
  findNode,
  getSlotChild,
  isCondType,
  withNodeAdded,
  withNodeRemoved,
  withNodeUpdated,
  type Slot,
} from './workflow-graph'
import type { Automation, WorkflowDefinition, WorkflowNode } from './types'

type AddTarget = { parentId: string | null; slot: Slot }

export function WorkflowBuilder({ id }: { id: string }) {
  const router = useRouter()
  const [auto, setAuto] = useState<Automation | null>(null)
  const [def, setDef] = useState<WorkflowDefinition>({ nodes: [], layout: { root: null, children: {} } })
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Automation['status']>('draft')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(95)
  const [picker, setPicker] = useState<AddTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const dirty = useRef(false)

  useEffect(() => {
    getAutomation(id)
      .then((a) => {
        if (!a) {
          toast.error('Automatisation introuvable')
          router.push('/automations')
          return
        }
        setAuto(a)
        setName(a.name)
        setStatus(a.status)
        setDef(asWorkflow(a.definition))
        setSelectedId(asWorkflow(a.definition).layout.root)
      })
      .catch(() => toast.error('Chargement impossible'))
      .finally(() => setLoading(false))
  }, [id, router])

  // Autosave (debounce)
  useEffect(() => {
    if (!auto || !dirty.current) return
    const t = setTimeout(() => {
      const root = def.layout.root ? findNode(def, def.layout.root) : null
      const trigger = root && root.cat === 'trigger' ? root : null
      updateAutomation(id, {
        name,
        status,
        definition: def,
        trigger_type: trigger?.type ?? null,
        trigger_pipeline_id: (trigger?.config.pipeline as string) ?? null,
        trigger_stage_id: (trigger?.config.stage_to as number) ?? null,
      })
        .then(() => {
          dirty.current = false
        })
        .catch(() => toast.error('Sauvegarde échouée'))
    }, 700)
    return () => clearTimeout(t)
  }, [def, name, status, auto, id])

  const mutate = useCallback((next: WorkflowDefinition) => {
    dirty.current = true
    setDef(next)
  }, [])

  const selectedNode = selectedId ? findNode(def, selectedId) : undefined

  const handleAdd = useCallback(
    (typeId: string, at: AddTarget) => {
      const { def: next, newId } = withNodeAdded(def, typeId, at)
      mutate(next)
      setSelectedId(newId)
      setPicker(null)
    },
    [def, mutate],
  )

  const handleDelete = useCallback(
    (nodeId: string) => {
      mutate(withNodeRemoved(def, nodeId))
      if (selectedId === nodeId) setSelectedId(null)
    },
    [def, mutate, selectedId],
  )

  const handleUpdate = useCallback(
    (nodeId: string, patch: Partial<Pick<WorkflowNode, 'title' | 'config'>>) => {
      mutate(withNodeUpdated(def, nodeId, patch))
    },
    [def, mutate],
  )

  function toggleStatus() {
    if (status !== 'on') {
      const root = def.layout.root ? findNode(def, def.layout.root) : null
      if (!root || root.cat !== 'trigger') {
        toast.error('Ajoutez un déclencheur avant d’activer')
        return
      }
      setStatus('on')
      dirty.current = true
      toast.success('Workflow activé')
    } else {
      setStatus('paused')
      dirty.current = true
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

  return (
    <>
      {/* LEFT — bibliothèque */}
      <div className="pane" style={{ minWidth: 240 }}>
        <div className="pane-hd">
          <span>Bibliothèque</span>
          <div className="actions">
            <button className="btn ghost sm icon" type="button" onClick={() => router.push('/automations')} title="Retour">
              <XI name="chevleft" className="ico-sm" />
            </button>
          </div>
        </div>
        <div className="pane-body">
          <NodeLibrary onPick={(typeId) => handleAdd(typeId, { parentId: lastChainEnd(def), slot: 'next' })} />
        </div>
      </div>

      {/* CENTER — canvas */}
      <div className="pane" style={{ background: 'transparent' }}>
        <div className="pane-hd">
          <div className="title-row">
            <button className="btn ghost sm icon" type="button" onClick={() => router.push('/automations')} title="Retour">
              <XI name="chevleft" className="ico-sm" />
            </button>
            <XI name="bolt" className="ico-sm" style={{ color: 'var(--trigger)' }} />
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                dirty.current = true
              }}
              style={{
                border: 0,
                background: 'transparent',
                font: 'inherit',
                fontWeight: 600,
                fontSize: 12.5,
                color: 'var(--text)',
                outline: 'none',
                minWidth: 0,
                width: Math.max(120, name.length * 7),
              }}
            />
            <span className="pill" style={{ marginLeft: 4 }}>Workflow</span>
          </div>
          <div className="actions">
            {status === 'on' ? (
              <button className="btn outline xs" type="button" onClick={toggleStatus}>
                <XI name="pause" className="ico-xs" />
                Mettre en pause
              </button>
            ) : (
              <button className="btn ok xs" type="button" onClick={toggleStatus}>
                <XI name="power" className="ico-xs" />
                Activer
              </button>
            )}
          </div>
        </div>
        <div className="canvas-host" onClick={() => setSelectedId(null)}>
          <div className="canvas-dotgrid" />
          <div
            className="canvas-stage"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: '50% 0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flow-track">
              {def.layout.root ? (
                <NodeTree
                  def={def}
                  id={def.layout.root}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={setPicker}
                  onDelete={handleDelete}
                />
              ) : (
                <button
                  type="button"
                  className="add-step-pill"
                  onClick={() => setPicker({ parentId: null, slot: 'next' })}
                >
                  <XI name="plus" className="ico-sm" />
                  Ajouter un déclencheur
                </button>
              )}
            </div>
          </div>

          <div className="canvas-tools" onClick={(e) => e.stopPropagation()}>
            <div className="grp">
              <button type="button" onClick={() => setZoom(Math.max(50, zoom - 5))}>
                <XI name="chevdown" className="ico-sm" />
              </button>
              <button type="button" className="zoom-val" onClick={() => setZoom(100)}>
                {zoom}%
              </button>
              <button type="button" onClick={() => setZoom(Math.min(150, zoom + 5))}>
                <XI name="chevup" className="ico-sm" />
              </button>
            </div>
          </div>
          <div className="canvas-help">{def.nodes.length} bloc(s)</div>
        </div>
      </div>

      {/* RIGHT — inspecteur */}
      <div className="pane">
        <NodeInspector node={selectedNode} onUpdate={(patch) => selectedId && handleUpdate(selectedId, patch)} />
      </div>

      {picker && (
        <NodePickerModal
          rootEmpty={def.layout.root == null}
          onClose={() => setPicker(null)}
          onPick={(typeId) => handleAdd(typeId, picker)}
        />
      )}
    </>
  )
}

/** Dernier node d'une chaîne linéaire depuis la racine (pour « ajouter à la fin »). */
function lastChainEnd(def: WorkflowDefinition): string | null {
  let id = def.layout.root
  if (!id) return null
  let guard = 0
  while (guard++ < 100) {
    const node = findNode(def, id)
    if (!node || isCondType(node.type)) return id
    const nx = getSlotChild(def, id, 'next')
    if (!nx) return id
    id = nx
  }
  return id
}

// ── Bibliothèque de blocs (gauche) ─────────────────────────────────────────
function NodeLibrary({ onPick }: { onPick: (typeId: string) => void }) {
  const [q, setQ] = useState('')
  return (
    <>
      <div style={{ padding: '10px 12px' }}>
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un bloc…" />
      </div>
      {NODE_CATALOG.map((sec) => {
        const items = sec.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
        if (items.length === 0) return null
        return (
          <Section key={sec.section} label={sec.section} count={items.length}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    textAlign: 'left',
                    font: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 5,
                      background: `var(--${sec.cat}-tint)`,
                      color: `var(--${sec.cat})`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <XI name={item.icon} className="ico-sm" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                    {item.name}
                  </span>
                  <XI name="plus" className="ico-sm" style={{ color: 'var(--text-4)' }} />
                </button>
              ))}
            </div>
          </Section>
        )
      })}
    </>
  )
}

// ── Arbre de nodes (récursif) ──────────────────────────────────────────────
function NodeTree({
  def,
  id,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: {
  def: WorkflowDefinition
  id: string
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (t: AddTarget) => void
  onDelete: (id: string) => void
}) {
  const node = findNode(def, id)
  if (!node) return null
  const cond = isCondType(node.type)
  const props = { def, selectedId, onSelect, onAdd, onDelete }

  if (cond) {
    return (
      <>
        <FlowNode node={node} selected={selectedId === id} onSelect={() => onSelect(id)} onDelete={() => onDelete(id)} />
        <FlowConn />
        <div className="flow-branch">
          <BranchCol label="yes" parentId={id} {...props} />
          <BranchCol label="no" parentId={id} {...props} />
        </div>
      </>
    )
  }

  const next = getSlotChild(def, id, 'next')
  return (
    <>
      <FlowNode node={node} selected={selectedId === id} onSelect={() => onSelect(id)} onDelete={() => onDelete(id)} />
      <FlowConn onAdd={() => onAdd({ parentId: id, slot: 'next' })} />
      {next ? <NodeTree id={next} {...props} /> : <FlowEnd />}
    </>
  )
}

function BranchCol({
  label,
  parentId,
  def,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: {
  label: 'yes' | 'no'
  parentId: string
  def: WorkflowDefinition
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (t: AddTarget) => void
  onDelete: (id: string) => void
}) {
  const child = getSlotChild(def, parentId, label)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span className={`flow-branch-lbl ${label}`}>{label === 'yes' ? '✓ OUI' : '✕ NON'}</span>
      <FlowConn onAdd={() => onAdd({ parentId, slot: label })} />
      {child ? (
        <NodeTree
          def={def}
          id={child}
          selectedId={selectedId}
          onSelect={onSelect}
          onAdd={onAdd}
          onDelete={onDelete}
        />
      ) : (
        <FlowEnd />
      )}
    </div>
  )
}

function FlowEnd() {
  return (
    <div className="flow-end">
      <XI name="flag" className="ico-sm" />
      Fin
    </div>
  )
}

function FlowConn({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flow-conn">
      {onAdd && (
        <button className="add" type="button" onClick={onAdd} title="Insérer un bloc">
          <XI name="plus" className="ico-xs" />
        </button>
      )}
    </div>
  )
}

// ── Node du canvas ─────────────────────────────────────────────────────────
function FlowNode({
  node,
  selected,
  onSelect,
  onDelete,
}: {
  node: WorkflowNode
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const meta = useNodeMeta(node)
  return (
    <div
      className="flow-node"
      data-cat={node.cat}
      data-selected={selected}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <div className="node-hd">
        <span className="ic-wrap">
          <XI name={meta.icon} className="ico" />
        </span>
        <div className="name" style={{ minWidth: 0 }}>
          <div>{node.title}</div>
          <div className="sublabel">{meta.subtitle}</div>
        </div>
        <span className="badge-cat">{CAT_LABEL[node.cat]}</span>
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
      {meta.bodyRows.length > 0 && (
        <div className="node-body">
          {meta.bodyRows.map((row, i) => (
            <div className="node-row" key={i}>
              <span className="lhs">
                <span className="lbl">{row.lbl}</span>
                <span className="val">{row.val}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface NodeMeta {
  icon: string
  subtitle: string
  bodyRows: { lbl: string; val: string }[]
}

function useNodeMeta(node: WorkflowNode): NodeMeta {
  const ref = useRefData()
  return useMemo(() => {
    const item = catalogItem(node.type)
    const cfg = node.config
    const meta: NodeMeta = { icon: item?.icon ?? 'bolt', subtitle: item?.desc ?? '', bodyRows: [] }
    const pipeName = (pid: unknown) => ref.pipelines.find((p) => p.id === pid)?.name ?? '—'
    const stageName = (sid: unknown) => ref.stages.find((s) => s.id === sid)?.name ?? '—'
    if (node.type === 'trg.stage_changed') {
      meta.bodyRows = [
        { lbl: 'Pipeline', val: pipeName(cfg.pipeline) },
        { lbl: 'Stage cible', val: stageName(cfg.stage_to) },
      ]
    } else if (node.type === 'cnd.if_field') {
      meta.bodyRows = [
        { lbl: 'Champ', val: String(cfg.field ?? '—') },
        { lbl: 'Valeur', val: cfg.value != null ? String(cfg.value) : '—' },
      ]
    } else if (node.type === 'act.send_email') {
      meta.bodyRows = [{ lbl: 'Template', val: ref.email_templates.find((t) => t.id === cfg.template)?.name ?? '—' }]
    } else if (node.type === 'act.assign_owner') {
      meta.bodyRows = [{ lbl: 'Utilisateur', val: ref.users.find((u) => u.id === cfg.user)?.name ?? '—' }]
    } else if (node.type === 'act.move_stage') {
      meta.bodyRows = [{ lbl: 'Stage', val: stageName(cfg.stage) }]
    }
    return meta
  }, [node, ref])
}

// ── Inspecteur (droite) ────────────────────────────────────────────────────
function NodeInspector({
  node,
  onUpdate,
}: {
  node: WorkflowNode | undefined
  onUpdate: (patch: Partial<Pick<WorkflowNode, 'title' | 'config'>>) => void
}) {
  if (!node) {
    return (
      <div className="pane-body" style={{ padding: 24, color: 'var(--text-3)', textAlign: 'center' }}>
        <XI name="cursor" className="ico-xl" style={{ color: 'var(--text-4)', margin: '40px auto 14px' }} />
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Aucun bloc sélectionné</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          Cliquez sur un bloc dans le canvas pour modifier ses paramètres.
        </div>
      </div>
    )
  }
  const item = catalogItem(node.type)
  return (
    <div className="inspector">
      <div className="inspector-hd">
        <div className="top">
          <span className="ic-wrap" style={{ background: `var(--${node.cat}-tint)`, color: `var(--${node.cat})` }}>
            <XI name={item?.icon ?? 'bolt'} className="ico" />
          </span>
          <h3>{node.title}</h3>
          <span className="pill" style={{ background: `var(--${node.cat}-tint)`, color: `var(--${node.cat})` }}>
            {CAT_LABEL[node.cat]}
          </span>
        </div>
        <div className="desc">{item?.desc}</div>
      </div>
      <div className="inspector-body">
        <NodeInspectorBody node={node} onUpdate={onUpdate} />
        <Section label="Avancé" defaultOpen={false}>
          <Field label="Étiquette du bloc">
            <input
              className="input"
              value={node.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
          </Field>
          <Field label="ID interne">
            <input className="input mono" defaultValue={node.id} disabled />
          </Field>
        </Section>
      </div>
    </div>
  )
}

function NodeInspectorBody({
  node,
  onUpdate,
}: {
  node: WorkflowNode
  onUpdate: (patch: Partial<Pick<WorkflowNode, 'title' | 'config'>>) => void
}) {
  const cfg = node.config
  const set = (k: string, v: unknown) => onUpdate({ config: { [k]: v } })
  const str = (k: string) => (cfg[k] as string) ?? ''

  switch (node.type) {
    case 'trg.stage_changed':
      return (
        <Section label="Source des données">
          <Field label="Pipeline" required>
            <SupaSelect table="pipelines" icon="pipeline" value={cfg.pipeline as string} onChange={(v) => onUpdate({ config: { pipeline: v, stage_to: null } })} />
          </Field>
          <Field label="Stage cible" required hint={cfg.pipeline ? undefined : 'choisir un pipeline'}>
            <SupaSelect
              table="stages"
              icon="kanban"
              disabled={!cfg.pipeline}
              filterFK={cfg.pipeline ? { pipeline_id: cfg.pipeline as string } : null}
              value={cfg.stage_to as number}
              onChange={(v) => set('stage_to', v)}
            />
          </Field>
          <ToggleRow label="Re-déclencher si re-passage" checked={!!cfg.repeat} onChange={(v) => set('repeat', v)} />
        </Section>
      )
    case 'trg.opportunity_created':
      return (
        <Section label="Source">
          <Field label="Pipeline" required>
            <SupaSelect table="pipelines" icon="pipeline" value={cfg.pipeline as string} onChange={(v) => set('pipeline', v)} />
          </Field>
        </Section>
      )
    case 'trg.tag_added':
      return (
        <Section label="Déclencheur">
          <Field label="Tag" required>
            <SupaSelect table="tags" icon="tag" value={cfg.tag as string} onChange={(v) => set('tag', v)} />
          </Field>
        </Section>
      )
    case 'trg.contact_created':
      return (
        <Section label="Déclencheur">
          <Field label="Source (filtre optionnel)">
            <input className="input" value={str('source')} onChange={(e) => set('source', e.target.value)} placeholder="ex: formulaire, import…" />
          </Field>
        </Section>
      )
    case 'trg.form_submitted':
      return (
        <Section label="Déclencheur">
          <Field label="Formulaire" required>
            <SupaSelect table="forms" icon="form" value={cfg.form as string} onChange={(v) => set('form', v)} />
          </Field>
        </Section>
      )
    case 'trg.schedule':
      return (
        <Section label="Planning">
          <Field label="Fréquence">
            <select className="select" value={str('frequency') || 'daily'} onChange={(e) => set('frequency', e.target.value)}>
              <option value="hourly">Toutes les heures</option>
              <option value="daily">Tous les jours</option>
              <option value="weekly">Toutes les semaines</option>
            </select>
          </Field>
          <Field label="Heure" hint="HH:MM">
            <input className="input mono" value={str('at') || '09:00'} onChange={(e) => set('at', e.target.value)} />
          </Field>
        </Section>
      )
    case 'trg.no_activity':
      return (
        <Section label="Inactivité">
          <Field label="Jours sans activité" required>
            <input className="input mono" type="number" value={str('days') || '14'} onChange={(e) => set('days', e.target.value)} />
          </Field>
        </Section>
      )
    case 'cnd.if_field':
      return (
        <Section label="Condition">
          <Field label="Champ" required>
            <FieldSelect entity="opportunities" value={str('field')} onChange={(v) => set('field', v)} />
          </Field>
          <Field label="Opérateur">
            <OpSelect value={str('op')} onChange={(v) => set('op', v)} />
          </Field>
          <Field label="Valeur">
            <input className="input mono" value={str('value')} onChange={(e) => set('value', e.target.value)} />
          </Field>
        </Section>
      )
    case 'cnd.if_tag':
      return (
        <Section label="Condition">
          <Field label="Tag" required>
            <SupaSelect table="tags" icon="tag" value={cfg.tag as string} onChange={(v) => set('tag', v)} />
          </Field>
        </Section>
      )
    case 'act.send_email':
      return (
        <Section label="Email">
          <Field label="Template" required>
            <SupaSelect table="email_templates" icon="template" value={cfg.template as string} onChange={(v) => set('template', v)} />
          </Field>
          <ToggleRow label="Tracker les ouvertures" checked={cfg.trackOpens !== false} onChange={(v) => set('trackOpens', v)} accent />
          <ToggleRow label="Tracker les clics" checked={cfg.trackClicks !== false} onChange={(v) => set('trackClicks', v)} accent />
        </Section>
      )
    case 'act.move_stage':
      return (
        <Section label="Déplacement">
          <Field label="Pipeline" required>
            <SupaSelect table="pipelines" icon="pipeline" value={cfg.pipeline as string} onChange={(v) => onUpdate({ config: { pipeline: v, stage: null } })} />
          </Field>
          <Field label="Stage cible" required>
            <SupaSelect
              table="stages"
              icon="kanban"
              disabled={!cfg.pipeline}
              filterFK={cfg.pipeline ? { pipeline_id: cfg.pipeline as string } : null}
              value={cfg.stage as number}
              onChange={(v) => set('stage', v)}
            />
          </Field>
        </Section>
      )
    case 'act.add_tag':
      return (
        <Section label="Tag">
          <Field label="Tag à appliquer" required>
            <SupaSelect table="tags" icon="tag" value={cfg.tag as string} onChange={(v) => set('tag', v)} />
          </Field>
        </Section>
      )
    case 'act.assign_owner':
      return (
        <Section label="Attribution">
          <Field label="Mode">
            <SegFull
              value={str('mode') || 'fixed'}
              onChange={(v) => set('mode', v)}
              options={[
                { value: 'fixed', label: 'Fixe' },
                { value: 'rr', label: 'Round-robin' },
              ]}
            />
          </Field>
          {(str('mode') || 'fixed') === 'fixed' && (
            <Field label="Utilisateur" required>
              <SupaSelect table="users" icon="user" value={cfg.user as string} onChange={(v) => set('user', v)} />
            </Field>
          )}
        </Section>
      )
    case 'act.create_task':
      return (
        <Section label="Tâche">
          <Field label="Titre">
            <input className="input" value={str('title')} onChange={(e) => set('title', e.target.value)} placeholder="Préparer le devis…" />
          </Field>
          <Field label="Type" required>
            <SupaSelect table="task_types" icon="task" value={cfg.task_type as string} onChange={(v) => set('task_type', v)} />
          </Field>
          <Field label="Assignée à" required>
            <SupaSelect table="users" icon="user" value={cfg.assignee as string} onChange={(v) => set('assignee', v)} />
          </Field>
          <Field label="Échéance (jours)">
            <input className="input mono" type="number" value={str('due_days') || '2'} onChange={(e) => set('due_days', e.target.value)} />
          </Field>
        </Section>
      )
    case 'act.notify':
      return (
        <Section label="Notification">
          <Field label="Canal">
            <input className="input mono" value={str('channel')} onChange={(e) => set('channel', e.target.value)} placeholder="#ventes" />
          </Field>
          <Field label="Message">
            <textarea className="textarea" rows={3} value={str('message')} onChange={(e) => set('message', e.target.value)} />
          </Field>
        </Section>
      )
    case 'act.webhook':
      return (
        <Section label="Webhook HTTP">
          <Field label="URL" required>
            <input className="input mono" value={str('url')} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Méthode">
            <select className="select" value={str('method') || 'POST'} onChange={(e) => set('method', e.target.value)}>
              <option>POST</option>
              <option>PUT</option>
              <option>PATCH</option>
            </select>
          </Field>
        </Section>
      )
    case 'act.ai_score':
      return (
        <Section label="Score IA — Claude">
          <Field label="Modèle">
            <select className="select" value={str('model') || 'claude-haiku-4-5-20251001'} onChange={(e) => set('model', e.target.value)}>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
            </select>
          </Field>
          <Field label="Instruction">
            <textarea className="textarea" rows={3} value={str('prompt')} onChange={(e) => set('prompt', e.target.value)} placeholder="Évalue ce lead de 0 à 100…" />
          </Field>
        </Section>
      )
    case 'act.task_call':
      return (
        <Section label="Tâche d'appel">
          <Field label="Script d'appel" required>
            <SupaSelect table="call_scripts" icon="phone" value={cfg.script as string} onChange={(v) => set('script', v)} />
          </Field>
        </Section>
      )
    case 'act.task_whatsapp':
      return (
        <Section label="Tâche WhatsApp">
          <Field label="Template" required>
            <SupaSelect table="whatsapp_templates" icon="whatsapp" value={cfg.template as string} onChange={(v) => set('template', v)} />
          </Field>
        </Section>
      )
    case 'act.task_linkedin':
      return (
        <Section label="Tâche LinkedIn">
          <Field label="Action">
            <SegFull
              value={str('action') || 'connect'}
              onChange={(v) => set('action', v)}
              options={[
                { value: 'connect', label: 'Connexion' },
                { value: 'inmail', label: 'InMail' },
              ]}
            />
          </Field>
          <Field label="Message">
            <textarea className="textarea" rows={4} value={str('message')} onChange={(e) => set('message', e.target.value)} />
          </Field>
        </Section>
      )
    case 'flow.wait':
      return (
        <Section label="Délai">
          <Field label="Durée">
            <div className="field-row">
              <input className="input mono" type="number" value={str('amount') || '1'} onChange={(e) => set('amount', e.target.value)} style={{ flex: 1 }} />
              <select className="select" value={str('unit') || 'd'} onChange={(e) => set('unit', e.target.value)} style={{ flex: 1.3 }}>
                <option value="m">minutes</option>
                <option value="h">heures</option>
                <option value="d">jours</option>
              </select>
            </div>
          </Field>
        </Section>
      )
    case 'flow.exit':
      return (
        <Section label="Fin">
          <div className="empty-row">Ce bloc termine le workflow.</div>
        </Section>
      )
    default:
      return (
        <Section label="Paramètres">
          <div className="empty-row">Aucun paramètre pour ce bloc.</div>
        </Section>
      )
  }
}

// ── Modale d'ajout de bloc ─────────────────────────────────────────────────
function NodePickerModal({
  rootEmpty,
  onClose,
  onPick,
}: {
  rootEmpty: boolean
  onClose: () => void
  onPick: (typeId: string) => void
}) {
  const [q, setQ] = useState('')
  return createPortal(
    <div className="au-skin">
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-hd">
            <div className="grow">
              <div className="title">Ajouter un bloc</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {rootEmpty
                  ? 'Choisissez un déclencheur pour démarrer le workflow.'
                  : 'Déclencheurs, conditions, actions et étapes manuelles.'}
              </div>
            </div>
            <button className="btn ghost sm icon" type="button" onClick={onClose}>
              <XI name="x" className="ico-sm" />
            </button>
          </div>
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
            <SearchInput value={q} onChange={setQ} placeholder="Rechercher un bloc…" />
          </div>
          <div className="modal-body">
            {NODE_CATALOG.map((sec) => {
              const items = sec.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))
              if (items.length === 0) return null
              return (
                <div key={sec.section}>
                  <div className="picker-section-label">{sec.section}</div>
                  <div className="picker-grid">
                    {items.map((it) => (
                      <div key={it.id} className={`picker-card ${sec.cat}`} onClick={() => onPick(it.id)}>
                        <div className="top">
                          <span className="ic">
                            <XI name={it.icon} className="ico" />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="name">{it.name}</div>
                          </div>
                        </div>
                        <div className="desc">{it.desc || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
