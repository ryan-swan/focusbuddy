# Haptyx UX consolidation proposal

Date: 2026-06-14. Status: proposal for operator review, grounded in a code audit of the renderer. Nothing here is built yet except the accent "+ Widget" button, which is already committed.

This responds to three asks: make the create action obvious, make the chrome consistent and legible, and add a proactive AI setup assistant at the widget level for the widgets that do not have one. The hard constraint is that the right-click context menu and the in-widget AI assist must stay exactly as they are. Everything proposed here works alongside them.

## What the audit found

The app has grown a lot of overlapping surfaces. There are at least fourteen distinct places to invoke AI, and four different ways to create a widget. The same idea is labelled and styled differently depending on where you meet it. And the proactive AI setup that helps you fill a widget only exists on seven of the twenty-five widget kinds, and only through the right-click menu, so most widgets give you a blank object and no help.

Concretely, creating a widget happens through the palette button, the right-click Create submenu, the canvas "Build with AI" button, and the "AI Setup" button, and the natural-language command bar can also spawn widgets. The two canvas buttons, "Build with AI" and "AI Setup", sit next to each other, look almost identical, use different icons (auto_fix_high versus auto_awesome), and do subtly different things, which is the single most confusing pair in the interface. AI as a concept is drawn with auto_awesome in most places but auto_fix_high in one, and "Build with AI" actually means two different things depending on whether you are on the toolbar or in a widget's right-click menu.

The persistent chrome is mostly icon-only with no labels. The header's right cluster is four unlabelled icons. The sidebar, chat panel, and floating toolbar all collapse to a tiny chevron that is easy to miss, so people do not realise a panel is hidden. Now that tooltips exist as of 2.5.26 every control at least describes itself on hover, but hover is not discovery.

## Recommendations, in priority order

### 1. Make the primary create action unmistakable (done)

The "+ Add" button is now "+ Widget" and tinted with the accent token so it reads as the main create action in every theme. This is committed and ships with the next release. No further work needed unless you want the same treatment elsewhere.

### 2. Resolve the "Build with AI" versus "AI Setup" collision (small, high impact)

These two canvas-toolbar buttons are the worst offender because they look the same and do different things. The cleanest fix is to merge them into one entry called "Build with AI" that opens a single flow, where the first step is a choice between describing what you want from scratch and accepting task-scoped suggestions. One button, one icon, one mental model. This touches only the canvas toolbar, not the right-click menu or in-widget AI, so it stays inside your constraint.

### 3. Settle one AI vocabulary and one AI icon (small, mostly cosmetic)

Pick a single verb for AI creation and use it everywhere it means "make something with AI", and reserve a single icon, auto_awesome, for AI across the whole interface. The header "Ask AI" command bar can keep its distinct name because it is genuinely a different thing, a global command line, but the per-surface "Build" and "Setup" language should be one word. This is low risk and makes the whole app feel intentional.

### 4. Label the chrome and make hidden panels obvious (small to medium)

Give the header's right cluster a consistent treatment so the icons are not an ambiguous row. Replace the bare collapse chevrons on the sidebar, chat, and floating toolbar with a clearer affordance, a thin labelled tab or a chevron with a one-word label, so a collapsed panel announces itself. This is the most direct answer to "nav items are hard to spot," and it is low risk because it is presentational.

### 5. The proactive widget-level AI setup assistant (the big one)

This is the heart of the request and it deserves its own design, below.

## The widget-level AI setup assistant

Today, when you drop most widgets you get an empty object and you are on your own. Only sticky, note, markdown, card, mindmap, and diagram offer "Build with AI", and only by right-clicking. The proposal is a single consistent affordance that lives on the widget itself, appears when the widget is empty or freshly created, and proactively offers to set it up for the task you are working on. It is additive. The right-click "Build with AI" and the in-widget AI assist stay exactly where they are; this is a new, more visible surface that also reaches the eighteen kinds that have nothing today.

The shape of it is an empty-state prompt inside the widget frame, a quiet line with an accent action such as "Set up with AI", shown only while the widget has no meaningful content. It is task-aware, so it reads the current task's title and the other widgets on the desk and proposes setup in that context rather than generically. And it is per-kind, because "set up" means something different for each widget, which is exactly why a single generic prompt has never been enough.

What "set up" means per kind is the core of the design. A table offers to build a schema for the task, for example episode, status, and publish date columns for a podcast tracker, with select options and colours. A browser offers to open the page you most likely need. A section offers a layout and, where possible, to gather related loose objects into itself. A custom-block form offers a set of typed fields. A calculator offers a relevant preset. A timer offers a duration that matches the task. A streamdeck offers a starter set of buttons. An agent offers a role and instructions. A page offers a starter structure, which also closes the gap that the page widget, a major note type, has no setup path at all today. The widgets that already have "Build with AI" keep it and simply gain the more visible empty-state entry too, so the experience is finally uniform across all kinds.

Mechanically this extends the existing widget-setup machinery rather than inventing a parallel one. There is already a setup store and an applier that takes AI-proposed items and writes them into a widget after you approve them; that same approve-before-apply pattern carries over, so nothing lands without your confirmation, which keeps it honest and undoable. The work is to define a setup contributor per widget kind, to add the empty-state affordance to the widget frame, and to feed the current task context into the prompt so the suggestions are genuinely about what you are doing.

Because this is large, it should land in phases. The first phase builds the frame affordance and the task-aware plumbing and lights it up for the highest-value kinds that are blank today, the page, the table, the browser, and the section. The second phase extends it across the remaining tool and layout kinds. The third phase makes it more proactive, so that creating a widget while a task is clearly underway can offer setup immediately rather than waiting for you to notice the prompt. Each phase is shippable on its own and each is verifiable, so you see value early and we do not boil the ocean in one release.

## What I need from you

Tell me which of these to take forward and in what order. My suggested sequence is to ship the small, safe wins first, the "Build with AI" and "AI Setup" merge, the single AI vocabulary and icon, and the chrome labelling, because they are low risk and make the app feel coherent immediately, and then to start the widget-level setup assistant in phases beginning with the page, table, browser, and section. If you would rather lead with the setup assistant because it is the most valuable, I can do that instead.
