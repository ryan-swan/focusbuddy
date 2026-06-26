import { useEffect, useMemo, useState } from 'react'
import './peopleMap.css'
import Icon from '../Icon'
import { DashboardHeader, StatTile, RailCard } from '../plexi'
import { useAccountStore } from '../../stores/account'
import { useViewStore } from '../../stores/view'
import { useCallStore } from '../../stores/call'
import { listOrgs, type OrgMembership, type WorkWindow } from '../../lib/orgsClient'
import { usePeopleMap, type MapPerson, type PeopleMapData } from '../../lib/peopleMap/usePeopleMap'
import type { PresenceStatus } from '../../stores/presence'
import { daylightFor, dayBarGradient, fmtHour } from '../../lib/peopleMap/daylight'
import { subsolarPoint, sunElevation } from '../../lib/peopleMap/solar'
import { COLS, ROWS, LAND, project, cellCenter } from '../../lib/peopleMap/worldmap'
import { groupByOffice, buildHierarchy, officeWindow } from '../../lib/peopleMap/structure'

// The in-product People Map: every teammate across the org placed by office and
// reporting line, with their real local day and live presence. Reads the org
// People Map endpoint (offices + profiles + resolved work windows) and overlays
// the live presence socket. No sample data — an org with nothing set up shows
// an honest empty state pointing to the admin console.

type Tab = 'offices' | 'global' | 'hierarchy'

const STATUS_META: Record<PresenceStatus, { label: string; cls: string }> = {
  online: { label: 'Online', cls: 'pm-st-online' },
  away: { label: 'Away', cls: 'pm-st-away' },
  focus: { label: 'In focus', cls: 'pm-st-focus' },
  busy: { label: 'Busy', cls: 'pm-st-busy' },
  offline: { label: 'Offline', cls: 'pm-st-offline' }
}

const AV_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AV_COLORS[Math.abs(h) % AV_COLORS.length]
}
function initials(handle: string): string {
  const parts = handle.replace(/^@/, '').split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (handle.replace(/^@/, '').slice(0, 2) || '?').toUpperCase()
}

function Avatar({ seed, size = 30 }: { seed: string; size?: number }): JSX.Element {
  return (
    <span className="pm-av" style={{ width: size, height: size, fontSize: size * 0.4, background: colorFor(seed) }}>
      {initials(seed)}
    </span>
  )
}

function DayBar({
  lat,
  lng,
  tz,
  work,
  now,
  labels = false,
  height = 8
}: {
  lat: number
  lng: number
  tz: number
  work: WorkWindow
  now: Date
  labels?: boolean
  height?: number
}): JSX.Element {
  const info = daylightFor(lat, lng, tz, now, work)
  const pct = (info.hour / 24) * 100
  const ws = (work.start / 24) * 100
  const we = (work.end / 24) * 100
  return (
    <div className="pm-daybar">
      <div className="pm-daybar__track" style={{ height, background: dayBarGradient(info) }}>
        <span className="pm-daybar__work" style={{ left: `${ws}%`, width: `${Math.max(0, we - ws)}%` }} />
        <span className="pm-daybar__marker" style={{ left: `${pct}%` }} />
      </div>
      {labels && (
        <div className="pm-daybar__labels">
          <span>↑ {fmtHour(info.sunrise)}</span>
          <span>{info.label} · {fmtHour(info.hour)}</span>
          <span>↓ {fmtHour(info.sunset)}</span>
        </div>
      )}
    </div>
  )
}

/* ---------------- offices ---------------- */

function OfficesTab({ data, now }: { data: PeopleMapData; now: Date }): JSX.Element {
  const groups = groupByOffice(data.people, data.offices)
  const liveCount = (people: MapPerson[], st: PresenceStatus): number =>
    people.filter((p) => p.liveStatus === st).length

  return (
    <div className="pm-offices">
      {groups.map(({ office, people }) => {
        const hasGeo = !!office && office.lat != null && office.lng != null
        return (
          <div className="pm-office" key={office?.id ?? 'unassigned'}>
            <div className="pm-office__top">
              <span className="pm-office__name">{office ? office.name : 'No office set'}</span>
              <span className="pm-office__kind">{office ? office.kind : 'unassigned'}</span>
              <span className="pm-office__count">{people.length}</span>
            </div>
            {office?.city && <div className="pm-office__where">{office.city}</div>}
            {hasGeo && (
              <DayBar
                lat={office!.lat!}
                lng={office!.lng!}
                tz={office!.tzOffsetMin}
                work={officeWindow(office!, data.defaultHours)}
                now={now}
                labels
              />
            )}
            <div className="pm-office__pres">
              <span><i className="pm-dot pm-st-online" style={{ width: 7, height: 7 }} /> {liveCount(people, 'online')} online</span>
              <span><i className="pm-dot pm-st-focus" style={{ width: 7, height: 7 }} /> {liveCount(people, 'focus')} focus</span>
              <span><i className="pm-dot pm-st-busy" style={{ width: 7, height: 7 }} /> {liveCount(people, 'busy')} busy</span>
            </div>
            <div className="pm-people">
              {people.map((p) => (
                <PersonRow key={p.accountId} person={p} now={now} />
              ))}
              {people.length === 0 && <div className="pm-office__where">No one here yet.</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PersonRow({ person, now }: { person: MapPerson; now: Date }): JSX.Element {
  const meta = STATUS_META[person.liveStatus]
  const startCall = useCallStore((s) => s.startCall)
  const hasGeo = person.lat != null && person.lng != null && person.tzOffsetMin != null
  const day = hasGeo ? daylightFor(person.lat!, person.lng!, person.tzOffsetMin!, now, person.workWindow) : null
  return (
    <div className="pm-prow">
      <span className="pm-prow__rel">
        <Avatar seed={person.handle} size={28} />
        <span className={`pm-prow__sdot pm-dot ${meta.cls}`} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <div className="pm-prow__name">
          {person.handle}
          {person.isSelf && <span style={{ color: '#8b96b3', fontWeight: 500 }}> (you)</span>}
        </div>
        <div className="pm-prow__sub">
          {person.liveWorkingOn || person.title || meta.label}
          {person.department ? ` · ${person.department}` : ''}
        </div>
      </span>
      {day && (
        <span className="pm-prow__time">
          {fmtHour(day.hour)}
          <br />
          <span style={{ color: day.working ? '#6ee7b7' : '#93a0bd' }}>{day.workLabel}</span>
        </span>
      )}
      {!person.isSelf && person.liveStatus !== 'offline' && (
        <button
          className="pm-iconbtn pm-prow__call"
          data-testid="call-btn"
          title={`Call ${person.handle}`}
          aria-label={`Call ${person.handle}`}
          onClick={() => void startCall({ accountId: person.accountId, handle: person.handle }, 'video')}
        >
          <Icon name="video_call" size={14} />
        </button>
      )}
    </div>
  )
}

/* ---------------- global map ---------------- */

function GlobalTab({ data, now }: { data: PeopleMapData; now: Date }): JSX.Element {
  const sun = useMemo(() => subsolarPoint(now), [now])
  const sunPos = project(sun.lat, sun.lng)
  const moonPos = project(-sun.lat, ((sun.lng + 360) % 360) - 180)

  const dots = useMemo(() => {
    const out: { col: number; row: number }[] = []
    LAND.forEach((k) => {
      const [c, r] = k.split(',').map(Number)
      out.push({ col: c, row: r })
    })
    return out
  }, [])
  const dotClass = (col: number, row: number): string => {
    const { lat, lng } = cellCenter(col, row)
    const el = sunElevation(lat, lng, now)
    return el > 6 ? 'pm-land' : el < -6 ? 'pm-land pm-land--night' : 'pm-land pm-land--twi'
  }

  const officeById = new Map(data.offices.map((o) => [o.id, o]))
  const clusters = data.offices
    .filter((o) => o.lat != null && o.lng != null)
    .map((o) => ({ office: o, count: data.people.filter((p) => p.officeId === o.id).length }))
  // Remote/external individuals with their own coordinates and no placed office.
  const loosePins = data.people.filter(
    (p) => p.lat != null && p.lng != null && (!p.officeId || !officeById.get(p.officeId)?.lat)
  )

  return (
    <div className="pm-world">
      <svg className="pm-world__grid" viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none">
        {dots.map((d) => (
          <circle key={`${d.col}-${d.row}`} cx={d.col + 0.5} cy={d.row + 0.5} r={0.32} className={dotClass(d.col, d.row)} />
        ))}
      </svg>
      <span className="pm-sun" style={{ left: `${sunPos.x * 100}%`, top: `${sunPos.y * 100}%` }}>
        <Icon name="light_mode" size={18} className="" />
      </span>
      <span className="pm-moon" style={{ left: `${moonPos.x * 100}%`, top: `${moonPos.y * 100}%`, opacity: 0.5 }}>
        <Icon name="dark_mode" size={14} className="" />
      </span>

      {clusters.map(({ office, count }) => {
        const { x, y } = project(office.lat!, office.lng!)
        const info = daylightFor(office.lat!, office.lng!, office.tzOffsetMin, now, officeWindow(office, data.defaultHours))
        return (
          <span
            key={office.id}
            className="pm-pin"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: office.accent ?? '#5566f0', width: 26, height: 26 }}
            title={`${office.name} — ${count} people · ${info.label}, ${fmtHour(info.hour)} local`}
          >
            {count}
          </span>
        )
      })}

      {loosePins.map((p) => {
        const { x, y } = project(p.lat!, p.lng!)
        const meta = STATUS_META[p.liveStatus]
        const working = daylightFor(p.lat!, p.lng!, p.tzOffsetMin ?? 0, now, p.workWindow).working
        return (
          <span
            key={p.accountId}
            className={`pm-pin ${working ? '' : 'pm-pin--off'}`}
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, background: colorFor(p.handle) }}
            title={`${p.handle} — ${meta.label}${p.city ? ` · ${p.city}` : ''}`}
          >
            {initials(p.handle)}
            <span className={`pm-pin__sdot pm-dot ${meta.cls}`} />
          </span>
        )
      })}
    </div>
  )
}

/* ---------------- hierarchy ---------------- */

function HierarchyTab({ data, now }: { data: PeopleMapData; now: Date }): JSX.Element {
  const { roots, childrenOf } = buildHierarchy(data.people)
  const startCall = useCallStore((s) => s.startCall)

  const renderNode = (p: MapPerson, depth: number): JSX.Element => {
    const meta = STATUS_META[p.liveStatus]
    const children = childrenOf(p.accountId)
    const hasGeo = p.lat != null && p.lng != null && p.tzOffsetMin != null
    const day = hasGeo ? daylightFor(p.lat!, p.lng!, p.tzOffsetMin!, now, p.workWindow) : null
    return (
      <div className="pm-node" key={p.accountId}>
        <div className="pm-node__self">
          <div className="pm-card">
            <span className="pm-card__rel">
              <Avatar seed={p.handle} size={32} />
              <span className={`pm-card__sdot pm-dot ${meta.cls}`} />
            </span>
            <span>
              <div className="pm-card__name">
                {p.handle}
                {p.isSelf && <span style={{ color: '#8b96b3', fontWeight: 500 }}> (you)</span>}
              </div>
              <div className="pm-card__role">{p.title || p.role}{p.department ? ` · ${p.department}` : ''}</div>
            </span>
            {day && (
              <span className={`pm-worktag ${day.working ? 'is-working' : 'is-off'}`} title={`${day.label} · ${fmtHour(day.hour)} local`}>
                {day.working ? 'working' : day.workLabel.toLowerCase()}
              </span>
            )}
            {!p.isSelf && p.liveStatus !== 'offline' && (
              <button
                className="pm-iconbtn pm-card__call"
                data-testid="call-btn"
                title={`Call ${p.handle}`}
                aria-label={`Call ${p.handle}`}
                onClick={() => void startCall({ accountId: p.accountId, handle: p.handle }, 'video')}
              >
                <Icon name="video_call" size={14} />
              </button>
            )}
          </div>
        </div>
        {children.length > 0 && depth < 12 && (
          <div className="pm-node__kids">{children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return <div className="pm-tree">{roots.map((r) => renderNode(r, 0))}</div>
}

/* ---------------- live right rail ---------------- */

function PeopleRail({ data, now }: { data: PeopleMapData; now: Date }): JSX.Element {
  const weight = (s: PresenceStatus): number => (s === 'online' ? 0 : s === 'focus' ? 1 : s === 'away' ? 2 : 3)
  const around = data.people
    .filter((p) => p.liveStatus !== 'offline')
    .sort((a, b) => weight(a.liveStatus) - weight(b.liveStatus) || a.handle.localeCompare(b.handle))

  const dayOf = (p: MapPerson): ReturnType<typeof daylightFor> | null =>
    p.lat != null && p.lng != null && p.tzOffsetMin != null
      ? daylightFor(p.lat, p.lng, p.tzOffsetMin, now, p.workWindow)
      : null
  const wrapping = data.people.filter((p) => dayOf(p)?.workLabel === 'Wrapping up')
  const starting = data.people.filter((p) => dayOf(p)?.workLabel === 'Early hours')
  const names = (people: MapPerson[]): string =>
    people.slice(0, 4).map((p) => p.handle).join(', ') + (people.length > 4 ? ` +${people.length - 4}` : '')

  const deptCount = new Map<string, number>()
  for (const p of data.people) {
    const k = p.department || 'Unassigned'
    deptCount.set(k, (deptCount.get(k) ?? 0) + 1)
  }
  const depts = [...deptCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxDept = depts[0]?.[1] ?? 1

  return (
    <aside className="pm-rail">
      <RailCard title="Around right now" icon="bolt" tone="emerald">
        {around.length === 0 ? (
          <div className="text-[11.5px] text-stone-400">No one is online right now.</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {around.slice(0, 8).map((p) => {
              const d = dayOf(p)
              return (
                <div key={p.accountId} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                  <span className="relative shrink-0">
                    <Avatar seed={p.handle} size={26} />
                    <span className={`pm-prow__sdot pm-dot ${STATUS_META[p.liveStatus].cls}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate">{p.handle}</div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {p.liveWorkingOn || p.title || STATUS_META[p.liveStatus].label}
                    </div>
                  </span>
                  {d && <span className="text-[11px] text-stone-400 fb-tabular shrink-0">{fmtHour(d.hour)}</span>}
                </div>
              )
            })}
            {around.length > 8 && <div className="text-[11px] text-stone-400 px-1 pt-1">+{around.length - 8} more online</div>}
          </div>
        )}
      </RailCard>

      <RailCard title="Follow the sun" icon="wb_twilight" tone="amber" className="mt-3">
        {wrapping.length === 0 && starting.length === 0 ? (
          <div className="text-[11.5px] text-stone-400">No handoffs in motion right now.</div>
        ) : (
          <div className="flex flex-col gap-2.5 text-[12px]">
            <div>
              <div className="text-[10.5px] uppercase tracking-wide text-stone-400 mb-1">Wrapping up</div>
              <div className="text-stone-700 dark:text-stone-200">{wrapping.length ? names(wrapping) : '—'}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wide text-stone-400 mb-1">Starting their day</div>
              <div className="text-stone-700 dark:text-stone-200">{starting.length ? names(starting) : '—'}</div>
            </div>
          </div>
        )}
      </RailCard>

      <RailCard title="By department" icon="donut_small" tone="violet" className="mt-3">
        <div className="flex flex-col gap-1.5">
          {depts.map(([name, n]) => (
            <div key={name} className="text-[12px]">
              <div className="flex justify-between gap-2">
                <span className="text-stone-700 dark:text-stone-200 truncate">{name}</span>
                <span className="text-stone-400 fb-tabular shrink-0">{n}</span>
              </div>
              <div className="h-1.5 rounded-full bg-stone-500/10 mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-accent/60" style={{ width: `${(n / maxDept) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </RailCard>
    </aside>
  )
}

/* ---------------- shell ---------------- */

export default function PeopleMapView(): JSX.Element {
  const token = useAccountStore((s) => s.sessionToken)
  const goOrg = useViewStore((s) => s.goOrg)
  const [orgs, setOrgs] = useState<OrgMembership[]>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('offices')
  const [now, setNow] = useState<Date>(() => new Date())

  // Clock heartbeat — keeps every daylight indicator current.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!token) return
    void listOrgs(token).then((list) => {
      setOrgs(list)
      setOrgId((prev) => prev ?? list.find((o) => !o.personal)?.id ?? list[0]?.id ?? null)
    })
  }, [token])

  const { data, loading, error, refresh } = usePeopleMap(orgId)
  const selectedOrg = orgs.find((o) => o.id === orgId) ?? null
  const account = useAccountStore((s) => s.account)

  const hh = now.getHours()
  const who = account?.handle || account?.email?.split('@')[0] || ''
  const greeting = `Good ${hh < 12 ? 'morning' : hh < 18 ? 'afternoon' : 'evening'}${who ? `, ${who}` : ''}`
  const aroundNow = data ? data.people.filter((p) => p.liveStatus !== 'offline').length : 0
  const workingNow = data
    ? data.people.filter(
        (p) =>
          p.lat != null &&
          p.lng != null &&
          p.tzOffsetMin != null &&
          daylightFor(p.lat, p.lng, p.tzOffsetMin, now, p.workWindow).working
      ).length
    : 0

  let body: JSX.Element
  if (!token) {
    body = <div className="pm-empty"><h2>Sign in to see your team</h2><p>The People Map shows everyone in your organization, where they are, and who's around right now.</p></div>
  } else if (orgs.length > 0 && !orgs.some((o) => !o.personal)) {
    body = (
      <div className="pm-empty">
        <h2>Create an organization first</h2>
        <p>The People Map maps a real organization. Create one and invite your team, then set up offices and profiles.</p>
        <button onClick={goOrg}>Open Organizations</button>
      </div>
    )
  } else if (loading && !data) {
    body = <div className="pm-empty"><p>Loading the map…</p></div>
  } else if (error) {
    body = <div className="pm-empty"><h2>Couldn't load the map</h2><p>{error}</p><button onClick={refresh}>Try again</button></div>
  } else if (!data || data.people.length === 0) {
    body = (
      <div className="pm-empty">
        <h2>No teammates yet</h2>
        <p>Invite people to this organization, then give them offices and profiles so they appear on the map.</p>
        <button onClick={goOrg}>Open Organizations</button>
      </div>
    )
  } else if (tab === 'offices') {
    body = <OfficesTab data={data} now={now} />
  } else if (tab === 'global') {
    body = <GlobalTab data={data} now={now} />
  } else {
    body = <HierarchyTab data={data} now={now} />
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'offices', label: 'Offices', icon: 'location_city' },
    { id: 'global', label: 'Global', icon: 'public' },
    { id: 'hierarchy', label: 'Hierarchy', icon: 'account_tree' }
  ]

  return (
    <div className="pm-root" data-testid="people-map">
      <div style={{ padding: '16px 20px 0' }}>
        <DashboardHeader
          title="People Map"
          greeting={greeting}
          subtitle={selectedOrg ? `PlexiTeam · ${selectedOrg.name}` : 'See everyone, where they are, and who is around right now'}
          actions={
            <>
              {orgs.filter((o) => !o.personal).length > 0 && (
                <select
                  className="text-[12px] bg-transparent text-stone-700 dark:text-stone-200 border border-stone-200 dark:border-white/10 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent"
                  value={orgId ?? ''}
                  onChange={(e) => setOrgId(e.target.value || null)}
                  data-testid="people-map-org"
                >
                  {orgs.filter((o) => !o.personal).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="pm-tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={`pm-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)} data-testid={`people-map-tab-${t.id}`}>
                    <Icon name={t.icon} size={14} className="" />
                    {t.label}
                  </button>
                ))}
              </div>
              <button className="pm-iconbtn" onClick={refresh} title="Refresh">
                <Icon name="refresh" size={16} className="" />
              </button>
            </>
          }
        />
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile icon="groups" label="People" value={data.people.length} tone="accent" hint={`Company hours ${data.defaultHours.start}:00–${data.defaultHours.end}:00`} />
            <StatTile icon="bolt" label="Around now" value={aroundNow} tone="emerald" />
            <StatTile icon="av_timer" label="In working hours" value={workingNow} tone="violet" />
            <StatTile icon="location_city" label="Offices" value={data.offices.length} tone="sky" />
          </div>
        )}
      </div>
      <div className="pm-body">
        {data && data.people.length > 0 ? (
          <div className="pm-layout">
            <div className="pm-main">{body}</div>
            <PeopleRail data={data} now={now} />
          </div>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
