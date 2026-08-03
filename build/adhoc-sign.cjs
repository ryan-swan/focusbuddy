// electron-builder afterPack hook: ad-hoc sign the .app on macOS.
//
// Why: macOS on Apple Silicon refuses to execute *entirely* unsigned
// binaries — they show as "damaged and can't be opened" rather than
// the standard "unidentified developer" warning. The minimum signature
// macOS accepts is an "ad-hoc" one (`codesign --sign -`) which doesn't
// require any Apple Developer cert or paid account.
//
// electron-builder's own `mac.identity: "-"` setting doesn't work for
// this — it treats `-` as a keychain identity name and silently
// skips signing when nothing matches. So we run codesign ourselves
// after electron-builder has assembled the .app bundle but before
// it zips it, so the resulting zip contains a properly-signed app.
//
// First-launch Gatekeeper warning still applies (user does
// right-click → Open once). Removing that requires real Developer ID
// notarisation, which we add once we have an Apple Developer account.

const { execSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const productFilename = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${productFilename}.app`)
  // eslint-disable-next-line no-console
  console.log(`[adhoc-sign] codesigning ${appPath}`)
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
    execSync(`codesign --verify --deep "${appPath}"`, { stdio: 'inherit' })
    // eslint-disable-next-line no-console
    console.log(`[adhoc-sign] success`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[adhoc-sign] failed:`, err.message)
    throw err
  }
}
