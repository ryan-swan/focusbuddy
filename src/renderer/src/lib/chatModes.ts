// The conversation modes framework (A4, AI-07 — ruling R19).
//
// A mode is a property of the CONVERSATION: worn as a visible chip by the
// composer, switched by a deliberate tap, sticky for that conversation
// (persisted on its row), never auto-detected. Discovery is the first mode of
// several — adding one is an entry here plus a member in AiChatMode, and the
// chip, menu, and persistence come for free.
//
// Distinct from the R14 send pills (Auto / Search / Ask), which route WHERE
// one message goes; the conversation mode governs Plexii's posture across
// turns. The two compose.

import type { AiChatMode } from '@shared/types'

export interface ChatModeDef {
  id: AiChatMode
  label: string
  icon: string
  // One honest sentence for the mode menu: what changes when you pick it.
  blurb: string
}

export const CHAT_MODES: ReadonlyArray<ChatModeDef> = [
  {
    id: 'chat',
    label: 'Chat',
    icon: 'forum',
    blurb: 'The everyday assistant: you ask, Plexii answers, researches, and acts.'
  },
  {
    id: 'discovery',
    label: 'Discovery',
    icon: 'plexii:discover',
    blurb:
      'Plexii leads with questions and options, growing an idea toward a desk. Nothing is created until you say the word.'
  }
]

export function chatModeDef(id: AiChatMode): ChatModeDef {
  return CHAT_MODES.find((m) => m.id === id) ?? CHAT_MODES[0]
}
