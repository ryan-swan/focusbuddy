import { useViewStore } from '../stores/view'

// DEC-079 / M4, shared (DEC-128): jump to the meeting an item came from —
// optionally the exact spoken moment. Open PlexiMeet, then hand it the
// meeting (and segment) once the view has mounted: the same post-navigation
// handoff the Attention page has always used, now one function the widget
// rows can call too.
export function openMeetingMoment(meetingId: string, segmentId?: string | null): void {
  useViewStore.getState().goMeetings()
  setTimeout(
    () =>
      window.dispatchEvent(
        new CustomEvent('fb:open-meeting', {
          detail: segmentId ? { id: meetingId, segmentId } : { id: meetingId }
        })
      ),
    250
  )
}
