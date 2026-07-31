// plexi-brain I0 — THE EVAL FIXTURE (the ruler)
//
// 22 queries over the REAL dogfood corpus, written by
// reading the corpus inventory BEFORE looking at how the ranker scores anything —
// the non-circularity requirement from 05-ARCHITECTURE/02-RETRIEVAL-ARCHITECTURE.md
// §7 caveat 1 ("without a held-out, third-party-labeled eval on REAL data, every
// precision number is theater").
//
// Every `expect`/`forbid` id below is a REAL fb_chunks.source_id verified present in
// the live corpus. Nothing here is synthetic. The traps are the ones the corpus
// already contains — a genuine contradiction (prototype precision 100%-vs-85%) and a
// 6-way duplicate cluster (dev credentials), half of which has since been deleted.
//
// Scored by tests/eval/brainEval.spec.ts against the SHIPPED retrieveSources() path.
//
// ── I0b amendment (2026-07-23) — the ruler had ghosts in it ──────────────────────
// I0b (the delete path) found that 72 of the corpus's 450 chunks were content the
// operator had already deleted but which the index had never dropped, and that 19 of
// this fixture's 62 ground-truth ids pointed at that deleted content. Two cases became
// unmeasurable and are annotated in place below (C01's contradiction, R03 entirely).
// brainEval.spec.ts now hard-fails if any case's ground truth leaves the index, so the
// ruler can never silently shorten again.

export type CaseClass =
  | 'paraphrase' // right answer shares no vocabulary with the query → tests the embedding leg
  | 'rare-token' // right answer hinges on one rare literal → tests the lexical/IDF leg
  | 'contradiction' // corpus genuinely disagrees → must surface BOTH, not pick one
  | 'duplicate' // same content in N places → must not eat the whole result set
  | 'filler-trap' // low-signal junk must not surface
  | 'room-scope' // right answer depends on which room you're in
  | 'lookup' // plain semantic lookup — the break-even baseline

export interface EvalCase {
  id: string
  query: string
  intent: string
  klass: CaseClass
  /** At least one of these source_ids must appear in the top-K. */
  expectAnyOf: string[]
  /** None of these may appear in the top-K. */
  forbid?: string[]
  /**
   * Mutual-duplicate clusters. At most ONE member of each group may occupy a slot —
   * more than one means duplicates are burning result slots.
   */
  dupGroups?: string[][]
  /**
   * Contradiction cases: each inner array is one "side" of the disagreement. A pass
   * requires at least one member from EVERY side in the top-K — surfacing only one
   * side is a confident-wrong answer, the exact failure the bar forbids.
   */
  expectAllSides?: string[][]
  /** Optional room aperture to run the query under. */
  roomId?: string | null
  notes: string
}

// ── Known-filler source_ids (verified: text is 4–9 chars of pure noise) ───────────
// I0b: 6 of these 13 were themselves deleted content and left the index — the 5 marked
// †(trashed task) plus the joke sticky, which sat on a trashed desk. They are KEPT as a
// record of what the corpus contained; an id that no longer exists can never leak, so
// keeping them changes no measurement, and brainEval.spec.ts reports the shrinkage each
// run so nobody mistakes a smaller guard for a better ranker.
// "test", "with", "Blank", "Untitled" ×4, "New desk" ×3, "Test one", "Testing one two
// three", plus the off-topic joke sticky. 41 of 450 chunks (9%) are under 80 chars.
export const FILLER_IDS = [
  '44f1103d-38d7-44c0-ab5d-f4eaba9b64df', // task "test"  †deleted at I0b
  '9d1047b9-911a-4fab-8370-01b06ea1a782', // sticky "with"
  'f765c0b6-2c12-4be2-ac0a-4ada8eda8c92', // task "Blank"  †deleted at I0b
  'bfbb0a3d-2d98-475c-8fb3-3e9af71494e2', // task "Untitled"
  'd333dfb4-613e-4366-9d4f-cd44d866ebe5', // task "Untitled"  †deleted at I0b
  'd8929df4-7c76-4350-bde4-1be25ad26784', // task "Untitled"  †deleted at I0b
  'e48ec7e6-23b6-416e-87aa-fb190eb28ca0', // task "Untitled"  †deleted at I0b
  '35fb0d77-a9c2-49f9-b52b-e4817995b946', // task "New desk"
  '60ff8882-476c-40ec-8b7b-fbe53ea61ab4', // task "New desk"
  'fa4be58a-4d8a-4e05-8941-963cd8098580', // task "New desk"
  '2458e4f9-a606-49e1-9889-41d861af537a', // sticky "Test one"
  '9ce3d3cd-66cc-4c00-9af3-32f9704ae87c', // sticky "Testing one two three"
  '9f7fef7d-ea92-4a88-b919-7ab9e935dd0b' // sticky — off-topic joke  †deleted at I0b (trashed desk)
]

// The 6-way duplicate cluster: identical Apple-developer-credentials content living in
// two twin rooms under two different widget titles, plus two duplicated task rows.
const DEV_CRED_DUPES = [
  '7b702e74-c7b5-42e5-b327-3f21a64b3485', // markdown "# Developer Credentials" (room c135687b)
  '3ee78e86-0e9c-4818-aa81-7750bffb3b0f', // markdown "# Developer Credentials" (room aaf7059b)
  '6b1ef5c5-3e13-4848-a57e-e64e50e81689', // markdown "Credentials Checklist"   (room c135687b)
  'fc59ca1a-f30a-47d6-890e-6ae5523d73ba', // markdown "Credentials Checklist"   (room aaf7059b)
  '4859dd70-8194-4477-9a73-82f6773dd42c', // task "Developer Credientials"      (room c135687b)
  'd365b908-afd0-4a4d-81f6-9a6dd5bc86d0' // task "Developer Credientials"       (room aaf7059b)
]

// Twin-room duplicate pairs (56 of 57 chunks are byte-identical across these rooms).
const STRIPE_SETUP_DUPES = [
  '2a7d4987-173a-4454-b988-43ac68e34f98',
  '40b4ff56-e347-42e6-bff8-b48f60fbbaf7'
]
const TEST_SCENARIO_DUPES = [
  '4a4ea11e-df87-4e2b-b42c-180f73643a73',
  'b84eadf7-0b43-4780-a9d1-b07f72f9f084'
]
const GTM_HAPTYX_DUPES = [
  '4b4c74b1-6f96-43f6-8171-737324ee5acf',
  '5a57a60f-28f4-469c-86d4-3e1f4c00191b'
]

export const EVAL_CASES: EvalCase[] = [
  // ── CONTRADICTION ───────────────────────────────────────────────────────────────
  //
  // ⚠️ C01 RETIRED AS A CONTRADICTION CASE AT I0b (2026-07-23) — the contradiction no
  // longer exists in the corpus, so it can no longer be measured.
  //
  // C01 was the fixture's flagship: two live wedding plans, Oct-9-Louisiana vs
  // Ohio-in-60-days, and the brain had to surface BOTH. Every source on the Louisiana
  // side — '8511ff6d' (Wedding Checklist), '908b420d' (sticky "Oct 9 · Louisiana"),
  // 'c634fbaa' (task "married October 9th in Louisiana") — was deleted by the operator
  // ~2026-07-18: the two widgets sat on the trashed "Wedding" desk, the task was
  // trashed directly. After reconciliation, `WHERE text LIKE '%Louisiana%'` over the
  // corpus returns ZERO rows. The operator settled on Ohio.
  //
  // I0b is what made this visible. Before the delete path existed, those deleted
  // sources were still indexed and still retrievable, so this case scored
  // "contradiction coverage 100%" over content that no longer existed anywhere in the
  // user's workspace — that headline in I0-EVAL-BASELINE.md was measuring ghosts.
  //
  // The query still has a correct answer, so the case is KEPT and reclassified rather
  // than deleted. It is deliberately NOT re-pointed at some other contradiction:
  // inventing replacement ground truth after seeing results is how a fixture stops
  // being a ruler. A replacement must be written the way I0's cases were — from a
  // corpus inventory dump, before looking at any ranker output.
  {
    id: 'C01',
    query: 'where is my wedding going to be?',
    intent: 'Resolve the location of the wedding.',
    klass: 'lookup',
    expectAnyOf: [
      'ea002c68-e4f4-4d0a-ba56-109fcfeceb6e', // "Wedding Planning Checklist (60 Days Out)" — Ohio
      '1caee931-4807-4c8a-ade9-b0c4ce0b896a', // "🎉 Ohio Wedding 2026 — 50 Guests"
      '058df19d-c463-4d23-9594-0e5a2c52d541', // task "in Ohio... burgers"
      '9c960b34-9d7c-4663-b20c-792cd5a2ecd2' // task "wedding in 2026... in OHIO"
    ],
    notes:
      'WAS the fixture flagship contradiction (Louisiana vs Ohio). The Louisiana side was ' +
      'deleted by the operator ~2026-07-18 and that delete only reached the index at I0b, so ' +
      'the disagreement is gone from the corpus. Now a plain lookup over the surviving Ohio ' +
      'plan. The fixture is down to ONE contradiction case (C02) — a real coverage gap the ' +
      'next revision should close with a case written before looking at ranker output.'
  },
  {
    id: 'C02',
    query: 'how accurate was the prototype, really?',
    intent: 'Get an honest read on prototype precision.',
    klass: 'contradiction',
    expectAnyOf: ['dogfood-w-crux-1', 'dogfood-w-sources-4'],
    expectAllSides: [
      ['dogfood-w-crux-1'], // "100 versus 70 on precision, a decisive win"
      ['dogfood-w-sources-4'] // "around 85 percent, not a firm number... circular-benchmark risk"
    ],
    notes:
      'REAL contradiction: the headline claims 100% precision; the early read says ~85% and flags ' +
      'circular-benchmark risk. Surfacing only the headline is exactly the failure mode "the KB actively misleads".'
  },

  // ── DUPLICATE (real 6-way cluster + twin-room pairs) ────────────────────────────
  {
    id: 'D01',
    query: 'how do I renew my Apple developer certificates?',
    intent: 'Find the credentials checklist.',
    klass: 'duplicate',
    expectAnyOf: DEV_CRED_DUPES,
    dupGroups: [DEV_CRED_DUPES],
    forbid: FILLER_IDS,
    notes:
      'The SAME content exists in 6 sources (2 twin rooms × 2 widget titles + 2 task rows). ' +
      'If more than one occupies the top-6, duplicates are eating slots that should hold diverse evidence.'
  },
  {
    id: 'D02',
    query: 'how do I set up Stripe for the SaaS?',
    intent: 'Find the Stripe setup guide.',
    klass: 'duplicate',
    expectAnyOf: STRIPE_SETUP_DUPES,
    dupGroups: [STRIPE_SETUP_DUPES],
    notes: 'Twin-room byte-identical pair. At most one should take a slot.'
  },
  {
    id: 'D03',
    query: 'what subscription flows do we need to test?',
    intent: 'Find the Stripe/Vercel test scenarios.',
    klass: 'duplicate',
    expectAnyOf: TEST_SCENARIO_DUPES,
    dupGroups: [TEST_SCENARIO_DUPES],
    forbid: FILLER_IDS, // "Test one" / "Testing one two three" are cosine-adjacent to "test"
    notes:
      'Doubles as a filler trap: the corpus contains stickies literally titled "Test one" and ' +
      '"Testing one two three" which are lexically close to this query and carry zero information.'
  },
  {
    id: 'D04',
    query: 'what is the go-to-market plan for Haptyx?',
    intent: 'Find the Haptyx GTM page.',
    klass: 'duplicate',
    expectAnyOf: GTM_HAPTYX_DUPES,
    dupGroups: [GTM_HAPTYX_DUPES],
    notes: 'Twin-room pair.'
  },

  // ── PARAPHRASE (right answer shares little/no vocabulary with the query) ─────────
  {
    id: 'P01',
    query: 'can the trading system buy something without asking me first?',
    intent: 'Understand the human-approval requirement.',
    klass: 'paraphrase',
    expectAnyOf: ['dogfood-proj-w-apex-13'],
    notes:
      'Answer text: "every live trade requires explicit user approval; auto-execute is opt-in, never default". ' +
      'Query shares almost no tokens with the title "Legal posture — the RIA-avoidance moat". Pure embedding-leg test.'
  },
  {
    id: 'P02',
    query: 'what is holding up the launch right now?',
    intent: 'Find current blockers.',
    klass: 'paraphrase',
    expectAnyOf: [
      'a48ed1b4-2899-4e63-9b90-ffee6849ff94', // "Stakeholder approval needed / Copy review overdue"
      '891e58d1-0e32-4934-ad5b-3cf49935f43f' // "'Finalize copy' has been open 6 days — likely stuck"
    ],
    forbid: FILLER_IDS,
    notes: 'No shared tokens: "holding up" vs "overdue"/"waiting"/"stuck"/"blocker".'
  },
  {
    id: 'P03',
    query: 'why would we win against a much bigger search company?',
    intent: 'Find the competitive thesis.',
    klass: 'paraphrase',
    expectAnyOf: ['dogfood-w-sources-1'],
    notes: 'Answer is "Why Plexi beats Perplexity — grounding surface, not horsepower". Query never says Perplexity.'
  },
  {
    id: 'P04',
    query: 'what should I measure to know the system is working?',
    intent: 'Find the North Star metric.',
    klass: 'paraphrase',
    expectAnyOf: ['dogfood-proj-w-apex-15'],
    notes: 'Answer: "track EV, not the stack". Query never says EV, North Star, or metric-by-name.'
  },
  {
    id: 'P05',
    query: 'am I allowed to keep buying more of a position that is going down?',
    intent: 'Find the averaging-down rule.',
    klass: 'paraphrase',
    expectAnyOf: ['dogfood-proj-w-apex-9'],
    notes: 'Answer is rule R03 "Never average down — ever" inside the 13-rules table. Query paraphrases it entirely.'
  },

  // ── RARE TOKEN (hinges on one literal — the lexical/IDF leg) ─────────────────────
  {
    id: 'R01',
    query: 'Kessel Run',
    intent: 'Find what Kessel Run refers to.',
    klass: 'rare-token',
    expectAnyOf: ['dogfood-proj-doc-flamelit-14', 'dogfood-proj-w-flamelit-2'],
    forbid: FILLER_IDS,
    notes: 'Rare proper noun appearing in exactly two sources. A lexical index nails this; pure cosine may not.'
  },
  {
    id: 'R02',
    query: 'sk_test_',
    intent: 'Find the Stripe test-mode key warning.',
    klass: 'rare-token',
    expectAnyOf: [
      '14bc192b-d013-44fc-9502-6774b01132b5',
      '9cc83e18-2337-4a00-a200-360fd842a348'
    ],
    dupGroups: [['14bc192b-d013-44fc-9502-6774b01132b5', '9cc83e18-2337-4a00-a200-360fd842a348']],
    notes:
      'A literal token with an underscore. Embeddings blur this; exact match is the only reliable route. ' +
      'This is the "engineer pastes an error string" case from the Cerebras fixture.'
  },
  // ⚠️ R03 ("Koncert dialer") REMOVED AT I0b (2026-07-23) — the query is no longer
  // answerable from the corpus, so scoring it measures nothing.
  //
  // Its single ground-truth source, '7e672a5b' (the "Call Session Checklist" widget),
  // sat on the "Cold Callz" desk, which the operator trashed ~2026-07-18. After
  // reconciliation, `WHERE text LIKE '%Koncert%'` returns ZERO rows corpus-wide.
  //
  // Removing a case is exactly the move a metric-gaming fix would make, so state the
  // direction plainly: R03 was PASSING at rank 1 and was the reason rare-token scored
  // 5/5. Retiring it REMOVES a hit and drops the class to 4 cases — it costs the
  // scorecard rather than flattering it. A replacement rare-token case must be written
  // from a corpus inventory dump before looking at ranker output, per I0's method.
  {
    id: 'R04',
    query: 'Albert Sans',
    intent: 'Find the font README.',
    klass: 'rare-token',
    expectAnyOf: [
      'd4a345ba-11e4-49a5-9257-7cf3fa528f5e',
      'f380b201-7baf-4dbd-bbc6-054a043f921e'
    ],
    dupGroups: [['d4a345ba-11e4-49a5-9257-7cf3fa528f5e', 'f380b201-7baf-4dbd-bbc6-054a043f921e']],
    notes: 'Rare token, and a twin-room duplicate pair at the same time.'
  },
  {
    id: 'R05',
    query: 'Alpaca or Bitget',
    intent: 'Find the open broker decision.',
    klass: 'rare-token',
    expectAnyOf: ['dogfood-proj-w-apex-16'],
    notes: 'Two rare proper nouns in one source ("the 8 open decisions").'
  },

  // ── FILLER TRAP (junk must never surface) ───────────────────────────────────────
  {
    id: 'F01',
    query: 'what are my open tasks?',
    intent: 'List real work.',
    klass: 'filler-trap',
    expectAnyOf: [
      '891e58d1-0e32-4934-ad5b-3cf49935f43f', // "You have 3 open tasks..."
      'a48ed1b4-2899-4e63-9b90-ffee6849ff94',
      '27cb8411-bddb-48db-b1fd-620b26ef5f8e' // task "Q3 Product Launch"
    ],
    forbid: FILLER_IDS,
    notes:
      'The corpus has 10+ empty task rows ("Untitled", "New desk", "Blank"). A task-shaped query is exactly ' +
      'where they will surface. Zero of them may appear.'
  },
  {
    id: 'F02',
    query: 'test',
    intent: 'Adversarial: a query that IS the filler text.',
    klass: 'filler-trap',
    expectAnyOf: [
      '4a4ea11e-df87-4e2b-b42c-180f73643a73', // "Test Scenarios"
      'b84eadf7-0b43-4780-a9d1-b07f72f9f084',
      'bf48265d-757e-4cf2-b2c7-f2a0b1b0ca01', // "Testing Checklist"
      'ca206f8e-1976-4075-b735-f5f5070b4da5'
    ],
    forbid: [
      '44f1103d-38d7-44c0-ab5d-f4eaba9b64df', // task "test"
      '2458e4f9-a606-49e1-9889-41d861af537a', // sticky "Test one"
      '9ce3d3cd-66cc-4c00-9af3-32f9704ae87c' // sticky "Testing one two three"
    ],
    notes:
      'HARD case, and deliberately so. Exact-match filler will rank first without an IDF/length gate. ' +
      'The useful answer is the real testing checklist, not a sticky that says "Test one".'
  },

  // ── ROOM SCOPE ──────────────────────────────────────────────────────────────────
  {
    id: 'S01',
    query: 'what do I need to confirm with vendors?',
    intent: 'Wedding vendor questions (no room set).',
    klass: 'room-scope',
    expectAnyOf: [
      '8511ff6d-8b2c-4763-a622-e93cfc4b5ee6',
      'ea002c68-e4f4-4d0a-ba56-109fcfeceb6e',
      '908b420d-3a04-482b-9914-2da2ed725469',
      '1caee931-4807-4c8a-ade9-b0c4ce0b896a'
    ],
    forbid: FILLER_IDS,
    notes: '"Vendor" is wedding-domain here. Business content should not dominate.'
  },
  {
    id: 'S02',
    query: 'what is on my checklist?',
    intent: 'Deliberately ambiguous — 6+ distinct checklists exist.',
    klass: 'room-scope',
    expectAnyOf: [
      '8511ff6d-8b2c-4763-a622-e93cfc4b5ee6', // Wedding
      '0d953bf6-793b-4652-9e98-6c054643f716', // Leaving the Country
      '6b1ef5c5-3e13-4848-a57e-e64e50e81689', // Credentials
      'bf48265d-757e-4cf2-b2c7-f2a0b1b0ca01', // Testing
      'ca206f8e-1976-4075-b735-f5f5070b4da5',
      '7e672a5b-5de9-4d74-8d0a-5f0e45eb77cb', // Call Session
      'ed7a7c8b-a703-4d4a-a203-9c77d272a383' // PlexiDesk Launch
    ],
    forbid: FILLER_IDS,
    notes:
      'Diversity case: the corpus holds wedding, travel, credentials, testing, cold-call and launch checklists. ' +
      'A good top-6 spans several; a bad one returns six near-copies of one.'
  },

  // ── LOOKUP (break-even baseline — plain semantic retrieval) ──────────────────────
  {
    id: 'L01',
    query: 'who are the founders of PlexiDesk?',
    intent: 'Name the three co-founders.',
    klass: 'lookup',
    expectAnyOf: ['dogfood-w-people-0', 'dogfood-w-people-4', 'dogfood-w-people-1'],
    forbid: FILLER_IDS,
    notes: 'Should be easy. If this fails, something is badly wrong.'
  },
  {
    id: 'L02',
    query: 'what is the crux of the brain project?',
    intent: 'Find the crux statement.',
    klass: 'lookup',
    expectAnyOf: [
      'dogfood-w-crux-0',
      'dogfood-doc-crux-2',
      'seed-05-architecture-02-retrieval-architecture-md'
    ],
    notes: 'Baseline lookup with an exact title match available.'
  },
  {
    id: 'L03',
    query: 'is the brain something users can turn off?',
    intent: 'Find DEC-012.',
    klass: 'lookup',
    expectAnyOf: ['dogfood-w-decisions-1', 'dogfood-doc-decisions-4', 'seed-04-decisions-md'],
    notes: 'Answer: "the brain is a togglable tier". Mild paraphrase over a lookup.'
  }
]
