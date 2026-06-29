import { useEffect, useRef, useState } from 'react'
import type { DeckTheme, Slide, SlideElement } from '@shared/types'
import SlideCanvas from './slides/SlideCanvas'
import { addElement, deleteElement, elementId, moveElementsBy, reorderZ, setElementText, updateElement } from './slides/slideOps'
import {
  DESIGN_SIZES,
  DESIGN_TEMPLATES,
  composeDesign,
  designFromTemplate,
  findDesignSize,
  normalizeDesignBody,
  templatesForCategory,
  type DesignBody,
  type DesignCategory,
  type DesignSize
} from '@shared/design'
import { DEFAULT_BRAND_KIT, type OrgBrandKit } from '@shared/brandKit'
import Icon from '../Icon'

// PlexiDesign — the on-platform design studio. A design is a single arbitrary-size
// canvas of the same elements a slide uses, so this editor reuses the proven slide
// canvas (drag, resize, snap guides, marquee) at the design's own size. The studio
// adds the design-specific layer: size presets, brand-aware templates, AI copy and
// AI image generation, brand colors, and per-element styling.

interface Props {
  content: unknown
  title: string
  onChange: (body: unknown) => void
}

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

export default function DesignEditor({ content, onChange }: Props): JSX.Element {
  const [design, setDesign] = useState<DesignBody>(() => normalizeDesignBody(content))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [panel, setPanel] = useState<'none' | 'templates' | 'size' | 'ai'>(
    () => (normalizeDesignBody(content).elements.length === 0 ? 'templates' : 'none')
  )
  const [aiPrompt, setAiPrompt] = useState('')
  const [imgPrompt, setImgPrompt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [canvasW, setCanvasW] = useState(640)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // The org brand kit. The brand store lands with the Brand Kit editor; until a
  // brand is set this is the default brand, exactly like a fresh Canva account.
  const brand: OrgBrandKit = DEFAULT_BRAND_KIT

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

  function update(patch: Partial<DesignBody>): void {
    setDesign((d) => {
      const next = { ...d, ...patch }
      onChange(next)
      return next
    })
  }

  // Run a slide-op against the design's elements/background and persist the result.
  function mutate(fn: (s: Slide) => Slide): void {
    const slide: Slide = { id: 'design', notes: '', elements: design.elements, background: design.background, schemaVersion: 2 }
    const next = fn(slide)
    update({ elements: next.elements ?? [], background: next.background })
  }

  const topZ = design.elements.reduce((m, e) => Math.max(m, e.z), 0)

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

  function addShape(shape: 'rect' | 'ellipse'): void {
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

  async function addImageFromFile(): Promise<void> {
    const res = await window.api.office.pickImage()
    if (res.ok && res.dataUrl) placeImage(res.dataUrl)
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

  async function generateDesign(): Promise<void> {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    setBusy('Designing…')
    setStatus(null)
    try {
      const res = await window.api.design.generateContent({ prompt, designKind: size.label })
      if (res.ok && res.content) {
        const body = composeDesign(size, brand, res.content)
        setDesign(body)
        onChange(body)
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
    setDesign(body)
    onChange(body)
    setSelectedIds([])
    setPanel('none')
  }

  function changeSize(s: DesignSize): void {
    update({ width: s.w, height: s.h, category: s.category })
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

  const selected = design.elements.find((e) => e.id === selectedIds[0]) ?? null

  return (
    <div className="flex flex-col h-full" data-testid="design-editor">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-stone-200 dark:border-stone-700 flex-wrap text-[12px]">
        <ToolBtn icon="dashboard" label="Templates" active={panel === 'templates'} onClick={() => setPanel((p) => (p === 'templates' ? 'none' : 'templates'))} testid="design-templates-btn" />
        <ToolBtn icon="aspect_ratio" label={size.label} active={panel === 'size'} onClick={() => setPanel((p) => (p === 'size' ? 'none' : 'size'))} testid="design-size-btn" />
        <span className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
        <ToolBtn icon="title" label="Text" onClick={addText} testid="design-add-text" />
        <ToolBtn icon="rectangle" label="Rect" onClick={() => addShape('rect')} testid="design-add-rect" />
        <ToolBtn icon="circle" label="Ellipse" onClick={() => addShape('ellipse')} testid="design-add-ellipse" />
        <ToolBtn icon="image" label="Image" onClick={() => void addImageFromFile()} testid="design-add-image" />
        <span className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
        <ToolBtn icon="auto_awesome" label="AI design" active={panel === 'ai'} onClick={() => setPanel((p) => (p === 'ai' ? 'none' : 'ai'))} testid="design-ai-btn" />
        <ToolBtn icon="palette" label="Brandify" onClick={brandify} testid="design-brandify" />
      </div>

      {/* Panels */}
      {panel === 'templates' && (
        <Panel title="Start from a template">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="mb-2">
              <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {templatesForCategory(cat.id).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    data-testid={`design-template-${t.id}`}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-accent hover:bg-accent/5 text-[12px]"
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
              <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {DESIGN_SIZES.filter((s) => s.category === cat.id).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => changeSize(s)}
                    data-testid={`design-size-${s.id}`}
                    className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-accent hover:bg-accent/5 text-[12px]"
                  >
                    {s.label} <span className="text-stone-400">{s.w}×{s.h}</span>
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
              <div className="text-[11px] text-stone-500 mb-1">Describe the design — AI writes on-brand copy and lays it out.</div>
              <div className="flex gap-1.5">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. a launch announcement for our new pricing"
                  data-testid="design-ai-prompt"
                  onKeyDown={(e) => e.key === 'Enter' && void generateDesign()}
                  className="flex-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-transparent px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button onClick={() => void generateDesign()} disabled={!!busy} data-testid="design-ai-go" className="btn-primary text-[12px] px-3 py-1.5 disabled:opacity-50">
                  Generate
                </button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-stone-500 mb-1">Generate an image to place on the canvas (OpenAI gpt-image-1).</div>
              <div className="flex gap-1.5">
                <input
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  placeholder="e.g. a minimal abstract gradient background"
                  data-testid="design-image-prompt"
                  onKeyDown={(e) => e.key === 'Enter' && void generateImage()}
                  className="flex-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-transparent px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-accent"
                />
                <button onClick={() => void generateImage()} disabled={!!busy} data-testid="design-image-go" className="text-[12px] px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 hover:border-accent disabled:opacity-50">
                  Image
                </button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {(busy || status) && (
        <div className="px-3 py-1.5 text-[12px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5" data-testid="design-status">
          {busy && <Icon name="autorenew" size={13} className="animate-spin" />}
          <span>{busy ?? status}</span>
          {status && !busy && (
            <button onClick={() => setStatus(null)} className="text-stone-400 hover:text-stone-600">
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      )}

      {/* Canvas + inspector */}
      <div className="flex-1 min-h-0 flex">
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

        {selected && (
          <div className="w-56 shrink-0 border-l border-stone-200 dark:border-stone-700 p-3 overflow-auto text-[12px]" data-testid="design-inspector">
            <div className="text-[10px] uppercase tracking-wide text-stone-400 mb-2">{selected.type}</div>
            {selected.type === 'shape' && (
              <Field label="Fill">
                <ColorInput
                  value={selected.fill?.color ?? '#000000'}
                  onChange={(c) => mutate((s) => updateElement(s, selected.id, { fill: { type: 'solid', color: c } }))}
                  testid="design-fill-color"
                />
              </Field>
            )}
            {selected.type === 'text' && (
              <>
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
                    className="w-full rounded border border-stone-300 dark:border-stone-600 bg-transparent px-1.5 py-1"
                  />
                </Field>
              </>
            )}
            <div className="flex gap-1 mt-3">
              <button onClick={() => mutate((s) => reorderZ(s, selected.id, 'forward'))} className="flex-1 px-2 py-1 rounded border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800" title="Bring forward">
                <Icon name="flip_to_front" size={14} />
              </button>
              <button onClick={() => mutate((s) => reorderZ(s, selected.id, 'back'))} className="flex-1 px-2 py-1 rounded border border-stone-300 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800" title="Send back">
                <Icon name="flip_to_back" size={14} />
              </button>
              <button
                onClick={() => {
                  mutate((s) => deleteElement(s, selected.id))
                  setSelectedIds([])
                }}
                data-testid="design-delete-element"
                className="flex-1 px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                title="Delete"
              >
                <Icon name="delete" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolBtn({ icon, label, onClick, active, testid }: { icon: string; label: string; onClick: () => void; active?: boolean; testid?: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg ${active ? 'bg-accent/10 text-accent' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}
    >
      <Icon name={icon} size={15} /> <span>{label}</span>
    </button>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-3 py-2.5 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50">
      <div className="text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1.5">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block mb-2">
      <span className="text-[11px] text-stone-500">{label}</span>
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
      className="w-full h-7 rounded border border-stone-300 dark:border-stone-600 bg-transparent cursor-pointer"
    />
  )
}
