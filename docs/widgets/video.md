# Video, SME doc (master of destiny)

Tier: Sufficient. This widget does not need to beat best of breed to launch. It
needs to play a video on the canvas without embarrassing us, accept the URLs
people actually paste, and degrade honestly when it cannot. The bar is a calm,
reliable player, not a review studio.

## The use case

Someone is working on the canvas and a video belongs next to the work. It might
be a reference clip for a thing they are building, a Loom a teammate sent, a
short screen recording they want to glance at while they take notes, or a video
note they captured in the recorder widget and want pinned where they can replay
it. They do not want to open a browser tab and lose the timer, the notes, and
the tabs already arranged around this task. They want the video sitting in the
same field of view as everything else, playable in place, quiet until they press
play. The moment of use is "this clip is part of what I am doing right now, keep
it here, let me scrub it without leaving."

## Current state

The widget is `src/renderer/src/components/widgets/VideoWidget.tsx`. It is a thin
wrapper around a native HTML `<video controls>` element. The catalog entry lives
in `src/renderer/src/lib/widgetCatalog.ts` (kind `video`, hidden from the picker
with `hideFromPicker: true`), and the kind is declared in
`src/shared/types.ts`.

What works today:
- You give it a URL and it plays. The widget starts in an edit state, takes a
  single URL into `widget.content`, derives a title from the hostname via a
  local `hostnameOf` helper, and renders the browser's own `<video controls>`
  with play, scrub, volume, and fullscreen.
- It is a first-class canvas object inside `WidgetFrame`, so it is draggable,
  resizable, wireable, and sectionable like every other widget. The body also
  renders inline (the `inline` prop) for focus mode and previews.
- Video can arrive without typing a URL. The embedded browser's context menu has
  a "Save video to canvas" path that creates a `video` widget pointing at the
  source URL (`Canvas.tsx`, the `saveVideoToCanvas` case around line 641).
- Local files resolve too. The recorder widget captures webcam video as webm and
  the app serves saved files over a privileged `fb-file://` scheme that supports
  Range requests (see the changelog note in `src/renderer/src/lib/changelog.ts`),
  so a `fb-file://<id>` URL plays in the same `<video>` element with seeking.
- The MIME and extension mapping in `src/shared/fields.ts` recognises mp4, mov,
  webm, and m4v as video, which is what the file pipeline keys off.

Rough edges, honestly:
- It only plays direct video file URLs (mp4, webm, mov, m4v). It cannot play a
  YouTube, Vimeo, or Loom link, which is what most people will actually paste,
  because those need an iframe embed and the widget renders a raw `<video src>`.
  Paste a YouTube watch URL and you get a broken player with no explanation.
- There is no error state. If the URL is wrong, offline, blocked by CORS, or the
  codec is unsupported, the user sees a black box and an empty control bar with
  no message and no retry.
- There is no loading or poster state. Nothing tells the user the video is
  fetching versus failed versus empty.
- Playback state is not persisted. Reopen the desk and the video is back at zero,
  unmuted, default speed. There is no saved scrub position, no remembered volume,
  no playback rate control surfaced at all.
- There is no chrome beyond the browser default: no speed control, no chapters,
  no captions/transcript, no frame stepping, no keyboard shortcuts of our own.
- Nothing connects video to the rest of the desk. It cannot be commented on at a
  timestamp, it cannot drop a transcript into a note, it cannot wire its current
  time to anything, and a desk agent cannot read or summarise it.

## Best-of-breed landscape

Loom owns the async screen-and-camera message. Record, get a link, and the
viewer scrubs with a transcript, threaded comments, emoji reactions, and viewer
analytics. After the Atlassian acquisition its free tier tightened, which is
exactly why a crowd of alternatives matured.

Frame.io owns serious video review. Its signature is frame-accurate timestamped
comments and on-frame annotation, threaded replies, and version stacking, the
tool editors compare everything else against. Vimeo Review, Filestage, Wipster,
and Dropbox Replay all chase the same review job.

Vidyard and Zight own the recorder-plus-hosting middle. Vidyard adds who-watched
analytics and CRM hooks. Zight bundles screen recording, GIFs, annotated
screenshots, and async video into one native app and is frequently called the
best Loom alternative for 2026. Cap and One Rec win the same job on privacy and
open source.

On the canvas itself, the people we sit closest to are Figma, FigJam, and Miro.
FigJam has a video widget that takes a YouTube, Vimeo, or Loom link and drops a
playable tile on the board. Miro embeds the same third-party video URLs through
its embed tool. They treat video as a paste-a-link embed that just works, which
is precisely the case we currently fail.

The standalone player bar is set by YouTube and Vimeo themselves: speed control,
captions, chapters, quality selection, remembered position, keyboard shortcuts.

What we already do better or uniquely could. The video is one object on an
infinite canvas sitting beside the notes, the live browser tab, the timer, and
the voice note for the same task, instead of living in a separate review app or
a separate browser tab. It can be wired to other widgets and read by desk
agents. A video captured in our own recorder lands on the canvas as a local file
served from disk, and nothing about it leaves the machine. No incumbent combines
canvas placement, in-place AI, widget wiring, and local-first privacy.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No embed support for YouTube, Vimeo, or Loom (FigJam, Miro).** "A teammate
   sent me a Loom, I paste it, and it should play." Today it silently breaks
   because we render a raw `<video>` not an iframe. This is the single most
   common real input and the most visible failure.
2. **No error or empty state (everyone).** "The link is dead or the codec is
   unsupported and I have no idea why I am staring at a black box." A broken
   player with no message reads as a bug, not a bad URL.
3. **No playback persistence (YouTube, Vimeo).** "I scrubbed to 4:20, closed the
   desk, and now I am back at zero." Resume position, volume, and speed should
   survive a reload.
4. **No speed control or keyboard shortcuts (YouTube, Vimeo, Loom).** "Let me
   watch this at 1.5x and tap the spacebar to pause." The default browser bar
   gives play and scrub and little else.
5. **No transcript or captions (Loom, Vidyard).** "Pull the words out so I can
   skim or drop a quote into my notes." We have a transcription pipeline in the
   recorder; the video widget cannot reach it.
6. **No timestamped comment or annotation (Frame.io, Loom).** "Mark feedback at
   the exact second." Out of scope for the Sufficient tier, but it is the obvious
   pull-ahead once the basics are solid.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- **Detect and embed YouTube, Vimeo, and Loom links.** Parse the pasted URL; if
  it is one of those hosts, render the provider iframe embed instead of
  `<video>`; otherwise keep the native player for direct file URLs. Acceptance:
  paste a normal YouTube watch URL or a Loom share link and it plays inline,
  which is exactly what FigJam and Miro already do and what we fail at today.
- **Honest error and empty states.** Listen for the `<video>` error event and
  embed-load failure and show a short message with the offending URL and a
  "change URL" action. Acceptance: a dead link, a blocked CORS source, or an
  unsupported codec shows a readable reason instead of a silent black box.
- **Loading state.** Show a spinner or skeleton between commit and first frame
  for both the native player and the embed. Acceptance: the user can always tell
  fetching apart from failed apart from empty.

### Launch-polish
- **Speed control and our own keyboard shortcuts** on the native player (0.5x to
  2x, space to play/pause, arrow keys to seek, m to mute). Acceptance: a user can
  watch a reference clip at 1.5x with the keyboard, matching the everyday YouTube
  and Loom player feel.
- **Persist playback state** (resume position, volume, muted, speed) onto the
  widget so it survives a desk reload. Acceptance: reopen the desk and the video
  is where you left it at the speed you set.
- **Poster and clean inline thumbnail** so a paused video on the canvas looks
  composed rather than a black rectangle, including a sensible look in focus mode
  and previews.

### Post-launch (pull ahead)
- **Transcript on demand.** Reuse the recorder's transcription pipeline so a
  right-click or AI action turns a local video into a transcript that can be
  dropped into a note. Acceptance: a local video produces skimmable text and a
  quote lands in a note widget, something FigJam and Miro embeds cannot do.
- **Desk-agent aware video.** Let a desk agent read the transcript and answer
  "summarise this clip" or "find where they talk about pricing" with a
  timestamp. Acceptance: an agent returns a timestamped answer about a video on
  the desk, beating the review tools at comprehension rather than commenting.
- **Wire the current time out.** Expose the player position as a wire source so a
  note or table can capture "at 2:14" without manual typing, using our canvas
  wiring no incumbent has.
- **Timestamped notes pinned to the clip** as the lightweight, local answer to
  Frame.io and Loom review, where the comment is a canvas note wired to a
  timecode rather than a hosted thread.

## The unfair advantage

Only Haptyx can place a video on the same surface as the notes, the live browser
tab, the timer, and the voice note for one piece of work, then let a desk agent
read its transcript and answer questions about it with a timestamp, all without
the file leaving the machine. The review incumbents host your video on their
servers and wrap it in a comment thread; the canvas tools embed a link and stop
there. We can keep the clip local, make it legible to an agent, and wire its
position into the rest of the desk. The launch-blocking work simply earns the
right to play the links people paste; the transcript, the agent, and the wire
are why ours becomes better in kind once the basics hold.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
