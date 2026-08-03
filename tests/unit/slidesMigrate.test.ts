import { describe, it, expect } from 'vitest'
import { migrateSlidesBody } from '@shared/slidesMigrate'
import { applyThemeToDeck, BUILTIN_THEMES, layoutElements } from '@shared/slideThemes'
import type { SlidesBody } from '@shared/types'

// Legacy decks must convert to the element model deterministically and without
// losing content; v2 decks pass through.

describe('migrateSlidesBody', () => {
  it('converts a v1 title+bullets slide into title and body elements', () => {
    const v1: SlidesBody = {
      slides: [
        { id: 's1', title: 'Hello', bullets: ['one', 'two'], notes: 'say hi', layout: 'bullets' }
      ]
    }
    const out = migrateSlidesBody(v1)
    expect(out.schemaVersion).toBe(2)
    const s = out.slides[0]
    expect(s.elements?.length).toBe(2)
    const title = s.elements!.find((e) => e.styleRole === 'title')
    const body = s.elements!.find((e) => e.styleRole === 'body')
    expect(title?.type).toBe('text')
    // title text preserved
    expect(title?.type === 'text' && title.paragraphs[0].runs[0].text).toBe('Hello')
    // bullets become body paragraphs
    expect(body?.type === 'text' && body.paragraphs.map((p) => p.runs[0].text)).toEqual(['one', 'two'])
    // legacy 'bullets' layout maps to 'title-content'
    expect(s.layout).toBe('title-content')
    // notes preserved
    expect(s.notes).toBe('say hi')
  })

  it('a title slide gets only a centered title element', () => {
    const out = migrateSlidesBody({ slides: [{ id: 's', title: 'Deck', bullets: [], notes: '', layout: 'title' }] })
    expect(out.slides[0].elements?.length).toBe(1)
    expect(out.slides[0].elements![0].styleRole).toBe('title')
  })

  it('is idempotent on an already-migrated body', () => {
    const once = migrateSlidesBody({ slides: [{ id: 's', title: 'X', bullets: ['a'], notes: '', layout: 'bullets' }] })
    const twice = migrateSlidesBody(once)
    expect(twice.slides[0].elements?.length).toBe(once.slides[0].elements?.length)
    expect(twice.schemaVersion).toBe(2)
  })
})

describe('themes', () => {
  it('layoutElements returns themed placeholders', () => {
    const els = layoutElements('title-content', BUILTIN_THEMES[0])
    expect(els.length).toBe(2)
    expect(els.some((e) => e.styleRole === 'title')).toBe(true)
  })

  it('applyThemeToDeck restyles role-tagged text but keeps structure', () => {
    const base = migrateSlidesBody({ slides: [{ id: 's', title: 'T', bullets: ['b'], notes: '', layout: 'bullets' }] })
    const themed = applyThemeToDeck(base, BUILTIN_THEMES[1]) // midnight
    const title = themed.slides[0].elements!.find((e) => e.styleRole === 'title')
    expect(title?.type === 'text' && title.paragraphs[0].runs[0].color).toBe(BUILTIN_THEMES[1].titleStyle.color)
    expect(themed.theme).toBe('midnight')
  })
})
