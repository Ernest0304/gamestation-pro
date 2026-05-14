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
