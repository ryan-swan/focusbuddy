import { describe, it, expect } from 'vitest'
import { parseThreadingHeaders } from '../../src/main/mail/threadingHeaders'

describe('parseThreadingHeaders', () => {
  it('returns empty for missing headers', () => {
    expect(parseThreadingHeaders(undefined)).toEqual({ inReplyTo: null, references: [] })
  })

  it('extracts a single In-Reply-To id', () => {
    const h = 'In-Reply-To: <abc@host>\r\n'
    expect(parseThreadingHeaders(h)).toEqual({ inReplyTo: '<abc@host>', references: [] })
  })

  it('extracts a list of References ids on one line', () => {
    const h = 'References: <a@h> <b@h> <c@h>\r\n'
    expect(parseThreadingHeaders(h).references).toEqual(['<a@h>', '<b@h>', '<c@h>'])
  })

  it('handles folded References across continuation lines', () => {
    const h = 'References: <a@h>\r\n <b@h>\r\n\t<c@h>\r\n'
    expect(parseThreadingHeaders(h).references).toEqual(['<a@h>', '<b@h>', '<c@h>'])
  })

  it('is case-insensitive on header names', () => {
    const h = 'IN-REPLY-TO: <x@h>\r\nREFERENCES: <a@h>\r\n'
    expect(parseThreadingHeaders(h)).toEqual({ inReplyTo: '<x@h>', references: ['<a@h>'] })
  })

  it('parses a real Buffer with both headers among others', () => {
    const raw = ['Date: Mon, 1 Jan 2026 10:00:00 +0000', 'In-Reply-To: <root@h>', 'References: <root@h> <mid@h>', ''].join(
      '\r\n'
    )
    const res = parseThreadingHeaders(Buffer.from(raw, 'utf8'))
    expect(res.inReplyTo).toBe('<root@h>')
    expect(res.references).toEqual(['<root@h>', '<mid@h>'])
  })

  it('takes only the first id from a malformed multi-id In-Reply-To', () => {
    const h = 'In-Reply-To: <first@h> <second@h>\r\n'
    expect(parseThreadingHeaders(h).inReplyTo).toBe('<first@h>')
  })
})
