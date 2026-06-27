import { useEffect, useRef } from 'react'

// A dependency-free emoji picker: a searchable grid of common emoji grouped into
// a few categories. Deliberately curated rather than the full Unicode set, which
// keeps it fast and avoids pulling in a heavy emoji library. Picking one inserts
// it into the message draft.

const GROUPS: Array<{ name: string; emojis: string[] }> = [
  {
    name: 'Smileys',
    emojis: [
      '😀', '😄', '😁', '😆', '😅', '😂', '🙂', '😉', '😊', '😍', '😘', '😜', '🤪', '🤔', '🤨', '😎',
      '🥳', '😏', '😬', '😴', '😮', '😢', '😭', '😤', '😱', '🥺', '😇', '🙃', '😋', '🤤', '😐', '😶'
    ]
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '👊', '✊', '🤝', '💪', '👀', '👋', '🤙', '✌️', '🤞', '🫶', '🤌']
  },
  {
    name: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💯', '🔥', '✨', '⭐', '🌟', '💫', '🎉']
  },
  {
    name: 'Work',
    emojis: ['✅', '❌', '⚠️', '📌', '📎', '📅', '🗓️', '⏰', '🚀', '💡', '📈', '📉', '🎯', '🛠️', '🧠', '☕']
  },
  {
    name: 'Objects',
    emojis: ['🎁', '🍕', '🍰', '🎂', '🍻', '🥂', '🏆', '🎵', '📷', '💻', '📱', '💰', '📚', '✏️', '🔑', '🐛']
  }
]

export function EmojiPicker({
  onPick,
  onClose
}: {
  onPick: (emoji: string) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on an outside click, armed after this tick so the opening click doesn't
  // immediately dismiss it.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute z-30 bottom-full mb-1 left-0 w-[280px] rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-soft)] shadow-2xl p-2"
      data-testid="emoji-picker"
    >
      <div className="max-h-[240px] overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.name} className="mb-1.5">
            <div className="px-1 py-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-50)]">{g.name}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  data-testid={`emoji-${e}`}
                  onClick={() => onPick(e)}
                  className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-[var(--surface-sunken)] text-[18px]"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
