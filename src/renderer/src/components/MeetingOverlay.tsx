import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useMeetingRoomStore } from '../stores/meetingRoom'
import { usePresenceStore } from '../stores/presence'

// PlexiMeet live room: the multi-party meeting window, mounted once at the app
// root. Renders the incoming-invite card when someone rings you in, and a tiled
// gallery of real peer-to-peer video while you are in a room. Nothing is faked: a
// tile shows "connecting" until its peer connection is actually up, and a peer
// that drops is removed rather than frozen.

function Video({ stream, muted, mirrored }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean }): JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.srcObject !== stream) el.srcObject = stream
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`} />
}

function ControlButton({ icon, label, active, danger, onClick }: { icon: string; label: string; active?: boolean; danger?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
        danger ? 'bg-rose-500 text-white hover:bg-rose-600' : active ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}

function initials(handle: string): string {
  return handle.replace(/^@/, '').slice(0, 2).toUpperCase()
}

export default function MeetingOverlay(): JSX.Element | null {
  const status = useMeetingRoomStore((s) => s.status)
  const title = useMeetingRoomStore((s) => s.title)
  const localStream = useMeetingRoomStore((s) => s.localStream)
  const participants = useMeetingRoomStore((s) => s.participants)
  const muted = useMeetingRoomStore((s) => s.muted)
  const cameraOff = useMeetingRoomStore((s) => s.cameraOff)
  const error = useMeetingRoomStore((s) => s.error)
  const incomingInvite = useMeetingRoomStore((s) => s.incomingInvite)
  const leave = useMeetingRoomStore((s) => s.leave)
  const invite = useMeetingRoomStore((s) => s.invite)
  const toggleMute = useMeetingRoomStore((s) => s.toggleMute)
  const toggleCamera = useMeetingRoomStore((s) => s.toggleCamera)
  const acceptInvite = useMeetingRoomStore((s) => s.acceptInvite)
  const dismissInvite = useMeetingRoomStore((s) => s.dismissInvite)

  const presencePeers = usePresenceStore((s) => s.peers)
  const [showInvite, setShowInvite] = useState(false)

  const remote = useMemo(() => Object.values(participants), [participants])
  // Teammates online who are not already in the room, for the invite picker.
  const invitable = useMemo(
    () => Object.values(presencePeers).filter((p) => !participants[p.accountId]),
    [presencePeers, participants]
  )

  // Incoming invite while not in a room: a compact ringing card.
  if (status === 'idle' && incomingInvite) {
    return (
      <div className="fixed bottom-5 right-5 z-[200] w-[320px] rounded-2xl bg-stone-900 text-white shadow-2xl border border-white/10 p-4" data-testid="meeting-invite">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold">
            {initials(incomingInvite.from.handle)}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate">{incomingInvite.from.handle}</p>
            <p className="text-[12px] text-white/60 truncate">invited you to {incomingInvite.title ?? 'a meeting'}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={dismissInvite} data-testid="meeting-invite-dismiss" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/10 text-white text-[13px] font-medium hover:bg-white/20">
            Dismiss
          </button>
          <button onClick={() => void acceptInvite()} data-testid="meeting-invite-join" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600">
            <Icon name="video_call" size={16} /> Join
          </button>
        </div>
      </div>
    )
  }

  if (status === 'idle') return null

  const tileCount = remote.length + 1
  const cols = Math.ceil(Math.sqrt(tileCount))

  return (
    <div className="fixed inset-0 z-[200] bg-stone-950/95 flex flex-col" data-testid="meeting-window">
      <div className="flex items-center gap-3 px-5 py-3 text-white">
        <Icon name="groups" size={20} className="text-rose-400" filled />
        <h2 className="text-[15px] font-semibold truncate">{title || 'Meeting'}</h2>
        <span className="text-[12px] text-white/50" data-testid="meeting-count">
          {tileCount} {tileCount === 1 ? 'person' : 'people'}
        </span>
        {status === 'joining' && <span className="text-[12px] text-white/50">Joining…</span>}
      </div>

      <div className="flex-1 min-h-0 px-5 pb-2 overflow-auto">
        <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {/* Self */}
          <div className="relative rounded-xl overflow-hidden bg-stone-900 border border-white/10 min-h-[140px]">
            {localStream && !cameraOff ? (
              <Video stream={localStream} muted mirrored />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-[22px] font-semibold text-white">You</span>
              </div>
            )}
            <span className="absolute bottom-2 left-2 text-[12px] text-white/90 bg-black/40 rounded px-1.5 py-0.5">You{muted ? ' · muted' : ''}</span>
          </div>

          {/* Remote participants */}
          {remote.map((p) => (
            <div key={p.accountId} className="relative rounded-xl overflow-hidden bg-stone-900 border border-white/10 min-h-[140px]" data-testid={`meeting-tile-${p.accountId}`}>
              {p.stream ? (
                <Video stream={p.stream} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-[22px] font-semibold text-white">{initials(p.handle)}</span>
                  <span className="text-[12px] text-white/50">{p.connected ? 'No video' : 'Connecting…'}</span>
                </div>
              )}
              <span className="absolute bottom-2 left-2 text-[12px] text-white/90 bg-black/40 rounded px-1.5 py-0.5">{p.handle}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="px-5 py-2 text-[12px] text-rose-300 bg-rose-500/10 text-center">{error}</div>}

      <div className="relative flex items-center justify-center gap-3 py-4">
        <ControlButton icon={muted ? 'mic_off' : 'mic'} label={muted ? 'Unmute' : 'Mute'} active={!muted} onClick={toggleMute} />
        <ControlButton icon={cameraOff ? 'videocam_off' : 'videocam'} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} active={!cameraOff} onClick={toggleCamera} />
        <div className="relative">
          <ControlButton icon="person_add" label="Invite people" active={showInvite} onClick={() => setShowInvite((v) => !v)} />
          {showInvite && (
            <>
              <div className="fixed inset-0 z-[201]" onClick={() => setShowInvite(false)} />
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[202] w-64 rounded-xl bg-stone-800 border border-white/10 shadow-xl p-2 max-h-72 overflow-auto" data-testid="meeting-invite-picker">
                <p className="px-2 py-1 text-[11px] text-white/50">Invite a teammate who is online</p>
                {invitable.length === 0 ? (
                  <p className="px-2 py-3 text-[12px] text-white/50 text-center">No teammates online to invite right now.</p>
                ) : (
                  invitable.map((p) => (
                    <button
                      key={p.accountId}
                      onClick={() => { invite({ accountId: p.accountId, handle: p.handle }); setShowInvite(false) }}
                      data-testid={`meeting-invite-${p.accountId}`}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/10 text-left"
                    >
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{initials(p.handle)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12.5px] text-white truncate">{p.handle}</span>
                        {(p.status === 'away' || p.status === 'busy') && <span className="block text-[10px] text-white/40">{p.status}</span>}
                      </span>
                      <Icon name="add" size={15} className="text-white/60" />
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <ControlButton icon="call_end" label="Leave meeting" danger onClick={leave} />
      </div>
    </div>
  )
}
