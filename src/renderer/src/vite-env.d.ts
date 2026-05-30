/// <reference types="vite/client" />

// Project-specific env vars surfaced via import.meta.env.* — extends
// vite/client's ImportMetaEnv so the renderer code gets typed values.
interface ImportMetaEnv {
  // Optional toggle that overrides the dev/prod default for the
  // signaling backend. "true" forces RemoteMatcher; "false" forces
  // LocalMockMatcher. Anything else (incl. unset) falls back to
  // !import.meta.env.DEV.
  readonly VITE_USE_REMOTE_SIGNAL?: 'true' | 'false'
  // Origins for the hosted signaling service when running against a
  // real backend. Defaults to https://signal.fb.app + wss://signal.fb.app/ws.
  readonly VITE_SIGNAL_HTTP_URL?: string
  readonly VITE_SIGNAL_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
