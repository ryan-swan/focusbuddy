import type { VaultEntryStored, VaultSecret } from '@shared/types'

// ── Host matching (origin gate) ───────────────────────────────────────────
// Strip a leading www. and compare. A live host matches the bound host when it
// is the same host OR a subdomain of it (so a Connected App bound to
// `google.com` still auto-fills on `accounts.google.com`). Fails CLOSED: any
// uncertainty returns false so we never inject into the wrong origin.
function normHost(h: string): string {
  return h.trim().toLowerCase().replace(/^www\./, '')
}
function hostOfUrl(u: string): string {
  try {
    return normHost(new URL(u).hostname)
  } catch {
    return ''
  }
}
export function hostMatches(liveHost: string, boundHost: string): boolean {
  const live = normHost(liveHost)
  const bound = normHost(boundHost)
  if (!live || !bound) return false
  return live === bound || live.endsWith('.' + bound)
}

// Injected into the webview's renderer process. We use React-compatible setters
// (the native value descriptor) so sites built with React still recognise the
// change events and accept the autofilled credentials.
// Exported so the unit suite can verify selector ordering + injection safety
// without spinning up a webview.
//
// `expectedHost` (optional) adds an IN-PAGE origin guard as defence-in-depth:
// even if the live URL read in the main world raced a redirect, the script
// re-checks `location.hostname` in the webview's own context and bails on a
// mismatch BEFORE touching any field.
export function buildAutofillScript(
  username: string,
  password: string,
  expectedHost?: string
): string {
  // JSON.stringify guarantees the strings are safe to embed — quotes, backslashes,
  // and newlines all get escaped properly.
  const u = JSON.stringify(username ?? '')
  const p = JSON.stringify(password ?? '')
  const exp = JSON.stringify(expectedHost ?? '')
  return `
(() => {
  try {
    const __expected = ${exp};
    if (__expected) {
      const __h = (location.hostname || '').toLowerCase().replace(/^www\\./, '');
      const __e = __expected.toLowerCase().replace(/^www\\./, '');
      // Origin gate: only fill on the bound host or a subdomain of it.
      if (__h !== __e && !__h.endsWith('.' + __e)) return false;
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    function set(el, val) {
      if (!el || el.value) return false;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const userSelectors = [
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[type="email"]',
      'input[name*="email" i]',
      'input[name*="user" i]',
      'input[id*="email" i]',
      'input[id*="user" i]'
    ];
    const passSelectors = [
      'input[autocomplete="current-password"]',
      'input[autocomplete="password"]',
      'input[type="password"]'
    ];
    let userEl = null, passEl = null;
    for (const sel of userSelectors) {
      userEl = document.querySelector(sel);
      if (userEl) break;
    }
    for (const sel of passSelectors) {
      passEl = document.querySelector(sel);
      if (passEl) break;
    }
    const username = ${u};
    const password = ${p};
    let touched = false;
    if (userEl && username) touched = set(userEl, username) || touched;
    if (passEl && password) touched = set(passEl, password) || touched;
    return touched;
  } catch (e) {
    return false;
  }
})();
`
}

/**
 * Decrypt a vault entry's secret blob via the main process and inject it into
 * the webview's login form. Bails silently if the vault is locked, the entry is
 * missing, the page has no recognisable username/password fields, OR — most
 * importantly — the page's live origin does not match `expectedHost`.
 *
 * SECURITY (origin gate): `expectedHost` is the hostname of the Connected App
 * the vault entry is bound to. A bound browser widget navigates organically and
 * persists redirect targets, so without this gate a redirect / in-widget link
 * to a hostile origin showing a blank login form would receive the real
 * decrypted credentials. We therefore compare the webview's CURRENT url to the
 * bound host and refuse to inject on any mismatch. Fails closed.
 *
 * Returns true if at least one field was filled.
 */
export async function autofillWebview(
  webview: HTMLElement | null,
  entry: VaultEntryStored | null,
  expectedHost: string
): Promise<boolean> {
  if (!webview || !entry || !expectedHost) return false
  try {
    // Origin gate FIRST — before we even decrypt the secret.
    const liveUrl =
      (webview as unknown as { getURL?: () => string }).getURL?.() ?? ''
    const liveHost = hostOfUrl(liveUrl)
    if (!hostMatches(liveHost, expectedHost)) return false

    const unlocked = await window.api.vault.isUnlocked()
    if (!unlocked) return false
    const plaintext = await window.api.vault.decrypt(entry.iv, entry.ciphertext)
    if (!plaintext) return false
    const secret = JSON.parse(plaintext) as VaultSecret
    const username = entry.username ?? ''
    const password = secret.password ?? ''
    if (!username && !password) return false
    const script = buildAutofillScript(username, password, normHost(expectedHost))
    const result = await (
      webview as unknown as { executeJavaScript: (code: string) => Promise<unknown> }
    ).executeJavaScript(script)
    return Boolean(result)
  } catch {
    return false
  }
}
