import { useKnockStore } from '../stores/knock'
import Icon from './Icon'

// The incoming-knock notification. When a teammate knocks to reach you, a small
// card drops into the top-right with their note and three ways to answer: reply
// (opens a chat with them), call back (starts a PlexiCam), or dismiss. It mounts
// at the app root, above everything, and renders nothing when there is no knock.
export default function KnockOverlay(): JSX.Element | null {
  const incoming = useKnockStore((s) => s.incoming)
  const reply = useKnockStore((s) => s.reply)
  const callBack = useKnockStore((s) => s.callBack)
  const dismiss = useKnockStore((s) => s.dismiss)

  if (!incoming) return null

  return (
    <div
      className="fixed top-4 right-4 z-[60] w-80 rounded-xl bg-[var(--surface-raised)] border border-[var(--edge-firm)] shadow-2xl overflow-hidden"
      data-testid="knock-incoming"
    >
      <div className="px-4 py-3 flex items-start gap-2.5">
        <span className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-[rgb(var(--accent)/0.14)] inline-flex items-center justify-center">
          <Icon name="sensor_door" size={17} className="text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[var(--ink-100)]">
            <span className="font-semibold">{incoming.from.handle}</span> knocked
          </div>
          {incoming.note ? (
            <div className="text-[12px] text-[var(--ink-70)] mt-0.5 break-words">{incoming.note}</div>
          ) : (
            <div className="text-[12px] text-[var(--ink-50)] mt-0.5">wants to reach you</div>
          )}
        </div>
        <button onClick={dismiss} className="icon-btn shrink-0" aria-label="Dismiss" data-testid="knock-dismiss">
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="px-3 pb-3 flex items-center gap-2">
        <button
          onClick={() => void reply()}
          data-testid="knock-reply"
          className="flex-1 h-8 rounded-lg bg-accent text-white text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 hover:opacity-90"
        >
          <Icon name="chat_bubble" size={14} /> Reply
        </button>
        <button
          onClick={callBack}
          data-testid="knock-callback"
          className="flex-1 h-8 rounded-lg border border-[var(--edge-soft)] text-[var(--ink-90)] text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[var(--surface-sunken)]"
        >
          <Icon name="videocam" size={14} /> Call back
        </button>
      </div>
    </div>
  )
}
