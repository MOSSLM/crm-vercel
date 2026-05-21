// workflow-graph.ts — helpers purs sur l'arbre d'un workflow (nodes + layout).
import type { WorkflowDefinition, WorkflowNode, NodeCat } from './types'
import { catalogItem } from './node-catalog'

export type Slot = 'next' | 'yes' | 'no'

export function emptyWorkflow(): WorkflowDefinition {
  return { nodes: [], layout: { root: null, children: {} } }
}

export function isCondType(type: string): boolean {
  return type.startsWith('cnd.')
}

export function asWorkflow(def: unknown): WorkflowDefinition {
  const d = def as Partial<WorkflowDefinition> | null
  if (d && Array.isArray(d.nodes) && d.layout) return d as WorkflowDefinition
  return emptyWorkflow()
}

export function findNode(def: WorkflowDefinition, id: string): WorkflowNode | undefined {
  return def.nodes.find((n) => n.id === id)
}

function genId(def: WorkflowDefinition): string {
  let i = def.nodes.length + 1
  while (def.nodes.some((n) => n.id === `n${i}`)) i++
  return `n${i}`
}

export function getSlotChild(def: WorkflowDefinition, id: string, slot: Slot): string | null {
  const entry = def.layout.children[id]
  if (!entry) return null
  if (Array.isArray(entry)) return slot === 'next' ? (entry[0] ?? null) : null
  return slot === 'yes' ? (entry.yes[0] ?? null) : slot === 'no' ? (entry.no[0] ?? null) : null
}

function setSlotChild(def: WorkflowDefinition, id: string, slot: Slot, childId: string | null) {
  const entry = def.layout.children[id]
  const node = findNode(def, id)
  if (!entry) {
    def.layout.children[id] = node && isCondType(node.type) ? { yes: [], no: [] } : []
  }
  const e = def.layout.children[id]
  if (Array.isArray(e)) {
    def.layout.children[id] = childId ? [childId] : []
  } else {
    if (slot === 'yes') e.yes = childId ? [childId] : []
    else if (slot === 'no') e.no = childId ? [childId] : []
  }
}

export function parentOf(def: WorkflowDefinition, id: string): { id: string; slot: Slot } | null {
  for (const [pid, entry] of Object.entries(def.layout.children)) {
    if (Array.isArray(entry)) {
      if (entry[0] === id) return { id: pid, slot: 'next' }
    } else {
      if (entry.yes[0] === id) return { id: pid, slot: 'yes' }
      if (entry.no[0] === id) return { id: pid, slot: 'no' }
    }
  }
  return null
}

function clone(def: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition
}

/** Ajoute un node ; `at.parentId` null = racine. Renvoie {def, newId}. */
export function withNodeAdded(
  def: WorkflowDefinition,
  typeId: string,
  at: { parentId: string | null; slot: Slot },
): { def: WorkflowDefinition; newId: string } {
  const item = catalogItem(typeId)
  const next = clone(def)
  const newId = genId(next)
  const node: WorkflowNode = {
    id: newId,
    type: typeId,
    cat: (item?.cat ?? 'action') as NodeCat,
    title: item?.name ?? typeId,
    config: {},
  }
  next.nodes.push(node)
  next.layout.children[newId] = isCondType(typeId) ? { yes: [], no: [] } : []

  if (at.parentId == null) {
    const oldRoot = next.layout.root
    next.layout.root = newId
    if (oldRoot && !isCondType(typeId)) next.layout.children[newId] = [oldRoot]
  } else {
    const oldChild = getSlotChild(next, at.parentId, at.slot)
    setSlotChild(next, at.parentId, at.slot, newId)
    if (oldChild && !isCondType(typeId)) next.layout.children[newId] = [oldChild]
  }
  return { def: next, newId }
}

/** Supprime un node et relie son parent à son successeur (slot 'next'/'yes'). */
export function withNodeRemoved(def: WorkflowDefinition, id: string): WorkflowDefinition {
  const next = clone(def)
  const node = findNode(next, id)
  const succ = node && isCondType(node.type) ? getSlotChild(next, id, 'yes') : getSlotChild(next, id, 'next')
  const parent = parentOf(next, id)
  if (parent) {
    setSlotChild(next, parent.id, parent.slot, succ)
  } else if (next.layout.root === id) {
    next.layout.root = succ
  }
  next.nodes = next.nodes.filter((n) => n.id !== id)
  delete next.layout.children[id]
  return next
}

export function withNodeUpdated(
  def: WorkflowDefinition,
  id: string,
  patch: Partial<Pick<WorkflowNode, 'title' | 'config'>>,
): WorkflowDefinition {
  const next = clone(def)
  next.nodes = next.nodes.map((n) =>
    n.id === id
      ? { ...n, ...(patch.title != null ? { title: patch.title } : {}), config: { ...n.config, ...(patch.config ?? {}) } }
      : n,
  )
  return next
}
