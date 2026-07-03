import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { promptText } from '../plexi/PromptDialog'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ConnectionMode,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { MapBody, MapEdge, MapShape } from '@shared/types'
import { normalizeMapBody, autoLayout } from '@shared/mapGraph'
import { mapTemplate, type MapTemplateId } from './map/mapTemplates'
import Icon from '../Icon'
import DrawMenuBar from './editor/DrawMenuBar'
import WidgetEmbed from './embed/WidgetEmbed'
import WidgetPickerDialog from './embed/WidgetPickerDialog'

// PlexiMaps editor — a Draw.io / Lucidchart-style diagram and workflow map. Built
// on React Flow but persists a clean, tool-agnostic MapBody (nodes carry their
// own position/shape/colour; edges carry an optional label + line style) so the
// graph syncs to the cloud and stays portable. Used standalone in PlexiOffice,
// embedded on the PlexiDesk canvas, and openable from the Documents hub.

const NODE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#475569']

const SHAPE_TOOLS: { shape: MapShape; icon: string; label: string }[] = [
  { shape: 'process', icon: 'crop_square', label: 'Process' },
  { shape: 'decision', icon: 'change_history', label: 'Decision' },
  { shape: 'terminator', icon: 'pill', label: 'Start / End' },
  { shape: 'data', icon: 'note', label: 'Data' },
  { shape: 'database', icon: 'database', label: 'Store' },
  { shape: 'circle', icon: 'circle', label: 'Connector' },
  { shape: 'note', icon: 'title', label: 'Text' }
]

// ── Custom node ─────────────────────────────────────────────────────────────
interface ShapeData extends Record<string, unknown> {
  label: string
  shape: MapShape
  color: string
  // Set only for shape === 'widget': the desk widget this node embeds.
  widgetId?: string
}

// The on-canvas size of a widget-embed node. Fixed rather than resizable so it
// behaves like the other draw shapes (which size to their content).
const WIDGET_NODE_W = 280
const WIDGET_NODE_H = 190

const HANDLE_STYLE = { width: 9, height: 9, background: '#94a3b8', border: '2px solid #fff' }
const SIDES: { id: string; position: Position }[] = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left }
]

function ShapeNode({ id, data, selected }: NodeProps): JSX.Element {
  const d = data as ShapeData
  const [editing, setEditing] = useState(false)
  const ring = selected ? 'outline outline-2 outline-offset-2 outline-accent' : ''
  const label = (
    <NodeLabel nodeId={id} value={d.label} editing={editing} setEditing={setEditing} />
  )

  // Each shape is a positioned box; non-rectangular shapes use clip-path or SVG.
  const baseText =
    'flex items-center justify-center text-center text-[12px] font-medium px-3 py-2 select-none text-stone-900 dark:text-stone-900'
  let inner: JSX.Element

  if (d.shape === 'widget') {
    // A live desk-widget embed. WidgetEmbed handles loading / missing states;
    // a node saved without a widgetId renders the missing state honestly.
    inner = (
      <div className={ring} style={{ width: WIDGET_NODE_W, height: WIDGET_NODE_H }}>
        <WidgetEmbed widgetId={d.widgetId ?? ''} />
      </div>
    )
  } else if (d.shape === 'decision') {
    inner = (
      <div
        className={`${baseText} ${ring}`}
        style={{
          width: 130,
          height: 92,
          background: `${d.color}1f`,
          border: `2px solid ${d.color}`,
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
        }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else if (d.shape === 'data') {
    inner = (
      <div
        className={`${baseText} ${ring}`}
        style={{
          minWidth: 120,
          minHeight: 52,
          background: `${d.color}1f`,
          border: `2px solid ${d.color}`,
          clipPath: 'polygon(16% 0, 100% 0, 84% 100%, 0% 100%)'
        }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else if (d.shape === 'terminator') {
    inner = (
      <div
        className={`${baseText} rounded-full ${ring}`}
        style={{ minWidth: 110, minHeight: 46, background: `${d.color}1f`, border: `2px solid ${d.color}` }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else if (d.shape === 'database') {
    inner = (
      <div
        className={`${baseText} ${ring}`}
        style={{
          minWidth: 104,
          minHeight: 64,
          background: `${d.color}1f`,
          border: `2px solid ${d.color}`,
          borderRadius: '50% / 18%'
        }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else if (d.shape === 'circle') {
    inner = (
      <div
        className={`${baseText} rounded-full ${ring}`}
        style={{ width: 86, height: 86, background: `${d.color}1f`, border: `2px solid ${d.color}` }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else if (d.shape === 'note') {
    inner = (
      <div
        className={`${baseText} ${ring} bg-transparent`}
        style={{ minWidth: 60, color: d.color }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  } else {
    // process (rectangle)
    inner = (
      <div
        className={`${baseText} rounded-md bg-white dark:bg-stone-100 ${ring}`}
        style={{ minWidth: 110, minHeight: 46, border: `2px solid ${d.color}` }}
        onDoubleClick={() => setEditing(true)}
      >
        {label}
      </div>
    )
  }

  return (
    <div className="relative">
      {inner}
      {SIDES.map((s) => (
        <Handle key={s.id} id={s.id} type="source" position={s.position} style={HANDLE_STYLE} />
      ))}
    </div>
  )
}

// Inline label editor — commits via a window CustomEvent the editor listens for,
// so the node stays free of store wiring (matches the DiagramWidget pattern).
function NodeLabel({
  nodeId,
  value,
  editing,
  setEditing
}: {
  nodeId: string
  value: string
  editing: boolean
  setEditing: (v: boolean) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  function commit(): void {
    setEditing(false)
    window.dispatchEvent(new CustomEvent('fb-map-label', { detail: { nodeId, label: draft } }))
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
          e.stopPropagation()
        }}
        className="bg-white text-stone-900 text-[12px] text-center rounded px-1 outline-none border border-accent w-[90%]"
        onClick={(e) => e.stopPropagation()}
      />
    )
  }
  return <span className="whitespace-pre-wrap break-words leading-tight">{value || '…'}</span>
}

const nodeTypes = { shape: ShapeNode }

// ── MapBody <-> React Flow conversion ───────────────────────────────────────
function toFlowNodes(body: MapBody): Node<ShapeData>[] {
  return body.nodes.map((n) => ({
    id: n.id,
    type: 'shape',
    position: { x: n.x, y: n.y },
    data: { label: n.label, shape: n.shape, color: n.color, ...(n.widgetId ? { widgetId: n.widgetId } : {}) }
  }))
}
function edgeStyle(e: MapEdge): React.CSSProperties {
  return e.style === 'dashed' ? { strokeDasharray: '6 4', stroke: '#64748b' } : { stroke: '#64748b' }
}
function toFlowEdges(body: MapBody): Edge[] {
  return body.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    label: e.label,
    animated: !!e.animated,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
    style: edgeStyle(e),
    labelStyle: { fontSize: 11, fill: '#334155' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 }
  }))
}
function fromFlow(
  nodes: Node<ShapeData>[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number }
): MapBody {
  return {
    version: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      label: n.data.label,
      shape: n.data.shape,
      color: n.data.color,
      ...(n.data.widgetId ? { widgetId: n.data.widgetId } : {})
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
      style: (e.style as React.CSSProperties)?.strokeDasharray ? 'dashed' : 'solid',
      ...(e.animated ? { animated: true } : {})
    })),
    viewport
  }
}

interface Props {
  body: MapBody
  title?: string
  onChange: (body: MapBody) => void
}

function MapInner({ body, onChange }: Props): JSX.Element {
  const initial = useMemo(() => normalizeMapBody(body), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ShapeData>>(toFlowNodes(initial))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toFlowEdges(initial))
  const [color, setColor] = useState(NODE_COLORS[0])
  const [dashed, setDashed] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false)
  const seq = useRef(initial.nodes.length)
  const viewportRef = useRef(initial.viewport ?? { x: 0, y: 0, zoom: 1 })
  const rf = useReactFlow()

  // Emit MapBody out (debounced) on any change. The parent store debounces too,
  // so this just coalesces React Flow's chatty change stream.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const lastEmitted = useRef('')
  useEffect(() => {
    const next = fromFlow(nodes, edges, viewportRef.current)
    const json = JSON.stringify(next)
    if (json === lastEmitted.current) return
    const t = window.setTimeout(() => {
      lastEmitted.current = json
      onChangeRef.current(next)
    }, 350)
    return () => window.clearTimeout(t)
  }, [nodes, edges])

  // Label commits from a node's inline editor.
  useEffect(() => {
    function onLabel(e: Event): void {
      const { nodeId, label } = (e as CustomEvent).detail as { nodeId: string; label: string }
      setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label } } : n)))
    }
    window.addEventListener('fb-map-label', onLabel as EventListener)
    return () => window.removeEventListener('fb-map-label', onLabel as EventListener)
  }, [setNodes])

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) =>
        addEdge(
          {
            ...c,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
            style: dashed ? { strokeDasharray: '6 4', stroke: '#64748b' } : { stroke: '#64748b' },
            labelStyle: { fontSize: 11, fill: '#334155' },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 }
          },
          es
        )
      ),
    [setEdges, dashed]
  )

  function newId(prefix: string): string {
    seq.current += 1
    return `${prefix}${Date.now().toString(36)}-${seq.current}`
  }

  function addNode(shape: MapShape): void {
    const id = newId('n')
    // Drop new nodes near the centre of the current viewport.
    const center = rf.screenToFlowPosition
      ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 120 + (seq.current % 5) * 40, y: 100 + (seq.current % 7) * 30 }
    const label =
      shape === 'note'
        ? 'Text'
        : shape === 'decision'
          ? 'Decision?'
          : shape === 'terminator'
            ? 'Start'
            : shape === 'database'
              ? 'Store'
              : 'Step'
    setNodes((ns) => [
      ...ns,
      { id, type: 'shape', position: { x: center.x, y: center.y }, data: { label, shape, color } }
    ])
  }

  // Drop a live desk-widget embed near the viewport centre. The node stores
  // only the widget id; WidgetEmbed resolves the current content at render.
  function addWidgetNode(widgetId: string): void {
    const id = newId('n')
    const center = rf.screenToFlowPosition
      ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 160, y: 120 }
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'shape',
        position: { x: center.x - WIDGET_NODE_W / 2, y: center.y - WIDGET_NODE_H / 2 },
        data: { label: '', shape: 'widget', color, widgetId }
      }
    ])
  }

  // Edge label edit on double-click.
  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      void promptText({
        title: 'Edge label',
        initial: typeof edge.label === 'string' ? edge.label : '',
        confirmLabel: 'Set label'
      }).then((next) => {
        if (next === null) return
        setEdges((es) => es.map((e) => (e.id === edge.id ? { ...e, label: next } : e)))
      })
    },
    [setEdges]
  )

  function applyTemplate(id: MapTemplateId): void {
    const tpl = normalizeMapBody(mapTemplate(id))
    setNodes(toFlowNodes(tpl))
    setEdges(toFlowEdges(tpl))
    seq.current = tpl.nodes.length
    window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50)
  }

  function loadBody(b: MapBody): void {
    const norm = normalizeMapBody(b)
    setNodes(toFlowNodes(norm))
    setEdges(toFlowEdges(norm))
    seq.current = norm.nodes.length
    window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50)
  }

  const interactive = true

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-stone-900">
      {/* Menu bar — real diagram actions (add shapes, fit view). */}
      <div className="shrink-0 px-2 pt-1.5 pb-1 border-b border-stone-100 dark:border-stone-800">
        <DrawMenuBar
          actions={{
            shapes: SHAPE_TOOLS.map((t) => ({ shape: t.shape, label: t.label })),
            addNode,
            insertWidget: () => setWidgetPickerOpen(true),
            fitView: () => rf.fitView({ padding: 0.2, duration: 300 })
          }}
        />
      </div>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800/60 flex-wrap">
        {SHAPE_TOOLS.map((t) => (
          <button
            key={t.shape}
            onClick={() => addNode(t.shape)}
            data-testid={`map-add-${t.shape}`}
            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
            title={`Add ${t.label}`}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
        <div className="w-px h-4 bg-stone-300 dark:bg-stone-600 mx-0.5" />
        {NODE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-4 w-4 rounded-full border ${color === c ? 'ring-2 ring-offset-1 ring-stone-400' : 'border-black/10'}`}
            style={{ backgroundColor: c }}
            title="Colour for new nodes"
            aria-label={`Colour ${c}`}
          />
        ))}
        <button
          onClick={() => setDashed((v) => !v)}
          className={`ml-1 inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded ${dashed ? 'bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100' : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'}`}
          title="Draw new connectors dashed"
        >
          <Icon name="more_horiz" size={14} />
          Dashed
        </button>
        <div className="w-px h-4 bg-stone-300 dark:bg-stone-600 mx-0.5" />
        <TemplateMenu onPick={applyTemplate} />
        <button
          onClick={() => setAiOpen(true)}
          data-testid="map-ai"
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded text-accent hover:bg-accent/[0.08]"
          title="Generate a map from a description"
        >
          <Icon name="auto_awesome" size={14} />
          AI map
        </button>
        <div className="flex-1" />
        <button
          onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
          title="Fit the whole map in view"
        >
          <Icon name="fit_screen" size={14} />
          Fit
        </button>
        <span className="text-[10px] text-stone-400 ml-1">
          double-click a node to rename · drag a dot to connect · double-click a line to label · ⌫ deletes
        </span>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onMoveEnd={(_, vp) => (viewportRef.current = vp)}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          defaultViewport={initial.viewport}
          fitView={!initial.viewport}
          proOptions={{ hideAttribution: true }}
          panOnDrag={interactive}
          zoomOnScroll={interactive}
          nodesDraggable={interactive}
          nodesConnectable={interactive}
          elementsSelectable={interactive}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background gap={16} color="#e7e5e4" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-stone-100 dark:!bg-stone-800" />
        </ReactFlow>
        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="text-[12px] text-stone-400">
              Add a shape from the toolbar, pick a template, or generate a map with AI
            </span>
          </div>
        )}
      </div>

      {aiOpen && <AiMapPanel onClose={() => setAiOpen(false)} onApply={loadBody} />}

      {widgetPickerOpen && (
        <WidgetPickerDialog
          onPick={(widgetId) => {
            setWidgetPickerOpen(false)
            addWidgetNode(widgetId)
          }}
          onClose={() => setWidgetPickerOpen(false)}
        />
      )}
    </div>
  )
}

function TemplateMenu({ onPick }: { onPick: (id: MapTemplateId) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const items: { id: MapTemplateId; label: string }[] = [
    { id: 'flowchart', label: 'Flowchart' },
    { id: 'orgchart', label: 'Org chart' },
    { id: 'mindmap', label: 'Mind map' },
    { id: 'swimlane', label: 'Approval flow' }
  ]
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
        title="Start from a template"
      >
        <Icon name="dashboard" size={14} />
        Templates
        <Icon name="expand_more" size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-40 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 shadow-lg py-1">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  onPick(it.id)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-stone-100 dark:hover:bg-stone-700"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AiMapPanel({
  onClose,
  onApply
}: {
  onClose: () => void
  onApply: (body: MapBody) => void
}): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(): Promise<void> {
    const p = prompt.trim()
    if (!p || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await window.api.documents.generate({ docType: 'map', prompt: p })
      if (!r.ok || !r.body) {
        setError(r.error || 'Could not generate a map.')
        return
      }
      // Lay it out before applying so AI nodes (no coordinates) read well.
      const norm = normalizeMapBody(r.body)
      onApply({ ...norm, nodes: autoLayout(norm.nodes, norm.edges) })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[440px] max-w-[90%] rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="auto_awesome" size={15} className="text-accent" />
          Generate a map with AI
        </div>
        <p className="text-[11px] text-stone-500">
          Describe a process, decision flow, or structure. The model returns the steps and
          connections; PlexiMaps lays them out for you.
        </p>
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run()
          }}
          rows={4}
          placeholder="e.g. The customer onboarding process from signup to first value, with an approval step"
          className="w-full bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded px-2 py-1.5 text-[12px] focus:outline-none focus:border-accent"
        />
        {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-[12px] px-3 py-1.5 text-stone-500 hover:text-stone-700">
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || !prompt.trim()}
            data-testid="map-ai-run"
            className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
        <p className="text-[10px] text-stone-400">This replaces the current map. Cmd/Ctrl+Enter to run.</p>
      </div>
    </div>
  )
}

export default function MapEditor(props: Props): JSX.Element {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  )
}
