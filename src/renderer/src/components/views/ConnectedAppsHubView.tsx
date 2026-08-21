import { useEffect } from 'react'
import { useConnectedAppsStore } from '../../stores/connectedApps'
import { useViewStore } from '../../stores/view'
import { DashboardHeader } from '../plexi'
import Icon from '../Icon'
import AppLogo from '../AppLogo'

// Connect — the hub of apps you have connected (Gmail, Slack, Spotify, ChatGPT,
// and local apps). Built only from real connected-app records; an empty list
// shows an honest empty state rather than sample integrations. Web apps open in
// the embedded app view, local apps launch on the desktop.
export default function ConnectedAppsHubView(): JSX.Element {
  const apps = useConnectedAppsStore((s) => s.apps)
  const loaded = useConnectedAppsStore((s) => s.loaded)
  const refresh = useConnectedAppsStore((s) => s.refresh)
  const launchLocal = useConnectedAppsStore((s) => s.launchLocal)
  const goConnectedApp = useViewStore((s) => s.goConnectedApp)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  return (
    <div className="h-full w-full overflow-auto bg-[var(--surface-base)] text-[var(--ink-100)]" data-testid="connected-apps-hub">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <DashboardHeader title="Connect" subtitle="The apps and services you have connected to your workspace" />

        {apps.length === 0 ? (
          <div className="px-3 py-16 text-center" data-testid="connect-empty">
            <Icon name="hub" size={30} className="text-[var(--ink-30)]" />
            <p className="mt-3 text-[14px] text-[var(--ink-70)] max-w-md mx-auto leading-relaxed">
              No connected apps yet. Add the tools you use, like Gmail, Slack, Spotify or ChatGPT,
              from the Connected Apps panel in the sidebar, and they will show up here.
            </p>
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => (app.kind === 'local' ? void launchLocal(app.id) : goConnectedApp(app.id))}
                data-testid={`connect-app-${app.id}`}
                className="flex flex-col items-start gap-2.5 fb-card fb-lift p-4 text-left"
              >
                <AppLogo app={app} size={40} glyphSize={20} className="rounded-lg" />
                <span className="text-[13.5px] font-semibold truncate w-full">{app.title}</span>
                <span className="text-[11px] text-[var(--ink-50)]">{app.kind === 'local' ? 'Local app' : 'Web app'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
