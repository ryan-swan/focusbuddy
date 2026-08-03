# Timer, SME doc (master of destiny)

Tier: Strong. A Strong widget doesn't have to redefine its category, but it does
have to be good enough that nobody on the canvas reaches for a second timer app.
It has to handle the everyday focus job cleanly and then earn its keep through the
canvas, the AI, and the wiring that a standalone timer can never have.

## The use case

Someone is sitting down to do one thing for a fixed stretch. They want to box the
work: twenty-five minutes on the draft, ten on email, five for a break. They reach
for the timer because they need a visible, audible commitment that they are on the
clock right now, sitting next to the note, the task list, and the browser tab for
the very thing they are timing. The moment of use is "I am starting this block of
work now and I want the countdown in my eyeline so I don't drift." They do not want
to alt-tab to a phone or a menu-bar app and lose the surface they just arranged.
The timer's whole reason to live on the canvas is that the thing being timed is
already there beside it.

## Current state

The widget is a single React component at
`src/renderer/src/components/widgets/TimerWidget.tsx`. It is a countdown timer. The
state is a small JSON blob (`targetSec`, `elapsedSec`, `state`, `startedAt`)
persisted into `widget.content` through the widget store
(`src/renderer/src/stores/widgets.ts`), so a running timer survives reload and
reconstructs elapsed time from `startedAt` against wall-clock `Date.now()` rather
than counting interval ticks, which keeps it accurate even if the tab is throttled.
It is registered as kind `timer` in `src/shared/types.ts` and in the catalog at
`src/renderer/src/lib/widgetCatalog.ts`, and it can be spawned from the command
center, the AI command bar, and the AI proposal pipeline
(`src/main/ai/anthropic.ts` lists `timer` among creatable kinds).

What works today is the core loop done carefully. You set minutes and seconds in
idle state, press start, and a circular SVG progress ring drains as time runs out.
The ring changes colour as you cross thresholds (green, then amber, then red in the
final stretch) and the numerals pulse and turn red in the last ten seconds. Audio
cues fire at 60, 30, 10, 5, 4, 3, 2 and 1 seconds through the shared Web Audio
beeper at `src/renderer/src/lib/audioBeep.ts`, rising in pitch and loudness as the
deadline approaches, then an alarm at zero. Those sounds respect the global sound
preferences (`soundPrefs.ts`), so a muted desk stays muted. Pause, resume, reset,
and a one-press restart after completion all work. It renders inline in widget
focus mode (`WidgetFocusMode.tsx`) at a larger size, and it is captured in canvas
snapshots (`src/renderer/src/lib/canvasSnapshot.ts`) so a shared desk carries its
timers.

The honest weaknesses are real and they are about everything beyond that one loop.
There is no count-up stopwatch mode, so you cannot just track elapsed time on an
open-ended task. There is no Pomodoro cycle: no automatic work/break alternation,
no round counting, no "four blocks then a long break", which is the single most
common shape people actually want from a focus timer. The timer keeps no history,
so there is no record of how many blocks you ran today or how long you focused; the
separate focus-session system (`stores/focusSession.ts`,
`FocusSessionOverlay.tsx`) tracks engagement but it is a different feature and the
widget is not wired into it. The AI can create a timer but cannot set its duration
or start it through a structured action; the only mutation path is the generic
`update-widget`, so "start a ten minute timer" does not reliably arrive
preconfigured and running. There is no labelling, so a timer cannot say what it is
counting. And critically for a canvas product, the timer has no wires: it neither
emits an event when it finishes nor consumes one to start, so it cannot drive or be
driven by any other widget or desk agent.

## Best-of-breed landscape

The category that owns this job is focus and Pomodoro timers, and the leaders are
well defined.

**Session** is the deep-work benchmark on Mac. Its differentiator is adherence
tracking: it watches whether you actually stayed on task during the interval or
drifted to Slack, and it surfaces weekly deep-work statistics from that. It also
folds in website blocking, macOS Focus Mode integration, Apple Watch control, Live
Activities in the Dynamic Island, and Slack status auto-updating while a session
runs. It is the thing a serious focus user compares everything else to.

**Flow** owns clean, native simplicity. It is the timer that feels like Apple built
it, free across Mac, iPhone, iPad and Watch with no sign-up, and its standout
behaviour is commitment mode, where the stop button disappears once a session
starts so you cannot bail early. Pro adds app and web blocking, calendar sync, data
export and a subtle metronome tick.

**Forest** owns motivation through gamification. You grow a virtual tree that dies
if you leave, you accumulate a forest of completed sessions, and the company plants
real trees. For a large class of users that loss-aversion loop is the only thing
that actually keeps them in the chair.

**TickTick** and **Focus To-Do** own the task-attached angle. Their Pomodoro timer
is bound to a specific task, so the focus interval is logged against the to-do and
focus hours accumulate per task over time. The timer is not a standalone object, it
is the execution half of a task manager.

**Pomofocus** owns frictionless minimalism. Every control sits on one screen, it is
free, there is no setup and no interruption, and that is exactly why a lot of people
default to it.

What we already do better, or are uniquely positioned to do, is the part none of
them can copy. Our timer is one object on an infinite canvas sitting beside the
note, the task, and the browser tab for the same work, so the context never has to
be reconstructed in a separate app. It is created and could be configured by an AI
from a sentence in place. It can be wired to other widgets and to desk agents so
finishing a block can actually do something. And it is local-first, so the timing
and any future history never leave the machine, which is the opposite of the
account-based, cloud-stats incumbents.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No Pomodoro cycle (Forest, Flow, TickTick, Pomofocus, all of them).** "Run me
   four twenty-five minute blocks with five minute breaks and a long break at the
   end." This is the default shape of the category and we don't have it. A timer
   that only does one countdown is below table stakes for a focus tool.
2. **No count-up stopwatch (Session, Toggl-style trackers).** "I don't know how long
   this will take, just tell me how long I've been at it." Today there is no way to
   track open-ended elapsed time.
3. **AI cannot set duration or start the timer (nobody, this is our own gap).** "Set
   a fifteen minute timer and start it" should produce a running, preconfigured
   timer. Today the AI can only drop an idle default and the user finishes the job
   by hand, which breaks the in-place-AI promise that is supposed to be our edge.
4. **No session history or focus stats (Session, Flow, Forest).** "How many blocks
   did I do today, how long did I focus this week?" The widget remembers nothing
   once reset, so the most motivating feedback in the category is absent.
5. **No wires in or out (no competitor can do this, so it is pure upside left on the
   table).** "When this timer ends, flip the task to done and ping the desk agent",
   or "start this timer when I open that note." The canvas makes this possible and
   we ship none of it.
6. **No label and no commitment mode (Flow, task-attached apps).** "Which of my
   three timers is the writing one?" and "stop me bailing out early." Small, but
   they are the difference between a toy and a tool people trust.

## The supersonic plan

### Launch-blocking (must ship to clear "Strong")
- **Pomodoro cycle mode.** A mode toggle that runs configurable work and break
  lengths, counts rounds, auto-advances between work and break with a distinct cue
  for each transition, and shows which phase and round you are in. Acceptance: a
  user configures 25/5 with a long break after four rounds, presses start once, and
  the widget runs the full cycle unattended with audible phase changes. We now match
  Flow and Forest at the core Pomodoro job instead of offering a bare countdown.
- **Count-up stopwatch mode.** The same widget can run as an open-ended stopwatch
  that counts elapsed time with no target. Acceptance: a user with an unknown-length
  task starts the stopwatch, works, and stops with an accurate elapsed total; we now
  cover the open-ended case Session handles and a plain countdown cannot.
- **AI sets duration and starts the timer.** A structured timer action (set target,
  optional auto-start, optional label) wired through the AI proposal pipeline in
  `src/main/ai/anthropic.ts` and `actionExecutor.ts`. Acceptance: "set a fifteen
  minute timer for the draft and start it" yields a labelled timer already counting
  down, which no menu-bar timer can do from natural language and which delivers our
  in-place-AI promise for this widget.
- **Timer label.** A short editable title on the widget. Acceptance: three timers on
  one desk each name what they are timing, so the canvas with several timers stays
  legible.

### Launch-polish
- **Session history and a simple focus stat.** Persist completed blocks per desk and
  show a small running total for the day. Acceptance: after three completed blocks
  the widget shows "3 blocks, 75 min today", giving the motivating feedback Forest
  and Session lead on, kept local.
- **Commitment mode.** An optional lock where the controls hide until the block
  finishes. Acceptance: with commitment on, there is no early-stop affordance until
  the timer ends, matching Flow's flagship behaviour.
- **Quick presets.** One-tap 5, 15, 25 and custom presets in idle state. Acceptance:
  starting a standard block takes one click, matching Pomofocus on frictionlessness.
- **Desk-mute and pause-on-away awareness.** Let the timer optionally pause when the
  desk's engagement signal goes idle, reusing the focus-session engagement logic in
  `stores/focusSession.ts`. Acceptance: stepping away pauses the block instead of
  silently burning it, which the standalone timers cannot know.

### Post-launch (pull ahead)
- **Wire-out on finish.** A timer emits an event when it completes that other
  widgets and desk agents can consume, so finishing a block can flip a task to done,
  advance a checklist, or trigger an agent. Acceptance: a wire from a finished timer
  marks a linked task complete with no user action, something no incumbent timer can
  do because none of them live on a wired canvas.
- **Wire-in to start.** A timer can be started by an incoming event, for example
  when a note or task is focused. Acceptance: opening the writing note auto-starts
  its writing timer.
- **AI focus coaching from local history.** With local block history, the AI
  suggests realistic block lengths and break timing from the user's own past
  sessions, on-device. Acceptance: the AI proposes "your blocks run long after 4pm,
  try 20/5" from local data that never left the machine, which the cloud-stats
  incumbents structurally cannot match on privacy.

## The unfair advantage

Only Haptyx can make finishing a timer an event on a wired canvas. When the block
ends, a ghost-line wire can flip the linked task to done, advance a checklist, or
hand off to a desk agent, and a wire in the other direction can start the timer the
moment its note is opened. No menu-bar or phone timer can reach the rest of your
work, because it has no rest of your work to reach. The second advantage is local
focus history that an AI can coach from without anything leaving the machine, which
is the exact inverse of the account-and-cloud-stats model every incumbent runs on.
Once the Pomodoro and stopwatch gaps are closed, the wiring plus on-device AI plus
the timer simply sitting next to the work it is timing is why ours is better in
kind, not a thinner copy of Flow.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
