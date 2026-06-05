# FocusBuddy — Market-Readiness Roadmap

**From:** 38/100 (not shippable as a paid product) · **To:** an elite, market-ready "next big thing"
**Companion to:** [SYSTEM-REVIEW-2026-06](./SYSTEM-REVIEW-2026-06.md) · [BROWSER-ADR-001](./BROWSER-ADR-001-in-canvas-browser.md)
**Updated:** 2026-06-05

---

## The sequence is the strategy

You cannot make a product elite before it is safe to trust, and you cannot sell it before it is a business. The order below is deliberate — it is **leverage-first and dependency-correct**. Each wave is a gate.

```
  Wave 0  ✅ DONE      Quick wins (security + browser + data) — shipped & proven this session
  Wave 1  ▢ SAFE       Close the RCE/injection holes · sign+notarize · durable data · vault re-key
  Wave 2  ▢ SELLABLE   Server-enforced gating · metered hosted-AI wedge · in-app billing
  Wave 3  ▢ ELITE      Browser phases 2-4 · fix+harden AI · canvas nav+undo · perf · onboarding
  Wave 4  ▢ MOAT       ADHD insight loop · native browser + vetted extensions
```

> **Cut-line for "can charge money safely":** end of Wave 2. Everything before it is non-negotiable for a paid launch; Wave 3-4 is what makes it *win*.

---

## Wave 0 — Quick wins ✅ (done & proven this session)

Six fixes, implemented and verified GREEN (`haptyx-tester`: 66/66 unit + 18/18 e2e). See [SYSTEM-REVIEW §0](./SYSTEM-REVIEW-2026-06.md#0--what-was-fixed-and-proven-in-this-session).

1. Clean desktop-Chrome **User-Agent** on webview sessions — the #1 cause of broken logins.
2. **Origin-gated vault autofill** — closes a confirmed credential-exfiltration hole.
3. **Overlay first-click** no longer eats the click / yanks the camera.
4. **Permission denylist** (geolocation/HID/serial/USB/MIDI) on all sessions.
5. **Command-injection fix** in `localApps.ts` (`execFile` arg-arrays).
6. **Sticky/Note unmount-flush** — closes deterministic text loss.

---

## Wave 1 — Make it SAFE  *(security + data; ~3-4 weeks)*

> No paid launch until this wave is complete. Each item is a launch-blocker on its own.

### 1. Close the remaining code/command-execution paths  · `S (2-4d)`
- **Gate `run-shell` in main, not the renderer.** `streamdeckActions.ts:366` runs arbitrary shell with no main-side check (the "confirm" doesn't even exist in code). Either **remove** `run-shell`, or put it behind a main-process **allowlist + a setting that defaults OFF**, so an imported template / shared deck / AI proposal can't silently persist a shell action. *(This is a product decision — don't silently disable a feature a user may rely on; surface the choice.)*
- Audit every path that can *create* a `run-shell` action (templates, shares, AI) for an auto-execute vector.
- **Done when:** no renderer-originated input reaches a shell without a main-process allowlist; a test proves an imported shell action does not auto-run.
- *(The `localApps` injection half of this priority shipped in Wave 0.)*

### 2. Trustworthy distribution: sign, notarize, fuse  · `M (~1 week, mostly cert procurement)`
- Apple **Developer ID** signing + **notarization** (`mac.identity`, `hardenedRuntime:true`, `mac.notarize:true`, entitlements plist preserving camera/mic); remove the ad-hoc `build/adhoc-sign.cjs` hook **after** Developer-ID signing works (sequence carefully — removing it while misconfigured yields a "damaged" app).
- Add **`@electron/fuses`**: disable `RUN_AS_NODE`, enable ASAR integrity validation, disable Node CLI inspect.
- **Harden the release path BEFORE the first signed release** (branch protection + required review on `saasmouth/focusbuddy` publish, scoped token, tag-gated CI release instead of local `dist:release`) — otherwise the very release that fixes this could be the poisoned one.
- Interim only (does *not* close the hole): set `autoInstallOnAppQuit=false` + `autoDownload=false`.
- **Done when:** a notarized build installs without Gatekeeper warnings and electron-updater verifies publisher provenance.

### 3. Make data durable  · `M (1-1.5w)`
- **Automatic versioned local backups** via `better-sqlite3`'s native `db.backup()` on launch (rolling retention, keep N) + a one-click **restore** + full **JSON export/import**.
- **`PRAGMA user_version` migration framework** with a downgrade guard (baseline existing field DBs at `user_version=0` = "schema already applied via `ensureColumn`").
- Fix `acceptShare` to use `ON CONFLICT(token)` (`shares.ts:146`) so share re-delivery doesn't throw; add file-blob GC.
- **Done when:** a user can restore yesterday's workspace, export/import round-trips, and a corrupt write is survivable.

### 4. Vault rotation + recovery clarity  · `S-M (3-5d)`
- Implement the referenced-but-missing `changeMasterPassword(current,new)` (`vault.ts`): in **one atomic transaction**, re-encrypt every entry under a fresh key with fresh IVs + re-derive salt/verifier; zero the old key. Wire IPC → preload → store → a "Change master password" control in `VaultView`.
- Fix the dead JSDoc at `vault.ts:107`.
- **Keep** the zero-knowledge "forgotten = unrecoverable" model (it's intentional and disclosed) — do **not** add a disk-stored recovery code without an explicit product decision; that would silently break the guarantee.
- **Done when:** a user who knows their password can rotate it; the comment no longer references a non-existent API.

### 5. IPC hardening  · *(folds into #2/#1)*  · `M`
- Runtime **zod** validation on the ~130-handler IPC boundary; `setPermissionRequestHandler` allowlist (tighten the Wave-0 denylist to per-origin); `will-navigate` pinning on the main window; justify or remove `sandbox:false`; validate the `haptyx://` auth token's origin/signature (`authProtocol.ts`).

---

## Wave 2 — Make it SELLABLE  *(monetization; ~4-6 weeks)*

> The business doesn't close until this wave does. You currently give the whole product away.

### 6. Server-enforced gating + un-farmable trial  · `M (1-1.5w)`
- A `requireCapability(req,reply,key)` helper in `focusbuddy-signal/src/server.ts` that 403s paid routes (`/share`, `/inbox/add`) — these currently take paid actions with no check, and `/share` needs no session at all.
- **Architectural reality:** local widgets never touch the server, so widget-kind gating can only ever be client-side (a user can patch the bundle). Don't pretend otherwise — make the **monetizable wedge a server-mediated feature** (Wave 2 #7), and bring the right-click "Add object" menu to *parity* with `WidgetPalette`'s client gate (`Canvas.tsx:872-884`) so it's at least consistent.
- Trial abuse: email verification + signup rate-limit (`@fastify/rate-limit` / Cloudflare) before granting the 14-day `team` trial.
- **Done when:** a free account is 403'd on paid server actions, and a new email can't trivially mint unlimited trials.

### 7. The monetization spine  · `L (2-3w)`
- **Metered hosted-AI proxy** as the Pro/Team wedge: the server holds the Anthropic key, meters tokens, enforces tier. This simultaneously (a) creates a real server-enforced paywall, (b) removes the dead-on-arrival first-run AI experience (no BYO key required), and (c) makes Pro worth paying for. *Highest-leverage single move in the roadmap.*
- **In-app billing self-service** wired to the existing Stripe scaffold: checkout, portal, invoices, seats, annual. The desktop currently has no pay path at all (`accountClient.ts:88-92` omits `plan`).
- Cost caps + usage transparency for BYO-key users.
- **Done when:** a user can upgrade, pay, and use hosted AI without leaving the app, and AI cost is bounded.

---

## Wave 3 — Make it ELITE  *(the headline experience; ~8-12 weeks)*

### 8. Fix & harden the AI layer  · `L (2-3w)`
- **Route `ROUTER_SYSTEM` correctly** — stop filtering `system` messages (`anthropic.ts:502-503`); the flagship command bar is silently dead today.
- Actually **spawn** the prepared `add-objects` instead of `alert`-and-discard (`AICommandBar.tsx:211`).
- Migrate to **native Anthropic tool-use** (strict `input_schema` + `tool_choice`) replacing the hand-rolled regex parsers; add **prompt caching** (~80-90% cost cut on hot paths); handle `stop_reason:'max_tokens'`; stream the chat path.
- **Confirm + undo on destructive applies** (`actionExecutor.ts:218`) — today AI delete is one irreversible tap.
- Add tests for every parser (currently zero).

### 9. Canvas navigation + editing layer  · `L (2-4w)`  *(the operator's explicit asks)*
- **Click-drag / space-drag / middle-mouse pan** (`Canvas.tsx:1579` add `onPointerDown`; wire the placebo ZoomControls pan-tool to a real mode) + momentum.
- **Marquee multi-select** + group move / align / distribute / delete.
- **Global undo/redo command history** (move/resize/delete/duplicate/link/membership + AI applies) — the safety net that makes the whole app forgiving.
- Snap-to-grid + alignment guides; a camera-synced grid; replace native `confirm()`/`alert()` with a themeable toast/confirm system.

### 10. Performance pass  · `M (1-1.5w)`
- `React.memo` + `useShallow` on the widget path; **viewport culling**; **off-screen webview suspension**; stop remounting *all* widgets on `layoutVersion` (`Canvas.tsx:1614`); z-index normalization; **`backgroundThrottling:false`** so focus timers stay accurate.
- Needed before live browser widgets scale to 50+.

### 11. Onboarding + coherence  · `L (2-3w)`
- First-run **welcome → interactive tour/coachmarks → pre-populated sample workspace → API-key step**; bespoke empty states.
- One **Cmd+K palette** registering *every* action + a `?` shortcut cheatsheet.
- **Single brand source-of-truth** + a CI guard against "Haptyx" leaks; real version badge (kill hardcoded `2.0`); consistent privacy copy; remove orphaned dead features + the changelog advertising removed ones; a Terms acceptance gate.

### Browser Phases 2-4  · *(see [BROWSER-ADR-001](./BROWSER-ADR-001-in-canvas-browser.md))*
- **Phase 2** `L (1-2w)`: external-browser **OAuth handoff** for providers that block embedded browsers regardless of UA.
- **Phase 3** `L (3-4w)`: native **`WebContentsView`** in the expand/focus surface + `session.loadExtension` for a **vetted shelf** (ad-block, Dark Reader).
- **Phase 4** `XL (4-6w, spike first)`: hybrid screenshot-at-rest + expand-to-native so the canvas stays fluid *and* the active widget is a real, extensible browser.

---

## Wave 4 — Make it the NEXT BIG THING  *(the moat; ~6-8 weeks)*

### 12. Deepen the ADHD moat  · `L (3-4w)`
- Resurrect the **captured-but-unused** engagement/energy data into a **post-session insight loop** ("here's when your brain actually showed up") and a **"what should I do right now given my state"** suggestion. The data and math already exist in the DB — the loop is just never closed.
- **Adaptive personalization**: learn each user's focus-run / drift cadence instead of hard-coded 90/5/3-min constants.
- Reliability primitives for peer body-double (scheduled slots, no-show handling, post-session reflection) to match Focusmate/Flow Club.
- Coachmarks for the moat features; tests for the engagement/drift/guardian logic.
- *This is the durable differentiation that makes FocusBuddy more than another canvas tool — but it only pays off once the product is safe (W1), sellable (W2), and discoverable (W3).*

### 13. Native browser + extensions (Browser Phase 3-4)  · already scheduled in Wave 3/ADR.

---

## At a glance

| Wave | Theme | Effort | Gate |
|---|---|---|---|
| 0 ✅ | Quick wins | done | logins work for most; criticals #2/#4-class closed |
| 1 | Safe | ~3-4w | **no paid launch before this** |
| 2 | Sellable | ~4-6w | **cut-line: can charge money** |
| 3 | Elite | ~8-12w | wins on experience |
| 4 | Moat | ~6-8w | the next big thing |

**Recommended immediate next step:** Wave 1 #1 (gate `run-shell`) + #2 (signing/notarization — start the cert procurement now, since it has lead time). Both are launch-blockers with the longest tail.
