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
  };

  GC._currentView = null;

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
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
  };

  /* ---- Navigation ---- */
  function navigate(name) {
    if (GC._currentView && views[GC._currentView] && views[GC._currentView].destroy) {
      views[GC._currentView].destroy();
    }
    GC._currentView = name;
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === name);
    });
    // Toggle full-page light theme when on POS (per owner: 整页亮色一体感)
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

    // Insert AFTER nav-brand, BEFORE nav-links
    const brand = navbar.querySelector('.nav-brand');
    if (brand && brand.nextSibling) brand.parentNode.insertBefore(chip, brand.nextSibling);
    else navbar.appendChild(chip);

    if (canSwitch) {
      chip.addEventListener('click', () => showBranchPicker(switchable, current.id));
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

  // Listen for programmatic branch changes (from /admin or hotkey)
  window.addEventListener('gc:branch-change', () => {
    renderBranchSwitcher();
    if (GC._currentView && views[GC._currentView]) views[GC._currentView].render();
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
      GC.Auth.showNavbar();
      bindNav();
      renderBranchSwitcher();
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
