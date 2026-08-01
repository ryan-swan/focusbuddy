import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  decomposeProposal,
  bornConfidence,
  kindProducesNode,
  nodeTypeForKind,
  sourceTableForKind,
  type CapturableProposal
} from '@shared/capture'
import { isNodeType, PROVENANCE_EDGE } from '@shared/brainGraph'
import { projectRoomOrTask, projectKnowledge, projectDocument } from '@shared/projection'

// Unit lock for the PURE capture-as-decomposition core (plexi-brain P2 increment 1).
// The DB-driver (src/main/brain/capture.ts) is exercised by the headless capture
// harness + in-app; these tests lock the pure DECISIONS: which kind→node-type, which
// source-table (the convergence guarantee vs projection), the confidence stamp
// (carrying the P1 negation/quantifier/attribution locks), and the store-anyway
// posture (a kind that produces no node returns null, never throws).

const prop = (over: Partial<CapturableProposal> = {}): CapturableProposal => ({
  id: over.id ?? 'p1',
  kind: over.kind ?? 'create-task',
  title: over.title,
  body: over.body,
  notes: over.notes,
  content: over.content
})

describe('capture — kind → node type (the structural map)', () => {
  it('maps the durable-object kinds to universal node types', () => {
    // DEC-017: kinds that write base kind='task' rows (desks) mint 'project' —
    // the convergence law with projectRoomOrTask's desk mapping.
    expect(nodeTypeForKind('create-task')).toBe('project')
    expect(nodeTypeForKind('create-todo-list')).toBe('project')
    expect(nodeTypeForKind('create-knowledge-entry')).toBe('note')
    expect(nodeTypeForKind('create-document')).toBe('document')
    expect(nodeTypeForKind('create-page')).toBe('document')
    expect(nodeTypeForKind('schedule-event')).toBe('event')
    expect(nodeTypeForKind('create-table')).toBe('artifact')
  })

  it('every mapped type is a real ontology node type (no invented types)', () => {
    for (const kind of [
      'create-task',
      'create-knowledge-entry',
      'create-document',
      'schedule-event',
      'create-table',
      'compose-mail'
    ]) {
      const t = nodeTypeForKind(kind)
      if (t) expect(isNodeType(t)).toBe(true)
    }
  })

  it('ephemeral/navigational kinds produce NO node (capture is additive, not total)', () => {
    for (const kind of [
      'navigate-to',
      'focus-widget',
      'arrange-widgets',
      'drill-in-widget',
      'open-url',
      'start-focus-session',
      'link-widgets',
      'toggle-todo-item',
      'delete-widget'
    ]) {
      expect(kindProducesNode(kind), `${kind} must not produce a node`).toBe(false)
      expect(decomposeProposal(prop({ kind }), 'whatever i said')).toBeNull()
    }
  })
})

describe('capture — the CONVERGENCE guarantee (capture agrees with projection.ts)', () => {
  // A captured task and a later-projected task MUST land on the same brain node —
  // same (source_table, source_id) → idempotent upsert → ONE node. That only holds
  // if capture's kind→(type, source_table) agrees with projection's mappers.
  it('a captured task writes the same (source_table, type) projection would', () => {
    const projected = projectRoomOrTask({
      id: 't-123',
      kind: 'task',
      title: 'Email Sarah the Q3 deck',
      description: '',
      parentId: 'room-1',
      updatedAt: 1
    })
    expect(sourceTableForKind('create-task')).toBe(projected.sourceTable) // both 'nodes'
    expect(nodeTypeForKind('create-task')).toBe(projected.node.type) // both 'task'
  })

  it('a captured knowledge entry converges with projectKnowledge (fb_knowledge → note)', () => {
    const projected = projectKnowledge({ id: 'k1', title: 'A fact', body: 'x', tags: [], updatedAt: 1 })
    expect(sourceTableForKind('create-knowledge-entry')).toBe(projected.sourceTable) // 'fb_knowledge'
    expect(nodeTypeForKind('create-knowledge-entry')).toBe(projected.node.type) // 'note'
  })

  it('a captured document converges with projectDocument (documents → document)', () => {
    const projected = projectDocument({ id: 'd1', title: 'Deck', docType: 'slides', updatedAt: 1 })
    expect(sourceTableForKind('create-document')).toBe(projected.sourceTable) // 'documents'
    expect(nodeTypeForKind('create-document')).toBe(projected.node.type) // 'document'
  })
})

describe('capture — the born confidence stamp (carries the P1 classifier locks)', () => {
  it('a flat, unhedged assertion is stamped typed', () => {
    expect(bornConfidence('email Sarah the Q3 deck by Friday').confidence).toBe('typed')
  })

  // The carried §10 lock, re-asserted at the CAPTURE boundary: a hazard must never
  // produce a `typed` node. These are the negation/quantifier/attribution cases the
  // P1 classifier red-green-locked; capture's wiring must not regress them.
  it('NEGATION never becomes typed at capture', () => {
    const c = bornConfidence('the launch is not delayed').confidence
    expect(c).not.toBe('typed')
  })
  it('QUANTIFIER/HEDGE never becomes typed at capture', () => {
    const c = bornConfidence('we might ship around Friday').confidence
    expect(c).not.toBe('typed')
  })
  it('ATTRIBUTION never becomes typed at capture', () => {
    const c = bornConfidence('Bob thinks the deck is ready').confidence
    expect(c).not.toBe('typed')
  })

  it('an optional LLM pass can only DOWNGRADE, never upgrade (downgradeOnly wired)', () => {
    // Clean text → classifier says typed; an LLM pass proposing 'inferred' downgrades.
    expect(bornConfidence('email Sarah the deck', 'inferred').confidence).toBe('inferred')
    // An LLM pass proposing 'typed' on a hazard-flagged utterance CANNOT raise it.
    expect(bornConfidence('Bob thinks the deck is ready', 'typed').confidence).not.toBe('typed')
  })
})

describe('capture — decomposeProposal end to end (pure)', () => {
  it('produces a full capture plan for a create-task', () => {
    const plan = decomposeProposal(
      prop({ kind: 'create-task', title: 'Email Sarah the Q3 deck' }),
      'email Sarah the Q3 deck by Friday'
    )
    expect(plan).not.toBeNull()
    expect(plan!.sourceTable).toBe('nodes')
    expect(plan!.node.type).toBe('project') // a captured task row IS a desk (DEC-017 convergence)
    expect(plan!.node.title).toBe('Email Sarah the Q3 deck')
    expect(plan!.node.confidence).toBe('typed')
    expect(plan!.provenance.edgeType).toBe(PROVENANCE_EDGE)
    expect(plan!.provenance.dstSourceTable).toBe('activity_log')
    expect(plan!.changeLog).toEqual({ field: 'created', fromVal: null, toVal: 'project', actor: 'capture' })
  })

  it('falls back to the utterance for a title when the proposal carries none', () => {
    const plan = decomposeProposal(prop({ kind: 'create-task', title: undefined }), 'buy milk on the way home')
    expect(plan!.node.title).toBe('buy milk on the way home')
  })

  it('never throws on an empty/garbled utterance (store-anyway posture)', () => {
    expect(() => decomposeProposal(prop({ kind: 'create-task' }), '')).not.toThrow()
    const plan = decomposeProposal(prop({ kind: 'create-task', title: undefined }), '')
    expect(plan!.node.title).toBe('Untitled capture')
    // Empty utterance → the classifier says ambiguous (nothing to trust).
    expect(plan!.node.confidence).toBe('ambiguous')
  })
})

// ── The 5th DEC-014 grep-lock — the FIRST over capture code ─────────────────────
// The four P1 locks scan brainGraph/projection/importance/spineRerank. Capture is
// net-new attack surface for the hardcoded-taxonomy trap: a kind→bucket map could
// smuggle a domain name. This lock scans capture.ts source (comments stripped) and
// fails if any domain/department/pillar word appears as a string literal.
describe('DEC-014 grep-lock — no hardcoded domain taxonomy in the capture core', () => {
  const DOMAIN_WORDS = [
    'engineering',
    'marketing',
    'sales',
    'finance',
    'operations',
    'legal',
    'product',
    'human resources',
    'health',
    'fitness',
    'family',
    'wedding',
    'department'
  ]

  it('capture.ts contains no domain-word string literal (comments stripped)', () => {
    const raw = readFileSync(resolve(__dirname, '../../src/shared/capture.ts'), 'utf-8')
    // Strip // line comments so a domain word in an explanatory comment is allowed.
    const code = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .toLowerCase()
    for (const w of DOMAIN_WORDS) {
      expect(code.includes(`'${w}'`), `capture.ts must not contain the domain literal '${w}'`).toBe(false)
      expect(code.includes(`"${w}"`), `capture.ts must not contain the domain literal "${w}"`).toBe(false)
    }
  })

  it('the capture source declares the DEC-014 guard-rail (self-documenting lock)', () => {
    const src = readFileSync(resolve(__dirname, '../../src/shared/capture.ts'), 'utf-8')
    expect(src).toContain('DEC-014')
    expect(src.toLowerCase()).toContain('never')
  })
})
