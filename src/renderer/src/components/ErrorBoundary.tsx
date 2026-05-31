import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

// Top-level error boundary. Without one, any thrown error in any
// component cascades to React's root and unmounts the whole tree —
// the user sees a blank screen with no way to recover except a hard
// refresh, which is exactly what we want to prevent.
//
// This boundary catches the error, logs the full stack to the dev
// console (for our diagnostics) and renders a calm recovery surface
// with three exits: "Reset" (re-mount the app), "Reload" (full page
// reload), and copy-the-error-to-clipboard so the user can paste it
// back to us. Stays valid in both light/dark/futuristic themes.
//
// Because this is a class component (React only catches via class
// boundaries), it's the only class component in the codebase. Don't
// try to convert it to a hook — there is no hook equivalent.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info })
  }

  reset = (): void => {
    this.setState({ error: null, info: null })
  }

  reload = (): void => {
    window.location.reload()
  }

  copyDetails = async (): Promise<void> => {
    const { error, info } = this.state
    if (!error) return
    const text = [
      `Error: ${error.message}`,
      '',
      'Stack:',
      error.stack || '(none)',
      '',
      'Component stack:',
      info?.componentStack || '(none)'
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-[#060816]">
        <div
          className="max-w-lg w-full rounded-2xl p-6 space-y-4"
          style={{
            background: 'rgba(16, 24, 39, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow:
              '0 0 0 1px rgba(139, 92, 246, 0.18), 0 24px 64px -12px rgba(139, 92, 246, 0.25), 0 16px 48px -16px rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(30px) saturate(160%)',
            WebkitBackdropFilter: 'blur(30px) saturate(160%)'
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl inline-flex items-center justify-center text-[20px]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(244, 114, 182, 0.25), rgba(244, 114, 182, 0.10))',
                color: 'rgb(251, 207, 232)'
              }}
            >
              !
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold text-stone-100">
                Something broke in the UI
              </h2>
              <p className="text-[12px] text-stone-400">
                Your data is safe. We caught the error so you don't lose
                your workspace state.
              </p>
            </div>
          </div>
          <div
            className="rounded-lg p-3 text-[12px] font-mono text-stone-300 max-h-40 overflow-y-auto whitespace-pre-wrap"
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            {this.state.error.message}
            {this.state.info?.componentStack && (
              <>
                <div className="mt-2 text-stone-500 text-[10px]">
                  Component stack:
                </div>
                <div className="text-[10px] text-stone-500">
                  {this.state.info.componentStack
                    .split('\n')
                    .slice(0, 6)
                    .join('\n')}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => void this.copyDetails()}
              className="text-[12px] px-3 py-1.5 rounded-md text-stone-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Copy the full error + stack to clipboard"
            >
              Copy details
            </button>
            <button
              onClick={this.reset}
              className="text-[12px] px-3 py-1.5 rounded-md text-stone-200 hover:text-white border border-white/[0.08] hover:border-white/[0.16] transition-colors"
              title="Try again without reloading"
            >
              Reset UI
            </button>
            <button
              onClick={this.reload}
              className="text-[12px] px-3 py-1.5 rounded-md font-medium text-white"
              style={{
                background:
                  'linear-gradient(180deg, rgba(139, 92, 246, 0.95), rgba(124, 58, 237, 0.95))',
                boxShadow:
                  'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 8px 24px -8px rgba(139, 92, 246, 0.4)'
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
