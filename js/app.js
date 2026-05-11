/**
 * App — Auth flow, router, initialization
 */
window.GC = window.GC || {};

(function () {
  const views = {
    dashboard: GC.Dashboard,
    history: GC.History,
    members: GC.Members,
    settings: GC.Settings,
  };

  GC._currentView = null;

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
      GC.Auth.showNavbar();
      bindNav();
      navigate('dashboard');
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
