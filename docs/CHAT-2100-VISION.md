# PlexiChat 2100 — where chat is heading

This is the premonition that guides how we polish PlexiChat from here. It is not
science fiction. Every capability below is buildable on the stack we already run
(Electron client, Fastify signal server, the org's own Anthropic key, sqlite,
sockets, CRDT, presence), and each one degrades honestly to nothing when the key
is absent. It was written from a cross-generational human-need panel (Gen Z, Gen
Y, Gen X) plus the PlexiChat authority, in July 2026.

## The one-line thesis

Chat stops being a place you monitor and becomes a layer that remembers. You read
the state of the room, not its transcript. The log still exists for honesty and
audit, but no human is expected to read it line by line.

## What the panel agreed on

The bottleneck was never volume, media, or presence dots. It is that a chat log
flattens everything into one undifferentiated scroll, so a decision looks
identical to lunch banter, and by Thursday someone in another timezone
re-litigates something already settled because nothing marked it as settled.

Ranked by how badly every generation wanted it:

1. Recall and catch-me-up. Open a channel and be told what changed, what was
   decided, what is blocked. Ask the channel a question and get a real answer from
   its history, with one-click links back to the source messages. No more scroll
   archaeology. (Gen Z 9.5, Gen Y 8, Gen X 8.)
2. Decisions and action items as durable, source-linked objects. Auto-extracted,
   promoted out of the scroll, never re-typed by hand into a task tool. Someone
   catching up reads state, not transcript. (Gen Y 9, Gen X 8.)
3. Signal over noise. "This needs YOU" instead of every ping weighted equally.

## The hard lines (all three generations, unprompted)

These are not preferences. Cross them and the AI gets muted or turned off.

- Read-only intelligence (summarise, extract, recall) may run and log itself.
  Anything with an external footprint (a message sent, a person pinged, money,
  a delete) stays propose-and-confirm. This is exactly the P4 model; hold it.
- Show your work. Every claim links to the source message. Never "trust me."
- Never act silently. A scheduled or background action reports in-channel.
- A confidently wrong extraction becoming "the record" is worse than no
  extraction. Flag uncertainty; degrade to "no summary available" rather than
  inventing content.
- Quiet by default, loud only when it matters. If the AI posts more than the
  humans, it has failed.
- Dark without the org key. No key means the feature shows nothing, never an
  error banner claiming AI is down and never a fabricated result.

## Explicitly rejected

Ambient always-listening AI. Sentiment or tone scoring on messages. AI replies
sent in your name. Org-chart / who-talks-to-whom surveillance analytics.
Metaverse or spatial-presence theatre. Gamified streaks and confetti. Anything
that adds a surface to monitor rather than removing work. Latency: a spinner
kills the feeling of the future faster than any missing feature.

## The build ladder

Grounded in the authority's seam analysis. Each rung reuses the one below.

1. **Channel Recall (SHIPPED).** Catch-me-up (what changed since you last read,
   as Decided / Open / Blocked / Needs you) and Ask-this-channel (answer from
   history with clickable source citations). User-invoked, private to the
   requester, never posted to the channel. Reuses `getMessages` +
   `getMessagesSince` + `getMemberLastRead` and a dedicated `composeChannelRecall`
   that cites sources by number. Server: `src/ai/channelRecall.ts`, route
   `POST /conversations/:id/recall`. Client: the Recall panel in `MessagesView`
   with jump-to-source. Honest: no key means available:false, a failed call means
   a null answer, never an invented one.
2. **Meaning extraction.** Decisions / questions / action items surfaced as
   structured, source-linked objects. Batched on a low-frequency tick (not per
   message, for cost), stored in a `channel_extracts` table, shown in a channel
   pulse panel. Action items can become P4 create-task proposals (confirm).
3. **What-needs-me briefing.** Replaces the unread badge with a ranked "needs
   you" digest. Mostly aggregation over (2) plus mentions plus pending proposal
   cards; degrades honestly to the plain unread count when no key.
4. **Self-summarizing threads.** A long thread collapses to a running one-line
   summary in the parent timeline, using (2)'s extractor pointed at the thread.
5. **Named role-agents as members.** Beyond one @plexi: multiple AI personas per
   channel, each its own account row with a distinct prompt and scope, each
   mentionable and bound to the same safe-proposal allowlist.

Translation (per-message, opt-in, cached) and an intent-composer (clarify a draft
before sending) are valuable but do not compound, so they slot in any time.

## Cost and honesty discipline

Extraction and summarisation must never fire per message; batch them on a
separate longer-interval tick so an active org is not billed on every 60-second
scheduler cycle. Translation and the intent-composer are the only genuinely
per-message calls, and only because they are explicit, single-message, cached,
and opt-in. Catch-me-up fires once per invocation, never on every poll. Every
feature follows the `getOrgAnthropicKey` silent-without-key pattern already
established in P3.
