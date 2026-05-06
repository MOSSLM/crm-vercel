export type AutomationNodeType =
  | 'trigger_contact_created'
  | 'trigger_deal_created'
  | 'trigger_stage_changed'
  | 'trigger_webhook'
  | 'trigger_scheduled'
  | 'trigger_email_received'
  | 'action_send_email'
  | 'action_update_contact'
  | 'action_create_task'
  | 'action_add_to_pipeline'
  | 'action_slack_notification'
  | 'action_webhook_out'
  | 'action_condition'
  | 'action_wait'
  | 'supabase_edge_function'
  | 'supabase_sql_query'
  | 'ai_qualification'
  | 'ai_email_draft'

export type NodeCategory = 'trigger' | 'action' | 'supabase' | 'ai'

export type AutomationNodeData = {
  label: string
  description: string
  nodeType: AutomationNodeType
  category: NodeCategory
  config: Record<string, string>
  completed: boolean
  hasError: boolean
}

export type AutomationFlowNode = {
  id: string
  type: 'automationNode'
  position: { x: number; y: number }
  data: AutomationNodeData
}

export type AutomationFlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  animated?: boolean
}

export type Automation = {
  id: string
  name: string
  description: string
  isActive: boolean
  nodes: AutomationFlowNode[]
  edges: AutomationFlowEdge[]
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  runCount: number
}
