import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { useCallStore } from '../stores/call'
import { personDisplayName, personInitials } from '../lib/personName'

// PlexiCam call overlay: the floating call window and the incoming-call card.
// Mounted once at the app root. Renders nothing when there is no call. The video
// is real peer-to-peer media; nothing here is simulated, and a failed connection
// shows an honest error rather than a frozen "connected" state.

function Video({ stream, muted, mirrored }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.srcObject !== stream) el.srcObject = stream
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`h-full w-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
    />
  )
}

function ControlButton({
  icon,
  label,
  active,
  danger,
  onClick
}: {
  icon: string
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
        danger
          ? 'bg-rose-500 text-white hover:bg-rose-600'
          : active
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}

export default function CallOverlay(): JSX.Element | null {
  const status = useCallStore((s) => s.status)
  const peer = useCallStore((s) => s.peer)
  const media = useCallStore((s) => s.media)
  const localStream = useCallStore((s) => s.localStream)
  const remoteStream = useCallStore((s) => s.remoteStream)
  const muted = useCallStore((s) => s.muted)
  const cameraOff = useCallStore((s) => s.cameraOff)
  const error = useCallStore((s) => s.error)
  const accept = useCallStore((s) => s.accept)
  const decline = useCallStore((s) => s.decline)
  const hangup = useCallStore((s) => s.hangup)
  const toggleMute = useCallStore((s) => s.toggleMute)
  const toggleCamera = useCallStore((s) => s.toggleCamera)

  if (status === 'idle') return null

  // Incoming call: a compact card with accept / decline.
  if (status === 'incoming') {
    return (
      <div className="fixed bottom-5 right-5 z-[200] w-[300px] rounded-2xl bg-stone-900 text-white shadow-2xl border border-white/10 p-4" data-testid="call-incoming">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold uppercase">
            {personInitials(peer)}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate">{personDisplayName(peer, 'Someone')}</p>
            <p className="text-[12px] text-white/60">Incoming {media === 'video' ? 'video' : 'audio'} call…</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={decline}
            data-testid="call-decline"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-rose-500 text-white text-[13px] font-medium hover:bg-rose-600"
          >
            <Icon name="call_end" size={16} /> Decline
          </button>
          <button
            onClick={() => void accept()}
            data-testid="call-accept"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600"
          >
            <Icon name="call" size={16} /> Accept
          </button>
        </div>
      </div>
    )
  }

  const statusLabel =
    status === 'calling'
      ? 'Calling…'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'connected'
          ? 'Connected'
          : 'Call ended'

  // Active call window (outgoing/connecting/connected/ended).
  return (
    <div className="fixed bottom-5 right-5 z-[200] w-[360px] rounded-2xl bg-stone-900 text-white shadow-2xl border border-white/10 overflow-hidden" data-testid="call-window">
      <div className="relative aspect-video bg-stone-950">
        {media === 'video' && remoteStream ? (
          <Video stream={remoteStream} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-[22px] font-semibold uppercase">
              {personInitials(peer)}
            </span>
            <p className="text-[13px] text-white/70">{personDisplayName(peer, 'Call')}</p>
          </div>
        )}

        {/* Local self-view */}
        {media === 'video' && localStream && !cameraOff && (
          <div className="absolute bottom-2 right-2 h-[72px] w-[108px] rounded-lg overflow-hidden border border-white/20 bg-stone-800">
            <Video stream={localStream} muted mirrored />
          </div>
        )}

        <div className="absolute top-2 left-3 right-3 flex items-center justify-between">
          <span className="text-[12px] font-medium text-white/90 truncate" data-testid="call-status">
            {personDisplayName(peer, 'Call')} · {statusLabel}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-[12px] text-rose-300 bg-rose-500/10" data-testid="call-error">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 py-3 bg-stone-900">
        <ControlButton icon={muted ? 'mic_off' : 'mic'} label={muted ? 'Unmute' : 'Mute'} active={!muted} onClick={toggleMute} />
        {media === 'video' && (
          <ControlButton
            icon={cameraOff ? 'videocam_off' : 'videocam'}
            label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            active={!cameraOff}
            onClick={toggleCamera}
          />
        )}
        <ControlButton icon="call_end" label="End call" danger onClick={hangup} />
      </div>
    </div>
  )
}
