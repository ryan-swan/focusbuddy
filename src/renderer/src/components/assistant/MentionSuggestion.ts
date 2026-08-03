// The "@" typeahead extension (Phase 4.3). Same shape as the document editor's
// SlashCommand — @tiptap/suggestion driving a ReactRenderer popup — pointed at
// workspace objects instead of block insertions.
//
// Where the candidates come from, and why:
//   • window.api.search.query — the deep-content search CommandCenter already
//     uses. It covers documents, widgets, desks, rooms, files and PlexiBrain,
//     which is exactly the set the resolver can read.
//   • useNodeStore — desks and rooms, offered before the user has typed enough
//     for search to run (searchAll needs 2 characters). Real data, not a
//     placeholder list.
//   • usePeopleStore — the org's members, fetched from the signal server and
//     published to main so the resolver can read one (Phase 4.7). They are not
//     in the search index at all, so they need their own source. Signed out, or
//     in a personal workspace, the directory is EMPTY and nobody is offered —
//     the picker never shows a person the resolver would have to refuse.

import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import MentionList from './MentionList'
import type { MentionListHandle } from './MentionList'
import { useNodeStore } from '../../stores/nodes'
import { personMentionCandidates, usePeopleStore } from '../../lib/peopleDirectory'
import {
  MENTION_CAP,
  activeMentions,
  mentionFromNode,
  mentionFromSearchHit,
  mentionKey,
  type MentionRef
} from '../../lib/assistantMentions'

const MAX_OPTIONS = 8

export interface MentionSuggestionHooks {
  // The conversation the chip will belong to, read at the moment of the query
  // so a mention picked after a conversation switch belongs to the right one.
  conversationKey: () => string
  // What this conversation already references — for dedupe and the cap.
  current: () => readonly MentionRef[]
  // Called when a reference is chosen, so the store gains it alongside the
  // inline chip (plan P1: two renderings of ONE set).
  onPick: (ref: MentionRef) => void
}

async function candidatesFor(query: string, conversationKey: string): Promise<MentionRef[]> {
  const q = query.trim()
  const out: MentionRef[] = []
  const push = (r: MentionRef | null): void => {
    if (r && !out.some((o) => mentionKey(o) === mentionKey(r))) out.push(r)
  }

  // Desks and rooms come from the already-loaded node store, so the very first
  // keystroke has something real to show.
  const nodes = useNodeStore.getState().nodes
  const lowered = q.toLowerCase()
  for (const n of nodes) {
    if (n.archived) continue
    if (q && !n.title.toLowerCase().includes(lowered)) continue
    push(mentionFromNode(n, conversationKey))
    if (out.length >= MAX_OPTIONS) break
  }

  // People, from whatever the app has genuinely loaded. Offered from the first
  // keystroke like desks, because the directory is already in memory.
  for (const person of personMentionCandidates(usePeopleStore.getState().people, q, conversationKey)) {
    push(person)
  }

  // Deep search covers everything else, but only once it has enough to go on —
  // searchAll returns nothing under two characters, so calling it sooner would
  // just be a wasted round trip.
  if (q.length >= 2) {
    try {
      const hits = await window.api.search.query(q)
      for (const h of hits) {
        push(mentionFromSearchHit(h, conversationKey))
        if (out.length >= MAX_OPTIONS * 2) break
      }
    } catch {
      // Search being unavailable costs the extra kinds, not the picker.
    }
  }
  return out.slice(0, MAX_OPTIONS)
}

export const MentionSuggestion = Extension.create<{ hooks: MentionSuggestionHooks | null }>({
  name: 'assistantMentionSuggestion',

  addOptions() {
    return { hooks: null }
  },

  addProseMirrorPlugins() {
    const getHooks = (): MentionSuggestionHooks | null => this.options.hooks
    return [
      Suggestion({
        editor: this.editor,
        char: '@',
        // A mention can follow a word boundary anywhere in the sentence — the
        // whole point is chips mid-sentence, not only at the start of a line.
        startOfLine: false,
        // Titles in this workspace routinely contain spaces ("Q3 Launch Brief",
        // "Mention test desk"). A picker that closed at the first space could
        // only ever find single-word objects, which is most of the workspace
        // unreachable. allowedPrefixes keeps it from firing inside an email
        // address: "@" only opens the picker at the start of a word.
        allowSpaces: true,
        allowedPrefixes: [' '],
        items: async ({ query }: { query: string }): Promise<MentionRef[]> => {
          const hooks = getHooks()
          if (!hooks) return []
          const already = activeMentions(hooks.current(), hooks.conversationKey())
          if (already.length >= MENTION_CAP) return []
          const found = await candidatesFor(query, hooks.conversationKey())
          // Never offer something this conversation already references — the
          // add would be a no-op and the picker would look broken.
          const takenKeys = new Set(already.map(mentionKey))
          return found.filter((r) => !takenKeys.has(mentionKey(r)))
        },
        command: ({ editor, range, props }) => {
          const ref = props as unknown as MentionRef
          const hooks = getHooks()
          if (!hooks) return
          const already = activeMentions(hooks.current(), hooks.conversationKey())
          if (already.length >= MENTION_CAP) return
          hooks.onPick(ref)
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'mention',
                attrs: {
                  kind: ref.kind,
                  id: ref.id,
                  title: ref.title,
                  icon: ref.icon,
                  taskId: ref.taskId ?? null,
                  conversationKey: ref.conversationKey
                }
              },
              { type: 'text', text: ' ' }
            ])
            .run()
        },
        render: () => {
          let component: ReactRenderer<MentionListHandle> | null = null
          let popup: HTMLDivElement | null = null

          const position = (clientRect: (() => DOMRect | null) | null | undefined): void => {
            if (!popup || !clientRect) return
            const rect = clientRect()
            if (!rect) return
            // The composer sits at the BOTTOM of the panel, so the picker opens
            // upward when there is not enough room beneath the caret.
            const below = window.innerHeight - rect.bottom
            popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 300))}px`
            if (below < 300) {
              popup.style.top = ''
              popup.style.bottom = `${window.innerHeight - rect.top + 6}px`
            } else {
              popup.style.bottom = ''
              popup.style.top = `${rect.bottom + 6}px`
            }
          }

          const atCap = (): boolean => {
            const hooks = getHooks()
            if (!hooks) return false
            return activeMentions(hooks.current(), hooks.conversationKey()).length >= MENTION_CAP
          }

          return {
            onStart: (props) => {
              component = new ReactRenderer(MentionList, {
                props: {
                  items: props.items as MentionRef[],
                  loading: (props.items as MentionRef[]).length === 0,
                  atCap: atCap(),
                  command: (item: MentionRef) => props.command(item)
                },
                editor: props.editor
              })
              popup = document.createElement('div')
              popup.style.position = 'fixed'
              popup.style.zIndex = '400'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              position(props.clientRect)
            },
            onUpdate: (props) => {
              component?.updateProps({
                items: props.items as MentionRef[],
                loading: false,
                atCap: atCap(),
                command: (item: MentionRef) => props.command(item)
              })
              position(props.clientRect)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.remove()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            }
          }
        }
      })
    ]
  }
})
