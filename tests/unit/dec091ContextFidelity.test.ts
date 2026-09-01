import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browserMarkUrl } from '../../src/renderer/src/lib/attentionPresets'
import { useNoticeStore } from '../../src/renderer/src/stores/notice'

// ── DEC-091 — Phase 3 of the demo-feedback plan: context fidelity ───────────
// (#7)  A mark made on a browser widget freezes the page URL onto the item
//       (source_url — schema'd since DEC-052, written by NOTHING until now),
//       and the queue/editor deep-link back to the exact page.
// (#14) AI-created documents raise the house notice with an Open door
//       instead of landing behind the front window.
// (#11) Mail: the first Send ARMS (recipients stated in full), the second
//       sends; success raises a "Sent to …" notice instead of a silent
//       vanish.

describe('DEC-091(#7) — browserMarkUrl: only a browser and only a real URL', () => {
  it('a browser widget at an http(s) page freezes that URL', () => {
    expect(browserMarkUrl('webview', 'https://app.slack.com/client/T1/C2')).toBe(
      'https://app.slack.com/client/T1/C2'
    )
    expect(browserMarkUrl('browser', 'http://x.test/a')).toBe('http://x.test/a')
  })
  it('everything else is not a place', () => {
    expect(browserMarkUrl('note', 'https://x.test')).toBeNull()
    expect(browserMarkUrl('webview', 'about:blank')).toBeNull()
    expect(browserMarkUrl('webview', '')).toBeNull()
    expect(browserMarkUrl('sticky', 'buy milk')).toBeNull()
  })
})

describe('DEC-091 — the notice store: assert a fact, offer a door, leave', () => {
  afterEach(() => {
    useNoticeStore.getState().clear()
    vi.useRealTimers()
  })
  it('shows, replaces, and auto-clears after its ttl', () => {
    vi.useFakeTimers()
    useNoticeStore.getState().show({ text: 'one' })
    expect(useNoticeStore.getState().notice?.text).toBe('one')
    useNoticeStore.getState().show({ text: 'two' }, 1000)
    expect(useNoticeStore.getState().notice?.text).toBe('two')
    vi.advanceTimersByTime(1100)
    expect(useNoticeStore.getState().notice).toBeNull()
  })
  it('clear is immediate', () => {
    useNoticeStore.getState().show({ text: 'x' })
    useNoticeStore.getState().clear()
    expect(useNoticeStore.getState().notice).toBeNull()
  })
})

const SRC = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('DEC-091(#7) — source_url flows mark → item → deep link', () => {
  it('both mark dispatchers freeze the URL', () => {
    expect(read('renderer/src/components/widgets/WidgetFrame.tsx')).toContain(
      'sourceUrl: browserMarkUrl(widget.kind, widget.content)'
    )
    const menu = read('renderer/src/lib/contextMenu/universal.ts')
    expect(menu).toContain('browserMarkUrl(w.kind, w.content)')
    expect(menu.split('openMark(').length - 1).toBeGreaterThanOrEqual(3)
  })
  it('the confirm card writes it onto the item', () => {
    expect(read('renderer/src/components/AttentionConfirmCard.tsx')).toContain(
      'sourceUrl: source?.sourceUrl ?? null'
    )
  })
  it('the draft type carries it end to end', () => {
    expect(read('preload/index.ts')).toContain('sourceUrl?: string | null')
    expect(read('renderer/src/stores/workItems.ts')).toContain('sourceUrl?: string | null')
  })
  it('the queue and the editor both open the exact page', () => {
    expect(read('renderer/src/components/views/AttentionView.tsx')).toContain(
      'window.api.files.openExternal(i.sourceUrl!)'
    )
    const ed = read('renderer/src/components/AttentionItemEditor.tsx')
    expect(ed).toContain('data-testid="item-source-link"')
    expect(ed).toContain('window.api.files.openExternal(item.sourceUrl!)')
  })
})

describe('DEC-091(#14) — created documents announce themselves', () => {
  const ex = read('renderer/src/lib/actionExecutor.ts')
  it('one helper, four success sites (create, fill, files, desk)', () => {
    expect(ex).toContain('function noticeDocReady(')
    expect(ex.split('noticeDocReady(').length - 1).toBeGreaterThanOrEqual(5) // def + 4 calls
    expect(ex).toContain("action: { label: 'Open', run: () => useViewStore.getState().goDocument(docId) }")
  })
})

describe('DEC-091(#11) — mail: the recipient stop and the sent fact', () => {
  const cd = read('renderer/src/components/ComposeDialog.tsx')
  it('first Send arms; the strip names every recipient; the second sends', () => {
    expect(cd).toContain('const [armed, setArmed] = useState(false)')
    expect(cd).toContain('data-testid="send-confirm-strip"')
    expect(cd).toContain("armed ? 'Confirm send' : 'Send'")
  })
  it('editing any field disarms the confirm', () => {
    expect(cd.split('disarm();').length - 1).toBe(5) // to, cc, bcc, subject, body
  })
  it('success states the fact; failure says nothing left the mailbox', () => {
    expect(cd).toContain('Sent to ${toList.join(')
    expect(cd).toContain('Sending failed — nothing left your mailbox.')
  })
})

describe('DEC-091 — the toast is mounted and yields to the completion offer', () => {
  it('App hosts it; it steps above CompletionToast when both are up', () => {
    expect(read('renderer/src/App.tsx')).toContain('<NoticeToast />')
    const nt = read('renderer/src/components/NoticeToast.tsx')
    expect(nt).toContain("completionUp ? 'bottom-[86px]' : 'bottom-5'")
    expect(nt).toContain('data-testid="notice-toast"')
  })
})
