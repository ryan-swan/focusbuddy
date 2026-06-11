# Haptyx Unified Context Menu System, Design Specification

## Executive summary

Every right-click surface in Haptyx today hand-builds its own array of menu items. A section's menu and a widget's menu have drifted apart, the table cell menu re-implements the create list from scratch, the SpeedDeck menus left the shared substrate entirely, and the embedded browser draws a native Electron menu that shares nothing with the rest of the app. The result is a workspace where the same conceptual action looks and behaves differently depending on where the user happens to right-click, and where whole capabilities, multi-selection bulk actions most glaringly, simply do not exist because no surface was wired to expose them.

This specification defines one menu system that every surface resolves through. It does not invent a new renderer. The existing `CanvasContextMenu` component at `src/renderer/src/components/CanvasContextMenu.tsx` already has exactly the item model and the recursive submenu portalling the design needs, so the whole system is a resolution layer that sits in front of that renderer and produces the `CtxMenuItem[]` it draws. A surface stops answering the large question of what its entire menu should be and instead answers the much smaller question of what object the user right-clicked. A resolver assembles the rest from typed contributions that providers, including marketplace plugins, register against a fixed set of canonical sections.

The canonical structure is eight sections in a fixed order, which holds across every menu so a user can build muscle memory once and rely on it everywhere. The order is context-specific actions first, then AI Assist, then Create, then Convert, then Organise, then Share, then Advanced, and finally the destructive actions which are always last. This document specifies the architecture and data model behind that structure, the registration system widgets use to contribute, the browser replacement menu that brings the embedded webview onto the same substrate, the selection-driven workflows for text, single objects, and multi-selection, the AI Assist submenu, the conversion workflows, the marketplace extensibility framework, and the recommended final menu layout for every widget in the catalog. It closes with the significant assumptions the critic challenged, the decisions taken in response, and a recommended build sequence.

## Design principles

The system rests on a handful of principles that the rest of the document applies consistently. The renderer is a fixed substrate and is never rewritten, so every surface inherits portalling, viewport clamping, Esc and outside-click dismissal, and eventually keyboard navigation for free. There is one spawn-and-link path, `createConnectedTool`, and both Create and Convert sit on top of it rather than growing parallel copies, which is the single discipline that prevents a third divergence of the kind the table cell menu already represents. The eight sections appear in the same order in every menu, and the contents of a section shift with context while the spine never reshuffles. Most-common-first governs ordering within a section, dangerous-last governs the whole menu, and the destructive band is always visually separated and always at the bottom. Where a user would reasonably expect an action that is momentarily blocked by transient state, the row is shown disabled with a reason rather than hidden, but where an action is meaningless for the object kind it is hidden rather than greyed, and this document draws that line far more tightly than the original drafts did, for reasons the challenged-assumptions section explains in full.

---

## 1. Global context menu architecture and data model

### The resolution layer

The architecture is a small folder, `src/renderer/src/lib/contextMenu/`, holding the section model, the contribution shape, the menu context, the provider set, the object-context dispatch, and a single resolver entry point. The renderer is untouched. Every surface computes a `MenuContext` describing what was right-clicked and calls `resolveMenu(ctx)`, which returns the `CtxMenuItem[]` that `CanvasContextMenu` draws.

### The section model

The eight sections are a real enum whose numeric values double as the sort key, so identical ordering is a property of the data rather than something each surface has to remember to reproduce.

```ts
// src/renderer/src/lib/contextMenu/sections.ts
export enum MenuSection {
  Context = 0,       // 1. Context-specific actions for the exact object clicked
  AiAssist = 1,      // 2. AI Assist (Improve Clarity, Rewrite, Translate, ...)
  Create = 2,        // 3. Create + connect a new widget
  Convert = 3,       // 4. Convert / reinterpret this object as another kind
  Organise = 4,      // 5. Section membership, bring-to-front, layout, group
  Share = 5,         // 6. Share, make-a-task, export, copy-out
  Advanced = 6,      // 7. Power-user / rarely-needed
  Destructive = 7    // 8. Archive, delete, remove, unlink (ALWAYS LAST)
}
```

### How the eight-item ceiling actually holds

This is the decision the critic correctly identified as the load-bearing one, and the original drafts got the arithmetic wrong. The first draft claimed that the eight sections simply are the eight top-level rows, then proceeded to inline up to three Context rows and two Destructive rows on top of five middle-section parents, which sums to ten on the single most common right-click in the app, a populated table cell. A rescue mechanism that collapses Advanced, then Convert, then Organise, then Share into a shared More bucket was supposed to bring that back under eight, but because it fires on ordinary objects rather than pathological ones, it means the set of visible sections changes depending on how many Context and Destructive rows an object happened to have, which destroys the very consistent-ordering promise the canonical order exists to protect.

The resolution this specification adopts is to stop treating the eight sections as the literal top-level count and instead make Context and Destructive each occupy exactly one slot, the same as the middle five. Section 1 is rendered as a single Context band, section 8 is rendered as a single Destructive band, and the count is therefore deterministically at most eight regardless of how rich the object is. The cost of this choice is that the most common context action sits one row down rather than flat at the top, and we pay that cost deliberately rather than ship a guarantee the layouts violate. We soften it in two specific, bounded ways that keep the common case fast without reintroducing variable arithmetic.

The first softening is that the Context band may inline a small fixed number of its highest-priority rows directly as top-level rows, and the rule is exactly two, never three, with everything beyond two folding into a single More submenu that still counts within the Context band's slots. Two inlined Context rows plus the AI Assist, Create, Convert, Organise, Share, and Advanced parents is seven, leaving exactly one slot for the Destructive band, which lands the worst case at eight without any cross-section collapse ever firing. The second softening is the sparse-merge rule, which works in the opposite direction. When a middle section resolves to a single action it inlines as one row labelled with the action rather than opening a one-child submenu, so a Convert that can reach only one target reads as a direct Convert to Table row rather than a Convert to submenu containing one item. The collapse-from-the-bottom mechanism from the original draft is removed entirely, because with Context capped at two inlined rows and Destructive capped at one slot the budget closes by construction and there is nothing left to rescue.

The Destructive band deserves its own sentence because the original drafts inlined two danger rows, a sub-object delete plus a widget archive, which is part of what blew the budget. This specification caps the Destructive band at one top-level slot. Where a widget-level Archive and a widget-level Delete both exist, Archive is the visible top-level row and Delete sits immediately behind it within the same band's single slot, either as a confirm step or as the band's one allowed second entry, never as a second independent top-level row. Sub-object deletes do not live in section 8 at all, which the consistency decision below makes uniform.

### Maximum two submenu levels

The renderer supports arbitrary nesting, so the two-level cap is a policy the resolver enforces rather than a renderer limit. Level one is the top-level row. Level two is a section's submenu, for example the Create submenu listing the kinds or the Convert submenu listing the targets. AI Assist is the one sanctioned exception to the strict two-level reading, and the challenged-assumptions section explains why, because its Change Tone and Translate parents genuinely need leaf children and flattening them into prefixed level-two rows would balloon the AI submenu past readability. Every other section holds to two levels, and the resolver rejects a third level from any non-AI-Assist contribution, including every marketplace contribution, at registration time.

### The contribution shape and the menu context

A `MenuContribution` is the unit every provider emits. It extends the field vocabulary of `CtxMenuItem` so the final mapping to a menu item is a near-identity transform, and it adds the routing metadata the resolver needs, namely which section it joins, which group it clusters into, its priority within that group, a predicate that decides whether it applies, and a danger flag that pins it to the Destructive band.

```ts
// src/renderer/src/lib/contextMenu/contribution.ts
export interface MenuContribution {
  id: string                       // stable, namespaced: "core/duplicate", "<pluginId>/<action>"
  section: MenuSection
  group?: string
  priority: number                 // lower sorts first; most-common = lowest number
  label: string
  icon?: string
  shortcut?: string                // populated from the real keydown source of truth
  danger?: boolean                 // forces Destructive band; cannot live elsewhere
  predicate: (ctx: MenuContext) => boolean   // false HIDES the row
  enabled?: (ctx: MenuContext) => boolean     // true predicate + false enabled = shown disabled
  disabledReason?: (ctx: MenuContext) => string | undefined
  onSelect?: (ctx: MenuContext) => void | Promise<void>
  children?: MenuContribution[]
}
```

The `MenuContext` is the single object computed once per right-click and passed to every predicate and every `onSelect`. It replaces the `selectionText`, `cellText`, and `imageUrl` sprawl the inventory found scattered across the codebase with one named shape that carries what the user actually clicked.

```ts
// src/renderer/src/lib/contextMenu/context.ts
export type ObjectKind =
  | { type: 'empty-canvas' }
  | { type: 'widget'; widget: Widget }
  | { type: 'multi'; widgets: Widget[] }
  | { type: 'browser-target'; widget: Widget; param: BrowserTargetParam }

export interface MenuContext {
  object: ObjectKind
  sub?: { granularity: string; payload: Record<string, unknown> }
  selection?: {
    text?: string
    range?: Range
    imageUrl?: string
    linkUrl?: string
    sourceWidgetId: string
    sourceKind: WidgetKind
  }
  taskId: string
  canvasPoint: { x: number; y: number }
  clientPoint: { x: number; y: number }
}
```

### The resolution pipeline

There is one entry point. It collects contributions from every provider, filters by predicate so a false predicate hides a row, normalises any danger contribution into the Destructive section so a plugin can never smuggle a delete into Context, orders by section then group then priority, folds into the eight bands honouring the two-inlined-Context-rows and single-Destructive-slot rules above, and maps the survivors to `CtxMenuItem[]`. Empty sections collapse and contribute nothing, so a menu with no Convert target shows no Convert row at all rather than a greyed one.

The three contribution origins, in order of authority, are the object-context provider for whatever was clicked, which is the only origin that contributes to the Context band, then the per-widget registry which generalises the old `headerMenuExtras` prop, then the universal providers for AI Assist, Create, Convert, Organise, Share, Advanced, and Destructive. The Create provider is a thin wrapper over the existing `CREATE_AND_CONNECT_MENU` so the create list stays single-sourced. Marketplace plugins push into a dedicated store the registry reads, constrained as the extensibility section describes.

---

## 2. Widget registration system

The registry lets each widget kind contribute its own Context band without anyone touching the renderer. It builds on the `CtxMenuItem` model, the `WidgetKind` union in `src/shared/types.ts`, and the declarative `CreateMenuEntry` pattern already proven in `createConnectedTool.ts`. The new code lives in `src/renderer/src/lib/contextActions.ts` and a barrel `src/renderer/src/lib/widgetContextRegistry.ts` imported exactly once from the renderer entry at `src/renderer/src/main.tsx`.

The registration system has one job, which is to let a widget say that when the user right-clicks an object of a given granularity inside it, here are the context-specific rows that belong in the Context band, and to let the widget opt a universal section in or out. Everything else stays the host assembler's responsibility. A provider returns its Context contributions plus a small map of universal-section flags, never a fully assembled menu, because the assembler owns ordering and the lower sections. This containment mirrors the discipline the codebase already trusts, where a `CreateMenuEntry` is declarative data rather than a closure over the store and the desk-agent profiles are sandboxed so a profile cannot erase or corrupt data no matter what it says.

### The ObjectContext and the provider contract

The host builds an `ObjectContext` at the click site, because the widget's own `onContextMenu` handler is the only place that knows whether the target was a table cell, a mindmap node, a page block, or the frame. That handler decides the `objectType`, builds a normalised `SelectionPayload` from what it has in scope, and calls one host entry point. A provider is a pure function of the context that returns its Context-band rows tagged with a priority band, plus its universal-section policy.

```ts
export type UniversalSection =
  | 'ai-assist' | 'create' | 'convert' | 'organise'
  | 'share' | 'advanced' | 'destructive'

export interface ContextContribution {
  context: PrioritisedItem[]   // Context-band rows only
  universal?: Partial<Record<UniversalSection, boolean>>  // omit a section by setting false
}

export type ContextProvider = (ctx: ObjectContext) => ContextContribution
```

A provider registers against a `(kind, objectType)` pair or a `(kind, '*')` wildcard that fires for every object inside that kind, which is how a widget declares object-agnostic actions such as a table's add-column reachable from any cell. The two-arity convenience form `registerWidgetContextActions(kind, provider)` registers a wildcard, and the three-arity form names a specific granularity. A widget does not declare a static granularity manifest anywhere, because granularity is expressed at the click site, which is the only place that knows what was under the cursor, and a runtime manifest would be one more thing to drift. The selection payload carries a DOM `Range` for contentEditable surfaces and Tiptap positions for the rich editors, so that section 1 edits and AI Assist can both write back precisely without re-deriving the selection.

### Ordering, dedupe, and the universal-flag merge

Within the Context band, rows order by a fixed set of priority bands, then by an explicit priority, then by author order, so a wildcard provider's table-wide action cannot jump above a cell provider's edit action. The bands, lowest first, are primary for the single most common action, edit for direct mutations, structure for structural moves around the object, navigate for reveal and move-to actions, and meta for informational or copy-out rows. When two providers fire for one click, the exact-granularity provider wins over the wildcard, a core owner wins over a marketplace owner, and the lower priority wins, with the loser dropped and a single dev-mode warning naming the collision. Marketplace ids are required to be namespaced as `pluginId/action` so a plugin physically cannot collide with a `core/` id. The universal flags merge by logical AND, so if any provider for the context disables a section it stays disabled, which is the safe direction.

Each `contextProviders/*.ts` file owns one widget family's providers and nothing else, which is the structural fix for the inventory's complaint that `TableWidget` re-derives the spawn list. The table's section-1 logic moves out of the component into `contextProviders/table.ts`, the component's `onContextMenu` shrinks to building the `ObjectContext`, and the duplicated `CREATE_AND_CONNECT_MENU` relabelling disappears because Create is now a universal section the assembler builds once.

---

## 3. Browser replacement context menu

The embedded browser is the `webview` widget, and it is the one surface whose menu does not come from the React substrate, because the right-click happens inside Chromium's own process tree. The renderer cannot read the selection, the link, or the image source on the embedded page, since all of that lives behind the webview's process boundary and is exposed only through Electron's `ContextMenuParams` on the main side. The goal is that the user sees the same `CanvasContextMenu` look, feel, ordering, and keyboard behaviour everywhere, while the data that populates the menu crosses the process boundary the only way it can.

### Native suppression, with the editable-field exception the critic required

The original draft proposed suppressing the native Chromium menu unconditionally and re-drawing Copy and Paste through a new IPC channel. The critic is right that this silently breaks more than it replaces. The native menu carries spellcheck suggestions through `dictionarySuggestions` and `replaceMisspelling`, it carries editable-field undo and redo, and it is where password managers and form-fill extensions hook. A closed verb allowlist of copy, paste, selectAll, and capturePage drops every one of those, so a user right-clicking a misspelled word in a webmail compose box loses corrections and a user in a login form loses autofill.

The decision this specification adopts is to split on `params.isEditable`. When the right-click lands in an editable field on the page, the handler does not suppress the native menu; it lets Electron show its own menu so spellcheck, autofill, undo, redo, and cut all keep working. When the right-click lands on read-only page content, a selection, a link, an image, a video, a file, or the bare page background, the handler calls `event.preventDefault()`, classifies the target, and sends an enriched payload to the renderer so the unified menu draws. This confines the uniformity win to the cases where it costs nothing and ships the editable-field case as native, which is the only honest treatment. The early `if (added === 0) return` that produces no menu at all on empty page space is removed, because the read-only page background now resolves to a real page-level menu.

### Target detection and the cross-boundary payload

Classification is a priority cascade over `ContextMenuParams`, factored as a pure helper `src/main/contextTarget.ts` next to `src/main/popupRouter.ts` so the e2e suite can assert it without a live webview. A non-whitespace `selectionText` wins first, then an image, then a video, then a link, with a file detected as a refinement of the link case by extension or `mediaType`, and everything else falling through to the page background. The `BrowserTargetType` union is text, image, video, link, file, and page.

The payload crosses the boundary once over the existing `context-menu:action` channel, widened to describe the target rather than name a single pre-decided action, carrying the classified `targetType`, the coordinates, the `webContentsId`, the clamped `selectionText`, the `linkURL`, the media `srcURL`, the `pageURL` and `pageTitle`, and the relevant `editFlags`. This widens the `ContextMenuPayload` and `ContextMenuAction` shapes in `src/shared/types.ts`, the `dispatchContextAction` builder in `src/main/index.ts`, and keeps the `contextMenu.onAction` bridge in `src/preload/index.ts` as a transparent pass-through. The selection is clamped to the 1000-character slice `createConnectedTool` already uses, on the main side, before it ever reaches the renderer. The return trip for actions that operate back on the page, Copy and Paste and Select All and capture, goes over a small companion channel `context-menu:invoke` handled in `src/main/ipc/index.ts`, which validates that the supplied `webContentsId` belongs to a webview the app owns before calling the matching method, and exposes a closed verb allowlist so the channel cannot execute page-supplied script.

### Where the menu mounts and how each target maps to the canonical order

`Canvas.tsx` `handleContextMenu` keeps its coordinate math, which converts the webview-relative click into canvas space, and becomes a thin adapter that opens a `CanvasContextMenu` built from a `buildBrowserMenu(payload)` function, the same pattern the bare-canvas menu uses. Because the menu portals to body it renders correctly over the heavyweight webview surface.

Each target type follows the canonical order with the Context band filled by the target's actions and the irrelevant sections suppressed. A text selection leads with Copy, Create sticky, Create note, and Search the web, with AI Assist present because the selection is summarisable text and its results landing as a new connected note rather than writing back into the third-party page. An image leads with Save image to desk, Copy image, and Open image in a new Browser widget, with AI Assist omitted because the object is binary pixels. A link leads with Open in a new Browser widget, Copy link, and Send to a note. A video mirrors the image. A file leads with Save file to desk routed through the unified `file` widget, which derives its subtype from MIME and extension. The page background leads with Save page, Pin page, Capture screenshot, and the heavier Create desk from page, which routes through the `ActionProposal` preview-then-apply chain so a page can never silently cause a desk to be created. Across all of them the ordering is identical and the menu never exceeds the eight-item ceiling, because only the most common target actions inline in the Context band and the rest fold into Create and AI Assist.

When more than one strong signal is present, for example a selection over a linked image, the classifier leads with the highest-priority target and surfaces the secondary target's primary action as one extra Context row, so the menu stays honest about what is under the cursor without forking. The page background is the catch-all so there is never an empty menu, and the one legitimate no-menu case is a torn-down webview whose rect cannot be resolved.

The security posture is enforced by construction. The page runs sandboxed with node integration off and context isolation on, the context data flows one way out of that sandbox as read-only Electron params, and the return channel validates webview ownership and exposes only the closed verb set. Selection text and URLs that cross the boundary are treated as untrusted, used only as clamped widget content seeds or as React-escaped display strings, never as anything evaluated.

---

## 4. Text-selection workflows

A text selection is the richest single context and the one with the most existing plumbing, since the text widgets already read the selection in their `onContextMenu` handlers. The selection-driven menu is the canonical eight sections with the Context band filled by selection actions and a scope flag derived from whether the selection is empty.

The Context band leads with the operations that act on the selected text in place. Copy and, where the surface is editable, Cut and Paste appear with their real accelerators, and on a read-only surface Cut and Paste render disabled rather than vanishing because a user who selected text expects to at least see them. The scope rule is uniform across the cluster. When the selection is non-empty the action operates on the selection and the result replaces exactly that selection, and when the selection is empty the same action operates on the whole widget body. This derived scope flag is the one small piece of net-new state the design adds, computed at dispatch time from the selection text the per-widget context already carries.

AI Assist is present on any text selection and operates on the selection, with the full submenu described in section 7. Create inherits the selected text as the seed for a new connected widget, and Convert offers the genuinely different reinterpretations, which on a plain text selection is the short list the conversion section keeps after collapsing the Create overlap. The remaining sections behave as their universal providers dictate, with Organise mostly inert on a pure selection and therefore suppressed, Share carrying Share selection where supported, and the Destructive band carrying Delete selection meaning delete the selected text, drawn last behind a divider.

---

## 5. Object-selection workflows

The single-object workflow is a right-click on exactly one widget with no active multi-selection. Today this is the `WidgetFrame` header menu, and the design pours it into the canonical shape so that a section, which currently renders its own divergent smaller menu, and every other widget present the same spine.

The Context band is the widget-kind-specific set, supplied through the registry, so a timer leads with Start, Pause, Reset, a color leads with Copy hex and Pick from screen, a mindmap node leads with Add child and Generate branches, and a desk agent leads with Run now and Edit instruction. The rule that holds across all of them is that the Context band changes by kind while the other seven sections stay constant. AI Assist operates on the whole widget body where the widget is text-bearing and is suppressed where it is not. Create and Convert offer spawning a connected neighbour and reinterpreting the widget. Organise carries Bring to front and, when the widget is a section child, the eject affordance. Share carries Share and Make this a task. Advanced carries the duplicate family and, where applicable, Unlink from synced copies. The Destructive band carries Archive with Delete behind it. Folding the section's own header menu into this shape is what closes the fragmentation the inventory flagged, where a section today lacks Archive, Bring to front, and the duplicate family that every other widget has.

The empty-space workflow is the bare-canvas right-click. Because there is no object and no selection, several sections have nothing to act on and are suppressed rather than shown disabled. The Context band leads with Add object placing a new widget at the click point, and with Paste here. The view controls, Auto-arrange with its grouping options and Home-fit-all and Reset-view, live where they belong with their real accelerators. AI Assist is absent because there is no content to transform, and Convert, Share, and the Destructive band are likewise absent because none has a target. The bare canvas is the one surface where Create legitimately merges up into the Context band rather than living as its own row, because with no source widget to connect to, the connected-Create concept does not apply and Add object is itself the placement action.

---

## 6. Multi-selection behaviour

Multi-selection is the largest behavioural gap the inventory found, because `selectedIds` exists and is maintained but no context menu reads it, so a right-click with four widgets selected silently acts on one. The menu pivots to bulk mode when `selectedIds.length` is two or more and the right-clicked widget is a member of that selection. Right-clicking a widget outside the live selection is treated as a fresh single-object right-click and sets the prior selection aside, which keeps the trigger unambiguous.

In bulk mode the Context band opens with an inert header row stating the count, drawn the way `ConnectedToolMenu` draws its title, so the user is certain what the menu will act on, and beneath it sit the most common bulk operations. Group these N into a section wires into `groupIntoSection`, Duplicate selection into `duplicateSelection`, and Align and Distribute into the alignment helpers. AI Assist offers the batch form over the text members. Convert applies the matrix per member. The Destructive band carries Archive these N and Delete these N wired into `deleteSelection`, each interpolating the live count so the blast radius is explicit. The single-item connected-Create path is the one deliberate omission, because connect semantics need exactly one source widget, and offering it on a heterogeneous selection would be misleading.

The critic's point about heterogeneous selections is taken and applied uniformly. Every bulk verb follows a skip-and-report pattern. A bulk action states how many of the N selected it will actually affect and which it will skip, or it disables with a reason when zero members qualify. Bulk AI Assist runs only on the text members and the combined preview notes which were skipped, bulk Convert applies the matrix per member and skips the Off cells with the same report rather than silently no-opping, and any Share or Export bundle action appears only once a receiving surface is confirmed to exist and is removed from the menu until then.

---

## 7. AI Assist submenu design

AI Assist is section 2, a single top-level row with a `children` array rendered by the unchanged substrate. It is the one section permitted the third depth level, because its Change Tone and Translate parents need genuine leaf children and flattening them into prefixed level-two rows would balloon the submenu to roughly two dozen flat rows, which is the scroll overload the design exists to avoid. The challenged-assumptions section records this exemption explicitly so the architecture's flatten-to-level-two rule and this tree do not contradict each other.

The submenu has three regions. The first is the direct verbs in most-common-first order, namely Improve Clarity, Fix Grammar, Rewrite, Simplify, Summarise, Expand, and Continue Writing. Improve Clarity and Fix Grammar lead because they are the lowest-risk, highest-frequency edits a user reaches for on text they just dumped, and Summarise, Expand, and Continue Writing trail because they change length materially. The second region is the two parameterised submenus, Change Tone and Translate, each a real level-two submenu with leaf children. The third region is Custom Prompt, kept last because it is the escape hatch rather than the common case.

Change Tone ships four curated tones, Professional, Friendly, Concise, and Direct, plus Custom Tone, rather than the ten the brief originally requested, because ten flat tones force the user to discriminate between registers the model treats as near-identical, and Professional absorbs Formal and Executive while Friendly absorbs Casual. Anything beyond the four routes through Custom Tone, which accepts any word the user types and produces the same call shape, so nothing is lost in capability while the common path drops from a ten-item scan to a four-item glance. Translate offers a short curated language list plus Custom Language on the same principle.

Every verb gathers context from the same selection capture the text widgets already perform, derives a scope of selection or whole-widget from whether the selection is empty, and calls a new one-shot `ai:transformText` channel in `src/main/ipc/index.ts` next to `wires:runTransform`, which the existing channel cannot serve because it resolves a source and a target widget id and cannot take a raw selection string. The transform reuses `runTransformWire` whose plain-text in and out contract and SKIP convention are exactly what AI Assist wants, with a larger token budget for Expand and Continue Writing and a higher source clamp for Summarise. Nothing applies blind. The result stages in a shared `AiAssistPreview` panel generalised from the `PageWidget` staging pattern, offering Discard, Regenerate, and Apply. The custom verbs reuse that same panel with a pre-focused input rather than trying to put an input inside the menu, which is why they sit at the level-one and level-two limits without needing a forbidden third menu level.

The result lands by the widget's storage model. Plain-text widgets apply through a store update, the rich editors apply through the Tiptap chain at the captured range, a card lands in whichever of its title or body the selection came from, a table cell commits inline for a short result and spawns a connected note for a long one, the browser lands results as a new connected note because the page is read-only, and a living-doc body never receives a write at all because it is system-owned. AI Assist is present wherever a writable or summarisable text target exists, trimmed to short-form verbs where the target is a short steering string such as a card title or a living-doc brief, and omitted entirely where the object carries no prose, which the layouts state at each point.

---

## 8. Conversion workflows

The honest starting position is that Create and Convert are one spawn-and-link path with a transform step of varying richness in front of the content argument. Create reads no source content or treats it as an optional seed and answers the question of wanting a new thing here, while Convert reads the full content of a specific source and produces a different representation of that same content, answering the question of expressing this thing as a different kind of thing. The practical test at the call site is whether the action merely seeds from the source, in which case it is Create, or must extract and reinterpret the source to fill the target's schema, in which case it is Convert.

The critic is right that on a plain text selection these two are the same operation and listing both produces two near-identical submenus one level apart, both reading Sticky, Note, Markdown, Page. This specification therefore collapses Create and Convert into a single Turn into submenu whenever the source is a text selection, since there the distinction is invisible to the user. A distinct Convert section survives only for genuinely structural reinterpretations where the target schema differs from the source, namely table to markdown, mindmap to tasks, sheet to table, and the like. On a plain text object the user sees one Turn into list, not two.

Convert produces a linked new widget by default and preserves the source. In-place replacement that swaps a widget's kind while keeping its id and links is offered only as an explicit, clearly labelled secondary action under Advanced, gated behind a preview, and forbidden outright where the source or target uses an external backing store that cannot be cleanly migrated in the first cut, which means any Table conversion, because a kind swap there would orphan or duplicate the backing-table row. The new-linked-widget default is non-destructive, keeps every existing wire valid, and is trivially reversible, which is the correct posture for a tool whose users skew toward executive-function support.

The transform matrix classifies each source-to-target cell as a deterministic structure-preserving transform applied directly like Create, an AI-mediated transform surfaced as a `convert-widget` `ActionProposal` that inherits the existing preview-then-apply card, or off and therefore absent. The rule that decides structure versus AI is whether the source structure maps onto the target schema by a total function, so text-to-text and list-to-table-from-clean-bullets are structure while free prose to a typed table or a flat note to a hierarchical mindmap are AI because they require interpretation. Four conversions carry most of the traffic and each reuses a named primitive. A table row to a task maps the primary text column to the title and folds the rest into the body through the existing make-a-task path. A text selection to a sticky is a verbatim clamped copy through `createConnectedTool`. A note to a mindmap lands AI-proposed nodes in the mindmap's existing pending-children accept-or-reject channel so the user prunes before they commit. A mindmap to tasks turns each first-level branch into a task whose subtree becomes its checklist.

Every Convert target is gated on a confirmed receiving surface before it appears in any menu. Convert to Calendar event is removed from the menus entirely until a calendar surface exists, rather than shipping as a permanently dead disabled row in every menu, which the disabled-versus-hidden decision below makes a general rule. Convert to Desk and Convert to Task collapse into a single row unless the create layer actually exposes two distinct operations, because two menu rows that produce one effect is its own consistency problem. The new code is a thin `src/renderer/src/lib/convertWidget.ts` owning only the extraction matrix and a content extractor in `src/renderer/src/lib/widgetContent.ts`, delegating all spawning and linking to `createConnectedTool`, with the in-place path calling a new `convertKind` store operation that re-points links through the links store rather than letting the pruning layer drop them.

---

## 9. Marketplace extensibility framework

A marketplace plugin contributes context-menu actions through a declarative manifest, never compiled code, and can never mint a new widget kind because the renderer maps every `WidgetKind` to a component through exhaustive switches over a closed union in `Canvas.tsx`, `WidgetFocusMode.tsx`, and `WidgetPreview.tsx`, into which a plugin cannot add an arm. A plugin extends behaviour around the existing kinds and the existing canonical menu, and the host, not the plugin, executes every action.

The manifest declares a set of context actions, each naming a band, a declarative predicate the host evaluates against the live context, and one of two host-owned handler shapes, a spawn intent the host runs through `createConnectedTool` or an AI verb the host runs through `ai:transformText`. The plugin never supplies an `onClick`, which is the single decision that makes the framework safe, because a plugin cannot throw inside the click path, cannot read across the canvas, and cannot leave the workspace half-mutated. The host evaluates the predicate against the full internal context to decide visibility, then, only if the user clicks, passes the minimal declared seed into the host execution path, so a plugin's entire window into the workspace is the seed string for the one object the user explicitly acted on.

The critic correctly flagged that scattering plugin items across Create, Convert, and Advanced makes their per-section budgets collide with the first-party second-level menus those sections need for Translate, Change Tone, and convert targets, consuming the two-level cap on plugin bookkeeping. This specification therefore does not let plugins share the built-in sections' submenu budget. All marketplace contributions land in a single dedicated place, a submenu under Advanced labelled Installed tools, rather than competing across three first-party bands. This keeps the trust boundary in one obvious location, keeps the two-level cap available for first-party content, and makes flooding controllable through a single cap rather than three. A per-plugin item cap and a global per-manifest cap still apply, overflow folds into one nested list inside that single Installed tools submenu, and a boundary header makes plugin provenance visible. Ids are namespaced so cross-plugin collisions are impossible, label clashes disambiguate by appending the plugin name, and a manifest that fails schema validation, targets a forbidden band, exceeds its cap, or mismatches its declared permissions against its handler shape is rejected whole at install and never reaches the render path.

Failure isolation is layered. Rejection at install keeps a broken plugin out of the registry, per-item try-catch at render drops a throwing entry with a logged warning while every other item renders, and the host-owned `onClick` means the only code that runs on click is host code over validated data. A persistently misbehaving plugin is quarantined after a threshold of repeated drops. The manifest is signed by the marketplace and verified before its actions enter the registry, installation gates on the existing `marketplace_*` capability keys, and revocation is a host-side trust change rather than a per-plugin uninstall. The framework extends `src/renderer/src/lib/contextActions.ts` with the manifest types and a `registerManifest` entry point, persists installed manifests following the templates precedent, and reuses `createConnectedTool`, `spawnPositionFor`, the `ai:transformText` channel, and `useCapability` unchanged.

---

## 10. Recommended final menu layouts for every Haptyx widget

Every layout below is the resolved output of the architecture above, so each is what `resolveMenu` produces for `CanvasContextMenu` to draw, and each obeys the same rules uniformly. The Context band inlines at most its two highest-priority rows and folds the rest into a More submenu, the middle five sections each take one slot and collapse to a direct row when sparse, the Destructive band takes one slot with Archive visible and Delete behind it, and every sub-object delete lives in the Context band rather than in section 8. AI Assist appears only where the object carries writable or summarisable prose. Convert appears only where a confirmed target exists, and on a plain text object it is the single Turn into submenu shared with Create. Disabled-but-shown is reserved for genuinely transient state and never for default empty state or unbuilt features. The verb vocabulary is fixed across the whole catalog so the same concept always reads the same way, with Copy, Edit, Clear, Add, Insert, Open, Run now, Reload, and Change source meaning the same thing everywhere, sub-object removal always Delete, and widget removal always Archive then Delete.

### Text and notes cluster

The plain-text widgets sticky and note store a flat string, so their selection is a substring and their apply is a store update, while the rich editors markdown and page hold a Tiptap document and apply through the editor chain. Card splits into a title and a body, and living-doc is system-owned and read-only. These storage shapes are why the same logical action lands differently per widget.

The sticky exposes a text-selection, a body, and a whole-widget granularity. On a selection the Context band leads with Copy selection and Edit, AI Assist is present and full, the shared Turn into submenu offers the text targets seeded from the selection, Organise carries Bring to front and the conditional eject, Advanced carries the duplicate family, and the Destructive band is Archive then Delete. On the empty body, AI Assist shows disabled with a nothing-to-rewrite-yet reason only while genuinely empty, and Clear shows disabled only when the body is already empty, which are transient states the user is actively in rather than default clutter. Move-out-of-section and Unlink-from-synced-copies do not appear at all until the widget has a `parentSectionId` or a `syncGroupId`, so a brand-new empty sticky shows a clean menu rather than four greyed rows.

The note is structurally identical to the sticky and reuses its layout with the kind label swapped, since inventing different verbs for an identical surface would break the consistency rule.

The markdown widget adds block and checklist-item granularities to the selection and whole-widget ones. A selection leads with Copy and Edit and offers a Format selection submenu of Bold, Italic, Strikethrough, Code, and Link, the one markdown-specific Context action. A block offers Edit, Copy, Duplicate, Move, and Delete block, with the block delete living in the Context band as a structural edit of the document. A checklist item adds Toggle checkbox as its leading row and is otherwise the block layout. AI Assist applies on the selection, block, and checklist item because each carries text, and applies through the Tiptap chain with `markdownToTiptap` bridging any markdown the model returns.

The page is the richest text widget and shares the markdown granularity set. Its selection menu adds a Turn into submenu of Heading, Paragraph, Bullet list, Numbered list, and Todo for block-type changes, its block menu leads with Edit and the same Turn into, and its whole-widget Convert is a strong source because page-to-markdown is a clean structure transform.

The card exposes a selection, a title, a body, and a whole-widget granularity. A selection leads with Copy and Edit and a Set accent submenu, and AI Assist lands back in whichever of title or body the selection came from. The title granularity trims AI Assist to the short-form verbs Improve Clarity, Fix Grammar, Rewrite, and Change Tone, omitting the length-changing verbs because expanding a callout title contradicts its purpose. The body granularity carries the full verb set, and the whole-widget AI Assist targets the body and never the title.

The living-doc is read-only and system-owned. Its selection granularity is a copy-out surface offering Copy and a convenience Create-from-selection, with AI Assist omitted entirely because the body cannot receive a write, and Convert reading the generated content into a new linked widget while leaving the doc intact, with in-place conversion hidden and the synced-duplicate family hidden because a system-owned summary is neither. The brief-query granularity is where the writable actions concentrate, leading with Edit brief, Refresh now, and Pause auto-refresh, with AI Assist present but scoped to the brief and trimmed to the short-form verbs, because the brief is the one editable text the widget owns.

### Structured-data cluster

The table exposes cell, row, column, multi-cell-selection, and whole-widget granularities, served from `contextProviders/table.ts`. A cell leads with Edit cell and Clear cell inlined, with Copy value, Add row, and Add column folded under More, AI Assist present and landing inline for a short result or as a connected note for a long one, the shared Turn into offering Field as the clean single-value target, and the Destructive band carrying Archive table with Delete table behind it. The sub-object Delete row lives in the cell's and the row's Context band, danger-styled and last within the band, and never appears as a second section-8 row, which resolves the two-delete-rows problem the critic flagged. An empty cell shows Edit enabled and Clear, Copy, and AI Assist disabled only because the cell is transiently empty. A row leads with the inserts and Duplicate row, with Delete row in the Context band. A column leads with Edit column and Sort, folds the inserts and Clear column under More, carries Delete column in the Context band, and suppresses AI Assist entirely because a column is a schema object with no single text body to rewrite. A multi-cell selection auto-exposes Copy block, Clear cells, and Fill down with bulk AI Assist and a selection-to-table Convert. The whole-widget menu offers Add row and Add column with a deterministic Convert to Markdown.

The field widget exposes a value, a configuration, and a whole-widget granularity, served from `contextProviders/field.ts`, flexing the value rows by field type so a checkbox offers Toggle and a button offers no Clear. The value granularity leads with Edit, Clear, and Copy, with AI Assist enabled for a text field and disabled for a constrained select. The configuration granularity leads with Edit field type and suppresses AI Assist, Create, and Convert because a configuration considered apart from its value has no coherent target for any of them, with a Reset field config danger action distinct from Archive.

The custom-block widget exposes a placed field that splits by design versus use mode, a block record, and a whole-widget granularity, served from `contextProviders/custom-block.ts` reading the mode from the payload. A design-mode field leads with Edit field and a Change type submenu and carries Delete field in the Context band, suppressing AI, Create, and Convert as a structure object. A use-mode field value behaves like the field widget's value granularity. A block record leads with Submit record, Clear all fields, and Copy all values, with Submit disabled only when no submit action is configured, and a record-to-table Convert.

### Web and file cluster

The webview is the one kind whose Context band is sourced from the main-process target detection, unified through the same pipeline. Its granularities are the page-text selection, image, link, video, file, the editable field which falls through to the native menu, the page background, and the whole widget. Selection leads with Send to a note and Copy and carries full AI Assist landing as a connected note, while image, link, video, and file omit AI Assist as binary or pointer objects and lead with their save and open actions. The page background leads with Reload and Change source.

The file widget resolves a subtype and renders pdf, image, video, audio, gdoc, gsheet, gslide, or email through one component, so those folded kinds are presented as the subtypes a file resolves to. The shared source-url and whole-widget granularities lead with Open, Copy link, Reload, and Change source. A pdf, gdoc, gslide selection or page carries AI Assist and the text Convert targets where a text layer exists, disabled only transiently while the preview has not yet loaded text. A gsheet's distinguishing action is a real Convert to Table from a structured range. An image or a raw video omits Convert entirely because the matrix marks those targets off, rather than showing an empty submenu. The email subtype promotes Make this a task into its Context band because turning an email into a task is the dominant email intent.

### Visual-thinking cluster

The mindmap exposes node, branch, pending-children, map-canvas, and whole-widget granularities. A node inlines Add child and Generate branches with AI, folds Edit label, Explore as task, Attach a widget, Assign Desk agent, and Copy node text under More, carries AI Assist on the label text, and carries Delete node in the Context band. A branch leads with Collapse branch and carries Delete branch in the Context band. Pending children offer only Accept, Accept all, and Reject with AI Assist, Create, and Convert all suppressed because the content does not exist yet. The map canvas shows AI Assist disabled with a select-a-node reason, which is the one place a node target is genuinely expected from the empty canvas.

The diagram exposes node, edge, multi-node-selection, canvas, and whole-widget granularities. A node inlines Edit label and Set shape, folds Set colour, Add connected node, Upload image, and Copy label under More, with Upload image disabled only on a non-image node, and carries AI Assist on the label and Delete node in the Context band. An edge offers Edit label, Toggle arrow direction, and Toggle animation, suppresses AI Assist because an edge is a connector not prose, and carries Delete edge in the Context band. A multi-node selection auto-exposes Set colour for all, Align, and Connect in sequence with Delete N nodes.

The scratchpad exposes an ink-layer and a whole-widget granularity. The ink layer leads with Undo last stroke, Set colour, and Switch to eraser, suppresses AI Assist because freehand ink is not prose, and carries Clear scratchpad in the Destructive band.

The shape exposes a body and a label granularity. The body leads with Set shape, Set fill, and Set stroke and suppresses AI Assist because geometry is not prose, while the label granularity enables AI Assist because the clicked object is now text, which is the cleanest demonstration in the catalog of granularity-aware suppression.

### Tools and utility cluster

The voice-recorder is the one widget in this cluster with AI Assist, on its transcript and transcript-selection granularities, because a transcript is genuine prose. The transcript leads with Copy and a Re-run submenu of the real process modes, with an Apply-extracted-actions row disabled only transiently when no proposals are cached. The recording-blob granularity offers Play, Save audio to canvas, and Re-record and omits AI Assist.

The SpeedDeck retires its bespoke menus onto the substrate. A button tile inlines Run now and Configure, folds Copy, Cut, Duplicate, and Make folder under More, and suppresses AI Assist because a macro is a control. An empty slot offers Add button and a Paste disabled only when the cross-deck clipboard is empty, which is a true transient state. The deck background offers Copy deck JSON, Export, and Import with Reset in the Destructive band.

The timer suppresses AI Assist and leads with a state-aware Start, Resume, or Restart, a Pause disabled only when not running, a Reset disabled only at zero, and Set duration. The calculator suppresses AI Assist, leads with Copy result disabled only on an error or empty display, Copy expression, and Clear, and offers a single Convert to Field. The color suppresses AI Assist as the canonical hide example, leads with Copy hex, Copy RGB disabled only on an invalid hex, and Pick from screen disabled only when the EyeDropper API is absent, which is a genuine capability gate.

The local-app-launcher suppresses AI Assist and leads with Launch app, disabled while launching or when the binding is dangling, a mode toggle, and Reveal in Finder, with Unbind app under Advanced. The Desk agent suppresses AI Assist across its granularities, including the instruction, where the omission is a deliberate judgement call because the agent's own model run is the authoritative AI path and a parallel in-menu rewrite would confuse which is canonical. Its instruction granularity leads with Run now, Edit instruction, and Pause or Resume the kill switch, its run-log-entry granularity leads with Copy output, Create note from output, and Clear log in the Context band, and its wired-input granularity leads with Open source widget and Disconnect input. The task-link suppresses AI Assist and leads with Open task, disabled when the reference is dangling, Start a five-minute session, and Copy task title, with Change target task under Advanced and Unlink in the Destructive band.

### Layout, meta, and container widgets

The section restores the standard frame menu it lacks today. Its whole-section granularity inlines Rename section and a Change layout submenu of the five real layout modes, folds Change colour and Select members under More, suppresses AI Assist because a section is a pure container, offers a single Convert to Desk, carries Pin and Bring to front under Organise, and carries Eject all members and Remove section in a single Destructive slot. The member-widget granularity defers to the child's own menu and injects only Eject from section and Move to another section into Organise. The minimap and portal are pure structural views, so they suppress AI Assist, Create, Convert, and Share, and lead with navigation, Recenter, Jump to, Home-fit-all, Refresh, and for the portal Open target desk and Change target, with the portal's unbound state correctly hiding Open rather than showing it disabled because an unbound portal has no target to open.

---

## Challenged assumptions and resolutions

The critic's central finding is correct and this specification adopts the fix in full. The challenged assumption is that the eight fixed sections are themselves the eight-item top-level ceiling. The drafts' own worked table-cell example and nearly every per-widget layout overflowed to ten or eleven top-level rows and relied on a collapse-from-the-bottom rescue that, by firing on ordinary objects, made the set of visible sections depend on object richness and so broke the consistent-ordering promise. The decision is to make Context and Destructive each occupy exactly one band slot, the same as the middle five, which caps the count at eight deterministically. We soften the cost in two bounded ways that never reintroduce variable arithmetic, namely the Context band may inline at most two highest-priority rows with the rest folding into one More submenu, and a sparse middle section inlines its single action as a direct row. The collapse-from-the-bottom mechanism is removed entirely because the budget now closes by construction. Every layout in section 10 obeys this rule.

The related assumption that inlining Context rows and inlining Destructive rows are both compatible with a hard eight is resolved by the same decision plus an explicit Destructive policy. A sub-object delete is a Context-band action, never a section-8 row, and section 8 inlines at most one widget-level destructive slot with Archive visible and Delete behind it. This is why the table row menu no longer shows two delete rows, and it is the foundation for the consistency decision below.

The assumption that sub-object deletes can land in whichever section each granularity found natural is rejected. The drafts placed Delete row in section 8 from a cell but in section 1 from a row, and Delete node in section 8 while Delete block sat in section 1, which makes the same conceptual action unpredictable. The adopted rule is uniform: any delete smaller than the whole widget lives in the Context band, danger-styled and last within the band, and section 8 is reserved exclusively for widget-level Archive and Delete. Every layout has been audited so Delete row, Delete node, Delete branch, Delete block, Delete column, and Delete field all sit in the same band regardless of entry granularity.

The assumption that Create and Convert are distinct enough to both appear on a text selection is modified. On a plain text source they are the same operation and the drafts formalised the overlap by listing the same four targets twice one level apart. The resolution is to collapse them into a single Turn into submenu whenever the source is a text selection, and to keep a separate Convert section only for structural reinterpretations where the target schema genuinely differs from the source. This is reflected throughout the text, web, and visual clusters.

The assumption that the native browser menu can be suppressed unconditionally is rejected for editable fields, because the closed verb allowlist drops spellcheck suggestions, autofill hooks, and editable-field undo and redo. The resolution splits on `params.isEditable`, falling through to the native menu in editable fields and unifying only the read-only page cases, which confines the uniformity win to where it costs nothing.

The assumption that prefer-disabled-over-hidden produces clean menus is modified, because applied at the layouts' granularity it filled a brand-new empty sticky with four greyed rows and shipped a permanently dead Convert-to-Calendar-event row in every menu. The tightened criterion is that disabled-but-shown is reserved for genuinely transient, action-adjacent state such as an empty clipboard or an operation in flight, and never for default empty state or for unbuilt features. Move-out-of-section and Unlink appear only once the widget has a `parentSectionId` or a `syncGroupId`, Convert to Calendar event is removed until a calendar surface exists, and an unbuilt Convert target is treated as out of scope rather than as a placeholder.

The assumption that plugins can register across Create, Convert, and Advanced is rejected, because plugin overflow there consumes the two-level cap that the first-party Translate, Change Tone, and convert submenus need. All marketplace contributions are confined to a single Installed tools submenu under Advanced, which keeps the trust boundary in one place and the second level free for first-party content.

The assumption that AI Assist must flatten to two levels like every other section is modified by granting AI Assist a sanctioned exemption, because its Change Tone and Translate parents need genuine leaf children and flattening them produces a two-dozen-row flat list. The architecture's flatten-to-level-two rule explicitly exempts AI Assist, and AI Assist in turn keeps its tone and language lists short so the three-level tree stays readable.

The assumption that Convert targets map to real receiving surfaces is enforced rather than assumed. Convert to Calendar event is removed until a calendar exists, Convert to Desk and Convert to Task collapse into one row unless two distinct operations actually exist, and any unconfirmed target is out of scope.

The assumption that bulk verbs apply coherently to heterogeneous selections is resolved by applying the skip-and-report pattern uniformly, so every bulk action states how many of the N it will affect and which it will skip or disables with a reason at zero, and any export or share-bundle action appears only once its surface is confirmed.

The assumption that keyboard parity arrives as one section among many is resolved by sequencing, which the implementation recommendation below treats as a gated milestone with its own acceptance test rather than a claim other deliverables may assume.

---

## Implementation sequencing

The right first move is to land the resolution layer and the ceiling rule on top of the unchanged `CanvasContextMenu`, because everything else composes on it. Build `src/renderer/src/lib/contextMenu/` with the section enum, the contribution and context shapes, and `resolveMenu` enforcing the two-inlined-Context-rows cap, the single Destructive slot, the sparse-merge inline, and the two-level cap, then migrate one surface, the bare-canvas menu, to prove the pipeline end to end against the existing `buildCtxMenu`. With the resolver proven, build the registry in `src/renderer/src/lib/contextActions.ts` and the barrel imported once from `main.tsx`, then migrate the table from its bespoke per-cell menu to `contextProviders/table.ts`, which is the highest-value migration because it retires the duplicated create logic the inventory flagged.

Five primitives are unbuilt and several layouts depend on them, so they are sequenced explicitly rather than assumed present, and every row that needs one ships disabled-with-reason until its primitive lands. Build `ai:transformText` and the generalised `AiAssistPreview` first, because the most rows across the most clusters depend on them and they touch only the AI channel and one shared component. Build the `convert-widget` `ActionProposal` and `widgetContent.ts` extractor next so the structural Convert targets light up, then the in-place `convertKind` store operation with link re-pointing, which is the riskiest because it touches the link-pruning layer. Build the multi-widget batch over `selectedIds` last, as the fast follow the multi-selection menu was always designed to receive.

The browser replacement lands as its own piece once the resolver exists, shipping the editable-field native fall-through first since it is pure suppression logic, then the read-only target classifier and the widened payload, then the validated `context-menu:invoke` return channel. The keyboard and accessibility layer is a separate gated milestone with its own acceptance test, sequenced so the in-menu navigation that touches only `CanvasContextMenu` and benefits every mouse-opened menu lands ahead of the larger and riskier roving canvas focus, and no other deliverable asserts keyboard parity until it is green. The marketplace framework lands after the registry and the AI and Convert primitives, since its handlers reuse them.

## Open questions

A handful of decisions need confirmation against the running code before the dependent layouts ship. Whether a calendar surface will exist determines if Convert to Calendar event ever returns from out-of-scope. Whether the create layer exposes a desk-creation operation distinct from task creation determines if Convert to Desk and Convert to Task stay collapsed into one row. Whether an export or share-bundle surface exists determines if the bulk Export selection row appears at all. Whether each cloud file subtype's preview reliably exposes a selectable text layer determines which of those AI Assist and text-Convert rows ship enabled rather than transiently disabled. And the exact trackpad two-finger and long-press timing, tuned for a mouse today, needs revalidation once the keyboard and accessibility milestone is under test.

```json
{
  "confidence": 0.8,
  "why_not_higher": "The integration is grounded in the same real files the source deliverables traced directly, namely CanvasContextMenu's CtxMenuItem model, createConnectedTool and CREATE_AND_CONNECT_MENU, spawnPosition, the main-process ContextMenuParams handler and shared payload types, and the stores' selectedIds and group/duplicate/delete operations, and it resolves the critic's findings into one consistent voice rather than leaving the contradictions in place. It is below 0.9 because the unifying ceiling rule, the single-Destructive-slot policy, the uniform sub-object-delete placement, and the merged Turn-into section are design decisions newly applied across every layout in this pass rather than re-validated row by row against each component, and because five load-bearing primitives (ai:transformText, AiAssistPreview, the convert-widget proposal, the in-place convertKind op, and the multi-widget batch) remain unbuilt, so a builder will find that many enabled rows must ship disabled-with-reason until those land, and a few component-specific method names and subtype text-layer behaviours are taken from the source findings rather than re-read here.",
  "assumptions": [
    "Making Context and Destructive each a single band slot, with at most two inlined Context rows folding the rest into More, is the accepted reading of the max-8 rule, accepting that the most common action sits one row down rather than flat at the top.",
    "Sub-object deletes belong uniformly in the Context band and section 8 is reserved for widget-level Archive then Delete, so no layout shows a sub-object delete and a widget archive as two separate top-level rows.",
    "Splitting the browser menu on params.isEditable, native in editable fields and unified on read-only page cases, is acceptable, and the five unbuilt primitives can be sequenced so layouts ship incrementally with disabled-with-reason rows until each lands.",
    "Collapsing Create and Convert into one Turn-into submenu on text selections, and confining all marketplace contributions to a single Installed tools submenu under Advanced, are acceptable resolutions of the overlap and budget-collision findings.",
    "AI Assist is the one sanctioned three-level exception so its Change Tone and Translate parents keep leaf children, and Convert to Calendar event, a distinct Convert to Desk, and a bulk export surface stay out of the menus until their receiving surfaces are confirmed to exist."
  ],
  "flags": ["HUMAN_REVIEW_REQUIRED"]
}
```
