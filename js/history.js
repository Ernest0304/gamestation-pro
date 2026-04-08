/**
 * History — Session history and revenue overview
 */
window.GC = window.GC || {};

GC.History = (function () {
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let currentDate = localDateStr(new Date());

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDur(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function getFiltered() {
    const sessions = GC.Store.getSessions();
    const dayStart = new Date(currentDate + 'T00:00:00').getTime();
    const dayEnd = dayStart + 86400000;
    return sessions.filter(s => s.endTime >= dayStart && s.endTime < dayEnd);
  }

  function render() {
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const filtered = getFiltered();
    const totalRev = filtered.reduce((s, x) => s + x.total, 0).toFixed(2);
    const totalTime = filtered.reduce((s, x) => s + x.durationMinutes, 0);

    let rows = '';
    if (filtered.length === 0) {
      rows = `<tr><td colspan="6" class="table-empty">暂无记录</td></tr>`;
    } else {
      filtered.forEach(s => {
        let player = '散客';
        if (s.memberId) {
          const m = GC.Store.getMember(s.memberId);
          if (m) player = m.name;
        }
        rows += `
          <tr>
            <td>${fmtTime(s.startTime)} - ${fmtTime(s.endTime)}</td>
            <td>${s.stationName}</td>
            <td><span class="type-badge ${s.stationType === 'PS5' ? 'ps5' : 'switch'}" style="font-size:0.7rem">${s.stationType}</span></td>
            <td>${player}</td>
            <td>${fmtDur(s.durationMinutes)}</td>
            <td style="font-weight:600">${sym}${s.total.toFixed(2)}${s.discountPercent > 0 ? ` <small style="color:var(--green)">(-${s.discountPercent}%)</small>` : ''}</td>
          </tr>`;
      });
    }

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">历史记录</h2>
        <div class="filter-bar">
          <input type="date" id="date-filter" class="form-input" value="${currentDate}">
        </div>
      </div>
      <div class="stats-bar" style="margin-bottom:24px">
        <div class="stat-card">
          <span class="stat-label">订单数</span>
          <span class="stat-value muted">${filtered.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总时长</span>
          <span class="stat-value muted">${fmtDur(totalTime)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总收入</span>
          <span class="stat-value green">${sym}${totalRev}</span>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th><th>机台</th><th>类型</th><th>玩家</th><th>时长</th><th>金额</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('date-filter').addEventListener('change', e => {
      currentDate = e.target.value;
      render();
    });
  }

  function destroy() {}
  return { render, destroy };
})();
