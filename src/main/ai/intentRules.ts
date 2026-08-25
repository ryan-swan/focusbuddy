// Deterministic intent rules (Attention S5; ARCHITECTURE §6 + R011).
//
// The capture classifier's FIRST pass: hard triggers that resolve without any
// model call — most captures ("remind me to…", "fyi:", "schedule a…") never
// pay model latency at all, which is what makes the R011 budget (classified
// capture ≤ standup baseline + 1s) structurally safe. The model (Haiku,
// purpose 'intent_classify') is only the fallback for genuinely ambiguous
// text, and ITS failure falls back further to loose_thought — a capture is
// never lost and never blocked.
//
// Also here: the deadline-phrase machinery behind DEC-016's Q1 rule — the ONE
// clarifying question, composer-side, firing only on an UNANCHORED deadline
// phrase on an actionable class. A resolvable phrase ("by Thursday",
// "tomorrow") becomes due_at silently; an unresolvable one ("before the
// launch", "asap") triggers the question. 0.70 is the named confidence
// constant, recalibrated against attentionPrecision() over time.
//
// Dependency-free and pure: unit tests drive every rule table directly.

export const Q1_CONFIDENCE_THRESHOLD = 0.7

export type IntentClass =
  | 'action'
  | 'review'
  | 'scheduling'
  | 'fyi'
  | 'acknowledgment'
  | 'discussion'
  | 'loose_thought'
  | 'direct'

export interface RuleClassification {
  intentClass: IntentClass
  confidence: number
  /** Which hard trigger fired; absent = no rule matched (model territory). */
  trigger?: string
}

const ACTIONABLE: ReadonlySet<IntentClass> = new Set(['action', 'review', 'scheduling'])

export function isActionableClass(c: IntentClass): boolean {
  return ACTIONABLE.has(c)
}

// Ordered — first match wins. Specific verbs before generic ones.
const HARD_TRIGGERS: ReadonlyArray<{ trigger: string; re: RegExp; intentClass: IntentClass }> = [
  { trigger: 'fyi-prefix', re: /^(fyi|note to self|for the record)\b[:,]?\s*/i, intentClass: 'fyi' },
  {
    trigger: 'ack-request',
    re: /\b(acknowledge|confirm (receipt|you (got|received))|just confirming)\b/i,
    intentClass: 'acknowledgment'
  },
  {
    trigger: 'review-verb',
    re: /\b(review|approve|approval|sign[- ]?off|feedback on|look over|proofread)\b/i,
    intentClass: 'review'
  },
  {
    trigger: 'schedule-verb',
    re: /\b(schedule|reschedule|book (a|the|time)|calendar|set up a (call|meeting|sync)|meet (on|at|next)|30[- ]?min(ute)? (sync|call|meeting))\b/i,
    intentClass: 'scheduling'
  },
  {
    trigger: 'discussion-verb',
    re: /\b(discuss|talk (about|through)|bring up (at|in)|agenda|next 1[:.]1|next one[- ]on[- ]one)\b/i,
    intentClass: 'discussion'
  },
  {
    trigger: 'action-verb',
    re: /\b(remind me|need to|have to|must|don'?t forget|make sure (i|we|to)|follow up|todo|to-do|task:)\b/i,
    intentClass: 'action'
  },
  // Idea-capture language files lightly (the decay tier), even when it wears
  // a verb like "flesh out": an idea is a thought to keep, not yet a task.
  // Ordered AFTER the explicit action verbs so "need to flesh out the pricing
  // idea by Friday" still routes as the action it states.
  {
    trigger: 'idea-signal',
    re: /\b(idea|brainstorm|concept|what if|shower thought|random thought)\b/i,
    intentClass: 'loose_thought'
  },
  // A direct question the assistant is not answering inline becomes a
  // needs-answer ACTION (the synthesis's own merge of the question route).
  { trigger: 'question-mark', re: /\?\s*$/, intentClass: 'action' }
]

/** The deterministic first pass. Returns undefined when no rule fires. */
export function classifyByRules(text: string): RuleClassification | undefined {
  const t = text.trim()
  if (!t) return { intentClass: 'loose_thought', confidence: 0.9, trigger: 'empty' }
  for (const rule of HARD_TRIGGERS) {
    if (rule.re.test(t)) return { intentClass: rule.intentClass, confidence: 0.95, trigger: rule.trigger }
  }
  // Short fragments with no verbs and no trigger read as idle capture — the
  // decay tier's population. Longer prose without a trigger goes to the model.
  const words = t.split(/\s+/).length
  if (words <= 4 && !/\b(do|make|send|call|write|fix|build|get|buy)\b/i.test(t)) {
    return { intentClass: 'loose_thought', confidence: 0.75, trigger: 'short-fragment' }
  }
  return undefined
}

// ── Deadline phrases (Q1 machinery) ─────────────────────────────────────────

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export interface DeadlineScan {
  /** The phrase found, verbatim (for the Q1 question's copy). */
  phrase: string
  /** ISO-8601 when resolvable; null = UNANCHORED → the Q1 trigger. */
  dueAt: string | null
}

function endOfDay(d: Date): string {
  const out = new Date(d)
  out.setHours(17, 0, 0, 0)
  return out.toISOString()
}

/** Find a deadline-like phrase and try to anchor it. Resolvable: today,
 *  tonight, tomorrow, eod/eow, end of day/week, weekday names ("by Thursday" →
 *  the NEXT such weekday), next week. Unresolvable deadline language ("asap",
 *  "by the launch", "before the meeting") returns dueAt:null. */
export function scanDeadline(text: string, now: Date): DeadlineScan | null {
  const t = text.toLowerCase()
  const anchored =
    /\b(?:by|before|due|until)\s+(today|tonight|tomorrow|eod|eow|end of (?:the )?day|end of (?:the )?week|next week|(?:next )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/.exec(
      t
    ) ?? /\b(today|tonight|tomorrow)\b/.exec(t)
  if (anchored) {
    const phrase = anchored[0]
    const word = anchored[1] ?? anchored[0]
    const base = new Date(now)
    if (word === 'today' || word === 'tonight' || word === 'eod' || word.startsWith('end of')) {
      if (word === 'eow' || word.includes('week')) {
        const d = new Date(base)
        d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7 * 0)) // this Friday (or today if Friday)
        return { phrase, dueAt: endOfDay(d) }
      }
      return { phrase, dueAt: endOfDay(base) }
    }
    if (word === 'tomorrow') {
      const d = new Date(base)
      d.setDate(d.getDate() + 1)
      return { phrase, dueAt: endOfDay(d) }
    }
    if (word === 'next week') {
      const d = new Date(base)
      d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7)) // next Monday
      return { phrase, dueAt: endOfDay(d) }
    }
    const dayName = word.replace(/^next\s+/, '')
    const idx = WEEKDAYS.indexOf(dayName)
    if (idx >= 0) {
      const d = new Date(base)
      const delta = (idx - d.getDay() + 7) % 7 || 7 // always forward
      d.setDate(d.getDate() + delta + (word.startsWith('next ') && delta <= 0 ? 7 : 0))
      return { phrase, dueAt: endOfDay(d) }
    }
  }
  // Deadline-LIKE but unanchorable — the Q1 trigger.
  const vague = /\b(asap|as soon as possible|soon|by (?:the )?(?!way\b)[a-z]+(?:\s[a-z]+)?\b|before (?:the )?[a-z]+)\b/.exec(
    t
  )
  if (vague && /\b(asap|as soon as possible|by|before|due)\b/.test(vague[0])) {
    return { phrase: vague[0], dueAt: null }
  }
  return null
}

/** DEC-016 Q1: should the composer ask its one question? Only for an
 *  unanchored deadline phrase on an actionable class (the named-recipient
 *  trigger cannot fire while routing is self-only). Hard at-most-one. */
export function needsDeadlineClarification(
  intentClass: IntentClass,
  scan: DeadlineScan | null
): boolean {
  return isActionableClass(intentClass) && scan !== null && scan.dueAt === null
}

/** A short title from a capture: first sentence-ish, trimmed, capped. */
export function titleFromCapture(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+|\n/)[0] ?? ''
  const t = first.replace(/^(fyi|note to self|for the record)\b[:,]?\s*/i, '').trim()
  return (t.length > 120 ? `${t.slice(0, 117)}…` : t) || 'Untitled work item'
}
