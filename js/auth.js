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
            <img src="/img/logo.svg" alt="郁香潭 Yuu Xiang Dam" style="width:120px;height:120px;margin-bottom:6px;filter:drop-shadow(0 4px 12px rgba(122,8,24,0.3))">
            <p class="login-subtitle">点单 · 收银 · 游戏台 计费系统</p>
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

      // Mark attempt time so app.js can detect late SIGNED_IN after our timeout fires
      if (GC._lastAuthAttempt) GC._lastAuthAttempt();

      // Wrap signInWithPassword in a hard 8s timeout — if Supabase auth network
      // request stalls (we've seen this in some preview environments / weak wifi),
      // we want to re-enable the button so the user can retry instead of staring
      // at "登录中..." forever.
      let result;
      try {
        const authPromise = GC.supabase.auth.signInWithPassword({ email, password });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('登录请求超时 (8s) — 网络可能不稳定，请重试')), 8000)
        );
        result = await Promise.race([authPromise, timeoutPromise]);
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }

      if (result && result.error) {
        errorEl.textContent = result.error.message === 'Invalid login credentials'
          ? '邮箱或密码错误' : result.error.message;
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }

      // Auth succeeded. Add a safety net: if app.js bootApp doesn't render
      // within 12 seconds, reset the button so user can retry.
      setTimeout(() => {
        const stillStuck = document.getElementById('login-btn');
        if (stillStuck && stillStuck.textContent === '登录中...') {
          stillStuck.disabled = false;
          stillStuck.textContent = '登录';
          errorEl.textContent = '登录成功但初始化卡住，请重试 / Init stuck, retry';
          errorEl.style.display = 'block';
        }
      }, 12000);
      // Auth state change listener in app.js handles the rest of the boot
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
