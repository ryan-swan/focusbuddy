// electron-builder afterPack hook: harden the packaged binary, then sign it.
//
// ORDER IS THE WHOLE POINT. Flipping a fuse rewrites bytes inside the Electron
// binary, which invalidates any signature already applied to it. So fuses go
// first and signing second — and because electron-builder runs its own signing
// AFTER afterPack, both the Developer-ID path and the ad-hoc fallback end up
// signing an already-hardened binary.
//
// This replaces the old build/adhoc-sign.cjs hook, which is still used for
// nothing else and can be deleted once no config references it.

const { execSync } = require('node:child_process')
const { join } = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

// What each fuse closes. These are not theoretical: the project's own audit
// tooling (plexii-probe) attaches to a packaged build, reads
// ipcMain._invokeHandlers out of the live main process and invokes handlers
// directly, bypassing the renderer entirely. It does that through exactly the
// surfaces below. Useful in a harness on a developer's machine; not something
// that should be available in a build handed to a customer.
const FUSES = {
  version: FuseVersion.V1,

  // ELECTRON_RUN_AS_NODE=1 turns the shipped app into a general-purpose Node
  // runtime with the app's own privileges. The single highest-value fuse.
  [FuseV1Options.RunAsNode]: false,

  // NODE_OPTIONS can inject --require, loading arbitrary code at startup.
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,

  // --inspect / --remote-debugging-port attach a debugger to the MAIN process,
  // which is full code execution with no prompt. This is the surface the probe
  // uses for app.evaluate(); closing it is what makes the packaged build
  // meaningfully different from the dev build.
  [FuseV1Options.EnableNodeCliInspectArguments]: false,

  // NOT enabled: EnableCookieEncryption. Verified empirically, and the failure is
  // silent and severe — the app launches, stays alive, and never initialises: no
  // database at all, 3 profile files against a working build's 21. Cookie
  // encryption derives its key from the OS keychain, and an AD-HOC signed build
  // has no stable identity to hold that key, so it blocks on startup.
  //
  // This is very likely an artifact of ad-hoc signing rather than a problem with
  // the fuse: a real Developer ID signature should have the identity it needs. It
  // is worth having — those cookies are live sessions for sites the user is signed
  // into through the browser widgets — so it should be RE-TESTED under a proper
  // signed build and enabled there if it holds. It must not simply be switched on,
  // because the way it fails would not be caught by any test that only asks
  // whether the app started.
  [FuseV1Options.EnableCookieEncryption]: false,

  // NOT enabled: OnlyLoadAppFromAsar. Left off pending its own verified build.
  // This app unpacks native modules (better-sqlite3, tesseract, @napi-rs/canvas,
  // pdf-parse) to app.asar.unpacked by necessity, which is exactly the load path
  // this fuse constrains. It was not the cause of the failure above — that was
  // cookie encryption — so it may well be fine, but "may well be fine" is not a
  // reason to ship a fuse whose failure mode is a silently non-functional app.
  [FuseV1Options.OnlyLoadAppFromAsar]: false

  // NOT enabled: EnableEmbeddedAsarIntegrityValidation. It requires the asar
  // header hash to be embedded and kept in step by the packager, and a
  // mismatch is a silent refusal to launch. It is the right next step, but it
  // needs its own verified build rather than being switched on blind alongside
  // five other changes. Tracked in the roadmap, not smuggled in here.
}

async function harden(appPath, platform) {
  // eslint-disable-next-line no-console
  console.log(`[harden] flipping fuses on ${appPath}`)
  await flipFuses(appPath, {
    ...FUSES,
    // The macOS binary is re-signed below (or by electron-builder), so let the
    // fuse tool skip its own resign step and avoid signing twice.
    resetAdHocDarwinSignature: platform === 'darwin'
  })
  // eslint-disable-next-line no-console
  console.log('[harden] fuses set: RunAsNode=off NodeOptions=off NodeCliInspect=off')
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName
  const productFilename = context.packager.appInfo.productFilename

  const binary =
    platform === 'darwin'
      ? join(context.appOutDir, `${productFilename}.app`)
      : platform === 'win32'
        ? join(context.appOutDir, `${productFilename}.exe`)
        : join(context.appOutDir, productFilename)

  await harden(binary, platform)

  if (platform !== 'darwin') return

  // Ad-hoc signature only in the no-credentials fallback. With real Developer ID
  // credentials electron-builder signs properly after this hook, and ad-hoc
  // signing here would stomp that signature and break notarisation — the same
  // reasoning the old hook carried, preserved.
  const hasNotaryCreds =
    !!process.env.APPLE_TEAM_ID &&
    ((!!process.env.APPLE_API_KEY && !!process.env.APPLE_API_KEY_ID && !!process.env.APPLE_API_ISSUER) ||
      (!!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD))
  if (hasNotaryCreds) {
    // eslint-disable-next-line no-console
    console.log('[harden] Developer ID credentials present — leaving signing to electron-builder')
    return
  }

  // macOS on Apple Silicon refuses to execute an entirely unsigned binary
  // ("damaged and can\'t be opened"), and flipping a fuse invalidates whatever
  // signature was there. Re-sign ad-hoc so the build still launches.
  // eslint-disable-next-line no-console
  console.log(`[harden] ad-hoc signing ${binary}`)
  try {
    execSync(`codesign --force --deep --sign - "${binary}"`, { stdio: 'inherit' })
    execSync(`codesign --verify --deep "${binary}"`, { stdio: 'inherit' })
    // eslint-disable-next-line no-console
    console.log('[harden] ad-hoc signature applied')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[harden] signing failed:', err.message)
    throw err
  }
}
