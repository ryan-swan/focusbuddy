import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchApp, waitForReady } from './_helpers'
import { startFakeClaude } from './_fakeClaude'

// A3 build 1 — the voice pipeline health probe (Caleb: "kind of busted").
// Drives the REAL engine with no microphone and no keys:
//   1. macOS `say` synthesises the gate phrase as genuine speech audio; the
//      page decodes it with AudioContext (the renderer's real decode path)
//      and ships Float32Array samples over the real IPC to the real local
//      Whisper (provider = 'local', Caleb's actual preference; model cache
//      pre-seeded from the live profile so nothing downloads).
//   2. The transcript runs the real voiceCommand streaming path against the
//      fake Claude, which answers with a webview create-widget envelope —
//      the deploy-a-browser-by-voice action the A3 gate demands.
// Throwaway; delete when A3 closes.
const OUT = process.env.SHOT_DIR ?? '/tmp'
const GATE_PHRASE = 'open a tie the knot site for this wedding'

test('voice engine: real speech through local Whisper, transcript through the command stream', async () => {
  test.setTimeout(240_000)

  // ── Synthesize the gate phrase as real speech, 16kHz mono WAV ──
  const audioDir = mkdtempSync(join(tmpdir(), 'plexii-voice-'))
  const aiff = join(audioDir, 'gate.aiff')
  const wav = join(audioDir, 'gate.wav')
  execFileSync('say', ['-o', aiff, GATE_PHRASE])
  execFileSync('afconvert', [aiff, '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', wav])
  const wavB64 = readFileSync(wav).toString('base64')

  // ── Pre-seed the whisper model cache from the live profile (42MB, APFS
  // clone) so the local provider loads instantly instead of downloading. ──
  const userDataDir = mkdtempSync(join(tmpdir(), 'focusbuddy-e2e-voice-'))
  const liveCache = join(
    process.env.HOME ?? '',
    'Library/Application Support/focusbuddy/whisper-cache'
  )
  if (existsSync(liveCache)) {
    cpSync(liveCache, join(userDataDir, 'whisper-cache'), { recursive: true })
  }

  const fake = await startFakeClaude({
    text: JSON.stringify({
      reply: 'Opening a wedding planning site for you.',
      proposals: [
        {
          kind: 'create-widget',
          widgetKind: 'webview',
          title: 'The Knot',
          content: 'https://www.theknot.com',
          reason: 'The voice command asked for a wedding site on the canvas.'
        }
      ]
    })
  })

  const launched = await launchApp({
    userDataDir,
    env: { ANTHROPIC_API_KEY: 'sk-ant-fake-e2e', ANTHROPIC_BASE_URL: fake.url }
  })
  const { window } = launched
  await waitForReady(window)
  window.on('pageerror', (e) => console.log('PAGEERROR', e.message))

  // Caleb's real provider preference.
  const setRes = await window.evaluate(() => window.api.voiceNote.setProvider('local'))
  console.log('[probe] setProvider(local):', JSON.stringify(setRes))

  // ── Phase 1: decode in the page (the renderer's real path) and transcribe ──
  const t0 = Date.now()
  const transcribeRes = await window.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // The FAB's decodeToMono16k contract: AudioContext at 16kHz, mono.
    const ctx = new AudioContext({ sampleRate: 16000 })
    const decoded = await ctx.decodeAudioData(bytes.buffer)
    const samples = decoded.getChannelData(0)
    await ctx.close()
    return window.api.voiceNote.transcribe({
      samples: new Float32Array(samples),
      sampleRate: 16000
    })
  }, wavB64)
  const transcribeMs = Date.now() - t0
  console.log('[probe] transcribe result:', JSON.stringify(transcribeRes), `in ${transcribeMs}ms`)

  expect(transcribeRes.ok).toBe(true)
  const transcript = (transcribeRes as { ok: true; transcript: string }).transcript
  expect(transcript.trim().length).toBeGreaterThan(0)
  // whisper-tiny on synthesized speech: the load-bearing nouns must land.
  expect(transcript).toMatch(/wedding|knot/i)

  // ── Phase 2: the transcript through the real voiceCommand stream ──
  // The model (fake) answers with a webview create-widget. The sanitiser's
  // behaviour is the thing under test, both sides of the R16 line.
  const runStream = (spoken: string, activeTaskId: string | null) =>
    window.evaluate(
      async (args: { spoken: string; activeTaskId: string | null }) => {
        return new Promise<{
          reply: string
          proposals: { kind: string; widgetKind?: string; content?: string; url?: string }[]
          error: string | null
        }>((resolve) => {
          const proposals: {
            kind: string
            widgetKind?: string
            content?: string
            url?: string
          }[] = []
          let reply = ''
          const requestId = `probe-${Math.random().toString(36).slice(2, 10)}`
          const timeout = setTimeout(
            () => resolve({ reply, proposals, error: 'probe timeout' }),
            60_000
          )
          window.api.voiceCommand.runStream(
            {
              requestId,
              transcript: args.spoken,
              activeTaskId: args.activeTaskId,
              selectedWidgetId: null,
              widgets: []
            },
            {
              onReply: (t) => {
                reply = t
              },
              onProposal: (p) => {
                proposals.push(
                  p as { kind: string; widgetKind?: string; content?: string; url?: string }
                )
              },
              onError: (e) => {
                clearTimeout(timeout)
                resolve({ reply, proposals, error: e.error })
              },
              onComplete: () => {
                clearTimeout(timeout)
                resolve({ reply, proposals, error: null })
              }
            }
          )
        })
      },
      { spoken, activeTaskId }
    )

  // 2a — NO desk open: the webview widget the model proposed must arrive as
  // open-url (R16: the web never demands a canvas), never silently vanish.
  const noDesk = await runStream(transcript, null)
  console.log('[probe] stream (no desk):', JSON.stringify(noDesk))
  expect(noDesk.error).toBeNull()
  expect(noDesk.reply.length).toBeGreaterThan(0)
  expect(noDesk.proposals.length).toBe(1)
  expect(noDesk.proposals[0].kind).toBe('open-url')
  expect(noDesk.proposals[0].url).toContain('theknot.com')

  // 2b — a desk IS open: deploy-on-canvas stands (R7's keep) — the same
  // envelope survives as a genuine create-widget/webview.
  const taskId = await window.evaluate(async () => {
    const nodeStore = (
      window as unknown as {
        __fbNodes: { getState: () => { create: (d: unknown) => Promise<{ id: string }> } }
      }
    ).__fbNodes
    const t = await nodeStore.getState().create({
      parentId: null,
      kind: 'task',
      title: 'Voice Gate Desk'
    })
    return t.id
  })
  const withDesk = await runStream(transcript, taskId)
  console.log('[probe] stream (desk open):', JSON.stringify(withDesk))
  expect(withDesk.error).toBeNull()
  expect(withDesk.proposals.length).toBe(1)
  expect(withDesk.proposals[0].kind).toBe('create-widget')
  expect(withDesk.proposals[0].widgetKind).toBe('webview')
  expect(withDesk.proposals[0].content).toContain('theknot.com')

  await window.screenshot({ path: `${OUT}/voice-1-engine-pass.png` })
  await launched.dispose()
  await fake.close()
})
