// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── DEC-120 — the assistant's header, first. Operator (2026-09-06): the tab
// row (Today / Chat / Agent / Tasks / Activity / Work) goes BELOW the
// wordmark row; that row is, from the right, Minimize · Display mode · What
// was I doing? · New chat; Body double and Your conversations leave the bar;
// "Plexii / your workspace" becomes the sidebar's own animated wordmark.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf-8')
const header = read('renderer/src/components/assistant/AssistantHeader.tsx')
const overlay = read('renderer/src/components/assistant/AssistantOverlay.tsx')
const panel = read('renderer/src/components/ChatPanel.tsx')
const store = read('renderer/src/stores/chat.ts')
const sidebar = read('renderer/src/components/Sidebar.tsx')

describe('DEC-120 — the header is the first row; the tabs sit under it', () => {
  it('the overlay mounts AssistantHeader BEFORE the tab strip', () => {
    expect(overlay).toContain('<AssistantHeader chrome />')
    expect(overlay.indexOf('<AssistantHeader chrome />')).toBeLessThan(overlay.indexOf('data-testid="assistant-tabs"'))
    expect(overlay).toContain('<ChatPanel />')
    expect(overlay).not.toContain('onCollapse')
  })

  it('the wordmark is the desk sidebar\'s own mark — same component, same motion', () => {
    expect(sidebar).toContain('<PlexiiLogo height={22} />')
    expect(header).toContain("import PlexiiLogo from '../PlexiiLogo'")
    expect(header).toContain('<PlexiiLogo height={20} />')
    // the old two-line title is gone from the MARKUP (the comment may still name it)
    expect(header).not.toContain('>Plexii</h2>')
    expect(header).not.toContain('fb-t-title')
  })

  it('from the right: Minimize · Display mode · What was I doing? · New chat — and nothing else', () => {
    const order = ['assistant-new-chat', 'assistant-recap', 'assistant-mode-toggle', 'assistant-minimize'].map((id) =>
      header.indexOf(`data-testid="${id}"`)
    )
    for (const i of order) expect(i).toBeGreaterThan(-1)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const gone of ['Body double ON', 'title="Your conversations"', 'assistant-history-toggle', 'group_off', 'delete_sweep', 'bodyDouble'])
      expect(header).not.toContain(gone)
    // the chrome doors are the overlay's; the page (hub) wears the bar without them
    expect(header).toContain('{chrome && (')
    expect(panel).toContain('{page && <AssistantHeader chrome={false} />}')
  })

  it('New chat and What was I doing? land on the Chat tab', () => {
    expect(header).toContain("newConversation()\n            setTab('chat')")
    expect(header).toContain("setTab('chat')\n            void recap(activeTaskId)")
    expect(header).toContain("title={recapping ? 'Reading the trail…' : 'What was I doing? — replay the last 30 minutes as a narrative'}")
  })
})

describe('DEC-120 — ChatPanel gave the header up and kept the conversation\'s own context', () => {
  it('no header, no body double, no conversations toggle, no local recap', () => {
    for (const gone of ['useBodyDouble', 'assistant-history-toggle', 'handleWhatWasIDoing', 'MODE_OPTIONS', 'summarizing', 'historyOpen'])
      expect(panel).not.toContain(gone)
    expect(panel).not.toContain('<h2 className="fb-t-title text-[var(--ink-100)]">')
  })

  it('the context strip keeps the focused thread, Discovery, the linked desk and Clear chat', () => {
    expect(panel).toContain('data-testid="chat-context"')
    expect(panel).toContain('(discovering || primaryDeskId || thread.title || messages.length > 0) && (')
    expect(panel).toContain('data-testid="chat-mode-badge"')
    expect(panel).toContain('data-testid="chat-linked-desk"')
    expect(panel).toContain('data-testid="chat-clear"')
  })

  it('"What was I doing?" lives in the chat store — one implementation for the overlay and the hub', () => {
    expect(store).toContain('recapping: boolean')
    expect(store).toContain('recap: (taskId: string | null) => Promise<void>')
    expect(store).toContain('const TRAIL_LOOKBACK_MS = 30 * 60 * 1000')
    expect(store).toContain('window.api.trail.summarize(taskId, Date.now() - TRAIL_LOOKBACK_MS)')
    expect(store).toContain('paste your Anthropic API key to use "What was I doing?"')
  })
})
