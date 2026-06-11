import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { macAssetUrl, appBundlePath, MAC_INSTALL_SCRIPT } from '../../src/main/updaterInstall'

describe('macAssetUrl', () => {
  it('builds the release asset URL for a version and arch', () => {
    expect(macAssetUrl('2.5.18', 'arm64')).toBe(
      'https://github.com/saasmouth/focusbuddy/releases/download/v2.5.18/Haptyx-2.5.18-mac-arm64.zip'
    )
  })
})

describe('appBundlePath', () => {
  it('derives the .app bundle from the executable path', () => {
    expect(appBundlePath('/Applications/Haptyx.app/Contents/MacOS/Haptyx')).toBe(
      '/Applications/Haptyx.app'
    )
  })
  it('returns null when not running from a bundle', () => {
    expect(appBundlePath('/usr/local/bin/node')).toBeNull()
  })
})

// Exercise the real swap helper against throwaway directories. This is the
// risky part of the updater (it replaces the app bundle), so we prove the swap
// and the restore-on-failure behaviour rather than trust the script by reading.
const runnable = process.platform === 'darwin' || process.platform === 'linux'

describe.runIf(runnable)('MAC_INSTALL_SCRIPT swap behaviour', () => {
  function setup(): { work: string; scriptPath: string; env: NodeJS.ProcessEnv; target: string; fresh: string } {
    const work = mkdtempSync(join(tmpdir(), 'haptyx-swap-'))
    // A fake "installed" bundle and a fake "downloaded" bundle.
    const target = join(work, 'Haptyx.app')
    const fresh = join(work, 'new', 'Haptyx.app')
    mkdirSync(target, { recursive: true })
    mkdirSync(fresh, { recursive: true })
    writeFileSync(join(target, 'VERSION'), 'old')
    writeFileSync(join(fresh, 'VERSION'), 'new')
    // Shim out `open`, `xattr` and `ditto`'s GUI side effects. We provide a fake
    // `open` and `xattr` on PATH so no Finder window spawns; ditto exists on mac
    // and we let the real one run there, but on linux we shim it to cp -a.
    const bin = join(work, 'bin')
    mkdirSync(bin)
    const noop = '#!/bin/bash\nexit 0\n'
    writeFileSync(join(bin, 'open'), noop, { mode: 0o755 })
    writeFileSync(join(bin, 'xattr'), noop, { mode: 0o755 })
    chmodSync(join(bin, 'open'), 0o755)
    chmodSync(join(bin, 'xattr'), 0o755)
    if (process.platform !== 'darwin') {
      // ditto is macOS-only; emulate `ditto SRC DST` with cp -a.
      writeFileSync(join(bin, 'ditto'), '#!/bin/bash\ncp -a "$1" "$2"\n', { mode: 0o755 })
      chmodSync(join(bin, 'ditto'), 0o755)
    }
    const scriptPath = join(work, 'install.sh')
    writeFileSync(scriptPath, MAC_INSTALL_SCRIPT, { mode: 0o755 })
    chmodSync(scriptPath, 0o755)
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` }
    return { work, scriptPath, env, target, fresh }
  }

  it('swaps the new bundle into the target after the watched process exits', () => {
    const { scriptPath, env, target, fresh } = setup()
    // PID 1 never dies, so use a definitely-dead PID: spawn `true` and reap it.
    const dead = spawnSync('bash', ['-c', 'exit 0'])
    void dead
    // A PID that does not exist so the wait loop exits immediately.
    const r = spawnSync('bash', [scriptPath, '999999', fresh, target], { env, timeout: 30_000 })
    expect(r.status).toBe(0)
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(join(target, 'VERSION'), 'utf8')).toBe('new')
  })

  it('restores the old bundle if the swap copy fails', () => {
    const { work, scriptPath, env, target } = setup()
    // Point at a non-existent new app so ditto/cp fails.
    const missing = join(work, 'does-not-exist.app')
    const r = spawnSync('bash', [scriptPath, '999999', missing, target], { env, timeout: 30_000 })
    void r
    // The target must still exist with the OLD content (restored), never lost.
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(join(target, 'VERSION'), 'utf8')).toBe('old')
  })
})
