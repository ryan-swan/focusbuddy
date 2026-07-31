// The inline mention chip (Phase 4.3) — a TipTap atom node that sits INSIDE the
// composer's text, exactly where the user typed it, the way Notion's does.
//
// Built on the two patterns this repo already ships rather than a new one:
// Footnote.tsx is the working `inline: true, atom: true` node, and
// WidgetEmbedNode.tsx is the working atom-node-referencing-a-workspace-object-
// by-id with a React NodeView. This is those two put together.
//
// The node stores only the reference (kind + id + title + icon + owning desk).
// It resolves to real content in the MAIN process at send time — nothing here
// claims the assistant read anything, because nothing here knows.

import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import Icon from '../Icon'

export interface MentionAttrs {
  kind: string
  id: string
  title: string
  icon: string
  taskId: string | null
  conversationKey: string
}

function MentionChipView({ node, selected }: NodeViewProps): JSX.Element {
  const a = node.attrs as unknown as MentionAttrs
  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <span
        data-testid="composer-mention-chip"
        data-mention-kind={a.kind}
        data-mention-id={a.id}
        contentEditable={false}
        title={`${a.title} — referenced for this conversation`}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] mx-[1px] text-[12px] leading-[1.35] border transition-colors ${
          selected
            ? 'border-[rgb(var(--accent)/0.75)] bg-[rgb(var(--accent)/0.20)]'
            : 'border-[rgb(var(--accent)/0.35)] bg-[rgb(var(--accent)/0.12)]'
        } text-[var(--ink-90)]`}
      >
        <Icon name={a.icon || 'attachment'} size={11} className="shrink-0 text-accent" />
        <span className="truncate max-w-[180px]">{a.title}</span>
      </span>
    </NodeViewWrapper>
  )
}

export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: { default: '', parseHTML: (el) => el.getAttribute('data-mention-kind') || '' },
      id: { default: '', parseHTML: (el) => el.getAttribute('data-mention-id') || '' },
      title: { default: '', parseHTML: (el) => el.getAttribute('data-mention-title') || '' },
      icon: { default: 'attachment', parseHTML: (el) => el.getAttribute('data-mention-icon') || 'attachment' },
      taskId: { default: null, parseHTML: (el) => el.getAttribute('data-mention-task') },
      conversationKey: { default: '', parseHTML: (el) => el.getAttribute('data-mention-conv') || '' }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const a = node.attrs as unknown as MentionAttrs
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-mention-kind': a.kind,
        'data-mention-id': a.id,
        'data-mention-title': a.title,
        'data-mention-icon': a.icon,
        'data-mention-task': a.taskId ?? '',
        'data-mention-conv': a.conversationKey
      }),
      `@${a.title}`
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MentionChipView)
  }
})
