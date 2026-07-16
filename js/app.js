/**
 * App — Auth flow, router, initialization
 */
window.GC = window.GC || {};

(function () {
  const views = {
    pos: GC.POS,
    dashboard: GC.Dashboard,
    orders: GC.Orders,
    menu: GC.Menu,
    history: GC.History,
    members: GC.Members,
    settings: GC.Settings,
    admin: GC.Admin,
  };

  GC._currentView = null;
  GC._myRole = null;   // resolved at boot — 'owner' | 'manager' | 'cashier'

  /* ---- HTML escape (prevents XSS via member.name, guest_name, etc) ---- */
  const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  GC.esc = function (s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => _escMap[c]);
  };

  /* ---- Styled confirm dialog (replaces native confirm()) ---- */
  GC.confirm = function (message, options) {
    options = options || {};
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      const title = options.title || '确认 / Confirm';
      const confirmText = options.confirmText || '确认 / OK';
      const cancelText = options.cancelText || '取消 / Cancel';
      const variant = options.danger ? 'btn-danger' : 'btn-primary';
      // Convert newlines to <br>, escape user content
      const safeMsg = GC.esc(message).replace(/\n/g, '<br>');
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-confirm">
            <div class="modal-header"><h3>${GC.esc(title)}</h3></div>
            <div class="modal-body"><div class="confirm-message">${safeMsg}</div></div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="gc-cancel">${GC.esc(cancelText)}</button>
              <button class="btn ${variant}" id="gc-ok">${GC.esc(confirmText)}</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');
      const done = (val) => {
        modal.classList.remove('show'); modal.innerHTML = ''; resolve(val);
      };
      document.getElementById('gc-ok').onclick = () => done(true);
      document.getElementById('gc-cancel').onclick = () => done(false);
      // ESC to cancel
      const onKey = (e) => {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); done(false); }
        if (e.key === 'Enter') { document.removeEventListener('keydown', onKey); done(true); }
      };
      document.addEventListener('keydown', onKey);
    });
  };

  /* ---- Styled prompt dialog (replaces native prompt()) ---- */
  GC.prompt = function (message, options) {
    options = options || {};
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      const title = options.title || '请输入 / Input';
      const placeholder = options.placeholder || '';
      const defaultValue = options.defaultValue || '';
      const inputType = options.type || 'text';
      const safeMsg = GC.esc(message).replace(/\n/g, '<br>');
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-confirm">
            <div class="modal-header"><h3>${GC.esc(title)}</h3></div>
            <div class="modal-body">
              <div class="confirm-message" style="margin-bottom:14px">${safeMsg}</div>
              <input type="${inputType}" id="gc-prompt-input" class="form-input"
                placeholder="${GC.esc(placeholder)}" value="${GC.esc(defaultValue)}" autofocus>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="gc-cancel">取消 / Cancel</button>
              <button class="btn btn-primary" id="gc-ok">确认 / OK</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');
      const done = (val) => {
        modal.classList.remove('show'); modal.innerHTML = ''; resolve(val);
      };
      const input = document.getElementById('gc-prompt-input');
      input.focus();
      input.select();
      document.getElementById('gc-ok').onclick = () => done(input.value);
      document.getElementById('gc-cancel').onclick = () => done(null);
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter') done(input.value);
      });
    });
  };

  /* ---- Toast ---- */
  GC.toast = function (msg, type) {
    type = type || 'success';
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    // Leading status icon panel + message (pro-grade — was bare text + stripe)
    const icon = ({ success: 'ti-circle-check', error: 'ti-alert-circle', info: 'ti-info-circle' })[type] || 'ti-circle-check';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.innerHTML = `<i class="ti ${icon}" aria-hidden="true"></i>`;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-msg';
    msgSpan.textContent = msg;
    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    container.appendChild(el);
    setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); }, 2600);
  };

  /* ---- Manager PIN gate (Tier 0.5, 2026-06-23) ----
     Interim control until per-staff accounts (Tier A1): sensitive actions
     (void, large discounts) prompt for a shared manager PIN stored as a
     sha256 hex in settings.manager_pin. NULL/unset → gate is disabled, so
     staff aren't locked out before the owner sets a PIN in 设置.
     Static markup + GC.esc'd label — XSS-safe (house pattern). */
  GC.sha256Hex = async function (str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };
  // Peppered PIN hash (Finance audit 2026-07-03): a bare sha256 of a 4-8
  // digit PIN is a trivially brute-forceable table. The pepper doesn't make
  // it cryptographically strong — the real control is Tier A1 server-side
  // roles — but it defeats casual rainbow lookups of the cached hash.
  GC.pinHash = function (pin) { return GC.sha256Hex('yxd-pin-v1|' + pin); };

  // Failed-attempt lockout: 3 wrong PINs → 30s cooldown on this device.
  let _pinFails = 0;
  let _pinLockUntil = 0;

  GC.requireManagerPin = function (actionLabel) {
    return new Promise(resolve => {
      const settings = GC.Store.getSettings && GC.Store.getSettings();
      const pinHash = settings && settings.managerPin;
      if (!pinHash) { resolve(true); return; }   // gate disabled until PIN set
      if (Date.now() < _pinLockUntil) {
        const secs = Math.ceil((_pinLockUntil - Date.now()) / 1000);
        if (GC.toast) GC.toast(`PIN 已锁定，${secs} 秒后重试 / PIN locked`, 'error');
        resolve(false); return;
      }

      const modal = document.getElementById('modal');
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content" style="max-width:360px">
            <div class="modal-header">
              <h3><i class="ti ti-lock"></i> 经理授权 / Manager PIN</h3>
              <button class="modal-close" id="pin-close">&times;</button>
            </div>
            <div class="modal-body">
              <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:12px">
                ${GC.esc(actionLabel || '此操作')} 需要经理 PIN 授权
              </p>
              <input type="password" id="pin-input" class="form-input" inputmode="numeric"
                autocomplete="off" placeholder="••••" maxlength="8"
                style="font-size:1.4rem;text-align:center;letter-spacing:0.4em">
              <div id="pin-error" class="login-error" style="display:none;margin-top:10px">PIN 错误 / Wrong PIN</div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="pin-cancel">取消 / Cancel</button>
              <button class="btn btn-primary" id="pin-ok">确认 / Confirm</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');
      const input = document.getElementById('pin-input');
      const close = (ok) => { modal.classList.remove('show'); modal.innerHTML = ''; resolve(ok); };
      document.getElementById('pin-close').onclick = () => close(false);
      document.getElementById('pin-cancel').onclick = () => close(false);
      const verify = async () => {
        const hash = await GC.pinHash(input.value.trim());
        if (hash === pinHash) { _pinFails = 0; close(true); return; }
        _pinFails++;
        if (_pinFails >= 3) {
          _pinFails = 0;
          _pinLockUntil = Date.now() + 30000;
          close(false);
          if (GC.toast) GC.toast('连续 3 次错误 — PIN 锁定 30 秒 / Locked 30s', 'error');
          return;
        }
        document.getElementById('pin-error').style.display = 'block';
        input.value = '';
        input.focus();
      };
      document.getElementById('pin-ok').onclick = verify;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
      setTimeout(() => input.focus(), 60);
    });
  };

  /* ---- Navigation ---- */
  function navigate(name) {
    // Admin console is owner-only — bounce non-owners back to POS.
    if (name === 'admin' && GC._myRole !== 'owner') {
      if (GC.toast) GC.toast('仅限管理员 / Owner only', 'error');
      name = 'pos';
    }
    if (GC._currentView && views[GC._currentView] && views[GC._currentView].destroy) {
      views[GC._currentView].destroy();
    }
    GC._currentView = name;
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === name);
    });
    // Toggle full-page light theme when on POS (per owner: 整页亮色一体感).
    // Admin is its own dark pro theme — never pos-mode.
    document.body.classList.toggle('pos-mode', name === 'pos');
    if (views[name]) views[name].render();
  }

  function bindNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.view);
      });
    });
  }

  // Owner-only "后台 / Admin" nav entry — injected after login so cashiers
  // never see it. Appended to the end of nav-links.
  function injectAdminNav() {
    if (GC._myRole !== 'owner') return;
    if (document.querySelector('.nav-link[data-view="admin"]')) return;
    const links = document.querySelector('.nav-links');
    if (!links) return;
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'nav-link nav-link-admin';
    a.dataset.view = 'admin';
    a.innerHTML = '<span class="nav-cn"><i class="ti ti-layout-dashboard"></i> 后台</span><small class="nav-en">Admin</small>';
    a.addEventListener('click', e => { e.preventDefault(); navigate('admin'); });
    links.appendChild(a);
  }

  /* ---- Branch switcher (Migration 009, Wave C.1) ----
     Injects a chip into the navbar showing the current branch. Owner can
     click to switch; cashier sees their branch locked. Re-renders the
     current view on switch so menu/orders/etc. reflect the new branch.
  */
  // Re-entrancy token so two concurrent calls (e.g. event listener + direct
  // call after a branch switch) can't both append a chip — last call wins.
  let _branchSwitcherToken = 0;
  async function renderBranchSwitcher() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    const myToken = ++_branchSwitcherToken;

    // Remove ALL existing chips (defensive: use class, not id, so duplicates
    // from prior races also get cleaned up).
    document.querySelectorAll('.branch-switcher').forEach(el => el.remove());

    const branches = GC.Store.getBranches();
    if (!branches || branches.length === 0) return;

    const myRole = await GC.Store.getMyRole();
    const myAccessibleIds = await GC.Store.getMyAccessibleBranchIds();
    const isOwner = myRole === 'owner';
    // Cashier/manager can only switch among their assigned branches; owner sees all
    const switchable = isOwner ? branches : branches.filter(b => myAccessibleIds.includes(b.id));
    const canSwitch = switchable.length > 1;
    const current = GC.Store.getCurrentBranch();
    if (!current) return;

    const chip = document.createElement('div');
    chip.id = 'branch-switcher';
    chip.className = 'branch-switcher' + (canSwitch ? ' clickable' : '');
    chip.innerHTML = `
      <span class="branch-icon">🏪</span>
      <span class="branch-name">${GC.esc ? GC.esc(current.nameZh) : current.nameZh}</span>
      ${canSwitch ? '<span class="branch-caret">▾</span>' : '<span class="branch-locked">🔒</span>'}
      ${!current.active ? '<span class="branch-inactive-tag">未启用</span>' : ''}
    `;

    // Insert location depends on viewport:
    // - Desktop (>640px): inside navbar between brand and links (inline)
    // - Mobile (≤640px): direct child of <body> so position:fixed in CSS
    //   escapes any containing block (backdrop-filter on the bottom navbar
    //   was trapping the chip). z-index keeps it above main content.
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (isMobile) {
      document.body.appendChild(chip);
    } else {
      const brand = navbar.querySelector('.nav-brand');
      if (brand && brand.nextSibling) brand.parentNode.insertBefore(chip, brand.nextSibling);
      else navbar.appendChild(chip);
    }

    if (canSwitch) {
      chip.addEventListener('click', () => showBranchPicker(switchable, current.id));
    }

    // Hide 游戏台 nav tab on non-gaming branches (Geylang).
    // Also redirect away from that view if user is currently on it.
    const gamingTab = document.querySelector('.nav-link[data-view="dashboard"]');
    if (gamingTab) {
      gamingTab.style.display = current.hasGaming ? '' : 'none';
      if (!current.hasGaming && GC._currentView === 'dashboard') {
        navigate('pos');
      }
    }
  }

  function showBranchPicker(branches, currentId) {
    const modal = document.getElementById('modal');
    const items = branches.map(b => `
      <button class="branch-pick-item ${b.id === currentId ? 'current' : ''} ${!b.active ? 'inactive' : ''}"
              data-branch="${b.id}">
        <div class="branch-pick-main">
          <span class="branch-pick-icon">🏪</span>
          <div>
            <div class="branch-pick-name-zh">${GC.esc(b.nameZh)}</div>
            <div class="branch-pick-name-en">${GC.esc(b.nameEn)}${b.address ? ' · ' + GC.esc(b.address) : ''}</div>
          </div>
        </div>
        <div class="branch-pick-tags">
          ${b.hasGaming ? '<span class="branch-pick-tag gaming">🎮</span>' : ''}
          ${!b.active ? '<span class="branch-pick-tag inactive">未启用</span>' : ''}
          ${b.id === currentId ? '<span class="branch-pick-tag current">当前</span>' : ''}
        </div>
      </button>
    `).join('');

    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>🏪 选择分店 / Switch Branch</h3>
            <button class="modal-close" id="bp-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="branch-pick-list">${items}</div>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('bp-close').onclick = close;
    modal.querySelectorAll('[data-branch]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.branch;
        if (id !== currentId) {
          // setCurrentBranchId fires 'gc:branch-change' which the global
          // listener catches → renderBranchSwitcher + view re-render.
          // Don't call them directly here (was duplicating chip in nav).
          GC.Store.setCurrentBranchId(id);
          if (GC.toast) GC.toast('已切换分店 / Branch switched', 'success');
        }
        close();
      });
    });
  }

  // Re-place the logout button between body (mobile floating) and the
  // navbar (desktop inline) depending on viewport. Without this, a logout
  // button mounted in body during a mobile-sized devtools simulation
  // stays there when the viewport grows → ends up at bottom of page.
  function placeLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) return;
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (isMobile) {
      if (logoutBtn.parentNode !== document.body) {
        logoutBtn.style.marginLeft = '';
        document.body.appendChild(logoutBtn);
      }
    } else {
      const navLinks = document.querySelector('.nav-links');
      if (navLinks && logoutBtn.parentNode !== navLinks) {
        logoutBtn.style.marginLeft = '12px';
        navLinks.appendChild(logoutBtn);
      }
    }
  }

  // Listen for programmatic branch changes (from /admin or hotkey)
  window.addEventListener('gc:branch-change', () => {
    renderBranchSwitcher();
    if (GC._currentView && views[GC._currentView]) views[GC._currentView].render();
  });

  /* ---- Realtime status badge (Ernest 2026-05-14) ----
     Shows a small dot on the navbar ONLY when realtime is in a degraded
     state (not subscribed / errored). When healthy, hidden — no UI noise.
     User sees it and knows "live sync may be slow, polling is still active". */
  function renderRealtimeStatus(detail) {
    let badge = document.getElementById('realtime-status-badge');
    // Never show the status badge pre-login — a SIGNED_OUT triggers a realtime
    // CLOSED event that would otherwise paint an "error" badge on the login screen.
    if (!GC._currentView || document.querySelector('.login-split') || document.querySelector('.login-page')) {
      if (badge) badge.remove();
      return;
    }
    const status = (detail && detail.status) || (GC.Store.getRealtimeStatus && GC.Store.getRealtimeStatus());
    const healthy = status === 'SUBSCRIBED';
    if (healthy) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'realtime-status-badge';
      badge.className = 'realtime-status-badge';
      document.body.appendChild(badge);
    }
    const labels = {
      INIT: '⏳ 连接中…',
      CONNECTING: '⏳ 连接中…',
      JOINING: '⏳ 连接中…',
      CHANNEL_ERROR: '🔴 实时同步中断（每 15 秒轮询备份）',
      TIMED_OUT: '🔴 实时同步超时（每 15 秒轮询备份）',
      CLOSED: '🔴 实时同步断开',
    };
    badge.textContent = labels[status] || `⚠️ ${status}`;
    badge.classList.toggle('error', /ERROR|TIMED_OUT|CLOSED/.test(status));
  }
  window.addEventListener('gc:realtime-status', (e) => renderRealtimeStatus(e.detail));

  /* ---- Offline guard (Tier 0.6, 2026-07-03) ----
     Every write goes to Supabase, so taking a payment while offline means
     a "completed" checkout that never reached the DB. When the browser
     reports offline: show a red top banner and disable the checkout/pay
     controls until connectivity returns. */
  function renderOfflineState() {
    const offline = !navigator.onLine;
    let banner = document.getElementById('offline-banner');
    if (offline && !banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.innerHTML = '<i class="ti ti-wifi-off" aria-hidden="true"></i> 网络已断开 — 收银暂停，恢复网络后自动解锁 / Offline — checkout paused';
      document.body.appendChild(banner);
    } else if (!offline && banner) {
      banner.remove();
      if (GC.toast) GC.toast('网络已恢复 / Back online', 'success');
    }
    // Money-taking controls are blocked purely via CSS (body.is-offline
    // pointer-events) — never touch .disabled here, or we'd re-enable
    // buttons the views disabled for their own reasons (e.g. empty cart).
    document.body.classList.toggle('is-offline', offline);
  }
  window.addEventListener('online', renderOfflineState);
  window.addEventListener('offline', renderOfflineState);

  // Re-evaluate floating-vs-inline placement on viewport resize / orientation
  // change. Handles devtools device-mode swapping AND real device rotation.
  // Debounced so we don't thrash during drag-resize.
  let _resizePlacementTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizePlacementTimer);
    _resizePlacementTimer = setTimeout(() => {
      renderBranchSwitcher();
      placeLogoutButton();
    }, 120);
  });

  /* ---- App boot ---- */
  let booted = false;

  async function bootApp() {
    if (booted) return;
    booted = true;
    try {
      // HARD timeout: if Store.init() (9 parallel DB queries) hasn't completed
      // in 10s, abort so the user is dropped back to login instead of staring
      // at "登录中..." forever. Previous symptom: stuck login until manual refresh.
      const initPromise = GC.Store.init();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Init timed out (10s) — slow network or DB')), 10000)
      );
      await Promise.race([initPromise, timeoutPromise]);

      // syncClock is fire-and-forget — don't block boot on it
      GC.Store.syncClock().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) GC.Store.syncClock().catch(() => {});
      });

      // Notification permission requested on first click, not at boot
      if ('Notification' in window && Notification.permission === 'default') {
        const onceClick = () => {
          Notification.requestPermission().catch(() => {});
          document.removeEventListener('click', onceClick);
        };
        document.addEventListener('click', onceClick);
      }
      // Resolve role once so navigate()/nav can sync-check owner status.
      GC._myRole = await GC.Store.getMyRole().catch(() => null);
      GC.Auth.showNavbar();
      bindNav();
      renderBranchSwitcher();
      injectAdminNav();
      navigate('pos');
    } catch (e) {
      console.error('Boot failed:', e);
      booted = false;
      GC.Auth.renderLogin();
      // Surface the failure to the user with a toast so they don't think it just hung silently.
      // Wait a tick so the login form is in the DOM before the toast renders on top.
      setTimeout(() => {
        if (GC.toast) {
          GC.toast(`登录后初始化失败 / Init failed: ${e.message}. 请重试。`, 'error');
        }
      }, 100);
    }
  }

  function showLogin() {
    booted = false;
    GC._currentView = null;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.remove();
    const branchChip = document.getElementById('branch-switcher');
    if (branchChip) branchChip.remove();
    GC.Auth.renderLogin();
  }

  /* ---- Auth attempt tracking ---- */
  // Used to detect late SIGNED_IN events that arrive AFTER the 8s auth timeout
  // already fired (per IT audit S1-B — late events were silently auto-booting).
  GC._authAttemptStart = null;
  GC._lastAuthAttempt = function () {
    GC._authAttemptStart = Date.now();
  };

  /* ---- Init ---- */
  // Track whether the user explicitly clicked the logout button. If SIGNED_OUT
  // fires WITHOUT a click, it's session expiry / refresh failure — different UX.
  GC._userInitiatedLogout = false;

  async function init() {
    // Listen for auth changes (handles login/logout after initial load)
    GC.supabase.auth.onAuthStateChange(async (event, session) => {
      // Diagnostic: log every auth event so we can debug auto-logout reports.
      // Open DevTools Console to see these.
      console.log('[Auth]', event, session ? `(uid: ${session.user?.id?.slice(0,8)}...)` : '(no session)');

      if (event === 'SIGNED_IN' && session) {
        const elapsed = GC._authAttemptStart ? Date.now() - GC._authAttemptStart : 0;
        if (elapsed > 8000 && !booted) {
          GC.toast?.(`登录成功（网络较慢，${Math.round(elapsed/1000)}秒）/ Logged in (slow network)`, 'success');
        }
        GC._authAttemptStart = null;
        await bootApp();
      } else if (event === 'TOKEN_REFRESHED') {
        // Access token was auto-refreshed using refresh token — no UI change needed.
        // Just acknowledge so console shows the system is working.
        console.log('[Auth] Token refreshed silently — session continuing');
      } else if (event === 'USER_UPDATED') {
        // User metadata changed — usually irrelevant for us
        console.log('[Auth] User updated');
      } else if (event === 'SIGNED_OUT') {
        GC._authAttemptStart = null;
        if (GC.Store && GC.Store.resetForLogout) GC.Store.resetForLogout();
        // If the user DIDN'T click logout, this is session expiry — tell them
        // instead of silently dropping back to login.
        if (!GC._userInitiatedLogout) {
          setTimeout(() => {
            GC.toast?.('登录会话过期，请重新登录 / Session expired, please log in again', 'error');
          }, 200);
        }
        GC._userInitiatedLogout = false;  // reset for next time
        showLogin();
      } else if (event === 'INITIAL_SESSION') {
        // If there's no session, the getSession() path below will showLogin().
        // If there IS a session, SIGNED_IN doesn't fire — INITIAL_SESSION is
        // our only signal. Treat it as a login if booted is still false.
        if (session && !booted) {
          console.log('[Auth] Restoring session from storage');
          await bootApp();
        }
      }
    });

    // Check existing session with 6s timeout to avoid forever loading
    try {
      const sessionPromise = GC.supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('auth timeout')), 6000)
      );
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      if (session) {
        await bootApp();
      } else {
        showLogin();
      }
    } catch (e) {
      console.error('Auth check failed:', e);
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
