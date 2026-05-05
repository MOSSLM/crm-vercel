'use client'
import { useEffect, useState } from 'react'
import type { Automation } from './types'
import AutomationEditorPage from './AutomationEditorPage'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

function loadFromStorage(id: string): Automation | null {
  try {
    const stored = JSON.parse(localStorage.getItem('crm_automations') ?? '{}')
    return stored[id] ?? null
  } catch {
    return null
  }
}

export default function AutomationEditorLoader({ id }: { id: string }) {
  const [automation, setAutomation] = useState<Automation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAutomation(loadFromStorage(id))
    setLoading(false)
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!automation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Automatisation introuvable</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/automations">Retour aux automatisations</Link>
        </Button>
      </div>
    )
  }

  return <AutomationEditorPage automation={automation} />
}
