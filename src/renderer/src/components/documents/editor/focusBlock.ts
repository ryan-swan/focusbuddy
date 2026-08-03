// Adds a `fb-focus-block` class to the top-level block that currently holds the
// selection. Focus mode (a class on the editor container) uses it to dim every
// other block so the writer's eye stays on the line they are working on.
//
// This is purely a decoration: it never changes the document, so it is safe to
// keep installed even when focus mode is off, because the dimming CSS only takes
// effect inside a `.fb-focus-mode` container. Interactive-only, so it never
// reaches the headless HTML<->JSON converter and cannot affect the doc schema.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const focusBlockKey = new PluginKey('fbFocusBlock')

export const FocusBlock = Extension.create({
  name: 'fbFocusBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: focusBlockKey,
        props: {
          decorations(state) {
            const { selection, doc } = state
            const $head = selection.$head
            // Resolve the top-level block (depth 1) containing the cursor.
            if ($head.depth < 1) return DecorationSet.empty
            const from = $head.before(1)
            const node = doc.nodeAt(from)
            if (!node) return DecorationSet.empty
            return DecorationSet.create(doc, [
              Decoration.node(from, from + node.nodeSize, { class: 'fb-focus-block' })
            ])
          }
        }
      })
    ]
  }
})
