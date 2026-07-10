# PlexiChat epic — Slack-class chat + AI as a team member

Design owned by the chat-owner agent (.claude/agents/chat-owner.md), verified
against the real code 2026-07-10. Goal: contextual chat (per Room/Desk/Document +
general + DMs), user-created channels, and the AI as a channel member that actually
does work — ad-hoc and scheduled, in Plexi and (later) outside it. Better than Slack.

## What already exists (so most of this is composition)

- Chat core: threads (parent_id), reactions, @mentions (+autocomplete/notify),
  typing, edits, soft-deletes, DMs (org-scoped), org channels + browser,
  attachments, real-time multi-device fan-out, pin-conversation-to-desk.
  (focusbuddy-signal/src/messaging.ts, db.ts:377-420; client stores/messaging.ts,
  MessagesView.tsx, components/views/chat/*.)
- AI actions: ActionProposal union (24 kinds) + applyProposal; voiceCommand.ts
  sanitiseProposal pattern; agentDispatcher.invokeAgent returns ActionProposal[];
  post-chat + compose-mail are the "AI drafts, human sends" precedent; sendChat
  returns strict {reply, proposals} JSON; setConversationSnapshot already injects
  real conversation ids into the prompt.
- Scheduler: PlexiFlow (main/db/flows.ts, shared/flows.ts) is REAL — 5-min tick
  (main/index.ts:386), triggers manual|schedule|event|webhook, actions include
  ai-step (calls sendChat) + http-request (any external API). automationEvents bus.
- Server-side AI: the signal server already calls Anthropic directly via the
  metered proxy (server.ts:649, process.env.ANTHROPIC_API_KEY) — this is what makes
  an always-on server-side AI member possible (vs Electron-main-only agent/flows).

## Net-new pieces

Channel↔object binding; a bot author in the message model; an @mention-AI →
server-side reply pipeline; propose-and-confirm of AI mutations in chat; a chat→
PlexiFlow bridge for scheduling; and the Slack-polish gaps (search, pins, activity
feed, membership UI). External OAuth connectors do NOT exist (connected apps are
WebView launchers; mail is the only live external source; no MCP).

## Target channel model (Phase 1)

Extend the ref scheme with real columns, don't fork kinds. Add to `conversations`
(nullable ALTERs like the existing org_id migration, db.ts:804):
`object_kind TEXT` ('room'|'desk'|'document'|'org'|'dm'), `object_id TEXT`,
`visibility TEXT DEFAULT 'private'`, `archived_at INTEGER`. New store method
`getOrCreateObjectChannel(objectKind, objectId, orgId, memberIds, title)` mirroring
getOrCreateSpace (messaging.ts:211), ref = `obj:<kind>:<id>`. Auto-create lazily on
first open of a Room/Desk/Document chat panel. Explicit create stays for general/org
channels. Membership inherits the object's collaborator list at creation, then
normal join/leave. Object channels default private to collaborators; org channels
default public. Deleting a Room/Desk/Document ARCHIVES its channel (keep history) via
a new messaging.archiveObjectChannel hook. Org gate: getOrCreateObjectChannel takes
orgId and runs the org-directory-owner membership check (object collaborators may
include people outside the org, e.g. contractors on a shared Desk).

## AI as a member (Phases 3-4)

Bot-author = a real `accounts` row with `is_bot=1` (ALTER TABLE accounts ADD is_bot),
NOT an author_kind column — because messages.from_account is a FK to accounts and
every join/push/read path assumes a real id. Default one bot account per org (clean
per-org AI billing + isolation), handle 'plexi', auto-member of every channel in its
org. @mention trigger: server POST /conversations/:id/messages checks
bodyMentionsHandle(body, botHandle) after send; if hit, enqueue an AI turn. Reply is
generated server-side (NOT invokeAgent, which is Electron-only) via the same upstream
Anthropic path the metered proxy uses (server.ts:649), scoped "you are a channel
member," last N messages as context, same strict {reply, proposals} JSON contract,
proposals = ActionProposal[] (ai-proposal-owner's schema, no parallel schema). Post
the reply as the bot account via the existing fan-out.

HUMAN-IN-THE-LOOP (hard line): conversational reply TEXT is autonomous (not a
mutation). Any mutating ActionProposal (create/update task, set-cell, schedule-event,
etc.) is NEVER auto-applied from chat — the AI posts it as a reviewable card and a
human accepts, then it runs through proposal-applier-owner's chain. Extends the
existing post-chat/compose-mail draft-only precedent to every mutating kind.
No-fakery: never claim "I created the task" before the applier confirms — word as a
proposal or generate the reply only after apply succeeds, so a failed apply surfaces
as a failure in-channel.

## Scheduled + external (Phase 5, 7)

Bridge, don't rebuild. Ad-hoc in-Plexi = the Phase 4 propose-confirm path. Ad-hoc
outside Plexi = route through a PlexiFlow http-request action (one execution surface,
one audit trail) via a new `run-flow-action` ActionProposal (ai-proposal-owner) —
NOT arbitrary-URL-from-chat (security). Scheduled = chat "schedule this" creates a
Flow row (schedule trigger + ai-step/http-request action) — 100% existing machinery.
HONEST LIMITATION: runDueFlows only runs on the desktop 5-min tick while that user's
app is open — NOT always-on. Say so in the UI. A hosted runner (move runDueFlows
server-side onto the signal server, which already holds a server Anthropic
credential) is a distinct, real build + an operator decision. External OAuth
connectors (Google/Slack/etc.) don't exist and are out of scope for chat itself.

## Slack-class gaps, in order

1. Channel membership UI (read conversation_members, add/remove/leave).
2. Full-text message search (none today).
3. Pinned messages (new message_pins table).
4. Mention/activity feed (mentions only notify today, no browsable feed).
5. Channel notification prefs (mute, mentions-only).
6. Composer parity (slash commands, code blocks) — lowest priority.

## Phased build plan

- P1 Object-bound channels (Room/Desk/Document chat). No AI. Lowest risk (extends
  getOrCreateSpace). Consult section-owner/canvas-camera-owner (desk delete hook),
  plexi-docs-owner (doc delete hook), org-directory-owner (membership gate).
- P2 Channel membership UI + public/private. Client-mostly. Consult org-directory-owner.
- P3 AI passive member (reply-only, proposals parsed-but-not-surfaced). Bot-account
  migration + @mention trigger + server-side reply. OPERATOR DECISION: which key/
  billing funds bot replies (org metered balance / per-org allotment / BYOK).
  Consult ai-proposal-owner (prompt/model), presence-owner (bot online/typing).
- P4 AI proposals in chat, propose-and-confirm. Wire proposals → accept/reject →
  proposal-applier-owner. Consult proposal-applier-owner, ai-proposal-owner.
- P5 Scheduled tasks from chat via PlexiFlow. Ship with the desktop-only limitation
  surfaced in UI. OPERATOR DECISION: build a hosted always-on runner now or defer.
- P6 Slack-class UX gaps (search/pins/activity/prefs) — parallelisable with P3-5.
- P7 External OAuth connectors — gated entirely on an operator build/no-build call.

Operator decisions gating the AI phases: (a) AI-reply billing model, (b) one bot
per org vs platform-wide, (c) hosted always-on scheduler now vs defer, (d) external
OAuth connectors build vs defer, (e) any per-kind autonomous-apply (default: no —
propose-and-confirm everywhere first).
