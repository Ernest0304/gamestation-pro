/**
 * Dashboard — Main control panel with station cards and timers
 */
window.GC = window.GC || {};

GC.Dashboard = (function () {
  let timerInterval = null;

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function tierLabel(tier) {
    return ({
      platinum: '💎 Platinum',
      silver: '🥈 Silver',
      regular: '',
    })[tier] || '';
  }

  function todayRevenue() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return GC.Store.getSessions()
      .filter(s => s.endTime >= d.getTime())
      .reduce((sum, s) => sum + s.total, 0)
      .toFixed(2);
  }

  function todaySessions() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return GC.Store.getSessions().filter(s => s.endTime >= d.getTime()).length;
  }

  function runningCost(station) {
    const mins = (Date.now() - station.startTime) / 60000;
    const { rate } = GC.Store.getRateFor(station.type, station.memberId);
    return ((mins / 60) * rate).toFixed(2);
  }

  function render() {
    const stations = GC.Store.getStations();
    const settings = GC.Store.getSettings();
    const active = stations.filter(s => s.status === 'active').length;
    const sym = settings.currencySymbol;
    const promoOn = settings.promoActive;

    let html = '';

    // Promo banner
    if (promoOn) {
      html += `
        <div class="promo-banner">
          <div class="promo-banner-glow"></div>
          <div class="promo-banner-content">
            <div class="promo-banner-tag">LIMITED TIME · 限时</div>
            <div class="promo-banner-title">🎮 开业促销 / Opening Promo</div>
            <div class="promo-banner-rates">
              <span><strong>Switch 2</strong> ${sym}${settings.rates.promo['Switch 2']}<small>/小时 hr</small></span>
              <span class="promo-banner-divider"></span>
              <span><strong>PS5</strong> ${sym}${settings.rates.promo['PS5']}<small>/小时 hr</small></span>
            </div>
          </div>
        </div>`;
    }

    html += `
      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-label">使用中 / Active</span>
          <span class="stat-value cyan">${active}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">空闲 / Idle</span>
          <span class="stat-value muted">${6 - active}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日订单 / Sessions</span>
          <span class="stat-value muted">${todaySessions()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日收入 / Revenue</span>
          <span class="stat-value green">${sym}${todayRevenue()}</span>
        </div>
      </div>
      <div class="stations-grid">`;

    stations.forEach(st => {
      const on = st.status === 'active';
      const typeClass = st.type === 'PS5' ? 'ps5' : 'switch';
      const { rate, rateTier, regularRate } = GC.Store.getRateFor(st.type, st.memberId);

      let playerName = '散客 / Walk-in';
      let memberTier = '';
      if (st.memberId) {
        const m = GC.Store.getMember(st.memberId);
        if (m) {
          playerName = m.name;
          memberTier = tierLabel(m.tier);
        }
      }

      // Rate badge — show promo or member discount
      let rateBadge = '';
      if (rateTier === 'promo') {
        rateBadge = `<span class="rate-promo-tag">PROMO</span>`;
      } else if (rateTier !== 'regular') {
        rateBadge = `<span class="rate-member-tag">${rateTier.toUpperCase()}</span>`;
      }

      html += `
        <div class="station-card ${on ? 'active' : 'idle'} ${typeClass}">
          <div class="station-header">
            <div class="station-info">
              <span class="type-badge ${typeClass}">${st.type}</span>
              <h3 class="station-name">${st.name}</h3>
            </div>
            <span class="status-dot ${on ? 'active' : 'idle'}">${on ? '使用中 Active' : '空闲 Idle'}</span>
          </div>
          <div class="station-body">
            ${on ? `
              <div class="timer-display" data-start="${st.startTime}">${fmt(Date.now() - st.startTime)}</div>
              <div class="player-info">
                <span class="player-name">${playerName}${memberTier ? ' ' + memberTier : ''}</span>
                <span class="rate-tag">${sym}${rate}/h ${rateBadge}</span>
              </div>
              <div class="running-cost" data-start="${st.startTime}" data-rate="${rate}">${sym}${runningCost(st)}</div>
            ` : `
              <div class="idle-display">
                <div class="idle-icon">${st.type === 'PS5' ? '🎮' : '🕹️'}</div>
                <div class="idle-rate">
                  ${rateTier === 'promo' ? `<span class="rate-original-strike">${sym}${regularRate}</span> ` : ''}<strong>${sym}${rate}</strong><small>/小时 hr</small>
                  ${rateBadge}
                </div>
              </div>
            `}
          </div>
          <div class="station-footer">
            ${on
              ? `<button class="btn btn-danger btn-block btn-stop" data-id="${st.id}">关桌结算 / Close & Bill</button>`
              : `<button class="btn btn-primary btn-block btn-start" data-id="${st.id}">开桌 / Open Table</button>`
            }
          </div>
        </div>`;
    });

    html += '</div>';
    document.getElementById('main-content').innerHTML = html;
    bindEvents();
    startTimer();
  }

  function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
      const settings = GC.Store.getSettings();
      const sym = settings.currencySymbol;
      document.querySelectorAll('.timer-display').forEach(el => {
        const start = parseInt(el.dataset.start);
        if (start) el.textContent = fmt(Date.now() - start);
      });
      document.querySelectorAll('.running-cost').forEach(el => {
        const start = parseInt(el.dataset.start);
        const rate = parseFloat(el.dataset.rate);
        if (!start || !rate) return;
        const mins = (Date.now() - start) / 60000;
        const cost = (mins / 60) * rate;
        el.textContent = `${sym}${cost.toFixed(2)}`;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function bindEvents() {
    document.querySelectorAll('.btn-start').forEach(b =>
      b.addEventListener('click', () => showStartModal(parseInt(b.dataset.id))));
    document.querySelectorAll('.btn-stop').forEach(b =>
      b.addEventListener('click', () => showSettlement(parseInt(b.dataset.id))));
  }

  function showStartModal(id) {
    const st = GC.Store.getStation(id);
    const members = GC.Store.getMembers();
    let opts = '<option value="">散客 / Walk-in (non-member)</option>';
    members.forEach(m => {
      const icon = m.tier === 'platinum' ? '💎' : m.tier === 'silver' ? '🥈' : '👤';
      opts += `<option value="${m.id}">${icon} ${m.name}${m.phone ? ' (' + m.phone + ')' : ''}</option>`;
    });

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>开桌 / Open Table — ${st.name} (${st.type})</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">选择玩家 / Select Player</label>
              <select id="sel-member" class="form-input">${opts}</select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok">确认开桌 / Confirm</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      const mid = document.getElementById('sel-member').value || null;
      await GC.Store.updateStation(id, { status: 'active', startTime: Date.now(), memberId: mid });
      close();
      render();
      GC.toast('已开桌 / Opened — ' + st.name, 'success');
    };
  }

  function showSettlement(id) {
    const st = GC.Store.getStation(id);
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const endTime = Date.now();
    const durMs = endTime - st.startTime;
    const durMin = durMs / 60000;
    const bill = GC.Store.calculateBill(st.type, durMin, st.memberId);

    let playerName = '散客 / Walk-in';
    let tierTag = '';
    if (st.memberId) {
      const m = GC.Store.getMember(st.memberId);
      if (m) {
        playerName = m.name;
        tierTag = tierLabel(m.tier);
      }
    }

    let discountLabel = '';
    if (bill.rateTier === 'promo') discountLabel = `促销优惠 / Promo (${bill.discountPercent}% off)`;
    else if (bill.rateTier === 'silver') discountLabel = `Silver 会员优惠 / Member (${bill.discountPercent}% off)`;
    else if (bill.rateTier === 'platinum') discountLabel = `Platinum 会员优惠 / Member (${bill.discountPercent}% off)`;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>结算 / Checkout — ${st.name}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settlement-details">
              <div class="settlement-row"><span>机台 / Station</span><span>${st.name} (${st.type})</span></div>
              <div class="settlement-row"><span>玩家 / Player</span><span>${playerName} ${tierTag}</span></div>
              <div class="settlement-row"><span>开始 / Start</span><span>${fmtDate(st.startTime)} ${fmtTime(st.startTime)}</span></div>
              <div class="settlement-row"><span>结束 / End</span><span>${fmtDate(endTime)} ${fmtTime(endTime)}</span></div>
              <div class="settlement-row"><span>时长 / Duration</span><span>${fmt(durMs)}</span></div>
              <div class="settlement-divider"></div>
              <div class="settlement-row"><span>原价 / Original Rate</span><span>${sym}${bill.regularRate}/h</span></div>
              ${bill.discountPercent > 0 ? `<div class="settlement-row"><span>实际费率 / Applied Rate</span><span class="rate-applied">${sym}${bill.rate}/h</span></div>` : ''}
              <div class="settlement-row"><span>小计 / Subtotal</span><span>${sym}${bill.subtotal.toFixed(2)}</span></div>
              ${bill.discountPercent > 0 ? `<div class="settlement-row discount"><span>${discountLabel}</span><span>-${sym}${bill.discount.toFixed(2)}</span></div>` : ''}
              <div class="settlement-divider"></div>
              <div class="settlement-row total"><span>应收 / Total</span><span>${sym}${bill.total.toFixed(2)}</span></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok">确认结算 / Confirm</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      await GC.Store.addSession({
        stationId: st.id, stationName: st.name, stationType: st.type,
        memberId: st.memberId, startTime: st.startTime, endTime,
        durationMinutes: bill.durationMinutes,
        rate: bill.rate, subtotal: bill.subtotal,
        discountPercent: bill.discountPercent, discount: bill.discount, total: bill.total,
      });
      if (st.memberId) {
        const m = GC.Store.getMember(st.memberId);
        if (m) await GC.Store.updateMember(st.memberId, {
          totalSpent: m.totalSpent + bill.total,
          totalMinutes: m.totalMinutes + bill.durationMinutes,
        });
      }
      await GC.Store.updateStation(id, { status: 'idle', startTime: null, memberId: null });
      close();
      render();
      GC.toast(`已结算 / Settled ${sym}${bill.total.toFixed(2)}`, 'success');
    };
  }

  function destroy() { stopTimer(); }

  return { render, destroy };
})();
