'use client'
import React, { createContext, useContext, useReducer } from 'react'
import type { Automation, AutomationFlowNode, AutomationFlowEdge } from './types'

type State = {
  automation: Automation | null
  selectedNodeId: string | null
  isDirty: boolean
}

type Action =
  | { type: 'SET_AUTOMATION'; payload: Automation }
  | { type: 'SET_NODES'; payload: AutomationFlowNode[] }
  | { type: 'SET_EDGES'; payload: AutomationFlowEdge[] }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'UPDATE_NODE_CONFIG'; payload: { nodeId: string; config: Record<string, string> } }
  | { type: 'UPDATE_NAME'; payload: string }
  | { type: 'TOGGLE_ACTIVE' }
  | { type: 'MARK_SAVED' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_AUTOMATION':
      return { ...state, automation: action.payload, isDirty: false }
    case 'SET_NODES':
      if (!state.automation) return state
      return { ...state, automation: { ...state.automation, nodes: action.payload }, isDirty: true }
    case 'SET_EDGES':
      if (!state.automation) return state
      return { ...state, automation: { ...state.automation, edges: action.payload }, isDirty: true }
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload }
    case 'UPDATE_NODE_CONFIG':
      if (!state.automation) return state
      return {
        ...state,
        isDirty: true,
        automation: {
          ...state.automation,
          nodes: state.automation.nodes.map((n) =>
            n.id === action.payload.nodeId
              ? { ...n, data: { ...n.data, config: { ...n.data.config, ...action.payload.config } } }
              : n
          ),
        },
      }
    case 'UPDATE_NAME':
      if (!state.automation) return state
      return { ...state, isDirty: true, automation: { ...state.automation, name: action.payload } }
    case 'TOGGLE_ACTIVE':
      if (!state.automation) return state
      return {
        ...state,
        isDirty: true,
        automation: { ...state.automation, isActive: !state.automation.isActive },
      }
    case 'MARK_SAVED':
      return { ...state, isDirty: false }
    default:
      return state
  }
}

type ContextType = { state: State; dispatch: React.Dispatch<Action> }
const AutomationContext = createContext<ContextType | null>(null)

export function AutomationProvider({
  children,
  initial,
}: {
  children: React.ReactNode
  initial?: Automation
}) {
  const [state, dispatch] = useReducer(reducer, {
    automation: initial ?? null,
    selectedNodeId: null,
    isDirty: false,
  })
  return <AutomationContext.Provider value={{ state, dispatch }}>{children}</AutomationContext.Provider>
}

export function useAutomation() {
  const ctx = useContext(AutomationContext)
  if (!ctx) throw new Error('useAutomation must be used within AutomationProvider')
  return ctx
}
