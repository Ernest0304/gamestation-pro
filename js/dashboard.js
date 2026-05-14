/**
 * Dashboard — Multi-player station cards with per-player timers
 *
 * Each station can have up to N players (settings.maxPlayersPerStation).
 * Each player is a separate `sessions` row with its own start_time.
 *
 * Walk-in: pre-paid hours, hourly block billing, no proration.
 * Member: prorated, balance-based, no upfront payment.
 *
 * Warnings:
 * - Walk-in: alert when paid_minutes - elapsed_minutes <= warnMinutes
 * - Member: alert when estimated balance run-out is <= warnMinutes
 */
window.GC = window.GC || {};

GC.Dashboard = (function () {
  let timerInterval = null;
  // Persist warned IDs across reloads so re-firing doesn't spam after F5
  const _WARNED_KEY = 'gc_warned_sessions_v1';
  function _loadWarned() {
    try { return new Set(JSON.parse(localStorage.getItem(_WARNED_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function _saveWarned() {
    try { localStorage.setItem(_WARNED_KEY, JSON.stringify([..._warned])); } catch {}
  }
  const _warned = _loadWarned();
  // Convenience: use clock-synced time everywhere
  const now = () => (GC.Store && GC.Store.now ? GC.Store.now() : Date.now());

  /* ---- Format helpers ---- */
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); }

  function tierIcon(tier) {
    return ({ platinum: '💎', silver: '🥈', regular: '👤' })[tier] || '👤';
  }

  function tierLabel(tier) {
    return ({ platinum: 'Platinum', silver: 'Silver', regular: 'Regular' })[tier] || '';
  }

  function todayRevenue() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return GC.Store.getSessions()
      .filter(s => s.status === 'completed' && s.endTime >= d.getTime())
      .reduce((sum, s) => sum + s.total, 0)
      .toFixed(2);
  }

  function todaySessions() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return GC.Store.getSessions().filter(s => s.status === 'completed' && s.endTime >= d.getTime()).length;
  }

  /* ---- Sound alert ---- */
  let _audioCtx = null;
  function playAlertSound() {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = _audioCtx;
      // iOS suspends AudioContext when page is hidden — resume() on each play
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      // Three quick beeps
      [0, 0.18, 0.36].forEach(t => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.17);
      });
    } catch (e) {
      console.warn('Audio alert failed:', e);
    }
  }

  function notifyWarn(title, body) {
    // Browser notification (only if already granted — app.js requests on first click)
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/manifest.json' }); } catch {}
    }
    // Flash document title to catch staff attention even if app not in foreground
    const orig = document.title;
    let n = 0;
    const flash = setInterval(() => {
      document.title = n++ % 2 ? `🔴 ${title}` : orig;
      if (n > 10) { clearInterval(flash); document.title = orig; }
    }, 700);
    playAlertSound();
  }

  /* ---- Warning logic ---- */
  function checkWarnings() {
    const settings = GC.Store.getSettings();
    if (!settings) return;
    const warnMs = settings.warnMinutes * 60000;
    const tNow = now();

    GC.Store.getActiveSessions().forEach(s => {
      if (_warned.has(s.id)) return;

      if (s.memberId == null) {
        // Walk-in: warn when paid time has warnMs or less remaining
        if (!s.expectedEndTime) return;
        const remaining = s.expectedEndTime - tNow;
        if (remaining <= warnMs && remaining > 0) {
          _warned.add(s.id); _saveWarned();
          const name = s.guestName || `${s.stationName} 散客`;
          notifyWarn(
            `⏰ 即将结束 / Time Almost Up`,
            `${name} 还剩 ${Math.ceil(remaining / 60000)} 分钟。请询问是否加时。`
          );
        } else if (remaining <= 0) {
          // Already past — show "time up" warning once
          if (!_warned.has(s.id + '_up')) {
            _warned.add(s.id + '_up'); _saveWarned();
            notifyWarn(
              `🔴 时间已到 / Time Up`,
              `${name} 的预付时间已结束。请关桌或加时。`
            );
          }
        }
      } else {
        // Member: warn when estimated balance covers <= warnMinutes more play
        const m = GC.Store.getMember(s.memberId);
        if (!m) return;
        const { rate } = GC.Store.getRateFor(s.stationType, s.memberId);
        if (rate <= 0) return;
        const elapsedMin = (tNow - s.startTime) / 60000;
        const elapsedCost = (elapsedMin / 60) * rate;
        const balanceLeft = m.balance - elapsedCost;
        const minutesLeft = (balanceLeft / rate) * 60;
        if (minutesLeft <= settings.warnMinutes && minutesLeft > 0) {
          _warned.add(s.id); _saveWarned();
          notifyWarn(
            `💰 余额不足 / Low Balance`,
            `${m.name} 余额仅够再玩约 ${Math.ceil(minutesLeft)} 分钟。请询问是否充值。`
          );
        } else if (balanceLeft <= 0 && !_warned.has(s.id + '_zero')) {
          _warned.add(s.id + '_zero'); _saveWarned();
          notifyWarn(
            `🛑 余额耗尽 / Balance Depleted`,
            `${m.name} 余额已用完。请充值或关桌。`
          );
        }
      }
    });

    // Remove warned IDs for sessions that are no longer active
    const activeIds = new Set(GC.Store.getActiveSessions().map(s => s.id));
    let pruned = false;
    for (const id of [..._warned]) {
      const baseId = id.replace(/_(up|zero)$/, '');
      if (!activeIds.has(baseId)) { _warned.delete(id); pruned = true; }
    }
    if (pruned) _saveWarned();
  }

  /* ---- Render ---- */
  function render() {
    // Migration 009: filter to current branch's stations.
    // Geylang has no stations seeded → empty array → renders friendly empty state.
    const currentBranchId = GC.Store.getCurrentBranchId
      ? GC.Store.getCurrentBranchId() : null;
    const allStations = GC.Store.getStations();
    const stations = currentBranchId
      ? allStations.filter(s => s.branchId === currentBranchId)
      : allStations;
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const activeCount = stations.filter(s => s.status === 'active').length;

    let html = '';

    // Promo banner
    if (settings.promoActive) {
      html += `
        <div class="promo-banner">
          <div class="promo-banner-glow"></div>
          <div class="promo-banner-content">
            <div class="promo-banner-tag">LIMITED TIME · 限时</div>
            <div class="promo-banner-title">🎮 开业促销 / Opening Promo</div>
            <div class="promo-banner-rates">
              <span><strong>Switch 2</strong> ${sym}${settings.rates.promo['Switch 2']}<small>/h</small></span>
              <span class="promo-banner-divider"></span>
              <span><strong>PS5</strong> ${sym}${settings.rates.promo['PS5']}<small>/h</small></span>
            </div>
          </div>
        </div>`;
    }

    html += `
      <div class="stats-bar">
        <div class="stat-card"><span class="stat-label">使用中 / Active</span><span class="stat-value cyan">${activeCount}</span></div>
        <div class="stat-card"><span class="stat-label">空闲 / Idle</span><span class="stat-value muted">${stations.length - activeCount}</span></div>
        <div class="stat-card"><span class="stat-label">今日订单 / Sessions</span><span class="stat-value muted">${todaySessions()}</span></div>
        <div class="stat-card"><span class="stat-label">今日收入 / Revenue</span><span class="stat-value green">${sym}${todayRevenue()}</span></div>
      </div>
      <div class="stations-grid">`;

    stations.forEach(st => {
      const players = GC.Store.getActiveSessionsForStation(st.id);
      const on = players.length > 0;
      const typeClass = st.type === 'PS5' ? 'ps5' : 'switch';
      const { rate, rateTier, regularRate } = GC.Store.getRateFor(st.type, null);
      const maxPlayers = settings.maxPlayersPerStation;
      const canAdd = players.length < maxPlayers;

      let rateBadge = '';
      if (rateTier === 'promo') rateBadge = `<span class="rate-promo-tag">PROMO</span>`;

      html += `
        <div class="station-card ${on ? 'active' : 'idle'} ${typeClass}">
          <div class="station-header">
            <div class="station-info">
              <span class="type-badge ${typeClass}">${st.type}</span>
              <h3 class="station-name">${st.name}</h3>
            </div>
            <span class="status-dot ${on ? 'active' : 'idle'}">${on ? `${players.length}/${maxPlayers} 玩家` : '空闲 Idle'}</span>
          </div>`;

      if (!on) {
        // Idle state
        html += `
          <div class="station-body">
            <div class="idle-display">
              <div class="idle-icon">${st.type === 'PS5' ? '🎮' : '🕹️'}</div>
              <div class="idle-rate">
                ${rateTier === 'promo' ? `<span class="rate-original-strike">${sym}${regularRate}</span> ` : ''}<strong>${sym}${rate}</strong><small>/小时 hr</small> ${rateBadge}
              </div>
            </div>
          </div>
          <div class="station-footer">
            <button class="btn btn-primary btn-block btn-start" data-id="${st.id}">开桌 / Open Table</button>
          </div>`;
      } else {
        // Active: render player list
        html += `<div class="players-list">`;
        players.forEach(p => {
          html += renderPlayerRow(p, sym, settings);
        });
        html += `</div>
          <div class="station-footer station-footer-multi">
            ${canAdd ? `<button class="btn btn-secondary btn-sm btn-add-player" data-id="${st.id}">+ 加人 / Add</button>` : ''}
          </div>`;
      }

      html += `</div>`;
    });

    html += '</div>';
    document.getElementById('main-content').innerHTML = html;
    bindEvents();
    startTimer();
  }

  function renderPlayerRow(p, sym, settings) {
    const isWalkIn = !p.memberId;
    const member = p.memberId ? GC.Store.getMember(p.memberId) : null;
    const tNow = now();
    const elapsedMs = tNow - p.startTime;

    let playerLabel, runningCost, timerHtml, warningClass = '', warningTag = '';

    if (isWalkIn) {
      // Walk-in: countdown from expected end
      const remaining = (p.expectedEndTime || tNow) - tNow;
      const totalPaid = p.paidMinutes;
      const isWarn = remaining <= settings.warnMinutes * 60000 && remaining > 0;
      const isOver = remaining <= 0;
      if (isWarn) warningClass = 'player-warn';
      if (isOver) { warningClass = 'player-over'; warningTag = '<span class="warning-tag">🔴 时间到 TIME UP</span>'; }
      else if (isWarn) warningTag = `<span class="warning-tag">${Math.ceil(remaining/60000)} 分钟剩余</span>`;

      const safeName = GC.esc(p.guestName || '散客');
      playerLabel = `${safeName} <small class="player-meta">${totalPaid/60}h 套餐 · ${sym}${p.total.toFixed(2)}</small>`;
      timerHtml = `<span class="player-timer ${isOver ? 'over' : ''}" data-session="${p.id}" data-mode="countdown" data-expected="${p.expectedEndTime}">${fmtClock(remaining)}</span>`;
      runningCost = '';
    } else {
      // Member: count-up, running cost from balance
      const { rate } = GC.Store.getRateFor(p.stationType, p.memberId);
      const elapsedCost = (elapsedMs / 3600000) * rate;
      const balanceAfter = Math.max(0, (member?.balance || 0) - elapsedCost);
      const warn = balanceAfter / rate * 60 <= settings.warnMinutes && balanceAfter > 0;
      const depleted = balanceAfter <= 0;
      if (warn) warningClass = 'player-warn';
      if (depleted) { warningClass = 'player-over'; warningTag = '<span class="warning-tag">🛑 余额耗尽 NO BALANCE</span>'; }
      else if (warn) warningTag = `<span class="warning-tag">余额 ${sym}${balanceAfter.toFixed(2)}</span>`;

      const safeMemberName = GC.esc(member?.name || '?');
      playerLabel = `${tierIcon(member?.tier)} ${safeMemberName} <small class="player-meta">${tierLabel(member?.tier)} · 余额 ${sym}${(member?.balance || 0).toFixed(2)}</small>`;
      timerHtml = `<span class="player-timer ${depleted ? 'over' : ''}" data-session="${p.id}" data-mode="countup" data-start="${p.startTime}">${fmtClock(elapsedMs)}</span>`;
      runningCost = `<span class="player-cost" data-session="${p.id}" data-rate="${rate}" data-start="${p.startTime}">${sym}${elapsedCost.toFixed(2)}</span>`;
    }

    return `
      <div class="player-row ${warningClass}">
        <div class="player-info">
          <div class="player-name-line">${playerLabel} ${warningTag}</div>
        </div>
        <div class="player-stats">
          ${timerHtml}
          ${runningCost}
        </div>
        <div class="player-actions">
          ${isWalkIn ? `<button class="btn-icon btn-extend" data-session="${p.id}" title="加 1 小时 / +1 Hour">+1h</button>` : ''}
          <button class="btn-icon btn-close-player" data-session="${p.id}" title="结账 / Close">✓</button>
        </div>
      </div>`;
  }

  /* ---- Timer ---- */
  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const settings = GC.Store.getSettings();
      const sym = settings?.currencySymbol || '$';
      const tNow = now();

      document.querySelectorAll('.player-timer').forEach(el => {
        const mode = el.dataset.mode;
        if (mode === 'countdown') {
          const expected = parseInt(el.dataset.expected);
          const remaining = expected - tNow;
          // When time is up, show overtime as red/blink, no clamp to 00:00
          if (remaining <= 0) {
            el.classList.add('over');
            el.textContent = '🔴 时间到';
          } else {
            el.textContent = fmtClock(remaining);
          }
        } else {
          const start = parseInt(el.dataset.start);
          el.textContent = fmtClock(tNow - start);
        }
      });

      document.querySelectorAll('.player-cost').forEach(el => {
        const start = parseInt(el.dataset.start);
        const rate = parseFloat(el.dataset.rate);
        if (!start || !rate) return;
        const cost = ((tNow - start) / 3600000) * rate;
        el.textContent = `${sym}${cost.toFixed(2)}`;
      });

      checkWarnings();
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  /* ---- Events ---- */
  function bindEvents() {
    document.querySelectorAll('.btn-start').forEach(b =>
      b.addEventListener('click', () => showOpenTableModal(parseInt(b.dataset.id))));
    document.querySelectorAll('.btn-add-player').forEach(b =>
      b.addEventListener('click', () => showOpenTableModal(parseInt(b.dataset.id))));
    document.querySelectorAll('.btn-close-player').forEach(b =>
      b.addEventListener('click', () => closePlayer(b.dataset.session)));
    document.querySelectorAll('.btn-extend').forEach(b =>
      b.addEventListener('click', () => extendWalkIn(b.dataset.session)));
  }

  /* ---- Open Table Modal ---- */
  function showOpenTableModal(stationId) {
    const st = GC.Store.getStation(stationId);
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const members = GC.Store.getMembers().filter(m => m.tier !== 'regular' || m.balance > 0);
    const { rate, rateTier } = GC.Store.getRateFor(st.type, null);

    const memberOptions = members.map(m => {
      const icon = tierIcon(m.tier);
      return `<option value="${m.id}">${icon} ${GC.esc(m.name)} · ${tierLabel(m.tier)} · 余额 ${sym}${m.balance.toFixed(2)}</option>`;
    }).join('');

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h3>开桌 / Open — ${st.name} (${st.type})</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="tab-bar">
              <button class="tab-btn active" data-tab="walkin">👤 散客 / Walk-in</button>
              <button class="tab-btn" data-tab="member">💎 会员 / Member</button>
            </div>

            <!-- Walk-in tab -->
            <div class="tab-pane active" data-pane="walkin">
              <div class="form-group">
                <label class="form-label">玩家名字 (选填) / Name (optional)</label>
                <input id="inp-guest-name" class="form-input" placeholder="例：A 先生">
              </div>
              <div class="form-group">
                <label class="form-label">预付小时 / Pre-paid Hours</label>
                <div class="hours-picker" id="hours-picker">
                  ${[1,2,3,4,5].map(h => `<button type="button" class="hour-btn ${h===1?'selected':''}" data-h="${h}">${h}h</button>`).join('')}
                </div>
                <div class="form-hint">最少 1 小时，整点收费，不退款 · Min 1h, hourly blocks, no refund</div>
              </div>
              <div class="walkin-summary">
                <div>费率 / Rate: <strong>${sym}${rate}/h</strong> ${rateTier === 'promo' ? '<span class="rate-promo-tag">PROMO</span>' : ''}</div>
                <div>预付金额 / Total: <strong class="total-amount" id="walkin-total">${sym}${rate.toFixed(2)}</strong></div>
              </div>
            </div>

            <!-- Member tab -->
            <div class="tab-pane" data-pane="member">
              <div class="form-group">
                <label class="form-label">选择会员 / Select Member</label>
                <select id="sel-member" class="form-input">
                  ${memberOptions || '<option value="">无可用会员 / No members available</option>'}
                </select>
              </div>
              <div class="member-summary" id="member-summary"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok">确认 / Confirm</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    let selectedHours = 1;
    let activeTab = 'walkin';

    const updateMemberSummary = () => {
      const mid = document.getElementById('sel-member').value;
      const summary = document.getElementById('member-summary');
      if (!mid) { summary.innerHTML = ''; return; }
      const m = GC.Store.getMember(mid);
      const { rate, rateTier } = GC.Store.getRateFor(st.type, mid);
      const estMinutes = rate > 0 ? Math.floor((m.balance / rate) * 60) : 0;
      summary.innerHTML = `
        <div class="member-summary-card">
          <div>当前余额 / Balance: <strong class="balance-amount">${sym}${m.balance.toFixed(2)}</strong></div>
          <div>会员费率 / Member Rate: <strong>${sym}${rate}/h</strong> ${rateTier === 'promo' ? '<span class="rate-promo-tag">PROMO</span>' : ''}</div>
          <div>余额可玩 / Time Left: <strong>${Math.floor(estMinutes/60)}h ${estMinutes%60}m</strong></div>
        </div>`;
    };

    const updateWalkinTotal = () => {
      document.getElementById('walkin-total').textContent = `${sym}${(rate * selectedHours).toFixed(2)}`;
    };

    // Tab switching
    modal.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        activeTab = b.dataset.tab;
        modal.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
        modal.querySelectorAll('.tab-pane').forEach(x => x.classList.toggle('active', x.dataset.pane === activeTab));
      });
    });

    // Hours buttons
    modal.querySelectorAll('.hour-btn').forEach(b => {
      b.addEventListener('click', () => {
        modal.querySelectorAll('.hour-btn').forEach(x => x.classList.toggle('selected', x === b));
        selectedHours = parseInt(b.dataset.h);
        updateWalkinTotal();
      });
    });

    document.getElementById('sel-member').addEventListener('change', updateMemberSummary);
    updateMemberSummary();

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async (e) => {
      const okBtn = e.currentTarget;
      if (okBtn.disabled) return;
      okBtn.disabled = true;  // prevent double-click race
      try {
        if (activeTab === 'walkin') {
          const guestName = document.getElementById('inp-guest-name').value.trim() || null;
          await GC.Store.openSession({
            stationId: st.id, stationName: st.name, stationType: st.type,
            memberId: null, guestName, hours: selectedHours,
          });
          GC.toast(`已开桌 / Opened — ${st.name} · ${sym}${(rate * selectedHours).toFixed(2)}`, 'success');
        } else {
          const mid = document.getElementById('sel-member').value;
          if (!mid) { GC.toast('请选择会员 / Please select a member', 'error'); okBtn.disabled = false; return; }
          const m = GC.Store.getMember(mid);
          if (m.balance <= 0) {
            const ok2 = await GC.confirm(
              `${m.name} 当前余额为 ${sym}0。\n仍然开桌吗？（需先充值）\n\nMember balance is ${sym}0. Open anyway? (Top-up needed)`,
              { title: '余额为 0 / Zero Balance', confirmText: '继续开桌 / Open Anyway' }
            );
            if (!ok2) { okBtn.disabled = false; return; }
          }
          await GC.Store.openSession({
            stationId: st.id, stationName: st.name, stationType: st.type,
            memberId: mid, hours: 0,
          });
          GC.toast(`已开桌 / Opened — ${st.name} · ${m.name}`, 'success');
        }
        close();
        render();
      } catch (e) {
        GC.toast('开桌失败 / Failed: ' + e.message, 'error');
        okBtn.disabled = false;
      }
    };
  }

  /* ---- Close player ---- */
  async function closePlayer(sessionId) {
    const session = GC.Store.getSessions().find(s => s.id === sessionId);
    if (!session) return;
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;

    if (session.memberId) {
      await showMemberCloseModal(session);
    } else {
      await showWalkInCloseModal(session);
    }
  }

  async function showWalkInCloseModal(session) {
    const sym = GC.Store.getSettings().currencySymbol;
    const tNow = now();
    const elapsedMs = tNow - session.startTime;
    const elapsedMin = elapsedMs / 60000;
    const remaining = (session.expectedEndTime || tNow) - tNow;
    const overtime = remaining < 0;
    const safeGuest = GC.esc(session.guestName || '散客');

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>结账 / Close — ${session.stationName}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settlement-details">
              <div class="settlement-row"><span>玩家 / Player</span><span>${safeGuest}</span></div>
              <div class="settlement-row"><span>预付 / Pre-paid</span><span>${session.paidMinutes/60}h · ${sym}${session.total.toFixed(2)}</span></div>
              <div class="settlement-row"><span>实际游玩 / Actual</span><span>${fmtClock(elapsedMs)}</span></div>
              ${overtime ? `<div class="settlement-row" style="color:var(--red)"><span>超时 / Overtime</span><span>${Math.ceil(-remaining/60000)} 分钟</span></div>` : ''}
              <div class="settlement-divider"></div>
              <div class="settlement-row total"><span>应收 / Total</span><span>${sym}${session.total.toFixed(2)}</span></div>
              <div class="form-hint" style="margin-top:8px">预付时间，不退款 · Pre-paid, no refund</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            ${overtime ? `<button class="btn btn-primary" id="m-extend">加 1 小时 / +1h</button>` : ''}
            <button class="btn btn-danger" id="m-close-now">确认结账 / Close</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    if (overtime) {
      document.getElementById('m-extend').onclick = async () => {
        await GC.Store.extendWalkIn(session.id, 1);
        close();
        render();
        GC.toast('已加 1 小时 / +1h added', 'success');
      };
    }
    document.getElementById('m-close-now').onclick = async () => {
      await GC.Store.closeSession(session.id);
      close();
      render();
      GC.toast(`已结账 / Closed — ${sym}${session.total.toFixed(2)}`, 'success');
    };
  }

  async function showMemberCloseModal(session) {
    const sym = GC.Store.getSettings().currencySymbol;
    const m = GC.Store.getMember(session.memberId);
    const elapsedMs = now() - session.startTime;
    const elapsedMin = elapsedMs / 60000;
    const bill = GC.Store.computeMemberBill(session.stationType, elapsedMin, session.memberId);
    const newBalance = Math.max(0, m.balance - bill.total);
    const safeName = GC.esc(m.name);

    let discountLabel = '';
    if (bill.rateTier === 'promo') discountLabel = `促销价 / Promo (${bill.discountPercent}% off)`;
    else if (bill.rateTier !== 'regular') discountLabel = `${tierLabel(bill.rateTier)} 会员价 (${bill.discountPercent}% off)`;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>结账 / Close — ${session.stationName}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settlement-details">
              <div class="settlement-row"><span>玩家 / Player</span><span>${tierIcon(m.tier)} ${safeName}</span></div>
              <div class="settlement-row"><span>开始 / Start</span><span>${fmtTime(session.startTime)}</span></div>
              <div class="settlement-row"><span>时长 / Duration</span><span>${fmtClock(elapsedMs)}</span></div>
              <div class="settlement-divider"></div>
              <div class="settlement-row"><span>原价 / Regular</span><span>${sym}${bill.regularRate}/h</span></div>
              ${bill.discountPercent > 0 ? `<div class="settlement-row"><span>实际费率 / Applied</span><span class="rate-applied">${sym}${bill.rate}/h</span></div>` : ''}
              <div class="settlement-row"><span>小计 / Subtotal</span><span>${sym}${bill.subtotal.toFixed(2)}</span></div>
              ${bill.discountPercent > 0 ? `<div class="settlement-row discount"><span>${discountLabel}</span><span>-${sym}${bill.discount.toFixed(2)}</span></div>` : ''}
              <div class="settlement-divider"></div>
              <div class="settlement-row total"><span>本次应收 / Total</span><span>${sym}${bill.total.toFixed(2)}</span></div>
              <div class="settlement-row" style="margin-top:6px"><span>余额 ${sym}${m.balance.toFixed(2)} → </span><span class="balance-after">${sym}${newBalance.toFixed(2)}</span></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-close-now">确认 / Confirm</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-close-now').onclick = async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;  // Ops fix: debounce
      try {
        const result = await GC.Store.closeSession(session.id);
        close();
        render();
        if (result && result.shortfall > 0) {
          // Ops critical: surface balance shortfall LOUDLY so cashier collects cash
          GC.toast(
            `⚠️ 余额不足 / Short — 需向客户多收 ${sym}${result.shortfall.toFixed(2)} 现金 / Collect ${sym}${result.shortfall.toFixed(2)} cash`,
            'error'
          );
        } else {
          GC.toast(`已结账 / Closed — ${sym}${bill.total.toFixed(2)}`, 'success');
        }
      } catch (err) {
        btn.disabled = false;
        GC.toast('结账失败 / Failed: ' + err.message, 'error');
      }
    };
  }

  /* ---- Extend walk-in (+1h) ---- */
  async function extendWalkIn(sessionId) {
    const sym = GC.Store.getSettings().currencySymbol;
    const session = GC.Store.getSessions().find(s => s.id === sessionId);
    if (!session) return;
    const { rate } = GC.Store.getRateFor(session.stationType, null);
    const okExt = await GC.confirm(
      `${session.guestName || '散客'} 加 1 小时\n费用 / Cost: ${sym}${rate.toFixed(2)}`,
      { title: '加时 / Extend +1h', confirmText: '加时 / Add 1h' }
    );
    if (!okExt) return;
    await GC.Store.extendWalkIn(sessionId, 1);
    // Reset warning state for this session
    _warned.delete(sessionId);
    _warned.delete(sessionId + '_up');
    render();
    GC.toast(`+1h · ${sym}${rate.toFixed(2)}`, 'success');
  }

  function destroy() { stopTimer(); }

  return { render, destroy };
})();
