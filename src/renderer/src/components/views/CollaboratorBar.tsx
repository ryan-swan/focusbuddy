import type { Collaborator } from '../../lib/presence'

// The presence bar for a shared document: an overlapping stack of collaborator
// avatars, the live editor ringed in green. Hover a face for the handle and
// whether they are editing. Awareness only for now; live cursors come later.

export default function CollaboratorBar({ people }: { people: Collaborator[] }): JSX.Element | null {
  if (!people.length) return null
  const shown = people.slice(0, 5)
  const extra = people.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5 shrink-0" data-testid="livedoc-collaborators" title="People with access">
      {shown.map((p) => (
        <span
          key={p.accountId}
          data-testid={`collab-avatar-${p.accountId}`}
          data-editing={p.editing ? '1' : undefined}
          title={`${p.handle}${p.you ? ' (you)' : ''}${p.editing ? ' — editing now' : ''}`}
          className={`relative inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ${
            p.editing ? 'ring-emerald-400 z-10' : 'ring-white dark:ring-stone-900'
          }`}
          style={{ background: p.color }}
        >
          {p.initials}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-300 text-[10px] font-semibold text-stone-700 ring-2 ring-white dark:bg-stone-700 dark:text-stone-200 dark:ring-stone-900">
          +{extra}
        </span>
      )}
    </div>
  )
}
