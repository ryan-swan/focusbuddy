# Plexi — Gen X / Gen Y panel feedback

A six-person panel of Gen X and millennial personas reviewed the whole suite against Microsoft 365 and Google Workspace, each asked for the same three things: key benefits, pain points, and the functionality gaps that would have to be filled before they would switch. The personas live in `.claude/agents/` (genx-voice + geny-voice bases, plus genx-it-director, genx-smb-owner, genx-pragmatist, geny-team-lead, geny-startup-operator, geny-power-user).

The headline is that the two generations split cleanly on what gates them. Gen X are the buyers and the trust-keepers: they gate on backend durability, multi-device sync, SSO and SCIM, a readable audit log, and file-format fidelity. Gen Y are the daily users: they gate on mobile, notifications, chat depth, real integrations, and inline polish. Neither group will move today, but both said the same surprising thing first, that the apps underneath are genuinely real, not a demo skin, which is the reason they bothered to list what is missing rather than walking away.

## Where each landed

Nobody would switch today; everyone would pilot once the foundation lands.

- Gen X IT director: would run a contained pilot, will not deploy org-wide until the backend is durable and multi-instance, the workspace syncs by default, SSO/SCIM is live, and the audit log is readable. Confidence 0.78.
- Gen X SMB owner: a no today, would not even pilot until there is browser access, multi-device sync, and shared mail and calendar. Confidence 0.82.
- Gen X pragmatist: would run a paid pilot once multi-device sync and full-workspace export exist; the craftsmanship is real but he will not be a hostage. Confidence 0.82.
- Gen Y team lead: would pilot tomorrow if mobile + push and chat search/mentions land; cannot coordinate a distributed team on desktop-only. Confidence 0.82.
- Gen Y startup operator: cannot cut over a single workflow until automation runs unattended and can talk to outside tools on a durable backend; most credible all-in-one he has seen. Confidence 0.82.
- Gen Y power user: the first all-in-one in years he would trial, but will not daily-drive or evangelize until AI goes inline, docs get version history, and office export stops losing fidelity. Confidence 0.71.

## Key benefits (what genuinely lands)

The strongest and most universal point, made by all six, is that the core applications are real. A 97-function spreadsheet engine with pivots and conditional formatting, a proper word processor with comments and find-and-replace, genuine Yjs co-editing with live cursors and offline merge, a real critical-path engine in PlexiProjects, and a genuinely relational PlexiData rather than a glorified grid. Several panelists explicitly contrasted this with the usual all-in-one that is "five mediocre apps in a trench coat" and said this does not read like that.

The consolidation story is the second big draw, strongest for the SMB owner and the startup operator. One tool and one bill replacing Microsoft plus Zoom plus Slack plus Zapier plus Notion is the exact bundle they pay several vendors for, and fewer renewals, fewer integrations to babysit, and fewer security reviews is a budget line they can defend.

The AI that acts rather than chats was called out by four of the six as the right idea and the only framing that competes with Copilot and Gemini. The approve-each-card apply chain that actually mutates the workspace, rather than writing a paragraph about what it would do, is the thing the power user said could win him outright.

Underneath, the security plumbing impressed both Gen X buyers, Argon2id, the AES-256-GCM vault, Stripe wired end to end, and real roles, which they read as a sign the boring, serious work was done. Local-first and offline support won the pragmatist, and the Cmd+K command palette won the power user as the clearest signal that the builders live the way he lives.

## Pain points (ranked by how often and how hard they were raised)

1. The single-instance, in-memory backend was the architecture-ender for five of the six. One small machine in one region holding presence and every live collaboration room in process memory, where a restart drops every session and there is no failover or horizontal scale, is something none of the buyers can put a workday behind or write an availability commitment on top of.

2. The personal workspace not syncing across your own devices by default was called a dealbreaker by every Gen X persona and the operator. A second device showing an empty workspace is, in the pragmatist's words, a 2006 product with a nicer font, and it contradicts the one thing OneDrive and Drive made boringly reliable.

3. Desktop-only with a read-only web viewer was raised by all six as the largest single adoption blocker. The SMB owner and team lead were sharpest: people work from phones and browsers, contractors will not install an app, and a read-only snapshot eliminates whole job functions from a rollout.

4. The integrity defects worried the panel more than any single missing feature, because they undermine trust in every green checkmark. The advertised-but-unbuilt 2FA and SSO, the schedulers that only fire when their view is open, and the dead telemetry opt-out were each cited as small lies that make a careful buyer re-audit everything. (Note: 2FA and the scheduler have since shipped; the telemetry opt-out and the SSO claim remain.)

5. Office file-format round-trip losing fidelity was raised by everyone who touches documents. The moment a Plexi sheet or deck lands in a colleague's real Excel or PowerPoint with formatting, charts, merges, or rotation stripped, the user looks unprofessional and the suite looks like a toy, and people retreat to Office.

6. No outside-world integrations was the operator's central complaint and the consolidation thesis's biggest hole. PlexiFlow has no external connectors or outbound HTTP and PlexiAPI is expose-only with no inbound webhooks, so the automation engine can replace tools but cannot replace the glue between them, which is the actual reason an all-in-one saves money.

7. Daily-use depth gaps came from the Gen Y side: chat has no search or mentions (the team lead's floor for team coordination), calls are 1:1 only with no TURN so they fail on real networks and no group calls, there are no OS notifications, mail is single-account and inbox-only with no shared mailboxes or shared calendar (the SMB owner's hard stop), documents have no version history, the AI is panel-based rather than inline ghost-text, and keyboard coverage outside the palette is uneven.

8. Enterprise-control gaps from the IT director: no readable audit log and no recorded auth events, no SSO/SCIM for central provisioning and deprovisioning, no data residency or SOC 2, and no stated backup, recovery, or "what happens if you go under" answer.

## Functionality gaps to win, ranked to beat Microsoft and Google

The panel converges on a clear order. The first tier is unanimous and foundational; nothing else is safe to build until it exists.

1. A durable, multi-instance, horizontally scaled backend, Postgres for system of record and Redis pub/sub for presence and collaboration, with default multi-device sync of the personal workspace. This is the precondition every persona named, and it is what makes the live features and the data trustworthy.
2. Real web and mobile clients against that backend, not a read-only viewer. The single biggest adoption blocker for both generations.
3. SSO and SCIM via the already-bought WorkOS, plus an admin-readable audit log with recorded auth events. The enterprise gate the IT director will not sign without, and it also resolves half the integrity problem.
4. Two-way integrations, outbound connectors and inbound webhooks for PlexiFlow and PlexiAPI. The operator's dealbreaker and the thing that turns "twelve mediocre apps in one tab" into a real Zapier-plus-Airtable-plus-Workspace killer.
5. Office file-format fidelity on round-trip. The cheapest credibility win, since the style model already exists, and the trust gate to the outside world.
6. Finish the integrity items, honor the telemetry opt-out and make every pricing-page capability real.

The second tier is what wins the daily-use war once people can actually get in: shared mailboxes and a shared team calendar, chat search and mentions, group calls with TURN and OS notifications, document version history, and inline Copilot-style AI in the editors. These are how you pull people off Outlook and Slack for good, but they are the second migration, not the gate to the first.

## The single highest-leverage move, per the panel

Build the durable, multi-instance, default-synced backend, because it is the one thing every persona named as the precondition for trusting their work to the product, and it is what unblocks the web and mobile clients, the scale story, and the always-there experience that both Microsoft and Google make boringly reliable. Everything else the panel wants is decoration on a product that, today, still forgets your work when you switch machines or the server restarts.
