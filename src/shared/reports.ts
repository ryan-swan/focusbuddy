// Shared PlexiReports types. A report turns a selection of tables into a written
// summary, generated on a schedule and delivered to people. The narrative is AI
// when an Anthropic key is set and a plain data summary otherwise, and the flag
// lastOutputIsAi records which, so the UI never passes a deterministic summary
// off as an AI narrative.

export type ReportSchedule = 'manual' | 'daily' | 'weekly' | 'monthly'

export interface ReportDef {
  id: string
  title: string
  sourceTableIds: string[]
  schedule: ReportSchedule
  recipients: string[]
  lastRunAt: number | null
  lastOutput: string | null
  lastOutputIsAi: boolean
  nextRunAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ReportDraft {
  title: string
  sourceTableIds?: string[]
  schedule?: ReportSchedule
  recipients?: string[]
}

export interface ReportPatch {
  title?: string
  sourceTableIds?: string[]
  schedule?: ReportSchedule
  recipients?: string[]
}

export interface GenerateReportResult {
  ok: boolean
  output: string
  isAi: boolean
  // True when a written AI narrative was wanted but no key is configured, so the
  // output is the honest data summary instead. The UI surfaces this plainly.
  needsApiKey?: boolean
}
