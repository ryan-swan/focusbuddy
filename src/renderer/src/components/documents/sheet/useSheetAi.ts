// The PlexiSheets AI Assistant hook. It powers the right-side panel with two
// flows, both running on the SAME real infrastructure as the rest of the app
// (window.api.ai.suggestDocContent), and both grounded in the REAL sheet data:
//
//   insights - reads the active sheet's cells, builds a compact markdown table,
//              and asks the model for a few short, factual observations about it.
//   ask      - sends the user's own question plus that same table to the model
//              and shows the real answer.
//
// There is no dedicated sheet-insight endpoint, so both flows embed the table
// text into a suggestDocContent prompt. Nothing here is fabricated. On empty
// data the caller shows an honest "add some data" state rather than inventing a
// result; on an API error (including a missing key) we surface the real error
// text so the failure is visible, never masked with a plausible fake answer.

import { useCallback, useState } from 'react'
import type { SheetTab } from '@shared/types'

// How many data rows we send to the model. The table is capped so a large sheet
// stays inside a sane prompt size; we tell the model when it was truncated so it
// never implies it saw rows it did not.
const MAX_ROWS = 50

export interface SheetTableText {
  // The markdown table (header + capped rows), or null when the sheet has no
  // usable data at all (no header text and no cell values).
  text: string | null
  rowCount: number
  truncated: boolean
}

// Build a compact markdown representation of the active sheet: the column
// headers, then up to MAX_ROWS data rows, skipping rows that are entirely empty
// so trailing blank grid rows do not pad the prompt. Returns text=null when
// there is nothing real to describe.
export function buildSheetTableText(tab: SheetTab): SheetTableText {
  const headers = tab.columns.map((c, i) => (c && c.trim() ? c : columnLetter(i)))
  // Keep only rows that carry at least one non-empty cell.
  const nonEmpty = tab.rows.filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ''))
  // A header counts as "real" only when the user has named it. A fresh sheet
  // ships its columns pre-filled with default letter labels ("A", "B", ...), and
  // those are not data, so we ignore them when deciding emptiness. Without this a
  // brand-new blank sheet would look like it had headers and we would ask the
  // model to find insights in nothing.
  const namedHeader = tab.columns.some((c, i) => c && c.trim() !== '' && c.trim() !== columnLetter(i))
  if (nonEmpty.length === 0 && !namedHeader) {
    return { text: null, rowCount: 0, truncated: false }
  }
  const shown = nonEmpty.slice(0, MAX_ROWS)
  const truncated = nonEmpty.length > MAX_ROWS
  const esc = (s: string): string => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const headerLine = `| ${headers.map(esc).join(' | ')} |`
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`
  const bodyLines = shown.map((row) => {
    const cells = headers.map((_, i) => esc(row[i] ?? ''))
    return `| ${cells.join(' | ')} |`
  })
  let text = [headerLine, sepLine, ...bodyLines].join('\n')
  if (truncated) {
    text += `\n\n(Showing the first ${MAX_ROWS} of ${nonEmpty.length} rows.)`
  }
  return { text, rowCount: nonEmpty.length, truncated }
}

function columnLetter(i: number): string {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

export interface SheetAi {
  busy: boolean
  // The last error text from the model or our own guards, shown verbatim.
  error: string | null
  // The insights HTML returned by the model, or null before any run.
  insightsHtml: string | null
  // The answer HTML for the most recent question, or null before any ask.
  answerHtml: string | null
  // The question the answer corresponds to (so the panel can echo it).
  lastQuestion: string | null
  // True once the sheet had no usable data on the last insights attempt, so the
  // panel can show the honest empty state instead of a fabricated result.
  insightsEmpty: boolean
  generateInsights: () => Promise<void>
  ask: (question: string) => Promise<void>
  reset: () => void
}

async function callModel(prompt: string): Promise<string> {
  const res = await window.api.ai.suggestDocContent({ prompt })
  if (!res.ok || !res.html) {
    throw new Error(res.error || (res.needsApiKey ? 'No Anthropic API key is set, so the assistant can not run yet.' : 'The assistant returned nothing.'))
  }
  return res.html
}

// `getTab` is a getter so each run reads the live active sheet, not a snapshot
// captured when the hook mounted.
export function useSheetAi(getTab: () => SheetTab): SheetAi {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insightsHtml, setInsightsHtml] = useState<string | null>(null)
  const [answerHtml, setAnswerHtml] = useState<string | null>(null)
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)
  const [insightsEmpty, setInsightsEmpty] = useState(false)

  const generateInsights = useCallback(async (): Promise<void> => {
    const table = buildSheetTableText(getTab())
    if (!table.text) {
      // Honest empty state: there is genuinely nothing to analyse.
      setInsightsEmpty(true)
      setInsightsHtml(null)
      setError(null)
      return
    }
    setInsightsEmpty(false)
    setBusy(true)
    setError(null)
    setInsightsHtml(null)
    try {
      const prompt =
        'You are looking at a spreadsheet. Read the data below and return a few short, factual insights drawn ONLY from these exact values. ' +
        'Each insight must be supported by the data shown. Do not invent figures, targets, or comparisons that are not present. ' +
        'If the data is too thin to say anything useful, say so plainly. ' +
        'Return formatted HTML only, as a short unordered list of at most five items.\n\n' +
        table.text
      const html = await callModel(prompt)
      setInsightsHtml(html)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [getTab])

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const q = question.trim()
      if (!q) return
      const table = buildSheetTableText(getTab())
      setLastQuestion(q)
      setBusy(true)
      setError(null)
      setAnswerHtml(null)
      try {
        const prompt = table.text
          ? 'Answer the question using ONLY the spreadsheet data below. ' +
            'Base every statement on these exact values and do not invent figures that are not present. ' +
            'If the data does not contain the answer, say so plainly rather than guessing. ' +
            'Return formatted HTML only.\n\n' +
            `Question: ${q}\n\nSpreadsheet data:\n${table.text}`
          : 'A user asked a question about a spreadsheet, but the spreadsheet currently has no data. ' +
            'Tell them plainly that there is no data to answer from yet, in one short sentence. ' +
            'Return formatted HTML only.\n\n' +
            `Question: ${q}`
        const html = await callModel(prompt)
        setAnswerHtml(html)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [getTab]
  )

  const reset = useCallback(() => {
    setBusy(false)
    setError(null)
    setInsightsHtml(null)
    setAnswerHtml(null)
    setLastQuestion(null)
    setInsightsEmpty(false)
  }, [])

  return {
    busy,
    error,
    insightsHtml,
    answerHtml,
    lastQuestion,
    insightsEmpty,
    generateInsights,
    ask,
    reset
  }
}
