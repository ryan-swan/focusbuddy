// Links a slide chart to a real sheet range. Lists the workspace's spreadsheet
// documents, lets the user pick one, type an A1:C10 range and mark header row /
// column, then hands the source back so the editor pulls live data. No fabrication:
// if there are no sheets, it says so plainly rather than inventing options.

import { useEffect, useState } from 'react'
import type { DocumentMeta } from '@shared/types'
import Icon from '../../Icon'

interface Props {
  current?: { sheetDocId: string; range: string; headerRow?: boolean; headerCol?: boolean }
  onApply: (source: { sheetDocId: string; range: string; headerRow?: boolean; headerCol?: boolean }, sheetTitle: string) => void
  onClose: () => void
}

const RANGE_RE = /^[A-Za-z]+\d+:[A-Za-z]+\d+$/

export default function ChartLinkDialog({ current, onApply, onClose }: Props): JSX.Element {
  const [sheets, setSheets] = useState<DocumentMeta[] | null>(null)
  const [docId, setDocId] = useState(current?.sheetDocId ?? '')
  const [range, setRange] = useState(current?.range ?? 'A1:C10')
  const [headerRow, setHeaderRow] = useState(current?.headerRow ?? true)
  const [headerCol, setHeaderCol] = useState(current?.headerCol ?? true)

  useEffect(() => {
    void (async () => {
      const all = await window.api.documents.list()
      const only = all.filter((d) => d.docType === 'sheet' && !d.archived)
      setSheets(only)
      if (!docId && only[0]) setDocId(only[0].id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rangeOk = RANGE_RE.test(range.trim())
  const canApply = !!docId && rangeOk
  const inputCls = 'fb-field w-full px-2 py-1.5 text-[13px]'

  return (
    <div className="fb-scrim absolute inset-0 z-50 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="fb-card w-[420px] max-w-[94%] p-4 space-y-3"
        data-testid="chart-link-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="table_chart" size={15} className="text-accent" />
          Link chart to sheet data
          <button onClick={onClose} className="ml-auto icon-btn" aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        {sheets === null ? (
          <p className="text-[12px] text-[var(--ink-50)]">Loading spreadsheets…</p>
        ) : sheets.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-50)]">
            There are no spreadsheets in this workspace yet. Create a sheet, then link the chart to a range on it.
          </p>
        ) : (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1">Spreadsheet</div>
              <select className={inputCls} data-testid="chart-link-doc" value={docId} onChange={(e) => setDocId(e.target.value)}>
                {sheets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || 'Untitled sheet'}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--ink-40)] mt-1">Reads the first tab of the chosen spreadsheet.</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--ink-40)] mb-1">Range</div>
              <input
                className={inputCls}
                data-testid="chart-link-range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="A1:C10"
              />
              {!rangeOk && range.trim() !== '' && <p className="text-[10px] text-rose-500 mt-1">Use an A1:C10 style range.</p>}
            </div>
            <div className="flex items-center gap-4 text-[12px] text-[var(--ink-70)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} /> First row = series names
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={headerCol} onChange={(e) => setHeaderCol(e.target.checked)} /> First col = categories
              </label>
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-md text-[var(--ink-50)] hover:text-[var(--ink-80)]">
            Cancel
          </button>
          <button
            data-testid="chart-link-apply"
            disabled={!canApply}
            className="btn-primary text-[12px] px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-50"
            onClick={() => {
              const title = sheets?.find((d) => d.id === docId)?.title || 'Chart'
              onApply({ sheetDocId: docId, range: range.trim(), headerRow, headerCol }, title)
            }}
          >
            <Icon name="link" size={14} /> Link data
          </button>
        </div>
      </div>
    </div>
  )
}
