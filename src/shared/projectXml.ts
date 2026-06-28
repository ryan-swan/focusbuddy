// Export a PlexiProjects plan to Microsoft Project XML (the MSPDI interchange
// format), so a plan can be opened in Microsoft Project (and most other planners).
// Pure and deterministic: it reads a computed ProjectPlan and emits valid XML with
// tasks, durations, percent-complete, milestones, typed predecessor links with
// lag, resources (from assignees) and assignments. Nothing is invented; only what
// the plan actually contains is written.

import type { ProjectPlan, DepType } from './projects'

// MSPDI dependency type codes: 0=FF, 1=FS, 2=SF, 3=SS.
const DEP_CODE: Record<DepType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// MSPDI wants a local datetime with no zone: YYYY-MM-DDTHH:MM:SS.
function xmlDate(ms: number, hour: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00:00`
}

// MSPDI duration format PT{H}H{M}M{S}S at an 8-hour working day.
function xmlDuration(days: number): string {
  return `PT${Math.max(0, Math.round(days * 8))}H0M0S`
}

export function toProjectXml(plan: ProjectPlan): string {
  // Stable UID per task (1-based, in plan order).
  const uid = new Map<string, number>()
  plan.tasks.forEach((t, i) => uid.set(t.id, i + 1))

  // Resources from distinct assignees.
  const resourceUid = new Map<string, number>()
  let rNext = 1
  for (const t of plan.tasks) {
    const a = t.assignee?.trim()
    if (a && !resourceUid.has(a)) resourceUid.set(a, rNext++)
  }

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  lines.push('<Project xmlns="http://schemas.microsoft.com/project">')
  lines.push(`  <Name>${esc(plan.title)}</Name>`)
  lines.push('  <Title>' + esc(plan.title) + '</Title>')
  lines.push('  <ScheduleFromStart>1</ScheduleFromStart>')
  lines.push(`  <StartDate>${xmlDate(plan.anchorMs, 8)}</StartDate>`)
  lines.push(`  <FinishDate>${xmlDate(plan.projectEndMs, 17)}</FinishDate>`)

  // Tasks.
  lines.push('  <Tasks>')
  for (const t of plan.tasks) {
    const u = uid.get(t.id)!
    lines.push('    <Task>')
    lines.push(`      <UID>${u}</UID>`)
    lines.push(`      <ID>${u}</ID>`)
    lines.push(`      <Name>${esc(t.title || 'Untitled')}</Name>`)
    lines.push('      <Active>1</Active>')
    lines.push(`      <Milestone>${t.isMilestone ? 1 : 0}</Milestone>`)
    lines.push(`      <Start>${xmlDate(t.scheduledStartMs, 8)}</Start>`)
    lines.push(`      <Finish>${xmlDate(t.scheduledEndMs, 17)}</Finish>`)
    lines.push(`      <Duration>${xmlDuration(t.isMilestone ? 0 : t.durationDays)}</Duration>`)
    lines.push('      <DurationFormat>7</DurationFormat>')
    lines.push(`      <PercentComplete>${Math.max(0, Math.min(100, Math.round(t.progressPct)))}</PercentComplete>`)
    if (t.deadlineMs != null) lines.push(`      <Deadline>${xmlDate(t.deadlineMs, 17)}</Deadline>`)
    if (t.cost != null) lines.push(`      <Cost>${(t.cost * 100).toFixed(0)}</Cost>`)
    // Predecessor links (typed + lag). Lag in tenths of a minute at an 8h day.
    for (const dep of plan.deps) {
      if (dep.succId !== t.id) continue
      const pUid = uid.get(dep.predId)
      if (pUid == null) continue
      lines.push('      <PredecessorLink>')
      lines.push(`        <PredecessorUID>${pUid}</PredecessorUID>`)
      lines.push(`        <Type>${DEP_CODE[dep.type] ?? 1}</Type>`)
      lines.push(`        <LinkLag>${Math.round(dep.lag * 8 * 60 * 10)}</LinkLag>`)
      lines.push('        <LagFormat>7</LagFormat>')
      lines.push('      </PredecessorLink>')
    }
    lines.push('    </Task>')
  }
  lines.push('  </Tasks>')

  // Resources.
  lines.push('  <Resources>')
  for (const [name, ru] of resourceUid) {
    lines.push('    <Resource>')
    lines.push(`      <UID>${ru}</UID>`)
    lines.push(`      <ID>${ru}</ID>`)
    lines.push(`      <Name>${esc(name)}</Name>`)
    lines.push('      <Type>1</Type>')
    lines.push('    </Resource>')
  }
  lines.push('  </Resources>')

  // Assignments.
  lines.push('  <Assignments>')
  let aUid = 1
  for (const t of plan.tasks) {
    const a = t.assignee?.trim()
    if (!a) continue
    const ru = resourceUid.get(a)
    if (ru == null) continue
    lines.push('    <Assignment>')
    lines.push(`      <UID>${aUid++}</UID>`)
    lines.push(`      <TaskUID>${uid.get(t.id)}</TaskUID>`)
    lines.push(`      <ResourceUID>${ru}</ResourceUID>`)
    lines.push('      <Units>1</Units>')
    lines.push('    </Assignment>')
  }
  lines.push('  </Assignments>')

  lines.push('</Project>')
  return lines.join('\n')
}
