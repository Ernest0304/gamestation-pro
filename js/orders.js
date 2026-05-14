/**
 * Orders — F&B order history and details.
 */
window.GC = window.GC || {};

GC.Orders = (function () {
  let selectedDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();
  let statusFilter = 'all'; // all | completed | voided

  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  function fmtDate(ts) { return new Date(ts).toLocaleDateString('zh-CN'); }

  function methodLabel(m) {
    return ({
      cash: '现金',
      paynow: 'PayNow',
      member_balance: '会员余额',
      card: '信用卡',
      mixed: '混合',
      pending: '待付款',
    })[m] || m;
  }

  function getFiltered() {
    const start = new Date(selectedDate + 'T00:00:00').getTime();
    const end = start + 86400000;
    return GC.Store.getOrders().filter(o => {
      const t = o.completedAt || o.createdAt;
      if (t < start || t >= end) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      return true;
    });
  }

  function render() {
    const orders = getFiltered();
    const sym = GC.Store.getSettings().currencySymbol;

    const completed = orders.filter(o => o.status === 'completed');
    const totalRev = completed.reduce((s, o) => s + o.total, 0);
    const totalOrders = completed.length;
    const totalItems = completed.reduce((s, o) => s + GC.Store.getOrderItemsForOrder(o.id).reduce((q, i) => q + i.quantity, 0), 0);

    let rows;
    if (orders.length === 0) {
      rows = `<tr><td colspan="6" class="table-empty">这一天没有订单 / No orders</td></tr>`;
    } else {
      rows = orders.map(o => {
        const items = GC.Store.getOrderItemsForOrder(o.id);
        const itemSummary = items.slice(0, 3).map(i => `${i.emoji}${i.quantity > 1 ? '×' + i.quantity : ''}`).join(' ');
        const moreItems = items.length > 3 ? ` +${items.length - 3}` : '';
        const customer = o.memberId
          ? (() => { const m = GC.Store.getMember(o.memberId); return m ? `${m.name} 💎` : '会员'; })()
          : (o.guestName || '散客');
        return `
          <tr data-order="${o.id}" class="${o.status === 'voided' ? 'voided' : ''}">
            <td><strong>#${o.orderNo}</strong></td>
            <td>${fmtTime(o.completedAt || o.createdAt)}</td>
            <td>${customer}</td>
            <td><div class="order-items-preview">${itemSummary}${moreItems}</div></td>
            <td><span class="payment-tag ${o.paymentMethod}">${methodLabel(o.paymentMethod)}</span></td>
            <td><strong>${sym}${o.total.toFixed(2)}</strong> ${o.status === 'voided' ? '<span class="voided-tag">已作废</span>' : ''}</td>
          </tr>`;
      }).join('');
    }

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">订单历史 / Orders</h2>
        <div class="filter-bar">
          <input type="date" id="order-date" class="form-input" value="${selectedDate}">
          <select id="status-filter" class="form-input">
            <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>全部</option>
            <option value="completed" ${statusFilter === 'completed' ? 'selected' : ''}>已完成</option>
            <option value="voided" ${statusFilter === 'voided' ? 'selected' : ''}>已作废</option>
          </select>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-label">订单数 / Orders</span>
          <span class="stat-value muted">${totalOrders}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">售出商品 / Items Sold</span>
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
              <th>订单号</th>
              <th>时间</th>
              <th>客户</th>
              <th>商品</th>
              <th>付款</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('order-date').addEventListener('change', e => {
      selectedDate = e.target.value;
      render();
    });
    document.getElementById('status-filter').addEventListener('change', e => {
      statusFilter = e.target.value;
      render();
    });
    document.querySelectorAll('[data-order]').forEach(r => {
      r.addEventListener('click', () => showOrderDetail(r.dataset.order));
    });
  }

  function showOrderDetail(orderId) {
    const order = GC.Store.getOrder(orderId);
    if (!order) return;
    const items = GC.Store.getOrderItemsForOrder(orderId);
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
              ${order.note ? `<div><span>备注:</span> ${order.note}</div>` : ''}
            </div>
            <div class="order-items-detail">${itemsHtml}</div>
            <div class="settlement-divider"></div>
            <div class="settlement-row total"><span>合计 / Total</span><span>${sym}${order.total.toFixed(2)}</span></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-close-btn">关闭</button>
            ${order.status === 'completed' ? `<button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" id="m-void">作废订单</button>` : ''}
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-close-btn').onclick = close;
    const voidBtn = document.getElementById('m-void');
    if (voidBtn) {
      voidBtn.onclick = async () => {
        const refundMsg = order.paymentMethod === 'member_balance'
          ? '\n会员余额将自动退回 / Member balance will be refunded.' : '';
        const ok = await GC.confirm(
          `订单 #${order.orderNo} 将被作废${refundMsg}`,
          { title: '作废订单 / Void Order', danger: true, confirmText: '作废 / Void' }
        );
        if (!ok) return;
        await GC.Store.voidOrder(orderId);
        GC.toast('已作废 / Voided', 'success');
        close();
        render();
      };
    }
  }

  function destroy() {}
  return { render, destroy };
})();
