// Single source of truth for "which signaling backend are we using right
// now" and "where does it live". Read from Vite-injected env vars so the
// app can be built with different backends without touching code.
//
// Default behaviour:
//  - Dev (npm run dev) → useRemote = TRUE pointing at localhost:8787.
//    Run `cd projects/focusbuddy-signal && npm run dev` in another
//    terminal to spin up the server. Account login + share + inbox sync
//    all hit the real server. Body double matching also uses the real
//    WebSocket. This is what we want by default — local-mock-only mode
//    was a quick prototyping shortcut and made login impossible.
//  - Prod (electron-vite build) → useRemote = TRUE pointing at the
//    public host (set via env at build time).
//
// Override at any time with:
//    VITE_USE_REMOTE_SIGNAL=true|false
//    VITE_SIGNAL_HTTP_URL=https://api.focusbuddy.app
//    VITE_SIGNAL_WS_URL=wss://api.focusbuddy.app/ws
//
// To get the pure-local-mock behaviour back (no server required,
// LocalMockMatcher pairs windows via BroadcastChannel, ShareService is
// null) set VITE_USE_REMOTE_SIGNAL=false.

interface SignalConfig {
  useRemote: boolean
  httpUrl: string
  wsUrl: string
}

const LOCAL_HTTP = 'http://localhost:8787'
const LOCAL_WS = 'ws://localhost:8787/ws'
const PROD_HTTP = 'https://api.focusbuddy.app'
const PROD_WS = 'wss://api.focusbuddy.app/ws'

function readEnv(): SignalConfig {
  const explicit = import.meta.env.VITE_USE_REMOTE_SIGNAL
  let useRemote: boolean
  if (explicit === 'true') useRemote = true
  else if (explicit === 'false') useRemote = false
  else {
    // No explicit override → use the real server in BOTH dev and prod.
    // The dev server runs on localhost:8787; the prod server runs on
    // whatever VITE_SIGNAL_HTTP_URL points at when the app is built.
    useRemote = true
  }
  // Pick the default URL based on dev vs prod. An explicit
  // VITE_SIGNAL_HTTP_URL overrides either default.
  const defaultHttp = import.meta.env.DEV ? LOCAL_HTTP : PROD_HTTP
  const defaultWs = import.meta.env.DEV ? LOCAL_WS : PROD_WS
  const httpUrl =
    (import.meta.env.VITE_SIGNAL_HTTP_URL as string | undefined) ?? defaultHttp
  const wsUrl =
    (import.meta.env.VITE_SIGNAL_WS_URL as string | undefined) ?? defaultWs
  return { useRemote, httpUrl, wsUrl }
}

export const signalConfig: SignalConfig = readEnv()
