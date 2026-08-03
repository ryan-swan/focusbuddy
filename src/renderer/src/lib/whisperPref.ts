// Whisper (meeting transcription + summary) opt-in. Off by default — recording a
// call is never forced. The user turns it on, and because the choice is persisted
// it also acts as their default for future meetings until they turn it back off.
const KEY = 'fb.meet.whisper'

export function whisperEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setWhisperEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* ignore — a private-mode storage failure just leaves whisper off */
  }
}
