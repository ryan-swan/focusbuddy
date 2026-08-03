import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp, waitForReady } from './_helpers'

// Verifies file/PDF text extraction (plexi-4.0):
//   (a) window.api.files.extractText reads a real PDF's text via pdf-parse —
//       the key test, since pdf-parse's pdfjs worker resolution is the known
//       packaging risk (see electron-builder.cjs asarUnpack comment).
//   (b) a plain .txt file extracts as UTF-8 text.
//   (c) a .csv file extracts (routed through the xlsx spreadsheet parser).
//   (d) a binary with no text (PNG) returns null — an honest "can't read
//       this" rather than a fabricated result.
//   (e) the wire guards: a MIRROR from a file/pdf source now says "use a
//       Transform" (it used to silently copy the file reference); an image
//       source still says "no text"; a TRANSFORM from a pdf source reaches
//       the AI call (proving extraction ran) and fails on the missing key,
//       NOT on "can't read a PDF".
//
// All driven via window.api (ingest + extractText are not UI gestures) plus
// the same editContentViaStore seam wireDeliveryFixes.spec.ts uses to fire
// the reactive wire engine.

let launched: LaunchedApp | null = null

test.afterEach(async () => {
  if (launched) {
    await launched.dispose()
    launched = null
  }
})

// Same minimal-PDF constructor supplied in the dispatch brief — produces a
// single-page PDF whose content stream draws "Hello Plexi PDF".
function minimalPdfHex(): string {
  const o: string[] = []
  o[1] = '<</Type/Catalog/Pages 2 0 R>>'
  o[2] = '<</Type/Pages/Kids[3 0 R]/Count 1>>'
  o[3] = '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>'
  const s = 'BT /F1 24 Tf 20 100 Td (Hello Plexi PDF) Tj ET'
  o[4] = '<</Length ' + s.length + '>>\nstream\n' + s + '\nendstream'
  o[5] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  let p = '%PDF-1.4\n'
  const off: number[] = []
  for (let i = 1; i <= 5; i++) {
    off[i] = p.length
    p += i + ' 0 obj' + o[i] + '\nendobj\n'
  }
  const x = p.length
  p += 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i++) {
    p += String(off[i]).padStart(10, '0') + ' 00000 n \n'
  }
  p += 'trailer<</Size 6/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF'
  return Buffer.from(p, 'latin1').toString('hex')
}

const MINIMAL_PNG_HEX =
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300010000000500010d0a2db40000000049454e44ae426082'

// Ingests a hex-encoded buffer via window.api.files.ingestBuffer inside the
// renderer (the buffer is built in-page as an ArrayBuffer — Buffer isn't
// available in the renderer's context bridge).
async function ingestHex(
  window: Page,
  hex: string,
  originalName: string,
  mimeType: string
): Promise<{ id: string; originalName: string }> {
  return window.evaluate(
    async ({ hex, originalName, mimeType }: { hex: string; originalName: string; mimeType: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      const file = await api.files.ingestBuffer({
        buffer: bytes.buffer,
        originalName,
        mimeType
      })
      return { id: file.id, originalName: file.originalName }
    },
    { hex, originalName, mimeType }
  )
}

async function editContentViaStore(window: Page, widgetId: string, content: string): Promise<void> {
  await window.evaluate(
    async ({ id, content: c }: { id: string; content: string }) => {
      const w = window as unknown as {
        __fbWidgets?: { getState: () => { update: (id: string, patch: { content: string }) => Promise<unknown> } }
      }
      await w.__fbWidgets?.getState().update(id, { content: c })
    },
    { id: widgetId, content }
  )
}

async function linkOf(
  window: Page,
  taskId: string,
  linkId: string
): Promise<{ lastRunAt: number | null; lastError: string | null } | undefined> {
  return window.evaluate(
    async ({ tid, lid }: { tid: string; lid: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const links = await api.widgetLinks.listByTask(tid)
      const l = links.find((x) => x.id === lid)
      return l ? { lastRunAt: l.lastRunAt ?? null, lastError: l.lastError ?? null } : undefined
    },
    { tid: taskId, lid: linkId }
  )
}

// ── (a) PDF text extraction — the key test ──────────────────────────────────

test('(a) window.api.files.extractText reads a real PDF via pdf-parse', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const file = await ingestHex(window, minimalPdfHex(), 'test.pdf', 'application/pdf')
  const text = await window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.files.extractText(id)
  }, file.id)

  expect(text).toContain('Hello Plexi PDF')
})

// ── (b) TXT ──────────────────────────────────────────────────────────────

test('(b) window.api.files.extractText reads a plain .txt file', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const hex = Buffer.from('Plexi text file body', 'utf8').toString('hex')
  const file = await ingestHex(window, hex, 'note.txt', 'text/plain')
  const text = await window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.files.extractText(id)
  }, file.id)

  expect(text).toContain('Plexi text file body')
})

// ── (c) CSV ──────────────────────────────────────────────────────────────

test('(c) window.api.files.extractText reads a .csv file', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const hex = Buffer.from('col1,col2\nalpha,beta', 'utf8').toString('hex')
  const file = await ingestHex(window, hex, 'data.csv', 'text/csv')
  const text = await window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.files.extractText(id)
  }, file.id)

  expect(text).toContain('alpha')
  expect(text).toContain('beta')
})

// ── (d) binary with no text (PNG) → honest null ─────────────────────────────

test('(d) window.api.files.extractText returns null for a binary with no text (PNG)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const file = await ingestHex(window, MINIMAL_PNG_HEX, 'pixel.png', 'image/png')
  const text = await window.evaluate(async (id: string) => {
    const api = (window as unknown as { api: typeof window.api }).api
    return api.files.extractText(id)
  }, file.id)

  expect(text).toBeNull()
})

// ── (e) wire guards ────────────────────────────────────────────────────────

async function openTask(window: Page, taskTitleRe: RegExp): Promise<void> {
  await window.reload()
  await waitForReady(window)
  await window.getByRole('button', { name: taskTitleRe }).first().click()
  await window.waitForSelector('[data-canvas-surface="true"]', { timeout: 5_000 })
  await window.waitForTimeout(300)
}

test('(e1) a MIRROR wire from a file source errors "use a Transform" — no longer copies the reference', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const file = await ingestHex(window, minimalPdfHex(), 'source.pdf', 'application/pdf')

  const seeded = await window.evaluate(
    async ({ fileId }: { fileId: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'File mirror guard' })
      const fileWidget = await api.widgets.create({
        taskId: task.id,
        kind: 'file',
        title: 'source.pdf',
        content: fileId,
        x: 120,
        y: 160,
        width: 220,
        height: 180
      })
      const note = await api.widgets.create({
        taskId: task.id,
        kind: 'sticky',
        title: 'N',
        content: '',
        x: 520,
        y: 160,
        width: 220,
        height: 180
      })
      const link = await api.widgetLinks.create(fileWidget.id, note.id, task.id, 'mirror')
      return { taskId: task.id, fileWidgetId: fileWidget.id, noteId: note.id, linkId: link!.id }
    },
    { fileId: file.id }
  )

  await openTask(window, /File mirror guard/)

  // Editing the file widget's own content (re-pointing it) is what a real
  // content change on the source looks like, and fires notifyWireSource.
  await editContentViaStore(window, seeded.fileWidgetId, file.id + '-touched')

  await expect
    .poll(async () => linkOf(window, seeded.taskId, seeded.linkId), { timeout: 6_000, intervals: [200, 300, 500] })
    .toEqual(expect.objectContaining({ lastError: expect.stringContaining('Transform') }))

  const link = await linkOf(window, seeded.taskId, seeded.linkId)
  expect(link?.lastError).toContain('make this a Transform wire')
  expect(link?.lastError).not.toContain("can't read")

  // The note must NOT have silently received the file id/reference.
  const noteContent = await window.evaluate(
    async ({ tid, wid }: { tid: string; wid: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const ws = await api.widgets.listByTask(tid)
      return ws.find((w) => w.id === wid)?.content
    },
    { tid: seeded.taskId, wid: seeded.noteId }
  )
  expect(noteContent).toBe('')
})

test('(e2) a MIRROR wire from an image source still errors "no text" (unchanged behaviour)', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const seeded = await window.evaluate(async () => {
    const api = (window as unknown as { api: typeof window.api }).api
    const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'Image mirror guard' })
    const image = await api.widgets.create({
      taskId: task.id,
      kind: 'image',
      title: 'I',
      content: 'https://example.com/photo.png',
      x: 120,
      y: 160,
      width: 220,
      height: 180
    })
    const note = await api.widgets.create({
      taskId: task.id,
      kind: 'sticky',
      title: 'N',
      content: '',
      x: 520,
      y: 160,
      width: 220,
      height: 180
    })
    const link = await api.widgetLinks.create(image.id, note.id, task.id, 'mirror')
    return { taskId: task.id, imageId: image.id, noteId: note.id, linkId: link!.id }
  })

  await openTask(window, /Image mirror guard/)
  await editContentViaStore(window, seeded.imageId, 'https://example.com/photo-v2.png')

  await expect
    .poll(async () => linkOf(window, seeded.taskId, seeded.linkId), { timeout: 6_000, intervals: [200, 300, 500] })
    .toEqual(expect.objectContaining({ lastError: expect.stringContaining('no text') }))

  const link = await linkOf(window, seeded.taskId, seeded.linkId)
  expect(link?.lastError).toContain('image has no text to send')
})

test('(e3) a TRANSFORM wire from a pdf source reaches the AI call — fails on "no API key", not "can\'t read PDF"', async () => {
  launched = await launchApp()
  const { window } = launched
  await waitForReady(window)

  const file = await ingestHex(window, minimalPdfHex(), 'source.pdf', 'application/pdf')

  const seeded = await window.evaluate(
    async ({ fileId }: { fileId: string }) => {
      const api = (window as unknown as { api: typeof window.api }).api
      const task = await api.nodes.create({ parentId: null, kind: 'task', title: 'PDF transform guard' })
      const pdf = await api.widgets.create({
        taskId: task.id,
        kind: 'pdf',
        title: 'source.pdf',
        content: fileId,
        x: 120,
        y: 160,
        width: 220,
        height: 180
      })
      const note = await api.widgets.create({
        taskId: task.id,
        kind: 'sticky',
        title: 'N',
        content: '',
        x: 520,
        y: 160,
        width: 220,
        height: 180
      })
      const link = await api.widgetLinks.create(pdf.id, note.id, task.id, 'transform')
      await api.widgetLinks.update(link!.id, { verb: 'Summarize this' })
      return { taskId: task.id, pdfId: pdf.id, noteId: note.id, linkId: link!.id }
    },
    { fileId: file.id }
  )

  await openTask(window, /PDF transform guard/)

  // Trigger the reactive transform by touching the pdf source's own content
  // (re-pointing it) — same seam as the mirror tests above.
  await editContentViaStore(window, seeded.pdfId, file.id + '-touched')

  await expect
    .poll(async () => linkOf(window, seeded.taskId, seeded.linkId), { timeout: 8_000, intervals: [300, 500, 800] })
    .toEqual(expect.objectContaining({ lastError: expect.stringContaining('API key') }))

  const link = await linkOf(window, seeded.taskId, seeded.linkId)
  // The harness strips ANTHROPIC_API_KEY, so this is the honest no-key error —
  // proving describeWidgetForAgent successfully read the PDF's text (no crash,
  // no "can't read" honesty guard) and the request reached the AI call, which
  // is the only place left to fail.
  expect(link?.lastError).toContain('No Anthropic API key set')
  expect(link?.lastError).not.toContain("can't read")
})
