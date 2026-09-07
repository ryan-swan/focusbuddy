// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── DEC-119 — the Message door opens the composer's twin; Meet's embedded
// dashboard loses its Customize row so the tiles start level with the rail.
// Operator (2026-09-06): "Now do the same for the Message button. Also, get
// rid of the customize button on the PlexiiMeet page and shift things
// upwards so the top row is in line with the top of the left column."

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, 'src', p), 'utf-8')
const dialog = read('renderer/src/components/MessageDialog.tsx')
const composer = read('renderer/src/components/BookTimeDialog.tsx')
const meet = read('renderer/src/components/views/PlexiMeetView.tsx')
const dash = read('renderer/src/components/ModuleDashboard.tsx')

describe('DEC-119 — twins: the message dialog wears the composer\'s own strings', () => {
  const SHARED = [
    'relative grid grid-cols-2 rounded-full bg-[var(--surface-sunken)] p-1 select-none',
    'absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-[0_1px_4px_rgba(0,0,0,0.08)]',
    'w-full bg-transparent text-[23px] font-semibold text-[var(--ink-100)] placeholder:text-[var(--ink-50)] outline-none [&:focus-visible]:outline-none border-b border-[var(--edge-soft)] focus:border-[rgb(var(--accent))] pb-1.5 transition-colors',
    "'h-9 px-3 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] text-[13px] font-medium ' +",
    'min-h-10 px-2 py-1.5 rounded-[var(--radius-field)] bg-[var(--surface-sunken)] flex flex-wrap items-center gap-1.5 cursor-text',
    'inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--edge-soft)] text-[12.5px] text-[var(--ink-90)]',
    'absolute left-0 right-0 top-full mt-1 z-20 rounded-[var(--radius-row)] fb-glass-panel fb-pop-in p-1',
    'to discard',
    'className="btn-primary ml-auto"',
    'rounded bg-white/20 px-1 text-[11px] leading-4',
    'fb-card w-full max-w-[560px] overflow-hidden max-h-[86vh] flex flex-col shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]',
    'px-6 pt-5 pb-5 flex flex-col gap-4 overflow-y-auto',
    'px-6 py-4 border-t border-[var(--edge-soft)] flex items-center gap-3 shrink-0'
  ]
  it.each(SHARED)('%s', (s) => {
    expect(composer).toContain(s)
    expect(dialog).toContain(s)
  })

  it('the slider is the one real choice — video or voice; the text is sent with the recording', () => {
    expect(dialog).toContain("['video', 'videocam', 'Video message'],")
    expect(dialog).toContain("['voice', 'mic', 'Voice message']")
    expect(dialog).toContain('Leave blank and only the recording is sent')
    expect(dialog).toContain('Until you stop')
    expect(dialog).not.toContain('Focus time')
  })

  it('TO is one teammate from live presence — a DM needs an account; the honest empty line survives', () => {
    expect(dialog).toContain('data-testid="message-to-input"')
    expect(dialog).toContain("peers.length === 0 ? 'No teammates online right now.' : 'A teammate'")
    expect(dialog).toContain("setError('Pick a teammate to send it to.')")
    expect(dialog).toContain('data-testid={`message-peer-${p.accountId}`}')
    expect(dialog).toContain('sent as a direct message in')
  })

  it('the keyboard map: Esc discards, Enter starts, Cmd+M flips; TO guards Enter', () => {
    expect(dialog).toContain("if (e.key === 'Escape') {")
    expect(dialog).toContain("if ((e.metaKey || e.ctrlKey) && (e.key === 'm' || e.key === 'M')) {")
    expect(dialog).toContain('function onToKeyDown(')
  })
})

describe('DEC-119 — Meet\'s message flow behind the twin', () => {
  it('the door opens the dialog; while recording it is the Stop & send button; the popover is gone', () => {
    expect(meet).toContain("onClick={() => setMessageDialog(true)}")
    expect(meet).toContain('data-testid="meet-message"')
    expect(meet).toContain('data-testid="meet-message-stop"')
    expect(meet).toContain('Stop &amp; send to {personDisplayName(msgTo, msgTo.handle)}')
    expect(meet).not.toContain('meet-message-picker')
    expect(meet).not.toContain('showMsg')
  })

  it('the kind sets the capture, the text rides the DM, the sent note lands beside busy / error', () => {
    expect(meet).toContain('async function recordMessageTo(peer: PresencePeer, opts: { text: string; video: boolean }): Promise<boolean> {')
    expect(meet).toContain('getUserMedia({ audio: true, video: opts.video })')
    expect(meet).toContain('if (!opts.video) return false')
    expect(meet).toContain('sendMessage(token, conversationId, opts.text, {')
    expect(meet).toContain("onStart={(d) => recordMessageTo(d.to, { text: d.text, video: d.video })}")
    expect(meet).toContain('data-testid="meet-message-note"')
    expect(meet).toContain('(busy || error || msgNote) && (')
  })
})

describe('DEC-119 — the embedded dashboard has no Customize row; the tiles start level with the rail', () => {
  it('the header row (title, Customize, actions) renders only when NOT embedded', () => {
    expect(dash).toContain('{!embedded && (')
    expect(dash).toContain("embedded ? '' : 'mt-5 '")
    expect(dash).toContain("embedded ? 'w-full' : 'w-full px-8 py-6'")
    expect(meet).toContain('            embedded\n')
  })
})
