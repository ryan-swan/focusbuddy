import { getFile, readFileBytes } from './db/files'

// Extract readable plain text from a file so a wire / desk agent / the brain can
// reason over its CONTENTS, not just its name. Best-effort + defensive: any parse
// failure returns an honest "(couldn't read…)" note rather than throwing, so a
// wire never crashes on a weird file. Heavy parsers are imported lazily so they
// only load when a matching file is actually read.
//
// Supported: PDF (pdf-parse), Word .docx (mammoth), spreadsheets .xlsx/.xls/.csv
// (xlsx), and plain-text families (txt/md/json/csv/log/tsv/html/xml/yaml). Other
// binaries (images, video, audio, zips) have no text and return null.

const MAX_CHARS = 12000

// The core: bytes + a type hint → text (or null if it's a binary with no text).
export async function extractTextFromBuffer(
  buf: Buffer,
  ext: string,
  mime: string
): Promise<string | null> {
  const e = ext.toLowerCase().replace(/^\./, '')
  const m = (mime || '').toLowerCase()
  try {
    if (e === 'pdf' || m.includes('pdf')) {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      try {
        const res = await parser.getText()
        return (res.text || '').trim().slice(0, MAX_CHARS)
      } finally {
        await parser.destroy?.()
      }
    }
    if (e === 'docx' || m.includes('wordprocessingml')) {
      const mammoth = (await import('mammoth')).default
      const res = await mammoth.extractRawText({ buffer: buf })
      return (res.value || '').trim().slice(0, MAX_CHARS)
    }
    if (e === 'xlsx' || e === 'xls' || e === 'csv' || m.includes('spreadsheet') || m.includes('excel')) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buf, { type: 'buffer' })
      const parts: string[] = []
      for (const name of wb.SheetNames.slice(0, 8)) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name])
        if (csv.trim()) parts.push(`# ${name}\n${csv}`)
      }
      return parts.join('\n\n').trim().slice(0, MAX_CHARS)
    }
    if (
      /^(txt|md|markdown|json|csv|tsv|log|html?|xml|yaml|yml|rtf)$/.test(e) ||
      m.startsWith('text/') ||
      m.includes('json')
    ) {
      return buf.toString('utf8').trim().slice(0, MAX_CHARS)
    }
  } catch (err) {
    return `(couldn't read this ${e || 'file'}: ${err instanceof Error ? err.message : String(err)})`
  }
  return null // a binary with no extractable text (image, video, audio, archive)
}

// Extract text from a locally-stored file by its files-store id.
export async function extractFileText(fileId: string): Promise<string | null> {
  const file = getFile(fileId)
  if (!file) return null
  const read = readFileBytes(fileId)
  if (!read) return null
  return extractTextFromBuffer(read.bytes, file.ext ?? '', read.mimeType)
}
