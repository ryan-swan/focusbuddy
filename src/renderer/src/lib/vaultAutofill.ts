import type { VaultEntryStored, VaultSecret } from '@shared/types'

// Injected into the webview's renderer process. We use React-compatible setters
// (the native value descriptor) so sites built with React still recognise the
// change events and accept the autofilled credentials.
// Exported so the unit suite can verify selector ordering + injection safety
// without spinning up a webview.
export function buildAutofillScript(username: string, password: string): string {
  // JSON.stringify guarantees the strings are safe to embed — quotes, backslashes,
  // and newlines all get escaped properly.
  const u = JSON.stringify(username ?? '')
  const p = JSON.stringify(password ?? '')
  return `
(() => {
  try {
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
 * missing, or the page has no recognisable username/password fields — we never
 * want autofill to throw a visible error.
 *
 * Returns true if at least one field was filled.
 */
export async function autofillWebview(
  webview: HTMLElement | null,
  entry: VaultEntryStored | null
): Promise<boolean> {
  if (!webview || !entry) return false
  try {
    const unlocked = await window.api.vault.isUnlocked()
    if (!unlocked) return false
    const plaintext = await window.api.vault.decrypt(entry.iv, entry.ciphertext)
    if (!plaintext) return false
    const secret = JSON.parse(plaintext) as VaultSecret
    const username = entry.username ?? ''
    const password = secret.password ?? ''
    if (!username && !password) return false
    const script = buildAutofillScript(username, password)
    const result = await (
      webview as unknown as { executeJavaScript: (code: string) => Promise<unknown> }
    ).executeJavaScript(script)
    return Boolean(result)
  } catch {
    return false
  }
}
