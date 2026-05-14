# IT Audit — Login-stuck fix (commit 98c1821)

Scope: `js/app.js` (bootApp/init), `js/auth.js` (login handler), `js/store.js` (init/syncClock).

## Severity 1 — max 2

**S1-A. Realtime subscription leaks on timeout retry.** `Store.init()` (store.js:182–210) does a 9-query `Promise.all`, then assigns `_cache.*`, then calls `subscribeRealtime()`. If the 10s race in app.js:154 rejects mid-flight, the original `Promise.all` keeps running in the background; when it eventually resolves, its continuation still runs `_cache = …` and **`subscribeRealtime()` again on the next successful bootApp**. Result: duplicate `gc-sync` channels, double re-renders on every postgres change, and stale cache writes from the late batch overwriting the fresh one. No tear-down of the prior in-flight init exists.

**S1-B. Late `SIGNED_IN` after 8s auth timeout silently re-boots.** In auth.js:49–60, the 8s `Promise.race` rejects and the button is reset, but the underlying `signInWithPassword` network call is NOT aborted. If it resolves seconds later, `onAuthStateChange` fires `SIGNED_IN` (app.js:202) → `bootApp()` runs unannounced while user is staring at the re-enabled login form. No toast, no UI signal — the navbar just appears.

## Severity 2 — max 3

**S2-A. `INITIAL_SESSION` comment is load-bearing but fragile.** app.js:206 intentionally ignores `INITIAL_SESSION` to avoid double-boot with the `getSession()` path at line 217. Supabase JS v2 fires `INITIAL_SESSION` even with no session — fine today, but any SDK upgrade that re-orders events could regress to double-boot. The `if (booted) return;` guard at app.js:147 catches it, but only because JS is single-threaded; nothing structurally prevents the race.

**S2-B. Boot error toast can be missed.** app.js:182–186 schedules the toast 100ms after `renderLogin()`. `renderLogin` is synchronous DOM replacement, so 100ms is generous — but on a slow device the user may already be retyping into the email field when the toast lands and steals attention with no focus retention.

**S2-C. `_clockOffset` stays at 0 on first-load clock-sync failure.** syncClock is now fire-and-forget (app.js:160). If the very first `server_now` RPC fails, `_clockOffset` remains 0 and `GC.Store.now()` returns local device time for the entire session — affecting session start/end timestamps. visibilitychange retries only on tab-refocus. No periodic retry. Low likelihood but session billing depends on this.

## Severity 3 — max 3

**S3-A. 12s safety net check is text-equality (auth.js:75).** `stillStuck.textContent === '登录中...'`. If i18n or any future copy edit changes that string, the safety net silently no-ops. Should compare on a data attribute or `disabled` state instead.

**S3-B. `booted` not reset when `Store.init()` throws inside the try (non-timeout path).** Actually verified — app.js:178 does `booted = false`. Fine. But there is no resilience if `GC.Auth.showNavbar()` or `bindNav()` throws (app.js:173–175) — those run after `booted=true` and are not wrapped. Toast would fire but realtime sub from store.init already attached.

**S3-C. No `aria-live` on `#login-error`.** Screen readers won't announce the "登录成功但初始化卡住" message from the 12s net.

## Verdict

Fix is directionally correct and resolves the headline symptom, but S1-A (duplicate realtime channel on retry) and S1-B (silent late SIGNED_IN) are real race conditions worth a follow-up before declaring solid.
