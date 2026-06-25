import { describe, it, expect } from 'vitest'
import { localClockHour } from '@renderer/lib/peopleMap/solar'
import { daylightFor, fmtWindow, fmtHour } from '@renderer/lib/peopleMap/daylight'
import { LAND, project } from '@renderer/lib/peopleMap/worldmap'
import { groupByOffice, buildHierarchy, officeWindow } from '@renderer/lib/peopleMap/structure'
import type { Office, WorkWindow } from '@renderer/lib/orgsClient'
import type { MapPerson } from '@renderer/lib/peopleMap/usePeopleMap'

function person(p: Partial<MapPerson> & { accountId: string; handle: string }): MapPerson {
  return {
    role: 'member',
    title: null,
    department: null,
    officeId: null,
    managerAccountId: null,
    city: null,
    lat: null,
    lng: null,
    tzOffsetMin: null,
    workWindow: { start: 9, end: 17 },
    liveStatus: 'offline',
    liveWorkingOn: null,
    isSelf: false,
    ...p
  }
}
function office(p: Partial<Office> & { id: string }): Office {
  return {
    orgId: 'org1',
    name: p.id,
    kind: 'physical',
    city: null,
    lat: null,
    lng: null,
    tzOffsetMin: 0,
    workStart: null,
    workEnd: null,
    accent: null,
    createdAt: 0,
    ...p
  }
}

describe('solar / daylight', () => {
  it('localClockHour shifts by the timezone offset', () => {
    const d = new Date('2026-06-21T00:00:00Z')
    expect(localClockHour(0, d)).toBeCloseTo(0, 5)
    expect(localClockHour(600, d)).toBeCloseTo(10, 5) // +10h
    expect(localClockHour(-300, d)).toBeCloseTo(19, 5) // -5h wraps to 19
  })

  it('marks a midday point inside its work window as working', () => {
    const noon = daylightFor(0, 0, 0, new Date('2026-06-21T12:00:00Z'), { start: 9, end: 17 })
    expect(noon.hour).toBeCloseTo(12, 1)
    expect(noon.working).toBe(true)
    expect(noon.workLabel).toBe('Working hours')
  })

  it('marks the middle of the night as off hours', () => {
    const night = daylightFor(0, 0, 0, new Date('2026-06-21T00:00:00Z'), { start: 9, end: 17 })
    expect(night.working).toBe(false)
    expect(night.workLabel).toBe('After hours')
  })

  it('formats windows and hours for humans', () => {
    expect(fmtWindow({ start: 9, end: 17 })).toBe('9am–5pm')
    expect(fmtHour(13.5)).toBe('1:30 PM')
    expect(fmtHour(null)).toBe('—')
  })
})

describe('world map projection', () => {
  it('has land cells and projects coordinates into 0..1', () => {
    expect(LAND.size).toBeGreaterThan(100)
    expect(project(0, 0)).toEqual({ x: 0.5, y: 0.5 })
    const london = project(51.5, -0.12)
    expect(london.x).toBeGreaterThan(0)
    expect(london.x).toBeLessThan(1)
    expect(london.y).toBeGreaterThan(0)
    expect(london.y).toBeLessThan(1)
  })
})

describe('officeWindow inheritance', () => {
  const fallback: WorkWindow = { start: 8, end: 16 }
  it('uses the office window when set, else the fallback', () => {
    expect(officeWindow(office({ id: 'a', workStart: 9, workEnd: 17 }), fallback)).toEqual({ start: 9, end: 17 })
    expect(officeWindow(office({ id: 'b' }), fallback)).toEqual(fallback)
  })
})

describe('groupByOffice', () => {
  it('groups people by office and buckets the unassigned last', () => {
    const offices = [office({ id: 'ldn' }), office({ id: 'nyc' })]
    const people = [
      person({ accountId: '1', handle: 'a', officeId: 'ldn' }),
      person({ accountId: '2', handle: 'b', officeId: 'nyc' }),
      person({ accountId: '3', handle: 'c', officeId: 'ldn' }),
      person({ accountId: '4', handle: 'd', officeId: null })
    ]
    const groups = groupByOffice(people, offices)
    expect(groups.map((g) => g.office?.id ?? 'none')).toEqual(['ldn', 'nyc', 'none'])
    expect(groups[0].people.map((p) => p.handle)).toEqual(['a', 'c'])
    expect(groups[2].office).toBeNull()
    expect(groups[2].people[0].handle).toBe('d')
  })

  it('omits the unassigned bucket when everyone has an office', () => {
    const offices = [office({ id: 'ldn' })]
    const groups = groupByOffice([person({ accountId: '1', handle: 'a', officeId: 'ldn' })], offices)
    expect(groups).toHaveLength(1)
  })
})

describe('buildHierarchy', () => {
  it('builds a reporting tree, treating dangling managers as roots', () => {
    const people = [
      person({ accountId: 'ceo', handle: 'ceo' }),
      person({ accountId: 'vp', handle: 'vp', managerAccountId: 'ceo' }),
      person({ accountId: 'eng', handle: 'eng', managerAccountId: 'vp' }),
      person({ accountId: 'ext', handle: 'ext', managerAccountId: 'someone-not-here' })
    ]
    const { roots, childrenOf } = buildHierarchy(people)
    // ceo (real root) and ext (dangling manager -> root), sorted by handle.
    expect(roots.map((r) => r.handle)).toEqual(['ceo', 'ext'])
    expect(childrenOf('ceo').map((c) => c.handle)).toEqual(['vp'])
    expect(childrenOf('vp').map((c) => c.handle)).toEqual(['eng'])
    expect(childrenOf('eng')).toEqual([])
  })

  it('never loses a self-managed person (no infinite loop)', () => {
    const people = [person({ accountId: 'x', handle: 'x', managerAccountId: 'x' })]
    const { roots } = buildHierarchy(people)
    expect(roots.map((r) => r.handle)).toEqual(['x'])
  })
})
