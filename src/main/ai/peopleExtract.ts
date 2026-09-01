// DEC-088 — capture-time people extraction, deterministic and
// directory-grounded. "Caleb needs to review this" should arrive at the
// confirm stop with Caleb already suggested as a person mention — but ONLY
// a Caleb the workspace genuinely has. The directory is the whole universe:
// no model call, no guessing, and an empty directory extracts nobody (an
// empty answer is honest; a fabricated name is not — peopleDirectory.ts).
//
// Matching, in precedence order (a stronger match consumes the person):
//   1. full name  ("Caleb Swan")  — case-insensitive; two words rarely collide
//   2. handle     ("caleb.swan")  — case-insensitive; handles are unique
//   3. first/last name ("Caleb")  — case-insensitive, EXCEPT names that are
//      also common English words (Will, Mark, Grace…), which must appear
//      exactly as the directory capitalizes them, or they'd match the verb.
//
// A single-name match shared by SEVERAL people is not a suggestion — it is
// the question. The first such name (in text order) comes back as `clarify`
// so the People drawer can ask "Which Caleb?" — the demo's one-off AI
// behavior (#4), made a system. One clarify max: the confirm stop asks ONE
// question (DEC-016), and the deadline question still outranks this one at
// the auto-open (the card enforces that).
//
// Every suggestion is visible and accent-marked at the confirm stop before
// anything files — the stop is the safety net that lets matching stay
// permissive about case.

import { personDisplayName, type DirectoryPerson } from '../peopleDirectory'

export interface PersonSuggestion {
  id: string
  title: string
}

export interface PersonClarify {
  /** The name as the directory capitalizes it — shown in the question. */
  phrase: string
  candidates: Array<{ id: string; title: string; hint: string }>
}

export interface PeopleScan {
  people: PersonSuggestion[]
  clarify: PersonClarify | null
}

const MAX_PEOPLE = 4

/** First/last names that are also everyday English words — these match only
 *  in the directory's own capitalization, so "will follow up" never becomes
 *  a person. Sentence-initial collisions remain possible; the visible,
 *  accent-marked confirm stop is the answer to those, not a longer list. */
const COMMON_WORD_NAMES = new Set([
  'will', 'bill', 'mark', 'grace', 'art', 'may', 'june', 'april', 'dawn',
  'rose', 'guy', 'frank', 'jack', 'hope', 'faith', 'joy', 'penny', 'ray',
  'rob', 'pat', 'gene', 'miles', 'lane', 'chase', 'dean', 'clay', 'drew',
  'chuck', 'sandy', 'wade', 'sunny', 'skip', 'buck', 'hunter', 'chip'
])

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Word-boundary search; returns the match index or -1. */
function findWord(text: string, word: string, caseSensitive: boolean): number {
  if (!word) return -1
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${esc(word)}(?![\\p{L}\\p{N}_])`, caseSensitive ? 'u' : 'iu')
  const m = re.exec(text)
  return m ? m.index : -1
}

export function extractPeople(text: string, directory: DirectoryPerson[]): PeopleScan {
  if (!text.trim() || directory.length === 0) return { people: [], clarify: null }

  const bound = new Map<string, number>() // accountId -> first match index
  const bind = (p: DirectoryPerson, at: number): void => {
    const cur = bound.get(p.accountId)
    if (cur === undefined || at < cur) bound.set(p.accountId, at)
  }

  // 1 — full names, then 2 — handles: unambiguous by construction.
  for (const p of directory) {
    const full = [p.firstName, p.lastName].filter(Boolean).join(' ')
    if (full.includes(' ')) {
      const at = findWord(text, full, false)
      if (at >= 0) bind(p, at)
    }
  }
  for (const p of directory) {
    if (bound.has(p.accountId)) continue
    const at = findWord(text, p.handle, false)
    if (at >= 0) bind(p, at)
  }

  // 3 — single names. Group the directory by each name it answers to, then
  // scan: one owner = a suggestion, several = the question.
  const byName = new Map<string, DirectoryPerson[]>()
  for (const p of directory) {
    for (const n of [p.firstName, p.lastName]) {
      if (!n) continue
      const key = n.toLowerCase()
      const list = byName.get(key) ?? []
      list.push(p)
      byName.set(key, list)
    }
  }
  let clarify: PersonClarify | null = null
  let clarifyAt = Infinity
  for (const [name, owners] of byName) {
    const display = owners
      .map((o) => [o.firstName, o.lastName].find((x) => x?.toLowerCase() === name))
      .find(Boolean) as string
    const at = findWord(text, display, COMMON_WORD_NAMES.has(name))
    if (at < 0) continue
    // A name one of whose owners is ALREADY bound (full name, handle) is
    // satisfied: "Caleb Swan… ask Caleb…" refers to Swan again, and binding
    // the OTHER Caleb here would be a silent wrong guess.
    if (owners.some((o) => bound.has(o.accountId))) continue
    const unbound = owners
    if (unbound.length === 1) {
      bind(unbound[0], at)
    } else if (at < clarifyAt) {
      clarifyAt = at
      clarify = {
        phrase: display,
        candidates: unbound.map((o) => ({
          id: o.accountId,
          title: personDisplayName(o),
          hint: o.handle || o.role
        }))
      }
    }
  }

  const people = [...bound.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, MAX_PEOPLE)
    .map(([id]) => {
      const p = directory.find((d) => d.accountId === id)!
      return { id, title: personDisplayName(p) }
    })
  return { people, clarify }
}
