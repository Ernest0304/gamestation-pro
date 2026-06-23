/**
 * Auth — Login / Logout UI
 */
window.GC = window.GC || {};

GC.Auth = (function () {

  function renderLogin() {
    document.querySelector('.navbar').style.display = 'none';
    // Login screen is always dark-themed. Clear pos-mode (set while the POS
    // view was active) so the form text/inputs don't inherit the light POS
    // overrides → would render dark-on-dark + unreadable "欢迎回来".
    document.body.classList.remove('pos-mode');
    // Remove the realtime status badge if it lingers from a live logout.
    const rtBadge = document.getElementById('realtime-status-badge');
    if (rtBadge) rtBadge.remove();
    document.getElementById('main-content').innerHTML = `
      <div class="login-split">
        <div class="login-brand-panel">
          <div class="login-brand-inner">
            <div class="login-logo-chip">
              <img src="/img/logo.svg" alt="郁香潭 Yuu Xiang Dam">
            </div>
            <h1 class="login-wordmark-zh">郁香潭</h1>
            <p class="login-wordmark-en">YUU XIANG DAM</p>
            <p class="login-tagline">点单 · 收银 · 游戏台计费一体化系统</p>
            <ul class="login-features">
              <li><i class="ti ti-device-ipad-horizontal" aria-hidden="true"></i> 多店多机实时同步</li>
              <li><i class="ti ti-device-gamepad-2" aria-hidden="true"></i> 游戏台计时计费</li>
              <li><i class="ti ti-report-money" aria-hidden="true"></i> 日结报表与对账</li>
            </ul>
          </div>
          <div class="login-brand-footer">郁香潭 POS · Kallang &amp; Geylang</div>
        </div>
        <div class="login-form-panel">
          <div class="login-form-wrap">
            <h2 class="login-form-title">欢迎回来</h2>
            <p class="login-form-sub">登录以继续 / Sign in to continue</p>
            <form id="login-form">
              <div class="form-group">
                <label class="form-label">邮箱 / Email</label>
                <input type="email" id="login-email" class="form-input login-input" placeholder="name@example.com" required autofocus>
              </div>
              <div class="form-group">
                <label class="form-label">密码 / Password</label>
                <input type="password" id="login-password" class="form-input login-input" placeholder="••••••••" required>
              </div>
              <div id="login-error" class="login-error" style="display:none"></div>
              <button type="submit" class="login-submit" id="login-btn">登录 / Sign in</button>
            </form>
          </div>
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
      logoutBtn.addEventListener('click', async () => {
        // Mark this as user-initiated so app.js doesn't show a 'session expired' toast.
        GC._userInitiatedLogout = true;
        await GC.supabase.auth.signOut();
      });
      // Mobile (≤640px): mount on <body> so CSS position:fixed lifts it
      // to a top-right floating button (matches branch chip behavior).
      // Desktop: mount inside navbar's nav-links so it sits at the right end.
      const isMobile = window.matchMedia('(max-width: 640px)').matches;
      if (isMobile) {
        document.body.appendChild(logoutBtn);
      } else {
        logoutBtn.style.marginLeft = '12px';
        nav.querySelector('.nav-links').appendChild(logoutBtn);
      }
    }
  }

  return { renderLogin, showNavbar };
})();
