// Widens "ask your workspace" beyond documents: it also grounds answers in your
// tasks, your database tables, the notes/sticky/markdown/page content sitting on
// your desks, and — since these three were reachable by no retrieval path at all
// — your meetings, your recorded decisions and your calendar. All keyword-ranked through the same pure rankSources the
// document path uses, so scores are comparable and nothing is fabricated (a pool
// with no term hits contributes nothing).

import { listNodes } from "./db/nodes";
import { listTables } from "./db/tables";
import { listWidgetsByKind } from "./db/widgets";
import { listMeetings } from "./db/meetings";
import { listBlocksInRange } from "./db/timeBlocks";
import { createDecisionStore } from "./db/decisionStore";
import { getDb } from "./db/database";
import { corpusSignature } from "./corpusSignature";
import { listAllRowsByTable } from "./db/tables";
import { getActiveOrgId } from "./db/activeOrg";
import {
  rankSources,
  mergeScopedPools,
  extractDocText,
  type WorkspaceSource,
} from "./workspaceRank";
import type { FbTable, FbRow } from "@shared/fields";

type Candidate = {
  docId: string;
  title: string;
  docType: string;
  text: string;
};

// A built corpus entry. `taskId` is the desk it belongs to, or null for the
// things that belong to no desk (meetings, calendar blocks, documents) and are
// therefore never demoted by scope. Membership of the org was already resolved
// when the entry was built, so the per-query pass does no lookups.
type Entry = { cand: Candidate; taskId: string | null };

// A transcript can be very long; its head carries the framing and most of what a
// question matches on, and rankSources selects the best passage from what it is given.
const MEETING_TRANSCRIPT_CHARS = 4000;
// Six weeks either side of today: far enough back to answer "what did we agree
// last month", far enough forward to cover anything being planned.
const CALENDAR_WINDOW_MS = 42 * 24 * 60 * 60 * 1000;

// A table flattened to text: title, column headers, then each row's cell values.
export function tableToText(table: FbTable, rows: FbRow[]): string {
  const cols = table.schema.columns;
  const header = cols
    .map((c) => c.label)
    .filter(Boolean)
    .join(" | ");
  const body = rows
    .slice(0, 40)
    .map((r) =>
      cols
        .map((c) => {
          const v = r.cells[c.id];
          if (v == null) return "";
          if (Array.isArray(v)) return v.join(" ");
          return typeof v === "object" ? JSON.stringify(v) : String(v);
        })
        .join(" | "),
    )
    .join("\n");
  return `${table.title}\n${header}\n${body}`.trim();
}

// A canvas note's text. A 'page' widget stores Tiptap JSON; the rest are plain.
export function noteWidgetText(kind: string, content: string): string {
  if (kind === "page") {
    try {
      return extractDocText("doc", JSON.parse(content));
    } catch {
      return content;
    }
  }
  return content;
}

// Gather and keyword-rank workspace content that is NOT a document: tasks,
// tables, and canvas notes. Returns the top matches as WorkspaceSources.
//
// scopeNodeIds encodes user-driven relatedness: the current desk plus the
// desks the user explicitly related to it. Scoped content leads; everything
// else in the SAME org is demoted, never excluded (#12) — the answer sitting
// on an unrelated desk must still be findable, just ranked behind on-desk
// matches. Omit scopeNodeIds for a flat whole-workspace search.
//
// The org boundary is absolute and separate from scope: tables and widgets
// carry no org of their own, only a desk id, so anything whose desk is not one
// of the active org's nodes never enters the pool at all. (Before this check
// an unscoped search read every org's tables and canvas notes — a leak, not a
// demotion candidate.)
// The built corpus, cached against a signature of the data it was built from.
// Rebuilding it per turn was the dominant cost of every assistant reply: on a
// real workspace, ~170 nodes, 127 table queries, 880 widgets, every meeting
// transcript and six weeks of calendar, reassembled before the model saw a
// word — and repeated for turns as slight as "thanks".
let corpusCache: { sig: string; entries: Entry[] } | null = null

/** Test seam: drop the cache so a test can observe a rebuild. */
export function _resetExtrasCache(): void {
  corpusCache = null;
}

function buildCorpus(): Entry[] {
  const orgNodeIds = new Set<string>();
  const entries: Entry[] = [];
  // Scoped things: kept only if their desk is in this org, exactly as before.
  const add = (taskId: string | null | undefined, c: Candidate): void => {
    if (taskId == null || !orgNodeIds.has(taskId)) return;
    entries.push({ cand: c, taskId });
  };
  // Unscoped things: no desk, never demoted.
  const addLoose = (c: Candidate): void => {
    entries.push({ cand: c, taskId: null });
  };

  for (const n of listNodes()) {
    orgNodeIds.add(n.id);
    if (n.kind !== "task") continue;
    const text = `${n.title}\n${n.description ?? ""}`.trim();
    if (!text) continue;
    const cand = {
      docId: n.id,
      title: n.title || "Untitled task",
      docType: "task",
      text,
    };
    // A task node is scoped by its OWN id; it is in orgNodeIds by now, so this
    // is the same in/off decision the inline split used to make.
    add(n.id, cand);
  }

  const rowsByTable = listAllRowsByTable();
  for (const t of listTables()) {
    const text = tableToText(t, rowsByTable.get(t.id) ?? []);
    if (text)
      add(t.taskId, {
        docId: t.id,
        title: t.title || "Untitled table",
        docType: "table",
        text,
      });
  }

  for (const kind of ["note", "sticky", "markdown", "page"] as const) {
    for (const w of listWidgetsByKind(kind)) {
      const text = noteWidgetText(kind, w.content || "").trim();
      if (text)
        add(w.taskId, {
          docId: w.id,
          title: w.title || text.slice(0, 40),
          docType: "note",
          text,
        });
    }
  }

  // Meetings: title, summary and action items are the answer-bearing parts; the
  // transcript head is included so a question can match something that was
  // actually said. Org-scoped by listMeetings, and carrying no desk of their
  // own, so — like documents — they sit in the unscoped pool rather than being
  // demoted for belonging to no desk.
  // Each additive pool is wrapped: meetings, decisions and the calendar are
  // extra reach, not the substrate search depends on. If one is unavailable the
  // search should be missing that pool, not fail outright — the same posture the
  // rest of retrieval takes toward a pool that yields nothing.
  try {
    for (const m of listMeetings()) {
      const actions = Array.isArray(m.actionItems)
        ? m.actionItems.join("\n")
        : "";
      const text = [
        m.title,
        m.summary ?? "",
        actions,
        (m.transcript ?? "").slice(0, MEETING_TRANSCRIPT_CHARS),
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text)
        addLoose({
          docId: m.id,
          title: m.title || "Untitled meeting",
          docType: "meeting",
          text,
        });
    }
  } catch {
    /* no meeting store in this context */
  }

  // Decisions: the whole point of promoting a decision out of the scroll is that
  // it can be recalled later. Until now nothing could retrieve one.
  try {
    for (const d of createDecisionStore(getDb(), getActiveOrgId()).all()) {
      const text = [d.title, d.decisionStatement ?? "", d.description ?? ""]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text)
        addLoose({
          docId: d.id,
          title: d.title || "Decision",
          docType: "decision",
          text,
        });
    }
  } catch {
    // The decision store is optional substrate; a workspace without it simply
    // contributes no decisions rather than failing the whole search.
  }

  // Calendar: a window around today, so "what did I commit to this week" and
  // "when am I seeing them" have something to match. Blocks carry a desk id, so
  // they scope like tasks and tables do.
  const now = Date.now();
  try {
    for (const b of listBlocksInRange(
      now - CALENDAR_WINDOW_MS,
      now + CALENDAR_WINDOW_MS,
    )) {
      const when = new Date(b.startMs)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ");
      const meeting = b.meeting
        ? [
            "meeting",
            b.meeting.location ?? "",
            b.meeting.agenda ?? "",
            (b.meeting.invitees ?? []).join(" "),
          ]
            .filter(Boolean)
            .join(" ")
        : "";
      const text = `${b.title}\n${when}\n${meeting}`.trim();
      if (!text) continue;
      const cand = {
        docId: b.id,
        title: b.title || "Time block",
        docType: "calendar",
        text,
      };
      // A block with no desk belongs to no scope; keep it in the near pool rather
      // than demoting it, the same treatment meetings and documents get.
      if (b.taskId == null) addLoose(cand);
      else add(b.taskId, cand);
    }
  } catch {
    /* no calendar store in this context */
  }

  return entries;
}

export function collectExtraSources(
  query: string,
  limit = 6,
  scopeNodeIds?: string[],
): WorkspaceSource[] {
  // A null signature means the data cannot be fingerprinted here, so caching
  // would be unsound — build fresh, exactly as before the cache existed.
  // getActiveOrgId() reads the database too, so it is inside the guard: this
  // whole step is an optimisation and must never be why a caller fails.
  let sig: string | null = null;
  try {
    sig = corpusSignature(getActiveOrgId());
  } catch {
    sig = null;
  }
  let entries: Entry[];
  if (sig === null) {
    entries = buildCorpus();
  } else {
    if (!corpusCache || corpusCache.sig !== sig) {
      corpusCache = { sig, entries: buildCorpus() };
    }
    entries = corpusCache.entries;
  }
  const scope =
    scopeNodeIds && scopeNodeIds.length > 0 ? new Set(scopeNodeIds) : null;
  const inPool: Candidate[] = [];
  const offPool: Candidate[] = [];
  for (const e of entries) {
    if (e.taskId === null || !scope || scope.has(e.taskId)) inPool.push(e.cand);
    else offPool.push(e.cand);
  }
  return mergeScopedPools(
    rankSources(query, inPool, limit),
    rankSources(query, offPool, limit),
    limit,
  );
}
