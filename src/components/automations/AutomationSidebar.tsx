'use client'
import React, { useState } from 'react'
import { NODE_DEFINITIONS, CATEGORY_LABELS, CATEGORY_ORDER } from './constants'
import type { ConfigField, NodeDefinition } from './constants'
import type { AutomationFlowNode, AutomationNodeType, NodeCategory } from './types'
import { useAutomation } from './AutomationProvider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  UserPlus,
  Briefcase,
  GitBranch,
  Clock,
  Mail,
  Send,
  UserCog,
  CheckSquare,
  FolderKanban,
  MessageSquare,
  Globe,
  GitFork,
  Timer,
  Zap,
  Database,
  BrainCircuit,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  UserPlus,
  Briefcase,
  GitBranch,
  Webhook: Globe,
  Clock,
  Mail,
  Send,
  UserCog,
  CheckSquare,
  FolderKanban,
  MessageSquare,
  Globe,
  GitFork,
  Timer,
  Zap,
  Database,
  BrainCircuit,
  Sparkles,
  AlertCircle,
}

function NodePalette() {
  const [open, setOpen] = useState<Set<NodeCategory>>(new Set(['trigger', 'action']))

  const toggle = (cat: NodeCategory) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const grouped = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = Object.entries(NODE_DEFINITIONS)
        .filter(([, def]) => def.category === cat)
        .map(([key, def]) => ({ key: key as AutomationNodeType, def }))
      return acc
    },
    {} as Record<NodeCategory, { key: AutomationNodeType; def: NodeDefinition }[]>
  )

  return (
    <div className="flex flex-col gap-0.5 p-3">
      <p className="mb-3 text-xs text-muted-foreground">
        Glissez un bloc sur le canvas pour l&apos;ajouter
      </p>
      {CATEGORY_ORDER.map((cat) => {
        const isOpen = open.has(cat)
        const nodes = grouped[cat]
        return (
          <div key={cat} className="mb-1">
            <button
              onClick={() => toggle(cat)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {isOpen ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat]}
              </span>
              <Badge variant="outline" className="ml-auto px-1 text-[10px]">
                {nodes.length}
              </Badge>
            </button>
            {isOpen && (
              <div className="mt-1 flex flex-col gap-1 pl-2">
                {nodes.map(({ key, def }) => {
                  const Icon = ICON_MAP[def.iconName] ?? AlertCircle
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/automation-node', key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      className={cn(
                        'flex cursor-grab items-center gap-2.5 rounded-lg border p-2 transition-all hover:shadow-sm active:cursor-grabbing active:scale-95',
                        def.bgClass,
                        def.borderClass
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                          def.bgClass,
                          def.borderClass
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5', def.colorClass)} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{def.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {def.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ConfigField
  value: string
  onChange: (v: string) => void
}) {
  if (field.type === 'select' && field.options) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={field.placeholder ?? 'Sélectionner...'} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (field.type === 'textarea' || field.type === 'code') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={cn(
          'w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          field.type === 'code' && 'font-mono'
        )}
      />
    )
  }
  return (
    <Input
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className="h-8 text-xs"
    />
  )
}

function NodeConfig({ node }: { node: AutomationFlowNode }) {
  const { state, dispatch } = useAutomation()
  const def = NODE_DEFINITIONS[node.data.nodeType]
  if (!def) return null

  const Icon = ICON_MAP[def.iconName] ?? AlertCircle
  const config = node.data.config

  const handleChange = (key: string, value: string) =>
    dispatch({ type: 'UPDATE_NODE_CONFIG', payload: { nodeId: node.id, config: { [key]: value } } })

  const handleDelete = () => {
    const nodes = state.automation?.nodes.filter((n) => n.id !== node.id) ?? []
    dispatch({ type: 'SET_NODES', payload: nodes })
    dispatch({ type: 'SELECT_NODE', payload: null })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border p-3',
          def.bgClass,
          def.borderClass
        )}
      >
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            def.bgClass,
            def.borderClass
          )}
        >
          <Icon className={cn('h-4 w-4', def.colorClass)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{def.label}</p>
          <p className="text-xs text-muted-foreground">{def.description}</p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        ID:{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
          {node.id.slice(0, 8)}
        </code>
      </div>

      {def.configFields.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-3.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Configuration
            </p>
            {def.configFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label className="text-xs">{field.label}</Label>
                <FieldRenderer
                  field={field}
                  value={config[field.key] ?? ''}
                  onChange={(v) => handleChange(field.key, v)}
                />
                {field.description && (
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    {field.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {node.data.nodeType === 'supabase_edge_function' && (
        <>
          <Separator />
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="mb-1 text-xs font-semibold text-green-400">Supabase Edge Function</p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Cette action appellera votre Edge Function déployée sur Supabase via l’API REST.
              Assurez-vous que la fonction est déployée et que{' '}
              <code className="font-mono">SUPABASE_URL</code> et{' '}
              <code className="font-mono">SUPABASE_SERVICE_KEY</code> sont configurés.
            </p>
          </div>
        </>
      )}

      <Separator />
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Supprimer ce bloc
      </Button>
    </div>
  )
}

export default function AutomationSidebar() {
  const { state } = useAutomation()
  const selectedNode = state.automation?.nodes.find((n) => n.id === state.selectedNodeId)

  return (
    <aside className="flex h-full flex-col border-l bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <span className="text-sm font-semibold">
          {selectedNode ? 'Configuration' : 'Blocs'}
        </span>
        {selectedNode && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {selectedNode.data.label}
          </Badge>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {selectedNode ? <NodeConfig node={selectedNode} /> : <NodePalette />}
      </div>
    </aside>
  )
}
