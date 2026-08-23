import { useEffect, useRef, useState } from 'react'
import type {
  FieldDefinition,
  FilterOperator,
  FilterRule,
  SelectOption,
  TableFilterConfig,
  TableViewConfig
} from '@shared/fields'
import { FIELD_TYPE_ICONS } from '@shared/fields'
import Icon from '../Icon'
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  isGroupableColumn,
  operatorNeedsValue,
  operatorWantsMultiValue
} from '../../lib/tableFilter'

interface Props {
  columns: FieldDefinition[]
  viewConfig: TableViewConfig
  setViewConfig: (vc: TableViewConfig) => void
  // Shown as "X of Y" when a filter is hiding rows.
  filteredCount: number
  totalCount: number
}

function genId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// The Filter + Group toolbar that sits under the view switcher. It edits
// viewConfig.filter / viewConfig.group and writes through setViewConfig, so all
// state is persisted in the table schema like every other view setting.
export default function TableFilterBar({
  columns,
  viewConfig,
  setViewConfig,
  filteredCount,
  totalCount
}: Props): JSX.Element {
  const [filterOpen, setFilterOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement | null>(null)
  const groupRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (filterOpen && !filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
      if (groupOpen && !groupRef.current?.contains(e.target as Node)) setGroupOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen, groupOpen])

  const filter = viewConfig.filter
  const rules = filter?.rules ?? []
  const group = viewConfig.group
  const filterableColumns = columns.filter((c) => OPERATORS_BY_TYPE[c.type].length > 0)
  const groupableColumns = columns.filter(isGroupableColumn)
  const groupCol = group?.columnId ? columns.find((c) => c.id === group.columnId) : null
  const isFiltered = rules.length > 0 && filteredCount !== totalCount

  function updateFilter(next: TableFilterConfig | undefined): void {
    setViewConfig({ ...viewConfig, filter: next })
  }

  function addRule(): void {
    const col = filterableColumns[0]
    if (!col) return
    const rule: FilterRule = {
      id: genId(),
      columnId: col.id,
      operator: OPERATORS_BY_TYPE[col.type][0]
    }
    updateFilter({ conjunction: filter?.conjunction ?? 'and', rules: [...rules, rule] })
  }

  function updateRule(id: string, patch: Partial<FilterRule>): void {
    const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    updateFilter({ conjunction: filter?.conjunction ?? 'and', rules: next })
  }

  function removeRule(id: string): void {
    const next = rules.filter((r) => r.id !== id)
    updateFilter(next.length === 0 ? undefined : { conjunction: filter?.conjunction ?? 'and', rules: next })
  }

  function changeRuleColumn(id: string, columnId: string): void {
    const col = columns.find((c) => c.id === columnId)
    if (!col) return
    // Reset operator + value: the prior operator may be invalid for the new
    // type, and a stale value almost never makes sense across types.
    updateRule(id, { columnId, operator: OPERATORS_BY_TYPE[col.type][0], value: undefined })
  }

  function changeRuleOperator(id: string, operator: FilterOperator): void {
    const rule = rules.find((r) => r.id === id)
    if (!rule) return
    // Clear the value when switching between single- and multi-value operators
    // (or to a no-value operator) so the editor never holds an incompatible shape.
    const wasMulti = operatorWantsMultiValue(rule.operator)
    const nowMulti = operatorWantsMultiValue(operator)
    const keepValue = operatorNeedsValue(operator) && wasMulti === nowMulti
    updateRule(id, { operator, value: keepValue ? rule.value : undefined })
  }

  function setConjunction(conjunction: 'and' | 'or'): void {
    if (!filter) return
    updateFilter({ ...filter, conjunction })
  }

  function setGroupColumn(columnId: string | null): void {
    if (!columnId) {
      setViewConfig({ ...viewConfig, group: undefined })
    } else {
      setViewConfig({
        ...viewConfig,
        group: { columnId, collapsed: [], direction: group?.direction ?? 'asc' }
      })
    }
    setGroupOpen(false)
  }

  function toggleGroupDirection(): void {
    if (!group?.columnId) return
    setViewConfig({
      ...viewConfig,
      group: { ...group, direction: group.direction === 'desc' ? 'asc' : 'desc' }
    })
  }

  return (
    <div className="px-2.5 py-1.5 border-b border-[var(--edge-soft)] bg-[var(--surface-sunken)]/40 flex items-center gap-1.5 text-[11px]">
      {/* ── Filter ── */}
      <div ref={filterRef} className="relative">
        <button
          onClick={() => {
            setFilterOpen((v) => !v)
            setGroupOpen(false)
          }}
          data-testid="table-filter-button"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
            rules.length > 0
              ? 'bg-accent/15 text-accent'
              : 'text-[var(--ink-50)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]'
          }`}
          title="Filter rows by any column"
        >
          <Icon name="filter_list" size={13} />
          <span>Filter</span>
          {rules.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 rounded-full bg-accent text-white text-[9px] font-bold tabular-nums">
              {rules.length}
            </span>
          )}
        </button>
        {filterOpen && (
          <div
            data-testid="table-filter-panel"
            className="fb-glass-panel rounded-[var(--radius-card)] fb-pop-in absolute left-0 top-full mt-1 z-50 w-[360px] max-w-[88vw] p-2.5 space-y-2"
          >
            {rules.length === 0 ? (
              <div className="text-[11px] text-[var(--ink-50)] px-1 py-2">
                No filters yet. Add one to show only the rows you want.
              </div>
            ) : (
              <div className="space-y-1.5">
                {rules.map((rule, i) => (
                  <div key={rule.id} className="flex items-start gap-1">
                    <div className="w-12 shrink-0 pt-1 text-[10px] uppercase tracking-wide text-[var(--ink-40)]">
                      {i === 0 ? (
                        'Where'
                      ) : i === 1 ? (
                        <select
                          value={filter?.conjunction ?? 'and'}
                          onChange={(e) => setConjunction(e.target.value as 'and' | 'or')}
                          className="fb-field px-1 py-0.5 text-[10px] text-[var(--ink-70)] lowercase"
                        >
                          <option value="and">and</option>
                          <option value="or">or</option>
                        </select>
                      ) : (
                        <span className="lowercase">{filter?.conjunction ?? 'and'}</span>
                      )}
                    </div>
                    <FilterRuleEditor
                      rule={rule}
                      columns={columns.filter((c) => OPERATORS_BY_TYPE[c.type].length > 0)}
                      onColumn={(cid) => changeRuleColumn(rule.id, cid)}
                      onOperator={(op) => changeRuleOperator(rule.id, op)}
                      onValue={(v) => updateRule(rule.id, { value: v })}
                    />
                    <button
                      onClick={() => removeRule(rule.id)}
                      className="shrink-0 mt-1 h-5 w-5 inline-flex items-center justify-center rounded text-[var(--ink-40)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      title="Remove filter"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--edge-soft)]">
              <button
                onClick={addRule}
                disabled={filterableColumns.length === 0}
                className="inline-flex items-center gap-1 px-1.5 py-1 rounded text-accent hover:bg-accent/10 font-medium disabled:opacity-40"
              >
                <Icon name="add" size={12} />
                <span>Add filter</span>
              </button>
              {rules.length > 0 && (
                <button
                  onClick={() => updateFilter(undefined)}
                  className="px-1.5 py-1 rounded text-[var(--ink-50)] hover:bg-[var(--surface-sunken)]"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Group ── */}
      <div ref={groupRef} className="relative">
        <button
          onClick={() => {
            setGroupOpen((v) => !v)
            setFilterOpen(false)
          }}
          data-testid="table-group-button"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
            groupCol
              ? 'bg-accent/15 text-accent'
              : 'text-[var(--ink-50)] hover:text-[var(--ink-90)] hover:bg-[var(--surface-sunken)]'
          }`}
          title="Group rows by a column"
        >
          <Icon name="splitscreen" size={13} />
          <span>{groupCol ? `Grouped by ${groupCol.label}` : 'Group'}</span>
        </button>
        {groupCol && (
          <button
            onClick={toggleGroupDirection}
            className="ml-0.5 inline-flex items-center justify-center h-[22px] w-[22px] rounded text-accent hover:bg-accent/10"
            title={`Group order: ${group?.direction === 'desc' ? 'descending' : 'ascending'}`}
          >
            <Icon name={group?.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'} size={12} />
          </button>
        )}
        {groupOpen && (
          <div
            data-testid="table-group-panel"
            className="fb-glass-panel rounded-[var(--radius-row)] fb-pop-in absolute left-0 top-full mt-1 z-50 w-48 py-1"
          >
            <button
              onClick={() => setGroupColumn(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--surface-sunken)] ${
                !groupCol ? 'text-accent font-medium' : 'text-[var(--ink-70)]'
              }`}
            >
              <Icon name="block" size={12} className="text-[var(--ink-40)]" />
              <span>No grouping</span>
            </button>
            <div className="my-1 border-t border-[var(--edge-soft)]" />
            {groupableColumns.map((col) => (
              <button
                key={col.id}
                onClick={() => setGroupColumn(col.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--surface-sunken)] ${
                  groupCol?.id === col.id ? 'text-accent font-medium' : 'text-[var(--ink-70)]'
                }`}
              >
                <Icon name={FIELD_TYPE_ICONS[col.type]} size={12} className="text-[var(--ink-40)]" />
                <span className="truncate">{col.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row count — surfaces how many rows the filter is hiding. */}
      <span className="ml-auto text-[10px] text-[var(--ink-40)] tabular-nums shrink-0">
        {isFiltered ? `${filteredCount} of ${totalCount} rows` : `${totalCount} ${totalCount === 1 ? 'row' : 'rows'}`}
      </span>
    </div>
  )
}

// One filter row: column picker, operator picker, and the type-aware value
// editor. Kept separate so the value editor logic stays readable.
function FilterRuleEditor({
  rule,
  columns,
  onColumn,
  onOperator,
  onValue
}: {
  rule: FilterRule
  columns: FieldDefinition[]
  onColumn: (columnId: string) => void
  onOperator: (op: FilterOperator) => void
  onValue: (value: string | number | string[] | null) => void
}): JSX.Element {
  const col = columns.find((c) => c.id === rule.columnId) ?? columns[0]
  const operators = col ? OPERATORS_BY_TYPE[col.type] : []
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex gap-1">
        <select
          value={rule.columnId}
          onChange={(e) => onColumn(e.target.value)}
          className="fb-field flex-1 min-w-0 px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={rule.operator}
          onChange={(e) => onOperator(e.target.value as FilterOperator)}
          className="fb-field flex-1 min-w-0 px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>
      </div>
      {col && operatorNeedsValue(rule.operator) && (
        <FilterValueEditor col={col} rule={rule} onValue={onValue} />
      )}
    </div>
  )
}

function FilterValueEditor({
  col,
  rule,
  onValue
}: {
  col: FieldDefinition
  rule: FilterRule
  onValue: (value: string | number | string[] | null) => void
}): JSX.Element | null {
  const multi = operatorWantsMultiValue(rule.operator)

  // Select-based value editors (single + multi-select columns).
  if (col.type === 'single-select' || col.type === 'multi-select') {
    const options = (col.config as { options: SelectOption[] }).options ?? []
    if (multi) {
      const selected = Array.isArray(rule.value) ? rule.value : []
      return (
        <div className="flex flex-wrap gap-1">
          {options.length === 0 && (
            <span className="text-[10px] text-[var(--ink-40)]">No options defined</span>
          )}
          {options.map((o) => {
            const on = selected.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() =>
                  onValue(on ? selected.filter((x) => x !== o.id) : [...selected, o.id])
                }
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  on
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-[var(--edge-soft)] text-[var(--ink-70)]'
                }`}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )
    }
    return (
      <select
        value={typeof rule.value === 'string' ? rule.value : ''}
        onChange={(e) => onValue(e.target.value || null)}
        className="fb-field w-full px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  if (col.type === 'number') {
    return (
      <input
        type="number"
        value={typeof rule.value === 'number' ? rule.value : ''}
        onChange={(e) => onValue(e.target.value === '' ? null : Number(e.target.value))}
        placeholder="Value"
        className="fb-field w-full px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
      />
    )
  }

  if (col.type === 'date') {
    // Stored as unix-ms (UTC midnight); the date input speaks yyyy-mm-dd.
    const ms = typeof rule.value === 'number' ? rule.value : null
    const asInput = ms == null ? '' : new Date(ms).toISOString().slice(0, 10)
    return (
      <input
        type="date"
        value={asInput}
        onChange={(e) => {
          if (!e.target.value) return onValue(null)
          const [y, m, d] = e.target.value.split('-').map(Number)
          onValue(Date.UTC(y, m - 1, d))
        }}
        className="fb-field w-full px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
      />
    )
  }

  // Text-like columns (and any fallback).
  return (
    <input
      type="text"
      value={typeof rule.value === 'string' ? rule.value : ''}
      onChange={(e) => onValue(e.target.value)}
      placeholder="Value"
      className="fb-field w-full px-1.5 py-1 text-[11px] text-[var(--ink-70)]"
    />
  )
}
