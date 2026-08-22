import { describe, it, expect } from 'vitest'
import { parseDdgHtml, WEB_SEARCH_MIN_QUERY, searchWeb } from '../../src/main/webSearch'
import { targetForSource, isOpenable } from '../../src/renderer/src/lib/sourceTarget'

// F4: the web pass is best-effort and honest — parse what is real, drop
// redirect noise, and never let a short follow-up leak to a search engine.

const FIXTURE = `
<div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.apollo.io%2Fsdr-guide&amp;rut=abc">What Is an SDR in Sales? <b>Role</b>, Responsibilities</a>
  <a class="result__snippet" href="#">An SDR handles <b>outbound</b> prospecting and qualification.</a>
</div>
<div class="result">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmartal.ca%2Fsdr-2026&amp;rut=def">SDR: Role, Skills &amp; 2026 Guide</a>
  <a class="result__snippet" href="#">Skills &amp; metrics for the modern SDR.</a>
</div>
<div class="result">
  <a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad_domain=ads">Sponsored thing</a>
  <a class="result__snippet" href="#">an ad</a>
</div>`

describe('parseDdgHtml', () => {
  it('decodes redirect links, strips tags and entities, keeps domains', () => {
    const results = parseDdgHtml(FIXTURE)
    expect(results.length).toBe(2)
    expect(results[0]).toEqual({
      title: 'What Is an SDR in Sales? Role, Responsibilities',
      url: 'https://www.apollo.io/sdr-guide',
      domain: 'apollo.io',
      snippet: 'An SDR handles outbound prospecting and qualification.'
    })
    expect(results[1].title).toBe('SDR: Role, Skills & 2026 Guide')
    expect(results[1].domain).toBe('martal.ca')
  })
  it('drops duckduckgo-internal rows (ads, redirects)', () => {
    expect(parseDdgHtml(FIXTURE).some((r) => r.domain.includes('duckduckgo'))).toBe(false)
  })
  it('respects the limit', () => {
    expect(parseDdgHtml(FIXTURE, 1).length).toBe(1)
  })
})

describe('searchWeb guards', () => {
  it('never searches for short follow-ups', async () => {
    // Shorter than the floor: resolves [] without touching the network.
    expect('yes, do it'.length).toBeLessThan(WEB_SEARCH_MIN_QUERY)
    await expect(searchWeb('yes, do it')).resolves.toEqual([])
  })
})

describe('web source routing', () => {
  it('a web source opens as a URL, never as a workspace object', () => {
    expect(targetForSource({ docId: 'https://apollo.io/x', docType: 'web' })).toEqual({
      kind: 'url',
      url: 'https://apollo.io/x'
    })
    expect(isOpenable({ docId: 'https://apollo.io/x', docType: 'web' })).toBe(true)
  })
  it('a web source with a non-http id is not clickable', () => {
    expect(targetForSource({ docId: 'javascript:alert(1)', docType: 'web' })).toBeNull()
  })
})
