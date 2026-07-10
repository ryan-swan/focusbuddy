# Voice / press-to-talk context routing

Goal: make press-to-talk (VoiceCommandFAB) work across every widget and office
file type, not just the canvas. Scoped with the ai-proposal-owner 2026-07-10.

## The core problem

PlexiDesk has TWO unrelated AI-action systems and voice only speaks the first:

1. Canvas `ActionProposal` / `applyProposal` (lib/actionExecutor.ts switch,
   exhaustiveness-checked via `_exhaustive: never`). Voice sends a canvas snapshot
   (buildCanvasSnapshot) to `main/ai/voiceCommand.ts` whose prompt documents only
   12 proposal kinds — canvas widgets only. No office/doc/sheet/slides/map/design.
2. Per-editor AI: doc `useDocAi.ts`, sheet `useSheetAi.ts`, slides `useSlideAi.ts`,
   design `DesignAiPanel.tsx` call `window.api.ai.suggestDocContent` /
   `rewriteSelection` (anthropic.ts:3461/3494 — HTML-preview, host applies). Map
   has NO AI hook at all (fully net-new). These do NOT produce ActionProposals.

So making voice office-aware = bridging to system 2 per context, not forcing
office edits through the canvas `edit-document` (which today hard-rejects any
docType != 'doc', actionExecutor.ts:161).

## The routing seam (build once)

New `lib/voiceContext.ts` exporting `resolveVoiceContext()` — the ONLY place that
reads useViewStore + useDocumentsStore + useWidgetStore to decide context:

```ts
type VoiceContext =
  | { kind: 'canvas'; taskId; selectedWidgetId; focusedWidgetId }
  | { kind: 'document'; documentId; docType }
```

Detect: view.kind==='task' → canvas; view.kind==='document' + documentsStore.active
(id match, guards a race) → document of docType; widgetStore.focusedWidgetId set →
focused-widget scoping of the canvas path. Call it fresh at BOTH send-time AND
apply-time in VoiceCommandFAB (user may switch views mid-flow) — do not cache.
Main side: keep runVoiceCommandStreaming (canvas) as-is; add sibling
`main/ai/voiceCommandDocument.ts` with per-docType prompts (don't overload the
canvas prompt).

## Rollout (each = new proposal kind + apply fn + tester checkpoint; canvas path never touched)

0. Ship resolveVoiceContext() with every non-canvas branch returning canvas
   (plumbing only, zero behavior change) → typecheck + tester prove no regression.
1. doc: generalize `edit-document` body to accept HTML via `htmlToDocContent`
   (reuse useDocAi.ts:186), voiceCommandDocument.ts doc prompt reusing
   DOC_HTML_CONTRACT. Re-consult ai-proposal-owner on the prompt before merge.
2. sheet: net-new `edit-sheet-cells` (documentId, tab, cells A1→value) applied via
   documents.saveBody over SheetBodyV2 (NOT useTablesStore; set-cell is for canvas
   table widgets). Hardest disambiguation: advisory-answer vs mutate-cells — own test.
3. slides: net-new `edit-slide` (slideIndex, field text|notes|theme) mutating
   SlidesBody via documents.update; refresh-if-open pattern (actionExecutor.ts:189).
   Theme must come from the constrained theme-name list (useSlideAi.ts:124).
4. design: net-new `edit-design` (elementId|null, mode replace|insert, text);
   default to insert for voice unless transcript names an element's text.
5. map: net-new `edit-map` (ops addNode/addEdge/updateNode) over MapBody. Most
   net-new (no prior AI hook) — build last so every pattern is proven first.
6. focused-widget: no new kinds — bias the canvas prompt to the one focused widget
   (full content, skip the 40-widget catalog). Smallest; last.

## No-fakery / prompt guards (every new per-context prompt)

- Grounding: "insights must be supported by the data shown, do not invent figures,
  if data is too thin say so" (mirror useSheetAi.ts:126) for any summarize/reason.
- Real-id-only: show the model the real document/slide/element/cell inventory;
  never invent ids/indices; sanitiser REJECTS (drops) out-of-range refs, never clamps
  (mirror sanitiseProposal's whitelist-and-drop, voiceCommand.ts).
- JSON-only contract per prompt; HTML kinds reuse DOC_HTML_CONTRACT + htmlToDocContent
  (one HTML dialect, one sanitizer).
- No silent destructive default: `replace` must be explicit; apply messages state
  what's recoverable (Version history) honestly.
- Every new messages.create guards stop_reason 'refusal'/'model_context_window_exceeded'
  before reading content (copy anthropic.ts:3480); model via resolveModel, no temperature.

Key files: VoiceCommandFAB.tsx, main/ai/voiceCommand.ts, shared/types.ts
(ActionProposal), lib/actionExecutor.ts, main/ai/anthropic.ts (3461/3494), the four
use*Ai hooks + DesignAiPanel, stores/view.ts, stores/documents.ts, stores/widgets.ts,
main/ai/modelRouting.ts.
