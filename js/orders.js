/**
 * Orders — F&B + Gaming transaction history with rich filters.
 *
 * 2026-05-14 (Ernest): "现在只是报表上可以做filter 我一开始的意思其实是
 * orders 里也能让我们filter" — extend the same time-range/category filter
 * we built for Reports into the Orders page, plus payment-method filter
 * (cashier needs to slice by Grab / FoodPanda quickly).
 */
window.GC = window.GC || {};

GC.Orders = (function () {
  // Date string (local) helper
  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  // Business date (06:00 SGT cutoff): at 00:30 the default filter still shows
  // the trading day in progress, not an empty "new" calendar day.
  const TODAY = GC.Store.getBusinessDate();

  // Filter state — shop hours 12:00 → next-day 01:00 (hours 12-25)
  let filterStartDate = TODAY;
  let filterEndDate = TODAY;
  let filterStartHour = 12;
  let filterEndHour = 25;
  let filterCategory = 'all';       // 'all' | 'food' | 'gaming'
  let statusFilter = 'all';         // 'all' | 'completed' | 'voided'
  let methodFilter = 'all';         // 'all' | 'cash' | 'paynow' | 'member_balance' | 'card' | 'grab' | 'foodpanda' | 'mixed'

  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); }
  function fmtDur(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function methodLabel(m) {
    return ({
      cash: '现金 Cash',
      paynow: 'PayNow',
      member_balance: '会员余额',
      card: '信用卡',
      mixed: '🔀 拆账',
      pending: '待付款',
      grab: '🛵 Grab',
      foodpanda: '🐼 FoodPanda',
    })[m] || m;
  }

  /* ---- Hour selector helper ---- */
  function hourOptions(selected) {
    const opts = [];
    for (let h = 12; h <= 25; h++) {
      const label = h < 24 ? `${String(h).padStart(2, '0')}:00`
                   : h === 24 ? '00:00 (午夜)'
                   : '01:00 (次日)';
      opts.push(`<option value="${h}" ${selected === h ? 'selected' : ''}>${label}</option>`);
    }
    return opts.join('');
  }

  /* ---- Compute SGT-pinned window from filter state ---- */
  function getWindow() {
    // sgtMs: yyyy-mm-dd plus hour offset where hour 12 = 12:00 SGT,
    // hour 25 = 01:00 SGT next day.
    const sgtMs = (yyyymmdd, hourOffset) =>
      new Date(yyyymmdd + 'T12:00:00+08:00').getTime() + (hourOffset - 12) * 3600 * 1000;
    return {
      start: sgtMs(filterStartDate, filterStartHour),
      end: sgtMs(filterEndDate, filterEndHour),
    };
  }

  /* ---- Filtering ---- */
  // Migration 009: scope reads to current branch.
  function currentBranchId() {
    return GC.Store.getCurrentBranchId ? GC.Store.getCurrentBranchId() : null;
  }
  function matchBranch(row, bId) {
    return !bId || !row.branchId || row.branchId === bId;
  }

  function getFilteredOrders() {
    const { start, end } = getWindow();
    const bId = currentBranchId();
    return GC.Store.getOrders().filter(o => {
      const t = o.completedAt || o.createdAt;
      if (t < start || t >= end) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (methodFilter !== 'all' && o.paymentMethod !== methodFilter) return false;
      if (!matchBranch(o, bId)) return false;
      return true;
    });
  }

  function getFilteredSessions() {
    const { start, end } = getWindow();
    const bId = currentBranchId();
    return (GC.Store.getSessions ? GC.Store.getSessions() : []).filter(s => {
      if (s.status !== 'completed' || !s.endTime) return false;
      if (s.endTime < start || s.endTime >= end) return false;
      // statusFilter applies to orders only; sessions are always shown if status='all'
      if (statusFilter === 'voided') return false;
      // Method filter on sessions: derive from s.paymentMethod (cash by default) or member_balance
      if (methodFilter !== 'all') {
        const m = s.memberId ? 'member_balance' : (s.paymentMethod || 'cash');
        if (m !== methodFilter) return false;
      }
      if (!matchBranch(s, bId)) return false;
      return true;
    });
  }

  /* ---- Render ---- */
  function render() {
    const sym = GC.Store.getSettings().currencySymbol;

    const orders = filterCategory === 'gaming' ? [] : getFilteredOrders();
    const sessions = filterCategory === 'food' ? [] : getFilteredSessions();

    const completedOrders = orders.filter(o => o.status === 'completed');
    const orderRev = completedOrders.reduce((s, o) => s + o.total, 0);
    const sessionRev = sessions.reduce((s, x) => s + x.total, 0);
    const totalRev = orderRev + sessionRev;
    const totalItems = completedOrders.reduce(
      (s, o) => s + (GC.Store.getOrderItemsForOrder(o.id) || []).reduce((q, i) => q + i.quantity, 0), 0
    );

    // Build unified rows sorted by time desc
    const rows = [];
    orders.forEach(o => {
      const items = GC.Store.getOrderItemsForOrder(o.id) || [];
      const itemSummary = items.slice(0, 3).map(i => `${i.emoji}${i.quantity > 1 ? '×' + i.quantity : ''}`).join(' ');
      const moreItems = items.length > 3 ? ` +${items.length - 3}` : '';
      const customer = o.memberId
        ? (() => { const m = GC.Store.getMember(o.memberId); return m ? `${m.name} 💎` : '会员'; })()
        : (o.guestName || '散客');
      const tags = [];
      if (o.takeaway) tags.push('<span class="row-tag takeaway">🥡 外带</span>');
      if (o.paymentMethod === 'grab') tags.push('<span class="row-tag grab">🛵</span>');
      if (o.paymentMethod === 'foodpanda') tags.push('<span class="row-tag foodpanda">🐼</span>');
      const actionCell = o.status === 'voided'
        ? '<span class="voided-tag-sm">作废</span>'
        : `<button class="row-void-btn" data-void="${o.id}" title="作废订单 / Void">✕</button>`;
      rows.push({
        ts: o.completedAt || o.createdAt,
        html: `
          <tr data-order="${o.id}" class="${o.status === 'voided' ? 'voided' : ''}">
            <td><span class="row-type-badge food">🍴</span></td>
            <td><strong>#${o.orderNo}</strong></td>
            <td>${fmtDate(o.completedAt || o.createdAt)} ${fmtTime(o.completedAt || o.createdAt)}</td>
            <td>${customer}</td>
            <td><div class="order-items-preview">${itemSummary}${moreItems} ${tags.join('')}</div></td>
            <td><span class="payment-tag ${o.paymentMethod}">${methodLabel(o.paymentMethod)}</span></td>
            <td><strong>${sym}${o.total.toFixed(2)}</strong></td>
            <td class="row-actions">${actionCell}</td>
          </tr>`,
      });
    });
    sessions.forEach(s => {
      const player = s.memberId
        ? (() => { const m = GC.Store.getMember(s.memberId); return m ? `${m.name} 💎` : '会员'; })()
        : '散客 Walk-in';
      const method = s.memberId ? 'member_balance' : (s.paymentMethod || 'cash');
      const sessActionCell = s.status === 'voided'
        ? '<span class="voided-tag-sm">作废</span>'
        : (s.status === 'completed'
          ? `<button class="row-void-btn" data-void-session="${s.id}" title="作废台 / Void session">✕</button>`
          : '');
      rows.push({
        ts: s.endTime,
        html: `
          <tr data-session="${s.id}" class="gaming-row ${s.status === 'voided' ? 'voided' : ''}">
            <td><span class="row-type-badge gaming">🎮</span></td>
            <td><strong>${s.stationName}</strong></td>
            <td>${fmtDate(s.endTime)} ${fmtTime(s.startTime)}–${fmtTime(s.endTime)}</td>
            <td>${player}</td>
            <td><div class="order-items-preview"><small>${fmtDur(s.durationMinutes)} · ${s.stationType || 'PS5'}</small></div></td>
            <td><span class="payment-tag ${method}">${methodLabel(method)}</span></td>
            <td><strong>${sym}${s.total.toFixed(2)}</strong></td>
            <td class="row-actions">${sessActionCell}</td>
          </tr>`,
      });
    });
    rows.sort((a, b) => b.ts - a.ts);

    const tbody = rows.length === 0
      ? `<tr><td colspan="8" class="table-empty"><i class="ti ti-receipt-off table-empty-icon" aria-hidden="true"></i><div class="table-empty-title">所选条件下没有记录</div><small>No records in this range</small></td></tr>`
      : rows.map(r => r.html).join('');

    const catPill = (key, label) =>
      `<button class="cat-pill ${filterCategory === key ? 'active' : ''}" data-cat="${key}">${label}</button>`;

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">订单历史 / Orders</h2>
        <small style="color:var(--text-muted)">营业时间 12:00 — 次日 01:00</small>
      </div>

      <div class="filter-panel">
        <div class="filter-controls">
          <div class="filter-group">
            <label class="form-label">起始日期 / Start Date</label>
            <input type="date" id="flt-start-date" class="form-input" value="${filterStartDate}">
          </div>
          <div class="filter-group">
            <label class="form-label">结束日期 / End Date</label>
            <input type="date" id="flt-end-date" class="form-input" value="${filterEndDate}">
          </div>
          <div class="filter-group">
            <label class="form-label">从几点 / From Hour</label>
            <select id="flt-start-hour" class="form-input">${hourOptions(filterStartHour)}</select>
          </div>
          <div class="filter-group">
            <label class="form-label">到几点 / To Hour</label>
            <select id="flt-end-hour" class="form-input">${hourOptions(filterEndHour)}</select>
          </div>
        </div>

        <div class="filter-cat-row">
          <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600">类型 / Type:</span>
          ${catPill('all', '全部 / All')}
          ${catPill('food', '🍴 餐饮 / F&B')}
          ${catPill('gaming', '🎮 游戏 / Gaming')}
        </div>

        <div class="filter-cat-row" style="margin-top:8px">
          <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600">付款 / Payment:</span>
          <select id="flt-method" class="form-input" style="max-width:200px">
            <option value="all" ${methodFilter === 'all' ? 'selected' : ''}>全部 / All</option>
            <option value="cash" ${methodFilter === 'cash' ? 'selected' : ''}>💵 现金 Cash</option>
            <option value="paynow" ${methodFilter === 'paynow' ? 'selected' : ''}>📱 PayNow</option>
            <option value="member_balance" ${methodFilter === 'member_balance' ? 'selected' : ''}>💎 会员余额</option>
            <option value="mixed" ${methodFilter === 'mixed' ? 'selected' : ''}>🔀 拆账 Split</option>
            <option value="grab" ${methodFilter === 'grab' ? 'selected' : ''}>🛵 Grab</option>
            <option value="foodpanda" ${methodFilter === 'foodpanda' ? 'selected' : ''}>🐼 FoodPanda</option>
            <option value="card" ${methodFilter === 'card' ? 'selected' : ''}>💳 信用卡</option>
          </select>

          <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600;margin-left:10px">状态 / Status:</span>
          <select id="flt-status" class="form-input" style="max-width:160px">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>全部</option>
            <option value="completed" ${statusFilter === 'completed' ? 'selected' : ''}>已完成</option>
            <option value="voided" ${statusFilter === 'voided' ? 'selected' : ''}>已作废</option>
          </select>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-label">餐饮订单 / F&amp;B Orders</span>
          <span class="stat-value muted">${completedOrders.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">游戏台 / Sessions</span>
          <span class="stat-value muted">${sessions.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">售出商品 / Items</span>
          <span class="stat-value muted">${totalItems}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总收入 / Revenue</span>
          <span class="stat-value green">${sym}${totalRev.toFixed(2)}</span>
        </div>
      </div>

      <div class="table-container" style="margin-top:20px">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:36px"></th>
              <th>编号 / ID</th>
              <th>时间 / Time</th>
              <th>客户 / Customer</th>
              <th>明细 / Detail</th>
              <th>付款 / Pay</th>
              <th>金额 / Amount</th>
              <th style="width:50px"></th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    const sd = document.getElementById('flt-start-date');
    const ed = document.getElementById('flt-end-date');
    const sh = document.getElementById('flt-start-hour');
    const eh = document.getElementById('flt-end-hour');
    const fm = document.getElementById('flt-method');
    const fs = document.getElementById('flt-status');

    if (sd) sd.addEventListener('change', e => { filterStartDate = e.target.value; render(); });
    if (ed) ed.addEventListener('change', e => { filterEndDate = e.target.value; render(); });
    if (sh) sh.addEventListener('change', e => {
      filterStartHour = parseInt(e.target.value);
      if (filterEndHour <= filterStartHour) filterEndHour = Math.min(25, filterStartHour + 1);
      render();
    });
    if (eh) eh.addEventListener('change', e => {
      filterEndHour = parseInt(e.target.value);
      if (filterEndHour <= filterStartHour) filterStartHour = Math.max(12, filterEndHour - 1);
      render();
    });
    if (fm) fm.addEventListener('change', e => { methodFilter = e.target.value; render(); });
    if (fs) fs.addEventListener('change', e => { statusFilter = e.target.value; render(); });

    document.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { filterCategory = b.dataset.cat; render(); });
    });

    document.querySelectorAll('[data-order]').forEach(r => {
      r.addEventListener('click', (e) => {
        // Don't open detail when clicking the inline void button
        if (e.target.closest('[data-void], [data-void-session]')) return;
        showOrderDetail(r.dataset.order);
      });
    });
    document.querySelectorAll('[data-void]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmAndVoidOrder(b.dataset.void);
      });
    });
    document.querySelectorAll('[data-void-session]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmAndVoidSession(b.dataset.voidSession);
      });
    });
  }

  // Staff list now lives in settings.staff_names (Migration 012 / Tier 0.9)
  // — editable in 设置 without a deploy. Falls back to the launch roster.
  function staffList() {
    const s = GC.Store.getSettings();
    return (s && Array.isArray(s.staffNames) && s.staffNames.length > 0)
      ? s.staffNames
      : ['Qian Min', 'Tock Chau', 'Ke Ying', 'Felicia', 'Ernest'];
  }

  /**
   * Shared void modal. Used by both order void and session void.
   * Returns Promise<{ staff, reason } | null>.
   *
   * @param {object} ctx
   * @param {'order'|'session'} ctx.type
   * @param {string} ctx.title
   * @param {string} ctx.summary  multi-line summary shown above inputs
   * @param {string} [ctx.refundHint]  optional teal hint (e.g., '会员余额会自动退回')
   */
  function showVoidModal(ctx) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal');
      const staffOpts = ['<option value="">— 请选择 / Select —</option>']
        .concat(staffList().map(s => `<option value="${GC.esc(s)}">${GC.esc(s)}</option>`))
        .join('');
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-void">
            <div class="modal-header">
              <h3>${GC.esc(ctx.title)}</h3>
              <button class="modal-close" id="vm-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="void-summary">${ctx.summary.split('\n').map(l => `<div>${GC.esc(l)}</div>`).join('')}</div>
              ${ctx.refundHint ? `<div class="void-refund-hint">${GC.esc(ctx.refundHint)}</div>` : ''}
              <div class="form-group">
                <label class="form-label">操作员 / Performed by *</label>
                <select id="vm-staff" class="form-input">${staffOpts}</select>
              </div>
              <div class="form-group">
                <label class="form-label">作废原因 / Reason *</label>
                <input type="text" id="vm-reason" class="form-input" placeholder="例：客户改主意 / 厨房做错了 / 开错台">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="vm-cancel">取消 / Cancel</button>
              <button class="btn btn-primary" id="vm-confirm" style="background:var(--red);border:none" disabled>🗑 确认作废 / Confirm Void</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');

      const staffSel = document.getElementById('vm-staff');
      const reasonInput = document.getElementById('vm-reason');
      const confirmBtn = document.getElementById('vm-confirm');
      const updateOk = () => {
        confirmBtn.disabled = !staffSel.value || !reasonInput.value.trim();
      };
      staffSel.addEventListener('change', updateOk);
      reasonInput.addEventListener('input', updateOk);

      const close = (result) => {
        modal.classList.remove('show'); modal.innerHTML = '';
        resolve(result);
      };
      document.getElementById('vm-close').onclick = () => close(null);
      document.getElementById('vm-cancel').onclick = () => close(null);
      confirmBtn.onclick = () => {
        if (confirmBtn.disabled) return;
        close({ staff: staffSel.value, reason: reasonInput.value.trim() });
      };
      setTimeout(() => reasonInput.focus(), 60);
    });
  }

  /** Order void flow — opens shared modal, calls store.voidOrder. */
  async function confirmAndVoidOrder(orderId) {
    const order = GC.Store.getOrder(orderId);
    if (!order) return;
    if (order.status === 'voided') return;
    // Tier 0.5: manager PIN gate (no-op until a PIN is set in 设置)
    if (!(await GC.requireManagerPin('作废订单 / Void order'))) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const tenders = GC.Store.getOrderPaymentsFor ? GC.Store.getOrderPaymentsFor(orderId) : [];
    const hasMember = order.paymentMethod === 'member_balance'
      || tenders.some(t => t.method === 'member_balance');

    const res = await showVoidModal({
      type: 'order',
      title: `作废订单 / Void Order #${order.orderNo}`,
      summary: `订单号 / No: #${order.orderNo}\n金额 / Total: ${sym}${order.total.toFixed(2)}\n付款 / Pay: ${methodLabel(order.paymentMethod)}`,
      refundHint: hasMember
        ? '💎 会员余额将自动退回 / Member balance will be refunded automatically.'
        : '💵 现金/PayNow 需手动退给客户 / Refund cash or reverse PayNow manually.',
    });
    if (!res) return;

    try {
      await GC.Store.voidOrder(orderId, { note: res.reason, staff: res.staff });
      GC.toast(`✅ 订单 #${order.orderNo} 已作废 (by ${res.staff})`, 'success');
      const m = document.getElementById('modal');
      if (m && m.classList.contains('show')) { m.classList.remove('show'); m.innerHTML = ''; }
      render();
    } catch (err) {
      GC.toast('作废失败 / Failed: ' + err.message, 'error');
    }
  }

  /** Session void flow — opens shared modal, calls store.voidSession. */
  async function confirmAndVoidSession(sessionId) {
    const session = GC.Store.getSessions().find(s => s.id === sessionId);
    if (!session) return;
    if (session.status === 'voided') return;
    if (session.status === 'active') {
      GC.toast('正在进行中的台不可作废，请先结账', 'error');
      return;
    }
    // Tier 0.5: manager PIN gate (no-op until a PIN is set in 设置)
    if (!(await GC.requireManagerPin('作废游戏台 / Void session'))) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const isMember = !!session.memberId && session.paymentMethod === 'member_balance';

    const res = await showVoidModal({
      type: 'session',
      title: `作废游戏台 / Void Session`,
      summary: `机台 / Station: ${session.stationName} (${session.stationType || 'PS5'})\n` +
               `时长 / Duration: ${session.durationMinutes || 0} min\n` +
               `金额 / Total: ${sym}${session.total.toFixed(2)}\n` +
               `付款 / Pay: ${methodLabel(session.paymentMethod || (isMember ? 'member_balance' : 'cash'))}`,
      refundHint: isMember
        ? '💎 会员余额将自动退回 + 累计消费/时长会扣减'
        : '💵 现金/PayNow 需手动退给客户',
    });
    if (!res) return;

    try {
      await GC.Store.voidSession(sessionId, { note: res.reason, staff: res.staff });
      GC.toast(`✅ ${session.stationName} 已作废 (by ${res.staff})`, 'success');
      render();
    } catch (err) {
      GC.toast('作废失败 / Failed: ' + err.message, 'error');
    }
  }

  function showOrderDetail(orderId) {
    const order = GC.Store.getOrder(orderId);
    if (!order) return;
    const items = GC.Store.getOrderItemsForOrder(orderId);
    const tenders = GC.Store.getOrderPaymentsFor ? GC.Store.getOrderPaymentsFor(orderId) : [];
    const sym = GC.Store.getSettings().currencySymbol;
    const customer = order.memberId
      ? (() => { const m = GC.Store.getMember(order.memberId); return m ? `${m.name} 💎 ${m.tier}` : '会员'; })()
      : (order.guestName || '散客');

    const itemsHtml = items.map(i => `
      <div class="order-item-row">
        <span class="oi-emoji">${i.emoji}</span>
        <div class="oi-info">
          <div>#${i.menuNo || '—'} ${i.nameZh}</div>
          <small>${i.nameEn || ''}</small>
        </div>
        <div class="oi-qty">×${i.quantity}</div>
        <div class="oi-sub">${sym}${i.subtotal.toFixed(2)}</div>
      </div>`).join('');

    // Split-bill tender breakdown (when paymentMethod=mixed)
    const tendersHtml = tenders.length > 1 ? `
      <div class="settlement-divider"></div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px">付款明细 / Tender Breakdown</div>
      ${tenders.map(t => `
        <div class="settlement-row" style="font-size:0.9rem">
          <span>${methodLabel(t.method)}</span>
          <span>${sym}${Number(t.amount).toFixed(2)}</span>
        </div>
      `).join('')}
    ` : '';

    // Extra charges + takeaway
    const extras = Array.isArray(order.extraCharges) ? order.extraCharges : [];
    const extrasHtml = extras.length > 0 || order.takeaway ? `
      <div class="settlement-divider"></div>
      ${order.takeaway ? `<div class="settlement-row" style="font-size:0.9rem"><span>🥡 外带打包</span><span>+${sym}${(order.takeawayCharge || 0.20).toFixed(2)}</span></div>` : ''}
      ${extras.map(e => `<div class="settlement-row" style="font-size:0.9rem"><span>${GC.esc(e.label)}</span><span>${e.amount >= 0 ? '+' : '−'}${sym}${Math.abs(Number(e.amount)).toFixed(2)}</span></div>`).join('')}
    ` : '';

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h3>订单 #${order.orderNo} ${order.status === 'voided' ? '<span class="voided-tag">已作废</span>' : ''}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="order-detail-meta">
              <div><span>时间:</span> ${new Date(order.completedAt || order.createdAt).toLocaleString('zh-CN')}</div>
              <div><span>客户:</span> ${customer}</div>
              <div><span>付款:</span> ${methodLabel(order.paymentMethod)}</div>
              ${order.cashier ? `<div><span>收银:</span> ${GC.esc(order.cashier)}</div>` : ''}
              ${order.note ? `<div><span>备注:</span> ${GC.esc(order.note)}</div>` : ''}
              ${order.deliveryPlatformTotal != null ? `<div><span>平台总额:</span> ${sym}${Number(order.deliveryPlatformTotal).toFixed(2)}</div>` : ''}
            </div>
            <div class="order-items-detail">${itemsHtml}</div>
            ${extrasHtml}
            <div class="settlement-divider"></div>
            <div class="settlement-row total"><span>合计 / Total</span><span>${sym}${order.total.toFixed(2)}</span></div>
            ${tendersHtml}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-close-btn">关闭</button>
            <button class="btn btn-secondary btn-sm" id="m-reprint"><i class="ti ti-printer"></i> 重打收据 / Reprint</button>
            ${order.status === 'completed' ? `<button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" id="m-void">作废订单</button>` : ''}
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-close-btn').onclick = close;
    // Tier 0.7: reprint — reuse the POS receipt renderer (order + items are
    // already in the cache; the receipt modal replaces this detail modal;
    // markup unchanged, only a click handler added here).
    const reprintBtn = document.getElementById('m-reprint');
    if (reprintBtn) {
      reprintBtn.onclick = () => {
        if (GC.POS && GC.POS.showReceipt) GC.POS.showReceipt(order, items, { reprint: true });
      };
    }
    const voidBtn = document.getElementById('m-void');
    if (voidBtn) {
      voidBtn.onclick = () => confirmAndVoidOrder(orderId);
    }
  }

  function destroy() {}
  return { render, destroy };
})();
