import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  CREATE_WORK_ITEM_KIND,
  CREATE_TASK_DEFINITION,
  PROTOCOL_VOCAB_NOTE,
  workItemCatalogAddendum
} from '../../src/main/ai/vocabulary'
import { CREATION_KINDS, gateCreation } from '../../src/main/ai/creationGate'
import type { ActionProposal } from '../../src/shared/types'

// SPEC-044 (Attention layer S0) — the protocol vocabulary quarantine.
//
// One word, three senses: node kind 'task' / wire verb 'create-task' = a DESK
// (frozen protocol, saved Flows persist it); 'work_item' = the new to-do-like
// attention entity; agent-browse "task" = a browsing goal. These tests are
// grep-locks on the source of truth: every model-visible create-task definition
// must come from vocabulary.ts, the reserved 'create-work-item' verb must be
// parsed by all five proposal parsers, and the gated addendum must never leak
// into prompts while the capability is off.

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8')

const anthropic = read('src/main/ai/anthropic.ts')
const dispatcher = read('src/main/ai/agentDispatcher.ts')
const voiceNote = read('src/main/ai/voiceNote.ts')
const mindMap = read('src/main/ai/mindMap.ts')
const flowsDb = read('src/main/db/flows.ts')
const apiServer = read('src/main/apiServer.ts')

describe('vocabulary module', () => {
  it('the addendum is empty while the capability is OFF and teaches the verb only when ON', () => {
    expect(workItemCatalogAddendum(false)).toBe('')
    const on = workItemCatalogAddendum(true)
    expect(on).toContain(CREATE_WORK_ITEM_KIND)
    expect(on).toContain('WORK ITEM')
    // The rule-4 refinement ships exactly when the tool exists, not before.
    expect(on).toContain('create-todo-list')
  })

  it('the desk definition says desk and forbids the to-do reading', () => {
    expect(CREATE_TASK_DEFINITION).toContain('DESK')
    expect(CREATE_TASK_DEFINITION).toMatch(/NOT a to-do/)
    expect(PROTOCOL_VOCAB_NOTE).toContain('ALWAYS means a DESK')
  })
})

describe('prompt sites import the shared definitions (no local redefinitions)', () => {
  it.each([
    ['src/main/ai/anthropic.ts', anthropic],
    ['src/main/ai/agentDispatcher.ts', dispatcher],
    ['src/main/ai/voiceNote.ts', voiceNote],
    ['src/main/ai/mindMap.ts', mindMap]
  ])('%s imports ./vocabulary', (_name, src) => {
    expect(src).toMatch(/from '\.\/vocabulary'/)
  })

  it('anthropic.ts interpolates the shared definition at its create-task catalog sites', () => {
    // The shared chat+agent catalog entry and the desk-agent/workspace-suggestion
    // entries all append CREATE_TASK_DEFINITION rather than restating it.
    const sites = anthropic.match(/CREATE_TASK_DEFINITION/g) ?? []
    expect(sites.length).toBeGreaterThanOrEqual(3)
    expect(anthropic).toContain('PROTOCOL_VOCAB_NOTE')
  })

  it('the "short action" to-do-teaching example is gone', () => {
    expect(anthropic).not.toContain('"title":"short action"')
    expect(anthropic).not.toContain('short task title')
  })

  it('the meeting-wrapup rule defines create-task as a desk (assembled from vocabulary since S5)', () => {
    const vocab = readFileSync(join(ROOT, 'src/main/ai/vocabulary.ts'), 'utf-8')
    expect(vocab).toContain('it creates a DESK')
    expect(anthropic).toContain('meetingCaptureRule(workItemsOn)')
    expect(anthropic).not.toContain('(each task opens its own workspace)')
  })

  it('the update-task rule and catalog speak desk while keeping the wire values', () => {
    expect(anthropic).toContain('To change the CURRENT desk')
    // The wire contract is untouched: field names, kind names, status values.
    expect(anthropic).toContain('status must be one of open|in_progress|done|parked')
    expect(anthropic).toContain('"kind": "update-task", "taskId"')
  })

  it('the mind-map prompt scopes its map-local "task" sense', () => {
    expect(mindMap).toContain('MINDMAP_TASK_SCOPE_NOTE')
  })
})

describe('create-work-item is reserved end-to-end', () => {
  it('all five proposal parsers have an arm for it', () => {
    // parseChatJson + suggestWorkspaceActions + parseMeetingDeliverables all
    // live in anthropic.ts — three distinct arms required there.
    const arms = anthropic.match(/case 'create-work-item'/g) ?? []
    expect(arms.length).toBeGreaterThanOrEqual(3)
    expect(dispatcher).toContain("kind === 'create-work-item'")
    expect(voiceNote).toContain("kind === 'create-work-item'")
  })

  it('the creation gate holds it in discovery like every other build kind', () => {
    expect(CREATION_KINDS.has('create-work-item')).toBe(true)
    const proposal: ActionProposal = {
      id: 'wi-1',
      kind: 'create-work-item',
      title: 'Call Bob about the lease'
    }
    const gated = gateCreation({
      proposals: [proposal],
      question: undefined,
      discovery: true,
      greenLit: false,
      supportsQuestions: false
    })
    expect(gated.proposals).toHaveLength(0)
    expect(gated.notice).toBeTruthy()
  })

  it('the executor routes it through the one code path (real since S5)', () => {
    const executor = read('src/renderer/src/lib/actionExecutor.ts')
    expect(executor).toContain("case 'create-work-item':")
    // S5 replaced the S0 no-op with the real apply; the typed refusals from
    // the db module still surface honestly through the catch.
    expect(executor).toContain('applyCreateWorkItem')
  })

  it('the gated addendum reaches both catalog consumers, flag-checked', () => {
    const injections = anthropic.match(/workItemCatalogAddendum\(isWorkItemsEnabled\(\)\)/g) ?? []
    expect(injections.length).toBe(2)
  })
})

describe('published protocol strings are untouched', () => {
  it('the wire verbs and event names survive verbatim', () => {
    // Saved Flows persist these; the quarantine renames labels, never protocol.
    expect(read('src/shared/flows.ts')).toContain("'task-completed'")
    expect(flowsDb).toContain("case 'create-task'")
    expect(anthropic).toContain('"kind": "create-task"')
    // The flow engine still creates a desk node from the frozen verb.
    expect(flowsDb).toMatch(/kind: 'task', title/)
  })

  it('the flow engine fails honestly on an unknown persisted action type', () => {
    expect(flowsDb).toContain('Unknown action type')
  })

  it('the local API cannot mint arbitrary node kinds', () => {
    // apiServer hardcodes kind:'task' at its node-create route; work_items can
    // never arrive through it until a deliberate arm ships (S3+).
    expect(apiServer).toContain("kind: 'task'")
    expect(apiServer).not.toContain('create-work-item')
  })
})
