import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { useMeetingRoomStore, type DockSide } from '../stores/meetingRoom'
import { usePresenceStore } from '../stores/presence'
import { personDisplayName, personInitials } from '../lib/personName'

// PlexiMeet live room, mounted once at the app root. Two presentations:
//  - 'stage': the classic fullscreen room (video gallery + controls).
//  - 'collaborate': the meeting docks to one edge as a movable panel so the rest
//    of Plexi stays the focus and the user can navigate anywhere while the call
//    keeps running (the room lives in a global store, so it survives navigation).
// Nothing is faked: a tile shows "connecting" until its peer connection is up,
// and a peer that drops is removed rather than frozen.

function Video({
  stream,
  muted,
  mirrored,
  contain
}: {
  stream: MediaStream | null
  muted?: boolean
  mirrored?: boolean
  // Screens are shown whole (object-contain) so nothing is cropped; camera tiles
  // fill their frame (object-cover).
  contain?: boolean
}): JSX.Element {
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
      className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'} ${mirrored ? 'scale-x-[-1]' : ''}`}
    />
  )
}

function ControlButton({
  icon,
  label,
  active,
  danger,
  small,
  onClick
}: {
  icon: string
  label: string
  active?: boolean
  danger?: boolean
  small?: boolean
  onClick: () => void
}): JSX.Element {
  const size = small ? 'h-9 w-9' : 'h-11 w-11'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex ${size} items-center justify-center rounded-full transition-colors ${
        danger ? 'bg-rose-500 text-white hover:bg-rose-600' : active ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      <Icon name={icon} size={small ? 17 : 20} />
    </button>
  )
}

export default function MeetingOverlay(): JSX.Element | null {
  const status = useMeetingRoomStore((s) => s.status)
  const title = useMeetingRoomStore((s) => s.title)
  const localStream = useMeetingRoomStore((s) => s.localStream)
  const screenStream = useMeetingRoomStore((s) => s.screenStream)
  const sharingScreen = useMeetingRoomStore((s) => s.sharingScreen)
  const participants = useMeetingRoomStore((s) => s.participants)
  const muted = useMeetingRoomStore((s) => s.muted)
  const cameraOff = useMeetingRoomStore((s) => s.cameraOff)
  const error = useMeetingRoomStore((s) => s.error)
  const incomingInvite = useMeetingRoomStore((s) => s.incomingInvite)
  const layout = useMeetingRoomStore((s) => s.layout)
  const dockSide = useMeetingRoomStore((s) => s.dockSide)
  const transcribing = useMeetingRoomStore((s) => s.transcribing)
  const leave = useMeetingRoomStore((s) => s.leave)
  const invite = useMeetingRoomStore((s) => s.invite)
  const toggleMute = useMeetingRoomStore((s) => s.toggleMute)
  const toggleCamera = useMeetingRoomStore((s) => s.toggleCamera)
  const acceptInvite = useMeetingRoomStore((s) => s.acceptInvite)
  const dismissInvite = useMeetingRoomStore((s) => s.dismissInvite)
  const setLayout = useMeetingRoomStore((s) => s.setLayout)
  const setDockSide = useMeetingRoomStore((s) => s.setDockSide)
  const setTranscribing = useMeetingRoomStore((s) => s.setTranscribing)
  const toggleScreenShare = useMeetingRoomStore((s) => s.toggleScreenShare)

  const presencePeers = usePresenceStore((s) => s.peers)
  const [showInvite, setShowInvite] = useState(false)

  const remote = useMemo(() => Object.values(participants), [participants])

  // Active screen shares to present: my own (when sharing) plus any peer who is
  // presenting. These render whole (object-contain), separate from camera tiles.
  const screens = useMemo(() => {
    const list: Array<{ id: string; label: string; stream: MediaStream; me: boolean }> = []
    if (sharingScreen && screenStream) list.push({ id: 'me', label: 'You', stream: screenStream, me: true })
    for (const p of remote) {
      if (p.screenStream) list.push({ id: p.accountId, label: personDisplayName(p, p.handle), stream: p.screenStream, me: false })
    }
    return list
  }, [sharingScreen, screenStream, remote])
  const invitable = useMemo(
    () => Object.values(presencePeers).filter((p) => !participants[p.accountId]),
    [presencePeers, participants]
  )

  // Escape leaves the meeting ONLY in stage mode. In collaborate mode the user is
  // navigating Plexi with the meeting docked, so Escape must not drop the call.
  useEffect(() => {
    if (status === 'idle' || layout !== 'stage') return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, layout, leave])

  // Incoming invite while not in a room: a compact ringing card.
  if (status === 'idle' && incomingInvite) {
    return (
      // Video stage: forced-dark chrome; white hairlines are relative to the stage, not the theme.
      <div className="fixed bottom-5 right-5 z-[200] w-[320px] rounded-2xl bg-stone-900 text-white shadow-2xl border border-white/10 p-4" data-testid="meeting-invite">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold">
            {personInitials(incomingInvite.from)}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate">{personDisplayName(incomingInvite.from, 'Someone')}</p>
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
  const collaborate = layout === 'collaborate'
  const horizontal = collaborate && (dockSide === 'top' || dockSide === 'bottom')

  const invitePicker = showInvite && (
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
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{personInitials(p)}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] text-white truncate">{personDisplayName(p, p.handle)}</span>
                {(p.status === 'away' || p.status === 'busy') && <span className="block text-[10px] text-white/40">{p.status}</span>}
              </span>
              <Icon name="add" size={15} className="text-white/60" />
            </button>
          ))
        )}
      </div>
    </>
  )

  // Self + remote camera tiles, shared by all layouts. 'grid' is the full stage
  // grid, 'mini' the docked panel, 'strip' the horizontal filmstrip shown under a
  // presentation.
  const tiles = (variant: 'grid' | 'mini' | 'strip'): JSX.Element => {
    const compact = variant !== 'grid'
    const frame =
      variant === 'grid'
        ? 'min-h-[140px]'
        : variant === 'strip'
          ? 'h-full w-auto aspect-video shrink-0'
          : horizontal
            ? 'h-full aspect-video shrink-0'
            : 'w-full shrink-0 aspect-video'
    const avatar = compact ? 'h-10 w-10 text-[15px]' : 'h-16 w-16 text-[22px]'
    return (
      <>
        <div className={`relative rounded-xl overflow-hidden bg-stone-900 border border-white/10 ${frame}`}>
          {localStream && !cameraOff ? (
            <Video stream={localStream} muted mirrored />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`inline-flex ${avatar} items-center justify-center rounded-full bg-white/10 font-semibold text-white`}>You</span>
            </div>
          )}
          <span className="absolute bottom-1.5 left-1.5 text-[11px] text-white/90 bg-black/40 rounded px-1.5 py-0.5">You{muted ? ' · muted' : ''}</span>
        </div>
        {remote.map((p) => (
          <div key={p.accountId} className={`relative rounded-xl overflow-hidden bg-stone-900 border border-white/10 ${frame}`} data-testid={`meeting-tile-${p.accountId}`}>
            {p.stream ? (
              <Video stream={p.stream} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className={`inline-flex ${avatar} items-center justify-center rounded-full bg-white/10 font-semibold text-white`}>{personInitials(p)}</span>
                <span className="text-[11px] text-white/50">{p.connected ? 'No video' : 'Connecting…'}</span>
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 text-[11px] text-white/90 bg-black/40 rounded px-1.5 py-0.5">{personDisplayName(p, p.handle)}</span>
          </div>
        ))}
      </>
    )
  }

  // Screen-share tiles, shown whole. `mini` sizes them for the docked panel.
  const screenTiles = (mini: boolean): JSX.Element => (
    <>
      {screens.map((s) => (
        <div
          key={`screen-${s.id}`}
          className={`relative rounded-xl overflow-hidden bg-black border border-rose-400/30 ${mini ? (horizontal ? 'h-full aspect-video shrink-0' : 'w-full shrink-0 aspect-video') : 'min-h-[140px]'}`}
          data-testid={`meeting-screen-${s.id}`}
        >
          <Video stream={s.stream} muted={s.me} contain />
          <span className="absolute bottom-1.5 left-1.5 text-[11px] text-white/90 bg-black/50 rounded px-1.5 py-0.5 inline-flex items-center gap-1">
            <Icon name="screen_share" size={12} className="text-rose-300" />
            {s.me ? 'Your screen' : `${s.label} · screen`}
          </span>
        </div>
      ))}
    </>
  )

  const controls = (small: boolean): JSX.Element => (
    <div className={`relative flex items-center justify-center gap-2 ${small ? '' : 'gap-3'}`}>
      <ControlButton small={small} icon={muted ? 'mic_off' : 'mic'} label={muted ? 'Unmute' : 'Mute'} active={!muted} onClick={toggleMute} />
      <ControlButton small={small} icon={cameraOff ? 'videocam_off' : 'videocam'} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} active={!cameraOff} onClick={toggleCamera} />
      <ControlButton
        small={small}
        icon={sharingScreen ? 'stop_screen_share' : 'screen_share'}
        label={sharingScreen ? 'Stop sharing your screen' : 'Share your screen'}
        active={sharingScreen}
        onClick={() => void toggleScreenShare()}
      />
      <ControlButton
        small={small}
        icon="record_voice_over"
        label={transcribing ? 'Stop transcribing' : 'Transcribe & summarise'}
        active={transcribing}
        onClick={() => setTranscribing(!transcribing)}
      />
      <div className="relative">
        <ControlButton small={small} icon="person_add" label="Invite people" active={showInvite} onClick={() => setShowInvite((v) => !v)} />
        {invitePicker}
      </div>
      <ControlButton
        small={small}
        icon={collaborate ? 'fullscreen' : 'fullscreen_exit'}
        label={collaborate ? 'Expand to full screen' : 'Collaborate (dock to the side)'}
        onClick={() => setLayout(collaborate ? 'stage' : 'collaborate')}
      />
      <ControlButton small={small} icon="call_end" label="Leave meeting" danger onClick={leave} />
    </div>
  )

  // ── Collaborate: docked panel on the chosen edge, Plexi stays interactive ──
  if (collaborate) {
    const sideCls: Record<DockSide, string> = {
      left: 'top-0 bottom-0 left-0 w-[300px] flex-col border-r',
      right: 'top-0 bottom-0 right-0 w-[300px] flex-col border-l',
      top: 'top-0 left-0 right-0 h-[210px] flex-col border-b',
      bottom: 'bottom-0 left-0 right-0 h-[210px] flex-col border-t'
    }
    const dockButtons: Array<{ side: DockSide; icon: string }> = [
      { side: 'left', icon: 'arrow_back' },
      { side: 'top', icon: 'arrow_upward' },
      { side: 'bottom', icon: 'arrow_downward' },
      { side: 'right', icon: 'arrow_forward' }
    ]
    return (
      <div
        className={`fixed z-[200] flex bg-stone-950/95 backdrop-blur border-white/10 text-white shadow-2xl ${sideCls[dockSide]}`}
        role="dialog"
        aria-label="Meeting"
        data-testid="meeting-window"
        data-meeting-layout="collaborate"
        data-dock-side={dockSide}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
          <Icon name="groups" size={16} className="text-rose-400" filled />
          <span className="text-[13px] font-semibold truncate flex-1">{title || 'Meeting'}</span>
          <span className="text-[11px] text-white/50" data-testid="meeting-count">{tileCount}</span>
          {/* Dock-side picker */}
          <div className="flex items-center gap-0.5">
            {dockButtons.map((d) => (
              <button
                key={d.side}
                onClick={() => setDockSide(d.side)}
                title={`Dock ${d.side}`}
                data-testid={`meeting-dock-${d.side}`}
                className={`h-6 w-6 inline-flex items-center justify-center rounded ${dockSide === d.side ? 'bg-white/20' : 'hover:bg-white/10'}`}
              >
                <Icon name={d.icon} size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className={`flex-1 min-h-0 p-2 overflow-auto flex gap-2 ${horizontal ? 'flex-row' : 'flex-col'}`}>
          {screenTiles(true)}
          {tiles('mini')}
        </div>
        {error && <div className="px-3 py-1 text-[11px] text-rose-300 bg-rose-500/10 text-center shrink-0">{error}</div>}
        <div className="px-2 py-2 border-t border-white/10 shrink-0">{controls(true)}</div>
      </div>
    )
  }

  // ── Stage: the classic fullscreen room ──
  const cols = Math.ceil(Math.sqrt(tileCount))
  return (
    <div className="fixed inset-0 z-[200] bg-stone-950/95 flex flex-col" role="dialog" aria-modal="true" aria-label="Meeting" data-testid="meeting-window" data-meeting-layout="stage">
      <div className="flex items-center gap-3 px-5 py-3 text-white">
        <Icon name="groups" size={20} className="text-rose-400" filled />
        <h2 className="text-[15px] font-semibold truncate">{title || 'Meeting'}</h2>
        <span className="text-[12px] text-white/50" data-testid="meeting-count">
          {tileCount} {tileCount === 1 ? 'person' : 'people'}
        </span>
        {status === 'joining' && <span className="text-[12px] text-white/50">Joining…</span>}
        {transcribing && (
          <span className="text-[11px] text-rose-300 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" /> transcribing
          </span>
        )}
      </div>

      {screens.length > 0 ? (
        // Presentation layout: the shared screen(s) take the stage; people become
        // a filmstrip underneath so the content is the focus.
        <div className="flex-1 min-h-0 px-5 pb-2 flex flex-col gap-3 overflow-hidden">
          <div
            className="flex-1 min-h-0 grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(screens.length, 2)}, minmax(0, 1fr))` }}
          >
            {screenTiles(false)}
          </div>
          <div className="shrink-0 h-28 flex gap-3 overflow-x-auto pb-1">
            {tiles('strip')}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-5 pb-2 overflow-auto">
          <div className="grid gap-3 h-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {tiles('grid')}
          </div>
        </div>
      )}

      {error && <div className="px-5 py-2 text-[12px] text-rose-300 bg-rose-500/10 text-center">{error}</div>}

      <div className="py-4">{controls(false)}</div>
    </div>
  )
}
