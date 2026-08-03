import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseDocxPageSetup } from '../../src/main/officeDocx'

// Construct a minimal .docx (OOXML) package with a section that references a
// header and footer, then parse it. Proves the header/footer text and page
// setup are recovered on import (mammoth converts only the body, so without this
// they would be dropped).
function makeDocx(opts: {
  header?: string
  footer?: string
  footerHasPageNum?: boolean
  pgSz?: string
  pgMar?: string
}): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const refs: string[] = []
  const rels: string[] = []
  if (opts.header) {
    refs.push('<w:headerReference w:type="default" r:id="rIdH"/>')
    rels.push('<Relationship Id="rIdH" Type="header" Target="header1.xml"/>')
    files['word/header1.xml'] = strToU8(`<w:hdr><w:p><w:r><w:t>${opts.header}</w:t></w:r></w:p></w:hdr>`)
  }
  if (opts.footer || opts.footerHasPageNum) {
    refs.push('<w:footerReference w:type="default" r:id="rIdF"/>')
    rels.push('<Relationship Id="rIdF" Type="footer" Target="footer1.xml"/>')
    const pageField = opts.footerHasPageNum ? '<w:r><w:fldSimple w:instr=" PAGE "/></w:r>' : ''
    const txt = opts.footer ? `<w:r><w:t>${opts.footer}</w:t></w:r>` : ''
    files['word/footer1.xml'] = strToU8(`<w:ftr><w:p>${pageField}${txt}</w:p></w:ftr>`)
  }
  const pgSz = opts.pgSz ?? '<w:pgSz w:w="12240" w:h="15840"/>'
  const pgMar = opts.pgMar ?? '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
  files['word/document.xml'] = strToU8(
    `<w:document><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr>${refs.join('')}${pgSz}${pgMar}</w:sectPr></w:body></w:document>`
  )
  files['word/_rels/document.xml.rels'] = strToU8(`<Relationships>${rels.join('')}</Relationships>`)
  return zipSync(files)
}

describe('parseDocxPageSetup', () => {
  it('recovers the running header and footer text', async () => {
    const page = await parseDocxPageSetup(makeDocx({ header: 'Confidential', footer: 'Draft copy' }))
    expect(page?.header?.text).toBe('Confidential')
    expect(page?.footer?.text).toBe('Draft copy')
  })

  it('detects an auto page-number field in the footer', async () => {
    const page = await parseDocxPageSetup(makeDocx({ footerHasPageNum: true }))
    expect(page?.footer?.showPageNumber).toBe(true)
  })

  it('reads Letter size, portrait, and 1-inch margins', async () => {
    const page = await parseDocxPageSetup(makeDocx({}))
    expect(page?.size).toBe('letter')
    expect(page?.orientation).toBe('portrait')
    expect(page?.margin).toEqual({ top: 1, right: 1, bottom: 1, left: 1 })
  })

  it('reads A4 size and landscape orientation', async () => {
    const page = await parseDocxPageSetup(
      makeDocx({ pgSz: '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' })
    )
    expect(page?.size).toBe('a4')
    expect(page?.orientation).toBe('landscape')
  })

  it('reads custom margins (720 twips = 0.5in)', async () => {
    const page = await parseDocxPageSetup(
      makeDocx({ pgMar: '<w:pgMar w:top="720" w:right="1080" w:bottom="720" w:left="1080"/>' })
    )
    expect(page?.margin).toEqual({ top: 0.5, right: 0.75, bottom: 0.5, left: 0.75 })
  })

  it('omits an empty header/footer rather than inventing one', async () => {
    const page = await parseDocxPageSetup(makeDocx({}))
    expect(page?.header).toBeUndefined()
    expect(page?.footer).toBeUndefined()
  })

  it('returns undefined for a package without a document part', async () => {
    const page = await parseDocxPageSetup(zipSync({ 'docProps/app.xml': strToU8('<x/>') }))
    expect(page).toBeUndefined()
  })

  it('round-trips a real turbodocx-generated header/footer', async () => {
    // Generate a genuine .docx with the same library the exporter uses, then parse
    // it back — proving the parser reads turbodocx's real OOXML, not just fixtures.
    const HTMLtoDOCX = (await import('@turbodocx/html-to-docx')).default
    const out = (await HTMLtoDOCX(
      '<p>Body text</p>',
      '<p>Confidential</p>',
      { header: true, footer: true, pageNumber: true, orientation: 'portrait' },
      '<p>Draft copy</p>'
    )) as Buffer | ArrayBuffer
    const buf = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)
    const page = await parseDocxPageSetup(new Uint8Array(buf))
    expect(page?.header?.text).toContain('Confidential')
    expect(page?.footer?.text).toContain('Draft copy')
    expect(page?.footer?.showPageNumber).toBe(true)
  })
})
