// Pure grounding helpers, dependency-free so they unit-test without pulling in
// the Anthropic SDK or Electron. Used by askWorkspace / askWorkspaceStream to
// build the per-source block sent to the model.

// One grounding source handed to the workspace-ask answer. The optional metadata
// fields come from local-model enrichment (documentRetrieval joins them onto the
// retrieved sources); when present they frame the source for the model.
export interface GroundingSource {
  docId: string
  title: string
  docType: string
  text: string
  summary?: string
  category?: string
  dates?: string[]
  entities?: string[]
}

// Build the grounding block for one source: a compact header from enriched
// metadata (category, dates, key entities, summary) then the body. Header lines
// appear only when their metadata is present, so an un-enriched source renders
// exactly as it did before this feature: "[n] title (type)\n<text>".
export function groundingBlock(s: GroundingSource, i: number): string {
  const lines = [`[${i + 1}] ${s.title} (${s.docType})`]
  if (s.category) lines.push(`Category: ${s.category}`)
  if (s.dates && s.dates.length) lines.push(`Dates: ${s.dates.slice(0, 8).join(', ')}`)
  if (s.entities && s.entities.length) lines.push(`Mentions: ${s.entities.slice(0, 8).join(', ')}`)
  if (s.summary) lines.push(`Summary: ${s.summary}`)
  return `${lines.join('\n')}\n${s.text}`
}

// Per-source ceiling for the chat prompt's RETRIEVED MATERIAL block (M1 defect
// #1). Matches what rankSources/selectPassages pack, so the passage selection
// upstream is what reaches the model instead of being re-cut. The old cut was
// 600 characters — the whole workspace grounded an answer on ~3.6 KB while a
// single open canvas widget could ride at 8000.
export const SOURCE_PROMPT_CAP = 6000

// One numbered source line of the chat retrieval block. Pure and exported so a
// unit test can assert what ACTUALLY reaches the prompt — the gate the defect
// audit demanded after the 600-char cut survived invisible to every spec.
export function retrievalSourceLine(
  s: { docType: string; title: string; text: string },
  i: number
): string {
  return `[${i + 1}] (${s.docType}) ${s.title}: ${s.text.replace(/\s+/g, ' ').slice(0, SOURCE_PROMPT_CAP)}`
}
