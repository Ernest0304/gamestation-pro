/**
 * POS — Point of Sale (Sample B "Boutique Cafe" style)
 *
 * Light themed F&B ordering interface scoped via `.pos-view` class.
 * Workflow: pick category → add items to cart → optional select member → pay
 */
window.GC = window.GC || {};

GC.POS = (function () {
  let activeCategoryId = null;
  let cart = [];   // [{ menuItemId, name, emoji, menuNo, unitPrice, quantity, note }]
  let selectedMemberId = null;
  let guestName = '';

  function tierIcon(t) { return ({ platinum: '💎', silver: '🥈', regular: '👤' })[t] || '👤'; }
  function tierLabel(t) { return ({ platinum: 'Platinum', silver: 'Silver', regular: 'Regular' })[t] || ''; }

  function cartTotal() {
    return cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  }
  function cartCount() {
    return cart.reduce((s, c) => s + c.quantity, 0);
  }

  function addToCart(menuItemId) {
    const item = GC.Store.getMenuItem(menuItemId);
    if (!item) return;
    const existing = cart.find(c => c.menuItemId === menuItemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        menuItemId: item.id,
        menuNo: item.menuNo,
        name: item.nameZh,
        nameEn: item.nameEn,
        emoji: item.emoji,
        unitPrice: item.price,
        quantity: 1,
      });
    }
    render();
  }

  function decreaseCart(menuItemId) {
    const i = cart.findIndex(c => c.menuItemId === menuItemId);
    if (i < 0) return;
    cart[i].quantity -= 1;
    if (cart[i].quantity <= 0) cart.splice(i, 1);
    render();
  }

  function removeFromCart(menuItemId) {
    cart = cart.filter(c => c.menuItemId !== menuItemId);
    render();
  }

  function clearCart() {
    cart = [];
    selectedMemberId = null;
    guestName = '';
    render();
  }

  /* ---- Render ---- */
  function render() {
    const cats = GC.Store.getMenuCategories();
    if (!activeCategoryId && cats.length > 0) activeCategoryId = cats[0].id;

    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;

    document.getElementById('main-content').innerHTML = `
      <div class="pos-view">
        <div class="pos-layout">
          ${renderMenuPanel(cats, sym)}
          ${renderCartPanel(sym)}
        </div>
      </div>`;

    bindEvents();
  }

  function renderMenuPanel(cats, sym) {
    const items = GC.Store.getMenuItems({ categoryId: activeCategoryId });

    const catTabs = cats.map(c => `
      <button class="pos-cat-pill ${c.id === activeCategoryId ? 'active' : ''}" data-cat="${c.id}">
        ${c.emoji} ${c.nameZh}
      </button>`).join('');

    let itemCards = '';
    if (items.length === 0) {
      itemCards = '<div class="pos-empty">这个分类还没有商品 / No items in this category</div>';
    } else {
      itemCards = items.map(i => {
        const inCart = cart.find(c => c.menuItemId === i.id);
        return `
          <div class="pos-item-card ${inCart ? 'in-cart' : ''}" data-id="${i.id}">
            ${i.isFeatured ? '<span class="pos-badge-rec">招牌</span>' : ''}
            ${inCart ? `<span class="pos-badge-qty">×${inCart.quantity}</span>` : ''}
            <span class="pos-item-emoji">${i.emoji}</span>
            <div class="pos-item-no">#${i.menuNo}</div>
            <div class="pos-item-name">${i.nameZh}</div>
            <div class="pos-item-name-en">${i.nameEn}</div>
            <div class="pos-item-bottom">
              <div class="pos-item-price">${sym}${i.price.toFixed(2)}</div>
              <button class="pos-add-btn" data-add="${i.id}">+</button>
            </div>
          </div>`;
      }).join('');
    }

    return `
      <div class="pos-menu-panel">
        <div class="pos-menu-top">
          <div class="pos-brand-title">郁香潭 · Yuu Xiang Dam</div>
          <div class="pos-brand-subtitle">handcrafted sweetness · 点单收银</div>
        </div>
        <div class="pos-category-bar">
          ${catTabs}
        </div>
        <div class="pos-search-row">
          <input type="text" id="pos-search" class="pos-search" placeholder="搜索菜品或输入编号 / Search name or #">
        </div>
        <div class="pos-menu-grid">
          ${itemCards}
        </div>
      </div>`;
  }

  function renderCartPanel(sym) {
    const total = cartTotal();
    const member = selectedMemberId ? GC.Store.getMember(selectedMemberId) : null;

    const cartRows = cart.length === 0
      ? '<div class="pos-cart-empty">购物车空空如也<br/><small>从左边选择商品加入</small></div>'
      : cart.map(c => `
          <div class="pos-cart-item">
            <span class="pos-ci-emoji">${c.emoji}</span>
            <div class="pos-ci-info">
              <div class="pos-ci-name">${c.name}</div>
              <div class="pos-ci-meta">#${c.menuNo} · ${sym}${c.unitPrice.toFixed(2)}</div>
            </div>
            <div class="pos-ci-qty">
              <button class="pos-qty-btn" data-dec="${c.menuItemId}">−</button>
              <span class="pos-qty-num">${c.quantity}</span>
              <button class="pos-qty-btn" data-inc="${c.menuItemId}">+</button>
            </div>
            <div class="pos-ci-price">${sym}${(c.unitPrice * c.quantity).toFixed(2)}</div>
            <button class="pos-ci-remove" data-rm="${c.menuItemId}" title="删除">×</button>
          </div>`).join('');

    let customerBlock;
    if (member) {
      customerBlock = `
        <div class="pos-member-pill">
          <div class="pos-member-icon">${member.name.charAt(0).toUpperCase()}</div>
          <div class="pos-member-info">
            <div class="pos-member-name">${tierIcon(member.tier)} ${member.name}</div>
            <div class="pos-member-tier">${tierLabel(member.tier)} 余额 Balance</div>
          </div>
          <div class="pos-member-bal">${sym}${member.balance.toFixed(2)}</div>
          <button class="pos-member-clear" id="pos-clear-member" title="移除">×</button>
        </div>`;
    } else {
      customerBlock = `
        <div class="pos-customer-empty">
          <button class="pos-btn-pick-member" id="pos-pick-member">
            👥 选择会员 / Select Member
          </button>
          <div class="pos-guest-row">
            <input type="text" class="pos-guest-input" id="pos-guest-name" placeholder="散客备注 (选填) / Guest name optional" value="${guestName}">
          </div>
        </div>`;
    }

    const canCheckout = cart.length > 0;
    const canMemberPay = member && member.balance >= total;

    return `
      <div class="pos-cart-panel">
        <div class="pos-cart-top">
          <div class="pos-cart-title-row">
            <div class="pos-cart-title">订单 · Order</div>
            <button class="pos-cart-clear" id="pos-cart-clear" ${cart.length === 0 ? 'disabled' : ''}>清空</button>
          </div>
          ${customerBlock}
        </div>

        <div class="pos-cart-list">
          ${cartRows}
        </div>

        <div class="pos-totals-block">
          <div class="pos-tr"><span>商品 / Items</span><span>${cartCount()}</span></div>
          <div class="pos-tr"><span>小计 / Subtotal</span><span>${sym}${total.toFixed(2)}</span></div>
          <div class="pos-tr grand">
            <span>应收 / Total</span>
            <span>${sym}${total.toFixed(2)}</span>
          </div>

          <div class="pos-pay-options">
            ${member ? `
              <button class="pos-pay-btn primary" id="pay-balance" ${!canMemberPay ? 'disabled' : ''}>
                💎 扣余额 / Member Pay
                ${!canMemberPay && member ? '<div class="pos-pay-warn">余额不足</div>' : ''}
              </button>
            ` : ''}
            <button class="pos-pay-btn ${member ? '' : 'primary'}" id="pay-cash" ${!canCheckout ? 'disabled' : ''}>💵 现金 Cash</button>
            <button class="pos-pay-btn" id="pay-paynow" ${!canCheckout ? 'disabled' : ''}>📱 PayNow</button>
          </div>
        </div>
      </div>`;
  }

  /* ---- Events ---- */
  function bindEvents() {
    // Category tabs
    document.querySelectorAll('.pos-cat-pill').forEach(b => {
      b.addEventListener('click', () => {
        activeCategoryId = parseInt(b.dataset.cat);
        render();
      });
    });

    // Add to cart
    document.querySelectorAll('[data-add]').forEach(b =>
      b.addEventListener('click', e => {
        e.stopPropagation();
        addToCart(b.dataset.add);
      }));

    // Click whole card adds to cart
    document.querySelectorAll('.pos-item-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        addToCart(card.dataset.id);
      });
    });

    // Cart qty + / -
    document.querySelectorAll('[data-inc]').forEach(b =>
      b.addEventListener('click', () => addToCart(b.dataset.inc)));
    document.querySelectorAll('[data-dec]').forEach(b =>
      b.addEventListener('click', () => decreaseCart(b.dataset.dec)));
    document.querySelectorAll('[data-rm]').forEach(b =>
      b.addEventListener('click', () => removeFromCart(b.dataset.rm)));

    // Clear cart
    const clearBtn = document.getElementById('pos-cart-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm('清空购物车？/ Clear cart?')) clearCart();
    });

    // Customer
    const pickBtn = document.getElementById('pos-pick-member');
    if (pickBtn) pickBtn.addEventListener('click', showMemberPicker);
    const clearMember = document.getElementById('pos-clear-member');
    if (clearMember) clearMember.addEventListener('click', () => {
      selectedMemberId = null;
      render();
    });
    const guestInput = document.getElementById('pos-guest-name');
    if (guestInput) guestInput.addEventListener('input', e => { guestName = e.target.value; });

    // Payment buttons
    const payBal = document.getElementById('pay-balance');
    const payCash = document.getElementById('pay-cash');
    const payNow = document.getElementById('pay-paynow');
    if (payBal) payBal.addEventListener('click', () => checkout('member_balance'));
    if (payCash) payCash.addEventListener('click', () => checkout('cash'));
    if (payNow) payNow.addEventListener('click', () => checkout('paynow'));

    // Search
    const search = document.getElementById('pos-search');
    if (search) {
      search.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          const q = search.value.trim();
          if (!q) return;
          // Try by menu_no first
          const byNo = /^#?\d+$/.test(q) ? GC.Store.getMenuItemByNo(q.replace('#', '')) : null;
          if (byNo) { addToCart(byNo.id); search.value = ''; return; }
          // Fall back to name match
          const items = GC.Store.getMenuItems();
          const match = items.find(i => i.nameZh.includes(q) || (i.nameEn || '').toLowerCase().includes(q.toLowerCase()));
          if (match) { addToCart(match.id); search.value = ''; }
          else GC.toast(`没找到 "${q}" / Not found`, 'error');
        }
      });
    }
  }

  /* ---- Member picker modal ---- */
  function showMemberPicker() {
    const members = GC.Store.getMembers();
    const sym = GC.Store.getSettings().currencySymbol;
    let q = '';

    const buildList = (filter) => {
      const f = filter.toLowerCase().trim();
      const filtered = !f ? members : members.filter(m =>
        m.name.toLowerCase().includes(f) ||
        (m.phone || '').includes(f) ||
        (m.bindCode || '').toLowerCase().includes(f)
      );
      // Sort: balance > 0 first, then by tier
      const order = { platinum: 0, silver: 1, regular: 2 };
      filtered.sort((a, b) => {
        if ((b.balance > 0) !== (a.balance > 0)) return b.balance - a.balance > 0 ? 1 : -1;
        return (order[a.tier] ?? 3) - (order[b.tier] ?? 3);
      });
      if (filtered.length === 0) {
        return '<div class="pos-member-pick-empty">没有匹配的会员 / No match</div>';
      }
      return filtered.map(m => `
        <div class="pos-member-pick-row" data-mid="${m.id}">
          <div class="pos-pick-avatar ${m.tier}">${m.name.charAt(0).toUpperCase()}</div>
          <div class="pos-pick-info">
            <div class="pos-pick-name">${tierIcon(m.tier)} ${m.name}</div>
            <div class="pos-pick-meta">${m.phone || '—'} · ${tierLabel(m.tier)}</div>
          </div>
          <div class="pos-pick-bal ${m.balance <= 0 ? 'zero' : ''}">${sym}${m.balance.toFixed(2)}</div>
        </div>`).join('');
    };

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-wide pos-modal">
          <div class="modal-header">
            <h3>选择会员 / Select Member</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <input type="text" id="pos-pick-search" class="form-input" placeholder="搜索姓名/手机号/绑定码 / Search..." autofocus>
            <div class="pos-member-pick-list" id="pos-pick-list">${buildList('')}</div>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;

    const list = document.getElementById('pos-pick-list');
    document.getElementById('pos-pick-search').addEventListener('input', e => {
      list.innerHTML = buildList(e.target.value);
      bindPickRows();
    });

    function bindPickRows() {
      list.querySelectorAll('.pos-member-pick-row').forEach(row => {
        row.addEventListener('click', () => {
          selectedMemberId = row.dataset.mid;
          close();
          render();
        });
      });
    }
    bindPickRows();
  }

  /* ---- Checkout ---- */
  async function checkout(method) {
    if (cart.length === 0) return;
    const total = cartTotal();
    const sym = GC.Store.getSettings().currencySymbol;

    if (method === 'member_balance' && !selectedMemberId) {
      GC.toast('请先选择会员 / Select a member first', 'error');
      return;
    }

    // Confirm
    const memberName = selectedMemberId ? GC.Store.getMember(selectedMemberId).name : null;
    const methodLabel = ({ cash: '现金 Cash', paynow: 'PayNow', member_balance: `会员余额 (${memberName})` })[method];
    if (!confirm(`确认结账？\nConfirm checkout?\n\n金额: ${sym}${total.toFixed(2)}\n方式: ${methodLabel}`)) return;

    try {
      const cartPayload = cart.map(c => ({
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        note: c.note,
      }));

      const result = await GC.Store.createOrder({
        memberId: selectedMemberId,
        guestName: guestName || null,
        cart: cartPayload,
        payment: { method },
      });

      GC.toast(`订单 #${result.order.orderNo} 完成 · ${sym}${total.toFixed(2)}`, 'success');
      showReceipt(result.order, result.items);

      // Clear after a moment
      clearCart();
    } catch (e) {
      GC.toast('结账失败 / Failed: ' + e.message, 'error');
    }
  }

  /* ---- Receipt modal ---- */
  function showReceipt(order, items) {
    const sym = GC.Store.getSettings().currencySymbol;
    const fmtTime = ts => new Date(ts).toLocaleString('zh-CN', { hour12: false });
    const member = order.memberId ? GC.Store.getMember(order.memberId) : null;
    const methodLabel = ({
      cash: '现金 Cash',
      paynow: 'PayNow',
      member_balance: '会员余额 Member Balance',
      card: '信用卡 Card',
    })[order.paymentMethod] || order.paymentMethod;

    const lines = items.map(i => `
      <div class="rcpt-line">
        <div class="rcpt-name">
          <span>#${i.menuNo || '—'} ${i.nameZh} ${i.emoji}</span>
          <span class="rcpt-qty">× ${i.quantity}</span>
        </div>
        <div class="rcpt-amt">${sym}${i.subtotal.toFixed(2)}</div>
      </div>`).join('');

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content pos-receipt-modal">
          <div class="receipt">
            <div class="rcpt-header">
              <div class="rcpt-brand">郁香潭 · Yuu Xiang Dam</div>
              <div class="rcpt-meta">订单号 Order #${order.orderNo}</div>
              <div class="rcpt-meta">${fmtTime(order.completedAt || order.createdAt)}</div>
            </div>
            ${member ? `<div class="rcpt-meta">会员 / Member: ${member.name} ${tierIcon(member.tier)}</div>` : (order.guestName ? `<div class="rcpt-meta">客户 / Guest: ${order.guestName}</div>` : '')}
            <div class="rcpt-divider"></div>
            ${lines}
            <div class="rcpt-divider"></div>
            <div class="rcpt-line grand">
              <span>合计 / Total</span>
              <span>${sym}${order.total.toFixed(2)}</span>
            </div>
            <div class="rcpt-meta">付款方式 / Paid via: ${methodLabel}</div>
            ${member && order.paymentMethod === 'member_balance' ? `<div class="rcpt-meta">余额 / Balance: ${sym}${member.balance.toFixed(2)}</div>` : ''}
            <div class="rcpt-footer">感谢光临 · Thank you ❤️</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="r-close">关闭 / Close</button>
            <button class="btn btn-primary" id="r-print">🖨️ 打印 / Print</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');
    document.getElementById('r-close').onclick = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('r-print').onclick = () => window.print();
  }

  function destroy() {}

  return { render, destroy };
})();
