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
    const settings = GC.Store.getSettings();
    const rate = settings.rates[station.type] || 15;
    const mins = (Date.now() - station.startTime) / 60000;
    let cost = (mins / 60) * rate;
    if (station.memberId) {
      const m = GC.Store.getMember(station.memberId);
      if (m) cost *= (1 - (settings.memberDiscounts[m.tier] || 0) / 100);
    }
    return cost.toFixed(2);
  }

  function render() {
    const stations = GC.Store.getStations();
    const settings = GC.Store.getSettings();
    const active = stations.filter(s => s.status === 'active').length;
    const sym = settings.currencySymbol;

    let html = `
      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-label">使用中</span>
          <span class="stat-value cyan">${active}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">空闲</span>
          <span class="stat-value muted">${6 - active}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日订单</span>
          <span class="stat-value muted">${todaySessions()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">今日收入</span>
          <span class="stat-value green">${sym}${todayRevenue()}</span>
        </div>
      </div>
      <div class="stations-grid">`;

    stations.forEach(st => {
      const on = st.status === 'active';
      const typeClass = st.type === 'PS5' ? 'ps5' : 'switch';
      const rate = settings.rates[st.type] || 15;
      let playerName = '散客';
      if (st.memberId) {
        const m = GC.Store.getMember(st.memberId);
        if (m) playerName = m.name;
      }

      html += `
        <div class="station-card ${on ? 'active' : 'idle'} ${typeClass}">
          <div class="station-header">
            <div class="station-info">
              <span class="type-badge ${typeClass}">${st.type}</span>
              <h3 class="station-name">${st.name}</h3>
            </div>
            <span class="status-dot ${on ? 'active' : 'idle'}">${on ? '使用中' : '空闲'}</span>
          </div>
          <div class="station-body">
            ${on ? `
              <div class="timer-display" data-start="${st.startTime}">${fmt(Date.now() - st.startTime)}</div>
              <div class="player-info">
                <span class="player-name">${playerName}</span>
                <span class="rate-tag">${sym}${rate}/h</span>
              </div>
              <div class="running-cost" data-start="${st.startTime}" data-rate="${rate}" data-member="${st.memberId || ''}">${sym}${runningCost(st)}</div>
            ` : `
              <div class="idle-display">
                <div class="idle-icon">${st.type === 'PS5' ? '🎮' : '🕹️'}</div>
                <div class="idle-rate">${sym}${rate}/小时</div>
              </div>
            `}
          </div>
          <div class="station-footer">
            ${on
              ? `<button class="btn btn-danger btn-block btn-stop" data-id="${st.id}">关桌结算</button>`
              : `<button class="btn btn-primary btn-block btn-start" data-id="${st.id}">开桌</button>`
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
        let cost = (mins / 60) * rate;
        const mid = el.dataset.member;
        if (mid) {
          const m = GC.Store.getMember(mid);
          if (m) cost *= (1 - (settings.memberDiscounts[m.tier] || 0) / 100);
        }
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
    let opts = '<option value="">散客（非会员）</option>';
    members.forEach(m => {
      const icon = m.tier === 'gold' ? '🥇' : m.tier === 'silver' ? '🥈' : '🥉';
      opts += `<option value="${m.id}">${icon} ${m.name} (${m.phone})</option>`;
    });

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>开桌 — ${st.name} (${st.type})</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">选择玩家</label>
              <select id="sel-member" class="form-input">${opts}</select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消</button>
            <button class="btn btn-primary" id="m-ok">确认开桌</button>
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
      GC.toast('已开桌 — ' + st.name, 'success');
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

    let playerName = '散客';
    let tierLabel = '';
    if (st.memberId) {
      const m = GC.Store.getMember(st.memberId);
      if (m) {
        playerName = m.name;
        tierLabel = { gold: '🥇 Gold', silver: '🥈 Silver', bronze: '🥉 Bronze' }[m.tier] || '';
      }
    }

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>结算 — ${st.name}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settlement-details">
              <div class="settlement-row"><span>机台</span><span>${st.name} (${st.type})</span></div>
              <div class="settlement-row"><span>玩家</span><span>${playerName} ${tierLabel}</span></div>
              <div class="settlement-row"><span>开始时间</span><span>${fmtDate(st.startTime)} ${fmtTime(st.startTime)}</span></div>
              <div class="settlement-row"><span>结束时间</span><span>${fmtDate(endTime)} ${fmtTime(endTime)}</span></div>
              <div class="settlement-row"><span>游玩时长</span><span>${fmt(durMs)}</span></div>
              <div class="settlement-divider"></div>
              <div class="settlement-row"><span>费率</span><span>${sym}${bill.rate}/小时</span></div>
              <div class="settlement-row"><span>小计</span><span>${sym}${bill.subtotal}</span></div>
              ${bill.discountPercent > 0 ? `<div class="settlement-row discount"><span>会员折扣 (${bill.discountPercent}%)</span><span>-${sym}${bill.discount}</span></div>` : ''}
              <div class="settlement-divider"></div>
              <div class="settlement-row total"><span>应收</span><span>${sym}${bill.total}</span></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消</button>
            <button class="btn btn-primary" id="m-ok">确认结算</button>
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
      GC.toast(`已结算 ${sym}${bill.total}`, 'success');
    };
  }

  function destroy() { stopTimer(); }

  return { render, destroy };
})();
