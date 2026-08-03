// The clarifying-question protocol, in one dependency-free module.
//
// Two halves that must not drift apart: the prompt section that TEACHES the
// model when it may ask (inserted into the chat system prompt only when the
// calling surface declared it can render a question card), and the validator
// that decides whether a "question" value the model actually wrote is
// renderable. They live together here, unit-testable in isolation — the same
// reason chatJson.ts and streamingEnvelope.ts are their own modules.
//
// The gate matters as much as the feature: chat:send is shared by the focus
// chat, dashboard cards, the field editor and StreamDeckAI, none of which
// render a question card. A model taught to ask on those surfaces produces
// turns that dead-end in a question the user cannot see or answer. Returning
// '' for them is the contract, and tests/unit/chatQuestion.test.ts locks it.

import type { ChatQuestion } from '@shared/types'

export const QUESTION_MIN_OPTIONS = 2
export const QUESTION_MAX_OPTIONS = 5

// Decide whether a raw envelope `question` value is a renderable ChatQuestion.
// Applied on BOTH paths — the streaming scanner's carve-out and the durable
// whole-envelope parse — so the card and the completed response can never
// disagree about whether a question exists. Cleaning is conservative: trim,
// drop empties and duplicates, cap at 5 options. Anything that leaves fewer
// than 2 real choices is not a question the card can honestly render.
export function validateChatQuestion(raw: unknown): ChatQuestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const q = raw as Record<string, unknown>
  const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : ''
  if (!prompt) return null
  if (!Array.isArray(q.options)) return null
  const seen = new Set<string>()
  const options: string[] = []
  for (const o of q.options) {
    if (typeof o !== 'string') continue
    const t = o.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    options.push(t)
  }
  if (options.length < QUESTION_MIN_OPTIONS) return null
  return {
    prompt,
    options: options.slice(0, QUESTION_MAX_OPTIONS),
    // Absent means true: the composer is normally a valid way to answer.
    allowFreeText: q.allowFreeText !== false
  }
}

// The ask-protocol section of the chat system prompt. Empty string when the
// surface did not opt in — the model must not even know asking is possible
// there. The "when to ask" rules are the part that makes questions dynamic
// rather than decorative: asking is reserved for genuine ambiguity where a
// wrong guess is expensive, never a reflex.
export function questionProtocolSection(supportsQuestions: boolean | undefined): string {
  if (!supportsQuestions) return ''
  return (
    '\n\nCLARIFYING QUESTIONS: the envelope may carry ONE optional "question" field, rendered as a choice card the user answers with a click:\n' +
    '{ "reply": "", "question": { "prompt": "Which desk should this tracker go on?", "options": ["Marketing desk", "A new desk"], "allowFreeText": true }, "actions": [] }\n' +
    'Ask ONLY when the request is genuinely ambiguous AND acting on the wrong reading is expensive: the target is unclear (which desk / document / table), the scope is unclear (this desk vs the whole workspace), the request could be destructive, or a build request has two or more materially different shapes.\n' +
    'RULES FOR ASKING:\n' +
    '- If the context above already answers it, do not ask.\n' +
    '- At most ONE question per response. 2-5 short, concrete, mutually exclusive options. Set "allowFreeText" false only when nothing outside the listed options is valid.\n' +
    '- When you ask, "actions" MUST be []. Never act on a guess you are simultaneously questioning. Put a short lead-in in "reply", or leave it "".\n' +
    '- Never re-ask a question the user already answered. Never ask about trivia. When a reasonable default exists, act on it instead of interrupting.\n' +
    '- Key order in your JSON: "reply" first, then "question", then "actions".'
  )
}
