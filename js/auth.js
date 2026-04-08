/**
 * Auth — Login / Logout UI
 */
window.GC = window.GC || {};

GC.Auth = (function () {

  function renderLogin() {
    document.querySelector('.navbar').style.display = 'none';
    document.getElementById('main-content').innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="36" height="36">
              <line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line>
              <circle cx="15" cy="13" r="1"></circle><circle cx="18" cy="11" r="1"></circle>
              <rect x="2" y="6" width="20" height="12" rx="3"></rect>
            </svg>
            <h1>Game<span class="brand-accent">Station</span> Pro</h1>
            <p class="login-subtitle">电竞甜品店计费系统</p>
          </div>
          <form id="login-form">
            <div class="form-group">
              <label class="form-label">邮箱</label>
              <input type="email" id="login-email" class="form-input" placeholder="输入邮箱地址" required autofocus>
            </div>
            <div class="form-group">
              <label class="form-label">密码</label>
              <input type="password" id="login-password" class="form-input" placeholder="输入密码" required>
            </div>
            <div id="login-error" class="login-error" style="display:none"></div>
            <button type="submit" class="btn btn-primary btn-block" id="login-btn">登录</button>
          </form>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorEl = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');

      btn.disabled = true;
      btn.textContent = '登录中...';
      errorEl.style.display = 'none';

      const { error } = await GC.supabase.auth.signInWithPassword({ email, password });

      if (error) {
        errorEl.textContent = error.message === 'Invalid login credentials'
          ? '邮箱或密码错误' : error.message;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }
      // Auth state change listener in app.js handles the rest
    });
  }

  function showNavbar(user) {
    const nav = document.querySelector('.navbar');
    nav.style.display = 'flex';

    // Add logout button if not already present
    if (!document.getElementById('logout-btn')) {
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'logout-btn';
      logoutBtn.className = 'btn btn-ghost btn-sm';
      logoutBtn.textContent = '退出';
      logoutBtn.style.marginLeft = '12px';
      logoutBtn.addEventListener('click', async () => {
        await GC.supabase.auth.signOut();
      });
      nav.querySelector('.nav-links').appendChild(logoutBtn);
    }
  }

  return { renderLogin, showNavbar };
})();
