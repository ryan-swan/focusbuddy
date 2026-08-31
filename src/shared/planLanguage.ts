// DEC-090 — the plan intent's NON-topic vocabulary, shared by both sides:
// main's selection fallback (planSelect) and the renderer's topic detector
// (runPlan). One list, or the two drift and "spread my open items across the
// week" gets judged differently by selection and by routing.
//
// Grown from the operator's live failure: scaffolding words ("items",
// "open", "related", "first", "half") each matched DOZENS of unrelated
// items, so a no-match intent selected garbage instead of nothing. Time
// words are scheduling language (parsePlanWindow/parsePlanDay territory),
// never selection language; planner verbs pick nothing either.
export const PLAN_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'today', 'tomorrow', 'take',
  'want', 'wanna', 'feel', 'feeling', 'really', 'lets', 'get', 'going',
  'work', 'working', 'stuff', 'things', 'motivated', 'focus', 'day',
  // planner scaffolding
  'item', 'items', 'task', 'tasks', 'open', 'related', 'regarding', 'about',
  'all', 'any', 'identify', 'find', 'pull', 'show', 'schedule', 'scheduling',
  'plan', 'planning', 'attention', 'block', 'blocks', 'time', 'slot', 'slots',
  'everything', 'anything', 'please', 'hours', 'hour',
  // time language
  'morning', 'afternoon', 'evening', 'tonight', 'noon', 'midday', 'early',
  'earlier', 'late', 'later', 'first', 'second', 'half', 'week', 'weeks',
  'days', 'before', 'after', 'around', 'between', 'during', 'spread',
  'across', 'throughout', 'next', 'rest', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday'
])

/** True when the intent names an actual TOPIC (a project, a person, a
 *  subject) — some token survives the stopword strip. "spread my open items
 *  across the week during work hours" survives nothing: it is pure
 *  scheduling language, and means the FULL queue, deterministically — the
 *  model never gets the chance to misread it as a topic search. */
export function intentNamesTopic(intent: string): boolean {
  return intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((t) => t.length >= 3 && !PLAN_STOPWORDS.has(t))
}
