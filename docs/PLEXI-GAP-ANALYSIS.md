# Plexi suite — deep gap analysis

A code-grounded review of the whole suite against the bar it targets (Microsoft 365 + Google Workspace + Slack + Zoom + Notion + Zapier). Six domains were surveyed directly in the source (client `projects/focusbuddy`, signal server `projects/focusbuddy-signal`): communication and real-time, office and content, work and data and automation, identity and org and security, AI, and platform and cross-cutting. Every finding below traces to real files.

The one-sentence truth: the applications are genuinely built and unusually deep for their stage, and the thing holding the suite back is not the apps, it is the platform underneath them and a handful of integrity gaps where something is advertised or implied but does not actually run.

## Integrity issues — fix these first, they are honesty defects not roadmap items

These matter more than any feature gap because they present something as working when it is not, which is the fastest way to lose trust.

1. The capability matrix advertises **two-factor auth and SSO as features, with zero implementing code**. `two_factor` and `sso` appear in the plan/capability surface but there is no TOTP, SAML, OIDC, or WorkOS code anywhere in either project. Either build them or remove the claim. This is a no-fakery defect on the pricing surface.
2. **PlexiFlow and PlexiReports schedulers only run when their view is open.** `runDueFlows` and `runDueReports` are invoked from the renderer on view mount, with no main-process timer. A user who sets a daily 8am digest gets nothing unless they happen to open that screen. A schedule that silently never fires reads as broken or fake.
3. **The `no_telemetry` capability is never checked** — the app reports telemetry whenever signed in regardless of the opt-out. The opt-out is dead code; honor it or drop it.

## What is genuinely strong (so the gaps are in context)

The office editors are real: a TipTap word processor with comments and find-and-replace, a hand-written 97-function spreadsheet engine with conditional formatting, validation, pivots and charts, and a full slide canvas. Real-time co-editing is genuine Yjs CRDT with live cursors and offline merge. PlexiProjects has a real critical-path engine with drift detection and reschedule. PlexiData is a real relational table system with typed fields and many view modes. The AI layer has a metered Anthropic proxy with bring-your-own-key fallback, real embeddings, and a durable apply chain that mutates the workspace. The identity core uses Argon2id, opaque sessions, full password reset, an AES-256-GCM vault, and Stripe wired end to end. None of this is scaffolding.

## The cross-suite priority stack

### P0 — the structural ceiling and the credibility gates

**1. Make the backend a real multi-instance, durable, synced platform.** Today the signal server is a single 256mb Fly machine in one region with presence, the socket registry, and all Yjs collaboration rooms held in process memory, and the personal workspace lives only in the local SQLite of the machine that created it. A second device shows an empty workspace; a server restart drops every live session; there is no horizontal scale. Move of-record data to Postgres, move presence/sockets/collaboration state to shared Redis pub/sub so the websocket tier can run more than one instance, then extend the already-proven cloud-document delta-sync to the `nodes` and `widgets` tables, on by default. This is the single highest-leverage investment because it is the precondition for everything below it.

**2. A web and/or mobile client.** M365 and Workspace are reachable from any browser and any phone; Plexi requires installing a mac or Windows desktop app to do real work, and the only web surface today is a read-only snapshot viewer. This is the largest single reason a normal team cannot adopt Plexi. It depends on (1) — a durable multi-instance backend with a clean sync contract is what a thin web/mobile client builds against.

**3. SSO via the already-bought WorkOS, scoped per org.** No enterprise buyer with Okta, Entra, or Google provisions a tool without SSO, and SCIM deprovisioning is an audit requirement. The org, role, and ACL foundation this needs already exists. This is the enterprise adoption gate, and it also resolves integrity issue #1.

**4. Let the AI act across the whole suite, not just the canvas.** All 22 AI action types target canvas widgets, the task tree, or focus sessions; there is no act-on-mail, update-task, edit-document, or set-cell. Retrieval grounds only on documents and knowledge, and the chat assistant sees only the current task. Expand the action set beyond the canvas, route grounding through one unified semantic retriever over all surfaces (the embeddings store was built generic for this), and promote the single-turn agent stub into a bounded tool-use loop. This is the only framing that competes with Copilot and Gemini: an assistant that does the work, not one that narrates it.

**5. Comms: deploy TURN, add desktop notifications, then group calls.** 1:1 calls already work but fail on symmetric and hard NAT because there is only public STUN, so they break on common office and mobile networks; deploying coturn (or managed TURN) is a small infra change that converts calling from demo to usable and is a prerequisite for group calls. There are also no OS notifications for incoming messages or calls anywhere, which is table stakes for a comms tool and is pure client work. Group meetings need an SFU (mediasoup or LiveKit) as a new server tier — the biggest single build, and the only way to meet the "replace Zoom" claim beyond 1:1.

**6. Office file-format round-trip fidelity.** xlsx export drops all formatting, charts, merges and validation; pptx export loses groups, rotation and shadows and pptx import is text-only; docx is lossy by design. The moment a Plexi file lands on a colleague's real Excel or PowerPoint and the formatting is gone, the suite reads as untrustworthy. The editors already hold a complete style model, so the work is serialization plus a per-format fidelity test, not new product surface. This is the worst trust-to-effort ratio in the suite.

**7. Make automation actually run on its own.** Beyond fixing the scheduler integrity issue, PlexiFlow has only manual and time triggers; event-driven triggers (on row created, on task done, inbound webhook) are what make it an automation platform rather than a macro runner. A main-process timer plus a small internal event bus over the existing table and task stores closes the widest credibility gap against Zapier for the least new code.

### P1 — closes clear competitive gaps

- **Chat depth**: message search, @mentions, edit and delete, file and image attachments (the server already has a blob path to reuse). Today none of these exist.
- **Mail depth**: it is read-INBOX-only and single-account; folders, search, and multiple accounts are the path to replacing Gmail and Outlook.
- **Office**: document version history (canvas desks have time-travel, documents do not), track-changes and suggestion mode, deeper spreadsheet function coverage (financial and statistical families are absent) plus merged cells and borders, and charts and tables in slides.
- **Identity**: an audit-log reader in the org admin console (the data is captured but no admin can see it, and auth events are not even recorded), per-seat billing (checkout is hardcoded to quantity 1), email verification, and encrypting the main workspace SQLite at rest (only the vault is encrypted today).
- **AI**: usage and cost caps (calls are counted but never capped), inline Copilot-style editing in the editors, and replacing the brittle DuckDuckGo-scrape web search with Anthropic's native web search.
- **Platform**: real desktop and push notifications over the open socket instead of a 30-second poll, Apple Developer ID signing and notarization (the lack of which forces the clunky one-click mac updater), internationalization (everything is hardcoded English), and a staging environment plus crash reporting.

### P2 — polish and completeness

Screen share in calls, channel roles and private channels, PlexiBuild apps that bind to real data instead of throwaway preview state, branching logic in flows, BI-grade dashboards and export in Reports and Insights, assignees and resourcing in PlexiProjects, forms with a public submission link, PDF annotation, a systematic accessibility sweep, and full-workspace export.

## Recommended sequence

1. Fix the three integrity issues now — they are small and they are honesty defects (remove or gate the 2FA/SSO claims, add a main-process scheduler tick, honor `no_telemetry`).
2. Deploy TURN and wire desktop notifications — small, high-visibility comms wins that need no architecture change.
3. Begin the backend platform work (Postgres + Redis + default personal sync) — the long pole that unblocks web/mobile, scale, and multi-device.
4. In parallel, build SSO on the existing org foundation — the enterprise gate.
5. Then the two big differentiators: AI-acts-across-the-suite, and office file-format fidelity.
6. Group calls (SFU), mobile/web client, and the P1 depth items follow on the durable backend.

The honest summary: Plexi has built the hard, impressive middle — the editors, the real-time core, the AI apply chain, the identity primitives — and under-built the unglamorous platform edges (multi-instance backend, multi-device sync, mobile/web reach, SSO, notifications, file-format fidelity) that are exactly what decide whether a team can actually switch off Microsoft and Google.
