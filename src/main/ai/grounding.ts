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
