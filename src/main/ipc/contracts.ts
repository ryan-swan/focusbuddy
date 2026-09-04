// Argument contracts for the IPC boundary.
//
// The renderer is the least trusted part of an Electron app, and until now
// nothing checked what it sent. Measured against a booted build, 151 of 429
// handlers could be driven into the database or the filesystem with garbage —
// an id that was undefined, a number where a string was expected — and only
// failed once SQLite refused the bind. The error boundary stopped that leaking
// detail back to the caller; it did not stop the handler ACTING on it.
//
// Two deliberate choices:
//
//   1. Contracts are DERIVED from the handler signatures, not hand-written. A
//      hand-kept second copy of 151 argument lists is the same trap the work-item
//      column manifest documents, and it would rot the first time a signature
//      changed. `tests/unit/ipcContracts.test.ts` re-derives from source and
//      fails if the registry and the handlers disagree.
//
//   2. It is PERMISSIVE by default. Only argument types the deriver actually
//      understands (string, number, boolean, and their nullable forms) are
//      enforced, and only when the parameter is not optional. Anything else is
//      accepted. A validator that guesses is a validator that rejects legitimate
//      calls, and a broken feature is worse than an unvalidated one.

export type ArgKind = 'string' | 'number' | 'boolean' | 'object' | 'any'

export interface ArgSpec {
  kind: ArgKind
  optional: boolean
  nullable: boolean
}

/** Why an argument was refused — user-facing, no internals. */
export interface ContractViolation {
  index: number
  expected: string
  got: string
}

function describe(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'nothing'
  if (Array.isArray(v)) return 'an array'
  return typeof v
}

/** Check one call's arguments against a spec. Returns null when acceptable. */
export function checkArgs(spec: readonly ArgSpec[], args: readonly unknown[]): ContractViolation | null {
  for (let i = 0; i < spec.length; i++) {
    const s = spec[i]
    const v = args[i]
    if (v === undefined) {
      if (s.optional) continue
      return { index: i, expected: s.kind, got: 'nothing' }
    }
    if (v === null) {
      if (s.nullable || s.optional) continue
      return { index: i, expected: s.kind, got: 'null' }
    }
    if (s.kind === 'any') continue
    if (s.kind === 'object') {
      // An array is not the object shape any of these handlers declare, and
      // passing one through is how a draft reaches the database as nonsense.
      if (typeof v !== 'object' || Array.isArray(v)) return { index: i, expected: 'object', got: describe(v) }
      continue
    }
    // eslint-disable-next-line valid-typeof
    if (typeof v !== s.kind) return { index: i, expected: s.kind, got: describe(v) }
  }
  return null
}

/** A message safe to show a user: says what was wrong, names nothing internal. */
export function violationMessage(channel: string, v: ContractViolation): string {
  return (
    `"${channel}" was called with the wrong arguments: parameter ${v.index + 1} ` +
    `should be ${v.expected === 'any' ? 'provided' : `a ${v.expected}`}, but got ${v.got}.`
  )
}
