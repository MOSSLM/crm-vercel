'use client'
import React, { useState } from 'react'
import { useAutomation } from './AutomationProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Save, ArrowLeft, Play, Loader2, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Props = { onSave: () => Promise<void> }

export default function AutomationHeader({ onSave }: Props) {
  const { state, dispatch } = useAutomation()
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
      dispatch({ type: 'MARK_SAVED' })
      setJustSaved(true)
      toast.success('Automatisation sauvegardée')
      setTimeout(() => setJustSaved(false), 2000)
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (!state.automation) return null

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
      <Link href="/automations">
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </Link>
      <div className="h-4 w-px bg-border" />
      <Input
        value={state.automation.name}
        onChange={(e) => dispatch({ type: 'UPDATE_NAME', payload: e.target.value })}
        className="h-7 max-w-[260px] border-transparent bg-transparent px-2 text-sm font-medium shadow-none hover:border-border focus-visible:border-border focus-visible:ring-0"
        placeholder="Nom de l'automatisation..."
      />
      {state.isDirty && (
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
          Non sauvegardé
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Switch
            checked={state.automation.isActive}
            onCheckedChange={() => dispatch({ type: 'TOGGLE_ACTIVE' })}
            className="scale-75"
          />
          <span
            className={cn(
              'text-xs font-medium',
              state.automation.isActive ? 'text-emerald-500' : 'text-muted-foreground'
            )}
          >
            {state.automation.isActive ? 'Actif' : 'Inactif'}
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled
          title="Test à venir"
        >
          <Play className="h-3 w-3" />
          Tester
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleSave}
          disabled={saving || !state.isDirty}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : justSaved ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </header>
  )
}
