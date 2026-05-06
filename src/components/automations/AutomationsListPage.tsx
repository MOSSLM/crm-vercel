'use client'
import React, { useEffect, useState } from 'react'
import type { Automation } from './types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Zap,
  Play,
  Pause,
  MoreHorizontal,
  Trash2,
  Edit,
  Clock,
  Activity,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function makeBlank(name: string): Automation {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    isActive: false,
    nodes: [],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    runCount: 0,
  }
}

function loadAll(): Automation[] {
  try {
    const obj = JSON.parse(localStorage.getItem('crm_automations') ?? '{}')
    return Object.values(obj as Record<string, Automation>).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  } catch {
    return []
  }
}

function save(auto: Automation) {
  const stored = JSON.parse(localStorage.getItem('crm_automations') ?? '{}')
  stored[auto.id] = auto
  localStorage.setItem('crm_automations', JSON.stringify(stored))
}

function remove(id: string) {
  const stored = JSON.parse(localStorage.getItem('crm_automations') ?? '{}')
  delete stored[id]
  localStorage.setItem('crm_automations', JSON.stringify(stored))
}

function AutomationCard({
  automation,
  onDelete,
  onToggle,
}: {
  automation: Automation
  onDelete: (id: string) => void
  onToggle: (id: string) => void
}) {
  const trigger = automation.nodes.find((n) => n.data.category === 'trigger')
  const nodeCount = automation.nodes.length

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all hover:shadow-md',
        automation.isActive && 'border-emerald-500/30'
      )}
    >
      {automation.isActive && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60" />
      )}
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="min-w-0 flex-1 pr-2">
          <div className="mb-1 flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                automation.isActive ? 'bg-emerald-500/10' : 'bg-muted'
              )}
            >
              <Zap
                className={cn(
                  'h-3.5 w-3.5',
                  automation.isActive ? 'text-emerald-500' : 'text-muted-foreground'
                )}
              />
            </div>
            <CardTitle className="truncate text-sm">{automation.name}</CardTitle>
          </div>
          <CardDescription className="line-clamp-1 text-xs">
            {trigger
              ? `Démarré par : ${trigger.data.label}`
              : 'Aucun déclencheur configuré'}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/automations/${automation.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(automation.id)}>
              {automation.isActive ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Désactiver
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Activer
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(automation.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            <span>
              {nodeCount} bloc{nodeCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>
              {automation.runCount} exécution{automation.runCount !== 1 ? 's' : ''}
            </span>
          </div>
          <Badge
            variant={automation.isActive ? 'default' : 'outline'}
            className={cn(
              'ml-auto px-1.5 text-[10px]',
              automation.isActive && 'bg-emerald-500 hover:bg-emerald-500/90'
            )}
          >
            {automation.isActive ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
        <Link href={`/automations/${automation.id}`}>
          <Button variant="outline" size="sm" className="h-7 w-full gap-1.5 text-xs">
            <Edit className="h-3 w-3" />
            Ouvrir l’éditeur
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

export default function AutomationsListPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setAutomations(loadAll())
    setReady(true)
  }, [])

  const handleCreate = () => {
    const auto = makeBlank(`Automatisation ${automations.length + 1}`)
    save(auto)
    setAutomations((prev) => [auto, ...prev])
    toast.success('Automatisation créée', {
      description: 'Cliquez sur « Ouvrir l’éditeur » pour la configurer.',
    })
  }

  const handleDelete = (id: string) => {
    remove(id)
    setAutomations((prev) => prev.filter((a) => a.id !== id))
    toast.success('Automatisation supprimée')
  }

  const handleToggle = (id: string) => {
    setAutomations((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        const updated = { ...a, isActive: !a.isActive, updatedAt: new Date().toISOString() }
        save(updated)
        return updated
      })
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automatisations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Créez des workflows automatiques pour votre CRM
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle automatisation
        </Button>
      </div>

      {ready && automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted/30">
            <Zap className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Aucune automatisation</p>
          <p className="mb-6 mt-1 text-xs text-muted-foreground">
            Créez votre première automatisation pour accélérer vos processus CRM
          </p>
          <Button onClick={handleCreate} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Créer une automatisation
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((auto) => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
