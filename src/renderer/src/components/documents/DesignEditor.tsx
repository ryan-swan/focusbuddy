import { useEffect, useRef, useState } from 'react'
import type { DeckTheme, Slide, SlideElement } from '@shared/types'
import SlideCanvas from './slides/SlideCanvas'
import {
  addElement,
  alignElements,
  deleteElement,
  distributeElements,
  duplicateElement,
  elementId,
  elementText,
  groupElements,
  moveElementsBy,
  reorderZ,
  setElementText,
  ungroupElements,
  updateElement,
  type AlignEdge
} from './slides/slideOps'
import {
  DESIGN_SIZES,
  DESIGN_TEMPLATES,
  composeDesign,
  buildDesignVariations,
  designFromTemplate,
  findDesignSize,
  normalizeDesignBody,
  resizeDesign,
  templatesForCategory,
  type DesignBody,
  type DesignCategory,
  type DesignSize
} from '@shared/design'
import Icon from '../Icon'
import SlideElementView from './slides/SlideElementView'
import { useBrandStore } from '../../stores/brand'
import BrandKitModal from './BrandKitModal'
import { GOOGLE_FONTS, loadGoogleFont, fontFamilyValue, familyLabel } from '../../lib/googleFonts'
import DesignAiPanel from './DesignAiPanel'
import DesignMenuBar from './editor/DesignMenuBar'
import { useAccountStore } from '../../stores/account'
import WidgetPickerDialog from './embed/WidgetPickerDialog'
import { checkDesignA11y } from '../../lib/designA11y'

// PlexiDesign — the on-platform design studio. A design is a single arbitrary-size
// canvas of the same elements a slide uses, so this editor reuses the proven slide
// canvas (drag, resize, snap guides, marquee) at the design's own size. The studio
// adds the design-specific layer: size presets, brand-aware templates, AI copy and
// AI image generation, brand colors, and per-element styling.

interface Props {
  content: unknown
  title: string
  onChange: (body: unknown) => void
  // Live co-editing only. When true, a change in the content prop's identity is
  // folded in as a peer's merge. Off by default for the single-user editor, where
  // our own saves come back as a new identity and folding them would fight local
  // editing.
  foldExternal?: boolean
}

const EXPORT_FORMATS: { id: 'png' | 'pdf'; label: string }[] = [
  { id: 'png', label: 'PNG image' },
  { id: 'pdf', label: 'PDF' }
]


const CATEGORIES: { id: DesignCategory; label: string }[] = [
  { id: 'social', label: 'Social' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'logo', label: 'Logo & brand' }
]

// A neutral theme for the canvas; designs carry their own colors per element, so
// the theme only supplies a fallback background and text color.
const NEUTRAL_THEME: DeckTheme = {
  id: 'design',
  name: 'Design',
  background: '#ffffff',
  fontHeading: 'Inter, system-ui, sans-serif',
  fontBody: 'Inter, system-ui, sans-serif',
  accent: '#6d5dfc',
  textColor: '#1c1917',
  titleStyle: { fontSize: 48, bold: true, color: '#1c1917' },
  bodyStyle: { fontSize: 24, color: '#44403c' }
}

export default function DesignEditor({ content, title, onChange, foldExternal = false }: Props): JSX.Element {
  const [design, setDesign] = useState<DesignBody>(() => normalizeDesignBody(content))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [panel, setPanel] = useState<'none' | 'templates' | 'size' | 'ai' | 'stock'>(
    () => (normalizeDesignBody(content).elements.length === 0 ? 'templates' : 'none')
  )
  const [aiPrompt, setAiPrompt] = useState('')
  const [imgPrompt, setImgPrompt] = useState('')
  const [stockQuery, setStockQuery] = useState('')
  const [stockResults, setStockResults] = useState<Array<{ id: string; thumb: string; full: string; alt: string; photographer: string }>>([])
  const [variations, setVariations] = useState<DesignBody[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [canvasW, setCanvasW] = useState(640)
  const [brandOpen, setBrandOpen] = useState(false)
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false)
  // The right-side AI Assistant panel, persistent and collapsible to match the
  // other Office editors. Open by default so the assistant is discoverable.
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  // The signed-in user's name for the assistant greeting. Falls back to a neutral
  // greeting when signed out (no fabricated name).
  const account = useAccountStore((s) => s.account)
  const userName = account?.handle ?? account?.email ?? null
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // Undo / redo history. designRef always holds the current body so a commit can
  // record the prior state without a stale closure.
  const designRef = useRef<DesignBody>(design)
  designRef.current = design
  const [past, setPast] = useState<DesignBody[]>([])
  const [future, setFuture] = useState<DesignBody[]>([])
  // Mirror history to refs so the handlers (and the keyboard shortcuts, whose
  // effect closure would otherwise be stale) always read the current stacks.
  const pastRef = useRef<DesignBody[]>(past)
  pastRef.current = past
  const futureRef = useRef<DesignBody[]>(future)
  futureRef.current = future

  // The org brand kit, read live from the brand store. Until a brand is saved it
  // is the default brand, exactly like a fresh Canva account, so every action is
  // always on a usable brand.
  const brand = useBrandStore((s) => s.kit)
  const loadBrand = useBrandStore((s) => s.load)
  useEffect(() => {
    void loadBrand()
  }, [loadBrand])

  // Fold live co-editing merges. When the content prop changes identity (a peer's
  // edit arrived through the CRDT; our own edits reconcile under a private origin
  // that never refreshes the prop, so this only fires for remote merges), replace
  // the design with the merged body. We do not push this onto the undo stack — a
  // peer's edit is not our action to undo. The first run is skipped because the
  // initial state already reflects the first content.
  const firstFold = useRef(true)
  useEffect(() => {
    if (!foldExternal) return
    if (firstFold.current) {
      firstFold.current = false
      return
    }
    const next = normalizeDesignBody(content)
    designRef.current = next
    setDesign(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, foldExternal])

  // Ensure every Google font the design (and the brand) uses is loaded, so the
  // canvas renders in the right typeface rather than a fallback.
  useEffect(() => {
    loadGoogleFont(familyLabel(brand.fontHeading))
    loadGoogleFont(familyLabel(brand.fontBody))
    for (const el of design.elements) {
      if (el.type === 'text' && el.fontFamily) loadGoogleFont(familyLabel(el.fontFamily))
    }
  }, [design.elements, brand.fontHeading, brand.fontBody])

  // Fit the canvas to the available width, capped so a wide design doesn't sprawl.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const avail = el.clientWidth - 48
      setCanvasW(Math.max(280, Math.min(avail, 720)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const size: DesignSize = findDesignSize(`${design.width}x${design.height}`) ?? {
    id: 'custom',
    category: design.category ?? 'custom',
    label: `${design.width} × ${design.height}`,
    w: design.width,
    h: design.height
  }

  // Keep pages[activePage] in step with the live top-level elements/background,
  // so the multi-page array is always the source of truth.
  function syncActivePage(b: DesignBody): DesignBody {
    const active = b.activePage ?? 0
    const pages = (b.pages ?? []).map((p, i) => (i === active ? { ...p, elements: b.elements, background: b.background } : p))
    return { ...b, pages }
  }

  // The single writer: records the prior body on the undo stack, clears redo, and
  // persists. Every change to the design flows through here.
  function commit(next: DesignBody): void {
    const synced = syncActivePage(next)
    setPast([...pastRef.current.slice(-59), designRef.current])
    setFuture([])
    designRef.current = synced
    setDesign(synced)
    onChange(synced)
  }

  const pages = design.pages ?? []
  const activePage = design.activePage ?? 0

  function goToPage(i: number): void {
    const d = designRef.current
    const ps = d.pages ?? []
    if (i < 0 || i >= ps.length || i === (d.activePage ?? 0)) return
    const saved = syncActivePage(d)
    const target = saved.pages![i]
    commit({ ...saved, activePage: i, elements: target.elements, background: target.background })
    setSelectedIds([])
  }
  function addPage(): void {
    const saved = syncActivePage(designRef.current)
    const np: import('@shared/design').DesignPage = { id: `pg-${Date.now().toString(36)}`, background: { type: 'solid', color: '#ffffff' }, elements: [] }
    const nextPages = [...(saved.pages ?? []), np]
    commit({ ...saved, pages: nextPages, activePage: nextPages.length - 1, elements: np.elements, background: np.background })
    setSelectedIds([])
  }
  function deletePage(i: number): void {
    const saved = syncActivePage(designRef.current)
    const ps = saved.pages ?? []
    if (ps.length <= 1) return
    const nextPages = ps.filter((_, idx) => idx !== i)
    const cur = saved.activePage ?? 0
    const newActive = Math.max(0, Math.min(nextPages.length - 1, cur > i ? cur - 1 : cur))
    const target = nextPages[newActive]
    commit({ ...saved, pages: nextPages, activePage: newActive, elements: target.elements, background: target.background })
    setSelectedIds([])
  }

  function update(patch: Partial<DesignBody>): void {
    commit({ ...designRef.current, ...patch })
  }

  // Run a slide-op against the design's elements/background and persist the result.
  function mutate(fn: (s: Slide) => Slide): void {
    const d = designRef.current
    const slide: Slide = { id: 'design', notes: '', elements: d.elements, background: d.background, schemaVersion: 2 }
    const next = fn(slide)
    update({ elements: next.elements ?? [], background: next.background })
  }

  function undo(): void {
    const p = pastRef.current
    if (!p.length) return
    const prev = p[p.length - 1]
    setPast(p.slice(0, -1))
    setFuture([designRef.current, ...futureRef.current.slice(0, 59)])
    designRef.current = prev
    setDesign(prev)
    onChange(prev)
  }
  function redo(): void {
    const f = futureRef.current
    if (!f.length) return
    const next = f[0]
    setFuture(f.slice(1))
    setPast([...pastRef.current.slice(-59), designRef.current])
    designRef.current = next
    setDesign(next)
    onChange(next)
  }

  const topZ = design.elements.reduce((m, e) => Math.max(m, e.z), 0)

  // ── Selection operations ───────────────────────────────────────────────────
  function deleteSelected(): void {
    if (!selectedIds.length) return
    mutate((s) => selectedIds.reduce((acc, id) => deleteElement(acc, id), s))
    setSelectedIds([])
  }
  function duplicateSelected(): void {
    if (!selectedIds.length) return
    const newIds: string[] = []
    mutate((s) =>
      selectedIds.reduce((acc, id) => {
        const d = duplicateElement(acc, id)
        newIds.push(d.newId)
        return d.slide
      }, s)
    )
    setSelectedIds(newIds)
  }
  function align(edge: AlignEdge): void {
    if (selectedIds.length < 1) return
    mutate((s) => alignElements(s, selectedIds, edge))
  }
  function distribute(axis: 'h' | 'v'): void {
    if (selectedIds.length < 3) return
    mutate((s) => distributeElements(s, selectedIds, axis))
  }
  function group(): void {
    if (selectedIds.length < 2) return
    mutate((s) => groupElements(s, selectedIds))
  }
  function ungroup(): void {
    if (!selectedIds.length) return
    mutate((s) => ungroupElements(s, selectedIds))
  }

  // Keyboard: undo/redo, duplicate, delete. Inert while typing in a field or
  // editing text on the canvas, so it never eats a keystroke meant for content.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey
      const t = e.target as HTMLElement | null
      const editing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        if (editing) return
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        if (editing) return
        e.preventDefault()
        redo()
        return
      }
      if (editing) return
      if (mod && key === 'd') {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds])

  function addText(): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'text',
      x: Math.round(design.width * 0.1),
      y: Math.round(design.height * 0.1),
      w: Math.round(design.width * 0.8),
      h: Math.round(design.height * 0.14),
      z: topZ + 1,
      fontFamily: brand.fontBody,
      paragraphs: [{ runs: [{ text: 'Your text', fontSize: Math.round(design.width * 0.05), color: '#1c1917' }] }]
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  function addShape(shape: 'rect' | 'ellipse' | 'roundRect' | 'triangle'): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'shape',
      shape,
      x: Math.round(design.width * 0.3),
      y: Math.round(design.height * 0.3),
      w: Math.round(design.width * 0.3),
      h: Math.round(design.width * 0.3),
      z: topZ + 1,
      fill: { type: 'solid', color: brand.colorPrimary }
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  function addLine(): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'line',
      x: Math.round(design.width * 0.2),
      y: Math.round(design.height * 0.5),
      w: Math.round(design.width * 0.6),
      h: 0,
      z: topZ + 1,
      x2: Math.round(design.width * 0.8),
      y2: Math.round(design.height * 0.5),
      stroke: brand.colorPrimary,
      strokeWidth: Math.max(2, Math.round(design.width * 0.004))
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  async function addImageFromFile(): Promise<void> {
    const res = await window.api.office.pickImage()
    if (res.ok && res.dataUrl) placeImage(res.dataUrl)
  }

  // Place a live desk-widget embed on the canvas. Only the id is stored; the
  // renderer resolves the widget's current content every time.
  function addWidget(widgetId: string): void {
    const w = Math.round(design.width * 0.4)
    const el: SlideElement = {
      id: elementId(),
      type: 'widget',
      widgetId,
      x: Math.round(design.width * 0.3),
      y: Math.round(design.height * 0.3),
      w,
      h: Math.round(w * 0.7),
      z: topZ + 1
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  // Drop the brand logo onto the canvas. If no brand logo is set, open the brand
  // editor so the user can add one rather than doing nothing.
  function placeLogo(): void {
    if (!brand.logoUrl) {
      setBrandOpen(true)
      return
    }
    const sizeW = Math.round(design.width * 0.22)
    const el: SlideElement = {
      id: elementId(),
      type: 'image',
      src: brand.logoUrl,
      x: Math.round(design.width * 0.06),
      y: Math.round(design.height * 0.06),
      w: sizeW,
      h: sizeW,
      z: topZ + 1,
      fit: 'contain'
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  function placeImage(src: string): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'image',
      src,
      x: Math.round(design.width * 0.1),
      y: Math.round(design.height * 0.1),
      w: Math.round(design.width * 0.5),
      h: Math.round(design.height * 0.5),
      z: topZ + 1,
      fit: 'cover'
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  async function generateImage(): Promise<void> {
    const prompt = imgPrompt.trim()
    if (!prompt) return
    setBusy('Generating image…')
    setStatus(null)
    try {
      const res = await window.api.design.generateImage({ prompt, width: design.width, height: design.height })
      if (res.ok && res.dataUrl) {
        placeImage(res.dataUrl)
        setImgPrompt('')
      } else if (res.needsKey) {
        setStatus(res.error ?? 'Add your OpenAI API key in Settings → API Keys to generate images.')
      } else {
        setStatus(res.error ?? 'Image generation failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function searchStock(): Promise<void> {
    const q = stockQuery.trim()
    if (!q) return
    setBusy('Searching photos…')
    setStatus(null)
    try {
      const res = await window.api.design.searchPhotos({ query: q })
      if (res.ok && res.photos) {
        setStockResults(res.photos)
        if (!res.photos.length) setStatus('No photos found for that search.')
      } else if (res.needsKey) {
        setStockResults([])
        setStatus(res.error ?? 'Add a free Pexels API key in Settings → API Keys to search stock photos.')
      } else {
        setStatus(res.error ?? 'Stock search failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function insertStock(photo: { full: string }): Promise<void> {
    setBusy('Adding photo…')
    try {
      const res = await window.api.design.fetchImage({ url: photo.full })
      if (res.ok && res.dataUrl) placeImage(res.dataUrl)
      else setStatus(res.error ?? 'Could not add that photo.')
    } finally {
      setBusy(null)
    }
  }

  async function removeBgSelected(): Promise<void> {
    if (!selected || selected.type !== 'image') return
    setBusy('Removing background…')
    setStatus(null)
    try {
      const res = await window.api.design.removeBackground({ dataUrl: selected.src })
      if (res.ok && res.dataUrl) {
        const id = selected.id
        mutate((s) => updateElement(s, id, { src: res.dataUrl }))
      } else if (res.needsKey) {
        setStatus(res.error ?? 'Add a remove.bg API key in Settings → API Keys to remove backgrounds.')
      } else {
        setStatus(res.error ?? 'Background removal failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function generateVariations(): Promise<void> {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    setBusy('Generating variations…')
    setStatus(null)
    try {
      const res = await window.api.design.generateVariations({ prompt, designKind: size.label, count: 6 })
      if (res.ok && res.concepts) {
        setVariations(buildDesignVariations(size, brand, res.concepts))
      } else if (res.needsApiKey) {
        setStatus(res.error ?? 'Add your Anthropic API key in Settings to generate designs.')
      } else {
        setStatus(res.error ?? 'Could not generate variations.')
      }
    } finally {
      setBusy(null)
    }
  }

  function applyVariation(v: DesignBody): void {
    commit(v)
    setVariations([])
    setSelectedIds([])
    setPanel('none')
    setAiPrompt('')
  }

  async function generateDesign(): Promise<void> {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    setBusy('Designing…')
    setStatus(null)
    try {
      const res = await window.api.design.generateContent({ prompt, designKind: size.label })
      if (res.ok && res.content) {
        const body = composeDesign(size, brand, res.content)
        commit(body)
        setSelectedIds([])
        setPanel('none')
        setAiPrompt('')
      } else if (res.needsApiKey) {
        setStatus(res.error ?? 'Add your Anthropic API key in Settings to generate designs.')
      } else {
        setStatus(res.error ?? 'Design generation failed.')
      }
    } finally {
      setBusy(null)
    }
  }

  function applyTemplate(templateId: string): void {
    const tpl = DESIGN_TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    const tsize = findDesignSize(tpl.sizeId) ?? size
    const body = designFromTemplate(tpl, tsize, brand)
    commit(body)
    setSelectedIds([])
    setPanel('none')
  }

  function changeSize(s: DesignSize): void {
    // Magic resize: reflow the existing layout into the new size rather than just
    // changing the canvas under fixed elements. A blank canvas just takes the size.
    commit(design.elements.length ? resizeDesign(designRef.current, s) : { ...designRef.current, width: s.w, height: s.h, category: s.category })
    setPanel('none')
  }

  // Brandify: recolor shapes to the brand primary and text to a readable tone, so
  // an off-brand design snaps to the brand palette in one click.
  function brandify(): void {
    const els = design.elements.map((e) => {
      if (e.type === 'shape') return { ...e, fill: { type: 'solid' as const, color: brand.colorPrimary } }
      if (e.type === 'text')
        return {
          ...e,
          fontFamily: brand.fontHeading,
          paragraphs: e.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, color: r.color === '#ffffff' ? '#ffffff' : brand.colorPrimary })) }))
        }
      return e
    })
    update({ elements: els, brandApplied: true })
  }

  async function exportAs(format: 'png' | 'pdf', printMarks = false): Promise<void> {
    setExportOpen(false)
    setBusy(printMarks ? 'Exporting print PDF…' : `Exporting ${format.toUpperCase()}…`)
    setStatus(null)
    try {
      const res = await window.api.design.export({ design, title: title || 'design', format, printMarks })
      if (res.ok) setStatus(`Saved ${res.path}`)
      else if (res.error) setStatus(res.error)
    } finally {
      setBusy(null)
    }
  }

  const selected = design.elements.find((e) => e.id === selectedIds[0]) ?? null

  // ── AI Assistant panel helpers ──────────────────────────────────────────────
  // The plain text of the selected element when it is a text element, so the panel
  // can rewrite the real content. Null for any non-text selection.
  const selectedTextValue = selected && selected.type === 'text' ? elementText(selected) : null

  // Replace the selected text element's text with the AI result, going through the
  // same setElementText writer the canvas uses so styling is preserved.
  function applyAiText(text: string): void {
    if (!selected || selected.type !== 'text') return
    const id = selected.id
    mutate((s) => {
      const e = (s.elements ?? []).find((x) => x.id === id)
      return e && e.type === 'text' ? updateElement(s, id, setElementText(e, text)) : s
    })
  }

  // Insert the AI result as a new text element on the canvas, then select it.
  function insertAiText(text: string): void {
    const el: SlideElement = {
      id: elementId(),
      type: 'text',
      x: Math.round(design.width * 0.1),
      y: Math.round(design.height * 0.1),
      w: Math.round(design.width * 0.8),
      h: Math.round(design.height * 0.18),
      z: topZ + 1,
      fontFamily: brand.fontBody,
      paragraphs: text.split('\n').map((line) => ({
        runs: [{ text: line, fontSize: Math.round(design.width * 0.05), color: '#1c1917' }]
      }))
    }
    mutate((s) => addElement(s, el))
    setSelectedIds([el.id])
  }

  return (
    <div className="flex flex-col h-full" data-testid="design-editor">
      {/* Menu bar — real design-canvas actions. */}
      <div className="px-2 pt-1.5 pb-1 border-b border-[var(--edge-soft)]">
        <DesignMenuBar
          actions={{
            title,
            undo,
            redo,
            deleteSelected,
            addText,
            addShape,
            addLine,
            addImageFromFile: () => void addImageFromFile(),
            addWidget: () => setWidgetPickerOpen(true),
            removeBgSelected: () => void removeBgSelected(),
            exportAs: (f) => void exportAs(f)
          }}
        />
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--edge-soft)] flex-wrap text-[12px]">
        <button
          onClick={undo}
          disabled={past.length === 0}
          data-testid="design-undo"
          title="Undo (Cmd/Ctrl+Z)"
          className="inline-flex items-center px-2 py-1.5 rounded-lg hover:bg-[var(--surface-sunken)] disabled:opacity-30"
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          onClick={redo}
          disabled={future.length === 0}
          data-testid="design-redo"
          title="Redo (Cmd/Ctrl+Shift+Z)"
          className="inline-flex items-center px-2 py-1.5 rounded-lg hover:bg-[var(--surface-sunken)] disabled:opacity-30"
        >
          <Icon name="redo" size={15} />
        </button>
        <span className="w-px h-5 bg-[var(--edge-soft)] mx-1" />
        <ToolBtn icon="dashboard" label="Templates" active={panel === 'templates'} onClick={() => setPanel((p) => (p === 'templates' ? 'none' : 'templates'))} testid="design-templates-btn" />
        <ToolBtn icon="aspect_ratio" label={size.label} active={panel === 'size'} onClick={() => setPanel((p) => (p === 'size' ? 'none' : 'size'))} testid="design-size-btn" />
        <span className="w-px h-5 bg-[var(--edge-soft)] mx-1" />
        <ToolBtn icon="title" label="Text" onClick={addText} testid="design-add-text" />
        <ToolBtn icon="rectangle" label="Rect" onClick={() => addShape('rect')} testid="design-add-rect" />
        <ToolBtn icon="circle" label="Ellipse" onClick={() => addShape('ellipse')} testid="design-add-ellipse" />
        <ToolBtn icon="change_history" label="Triangle" onClick={() => addShape('triangle')} testid="design-add-triangle" />
        <ToolBtn icon="rounded_corner" label="Round" onClick={() => addShape('roundRect')} testid="design-add-roundrect" />
        <ToolBtn icon="horizontal_rule" label="Line" onClick={addLine} testid="design-add-line" />
        <ToolBtn icon="image" label="Image" onClick={() => void addImageFromFile()} testid="design-add-image" />
        <span className="w-px h-5 bg-[var(--edge-soft)] mx-1" />
        <ToolBtn icon="auto_awesome" label="AI design" active={panel === 'ai'} onClick={() => setPanel((p) => (p === 'ai' ? 'none' : 'ai'))} testid="design-ai-btn" />
        <ToolBtn icon="photo_library" label="Stock" active={panel === 'stock'} onClick={() => setPanel((p) => (p === 'stock' ? 'none' : 'stock'))} testid="design-stock-btn" />
        <ToolBtn icon="badge" label="Logo" onClick={placeLogo} testid="design-add-logo" />
        <ToolBtn icon="palette" label="Brandify" onClick={brandify} testid="design-brandify" />
        <ToolBtn icon="tune" label="Brand kit" onClick={() => setBrandOpen(true)} testid="design-brand-kit-btn" />
        <span className="w-px h-5 bg-[var(--edge-soft)] mx-1" />
        <ToolBtn
          icon="auto_awesome"
          label="Assistant"
          active={aiPanelOpen}
          onClick={() => setAiPanelOpen((v) => !v)}
          testid="design-ai-toggle"
        />
        <div className="relative">
          <ToolBtn icon="download" label="Export" active={exportOpen} onClick={() => setExportOpen((v) => !v)} testid="design-export-btn" />
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
              <div className="absolute left-0 mt-1 z-40 w-36 rounded-lg border border-[var(--edge-soft)] bg-[var(--surface-raised)] shadow-lg p-1" data-testid="design-export-menu">
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => void exportAs(f.id)}
                    data-testid={`design-export-${f.id}`}
                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-[var(--surface-sunken)]"
                  >
                    {f.label}
                  </button>
                ))}
                <div className="my-1 border-t border-[var(--edge-soft)]" />
                <label className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[var(--ink-60)]">
                  <span className="flex-1">Bleed (px)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    data-testid="design-bleed-input"
                    value={design.bleed ?? 0}
                    onChange={(e) => update({ bleed: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    onClick={(e) => e.stopPropagation()}
                    className="w-14 bg-[var(--surface-sunken)] border border-[var(--edge-soft)] rounded px-1 py-0.5 text-[11px] focus:outline-none"
                  />
                </label>
                <button
                  onClick={() => void exportAs('pdf', true)}
                  data-testid="design-export-print"
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-[var(--surface-sunken)]"
                  title="PDF with bleed + crop marks for a print shop"
                >
                  Print PDF (crop marks)
                </button>
                <div className="my-1 border-t border-[var(--edge-soft)]" />
                <button
                  onClick={() => {
                    setExportOpen(false)
                    const issues = checkDesignA11y(design)
                    setStatus(issues.length ? `Accessibility: ${issues[0].message}` : 'Accessibility: no issues found.')
                  }}
                  data-testid="design-a11y-check"
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-[var(--surface-sunken)]"
                  title="Check the design for accessibility issues"
                >
                  Check accessibility
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Panels */}
      {panel === 'templates' && (
        <Panel title="Start from a template">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {templatesForCategory(cat.id).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    data-testid={`design-template-${t.id}`}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--edge-soft)] hover:border-accent hover:bg-accent/5 text-[12px]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      )}
      {panel === 'size' && (
        <Panel title="Canvas size">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {DESIGN_SIZES.filter((s) => s.category === cat.id).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => changeSize(s)}
                    data-testid={`design-size-${s.id}`}
                    className="px-2.5 py-1.5 rounded-lg border border-[var(--edge-soft)] hover:border-accent hover:bg-accent/5 text-[12px]"
                  >
                    {s.label} <span className="text-[var(--ink-40)]">{s.w}×{s.h}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>
      )}
      {panel === 'ai' && (
        <Panel title="Generate with AI">
          <div className="space-y-2">
            <div>
              <div className="text-[11px] text-[var(--ink-50)] mb-1">Describe the design — AI writes on-brand copy and lays it out. Generate variations to pick from a set of on-brand options.</div>
              <div className="flex gap-1.5">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. a launch announcement for our new pricing"
                  data-testid="design-ai-prompt"
                  onKeyDown={(e) => e.key === 'Enter' && void generateVariations()}
                  className="flex-1 rounded-lg border border-[var(--edge-firm)] bg-transparent px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button onClick={() => void generateVariations()} disabled={!!busy} data-testid="design-ai-variations" className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50">
                  Variations
                </button>
                <button onClick={() => void generateDesign()} disabled={!!busy} data-testid="design-ai-go" className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--edge-firm)] hover:border-accent disabled:opacity-50">
                  One
                </button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--ink-50)] mb-1">Generate an image to place on the canvas (OpenAI gpt-image-1).</div>
              <div className="flex gap-1.5">
                <input
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  placeholder="e.g. a minimal abstract gradient background"
                  data-testid="design-image-prompt"
                  onKeyDown={(e) => e.key === 'Enter' && void generateImage()}
                  className="flex-1 rounded-lg border border-[var(--edge-firm)] bg-transparent px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button onClick={() => void generateImage()} disabled={!!busy} data-testid="design-image-go" className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--edge-firm)] hover:border-accent disabled:opacity-50">
                  Image
                </button>
              </div>
            </div>
          </div>
        </Panel>
      )}
      {panel === 'stock' && (
        <Panel title="Stock photos">
          <div className="flex gap-1.5 mb-2">
            <input
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              placeholder="Search free photos (e.g. mountains, office, coffee)"
              data-testid="design-stock-query"
              onKeyDown={(e) => e.key === 'Enter' && void searchStock()}
              className="flex-1 rounded-lg border border-[var(--edge-firm)] bg-transparent px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent"
            />
            <button onClick={() => void searchStock()} disabled={!!busy} data-testid="design-stock-go" className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50">
              Search
            </button>
          </div>
          {stockResults.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-auto" data-testid="design-stock-results">
              {stockResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => void insertStock(p)}
                  title={p.alt || `Photo by ${p.photographer}`}
                  className="aspect-square rounded-md overflow-hidden border border-[var(--edge-soft)] hover:border-accent"
                >
                  <img src={p.thumb} alt={p.alt} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--ink-40)] mt-1.5">Photos from Pexels. A free Pexels API key (Settings → API Keys) enables search.</p>
        </Panel>
      )}

      {(busy || status) && (
        <div className="px-3 py-1.5 text-[12px] text-[var(--ink-50)] flex items-center gap-1.5" data-testid="design-status">
          {busy && <Icon name="autorenew" size={13} className="animate-spin" />}
          <span>{busy ?? status}</span>
          {status && !busy && (
            <button onClick={() => setStatus(null)} className="text-[var(--ink-40)] hover:text-[var(--ink-70)]">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}

      {/* Canvas + inspector */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col">
        <div ref={wrapRef} className="flex-1 min-w-0 overflow-auto bg-stone-200/50 dark:bg-black/30 flex items-start justify-center p-6">
          <SlideCanvas
            slide={{ id: 'design', notes: '', elements: design.elements, background: design.background, schemaVersion: 2 }}
            theme={NEUTRAL_THEME}
            width={canvasW}
            logicalW={design.width}
            logicalH={design.height}
            selectedIds={selectedIds}
            onSelect={(id, additive) => setSelectedIds(id == null ? [] : additive ? [...new Set([...selectedIds, id])] : [id])}
            onSelectMany={setSelectedIds}
            onUpdateElement={(id, patch) => mutate((s) => updateElement(s, id, patch))}
            onMoveMany={(ids, dx, dy) => mutate((s) => moveElementsBy(s, ids, dx, dy))}
            onSetText={(id, text) =>
              mutate((s) => {
                const e = (s.elements ?? []).find((x) => x.id === id)
                return e && e.type === 'text' ? updateElement(s, id, setElementText(e, text)) : s
              })
            }
          />
        </div>
        {/* Page rail — switch, add, delete pages of a multi-page document. */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--edge-soft)] bg-[var(--surface-sunken)]/60 overflow-x-auto" data-testid="design-page-rail">
          {pages.map((pg, i) => (
            <div key={pg.id} className="relative group/pg shrink-0">
              <button
                onClick={() => goToPage(i)}
                data-testid={`design-page-${i}`}
                className={`h-7 min-w-7 px-2 rounded text-[12px] border ${
                  i === activePage ? 'border-accent bg-accent/10 text-accent font-medium' : 'border-[var(--edge-soft)] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)]'
                }`}
                title={`Page ${i + 1}`}
              >
                {i + 1}
              </button>
              {pages.length > 1 && (
                <button
                  onClick={() => deletePage(i)}
                  data-testid={`design-page-delete-${i}`}
                  className="absolute -top-1 -right-1 hidden group-hover/pg:flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--edge-firm)] text-[var(--ink-50)] hover:text-rose-500"
                  title={`Delete page ${i + 1}`}
                >
                  <Icon name="close" size={9} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addPage}
            data-testid="design-page-add"
            className="h-7 px-2 rounded text-[12px] text-[var(--ink-60)] hover:bg-[var(--surface-sunken)] inline-flex items-center gap-1"
            title="Add a page"
          >
            <Icon name="add" size={14} /> Page
          </button>
        </div>
        </div>

        {selected && (
          <div className="w-56 shrink-0 border-l border-[var(--edge-soft)] p-3 overflow-auto text-[12px]" data-testid="design-inspector">
            <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-2">{selected.type}</div>
            {selected.type === 'shape' && (
              <Field label="Fill">
                <ColorInput
                  value={selected.fill?.color ?? '#000000'}
                  onChange={(c) => mutate((s) => updateElement(s, selected.id, { fill: { type: 'solid', color: c } }))}
                  testid="design-fill-color"
                />
              </Field>
            )}
            {selected.type === 'image' && (
              <Field label="Alt text">
                <input
                  value={selected.alt ?? ''}
                  data-testid="design-alt"
                  placeholder="Describe the image"
                  onChange={(e) => mutate((s) => updateElement(s, selected.id, { alt: e.target.value }))}
                  className="w-full rounded border border-[var(--edge-firm)] bg-transparent px-1.5 py-1"
                />
              </Field>
            )}
            {selected.type === 'text' && (
              <>
                <Field label="Font">
                  <select
                    value={familyLabel(selected.fontFamily)}
                    data-testid="design-font-family"
                    onChange={(e) => {
                      const fam = e.target.value
                      loadGoogleFont(fam)
                      mutate((s) => updateElement(s, selected.id, { fontFamily: fontFamilyValue(fam) }))
                    }}
                    className="w-full rounded border border-[var(--edge-firm)] bg-transparent px-1.5 py-1"
                    style={{ fontFamily: selected.fontFamily }}
                  >
                    {!GOOGLE_FONTS.includes(familyLabel(selected.fontFamily)) && familyLabel(selected.fontFamily) !== 'Default' && (
                      <option value={familyLabel(selected.fontFamily)}>{familyLabel(selected.fontFamily)}</option>
                    )}
                    {GOOGLE_FONTS.map((fam) => (
                      <option key={fam} value={fam} style={{ fontFamily: `"${fam}", sans-serif` }}>
                        {fam}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Text color">
                  <ColorInput
                    value={selected.paragraphs[0]?.runs[0]?.color ?? '#1c1917'}
                    onChange={(c) =>
                      mutate((s) => updateElement(s, selected.id, {
                        paragraphs: selected.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, color: c })) }))
                      }))
                    }
                    testid="design-text-color"
                  />
                </Field>
                <Field label="Alignment">
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => mutate((s) => updateElement(s, selected.id, { paragraphs: selected.paragraphs.map((p) => ({ ...p, align: a })) }))}
                        data-testid={`design-align-text-${a}`}
                        className={`flex-1 px-2 py-1 rounded border text-[11px] ${
                          (selected.paragraphs[0]?.align ?? 'left') === a ? 'border-accent text-accent' : 'border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]'
                        }`}
                      >
                        <Icon name={`format_align_${a}`} size={13} />
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Style">
                  <div className="flex gap-1">
                    <button
                      onClick={() => mutate((s) => updateElement(s, selected.id, { paragraphs: selected.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, bold: !r.bold })) })) }))}
                      data-testid="design-bold"
                      className={`flex-1 px-2 py-1 rounded border text-[12px] font-bold ${selected.paragraphs[0]?.runs[0]?.bold ? 'border-accent text-accent' : 'border-[var(--edge-firm)]'}`}
                    >
                      B
                    </button>
                    <button
                      onClick={() => mutate((s) => updateElement(s, selected.id, { paragraphs: selected.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, italic: !r.italic })) })) }))}
                      className={`flex-1 px-2 py-1 rounded border text-[12px] italic ${selected.paragraphs[0]?.runs[0]?.italic ? 'border-accent text-accent' : 'border-[var(--edge-firm)]'}`}
                    >
                      I
                    </button>
                    <button
                      onClick={() => mutate((s) => updateElement(s, selected.id, { paragraphs: selected.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, underline: !r.underline })) })) }))}
                      className={`flex-1 px-2 py-1 rounded border text-[12px] underline ${selected.paragraphs[0]?.runs[0]?.underline ? 'border-accent text-accent' : 'border-[var(--edge-firm)]'}`}
                    >
                      U
                    </button>
                  </div>
                </Field>
                <Field label="Font size">
                  <input
                    type="number"
                    min={6}
                    value={selected.paragraphs[0]?.runs[0]?.fontSize ?? 24}
                    data-testid="design-font-size"
                    onChange={(e) => {
                      const fs = Math.max(6, Math.round(Number(e.target.value) || 24))
                      mutate((s) => updateElement(s, selected.id, {
                        paragraphs: selected.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, fontSize: fs })) }))
                      }))
                    }}
                    className="w-full rounded border border-[var(--edge-firm)] bg-transparent px-1.5 py-1"
                  />
                </Field>
              </>
            )}
            {selected.type === 'image' && (
              <button
                onClick={() => void removeBgSelected()}
                disabled={!!busy}
                data-testid="design-remove-bg"
                className="w-full mb-2 px-2 py-1.5 rounded-lg border border-[var(--edge-firm)] text-[12px] hover:border-accent disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="auto_awesome" size={14} /> Remove background
              </button>
            )}
            <Field label={`Opacity ${Math.round((selected.opacity ?? 1) * 100)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((selected.opacity ?? 1) * 100)}
                data-testid="design-opacity"
                onChange={(e) => mutate((s) => updateElement(s, selected.id, { opacity: Math.max(0, Math.min(1, Number(e.target.value) / 100)) }))}
                className="w-full accent-accent"
              />
            </Field>
            <Field label="Rotation (deg)">
              <input
                type="number"
                value={Math.round(selected.rotation ?? 0)}
                data-testid="design-rotation"
                onChange={(e) => mutate((s) => updateElement(s, selected.id, { rotation: Math.round(Number(e.target.value) || 0) }))}
                className="w-full rounded border border-[var(--edge-firm)] bg-transparent px-1.5 py-1"
              />
            </Field>

            {selectedIds.length > 1 && (
              <div className="mt-2 pt-2 border-t border-[var(--edge-soft)]" data-testid="design-arrange">
                <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1.5">Arrange {selectedIds.length}</div>
                <div className="grid grid-cols-6 gap-1">
                  {([
                    ['left', 'align_horizontal_left'],
                    ['hcenter', 'align_horizontal_center'],
                    ['right', 'align_horizontal_right'],
                    ['top', 'align_vertical_top'],
                    ['vcenter', 'align_vertical_center'],
                    ['bottom', 'align_vertical_bottom']
                  ] as [AlignEdge, string][]).map(([edge, icon]) => (
                    <button key={edge} onClick={() => align(edge)} data-testid={`design-align-${edge}`} title={`Align ${edge}`} className="px-1.5 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]">
                      <Icon name={icon} size={13} />
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 mt-1.5">
                  <button onClick={() => distribute('h')} disabled={selectedIds.length < 3} className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] text-[11px] hover:bg-[var(--surface-sunken)] disabled:opacity-40">
                    Distribute H
                  </button>
                  <button onClick={() => distribute('v')} disabled={selectedIds.length < 3} className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] text-[11px] hover:bg-[var(--surface-sunken)] disabled:opacity-40">
                    Distribute V
                  </button>
                </div>
                <div className="flex gap-1 mt-1.5">
                  <button onClick={group} data-testid="design-group" className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] text-[11px] hover:bg-[var(--surface-sunken)]">
                    Group
                  </button>
                  <button onClick={ungroup} className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] text-[11px] hover:bg-[var(--surface-sunken)]">
                    Ungroup
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-1 mt-3">
              <button onClick={() => mutate((s) => reorderZ(s, selected.id, 'forward'))} className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]" title="Bring forward">
                <Icon name="flip_to_front" size={14} />
              </button>
              <button onClick={() => mutate((s) => reorderZ(s, selected.id, 'back'))} className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]" title="Send back">
                <Icon name="flip_to_back" size={14} />
              </button>
              <button onClick={duplicateSelected} data-testid="design-duplicate" className="flex-1 px-2 py-1 rounded border border-[var(--edge-firm)] hover:bg-[var(--surface-sunken)]" title="Duplicate (Cmd/Ctrl+D)">
                <Icon name="content_copy" size={14} />
              </button>
              <button
                onClick={deleteSelected}
                data-testid="design-delete-element"
                className="flex-1 px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                title="Delete (Del)"
              >
                <Icon name="delete" size={14} />
              </button>
            </div>
          </div>
        )}

        {!selected && (
          <div className="w-56 shrink-0 border-l border-[var(--edge-soft)] p-3 text-[12px]" data-testid="design-canvas-inspector">
            <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-2">Canvas</div>
            <Field label="Background">
              <ColorInput
                value={design.background?.type === 'solid' ? design.background.color ?? '#ffffff' : '#ffffff'}
                onChange={(c) => update({ background: { type: 'solid', color: c } })}
                testid="design-bg-color"
              />
            </Field>
            <p className="text-[11px] text-[var(--ink-40)] mt-2">Select an element to edit it, or use the toolbar to add one.</p>
          </div>
        )}

        {aiPanelOpen && (
          <DesignAiPanel
            selectedText={selectedTextValue}
            onApplyText={applyAiText}
            onInsertText={insertAiText}
            userName={userName}
            onCollapse={() => setAiPanelOpen(false)}
          />
        )}
      </div>

      {brandOpen && <BrandKitModal onClose={() => setBrandOpen(false)} />}

      {widgetPickerOpen && (
        <WidgetPickerDialog
          onPick={(widgetId) => {
            setWidgetPickerOpen(false)
            addWidget(widgetId)
          }}
          onClose={() => setWidgetPickerOpen(false)}
        />
      )}

      {variations.length > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6" onClick={() => setVariations([])} data-testid="design-variations-modal">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-auto rounded-2xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="auto_awesome" size={18} className="text-accent" />
              <h2 className="text-[15px] font-semibold text-[var(--ink-100)]">Pick a design</h2>
              <span className="text-[12px] text-[var(--ink-40)]">{variations.length} on-brand options</span>
              <button onClick={() => setVariations([])} className="ml-auto text-[var(--ink-40)] hover:text-[var(--ink-70)]">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {variations.map((v, i) => (
                <button
                  key={i}
                  onClick={() => applyVariation(v)}
                  data-testid={`design-variation-${i}`}
                  className="rounded-lg overflow-hidden border border-[var(--edge-soft)] hover:border-accent hover:ring-2 hover:ring-accent/30 transition"
                  title="Use this design"
                >
                  <DesignThumb design={v} width={232} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// A small, faithful, non-interactive render of a design, used in the variations
// picker. Reuses SlideElementView (the same renderer as the canvas) scaled down.
function DesignThumb({ design, width }: { design: DesignBody; width: number }): JSX.Element {
  const scale = width / design.width
  const height = width * (design.height / design.width)
  const bg = design.background?.type === 'solid' ? design.background.color ?? '#ffffff' : '#ffffff'
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', background: bg }}>
      <div style={{ width: design.width, height: design.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        {design.elements
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((el) => (
            <SlideElementView key={el.id} el={el} />
          ))}
      </div>
    </div>
  )
}

function ToolBtn({ icon, label, onClick, active, testid }: { icon: string; label: string; onClick: () => void; active?: boolean; testid?: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg ${active ? 'bg-accent/10 text-accent' : 'hover:bg-[var(--surface-sunken)]'}`}
    >
      <Icon name={icon} size={15} /> <span>{label}</span>
    </button>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-3 py-2.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]">
      <div className="text-[11px] font-medium text-[var(--ink-70)] mb-1.5">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block mb-2">
      <span className="text-[11px] text-[var(--ink-50)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function ColorInput({ value, onChange, testid }: { value: string; onChange: (c: string) => void; testid?: string }): JSX.Element {
  return (
    <input
      type="color"
      value={value.startsWith('#') ? value : '#000000'}
      data-testid={testid}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-7 rounded border border-[var(--edge-firm)] bg-transparent cursor-pointer"
    />
  )
}
