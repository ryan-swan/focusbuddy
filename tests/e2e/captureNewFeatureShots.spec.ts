/**
 * Marketing screenshot capture for the new-feature launch (assistant proposal
 * cards, desk agent quick jobs, related desks, describe-it starting kit,
 * proactive desk suggestion) — NOT a functional test.
 *
 * Writes PNGs straight into haptyx-web/public/screenshots/ for the brochure
 * site. Every screenshot is of the REAL rendered UI: widgets, tables and rows
 * are created through the real window.api IPC surface, proposal cards are
 * pushed through the real useAgentRunStore hook (window.__fbAgentRun) the same
 * way a live agent run would, and the one AI-gated view (the assistant reply)
 * is captured by stubbing window.api.chat.send's transport only — the
 * composer, the store, and ProposalCards all run for real off that response.
 *
 * Run manually:
 *   npx playwright test tests/e2e/captureNewFeatureShots.spec.ts --timeout 180000
 */

import { test } from '@playwright/test'
import { launchApp, waitForReady } from './_helpers'
import { resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'

const SCREENSHOTS_DIR = resolve(__dirname, '../../../haptyx-web/public/screenshots')

function screenshotPath(name: string): string {
  return resolve(SCREENSHOTS_DIR, name)
}

test.setTimeout(180_000)

test('capture new-feature marketing screenshots', async () => {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  }

  const { app, window, dispose } = await launchApp()

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.setContentSize(1600, 1000)
      win.center()
    }
  })

  try {
    await waitForReady(window)

    // ────────────────────────────────────────────────────────────────────
    // Seed desks + real data via window.api
    // ────────────────────────────────────────────────────────────────────
    const seeded = await window.evaluate(async () => {
      const api = (window as unknown as { api: typeof window.api }).api

      // Desk 1 — "Outbound Leads": a table with no agent (desk-suggestion.png)
      const leadsDesk = await api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'Outbound Leads'
      })
      const leadsTable = await api.tables.create({
        taskId: leadsDesk.id,
        title: 'Leads',
        schema: {
          columns: [
            { id: 'c-company', type: 'text-short', label: 'Company', config: {} },
            { id: 'c-contact', type: 'text-short', label: 'Contact', config: {} },
            {
              id: 'c-status',
              type: 'single-select',
              label: 'Status',
              config: {
                options: [
                  { id: 's-new', label: 'New', color: '#94a3b8' },
                  { id: 's-researched', label: 'Researched', color: '#3b82f6' },
                  { id: 's-contacted', label: 'Contacted', color: '#22c55e' }
                ]
              }
            }
          ]
        }
      })
      for (const [company, contact, status] of [
        ['Northwind Traders', 'Elena Cho', 's-new'],
        ['Bramble & Finch', 'Priya Nair', 's-new'],
        ['Solace Robotics', 'Marcus Webb', 's-contacted']
      ] as const) {
        await api.tables.createRow({
          tableId: leadsTable.id,
          cells: { 'c-company': company, 'c-contact': contact, 'c-status': status }
        })
      }
      const leadsTableWidget = await api.widgets.create({
        taskId: leadsDesk.id,
        kind: 'table',
        title: 'Leads',
        content: leadsTable.id,
        x: 60,
        y: 60,
        width: 640,
        height: 320
      })

      // Desk 2 — "Lead Research": table + wired agent with pushed proposals
      // (agent-proposals.png)
      const researchDesk = await api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'Lead Research'
      })
      const researchTable = await api.tables.create({
        taskId: researchDesk.id,
        title: 'Prospects',
        schema: {
          columns: [
            { id: 'r-company', type: 'text-short', label: 'Company', config: {} },
            { id: 'r-notes', type: 'text-long', label: 'Notes', config: {} },
            {
              id: 'r-status',
              type: 'single-select',
              label: 'Status',
              config: {
                options: [
                  { id: 'rs-new', label: 'New', color: '#94a3b8' },
                  { id: 'rs-researched', label: 'Researched', color: '#3b82f6' }
                ]
              }
            }
          ]
        }
      })
      const researchRow = await api.tables.createRow({
        tableId: researchTable.id,
        cells: { 'r-company': 'Northwind Traders', 'r-notes': '', 'r-status': 'rs-new' }
      })
      const researchTableWidget = await api.widgets.create({
        taskId: researchDesk.id,
        kind: 'table',
        title: 'Prospects',
        content: researchTable.id,
        x: 60,
        y: 60,
        width: 560,
        height: 260
      })
      const researchAgentWidget = await api.widgets.create({
        taskId: researchDesk.id,
        kind: 'agent',
        title: 'Research agent',
        content: '',
        x: 680,
        y: 60,
        width: 360,
        height: 420
      })
      await api.widgetLinks.create(
        researchTableWidget.id,
        researchAgentWidget.id,
        researchDesk.id,
        'context'
      )

      // Desk 3 — "New Client Onboarding": a fresh, empty node-canvas so the
      // starting kit auto-offers (describe-it.png)
      const onboardingDesk = await api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'New Client Onboarding'
      })

      // Desk 4 — "Q3 Client Programs": a plain desk with a couple of related
      // desks candidates + a home for the assistant panel shot
      const mainDesk = await api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'Q3 Client Programs'
      })
      await api.nodes.create({ parentId: null, kind: 'task', title: 'Client Success Reviews' })
      await api.nodes.create({ parentId: null, kind: 'task', title: 'Renewal Forecast' })

      // Desk 5 — a bare desk to host a fresh, empty agent widget in its
      // empty state (agent-quick-jobs.png)
      const jobsDesk = await api.nodes.create({
        parentId: null,
        kind: 'task',
        title: 'Ops Automation'
      })
      const jobsAgentWidget = await api.widgets.create({
        taskId: jobsDesk.id,
        kind: 'agent',
        title: 'New agent',
        content: '',
        x: 60,
        y: 60,
        width: 340,
        height: 420
      })

      return {
        leadsDesk,
        researchDesk,
        researchTableId: researchTable.id,
        researchRowId: researchRow.id,
        researchAgentWidgetId: researchAgentWidget.id,
        onboardingDesk,
        mainDesk,
        jobsDesk,
        jobsAgentWidgetId: jobsAgentWidget.id
      }
    })

    // Seed the node-canvas origin for the onboarding desk BEFORE we ever
    // navigate there, so Canvas's lazy nodeOrigin state (re-read per task
    // switch) picks it up and offers the starting kit.
    await window.evaluate((taskId: string) => {
      const origin = {
        sourceTaskId: 'demo-source-map',
        sourceTaskTitle: 'Client Programs Map',
        mindmapWidgetId: 'demo-mindmap-widget',
        nodeId: 'demo-node-onboarding',
        nodeLabel: 'New Client Onboarding',
        nodePath: ['Q3 Client Programs']
      }
      const raw = localStorage.getItem('fb.mindmap.nodeCanvasOrigins')
      const all = raw ? JSON.parse(raw) : {}
      all[taskId] = origin
      localStorage.setItem('fb.mindmap.nodeCanvasOrigins', JSON.stringify(all))
    }, seeded.onboardingDesk.id)

    await window.reload()
    await waitForReady(window)

    // ────────────────────────────────────────────────────────────────────
    // 1 — desk-suggestion.png: table, no agent → proactive suggestion chip
    // ────────────────────────────────────────────────────────────────────
    await window.getByRole('button', { name: /Outbound Leads/i }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
    await window.waitForTimeout(600)
    const suggestionChip = window.locator('[data-testid="desk-suggestion"]')
    await suggestionChip.waitFor({ state: 'visible', timeout: 8_000 })
    await window.waitForTimeout(300)
    await window.screenshot({ path: screenshotPath('desk-suggestion.png'), fullPage: false })
    console.log('[shots] wrote desk-suggestion.png')

    // ────────────────────────────────────────────────────────────────────
    // 2 — agent-proposals.png: real proposals pushed via the run-store hook
    // ────────────────────────────────────────────────────────────────────
    await window.getByRole('button', { name: /Lead Research/i }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
    await window.waitForSelector(`[data-widget-id="${seeded.researchAgentWidgetId}"]`, { timeout: 8_000 })
    await window.evaluate(
      ({ agentId, tableId, rowId }: { agentId: string; tableId: string; rowId: string }) => {
        const w = window as unknown as {
          __fbAgentRun?: { getState: () => { setProposals: (id: string, p: unknown[]) => void } }
        }
        w.__fbAgentRun?.getState().setProposals(agentId, [
          {
            id: 'p1',
            kind: 'set-cell',
            tableId,
            rowId,
            cells: { Notes: 'Series B robotics logistics startup, 40 employees, HQ Austin TX.' },
            reason: 'Filled in company background from public sources.'
          },
          {
            id: 'p2',
            kind: 'set-cell',
            tableId,
            rowId,
            cells: { Status: 'Researched' },
            reason: 'Marked as researched now that notes are in.'
          },
          {
            id: 'p3',
            kind: 'add-table-row',
            tableId,
            cells: { Company: 'Solace Robotics', Notes: 'Referred by Northwind — same buying group.', Status: 'New' },
            reason: 'Found a related prospect worth tracking.'
          }
        ])
      },
      { agentId: seeded.researchAgentWidgetId, tableId: seeded.researchTableId, rowId: seeded.researchRowId }
    )
    await window.waitForSelector('[data-testid="agent-proposals"]', { timeout: 5_000 })
    await window.waitForTimeout(400)
    const proposalsWidget = window.locator(`[data-widget-id="${seeded.researchAgentWidgetId}"]`)
    await proposalsWidget.screenshot({ path: screenshotPath('agent-proposals.png') })
    console.log('[shots] wrote agent-proposals.png')

    // ────────────────────────────────────────────────────────────────────
    // 3 — agent-quick-jobs.png: fresh agent widget, empty instruction
    // ────────────────────────────────────────────────────────────────────
    await window.getByRole('button', { name: /Ops Automation/i }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
    await window.waitForSelector(`[data-widget-id="${seeded.jobsAgentWidgetId}"]`, { timeout: 8_000 })
    await window.waitForSelector('[data-testid="agent-jobs"]', { timeout: 5_000 })
    await window.waitForTimeout(300)
    const jobsWidget = window.locator(`[data-widget-id="${seeded.jobsAgentWidgetId}"]`)
    await jobsWidget.screenshot({ path: screenshotPath('agent-quick-jobs.png') })
    console.log('[shots] wrote agent-quick-jobs.png')

    // ────────────────────────────────────────────────────────────────────
    // 4 — describe-it.png: empty node-canvas starting kit
    // ────────────────────────────────────────────────────────────────────
    await window.getByRole('button', { name: /New Client Onboarding/i }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
    await window.waitForSelector('[data-testid="starting-kit-describe"]', { timeout: 8_000 })
    await window.waitForTimeout(500)
    await window.screenshot({ path: screenshotPath('describe-it.png'), fullPage: false })
    console.log('[shots] wrote describe-it.png')

    // ────────────────────────────────────────────────────────────────────
    // 5 — related-desks.png: command palette → Related desks
    // ────────────────────────────────────────────────────────────────────
    await window.getByRole('button', { name: /Q3 Client Programs/i }).first().click()
    await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 10_000 })
    await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-command-palette')))
    await window.waitForSelector('[role="dialog"][aria-label="Command palette"]', { timeout: 5_000 })
    await window.keyboard.type('related desks')
    await window.waitForTimeout(400)
    await window.getByText('Related desks', { exact: true }).first().click()
    await window.waitForTimeout(400)
    // Tick one desk as related
    const relatedRow = window.getByText('Client Success Reviews', { exact: true }).first()
    await relatedRow.waitFor({ state: 'visible', timeout: 5_000 })
    await relatedRow.click()
    await window.waitForTimeout(500)
    await window.screenshot({ path: screenshotPath('related-desks.png'), fullPage: false })
    console.log('[shots] wrote related-desks.png')
    await window.keyboard.press('Escape')
    await window.waitForTimeout(300)

    // ────────────────────────────────────────────────────────────────────
    // 6 — brain-assistant.png: assistant panel with a seeded reply +
    // proposal cards. The composer, store, trace and cards all run for real;
    // only the model is stubbed, since no Anthropic key is present in this
    // hermetic run.
    //
    // The stub replaces the `chat:sendStream` MAIN-PROCESS handler, not
    // window.api. contextBridge deep-freezes the exposed api object, so
    // assigning over api.chat.* from the page silently does nothing and the
    // real handler runs anyway (which is what the previous version of this
    // stub did — it produced a no-API-key error, not the seeded reply).
    // Driving the real channel also means the shot shows the genuine retrieval
    // trace: sources, reply, one event per prepared action, then complete.
    // ────────────────────────────────────────────────────────────────────
    await window.evaluate(() => window.dispatchEvent(new CustomEvent('fb:open-assistant')))
    await window.waitForTimeout(400)
    await app.evaluate(({ ipcMain }) => {
      const reply =
        "Set this up for you: a Prospects table to track who you're reaching out to, a research agent wired into it that will fill in notes and status as you add rows, and the two linked so it runs automatically. Review the cards below and apply what you want."
      const proposals = [
        {
          id: 'ai-p1',
          kind: 'create-table',
          title: 'Prospects',
          columns: [
            { label: 'Company', type: 'text-short' },
            { label: 'Notes', type: 'text-long' },
            { label: 'Status', type: 'single-select', options: ['New', 'Researched', 'Contacted'] }
          ],
          reason: 'A place to track each prospect and what you know about them.'
        },
        {
          id: 'ai-p2',
          kind: 'create-agent',
          title: 'Research agent',
          instruction:
            'Research each company wired into me and fill in the Notes column with a concise summary, then set Status to Researched.',
          profileId: 'bi-researcher',
          trigger: 'manual',
          reason: 'Automates the research step once the table has rows.'
        },
        {
          id: 'ai-p3',
          kind: 'link-widgets',
          sourceWidgetId: '$ai-p1',
          targetWidgetId: '$ai-p2',
          sourceLabel: 'Prospects',
          targetLabel: 'Research agent',
          wireType: 'context',
          reason: 'Wires the table into the agent so it has rows to work on.'
        }
      ]
      const tools = [
        { index: 0, kind: 'create-table', label: 'Table — Prospects' },
        { index: 1, kind: 'create-agent', label: 'Agent — Research agent' },
        { index: 2, kind: 'link-widgets', label: 'Wire — Prospects → Research agent' }
      ]
      try {
        ipcMain.removeHandler('chat:sendStream')
      } catch {
        /* nothing installed yet */
      }
      ipcMain.handle(
        'chat:sendStream',
        async (e: Electron.IpcMainInvokeEvent, input: { requestId: string }) => {
          const channel = `chat:stream:${input.requestId}`
          const send = (type: string, payload: unknown): void => {
            if (!e.sender.isDestroyed()) e.sender.send(channel, { type, payload })
          }
          const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
          await wait(40)
          send('sources', { sources: [], elapsedMs: 180 })
          await wait(60)
          send('reply', reply)
          for (const t of tools) {
            await wait(50)
            send('tool', t)
          }
          await wait(50)
          send('complete', {
            ok: true,
            message: { role: 'assistant', content: reply, ts: Date.now() },
            proposals
          })
          return { ok: true }
        }
      )
    })
    // Stable testid rather than placeholder text: the composer no longer
    // advertises a send chord in its placeholder (Enter sends now). The Send
    // button below is still found by its accessible name, which is unchanged.
    const composer = window.locator('[data-testid="chat-composer"]')
    await composer.waitFor({ state: 'visible', timeout: 5_000 })
    await composer.fill('Set up a way to track and research my sales leads')
    await window.getByRole('button', { name: /^Send$/ }).click()
    await window.waitForSelector('text=Set this up for you', { timeout: 8_000 })
    await window.waitForTimeout(500)
    await window.screenshot({ path: screenshotPath('brain-assistant.png'), fullPage: false })
    console.log('[shots] wrote brain-assistant.png')
  } finally {
    await dispose()
  }
})
