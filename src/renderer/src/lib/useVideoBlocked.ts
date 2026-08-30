import { useEffect, useState } from 'react'

// DEC-078 — the black-tile detector. On macOS a camera request can be DENIED
// at the OS layer while getUserMedia still resolves: the track arrives
// readyState 'live', enabled, and **muted forever** — zero frames. Measured
// live: the dev app launched from inside Claude Code inherits Claude's TCC
// identity, which is denied camera with prompting disallowed, so tiles
// rendered pure black with no error anywhere. A muted video track is
// Chromium's own "no frames are arriving" signal; surfacing it honestly
// beats a silent black rectangle.
export function useVideoBlocked(stream: MediaStream | null): boolean {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const track = stream?.getVideoTracks()[0]
    if (!track) {
      setBlocked(false)
      return
    }
    const update = (): void => setBlocked(track.muted)
    update()
    track.addEventListener('mute', update)
    track.addEventListener('unmute', update)
    return () => {
      track.removeEventListener('mute', update)
      track.removeEventListener('unmute', update)
    }
  }, [stream])
  return blocked
}

export const CAMERA_BLOCKED_HINT =
  'macOS is blocking the camera for this app. System Settings → Privacy & Security → Camera — allow the app you launched Plexii from, then rejoin.'
