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
      await GC.Store.init();
      // Sync client clock with server once on boot; resync on tab refocus
      await GC.Store.syncClock();
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) GC.Store.syncClock();
      });
      // Request browser notification permission ONCE on first user click (not on every warning)
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
    }
  }

  function showLogin() {
    booted = false;
    GC._currentView = null;
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.remove();
    GC.Auth.renderLogin();
  }

  /* ---- Init ---- */
  async function init() {
    // Listen for auth changes (handles login/logout after initial load)
    GC.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await bootApp();
      } else if (event === 'SIGNED_OUT') {
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
