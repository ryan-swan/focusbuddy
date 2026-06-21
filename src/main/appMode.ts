// Which product is this binary — PlexiDesk or the standalone PlexiOffice app?
//
// Both apps are built from this one codebase and are meant to run AT THE SAME
// TIME. The packaged bundle embeds package.json `name: "focusbuddy"` with no
// `productName`, so Electron's app.getName() returns "focusbuddy" for BOTH builds.
// If we relied on that, PlexiOffice would default to PlexiDesk's userData
// directory and therefore share its single-instance lock, which makes PlexiOffice
// quit on launch whenever PlexiDesk is already open. So office detection must not
// depend on app.getName() alone.
//
// We detect the office build from, in order: the PLEXI_APP env var (dev: the
// dev:office script sets it), the executable path (packaged: the bundle is
// PlexiOffice.app on macOS / PlexiOffice.exe on Windows, so the path contains
// "plexioffice"), and finally app.getName() as a best-effort fallback (works once
// app.setName('PlexiOffice') has been applied). This is a pure function so the
// detection rules are unit-tested independently of the Electron runtime.
export function detectOfficeBuild(opts: {
  plexiAppEnv?: string | undefined
  execPath: string
  appName: string
}): boolean {
  return (
    opts.plexiAppEnv === 'office' ||
    opts.execPath.toLowerCase().includes('plexioffice') ||
    opts.appName.toLowerCase().includes('office')
  )
}
