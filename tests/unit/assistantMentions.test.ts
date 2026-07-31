import { describe, it, expect } from 'vitest'
import {
  MENTION_CAP,
  activeMentions,
  addMention,
  clearConversationMentions,
  isKnownUnresolved,
  isMentionableWidget,
  mentionFromNode,
  mentionFromSearchHit,
  mentionFromWidget,
  mentionKey,
  mentionKindLabel,
  mergeMentionResolution,
  removeMention,
  type MentionRef
} from '../../src/renderer/src/lib/assistantMentions'
import type { FbNode, SearchHit, Widget } from '../../src/shared/types'

// The @-mention reference layer (Phase 4.1), pure and store-free — the same
// pattern as lib/assistantPin. These rules are the only place that decides what
// a reference is and when the set changes; the composer and store just perform.

function ref(partial: Partial<MentionRef> = {}): MentionRef {
  return {
    kind: 'document',
    id: 'd1',
    title: 'Q3 brief',
    icon: 'description',
    conversationKey: 'c1',
    ...partial
  }
}

function widget(partial: Partial<Widget>): Widget {
  return {
    id: 'w1',
    taskId: 't1',
    kind: 'sticky',
    title: 'Widget one',
    content: 'hello',
    x: 0,
    y: 0,
    width: 200,
    height: 160,
    zIndex: 1,
    color: null,
    pinned: false,
    pinnedScreenX: null,
    pinnedScreenY: null,
    pinnedZone: null,
    parentSectionId: null,
    layout: null,
    ...partial
  } as Widget
}

function node(partial: Partial<FbNode>): FbNode {
  return {
    id: 'n1',
    parentId: null,
    kind: 'task',
    title: 'Marketing',
    description: '',
    status: 'open',
    priority: 'medium',
    interest: 'medium',
    importance: 'medium',
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    startedAt: null,
    completedAt: null,
    estimateMinutes: null,
    extensionsMinutes: 0,
    resumeMarkdown: null,
    resumeUpdatedAt: null,
    dueDate: null,
    archived: false,
    isPlan: false,
    sharedFromHandle: null,
    ...partial
  } as FbNode
}

function hit(partial: Partial<SearchHit>): SearchHit {
  return { type: 'document', id: 'x1', title: 'A doc', snippet: '', score: 1, ...partial } as SearchHit
}

describe('mentionKey — identity is composite, because ids are only unique within a kind', () => {
  it('separates a document and a widget that share an id', () => {
    expect(mentionKey({ kind: 'document', id: 'same' })).not.toBe(
      mentionKey({ kind: 'widget', id: 'same' })
    )
  })
})

describe('addMention — dedupe, cardinality, and nothing silently evicted', () => {
  it('adds a reference to its conversation', () => {
    const r = addMention([], ref())
    expect(r.added).toBe(true)
    expect(r.mentions).toHaveLength(1)
    expect(r.duplicate).toBe(false)
    expect(r.rejectedForCap).toBe(false)
  })

  it('collapses a duplicate rather than stacking two identical chips', () => {
    const first = addMention([], ref()).mentions
    const second = addMention(first, ref())
    expect(second.added).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.mentions).toHaveLength(1)
  })

  it('treats the same object in a DIFFERENT conversation as a separate reference', () => {
    const first = addMention([], ref({ conversationKey: 'c1' })).mentions
    const second = addMention(first, ref({ conversationKey: 'c2' }))
    expect(second.added).toBe(true)
    expect(second.mentions).toHaveLength(2)
  })

  it('REFUSES past the cap instead of evicting the oldest — the row must keep describing what rides', () => {
    let list: MentionRef[] = []
    for (let i = 0; i < MENTION_CAP; i++) {
      list = addMention(list, ref({ id: `d${i}` })).mentions
    }
    expect(list).toHaveLength(MENTION_CAP)
    const overflow = addMention(list, ref({ id: 'one-too-many' }))
    expect(overflow.added).toBe(false)
    expect(overflow.rejectedForCap).toBe(true)
    // The critical half of the claim: the set is UNCHANGED. A chip vanishing on
    // its own would mean the row stopped describing what rides the request.
    expect(overflow.mentions).toHaveLength(MENTION_CAP)
    expect(overflow.mentions.map((m) => m.id)).toEqual(list.map((m) => m.id))
  })

  it("counts the cap per conversation, not globally", () => {
    let list: MentionRef[] = []
    for (let i = 0; i < MENTION_CAP; i++) {
      list = addMention(list, ref({ id: `d${i}`, conversationKey: 'c1' })).mentions
    }
    const other = addMention(list, ref({ id: 'fresh', conversationKey: 'c2' }))
    expect(other.added).toBe(true)
    expect(other.rejectedForCap).toBe(false)
  })

  it('preserves insertion order', () => {
    let list: MentionRef[] = []
    list = addMention(list, ref({ id: 'a' })).mentions
    list = addMention(list, ref({ id: 'b' })).mentions
    list = addMention(list, ref({ id: 'c' })).mentions
    expect(list.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('activeMentions / removeMention / clearConversationMentions — scoping is per conversation', () => {
  const mixed: MentionRef[] = [
    ref({ id: 'a', conversationKey: 'c1' }),
    ref({ id: 'b', conversationKey: 'c2' }),
    ref({ id: 'c', conversationKey: 'c1' })
  ]

  it('shows only this conversation, in order', () => {
    expect(activeMentions(mixed, 'c1').map((m) => m.id)).toEqual(['a', 'c'])
  })

  it("removes only the dismissed conversation's copy", () => {
    const shared: MentionRef[] = [
      ref({ id: 'same', conversationKey: 'c1' }),
      ref({ id: 'same', conversationKey: 'c2' })
    ]
    const after = removeMention(shared, 'c1', mentionKey({ kind: 'document', id: 'same' }))
    expect(after).toHaveLength(1)
    expect(after[0].conversationKey).toBe('c2')
  })

  it("clearing a conversation leaves other conversations' references alone", () => {
    const after = clearConversationMentions(mixed, 'c1')
    expect(after.map((m) => m.id)).toEqual(['b'])
  })
})

describe('constructors — a chip renders exactly what was picked, and nothing is invented', () => {
  it('maps a widget, carrying the owning desk so the resolver can read across desks', () => {
    const m = mentionFromWidget(widget({ id: 'w9', taskId: 't3', title: 'Pipeline' }), 'c1')
    expect(m).not.toBeNull()
    expect(m!.kind).toBe('widget')
    expect(m!.id).toBe('w9')
    expect(m!.taskId).toBe('t3')
    expect(m!.title).toBe('Pipeline')
    expect(m!.icon.length).toBeGreaterThan(0)
  })

  it('refuses a widget kind whose content cannot be sent', () => {
    expect(isMentionableWidget('section')).toBe(false)
    expect(mentionFromWidget(widget({ kind: 'section' }), 'c1')).toBeNull()
  })

  it('falls back to a catalog label for an untitled widget rather than an empty chip', () => {
    const m = mentionFromWidget(widget({ title: '' }), 'c1')
    expect(m!.title.length).toBeGreaterThan(0)
  })

  it("uses the app's own vocabulary: a task node is a Desk, a folder node is a Room", () => {
    expect(mentionFromNode(node({ kind: 'task' }), 'c1').kind).toBe('desk')
    expect(mentionFromNode(node({ kind: 'folder' }), 'c1').kind).toBe('room')
  })

  it('gives a desk reference its own id as the owning task', () => {
    const m = mentionFromNode(node({ id: 'n7', kind: 'task' }), 'c1')
    expect(m.taskId).toBe('n7')
  })

  it('maps every search-hit type a resolver can read', () => {
    expect(mentionFromSearchHit(hit({ type: 'document' }), 'c1')!.kind).toBe('document')
    expect(mentionFromSearchHit(hit({ type: 'task' }), 'c1')!.kind).toBe('desk')
    expect(mentionFromSearchHit(hit({ type: 'folder' }), 'c1')!.kind).toBe('room')
    expect(mentionFromSearchHit(hit({ type: 'widget', taskId: 't2' }), 'c1')!.kind).toBe('widget')
    expect(mentionFromSearchHit(hit({ type: 'file' }), 'c1')!.kind).toBe('file')
    expect(mentionFromSearchHit(hit({ type: 'knowledge' }), 'c1')!.kind).toBe('knowledge')
  })

  it('returns NOTHING for hit types with no resolver — a chip that could claim no content is never made', () => {
    expect(mentionFromSearchHit(hit({ type: 'table-row' }), 'c1')).toBeNull()
    expect(mentionFromSearchHit(hit({ type: 'event' }), 'c1')).toBeNull()
    expect(mentionFromSearchHit(hit({ type: 'meeting' }), 'c1')).toBeNull()
    expect(mentionFromSearchHit(hit({ type: 'sign' }), 'c1')).toBeNull()
    expect(mentionFromSearchHit(hit({ type: 'mail' }), 'c1')).toBeNull()
  })

  it('carries a widget hit’s owning desk through, so a cross-desk reference stays resolvable', () => {
    expect(mentionFromSearchHit(hit({ type: 'widget', taskId: 't-other' }), 'c1')!.taskId).toBe(
      't-other'
    )
  })

  it('labels every kind in the union — no kind can ship without a human name', () => {
    for (const k of ['document', 'desk', 'room', 'widget', 'file', 'knowledge', 'person'] as const) {
      expect(mentionKindLabel(k).length).toBeGreaterThan(0)
    }
  })

  it('declares person in the union but never manufactures one from search', () => {
    // People are not in the search index at all (main/db/search.ts). The typeahead
    // sources them separately and only when signed in; no search hit may become one.
    const kinds = (['document', 'task', 'folder', 'widget', 'file', 'knowledge', 'table-row'] as const).map(
      (t) => mentionFromSearchHit(hit({ type: t }), 'c1')?.kind
    )
    expect(kinds).not.toContain('person')
  })
})

describe('resolution — absence of a verdict is not a failure', () => {
  it('renders a reference normally until the server has actually reported on it', () => {
    expect(isKnownUnresolved({}, ref())).toBe(false)
  })

  it('marks a reference broken only when the server reported it produced nothing', () => {
    const r = mergeMentionResolution({}, [{ kind: 'document', id: 'd1', resolved: false }])
    expect(isKnownUnresolved(r, ref({ id: 'd1' }))).toBe(true)
    expect(isKnownUnresolved(r, ref({ id: 'd2' }))).toBe(false)
  })

  it('lets a later verdict overturn an earlier one in both directions', () => {
    let r = mergeMentionResolution({}, [{ kind: 'document', id: 'd1', resolved: true }])
    r = mergeMentionResolution(r, [{ kind: 'document', id: 'd1', resolved: false }])
    expect(isKnownUnresolved(r, ref({ id: 'd1' }))).toBe(true)
    r = mergeMentionResolution(r, [{ kind: 'document', id: 'd1', resolved: true }])
    expect(isKnownUnresolved(r, ref({ id: 'd1' }))).toBe(false)
  })

  it('keeps prior verdicts when a response reports none', () => {
    const prev = mergeMentionResolution({}, [{ kind: 'document', id: 'd1', resolved: false }])
    expect(mergeMentionResolution(prev, [])).toBe(prev)
  })

  it('scopes a verdict by kind as well as id', () => {
    const r = mergeMentionResolution({}, [{ kind: 'widget', id: 'same', resolved: false }])
    expect(isKnownUnresolved(r, ref({ kind: 'widget', id: 'same' }))).toBe(true)
    expect(isKnownUnresolved(r, ref({ kind: 'document', id: 'same' }))).toBe(false)
  })
})
