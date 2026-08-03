# Voice note, SME doc (master of destiny)

Tier: Hero. This is a widget people will judge Haptyx on, so the record →
transcribe → make-it-useful loop has to feel as good as a dedicated voice app at
launch, not like a recorder bolted onto a canvas.

## The use case

Someone is mid-task and has a burst of thinking that is faster to say than to
type. They just got off a call and want the gist plus the follow-ups before it
evaporates. They are walking through a problem out loud and want the tangents
stripped out and the decisions kept. They reach for the voice note because the
keyboard is too slow for the shape of the thought. The moment of use is "let me
just talk, and have the machine turn it into something I can act on, right here
next to the task it belongs to." The win is that the result does not stay a wall
of transcript. It becomes a summary, a set of proposed tasks, and text you can
drop into the note or sticky already on the canvas, without leaving the desk.

## Current state

The widget lives at
`src/renderer/src/components/widgets/VoiceRecorderWidget.tsx`, with the AI
pipeline in `src/main/ai/voiceNote.ts`, the offline engine in
`src/main/ai/localWhisper.ts`, and the cloud-or-local routing preference in
`src/main/voiceProviderPref.ts`. The recording itself is stored through the
files store (`fb-file://`) so it can be replayed, and the rest of the state is
serialised into `widget.content` as JSON so a reload restores the transcript,
the last processed result, and any cached action proposals.

What works today is a complete loop and it is more capable than the tier name
suggests. You record either audio or video from inside the widget. While you
talk, live captions stream in from the browser's Web Speech API as a preview
that is never stored. On stop, the clip is saved, then transcribed for real by
Whisper, either through the OpenAI Whisper API in the cloud or through a local
ONNX whisper-tiny model that runs entirely on the machine and works offline
after a one-time model download. The renderer pre-decodes audio to 16kHz mono
for the local path because Node main has no Web Audio API, which is the kind of
boundary detail that is easy to get wrong and is handled here. After
transcription, two Anthropic calls run in parallel. One processes the transcript
into one of four modes, the raw full text, a cleaned version with fillers and
false starts removed, a tight summary with key points, or a diarised version
that splits the text into speaker turns. The other extracts concrete action
proposals, new tasks, todo lists, widgets, or pages, which you can apply one at a
time or all at once straight into the task. Finished text can be sent to a brand
new sticky, note, markdown, or page widget, or appended to an existing one on the
same canvas. The error handling is honest and specific, it tells you when an API
key is missing and points you at the settings, and it survives the awkward case
where the renderer is newer than the main process.

The rough edges are real. Diarisation is inferred from text patterns by Claude,
not from the audio itself, so it is a reasonable guess for one or two speakers
and unreliable for a real multi-person meeting. There is no custom vocabulary, so
names, product terms, and acronyms get mangled and there is no way to teach it.
The transcript is not editable in place, you get what Whisper returns and your
only correction path is to re-record. There is no search across past voice notes
and no library view, each note is an island on its canvas. The local model is
whisper-tiny, which is the weakest accuracy tier and is English-biased, and the
local path does not reliably surface a detected language. There are no
timestamps on the transcript and no click-a-word-to-jump-in-the-audio sync. Long
recordings are processed in one pass with a 90-second cloud timeout, so there is
no streaming transcription of a long session and no chunking strategy for very
long clips. The append-to-existing list deliberately excludes the page widget
because that one stores Tiptap JSON and a raw-text append would not render.

## Best-of-breed landscape

Otter.ai owns the meeting-notes high ground. It joins calls, transcribes live
with the most accurate engine in the category, identifies speakers from the audio
rather than guessing from text, and turns a conversation into a searchable,
collaborative, team-shared knowledge base. It is the thing a meetings-heavy user
will compare us to, and the reason our text-pattern diarisation reads as a
placeholder.

Granola is the breakout of the last two years for a reason. It captures desktop
audio with no bot joining the call, lets you jot rough bullets while the meeting
runs, then merges your notes with the transcript into a clean structured summary.
The "you write, AI expands" workflow and the bot-free capture are the things
people love, and both are about turning talk into a usable artifact fast, which
is exactly our job.

Superwhisper and Wispr Flow own personal dictation. Superwhisper in particular
runs Whisper on-device with selectable model sizes from tiny up to large, ships a
custom dictionary so domain words stop getting mangled, and sells on privacy and
offline use. That on-device, privacy-first stance is the closest philosophical
neighbour to our local provider, except they ship larger models and a vocabulary
feature and we ship tiny with neither.

AudioPen and Whisper Memos own the "ramble to a clean note" job. You talk
loosely and they hand back a tidy, structured piece of writing, with Whisper
Memos delivering accurate cloud transcripts and AI summaries and supporting
import of existing audio files. This is our summary mode's direct competition and
they are more polished at the single thing they do.

Apple Voice Memos is the default everyone already has, now with on-device
transcription built into iOS. It is the free baseline our recording-and-replay
has to clear, though its summary and action-extraction story is thin.

What we already do better or uniquely could is the part none of them have. The
voice note is one object on an infinite canvas next to the task, the timer, the
browser tab, and the notes for the same piece of work. The extracted actions
apply straight into that workspace as real tasks and todo lists rather than
landing in a separate notes silo. The output can be wired or sent to other
widgets on the same desk. The whole pipeline can run local-first so audio never
leaves the machine. No incumbent combines canvas context, in-place action apply,
and a genuine offline path.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. Audio-based speaker diarisation is missing (Otter, MacWhisper). "I recorded a
   two-person call and want to see who said what." Today we infer turns from text
   patterns, which is a guess that falls apart past one or two speakers. This is
   the single biggest credibility gap for anyone recording a real conversation.
2. No custom vocabulary (Superwhisper, Wispr Flow). "It keeps spelling my
   product name and my colleague's name wrong and I can't fix it." Without a
   dictionary, accuracy on the words that matter most to the user stays poor and
   there is no lever to improve it.
3. The transcript is not editable in place (everyone). "Whisper got one line
   wrong and my only option is to record the whole thing again." Every serious
   competitor lets you fix the text; we make you re-record.
4. No search or library across past notes (Otter, Granola). "Where was that
   voice note where I decided the pricing?" Each note is stranded on its canvas
   with no way to find it later by content.
5. Local model is tiny and English-biased (Superwhisper). "I switched to local
   for privacy and the accuracy dropped off a cliff, and my non-English speech is
   worse." The offline path exists but the quality ceiling undercuts the privacy
   promise.
6. No timestamps or audio-to-text sync (Otter, MacWhisper). "Let me click a line
   and jump to that moment in the recording." We replay the clip and show the
   text, but the two are not linked.
7. No streaming or chunked handling of long recordings (Otter). "I want to record
   a 40-minute session." One-pass transcription with a 90-second cloud timeout is
   built for short notes, not long sessions.

## The supersonic plan

### Launch-blocking (must ship to clear "Hero")

Editable transcript in place. The ready state becomes a real text area so a user
can correct a Whisper mistake, and processing modes recompute from the edited
text rather than the original. Acceptance: a user fixes a misheard line, switches
to summary, and the summary reflects the correction without a re-record. This is
the floor every competitor clears and we currently do not.

Custom vocabulary that actually biases transcription. A per-workspace dictionary
of names, product terms, and acronyms, passed to Whisper as a prompt bias on the
cloud path and applied as a correction pass on the local path. Acceptance: a user
adds their product name and their colleague's name, records, and both come back
spelled correctly where today they are mangled. This is the lever Superwhisper
sells on.

Honest diarisation labelling plus a real path for the common case. Keep the
text-pattern split but stop presenting it as if it came from the audio, and make
the two-speaker case dependable enough to trust. Acceptance: a clearly two-person
recording is split correctly into two speakers and the UI never implies more
certainty than the method has. This closes the most damaging credibility gap
against Otter for the everyday case.

Upgrade the local model off tiny. Offer at least a base or small whisper model on
the local path with a clear accuracy-versus-speed choice, so the privacy option
is not also the worst-accuracy option. Acceptance: a user on local transcribes a
normal clip and the result is good enough to keep without editing, closing the
gap with Superwhisper's selectable-model promise for the default case.

### Launch-polish

Transcript-to-audio sync with timestamps. Show timestamps on the transcript and
let a click on a line seek the replay to that moment. Acceptance: clicking a line
jumps the audio there, matching the table-stakes review experience in Otter and
MacWhisper.

Search across voice notes. A library or command-bar search over the transcripts
of every voice note in the workspace. Acceptance: typing a phrase finds the note
where it was said and opens it on its canvas, answering the "where did I say
that" moment that Otter and Granola own.

Long-recording handling. Chunk long clips, transcribe in segments with a progress
indicator, and lift or remove the 90-second cloud cap for long sessions.
Acceptance: a 30-minute recording transcribes end to end with visible progress
and no timeout.

Import an existing audio or video file. Let a user drop an existing clip onto the
widget to transcribe it, the way Whisper Memos and MacWhisper allow. Acceptance:
dragging an m4a from disk onto the widget produces a transcript and the full mode
and action pipeline runs on it.

### Post-launch (pull ahead)

Real audio-based diarisation. Run a speaker-segmentation model on the local path
so "who said what" comes from the audio, not from text guessing, taking the Otter
and MacWhisper ground rather than approximating it.

Live wired transcription into other widgets. A wire from the voice note streams
the transcript or the extracted actions into a connected note, table, or desk
agent as it is produced, so a recorded standup populates a task table live.
Nothing in the market does this because none of them sit on a canvas with wires.

A desk agent that listens and acts. Point a desk agent at the voice note so the
agent triages the extracted actions, files tasks under the right parent, and
follows up, turning the note into the trigger for work rather than the end of it.

The bot-free meeting capture pattern. Capture system audio for a call with no bot
joining, in Granola's style, while keeping the recording and the transcript local
to the machine, which is a privacy posture Granola itself does not fully offer.

## The unfair advantage

Only Haptyx can take a spoken thought and have it land as real work on the same
surface as everything else for that task. The voice note sits on the canvas next
to the timer, the browser tab, and the notes, its extracted actions apply
straight in as tasks and todo lists rather than into a separate notes app, its
output can be wired or sent to the other widgets on the desk, and a desk agent can
pick the result up and keep going. The whole pipeline can run local-first so the
audio never leaves the machine, which is a promise Otter and Wispr Flow cannot
make and Granola only partly makes. The plan above closes the accuracy and
diarisation and editing gaps that the dedicated voice apps win on today. The
canvas context, the in-place action apply, the wiring, and the genuine offline
path together are why, once at parity on the basics, a voice note in Haptyx is
better in kind than a transcript in a silo.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
