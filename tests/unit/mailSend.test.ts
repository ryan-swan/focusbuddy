import { describe, it, expect } from 'vitest'
import { deriveSmtp } from '../../src/main/mail/smtp'
import { sanitizeBody } from '../../src/main/mail/sanitizeBody'

// A minimal account stub — deriveSmtp only reads `host`.
function acct(host: string): Parameters<typeof deriveSmtp>[0] {
  return { host, port: 993, secure: true, user: 'me@example.com', password: 'x' }
}

describe('deriveSmtp — send server from the IMAP host', () => {
  it('maps Gmail to implicit TLS on 465', () => {
    expect(deriveSmtp(acct('imap.gmail.com'))).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true
    })
  })

  it('maps Outlook / Office 365 to STARTTLS on 587', () => {
    expect(deriveSmtp(acct('outlook.office365.com'))).toEqual({
      host: 'smtp.office365.com',
      port: 587,
      secure: false
    })
  })

  it('maps iCloud to its STARTTLS endpoint', () => {
    expect(deriveSmtp(acct('imap.mail.me.com'))).toEqual({
      host: 'smtp.mail.me.com',
      port: 587,
      secure: false
    })
  })

  it('maps Fastmail to implicit TLS on 465', () => {
    expect(deriveSmtp(acct('imap.fastmail.com'))).toEqual({
      host: 'smtp.fastmail.com',
      port: 465,
      secure: true
    })
  })

  it('swaps an imap. prefix for smtp. on unknown hosts, defaulting to 465 TLS', () => {
    expect(deriveSmtp(acct('imap.mycompany.com'))).toEqual({
      host: 'smtp.mycompany.com',
      port: 465,
      secure: true
    })
  })

  it('prefixes smtp. when the host has no imap label', () => {
    expect(deriveSmtp(acct('mail.mycompany.com'))).toEqual({
      host: 'smtp.mail.mycompany.com',
      port: 465,
      secure: true
    })
  })

  it('is case-insensitive on the host', () => {
    expect(deriveSmtp(acct('IMAP.GMAIL.COM')).host).toBe('smtp.gmail.com')
  })
})

describe('sanitizeBody — strip quotes, signatures, and PII before the model sees it', () => {
  it('keeps the user prose and drops the quoted reply thread', () => {
    const body = [
      'Sounds good, let us lock it in.',
      '',
      'On Mon, 2 Jun 2026 at 10:00, Jane Doe <jane@acme.com> wrote:',
      '> Are we still on for Tuesday?',
      '> Let me know.'
    ].join('\n')
    const out = sanitizeBody(body)
    expect(out).toBe('Sounds good, let us lock it in.')
    expect(out).not.toContain('Tuesday')
    expect(out).not.toContain('jane@acme.com')
  })

  it('cuts everything below the signature delimiter', () => {
    const body = ['Thanks for this.', '', '--', 'Michael', 'CEO, Example'].join('\n')
    expect(sanitizeBody(body)).toBe('Thanks for this.')
  })

  it('cuts an Outlook "Sent from my" signature', () => {
    expect(sanitizeBody('Will do.\nSent from my iPhone')).toBe('Will do.')
  })

  it('redacts email addresses and phone numbers in kept text', () => {
    const out = sanitizeBody('Reach me at michael@saasmouth.agency or +1 (555) 123-4567 anytime.')
    expect(out).not.toContain('michael@saasmouth.agency')
    expect(out).not.toMatch(/555/)
    expect(out).toContain('[contact]')
  })

  it('drops boilerplate footer lines wherever they appear', () => {
    const body = ['Here is the doc.', 'Confidentiality notice: this is private.', 'Cheers'].join(
      '\n'
    )
    const out = sanitizeBody(body)
    expect(out).toContain('Here is the doc.')
    expect(out).toContain('Cheers')
    expect(out).not.toContain('Confidentiality')
  })

  it('returns empty string when there is nothing but a quote', () => {
    expect(sanitizeBody('On Tue, someone wrote:\n> hi')).toBe('')
  })
})
