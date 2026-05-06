'use client'
import React, { memo } from 'react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'
import type { AutomationNodeData } from './types'
import { NODE_DEFINITIONS } from './constants'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'

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

const CATEGORY_BADGE: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Action',
  supabase: 'Supabase',
  ai: 'IA',
}

function AutomationNode({ data, selected }: NodeProps<AutomationNodeData>) {
  const def = NODE_DEFINITIONS[data.nodeType]
  if (!def) return null
  const Icon = ICON_MAP[def.iconName] ?? AlertCircle
  const isTrigger = data.category === 'trigger'
  const isCondition = data.nodeType === 'action_condition'

  return (
    <div
      className={cn(
        'relative w-[220px] rounded-xl border-2 shadow-lg transition-all duration-150',
        def.bgClass,
        def.borderClass,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]'
      )}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground/60"
        />
      )}

      <div className="flex items-start gap-3 p-3">
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
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{data.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {data.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/40 px-3 py-1.5">
        <Badge
          variant="outline"
          className={cn('px-1.5 py-0 text-[10px]', def.colorClass, def.borderClass)}
        >
          {CATEGORY_BADGE[data.category]}
        </Badge>
        <div className="flex items-center gap-1.5">
          {data.hasError && <AlertCircle className="h-3 w-3 text-destructive" />}
          {data.completed && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="a"
        className="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground/60"
      />
      {isCondition && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="b"
          style={{ left: '70%' }}
          className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
        />
      )}
    </div>
  )
}

export default memo(AutomationNode)
