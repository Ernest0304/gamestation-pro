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
  async function init() {
    // Listen for auth changes (handles login/logout after initial load)
    GC.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // If the user already gave up on a stuck login (8s+ since they clicked),
        // surface that the late success actually arrived rather than silently
        // booting the dashboard.
        const elapsed = GC._authAttemptStart ? Date.now() - GC._authAttemptStart : 0;
        if (elapsed > 8000 && !booted) {
          GC.toast?.(`登录成功（网络较慢，${Math.round(elapsed/1000)}秒）/ Logged in (slow network)`, 'success');
        }
        GC._authAttemptStart = null;
        await bootApp();
      } else if (event === 'SIGNED_OUT') {
        GC._authAttemptStart = null;
        // Tear down realtime channels + cached data so the next login starts
        // clean (prevents "cannot add postgres_changes after subscribe" errors)
        if (GC.Store && GC.Store.resetForLogout) GC.Store.resetForLogout();
        showLogin();
      } else if (event === 'INITIAL_SESSION') {
        // Handled below by getSession — ignore here to avoid double-boot
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
