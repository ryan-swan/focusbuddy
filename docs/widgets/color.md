# Color, SME doc (master of destiny)

Tier: Sufficient. This is a utility widget, not a widget people will choose
Haptyx for, so the bar is that it does its small job cleanly and never feels
broken or embarrassing next to a real color tool.

## The use case

Someone working on the canvas needs a color and a way to keep it. They are
designing a slide, picking a brand accent, matching a swatch they saw on a
screenshot, or jotting the hex of a thing they want to remember. They do not
want to alt-tab into a separate app and lose the note, the browser tab, and the
timer already sitting next to them. The moment of use is "I have a color in my
head or on my screen and I want to grab it, see it, and copy it without leaving
my desk." It is a glance-and-grab tool, used in seconds, often pinned near the
work it belongs to.

## Current state

Rendered by `src/renderer/src/components/widgets/ColorWidget.tsx`. The whole
widget is a single hex string stored in `widget.content`, with no separate
table or store. It is registered in `lib/widgetCatalog.ts` (kind `color`, icon
`palette`, default `#fbbf24`), wired into `Canvas.tsx` and `WidgetFocusMode.tsx`
for inline rendering, summarised as `(swatch)` in `lib/canvasSnapshot.ts`, and
the AI layer in `src/main/ai/anthropic.ts` can create one with content as a hex
string like `#fbbf24`.

What works today is small and solid. There is a large live preview swatch, a
native HTML color input, a free-text hex field you can type or paste into, a
read-only `rgb(r, g, b)` readout computed by a `hexToRgb` helper, a copy-hex
button with a short copied confirmation, and a screen eyedropper that uses the
browser `EyeDropper` API to pick any pixel anywhere on screen when the platform
supports it. Edits debounce for 300ms before saving, so typing does not thrash
the store. The eyedropper button only appears when `EyeDropper` is available,
which is a clean progressive-enhancement choice.

The honest weaknesses are that it holds exactly one color and nothing else.
There is no palette, no swatch history, no way to keep the last ten colors you
picked. The only formats are hex and rgb, with no HSL, no HSB, no CSS variable,
no copy-as-named-format. The text field accepts six-digit hex only, so eight-
digit alpha hex, three-digit shorthand, and `rgb()`/`hsl()` pasted in are all
rejected as "invalid hex". There is no harmony or scheme generation, no shades
or tints ramp, no contrast checker, no color-blindness preview, and no way to
extract colors from an image or screenshot dropped on the canvas. The AI can
set a single hex but cannot build a palette into the widget, and the widget
cannot feed its color out to another widget through a wire. It is a competent
single-swatch tool and nothing more.

## Best-of-breed landscape

Coolors is the fast palette generator the design crowd reaches for. You hit the
spacebar and it generates a five-color palette instantly, you lock the ones you
like and reroll the rest, you extract a palette from an uploaded image, you run
a built-in WCAG contrast checker, and you export the result as CSS, SVG, PDF, or
ASE or copy codes straight into Figma and code editors. Its whole identity is
speed from nothing to a usable palette, which is exactly the thing our single
swatch cannot do.

Adobe Color owns color theory. Its color wheel applies real harmony rules,
analogous, monochromatic, triad, complementary, split-complementary, square,
and compound, so a base color produces a structured scheme rather than a guess.
It simulates deuteranopia, protanopia, and tritanopia and draws conflict lines
between swatches that a color-blind viewer could not tell apart, and it extracts
a theme or a gradient from an uploaded image. Its unfair feature is Creative
Cloud sync, where a saved palette appears automatically in Photoshop,
Illustrator, and the rest. We have none of harmony, accessibility simulation, or
image extraction.

Sip is the macOS developer's color manager. It picks a color from anywhere,
keeps a running history and named palettes, and its Smart Formats feature
remembers which format each app wants so a paste lands as the right hex, rgb,
NSColor, or CSS variable automatically. It exports palettes to ASE, CLR, JSON,
and PDF. This is the closest neighbour to what our widget is, except it
remembers every color and we remember one.

ColorSlurp is the other strong macOS picker, with a magnifier-grade eyedropper,
camera picking, a color wheel, contrast checking, copy-in-any-format, and
collections that organise captured colors into schemes. Like Sip it treats the
picked color as something you keep and reuse, not something you discard.

What we already do better, or uniquely could, is the canvas itself. Our color
sits on the same surface as the slide draft, the browser screenshot, the note,
and the timer for the same task, where every one of those tools lives in its own
window. Our eyedropper can sample the actual pixels of a screenshot or a live
browser widget sitting right there on the desk. An AI on the desk can set the
color from a sentence in place, and nothing ever leaves the machine. No
incumbent has the canvas plus in-place AI plus local-first combination, even
though every incumbent beats us on the color craft itself today.

## Gap analysis (ranked, each tied to a competitor + a user moment)

1. **No palette or swatch history (Sip, ColorSlurp, Coolors).** "I picked five
   brand colors off a screenshot and now I have to keep five separate widgets,
   one per color." This is the biggest gap. A color tool that forgets every
   color but the current one feels broken to anyone who has used a real picker.
2. **Only hex and rgb formats, and a strict hex parser (Sip, ColorSlurp).** "I
   pasted `rgba(34, 197, 94, 0.5)` from my CSS and it says invalid hex." A
   developer expects to paste and read any common format, including HSL, HSB,
   alpha hex, and three-digit shorthand.
3. **No image or screenshot color extraction (Coolors, Adobe Color).** "I
   dragged a brand screenshot onto the canvas, now pull the palette out of it."
   We have a screenshot sitting right there and cannot mine it.
4. **No contrast checker (Coolors, Adobe Color, Sip, ColorSlurp).** "Is this
   text color readable on this background." A designer checks WCAG constantly and
   we offer nothing.
5. **No harmony or scheme generation (Adobe Color, Coolors).** "Give me a
   palette that goes with this base color." We cannot turn one color into a set.
6. **No shades and tints ramp (Adobe Color, Coolors).** "I need lighter and
   darker steps of this for a UI scale." A single swatch gives no ramp.
7. **No color-blindness preview (Adobe Color).** "Will my red and green read as
   different to a color-blind viewer." Absent entirely.
8. **No wire output and no export (everyone).** The color cannot flow out to
   another widget through a ghost-line wire, and there is no ASE/CSS/JSON export
   for handing the palette to a real design tool.

## The supersonic plan

### Launch-blocking (must ship to clear "Sufficient")
- **Swatch palette inside the one widget.** Add a saved row of swatches stored
  as JSON in `widget.content` (an array of hex strings plus the active one),
  with add, remove, reorder, and click-to-activate. The eyedropper and color
  input append to the palette instead of replacing the lone color. Acceptance: a
  user picks five colors off a screenshot and keeps all five in one Color
  widget, then clicks any swatch to make it active and copy it. This is the
  table-stakes thing Sip and ColorSlurp have and we lack.
- **Multi-format read and copy.** Parse and display hex, rgb, hsl, and hsb, with
  a small format toggle and a copy button per format. Accept paste of any of
  those plus three-digit and eight-digit hex into the input. Acceptance: pasting
  `rgba(34,197,94,0.5)` or `#3b9` is accepted, shown, and copyable as hex, and we
  match Sip and ColorSlurp on format flexibility for the common cases.
- **Fix the strict parser as a correctness bug.** The current `hexToRgb` silently
  shows "invalid hex" for legitimate input. Acceptance: every format the input
  accepts round-trips to a correct rgb readout with no false "invalid" state.

### Launch-polish
- **Contrast checker between two swatches.** Pick a foreground and a background
  from the palette and show the WCAG ratio with AA/AAA pass or fail for normal
  and large text. Acceptance: a user checks text-on-background readability inside
  the widget and gets the same verdict Coolors would give, without leaving the
  desk.
- **Shades and tints ramp.** From the active color, generate a row of lighter and
  darker steps the user can click to capture into the palette. Acceptance: one
  brand color yields a usable light-to-dark UI scale in the widget, matching the
  shades feature in Adobe Color.
- **Drop-image color extraction.** When an image or screenshot widget is the
  source, or an image file is dropped on the Color widget, pull a small palette
  of dominant colors into the swatch row. Acceptance: dragging a brand screenshot
  produces a five-color palette in the widget, the core Coolors and Adobe Color
  image trick, but done against a screenshot already on our canvas.
- **Export the palette.** Copy-as for CSS variables and a JSON array, plus a
  copy-all. Acceptance: a developer copies the palette as ready-to-paste CSS
  custom properties, closing the export gap versus Sip and Coolors for the
  common code case.

### Post-launch (pull ahead)
- **Wire the color out to other widgets.** A ghost-line wire from the Color
  widget feeds its active color or palette to a shape, a section background, a
  stream-deck button, or a theme, so the swatch becomes a live source of truth on
  the canvas. No standalone picker can do this because no standalone picker lives
  on a wired canvas.
- **AI palette into the widget.** "Build me a warm autumn palette" or "a palette
  that goes with this screenshot" fills the swatch row in place from a sentence,
  using the desk AI, something Coolors only approximates with a bot and the
  others lack entirely.
- **Color-blindness preview.** Toggle deuteranopia, protanopia, and tritanopia
  simulation over the palette to flag indistinguishable pairs, taking the
  accessibility ground Adobe Color owns.
- **Harmony generation.** From a base color, generate analogous, complementary,
  and triadic sets into the palette, matching the Adobe Color wheel for the
  cases people actually use.

## The unfair advantage

Only Haptyx can sit a color tool on the same surface as the live browser tab,
the screenshot, and the design draft it serves, and let its eyedropper sample
the actual pixels of those neighbours. Once the palette and wiring land, the
color the user captures can flow down a ghost-line wire into a shape fill, a
section background, or a theme, so the Color widget stops being a place colors go
to be forgotten and becomes a live source the rest of the desk reads from. Add
the desk AI building a palette from a sentence in place, and every byte staying
on the machine, and the result is a humble utility that does something no
standalone picker can, even after we have matched the standalone pickers on their
own craft.

## Implementation log

- 2026-06-09, SME doc created; no implementation started yet.
