import { describe, it, expect } from 'vitest'
import {
  firstLineOf,
  hostnameOf,
  deriveWidgetName,
  truncateName,
  widgetDisplayName
} from '@renderer/lib/widgetDisplayName'

// Naming precedence: a manual title wins; otherwise the name is inherited from
// the widget's own content (first line of text, or a browser's hostname);
// otherwise the kind's own header label, then a friendly kind name.

const w = (over: Record<string, unknown>): never =>
  ({ kind: 'sticky', content: '', title: '', ...over }) as never

describe('firstLineOf', () => {
  it('takes the first non-empty line', () => {
    expect(firstLineOf('\n\nBuy milk\nand eggs')).toBe('Buy milk')
  })
  it('strips a markdown heading, bullet and checkbox lead-in', () => {
    expect(firstLineOf('## Pricing notes')).toBe('Pricing notes')
    expect(firstLineOf('- [ ] call the bank')).toBe('call the bank')
    expect(firstLineOf('* a bullet')).toBe('a bullet')
  })
  it('strips inline emphasis marks', () => {
    expect(firstLineOf('**Important** thing')).toBe('Important thing')
  })
  it('returns empty for whitespace-only content', () => {
    expect(firstLineOf('   \n\t\n')).toBe('')
  })
})

describe('hostnameOf', () => {
  it('extracts and de-wwws a hostname with or without scheme', () => {
    expect(hostnameOf('https://www.campfire.ai/notes')).toBe('campfire.ai')
    expect(hostnameOf('docs.google.com/document/123')).toBe('docs.google.com')
  })
  it('returns empty for non-URL text', () => {
    expect(hostnameOf('just some words')).toBe('')
    expect(hostnameOf('')).toBe('')
  })
})

describe('deriveWidgetName', () => {
  it('uses the first line for text kinds', () => {
    expect(deriveWidgetName({ kind: 'note', content: 'Standup agenda\n- x' })).toBe('Standup agenda')
  })
  it('uses the hostname for url kinds', () => {
    expect(deriveWidgetName({ kind: 'webview', content: 'https://news.ycombinator.com' })).toBe('news.ycombinator.com')
  })
  it('walks Tiptap JSON for a page', () => {
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quarterly plan' }] }]
    })
    expect(deriveWidgetName({ kind: 'page', content: doc })).toBe('Quarterly plan')
  })
  it('is empty for kinds with no natural content name', () => {
    expect(deriveWidgetName({ kind: 'calculator', content: '1+1' })).toBe('')
  })
})

describe('widgetDisplayName precedence', () => {
  it('prefers a manual title over everything', () => {
    expect(widgetDisplayName(w({ kind: 'webview', title: 'Bank login', content: 'https://hsbc.com' }))).toBe('Bank login')
  })
  it('falls back to content-derived when there is no title', () => {
    expect(widgetDisplayName(w({ kind: 'sticky', content: 'Remember the milk' }))).toBe('Remember the milk')
  })
  it('falls back to the passed kind label when content yields nothing', () => {
    expect(widgetDisplayName(w({ kind: 'table', content: '' }), 'Roadmap Q3')).toBe('Roadmap Q3')
  })
  it('falls back to a friendly kind name when there is nothing else', () => {
    expect(widgetDisplayName(w({ kind: 'webview', content: '' }))).toBe('Browser')
  })
})

describe('truncateName', () => {
  it('ellipsizes past the max', () => {
    expect(truncateName('x'.repeat(80), 10)).toHaveLength(10)
    expect(truncateName('x'.repeat(80), 10).endsWith('…')).toBe(true)
  })
  it('leaves short names untouched', () => {
    expect(truncateName('short')).toBe('short')
  })
})
