import { describe, it, expect } from 'vitest'
import { extractEntities } from '@shared/entityExtract'

// Unit lock for the PURE content entity-extraction floor (plexi-brain P2.7 — Layer 2:
// "write Sarah anywhere → the brain picks her up"). This reads person/org entities OUT
// of free-form canvas prose (the complement to P2's verb-anchored extractPersonName).
//
// THE MODEL (real-data lesson): a PERSON is recognized only in a PERSON-RELATIONSHIP
// CONTEXT — a relational cue immediately precedes the name ("email Sarah", "assigned to
// Greg", "with Priya"). A bare capitalized noun-phrase with no cue ("the Retrieval
// Architecture", "open Notion") is DECLINED. This is the ONE signal that separates real
// names from the sea of shape-identical capitalized noun-phrases the corpus is full of
// (product names, doc-structure nouns, jargon) — no shape/frequency rule can. See the
// header of src/shared/entityExtract.ts for the dry-sim evidence (shape+corrob → 1,110
// junk nodes; context-gate → dozens).
//
// THE KEEL (DEC-011 §D safe-asymmetry): the failure direction MUST be a MISSED entity
// (harmless — a bare-standing name stays findable via P2.5), NEVER a FALSE entity (a
// capitalized common word minted as a person pollutes the graph and corrupts cross-room
// recall once P3 unifies it). So these locks are dominated by the false-positive guards.
//
// ORGANIZATIONS are context-INDEPENDENT: an org-suffix phrase ("Globex LLC") is high-
// precision on its own and does not need a cue.

const cands = (t: string) => extractEntities(t)
const names = (t: string) =>
  cands(t).filter((e) => e.type === 'person').map((e) => e.name)
const orgs = (t: string) =>
  cands(t).filter((e) => e.type === 'organization').map((e) => e.name)
// Names the floor is CONFIDENT about (minted immediately — NOT flagged for corroboration).
const confidentNames = (t: string) =>
  cands(t).filter((e) => e.type === 'person' && !e.needsCorroboration).map((e) => e.name)
// Single-token candidates the floor returns but DEFERS to the driver's corroboration gate.
const tentativeNames = (t: string) =>
  cands(t).filter((e) => e.type === 'person' && e.needsCorroboration).map((e) => e.name)

describe('extractEntities — finds real people in a PERSON-RELATIONSHIP context', () => {
  it('a bare single name after an address verb is caught — as tentative (needs corroboration)', () => {
    // "email Sarah" — a person cue precedes; single-token → flagged needsCorroboration
    // (the driver mints it only if "Sarah" recurs across ≥2 sources).
    expect(names('please email Sarah the deck')).toContain('Sarah')
    expect(tentativeNames('please email Sarah the deck')).toContain('Sarah')
  })

  it('a first + last name after a cue is a CONFIDENT entity (minted immediately)', () => {
    // "spoke with Sarah Chen" — cue "with" + a two-token full name = high-precision.
    expect(confidentNames('spoke with Sarah Chen about the deck')).toContain('Sarah Chen')
  })

  it('multiple cued people in one note are all caught (confidently)', () => {
    // "handoff to Michael Dean" + "reviewed by Priya Nair" — two cues, two full names.
    const got = confidentNames('handoff to Michael Dean, then reviewed by Priya Nair')
    expect(got).toContain('Michael Dean')
    expect(got).toContain('Priya Nair')
  })

  it('the "assigned to <Name>" two-word cue is recognized', () => {
    expect(confidentNames('the task is assigned to Priya Nair now')).toContain('Priya Nair')
  })

  it('dedupes repeated cued mentions of the same person', () => {
    const got = names('ask Sarah, then remind Sarah, then tell Sarah')
    expect(got.filter((n) => n === 'Sarah').length).toBe(1)
  })

  it('a name followed by punctuation is not clipped (regression: "Priya Nair," → full name)', () => {
    expect(names('handoff to Priya Nair, review later')).toContain('Priya Nair')
  })

  it('internal apostrophes/hyphens survive edge-punctuation stripping (O’Brien, Jean-Luc)', () => {
    expect(names('the review from O’Brien is in')).toContain('O’Brien')
    expect(names('assigned to Jean-Luc today')).toContain('Jean-Luc')
  })

  it('internal-capital names survive (McQuillian, MacDonald) — the founders regression', () => {
    // Two-token full names after a cue; McQuillian has an internal capital (Mc+Quillian).
    const got = confidentNames('a note from Caleb Wilton and later from Ryan McQuillian')
    expect(got).toContain('Caleb Wilton')
    expect(got).toContain('Ryan McQuillian')
  })
})

describe('extractEntities — finds organizations by suffix (context-INDEPENDENT, high precision)', () => {
  it('an org suffix marks the phrase as an organization, no cue needed', () => {
    expect(orgs('the vendor agreement is with Acme Corp')).toContain('Acme Corp')
  })

  it('LLC / Inc / Labs are recognized org suffixes', () => {
    expect(orgs('paid Globex LLC and Initech Inc this month')).toEqual(
      expect.arrayContaining(['Globex LLC', 'Initech Inc'])
    )
  })
})

describe('extractEntities — THE GATE: no relational cue → no person (the core fix)', () => {
  it('a bare capitalized noun-phrase heading is NOT a person — "Retrieval Architecture", "Brain Map"', () => {
    // These have no person cue → declined. This is the class that dominated the 1,652 junk.
    expect(names('the Retrieval Architecture section')).toHaveLength(0)
    expect(names('see the Brain Map for details')).toHaveLength(0)
    expect(names('Object Ontology and Project Task')).toHaveLength(0)
  })

  it('a product/tool name with no cue is NOT a person — "Slack", "Figma"', () => {
    // No relational cue precedes these → declined outright.
    expect(names('the Figma file and the Slack thread')).toHaveLength(0)
    expect(names('exported to the Notion workspace')).not.toContain('Notion')
  })

  it('HONEST LIMIT: a product in a "from/to <X>" slot is TENTATIVE, never confident', () => {
    // "from Notion" is grammatically identical to "from Sarah" — the cue gate can't tell
    // them apart. So a single-token product after a cue is returned FLAGGED (needs
    // corroboration); the driver drops it unless it recurs across ≥2 sources. It is NEVER
    // minted as a CONFIDENT person. This is the safe-asymmetry residual, stated honestly.
    expect(confidentNames('exported the notes from Notion')).not.toContain('Notion')
    expect(tentativeNames('exported the notes from Notion')).toContain('Notion')
  })

  it('a capitalized common word with no cue is NOT a person — "Operator", "Convergence"', () => {
    expect(names('the Operator reads the mission first')).not.toContain('Operator')
    expect(names('Convergence is the goal here')).not.toContain('Convergence')
  })
})

describe('extractEntities — THE KEEL: false positives are DECLINED (safe-asymmetry)', () => {
  it('a cued day/month word is never a person — "by Friday", "in March"', () => {
    expect(names('the deck is due by Friday and again in March')).toHaveLength(0)
  })

  it('a cued stop-word/verb/doc-noun is not a person — "to Phase", "with Both", "email Update"', () => {
    expect(names('move to Phase two now')).not.toContain('Phase')
    expect(names('go with Both options')).not.toContain('Both')
    expect(names('please email Update to the team')).not.toContain('Update')
  })

  it('a sentence-initial capital is never a person (no preceding cue possible)', () => {
    expect(names('Ship the release today')).toHaveLength(0)
    expect(names('Please review the deck. Update the numbers.')).toHaveLength(0)
  })

  it('lowercase words are never entities', () => {
    expect(extractEntities('email sarah the deck about acme by friday')).toHaveLength(0)
  })

  it('empty / whitespace / null-ish input returns nothing, never throws', () => {
    expect(extractEntities('')).toHaveLength(0)
    expect(extractEntities('   \n  ')).toHaveLength(0)
    // @ts-expect-error — prove the guard holds for a non-string
    expect(extractEntities(null)).toHaveLength(0)
  })
})

// ── P2.7-HARDENING: the REAL junk classes from the 1,652-node live corpus ──────────
// Each `it` uses the ACTUAL junk string the old floor produced. red-then-green: these
// would ALL have minted a person under the pre-hardening floor. Grouped by root cause.
// (Cued forms are used where the class is about the NAME shape, so the cue gate isn't
// what's doing the work — the shape guard is.)
describe('extractEntities — P2.7 real-corpus junk is DECLINED (red-then-green locks)', () => {
  it('possessives are not names — "Caleb\'s", "Claude\'s", "Apex\'s" (28 live junk nodes)', () => {
    // Even WITH a cue, a possessive token is rejected (a possessive is not a name).
    expect(names("email Caleb's team the plan")).not.toContain("Caleb's")
    expect(names("reviewed Claude's output and Apex's pricing")).toEqual(
      expect.not.arrayContaining(["Claude's", "Apex's"])
    )
    expect(names('thanks Greg’s notes')).not.toContain('Greg’s')
  })

  it('hyphenated COMPOUNDS are not names — "Claude-Code-built", "Mission-control", "Conducting-AI" (197 live)', () => {
    // Lowercase-led ("-built","-control") or ALLCAPS-tail ("-AI","-OS") segment → rejected.
    // Distinct from a hyphenated NAME (Jean-Luc), which is kept (locked above).
    expect(names('assigned to Claude-Code-built prototype')).not.toContain('Claude-Code-built')
    expect(names('go to Mission-control folder')).not.toContain('Mission-control')
    expect(names('meet with Co-working space')).not.toContain('Co-working')
    expect(names('email Conducting-AI reference')).not.toContain('Conducting-AI')
    expect(names('to Agent-OS-led-only path')).not.toContain('Agent-OS-led-only')
  })

  it('a both-name-shaped hyphen compound ("Cross-Source","Google-Maps") is never CONFIDENT', () => {
    // Shape-identical to a real hyphen name (Jean-Luc) — single-token ⇒ needsCorroboration;
    // the driver drops it (each appears once in the corpus). The lock: never minted confidently.
    expect(confidentNames('see the Cross-Source synthesis')).not.toContain('Cross-Source')
    expect(confidentNames('open Google-Maps for directions')).not.toContain('Google-Maps')
  })

  it('phrase fragments / echoes are not names — "Apex Apex", "Project Project", "ResilientIQ OpenAI ChatGPT"', () => {
    expect(names('email Apex Apex the tool')).not.toContain('Apex Apex')
    expect(names('to Project Project section')).not.toContain('Project Project')
    // acronym-tailed tool names (IQ/AI/GPT end in caps) are not name-tokens
    expect(names('with ResilientIQ OpenAI ChatGPT comparison')).toHaveLength(0)
  })

  it('imperative TASK VERBS are not people even after a cue — "Dial", "Log", "Submit"', () => {
    for (const verb of ['Dial', 'Log', 'Read', 'Build', 'Submit', 'Schedule']) {
      expect(names(`please to ${verb} the thing`)).not.toContain(verb)
    }
  })

  it('a BARE org suffix with no preceding name is not an org — "Company", "Group", "Tech", "Foundation" (live junk)', () => {
    expect(orgs('the Company decided fast')).not.toContain('Company')
    expect(orgs('our Group met Tuesday')).not.toContain('Group')
    expect(orgs('the Foundation and the Group and Tech teams')).toHaveLength(0)
  })

  it('the mixed real-junk sentence yields ZERO confident false entities (and never hangs)', () => {
    const junk = "email Caleb's Claude-Code-built Mission-control to Apex Apex Company Group"
    expect(confidentNames(junk)).toHaveLength(0)
    expect(orgs(junk)).toHaveLength(0)
  })
})
