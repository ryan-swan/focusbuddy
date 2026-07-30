// Seeded workspace generator for performance testing (spec §58). Builds a realistic
// event-sourced workspace at three collaborative scales — small, medium (the
// reference load), and large — so the deterministic core operations can be measured
// under load that reflects real small/medium/large teams. Seeding uses a bulk path
// (direct inserts with JS-computed per-partition sequences) so a 100k-event dataset
// builds in seconds; the benchmark then measures the REAL operation code paths on
// top of it.

import type { SqlDb } from '../db/eventStore'
import { ensureEventSchema } from '../db/eventStore'
import { ensureRelationshipSchema } from '../db/relationshipStore'
import { ensureReviewSchema } from '../context/health'

export interface TeamProfile {
  name: 'small' | 'medium' | 'large'
  users: number
  desks: number
  objectsPerDesk: number
  events: number
  relationships: number
}

// Small, medium (reference), large collaborative teams.
export const PERF_PROFILES: Record<TeamProfile['name'], TeamProfile> = {
  small: { name: 'small', users: 5, desks: 20, objectsPerDesk: 10, events: 2_000, relationships: 200 },
  medium: { name: 'medium', users: 25, desks: 100, objectsPerDesk: 20, events: 20_000, relationships: 2_000 },
  large: { name: 'large', users: 100, desks: 500, objectsPerDesk: 20, events: 100_000, relationships: 10_000 }
}

export interface SeededWorkspace {
  db: SqlDb
  profile: TeamProfile
  deskIds: string[]
  objectIds: string[]
  userIds: string[]
  org: string
}

// Deterministic id helpers (no randomness — reproducible seeds).
const deskId = (i: number): string => `desk-${i}`
const objId = (d: number, k: number): string => `obj-${d}-${k}`
const userId = (i: number): string => `user-${i}`

export function seedWorkspace(db: SqlDb, profile: TeamProfile, org = 'org-perf'): SeededWorkspace {
  ensureEventSchema(db)
  ensureRelationshipSchema(db)
  ensureReviewSchema(db)

  const deskIds = Array.from({ length: profile.desks }, (_, i) => deskId(i))
  const userIds = Array.from({ length: profile.users }, (_, i) => userId(i))
  const objectIds: string[] = []
  for (let d = 0; d < profile.desks; d++) for (let k = 0; k < profile.objectsPerDesk; k++) objectIds.push(objId(d, k))

  const insert = db.prepare(
    `INSERT INTO events (id, event_type, schema_version, category, timestamp, recorded_at, actor, organisation_id,
      desk_id, object_id, partition_key, sequence, previous_state, current_state, change_summary, correlation_id,
      causation_id, source, permissions, confidence, metadata)
     VALUES (?, ?, 1, 'user', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, 'seed', ?, NULL, '{}')`
  )
  const relInsert = db.prepare(
    `INSERT INTO relationships (id, organisation_id, source_entity_id, source_entity_type, target_entity_id,
      target_entity_type, relationship_type, directed, strength, confidence, state, evidence, evidence_key,
      discovery_method, permission_scope, correlation_id, confirmed_by, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'object', ?, 'object', 'RelatedTo', 0, 0.8, 1, 'confirmed', ?, ?, 'user', '{"grants":[]}', ?, ?, ?, ?, ?)`
  )
  const perms = '{"grants":[]}'
  const seqByPartition = new Map<string, number>()

  const seedAll = db.transaction(() => {
    // Events spread across objects; each object's partition sequence increments.
    for (let e = 0; e < profile.events; e++) {
      const oi = e % objectIds.length
      const object = objectIds[oi]
      const desk = deskId(Math.floor(oi / profile.objectsPerDesk))
      const seq = (seqByPartition.get(object) ?? 0) + 1
      seqByPartition.set(object, seq)
      const ts = new Date(1_800_000_000_000 + e * 1000).toISOString()
      insert.run(
        `evt-${e}`, e % 7 === 0 ? 'DeskUpdated' : 'DeskCompleted', ts, ts, userId(e % profile.users), org,
        desk, object, object, seq, JSON.stringify({ n: e }), `change ${e}`, `corr-${e}`, perms
      )
    }
    // Confirmed relationships between adjacent objects, so traversal has real edges.
    for (let r = 0; r < profile.relationships; r++) {
      const a = objectIds[r % objectIds.length]
      const b = objectIds[(r + 1) % objectIds.length]
      const now = new Date(1_800_000_000_000 + r * 1000).toISOString()
      relInsert.run(`rel-${r}`, org, a, b, JSON.stringify([{ kind: 'event', ref: `evt-${r}`, excerpt: null, weight: 1 }]), `event:evt-${r}`, `corr-${r}`, userId(r % profile.users), now, now, now)
    }
  })
  seedAll()

  return { db, profile, deskIds, objectIds, userIds, org }
}
