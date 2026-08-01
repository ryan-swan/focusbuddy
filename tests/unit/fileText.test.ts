import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import * as XLSX from 'xlsx'
import { extractTextFromBuffer } from '../../src/main/fileText'

// Pure-function coverage of the file-content parser that powers
// window.api.files.extractText and the Transform-wire "read a file's
// contents" path (src/main/ai/agentInputs.ts). No Electron, no DB — just
// bytes-in, text-out. The PDF/DOCX/XLSX/CSV/TXT/binary cases here are the
// same shapes exercised end-to-end in tests/e2e/fileTextExtraction.spec.ts;
// this file gives a fast (non-Electron) signal on the parsing logic itself.

// Minimal single-page PDF whose content stream draws the literal string
// "Hello Plexi PDF" — enough for pdf-parse to recover the text.
function minimalPdf(): Buffer {
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
  return Buffer.from(p, 'latin1')
}

// A minimal but valid .docx (OOXML zip) — mammoth needs the wordprocessingml
// namespace declared or it rejects the package with "Could not find the body
// element" before ever reading the text.
function minimalDocx(text: string): Buffer {
  const files: Record<string, Uint8Array> = {}
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  files['word/document.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  )
  files['[Content_Types].xml'] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  return Buffer.from(zipSync(files))
}

function minimalXlsx(rows: string[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// Smallest valid PNG (1x1 transparent pixel) — a binary with no extractable text.
const MINIMAL_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
  'hex'
)

describe('extractTextFromBuffer', () => {
  it('extracts text from a real PDF', async () => {
    const text = await extractTextFromBuffer(minimalPdf(), 'pdf', 'application/pdf')
    expect(text).toContain('Hello Plexi PDF')
  })

  it('extracts text from a real .docx (Word) via mammoth', async () => {
    const text = await extractTextFromBuffer(minimalDocx('Hello Plexi Docx'), 'docx', '')
    expect(text).toContain('Hello Plexi Docx')
  })

  it('extracts a real .xlsx sheet as CSV-shaped text', async () => {
    const text = await extractTextFromBuffer(minimalXlsx([['col1', 'col2'], ['alpha', 'beta']]), 'xlsx', '')
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
  })

  it('extracts a .csv buffer (routed through the spreadsheet parser)', async () => {
    const buf = Buffer.from('col1,col2\nalpha,beta', 'utf8')
    const text = await extractTextFromBuffer(buf, 'csv', 'text/csv')
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
  })

  it('extracts plain .txt as UTF-8', async () => {
    const buf = Buffer.from('Plexi text file body', 'utf8')
    const text = await extractTextFromBuffer(buf, 'txt', 'text/plain')
    expect(text).toContain('Plexi text file body')
  })

  it('returns null for a binary with no text (PNG)', async () => {
    const text = await extractTextFromBuffer(MINIMAL_PNG, 'png', 'image/png')
    expect(text).toBeNull()
  })

  it('truncates output to MAX_CHARS (12000) so a huge doc cannot blow up a wire payload', async () => {
    const huge = 'x'.repeat(20000)
    const text = await extractTextFromBuffer(Buffer.from(huge, 'utf8'), 'txt', 'text/plain')
    expect(text?.length).toBeLessThanOrEqual(12000)
  })
})
