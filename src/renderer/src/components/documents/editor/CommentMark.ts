import { Mark, mergeAttributes } from '@tiptap/core'

// An inline mark that anchors a comment thread to a span of text. It carries the
// comment's id (the doc_comments root id); because it's a ProseMirror mark it
// moves and splits with the text automatically as the document is edited. The
// thread body lives on the server keyed by this id; the mark is just the anchor.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType
      unsetComment: (commentId: string) => ReturnType
    }
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  // Multiple comments can overlap the same text.
  excludes: '',
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-comment-id'),
        renderHTML: (attrs) => (attrs.commentId ? { 'data-comment-id': attrs.commentId } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'fb-comment' }), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark('comment', { commentId }),
      unsetComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks.comment
          if (!markType) return false
          let changed = false
          state.doc.descendants((node, pos) => {
            if (!node.isText) return
            for (const m of node.marks) {
              if (m.type === markType && m.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, markType)
                changed = true
              }
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        }
    }
  }
})
