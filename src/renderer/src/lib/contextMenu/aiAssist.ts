// The universal AI Assist submenu (deliverable 7). It is identical wherever it
// appears: the same actions, the same tone and language submenus, the same
// Custom Prompt. It is the one sanctioned three-level exception to the
// two-level rule, because Change Tone and Translate need leaf children; every
// other section stays within two levels.
//
// Cognitive load: the brief listed ten tones and a long language list. Per the
// critic, the defaults here are trimmed to a focused set and the long tail
// lives behind Custom tone / Custom language, which the editable preview field
// makes free-form anyway.

import { MenuSection, type MenuContribution, type MenuContext } from './types'
import { runAiAssist, hasWorkableText } from './actions'

// Direct one-tap rewrites.
const DIRECT_ACTIONS: Array<{ id: string; label: string; instruction: string }> = [
  { id: 'expand', label: 'Expand', instruction: 'Expand this text with more detail and supporting points, keeping the same voice.' },
  { id: 'simplify', label: 'Simplify', instruction: 'Simplify this text so it is easy to read, removing jargon and shortening sentences.' },
  { id: 'summarise', label: 'Summarise', instruction: 'Summarise this text concisely, keeping the key points.' },
  { id: 'rewrite', label: 'Rewrite', instruction: 'Rewrite this text to read more clearly and naturally, preserving the meaning.' },
  { id: 'grammar', label: 'Fix Grammar', instruction: 'Fix the spelling, grammar and punctuation. Change nothing else.' },
  { id: 'clarity', label: 'Improve Clarity', instruction: 'Improve the clarity and flow without changing the meaning or adding new information.' },
  { id: 'continue', label: 'Continue Writing', instruction: 'Continue writing from where this text ends, in the same voice and style. Return the original text followed by the continuation.' }
]

const TONES = ['Professional', 'Casual', 'Friendly', 'Direct', 'Concise', 'Formal']
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese']

// Build the single AI Assist contribution. Returns null when there is no text
// to work on, so the section collapses rather than showing a dead row.
export function buildAiAssistContribution(ctx: MenuContext): MenuContribution | null {
  if (!hasWorkableText(ctx)) return null

  const direct: MenuContribution[] = DIRECT_ACTIONS.map((a, i) => ({
    id: `core/ai/${a.id}`,
    section: MenuSection.AiAssist,
    priority: i,
    label: a.label,
    onSelect: (c) => runAiAssist(c, a.label, a.instruction)
  }))

  const changeTone: MenuContribution = {
    id: 'core/ai/tone',
    section: MenuSection.AiAssist,
    priority: 20,
    label: 'Change Tone',
    icon: 'campaign',
    children: [
      ...TONES.map<MenuContribution>((tone) => ({
        id: `core/ai/tone/${tone.toLowerCase()}`,
        section: MenuSection.AiAssist,
        priority: 0,
        label: tone,
        onSelect: (c) => runAiAssist(c, `Tone ${tone}`, `Rewrite this text in a ${tone.toLowerCase()} tone, keeping the meaning.`)
      })),
      {
        id: 'core/ai/tone/custom',
        section: MenuSection.AiAssist,
        priority: 99,
        label: 'Custom tone...',
        onSelect: (c) => runAiAssist(c, 'Custom tone', 'Rewrite this text in the following tone: ', true)
      }
    ]
  }

  const translate: MenuContribution = {
    id: 'core/ai/translate',
    section: MenuSection.AiAssist,
    priority: 21,
    label: 'Translate',
    icon: 'translate',
    children: [
      ...LANGUAGES.map<MenuContribution>((lang) => ({
        id: `core/ai/translate/${lang.toLowerCase()}`,
        section: MenuSection.AiAssist,
        priority: 0,
        label: lang,
        onSelect: (c) => runAiAssist(c, `Translate to ${lang}`, `Translate this text into ${lang}. Return only the translation.`)
      })),
      {
        id: 'core/ai/translate/custom',
        section: MenuSection.AiAssist,
        priority: 99,
        label: 'Custom language...',
        onSelect: (c) => runAiAssist(c, 'Translate', 'Translate this text into the following language: ', true)
      }
    ]
  }

  const custom: MenuContribution = {
    id: 'core/ai/custom',
    section: MenuSection.AiAssist,
    priority: 30,
    label: 'Custom Prompt...',
    icon: 'auto_awesome',
    onSelect: (c) => runAiAssist(c, 'Custom prompt', '', true)
  }

  return {
    id: 'core/ai-assist',
    section: MenuSection.AiAssist,
    priority: 0,
    label: 'AI Assist',
    icon: 'auto_awesome',
    children: [...direct, changeTone, translate, custom]
  }
}
