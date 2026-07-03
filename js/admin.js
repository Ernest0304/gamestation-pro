/**
 * Admin — cross-branch owner console (C.3, 2026-06-23)
 *
 * Owner-only. A professional back-office dashboard that aggregates BOTH
 * branches live: today's takings, per-branch comparison, and a realtime
 * cross-branch order/session feed. Reuses the store's cache (which already
 * holds every branch's data + realtime subscriptions) — getDailySummary
 * with {branchId:'all'} or a specific branch id does the aggregation.
 */
window.GC = window.GC || {};

GC.Admin = (function () {
  // Business date (06:00 SGT cutoff) — keeps the console's "today" aligned
  // with the Z-Report through the 00:00-01:00 closing hour.
  function sgtToday() { return GC.Store.getBusinessDate(); }

  const METHODS = [
    { key: 'cash', label: '现金', cls: 'cash' },
    { key: 'paynow', label: 'PayNow', cls: 'paynow' },
    { key: 'memberBalance', label: '会员', cls: 'member' },
    { key: 'grab', label: 'Grab', cls: 'grab' },
    { key: 'foodpanda', label: 'FoodPanda', cls: 'foodpanda' },
  ];

  function methodLabel(m) {
    return ({ cash: '现金 Cash', paynow: 'PayNow', member_balance: '会员余额',
      card: '信用卡', mixed: '拆账', grab: '🛵 Grab', foodpanda: '🐼 FoodPanda' })[m] || m;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function render() {
    const sym = GC.Store.getSettings().currencySymbol;
    const today = sgtToday();
    const branches = GC.Store.getBranches();
    const all = GC.Store.getDailySummary(today, { branchId: 'all' });

    // Active sessions across all branches (in-progress = money on the floor)
    const activeSessions = GC.Store.getActiveSessions();

    // KPI strip — cross-branch today
    const kpis = `
      <div class="admin-kpis">
        <div class="admin-kpi">
          <span class="admin-kpi-label">今日总营收 / Revenue (all)</span>
          <span class="admin-kpi-value">${sym}${all.totalRevenue.toFixed(2)}</span>
        </div>
        <div class="admin-kpi">
          <span class="admin-kpi-label">订单 / Orders</span>
          <span class="admin-kpi-value">${all.orderCount}</span>
        </div>
        <div class="admin-kpi">
          <span class="admin-kpi-label">游戏台 / Sessions</span>
          <span class="admin-kpi-value">${all.sessionCount}</span>
        </div>
        <div class="admin-kpi">
          <span class="admin-kpi-label">充值收款 / Top-ups</span>
          <span class="admin-kpi-value">${sym}${all.topUpsCash.toFixed(2)}</span>
        </div>
        <div class="admin-kpi accent">
          <span class="admin-kpi-label">进行中游戏台 / Live now</span>
          <span class="admin-kpi-value">${activeSessions.length}</span>
        </div>
      </div>`;

    // Per-branch comparison cards
    const branchCards = branches.map(b => {
      const z = GC.Store.getDailySummary(today, { branchId: b.id });
      const live = activeSessions.filter(s => s.branchId === b.id).length;
      const maxMethod = Math.max(0.01, ...METHODS.map(m => z[m.key] || 0));
      const methodBars = METHODS
        .filter(m => (z[m.key] || 0) > 0)
        .map(m => `
          <div class="admin-method-row">
            <span class="admin-method-label">${m.label}</span>
            <div class="admin-method-track">
              <div class="admin-method-fill ${m.cls}" style="width:${((z[m.key] || 0) / maxMethod * 100).toFixed(0)}%"></div>
            </div>
            <span class="admin-method-amt">${sym}${(z[m.key] || 0).toFixed(2)}</span>
          </div>`).join('') || '<div class="admin-empty-mini">今日暂无收入 / No takings yet</div>';

      return `
        <div class="admin-branch-card ${b.code} ${!b.active ? 'inactive' : ''}">
          <div class="admin-branch-head">
            <div>
              <div class="admin-branch-name">${GC.esc(b.nameZh)}<span class="admin-branch-en">${GC.esc(b.nameEn)}</span></div>
              <div class="admin-branch-tags">
                ${b.hasGaming ? '<span class="admin-tag gaming"><i class="ti ti-device-gamepad-2"></i> 游戏</span>' : ''}
                ${!b.active ? '<span class="admin-tag inactive">未启用</span>' : '<span class="admin-tag live"><i class="ti ti-circle-filled"></i> 营业中</span>'}
              </div>
            </div>
            <div class="admin-branch-revenue">
              <span class="admin-branch-revenue-val">${sym}${z.totalRevenue.toFixed(2)}</span>
              <span class="admin-branch-revenue-lbl">今日营收</span>
            </div>
          </div>
          <div class="admin-branch-stats">
            <span><i class="ti ti-receipt"></i> ${z.orderCount} 单</span>
            <span><i class="ti ti-device-gamepad-2"></i> ${z.sessionCount} 台次</span>
            ${live > 0 ? `<span class="live-pill"><i class="ti ti-player-play-filled"></i> ${live} 进行中</span>` : ''}
            ${z.voidedCount > 0 ? `<span class="void-pill">作废 ${z.voidedCount}</span>` : ''}
          </div>
          <div class="admin-method-bars">${methodBars}</div>
        </div>`;
    }).join('');

    // Live cross-branch feed: completed orders + sessions, newest first
    const branchName = (id) => {
      const b = branches.find(x => x.id === id);
      return b ? b.nameZh : '—';
    };
    const orders = GC.Store.getOrders()
      .filter(o => o.status === 'completed')
      .map(o => ({
        ts: o.completedAt || o.createdAt, kind: 'order', branchId: o.branchId,
        title: `订单 #${o.orderNo}`, sub: o.guestName || (o.memberId ? '会员' : '散客'),
        method: o.paymentMethod, total: o.total, cashier: o.cashier,
      }));
    const sessions = GC.Store.getSessions()
      .filter(s => s.status === 'completed' && s.endTime)
      .map(s => ({
        ts: s.endTime, kind: 'session', branchId: s.branchId,
        title: s.stationName, sub: `${s.durationMinutes || 0} 分钟`,
        method: s.memberId ? 'member_balance' : (s.paymentMethod || 'cash'),
        total: s.total, cashier: s.cashier,
      }));
    const feed = [...orders, ...sessions]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 30);

    const feedRows = feed.length === 0
      ? `<tr><td colspan="6" class="table-empty"><i class="ti ti-clock-off table-empty-icon"></i><div class="table-empty-title">暂无交易</div><small>Transactions will stream in live</small></td></tr>`
      : feed.map(f => `
        <tr>
          <td class="admin-feed-time">${fmtTime(f.ts)}</td>
          <td><span class="admin-branch-chip ${branches.find(b=>b.id===f.branchId)?.code||''}">${branchName(f.branchId)}</span></td>
          <td><span class="admin-feed-kind ${f.kind}"><i class="ti ti-${f.kind === 'order' ? 'receipt' : 'device-gamepad-2'}"></i></span> ${GC.esc(f.title)}</td>
          <td class="admin-feed-sub">${GC.esc(f.sub)}${f.cashier ? ` · ${GC.esc(String(f.cashier).split('@')[0])}` : ''}</td>
          <td><span class="payment-tag ${f.method}">${methodLabel(f.method)}</span></td>
          <td class="admin-feed-amt">${sym}${Number(f.total).toFixed(2)}</td>
        </tr>`).join('');

    document.getElementById('main-content').innerHTML = `
      <div class="admin-view">
        <div class="admin-topbar">
          <div>
            <h1 class="admin-title"><i class="ti ti-layout-dashboard"></i> 管理后台 <span class="admin-title-en">Admin Console</span></h1>
            <div class="admin-subtitle">${today} · 跨店实时 / Live across all branches</div>
          </div>
          <div class="admin-live-badge"><i class="ti ti-circle-filled"></i> LIVE</div>
        </div>

        ${kpis}

        <h2 class="admin-section">分店对比 / By Branch</h2>
        <div class="admin-branch-grid">${branchCards}</div>

        <h2 class="admin-section">实时交易流 / Live Feed <small>最新 30 条</small></h2>
        <div class="admin-feed-wrap">
          <table class="data-table admin-feed-table">
            <thead>
              <tr>
                <th style="width:64px">时间</th>
                <th style="width:90px">分店</th>
                <th>明细 / Detail</th>
                <th>客户 / 收银</th>
                <th style="width:130px">付款</th>
                <th style="width:90px;text-align:right">金额</th>
              </tr>
            </thead>
            <tbody>${feedRows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function destroy() {}
  return { render, destroy };
})();
