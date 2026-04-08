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
  async function bootApp() {
    await GC.Store.init();
    GC.Auth.showNavbar();
    bindNav();
    navigate('dashboard');
  }

  /* ---- Init ---- */
  async function init() {
    // Listen for auth changes
    GC.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await bootApp();
      } else if (event === 'SIGNED_OUT') {
        GC._currentView = null;
        // Remove logout button so it's re-created on next login
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.remove();
        GC.Auth.renderLogin();
      }
    });

    // Check existing session
    const { data: { session } } = await GC.supabase.auth.getSession();
    if (session) {
      await bootApp();
    } else {
      GC.Auth.renderLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
