import { test } from '@playwright/test'
import { launchApp, waitForReady, type LaunchedApp } from './_helpers'

// The A1 verification drive (Plexii AI program): REAL model calls through the
// real UI against a CLONED copy of the user's profile, so the checks that the
// unit suites cannot make — does the answer actually stream, does the trace
// run once and fold, do blocks answer back, does Stop keep the partial — are
// made against the truth. Run with FB_DRIVE_PROFILE pointing at the profile
// clone; skipped entirely without it so CI never burns credits.
//
// This is verification, not judging: taste stays with Caleb. Throwaway spec,
// delete when the stage closes.

const PROFILE = process.env.FB_DRIVE_PROFILE
const OUT = process.env.SHOT_DIR ?? '/tmp'

const SDR_Q = 'Research the best ways to be an SDR in 2026.'
const PAE_Q = 'Tell me about ResilientIQ and PAE'
const WEDDING_Q =
  'Set up a wedding planning desk with a vendor tracking spreadsheet, a planning checklist, and an at-a-glance sticky.'

interface DriveReport {
  keyPresent: boolean
  sdrStreamedVisibly: boolean
  sdrProseChars: number
  sdrCardBlocks: number
  paeFoldedAtCompletion: boolean
  paeKeywordMatchShown: boolean
  paeSearchLineCount: number
  drillCardPresent: boolean
  drillRoundTrip: boolean
  stopKeptPartial: boolean | null
  draftSurvived: boolean
  weddingProposalCount: number
  applyAllVisible: boolean
  notes: string[]
}

test('plexii A1 real-model drive on the profile clone', async () => {
  test.skip(!PROFILE, 'FB_DRIVE_PROFILE not set — this drive only runs on demand')
  test.setTimeout(900_000)

  const report: DriveReport = {
    keyPresent: false,
    sdrStreamedVisibly: false,
    sdrProseChars: 0,
    sdrCardBlocks: 0,
    paeFoldedAtCompletion: false,
    paeKeywordMatchShown: false,
    paeSearchLineCount: 0,
    drillCardPresent: false,
    drillRoundTrip: false,
    stopKeptPartial: null,
    draftSurvived: false,
    weddingProposalCount: 0,
    applyAllVisible: false,
    notes: []
  }

  let launched: LaunchedApp | null = null
  try {
    launched = await launchApp({ userDataDir: PROFILE })
    const { window } = launched
    await waitForReady(window)
    await window.setViewportSize({ width: 1440, height: 900 })
    // A modal (sign-in nag) must not block the drive; Escape is a no-op otherwise.
    await window.keyboard.press('Escape').catch(() => {})

    const chat = () =>
      window.evaluate(() => {
        const w = window as unknown as {
          __fbChat?: { getState: () => { sending: boolean; newConversation: () => void } }
        }
        return { sending: w.__fbChat?.getState().sending ?? false }
      })
    const goPlexii = () =>
      window.evaluate(() => {
        const w = window as unknown as {
          __fbView?: { getState: () => { goPlexii: () => void; goHome: () => void } }
        }
        w.__fbView?.getState().goPlexii()
      })
    const newConversation = () =>
      window.evaluate(() => {
        const w = window as unknown as {
          __fbChat?: { getState: () => { newConversation: () => void } }
        }
        w.__fbChat?.getState().newConversation()
      })
    const waitDone = async (maxMs: number): Promise<boolean> => {
      const t0 = Date.now()
      // A send flips `sending` on synchronously; wait for it to appear then clear.
      while (Date.now() - t0 < maxMs) {
        const s = await chat()
        if (!s.sending && Date.now() - t0 > 3000) return true
        await window.waitForTimeout(500)
      }
      return false
    }
    const typeAndSend = async (text: string): Promise<void> => {
      const composer = window.locator('[data-testid="chat-composer"]')
      await composer.click()
      await window.keyboard.type(text, { delay: 5 })
      await window.keyboard.press('Enter')
    }
    const lastTurnText = () =>
      window.evaluate(() => {
        const turns = [...document.querySelectorAll('[data-testid="assistant-turn"]')]
        const last = turns[turns.length - 1]
        return (last?.querySelector('.md-rendered') as HTMLElement | null)?.innerText ?? ''
      })

    await goPlexii()
    await window.waitForTimeout(800)
    report.keyPresent = !(await window.getByText('No API key yet').isVisible().catch(() => false))
    // safeStorage ties the stored key to the app's keychain identity, so a
    // cloned profile cannot decrypt it. Without a key the model-in-the-loop
    // checks are skipped honestly; the keyless checks below still run.
    const live = report.keyPresent
    if (!live) report.notes.push('no usable key on the clone — model-in-loop checks skipped')

    // ── Q1: research answers stream as prose ────────────────────────────────
    if (live) {
    await newConversation()
    await window.waitForTimeout(300)
    await typeAndSend(SDR_Q)
    const streamed = await window
      .locator('[data-testid="streaming-prose"]')
      .waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => true)
      .catch(() => false)
    report.sdrStreamedVisibly = streamed
    if (streamed) {
      await window.waitForTimeout(2500)
      await window.screenshot({ path: `${OUT}/d1-sdr-mid-stream.png` })
    }
    if (!(await waitDone(240_000))) report.notes.push('SDR answer did not complete in 4 min')
    await window.waitForTimeout(600)
    report.sdrProseChars = (await lastTurnText()).length
    report.sdrCardBlocks = await window.locator('[data-testid="ui-block-cards"]').count()
    await window.screenshot({ path: `${OUT}/d1-sdr-done.png` })

    // ── Q2: the trace runs once, folds at completion, discloses keyword-only ─
    await newConversation()
    await window.waitForTimeout(300)
    await typeAndSend(PAE_Q)
    if (!(await waitDone(240_000))) report.notes.push('PAE answer did not complete in 4 min')
    await window.waitForTimeout(400)
    report.paeFoldedAtCompletion = await window
      .locator('[data-testid="trace-collapsed"]')
      .last()
      .isVisible()
      .catch(() => false)
    await window.screenshot({ path: `${OUT}/d2-pae-folded.png` })
    if (report.paeFoldedAtCompletion) {
      await window.locator('[data-testid="trace-collapsed"]').last().click()
      await window.waitForTimeout(400)
      report.paeKeywordMatchShown = await window
        .getByText('keyword match')
        .first()
        .isVisible()
        .catch(() => false)
      report.paeSearchLineCount = await window
        .locator('[data-trace-line="retrieve"]')
        .count()
      await window.screenshot({ path: `${OUT}/d2-pae-open.png` })
    }
    }

    // ── Q3: blocks answer back; Stop keeps the partial ──────────────────────
    if (!live) {
      // Keyless: seed a turn carrying cards, then make the real click. The
      // drill-in user turn is renderer-side and must appear regardless; the
      // model's reply to it is the part that needs the live key.
      await window.evaluate(() => {
        const w = window as unknown as {
          __fbChat?: { setState: (s: Record<string, unknown>) => void }
        }
        const ts = Date.now()
        w.__fbChat?.setState({
          activeConversationId: null,
          sending: false,
          messagesByTask: {
            __new__: [
              { role: 'user', content: 'options?', ts: ts - 1 },
              { role: 'assistant', content: 'Here are the directions.', ts }
            ]
          },
          blocksByMessage: {
            [String(ts)]: [
              {
                type: 'cards',
                items: [{ icon: 'rocket_launch', title: 'Soft launch first', body: 'Beta list first.' }]
              }
            ]
          }
        })
      })
      await window.waitForTimeout(500)
    }
    const card = window.locator('[data-testid="ui-card-item"]').last()
    report.drillCardPresent = await card.isVisible().catch(() => false)
    if (report.drillCardPresent && !live) {
      await card.click()
      report.drillRoundTrip = await window
        .locator('[data-testid="user-turn"]', { hasText: 'Tell me more about' })
        .last()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
      await window.screenshot({ path: `${OUT}/d3-drill-turn.png` })
    }
    if (report.drillCardPresent && live) {
      await card.click()
      const userTurn = await window
        .locator('[data-testid="user-turn"]', { hasText: 'Tell me more about' })
        .last()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false)
      report.drillRoundTrip = userTurn
      const streaming = await window
        .locator('[data-testid="streaming-prose"]')
        .waitFor({ state: 'visible', timeout: 90_000 })
        .then(() => true)
        .catch(() => false)
      if (streaming) {
        await window.waitForTimeout(3000)
        await window.locator('[data-testid="chat-stop"]').click().catch(() => {})
        await window.waitForTimeout(1500)
        const done = await waitDone(30_000)
        const kept = (await lastTurnText()).length > 0
        report.stopKeptPartial = done && kept
        await window.screenshot({ path: `${OUT}/d3-drill-stopped.png` })
      }
    }

    // ── Q4: the draft survives leaving the chat ─────────────────────────────
    await newConversation()
    await window.waitForTimeout(300)
    const composer = window.locator('[data-testid="chat-composer"]')
    await composer.click()
    await window.keyboard.type('draft survival probe 123', { delay: 5 })
    await window.evaluate(() => {
      const w = window as unknown as {
        __fbView?: { getState: () => { goHome: () => void } }
      }
      w.__fbView?.getState().goHome()
    })
    await window.waitForTimeout(800)
    await goPlexii()
    await window.waitForTimeout(800)
    const draftText = await window
      .locator('[data-testid="chat-composer"]')
      .innerText()
      .catch(() => '')
    report.draftSurvived = draftText.includes('draft survival probe 123')
    await window.screenshot({ path: `${OUT}/d4-draft-survives.png` })

    // ── Q5: a build answer produces cards + Apply all ───────────────────────
    if (live) {
      await newConversation()
      await window.waitForTimeout(300)
      await typeAndSend(WEDDING_Q)
      if (!(await waitDone(300_000))) report.notes.push('wedding answer did not complete in 5 min')
      await window.waitForTimeout(800)
      report.weddingProposalCount = await window
        .locator('[data-testid^="proposal-card-"]')
        .count()
      report.applyAllVisible = await window
        .getByText(/^Apply all \d+$/)
        .isVisible()
        .catch(() => false)
      await window.screenshot({ path: `${OUT}/d5-wedding-cards.png` })
    }
  } finally {
    console.log('DRIVE_REPORT ' + JSON.stringify(report))
    await launched?.dispose()
  }
})
