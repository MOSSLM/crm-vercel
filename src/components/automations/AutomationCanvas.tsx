'use client'
import React, { useCallback, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  EdgeChange,
  MiniMap,
  NodeChange,
  Panel,
  ReactFlowInstance,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useAutomation } from './AutomationProvider'
import AutomationNode from './AutomationNode'
import { NODE_DEFINITIONS } from './constants'
import type { AutomationFlowEdge, AutomationFlowNode, AutomationNodeType } from './types'
import { toast } from 'sonner'

const NODE_TYPES = { automationNode: AutomationNode }
const EMPTY_NODES: AutomationFlowNode[] = []
const EMPTY_EDGES: AutomationFlowEdge[] = []

export default function AutomationCanvas() {
  const { state, dispatch } = useAutomation()
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  const nodes = state.automation?.nodes ?? EMPTY_NODES
  const edges = state.automation?.edges ?? EMPTY_EDGES

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, nodes as any) as AutomationFlowNode[]
      dispatch({ type: 'SET_NODES', payload: next })
    },
    [nodes, dispatch]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, edges as any) as AutomationFlowEdge[]
      dispatch({ type: 'SET_EDGES', payload: next })
    },
    [edges, dispatch]
  )

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const next = addEdge(
        { ...params, animated: true, style: { strokeWidth: 2 } },
        edges as any
      ) as AutomationFlowEdge[]
      dispatch({ type: 'SET_EDGES', payload: next })
    },
    [edges, dispatch]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/automation-node') as AutomationNodeType
      if (!nodeType || !rfInstance) return

      const def = NODE_DEFINITIONS[nodeType]
      if (!def) return

      if (def.category === 'trigger' && nodes.some((n) => n.data.category === 'trigger')) {
        toast.warning('Un seul déclencheur par automatisation')
        return
      }

      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const newNode: AutomationFlowNode = {
        id: crypto.randomUUID(),
        type: 'automationNode',
        position,
        data: {
          label: def.label,
          description: def.description,
          nodeType,
          category: def.category,
          config: {},
          completed: false,
          hasError: false,
        },
      }

      dispatch({ type: 'SET_NODES', payload: [...nodes, newNode] })
    },
    [rfInstance, nodes, dispatch]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      dispatch({ type: 'SELECT_NODE', payload: node.id })
    },
    [dispatch]
  )

  const onPaneClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', payload: null })
  }, [dispatch])

  const styledNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === state.selectedNodeId })),
    [nodes, state.selectedNodeId]
  )

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={styledNodes}
        edges={edges as Edge[]}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
        }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode="Delete"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          className="!bg-muted/20"
        />
        <Controls
          position="bottom-right"
          showInteractive
          className="!rounded-lg !border !border-border !bg-background !shadow-md"
        />
        <MiniMap
          position="bottom-left"
          zoomable
          pannable
          className="!rounded-lg !border !border-border !bg-background/90 !shadow-md"
          maskColor="rgba(0,0,0,0.08)"
          nodeColor={(node) => {
            const data = node.data as any
            if (data?.category === 'trigger') return 'rgb(59,130,246)'
            if (data?.category === 'supabase') return 'rgb(74,222,128)'
            if (data?.category === 'ai') return 'rgb(168,85,247)'
            return 'rgb(16,185,129)'
          }}
        />
        {nodes.length === 0 && (
          <Panel position="top-center">
            <div className="mt-24 rounded-xl border border-dashed border-border bg-background/80 px-8 py-6 text-center backdrop-blur">
              <p className="text-sm font-medium text-foreground">
                Glissez un déclencheur depuis le panneau
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Commencez par un trigger pour démarrer votre automatisation
              </p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
