import { useEffect } from 'react'
import Icon from '../Icon'
import { useFeatureVotesStore } from '../../stores/featureVotes'

// Upvote control for a coming-soon / planned product. A vote is the real
// account's, recorded so the team can notify exactly the people who asked once
// the feature is ready to test. The count shown is the server aggregate when the
// backend has answered; before that we show only what we genuinely know, never a
// fabricated number.

export default function UpvoteButton({
  featureKey,
  size = 'sm'
}: {
  featureKey: string
  size?: 'sm' | 'lg'
}): JSX.Element {
  const voted = useFeatureVotesStore((s) => !!s.mine[featureKey])
  const count = useFeatureVotesStore((s) => s.counts[featureKey])
  const synced = useFeatureVotesStore((s) => s.serverSynced)
  const toggle = useFeatureVotesStore((s) => s.toggle)
  const load = useFeatureVotesStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  // Only ever show a number we can stand behind: the real server count, or, if
  // the backend has not answered, the user's own vote as a count of one. Never
  // invent demand.
  const display = synced ? (count ?? 0) : voted ? 1 : 0

  const lg = size === 'lg'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void toggle(featureKey)
      }}
      data-testid={`upvote-${featureKey}`}
      aria-pressed={voted}
      title={voted ? 'You upvoted this. We will let you know when it is ready to test.' : 'Upvote to prioritise this'}
      className={`group inline-flex items-center gap-1.5 rounded-md border transition-colors ${
        lg ? 'px-3 py-2 text-[13px]' : 'px-2 py-1 text-[11px]'
      } ${
        voted
          ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-300'
          : 'border-white/10 bg-white/[0.03] text-stone-400 hover:text-indigo-300 hover:border-indigo-400/40 hover:bg-indigo-500/10'
      }`}
    >
      <Icon name={voted ? 'arrow_circle_up' : 'arrow_upward'} size={lg ? 16 : 13} filled={voted} />
      <span className="tabular-nums font-semibold">{display}</span>
      {lg && <span className="font-medium">{voted ? 'Upvoted' : 'Upvote'}</span>}
    </button>
  )
}
