// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ASSISTANT_TABS, LEGACY_TAB } from '../../src/renderer/src/stores/assistantChrome'

// ── DEC-121 — the assistant's tabs, rearranged on operator direction:
// Today → Attention (the home Attention widget, uncapped, in the panel);
// Activity → PlexiChat (the Office Chat view, compact, in the panel);
// Agent + Work consolidated (desk agents as a sub-view of Agent).

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf-8')
const overlay = read('renderer/src/components/assistant/AssistantOverlay.tsx')
const store = read('renderer/src/stores/assistantChrome.ts')
const attentionTab = read('renderer/src/components/assistant/tabs/AssistantAttentionTab.tsx')
const messagesTab = read('renderer/src/components/assistant/tabs/AssistantMessagesTab.tsx')
const agentTab = read('renderer/src/components/assistant/tabs/AssistantAgentTab.tsx')
const widgets = read('renderer/src/components/views/attentionWidgets.tsx')
const messages = read('renderer/src/components/views/MessagesView.tsx')

describe('DEC-121 — the tab set', () => {
  it('Attention · Chat · Agent · Tasks · PlexiChat, in that order, in the store and the strip', () => {
    expect(ASSISTANT_TABS).toEqual(['attention', 'chat', 'agent', 'tasks', 'messages'])
    const order = [
      "{ id: 'attention', label: 'Attention', icon: 'notifications' }",
      "{ id: 'chat', label: 'Chat', icon: 'forum' }",
      "{ id: 'agent', label: 'Agent', icon: 'rocket_launch' }",
      "{ id: 'tasks', label: 'Tasks', icon: 'checklist' }",
      "{ id: 'messages', label: 'PlexiChat', icon: 'chat' }"
    ].map((s) => overlay.indexOf(s))
    for (const i of order) expect(i).toBeGreaterThan(-1)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    for (const gone of ["'today'", "'activity'", "'work'", 'StandupHome', 'AssistantActivityTab', 'AssistantWorkTab'])
      expect(overlay).not.toContain(gone)
  })

  it('a tab saved before the change still lands somewhere sensible; the default is Attention', () => {
    expect(LEGACY_TAB).toEqual({ today: 'attention', activity: 'messages', work: 'agent' })
    expect(store).toContain('if (raw && LEGACY_TAB[raw]) return LEGACY_TAB[raw]')
    expect(store).toContain("return 'attention'\n}")
  })

  it('the retired Activity tab is gone; the Work tab survives as the Agent sub-view', () => {
    expect(existsSync(join(ROOT, 'src/renderer/src/components/assistant/tabs/AssistantActivityTab.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'src/renderer/src/components/assistant/tabs/AssistantWorkTab.tsx'))).toBe(true)
  })
})

describe('DEC-121 — Attention IS the home widget', () => {
  it('the tab renders the same AttentionWidget, uncapped and scrolling, under its own remembered section', () => {
    expect(attentionTab).toContain("import { AttentionWidget } from '../../views/attentionWidgets'")
    expect(attentionTab).toContain('<AttentionWidget size="lg" storageKey="attention.assistant.section" limit={Number.POSITIVE_INFINITY} scroll />')
    expect(overlay).toContain("{activeTab === 'attention' && <AssistantAttentionTab />}")
  })
  it('the widget grew limit / scroll additively — the home and desk slices are untouched', () => {
    expect(widgets).toContain("const max = limit ?? (size === 'lg' ? 7 : size === 'md' ? 4 : 2)")
    expect(widgets).toContain("${scroll ? 'overflow-y-auto' : 'overflow-hidden'}")
    expect(widgets).toContain("storageKey = 'attention.widget.section',\n  limit,\n  scroll = false")
  })
})

describe('DEC-121 — PlexiChat IS the Office Chat view', () => {
  it('the tab renders MessagesView compact', () => {
    expect(messagesTab).toContain("import MessagesView from '../../views/MessagesView'")
    expect(messagesTab).toContain('<MessagesView compact />')
    expect(overlay).toContain("{activeTab === 'messages' && <AssistantMessagesTab />}")
  })
  it('compact: one pane at a time, a way back, no paper of its own; the Office page is unchanged by default', () => {
    expect(messages).toContain('export default function MessagesView({ compact = false }: { compact?: boolean } = {}): JSX.Element {')
    expect(messages).toContain("const [compactPane, setCompactPane] = useState<'list' | 'thread'>('thread')")
    expect(messages).toContain('data-testid="messages-back"')
    expect(messages).toContain('data-testid="messages-list-pane"')
    expect(messages).toContain('data-testid="messages-thread-pane"')
    expect(messages).toContain("compact ? 'h-full flex flex-col' : 'h-full flex desk-paper no-tod'")
    // every door into a conversation goes through openConv (the one `void open(`
    // left is the helper itself), so the thread shows whichever way you arrive
    expect(messages.split('void open(').length - 1).toBe(1)
    expect(messages.split('openConv(').length - 1).toBeGreaterThanOrEqual(3)
  })
})

describe('DEC-121 — Agent + Work consolidated', () => {
  it('the Agent tab keeps its autonomous surface and adds Desk agents as a sub-view', () => {
    expect(agentTab).toContain("import AssistantWorkTab from './AssistantWorkTab'")
    expect(agentTab).toContain('data-testid={`agent-subtab-${k}`}')
    expect(agentTab).toContain("['agent', 'rocket_launch', 'Autonomous agent'],")
    expect(agentTab).toContain("['desks', 'smart_toy', 'Desk agents']")
    expect(agentTab).toContain("{sub === 'desks' ? (")
    expect(agentTab).toContain('<AssistantWorkTab />')
    expect(agentTab).toContain('data-testid="agent-run"')
    expect(agentTab).toContain('data-testid="agent-transcript"')
  })
})
