// Unit-test harness setup, loaded via vitest.config.ts `setupFiles`.
//
// vitest's happy-dom environment leaves the global `localStorage` as a bare
// object with no Storage methods on it (clear / getItem / setItem / removeItem
// all resolve to undefined), so any test that resets state with
// `localStorage.clear()` throws "localStorage.clear is not a function". That is
// what was failing the theme-persistence and Plexii hub-navigation specs (and
// turning CI red). Install a spec-compliant in-memory Storage on the global (and
// on window, so code that reads either sees the same instance) whenever the
// environment did not provide a working one. Runs once per test file, since
// vitest gives each file its own environment.

function makeMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length(): number {
      return Object.keys(store).length
    },
    clear(): void {
      store = {}
    },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null
    },
    removeItem(key: string): void {
      delete store[key]
    },
    setItem(key: string, value: string): void {
      store[key] = String(value)
    }
  } as Storage
}

if (typeof globalThis.localStorage?.clear !== 'function') {
  const ls = makeMemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true })
  const win = (globalThis as { window?: unknown }).window
  if (win && typeof win === 'object') {
    Object.defineProperty(win, 'localStorage', { value: ls, configurable: true, writable: true })
  }
}
