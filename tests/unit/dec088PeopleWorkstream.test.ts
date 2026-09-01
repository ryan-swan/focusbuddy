import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractPeople } from '../../src/main/ai/peopleExtract'
import { setPeopleDirectory } from '../../src/main/peopleDirectory'
import { classifyCapture } from '../../src/main/ai/intentClassify'
import type { DirectoryPerson } from '../../src/main/peopleDirectory'

// ── DEC-088 — Phase 2 of the demo-feedback plan: the People workstream ──────
// People get their own pill/drawer at the confirm stop (the demo buried them
// under Desk), capture text seeds directory-grounded person mentions, and an
// ambiguous single name becomes the drawer's question ("Which Caleb?") —
// the one-off AI behavior (#4), made a system. Routing an item TO someone
// remains SPEC-027; the drawer says so.

const person = (
  id: string,
  first: string | null,
  last: string | null,
  handle = `${(first ?? id).toLowerCase()}.${(last ?? 'x').toLowerCase()}`
): DirectoryPerson => ({ accountId: id, handle, firstName: first, lastName: last, role: 'member' })

const SWAN = person('a1', 'Caleb', 'Swan', 'caleb.swan')
const JONES = person('a2', 'Caleb', 'Jones', 'caleb.jones')
const MICHAEL = person('a3', 'Michael', 'Roe', 'michael.roe')
const WILL = person('a4', 'Will', 'Barnes', 'will.barnes')

describe('DEC-088 — extractPeople: directory-grounded, deterministic', () => {
  it('an empty directory extracts nobody (honesty over recall)', () => {
    expect(extractPeople('ask caleb about the deck', [])).toEqual({ people: [], clarify: null })
    expect(extractPeople('', [SWAN])).toEqual({ people: [], clarify: null })
  })

  it('a unique first name suggests its person, case-insensitively', () => {
    const r = extractPeople('ask caleb about the deck', [SWAN, MICHAEL])
    expect(r.people).toEqual([{ id: 'a1', title: 'Caleb Swan' }])
    expect(r.clarify).toBeNull()
  })

  it('last names and handles match too', () => {
    expect(extractPeople('ping Swan about it', [SWAN, MICHAEL]).people).toEqual([
      { id: 'a1', title: 'Caleb Swan' }
    ])
    expect(extractPeople('loop in caleb.swan asap', [SWAN, JONES]).people).toEqual([
      { id: 'a1', title: 'Caleb Swan' }
    ])
  })

  it('a possessive still matches; a substring never does', () => {
    expect(extractPeople("caleb's review is due", [SWAN]).people).toHaveLength(1)
    expect(extractPeople('the calebration continues', [SWAN]).people).toHaveLength(0)
  })

  it('a shared first name is the QUESTION, not a guess', () => {
    const r = extractPeople('ask caleb about the deck', [SWAN, JONES])
    expect(r.people).toHaveLength(0)
    expect(r.clarify).toEqual({
      phrase: 'Caleb',
      candidates: [
        { id: 'a1', title: 'Caleb Swan', hint: 'caleb.swan' },
        { id: 'a2', title: 'Caleb Jones', hint: 'caleb.jones' }
      ]
    })
  })

  it('a full name resolves the ambiguity — and a later bare name never rebinds the other person', () => {
    const r = extractPeople('Caleb Swan reviews this; remind caleb friday', [SWAN, JONES])
    expect(r.people).toEqual([{ id: 'a1', title: 'Caleb Swan' }])
    expect(r.clarify).toBeNull()
  })

  it('ONE clarify max — the earliest ambiguous name takes the question', () => {
    const SAM1 = person('b1', 'Sam', 'Ash', 'sam.ash')
    const SAM2 = person('b2', 'Sam', 'Oak', 'sam.oak')
    const r = extractPeople('ask caleb, then ask sam', [SWAN, JONES, SAM1, SAM2])
    expect(r.clarify?.phrase).toBe('Caleb')
    expect(r.people).toHaveLength(0)
  })

  it('common-word names ("Will") match only in their capitalized form', () => {
    expect(extractPeople('will follow up tomorrow', [WILL]).people).toHaveLength(0)
    expect(extractPeople('ask Will about the invoice', [WILL]).people).toEqual([
      { id: 'a4', title: 'Will Barnes' }
    ])
    expect(extractPeople('Will Barnes will follow up', [WILL]).people).toHaveLength(1)
  })

  it('suggestions arrive in text order, capped at four', () => {
    const many = [
      MICHAEL,
      SWAN,
      person('c1', 'Ana', 'Diaz', 'ana.diaz'),
      person('c2', 'Bo', 'Reyes', 'bo.reyes'),
      person('c3', 'Ira', 'Levi', 'ira.levi')
    ]
    const r = extractPeople('ana, then bo, then ira, then michael, then caleb', many)
    expect(r.people.map((p) => p.title)).toEqual(['Ana Diaz', 'Bo Reyes', 'Ira Levi', 'Michael Roe'])
  })
})

describe('DEC-088 — classifyCapture carries the people scan on every path', () => {
  it('the rules fast path returns suggestions from the live directory', async () => {
    setPeopleDirectory([SWAN, MICHAEL])
    try {
      const c = await classifyCapture('todo: ask caleb about the deck')
      expect(c.people).toEqual([{ id: 'a1', title: 'Caleb Swan' }])
      expect(c.personClarify).toBeNull()
    } finally {
      setPeopleDirectory([])
    }
  })
  it('with no directory the fields are honestly empty', async () => {
    const c = await classifyCapture('todo: ask caleb about the deck')
    expect(c.people).toEqual([])
    expect(c.personClarify).toBeNull()
  })
})

// ── source pins ─────────────────────────────────────────────────────────────
const SRC = join(__dirname, '../..', 'src')
const read = (p: string): string => readFileSync(join(SRC, p), 'utf-8')

describe('DEC-088 — the confirm card: People is its own dimension', () => {
  const card = read('renderer/src/components/AttentionConfirmCard.tsx')
  it('five pills, PEOPLE before DESK (who before where)', () => {
    expect(card).toContain("pill('people', 'PEOPLE', peopleValue, peopleAccent)")
    expect(card.indexOf("pill('people'")).toBeLessThan(card.indexOf("pill('desk'"))
    expect(card).toContain('min-[560px]:grid-cols-5')
  })
  it('the drawer asks, and clarify candidates answer', () => {
    expect(card).toContain("'Who is this about or with?'")
    expect(card).toContain('Which “${personClarify.phrase}”?')
    expect(card).toContain('data-testid="person-clarify"')
  })
  it('the deadline question outranks the person question at auto-open (DEC-016)', () => {
    expect(card).toContain("if (c.clarify == null && pc) setOpenDrawer('people')")
  })
  it('the SPEC-027 boundary is stated, not implied', () => {
    expect(card).toContain('it doesn’t send them anything yet')
  })
  it('marked captures still scan (deterministic, no classifier)', () => {
    expect(card.split('scanPeople').length - 1).toBeGreaterThanOrEqual(3)
  })
  it('self is filtered from suggestions and clarify candidates', () => {
    expect(card).toContain('const isSelf = (id: string): boolean =>')
    expect(card).toContain('.filter((c) => !isSelf(c.id))')
  })
})

describe('DEC-088 — wiring pins', () => {
  it('preload exposes scanPeople and the widened classify contract', () => {
    const preload = read('preload/index.ts')
    expect(preload).toContain("ipcRenderer.invoke('workItems:scanPeople', text)")
    expect(preload).toContain('personClarify: {')
  })
  it('main handles the scan against the live directory', () => {
    const ipc = read('main/ipc/index.ts')
    expect(ipc).toContain("ipcMain.handle('workItems:scanPeople'")
  })
  it('capture surfaces prefetch the directory (attempted-guarded, never awaited)', () => {
    const console_ = read('renderer/src/components/CaptureConsole.tsx')
    const card = read('renderer/src/components/AttentionConfirmCard.tsx')
    for (const src of [console_, card])
      expect(src).toContain(
        "if (!usePeopleStore.getState().attempted) void usePeopleStore.getState().load()"
      )
  })
})
