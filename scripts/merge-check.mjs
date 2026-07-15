#!/usr/bin/env node
// Merge-readiness gate. One place, run by both the pre-push hook and CI, so a
// branch can never reach Plexi3.0 stale or broken.
//
// It enforces three things, in order:
//   1. Up to date with the base branch  (the drift that caused the big Caleb
//      integration — a branch far behind its base merges in conflict hell).
//   2. Typecheck is clean.
//   3. Unit tests pass.
//
// Usage:
//   node scripts/merge-check.mjs                 # checks against Plexi3.0
//   BASE_BRANCH=main node scripts/merge-check.mjs
//   SKIP_MERGE_CHECK=1 git push                  # bypass for a WIP branch push
//
// Exit code is non-zero on the first failing gate, with a plain-English reason.

import { execSync, spawnSync } from 'node:child_process'

const BASE = process.env.BASE_BRANCH || 'Plexi3.0'
const CI = !!process.env.CI

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
}
function trySh(cmd) {
  try {
    return sh(cmd)
  } catch {
    return null
  }
}
function run(cmd, args) {
  // Inherit stdio so the developer sees tsc / vitest output live.
  return spawnSync(cmd, args, { stdio: 'inherit', shell: false }).status === 0
}

function fail(msg) {
  console.error(`\n✗ merge-check: ${msg}\n`)
  process.exit(1)
}
function ok(msg) {
  console.log(`✓ ${msg}`)
}

const head = trySh('git rev-parse --abbrev-ref HEAD') || 'HEAD'
console.log(`\nmerge-check → base: ${BASE}, branch: ${head}\n`)

// ── Gate 1: up to date with the base ─────────────────────────────────────────
// Skip the ancestry check only when we ARE the base branch; a push straight to
// the base still has to typecheck and test.
if (head !== BASE) {
  // Best-effort fetch so the check is meaningful locally. In CI the ref is
  // usually already present; never hard-fail purely because fetch was offline.
  trySh(`git fetch origin ${BASE} --quiet`)
  const baseRef = trySh(`git rev-parse --verify --quiet origin/${BASE}`)
    ? `origin/${BASE}`
    : trySh(`git rev-parse --verify --quiet ${BASE}`)
      ? BASE
      : null

  if (!baseRef) {
    console.warn(
      `⚠ could not resolve ${BASE} (offline or missing ref) — skipping the up-to-date check`
    )
  } else {
    const isUpToDate =
      spawnSync('git', ['merge-base', '--is-ancestor', baseRef, 'HEAD'], {
        stdio: 'ignore'
      }).status === 0
    if (!isUpToDate) {
      const behind = trySh(`git rev-list --count HEAD..${baseRef}`) || '?'
      fail(
        `your branch is ${behind} commit(s) behind ${baseRef}.\n` +
          `  Rebase before pushing:  git pull --rebase origin ${BASE}\n` +
          `  (this is exactly the drift that forced the last big integration)`
      )
    }
    ok(`up to date with ${baseRef}`)
  }
}

// ── Gate 2: typecheck ────────────────────────────────────────────────────────
console.log('\n• typecheck…')
if (!run('npm', ['run', 'typecheck'])) fail('typecheck failed — fix the type errors above')
ok('typecheck clean')

// ── Gate 3: unit tests ───────────────────────────────────────────────────────
console.log('\n• unit tests…')
if (!run('npm', ['run', 'test:unit'])) fail('unit tests failed — see above')
ok('unit tests pass')

console.log(
  `\n✓ merge-check passed${CI ? '' : ' — safe to push'}. ` +
    'For desk/UI changes also run the plexidesk-tester before merging.\n'
)
