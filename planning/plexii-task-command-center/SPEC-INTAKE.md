# Spec-Intake Protocol

What happens the moment the operator pastes the product spec. This is Phase 1's contract —
written before the spec exists so the analysis is systematic, not improvised.

## Step 0 — Preserve the source

Save the spec **verbatim** to `analysis/00-SPEC-RAW.md` (frontmatter: received date, source).
The raw spec is immutable evidence; all analysis links back to it. Interpretation never
overwrites source.

## Step 1 — Decompose into the Feature Inventory (`analysis/01-FEATURE-INVENTORY.md`)

Every distinct capability, behavior, screen, rule, or promise in the spec becomes one item:

```
SPEC-NNN · <name>
Area: task | plan | desk | tool | widget | command-palette | notification |
      dashboard-home | calendar | ai-brain | collaboration | data-schema | cross-cutting
Spec says: <faithful restatement, quoting the spec where wording matters>
User value: <the job it does for the user>
Priority signal: <what the spec implies — MUST / SHOULD / NICE, or "unstated">
Objective centrality (proposed): P0 core | P1 supporting | P2 roadmap-later
  <per PRESERVATION-DOCTRINE triage; operator approves the cut line at Phase 3>
Change tier: ADDITIVE | RESHAPE | FOUNDATIONAL  <per PRESERVATION-DOCTRINE>
Touches existing: <which current surfaces/features this modifies — "none" is a claim
  to verify in Phase 2, not a default>
Feasibility flag: <anything that smells expensive, conflicting, or platform-limited>
Interpretation confidence: 0.00–1.00 (+ why_not_higher)
Ambiguities: <each becomes a GAP-NNN open question — never silently resolved>
Depends on: <other SPEC-NNN>
```

(Naming note: `command-palette` = the existing ⌘K `CommandCenter.tsx`; this initiative's
"command center" dashboard is `dashboard-home`. Keep them distinct or the inventory will lie.)

Also extracted, separately, BEFORE the per-item pass:
- **The primary objective** — the spec's main goal in one paragraph, quoted where possible.
  Every P0/P1/P2 triage judgment hangs off this, so it is confirmed with the operator at G1
  (if the spec states it crisply, restate it; if not, that's the first G1 question).
- The spec's **product principles / tone** (they calibrate Phase 3 UX decisions).
- Any **explicit non-goals**.

**Scale discipline:** the spec is expected to be large and cross-cutting (tasks, plans,
desks, tools, widgets, command palette, AI/brain, calendar, homepage). If it arrives in
multiple pastes/files, concatenate with source markers first. Decompose area-by-area,
re-reading the full text once per area — a single pass over a huge spec under-extracts
cross-cutting items.

Completeness check: re-read the raw spec after inventorying and confirm nothing — sentence,
bullet, mockup annotation — lacks a SPEC-NNN or an explicit "not a requirement" note.

## Step 2 — Classify against current state (`analysis/02-GAP-MATRIX.md`, Phase 2)

For each SPEC-NNN, against the **live repo** (map as index, fresh greps as evidence — line
anchors drift as Caleb pushes):

| Classification | Meaning | Required evidence |
|---|---|---|
| **EXISTS** | Already built; spec is satisfied or nearly | File paths + behavior confirmation |
| **PARTIAL** | Substrate exists, delta needed | What exists, what's missing, the delta |
| **MISSING** | Greenfield | Confirmation nothing covers it (searched where it would live) |
| **CONFLICTS** | Spec collides with current architecture/naming | The exact collision + resolution options |

Plus two opportunity registers the spec can't know about:
- **Enhancement opportunities:** existing primitives that make a spec item better than
  specced (memory `commitment` kind feeding intelligent tasks; consent-gate for AI actions;
  standup composer pattern; the Home widget registry; `time_blocks` recurrence engine).
- **Hidden costs:** known traps a spec item will hit (`taskId`-means-desk; `nodes.kind`
  CHECK rebuild; renderer-only reminders dying with the app; three-dashboard-systems debt;
  no external calendar).

## Step 3 — Gate G1, then stop for the operator

Report: the extracted **primary objective** (for confirmation), inventory size, area
breakdown, proposed P0/P1/P2 profile, change-tier profile (how much is RESHAPE/FOUNDATIONAL —
the early read on how many crossroads are coming), confidence profile, the ambiguity list
(questions for the operator), anything BLOCKED (<0.65). Phase 2 verification proceeds on the
unambiguous core while operator answers are pending — ambiguous items wait.

## Anti-patterns (hard rules)

- No silent interpretation of ambiguity — log it, ask it.
- No classification from memory — the map indexes, the live repo evidences.
- No "the spec forgot X so I added X" — enhancement opportunities are *proposed*, tagged as
  additions, and priced; the spec stays the authority on intent.
- No scope creep into build — Phase 1–2 produce analysis, not code.
