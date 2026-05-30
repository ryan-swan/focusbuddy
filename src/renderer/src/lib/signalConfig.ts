// Single source of truth for "which signaling backend are we using right
// now" and "where does it live". Read from Vite-injected env vars so the
// app can be built with different backends without touching code.
//
// Default behaviour:
//  - Dev (npm run dev) → useRemote = false; LocalMockMatcher pairs windows
//    on the same machine via BroadcastChannel; ShareService is null and
//    the local SQLite tables are the only persistence.
//  - Prod (electron-vite build) → useRemote = true; RemoteMatcher opens a
//    WebSocket to the configured server; ShareService mints + resolves
//    against its REST endpoints alongside the local tables.
//
// Override at build time (or in a .env.local) with:
//    VITE_USE_REMOTE_SIGNAL=true|false
//    VITE_SIGNAL_HTTP_URL=https://signal.fb.app
//    VITE_SIGNAL_WS_URL=wss://signal.fb.app/ws

interface SignalConfig {
  useRemote: boolean
  httpUrl: string
  wsUrl: string
}

function readEnv(): SignalConfig {
  const explicit = import.meta.env.VITE_USE_REMOTE_SIGNAL
  let useRemote: boolean
  if (explicit === 'true') useRemote = true
  else if (explicit === 'false') useRemote = false
  else {
    // No explicit override → default to local mock in dev, remote in prod.
    useRemote = !import.meta.env.DEV
  }
  const httpUrl =
    (import.meta.env.VITE_SIGNAL_HTTP_URL as string | undefined) ??
    'https://signal.fb.app'
  const wsUrl =
    (import.meta.env.VITE_SIGNAL_WS_URL as string | undefined) ??
    'wss://signal.fb.app/ws'
  return { useRemote, httpUrl, wsUrl }
}

export const signalConfig: SignalConfig = readEnv()
