'use client'
import React from 'react'
import { AutomationProvider, useAutomation } from './AutomationProvider'
import type { Automation } from './types'
import AutomationHeader from './AutomationHeader'
import AutomationCanvas from './AutomationCanvas'
import AutomationSidebar from './AutomationSidebar'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'

function EditorInner() {
  const { state } = useAutomation()

  const handleSave = async () => {
    if (!state.automation) return
    // TODO: Replace with Supabase upsert once automations table is migrated
    // const { error } = await supabase.from('automations').upsert({ id, name, nodes, edges, is_active, user_id })
    const stored = JSON.parse(localStorage.getItem('crm_automations') ?? '{}')
    stored[state.automation.id] = {
      ...state.automation,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('crm_automations', JSON.stringify(stored))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <AutomationHeader onSave={handleSave} />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={75} minSize={40}>
            <AutomationCanvas />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={25} minSize={18} maxSize={42}>
            <AutomationSidebar />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

export default function AutomationEditorPage({ automation }: { automation: Automation }) {
  return (
    <AutomationProvider initial={automation}>
      <EditorInner />
    </AutomationProvider>
  )
}
