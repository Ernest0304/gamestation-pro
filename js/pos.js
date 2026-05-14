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
  // Discount applied to cart (cleared on checkout/cart-clear)
  // { type: 'percent'|'fixed', value: number, reason: string }
  let discount = null;

  function tierIcon(t) { return ({ platinum: '💎', silver: '🥈', regular: '👤' })[t] || '👤'; }
  function tierLabel(t) { return ({ platinum: 'Platinum', silver: 'Silver', regular: 'Regular' })[t] || ''; }

  function cartSubtotal() {
    return cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  }
  function discountAmount() {
    if (!discount) return 0;
    const sub = cartSubtotal();
    if (discount.type === 'percent') {
      return Math.min(sub, Math.round(sub * (discount.value / 100) * 100) / 100);
    }
    return Math.min(sub, Math.round(discount.value * 100) / 100);
  }
  function cartTotal() {
    return Math.max(0, Math.round((cartSubtotal() - discountAmount()) * 100) / 100);
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
    discount = null;
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
        // Photo if uploaded/cropped; emoji fallback for missing ones.
        // onerror swaps to emoji if the file 404s (handles legacy items)
        const visual = i.photoUrl
          ? `<div class="pos-item-photo"><img src="${GC.esc(i.photoUrl)}" alt="${GC.esc(i.nameZh)}" onerror="this.parentElement.innerHTML='<span class=&quot;pos-item-emoji&quot;>${i.emoji}</span>'"></div>`
          : `<span class="pos-item-emoji">${i.emoji}</span>`;
        return `
          <div class="pos-item-card ${inCart ? 'in-cart' : ''}" data-id="${i.id}">
            ${i.isFeatured ? '<span class="pos-badge-rec">招牌</span>' : ''}
            ${inCart ? `<span class="pos-badge-qty">×${inCart.quantity}</span>` : ''}
            ${visual}
            <div class="pos-item-no">#${i.menuNo}</div>
            <div class="pos-item-name">${GC.esc(i.nameZh)}</div>
            <div class="pos-item-name-en">${GC.esc(i.nameEn)}</div>
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
    const subtotal = cartSubtotal();
    const discountVal = discountAmount();
    const total = cartTotal();
    const member = selectedMemberId ? GC.Store.getMember(selectedMemberId) : null;

    const cartRows = cart.length === 0
      ? '<div class="pos-cart-empty">购物车空空如也<br/><small>从左边选择商品加入</small></div>'
      : cart.map(c => `
          <div class="pos-cart-item">
            <span class="pos-ci-emoji">${c.emoji}</span>
            <div class="pos-ci-info">
              <div class="pos-ci-name">${GC.esc(c.name)}</div>
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
          <div class="pos-tr"><span>小计 / Subtotal</span><span>${sym}${subtotal.toFixed(2)}</span></div>
          ${discount ? `
            <div class="pos-tr discount-line">
              <span>
                折扣 / Discount
                <small>(${discount.type === 'percent' ? discount.value + '%' : sym + discount.value.toFixed(2)}${discount.reason ? ' · ' + GC.esc(discount.reason) : ''})</small>
                <button class="pos-discount-remove" id="pos-discount-remove" title="移除折扣">×</button>
              </span>
              <span class="discount-amount">−${sym}${discountVal.toFixed(2)}</span>
            </div>
          ` : `
            <div class="pos-discount-row">
              <button class="pos-discount-btn" id="pos-add-discount" ${!canCheckout ? 'disabled' : ''}>
                🏷️ 加折扣 / Add Discount
              </button>
            </div>
          `}
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
    if (clearBtn) clearBtn.addEventListener('click', async () => {
      if (cart.length === 0) return;
      const ok = await GC.confirm('清空购物车？\nClear cart?', { danger: true, confirmText: '清空 / Clear' });
      if (ok) clearCart();
    });

    // Discount
    const discBtn = document.getElementById('pos-add-discount');
    if (discBtn) discBtn.addEventListener('click', showDiscountModal);
    const discRm = document.getElementById('pos-discount-remove');
    if (discRm) discRm.addEventListener('click', () => { discount = null; render(); });

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

  /* ---- Discount modal ---- */
  function showDiscountModal() {
    const sym = GC.Store.getSettings().currencySymbol;
    const subtotal = cartSubtotal();
    if (subtotal <= 0) {
      GC.toast('购物车空空 / Cart is empty', 'error');
      return;
    }

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-discount">
          <div class="modal-header">
            <h3>🏷️ 折扣 / Discount</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="discount-current">
              <span>小计 / Subtotal</span>
              <span class="discount-sub">${sym}${subtotal.toFixed(2)}</span>
            </div>

            <div class="discount-type-tabs">
              <button class="discount-tab-btn active" data-mode="percent">% 百分比</button>
              <button class="discount-tab-btn" data-mode="fixed">${sym} 固定金额</button>
            </div>

            <div class="form-group" style="margin-top:14px">
              <label class="form-label">数额 / Amount</label>
              <div class="rate-input-group" style="max-width:200px">
                <span class="rate-prefix" id="disc-prefix">%</span>
                <input type="number" id="disc-value" class="form-input settings-input" min="0" step="1" placeholder="0" autofocus>
              </div>
              <div class="discount-quick" style="margin-top:8px">
                <button class="discount-quick-btn" data-quick="5">5%</button>
                <button class="discount-quick-btn" data-quick="10">10%</button>
                <button class="discount-quick-btn" data-quick="15">15%</button>
                <button class="discount-quick-btn" data-quick="20">20%</button>
                <button class="discount-quick-btn" data-quick="50">50%</button>
                <button class="discount-quick-btn" data-quick="100">免单 Free</button>
              </div>
              <!-- Touch-friendly numpad — same as cash modal -->
              <div class="cash-numpad" style="margin-top:10px;max-width:280px">
                <button class="np-btn" data-disc-digit="1">1</button>
                <button class="np-btn" data-disc-digit="2">2</button>
                <button class="np-btn" data-disc-digit="3">3</button>
                <button class="np-btn" data-disc-digit="4">4</button>
                <button class="np-btn" data-disc-digit="5">5</button>
                <button class="np-btn" data-disc-digit="6">6</button>
                <button class="np-btn" data-disc-digit="7">7</button>
                <button class="np-btn" data-disc-digit="8">8</button>
                <button class="np-btn" data-disc-digit="9">9</button>
                <button class="np-btn dot" data-disc-digit=".">.</button>
                <button class="np-btn" data-disc-digit="0">0</button>
                <button class="np-btn back" data-disc-back>⌫</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">原因 / Reason</label>
              <select id="disc-reason" class="form-input">
                <option value="">— 选择或自定义 / pick or custom —</option>
                <option value="vip">VIP 优惠</option>
                <option value="staff">员工招待</option>
                <option value="complaint">客诉补偿</option>
                <option value="comp">朋友/家人</option>
                <option value="promo">促销活动</option>
                <option value="other">其他 (填备注)</option>
              </select>
            </div>

            <div class="form-group" id="disc-note-group" style="display:none">
              <label class="form-label">备注 / Note</label>
              <input type="text" id="disc-note" class="form-input" placeholder="例：常客 8 折">
            </div>

            <div class="discount-preview" id="disc-preview"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok" disabled>应用折扣 / Apply</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    let mode = 'percent';
    const valInput = document.getElementById('disc-value');
    const prefix = document.getElementById('disc-prefix');
    const preview = document.getElementById('disc-preview');
    const okBtn = document.getElementById('m-ok');
    const reasonSel = document.getElementById('disc-reason');
    const noteGroup = document.getElementById('disc-note-group');

    const updatePreview = () => {
      const v = parseFloat(valInput.value) || 0;
      if (v <= 0) {
        preview.innerHTML = '';
        okBtn.disabled = true;
        return;
      }
      let off;
      if (mode === 'percent') {
        if (v > 100) { preview.innerHTML = '<div class="discount-warn">百分比不可超过 100% / Max 100%</div>'; okBtn.disabled = true; return; }
        off = subtotal * (v / 100);
      } else {
        off = Math.min(subtotal, v);
      }
      const newTotal = Math.max(0, subtotal - off);
      preview.innerHTML = `
        <div class="discount-preview-card">
          <div>原价 / Subtotal: <strong>${sym}${subtotal.toFixed(2)}</strong></div>
          <div>折扣 / Off: <strong style="color:var(--red)">−${sym}${off.toFixed(2)}</strong></div>
          <div class="summary-divider"></div>
          <div>应收 / Total: <strong class="balance-after">${sym}${newTotal.toFixed(2)}</strong></div>
        </div>`;
      okBtn.disabled = false;
    };

    modal.querySelectorAll('.discount-tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        modal.querySelectorAll('.discount-tab-btn').forEach(x => x.classList.toggle('active', x === b));
        mode = b.dataset.mode;
        prefix.textContent = mode === 'percent' ? '%' : sym;
        // Update quick btns
        modal.querySelectorAll('.discount-quick-btn').forEach(qb => {
          const q = qb.dataset.quick;
          qb.textContent = mode === 'percent'
            ? (q === '100' ? '免单 Free' : q + '%')
            : sym + q;
        });
        updatePreview();
      });
    });

    valInput.addEventListener('input', updatePreview);

    modal.querySelectorAll('.discount-quick-btn').forEach(b => {
      b.addEventListener('click', () => {
        valInput.value = b.dataset.quick;
        updatePreview();
      });
    });

    // Numpad — touch-friendly entry on iPad
    modal.querySelectorAll('.np-btn').forEach(b => {
      b.addEventListener('click', () => {
        if (b.hasAttribute('data-disc-back')) {
          valInput.value = valInput.value.slice(0, -1);
        } else {
          const d = b.dataset.discDigit;
          if (d === '.' && valInput.value.includes('.')) return;
          valInput.value = (valInput.value || '') + d;
        }
        updatePreview();
        valInput.focus();
      });
    });

    reasonSel.addEventListener('change', () => {
      noteGroup.style.display = reasonSel.value === 'other' ? 'block' : 'none';
    });

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    okBtn.onclick = async () => {
      const v = parseFloat(valInput.value) || 0;
      if (v <= 0) return;
      if (mode === 'percent' && v > 100) return;
      const reasonKey = reasonSel.value;
      const reasonLabels = {
        vip: 'VIP 优惠',
        staff: '员工招待',
        complaint: '客诉补偿',
        comp: '朋友/家人',
        promo: '促销活动',
      };
      let reason = reasonLabels[reasonKey] || '';
      if (reasonKey === 'other') {
        reason = (document.getElementById('disc-note').value || '').trim() || 'other';
      }
      discount = { type: mode, value: v, reason };
      close();
      render();
      GC.toast(
        mode === 'percent' ? `已应用 ${v}% 折扣` : `已应用 ${sym}${v} 折扣`,
        'success'
      );
    };
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

    // Cash needs special flow: ask how much customer paid, show change
    let cashReceived = null;
    let changeGiven = null;
    if (method === 'cash') {
      const result = await showCashModal(total);
      if (!result) return; // cancelled
      cashReceived = result.received;
      changeGiven = result.change;
    } else {
      // For PayNow / Member balance: simple confirm
      const memberName = selectedMemberId ? GC.Store.getMember(selectedMemberId).name : null;
      const methodLabel = ({ paynow: 'PayNow', member_balance: `会员余额 (${memberName})` })[method];
      const ok = await GC.confirm(
        `金额 / Amount: ${sym}${total.toFixed(2)}\n方式 / Method: ${methodLabel}`,
        { title: '确认结账 / Confirm Checkout', confirmText: '确认 / Confirm' }
      );
      if (!ok) return;
    }

    try {
      const cartPayload = cart.map(c => ({
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        note: c.note,
      }));

      // Build cash note for audit trail
      let cashNote = null;
      if (method === 'cash' && cashReceived != null) {
        cashNote = `收 ${sym}${cashReceived.toFixed(2)} 找 ${sym}${changeGiven.toFixed(2)}`;
      }

      const result = await GC.Store.createOrder({
        memberId: selectedMemberId,
        guestName: guestName || null,
        cart: cartPayload,
        payment: { method },
        discount: discount ? { ...discount, amount: discountAmount() } : null,
        note: cashNote,
      });

      GC.toast(`订单 #${result.order.orderNo} 完成 · ${sym}${total.toFixed(2)}`, 'success');
      // Attach cash receipt info to the receipt for printing
      result.order._cashReceived = cashReceived;
      result.order._changeGiven = changeGiven;
      showReceipt(result.order, result.items);

      clearCart();
    } catch (e) {
      GC.toast('结账失败 / Failed: ' + e.message, 'error');
    }
  }

  /* ---- Cash payment modal with change calculator ---- */
  function showCashModal(totalDue) {
    return new Promise(resolve => {
      const sym = GC.Store.getSettings().currencySymbol;
      // Smart quick-tender suggestions: exact, round up to nearest $5/$10/$20/$50/$100
      const presets = [
        totalDue,
        Math.ceil(totalDue / 5) * 5,
        Math.ceil(totalDue / 10) * 10,
        Math.ceil(totalDue / 20) * 20,
        Math.ceil(totalDue / 50) * 50,
        Math.ceil(totalDue / 100) * 100,
      ].filter((v, i, arr) => arr.indexOf(v) === i && v >= totalDue);

      const modal = document.getElementById('modal');
      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-cash">
            <div class="modal-header">
              <h3>💵 现金支付 / Cash Payment</h3>
              <button class="modal-close" id="m-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="cash-due-line">
                <span>应收 / Total Due</span>
                <span class="cash-due-amount">${sym}${totalDue.toFixed(2)}</span>
              </div>

              <div class="form-group" style="margin-top:18px">
                <label class="form-label">客人付了多少 / Cash Received</label>
                <div class="rate-input-group" style="max-width:240px">
                  <span class="rate-prefix">${sym}</span>
                  <input type="number" id="cash-received" class="form-input settings-input"
                    min="${totalDue}" step="0.10" placeholder="${totalDue.toFixed(2)}"
                    style="font-size:1.5rem;font-weight:700;width:160px;text-align:right" autofocus>
                </div>
                <div class="cash-presets">
                  ${presets.map(p => `<button class="cash-preset-btn" data-amount="${p}">${sym}${p}</button>`).join('')}
                </div>
              </div>

              <div class="cash-change-box" id="cash-change-box">
                <div class="cash-change-label">应找 / Change</div>
                <div class="cash-change-amount" id="cash-change-amount">${sym}0.00</div>
              </div>

              <div class="cash-numpad">
                <button class="np-btn" data-digit="1">1</button>
                <button class="np-btn" data-digit="2">2</button>
                <button class="np-btn" data-digit="3">3</button>
                <button class="np-btn" data-digit="4">4</button>
                <button class="np-btn" data-digit="5">5</button>
                <button class="np-btn" data-digit="6">6</button>
                <button class="np-btn" data-digit="7">7</button>
                <button class="np-btn" data-digit="8">8</button>
                <button class="np-btn" data-digit="9">9</button>
                <button class="np-btn dot" data-digit=".">.</button>
                <button class="np-btn" data-digit="0">0</button>
                <button class="np-btn back" data-back>⌫</button>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
              <button class="btn btn-primary" id="m-ok" disabled>确认收款 / Confirm</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');

      const input = document.getElementById('cash-received');
      const changeEl = document.getElementById('cash-change-amount');
      const changeBox = document.getElementById('cash-change-box');
      const okBtn = document.getElementById('m-ok');

      const updateChange = () => {
        const received = parseFloat(input.value) || 0;
        const change = received - totalDue;
        changeEl.textContent = `${sym}${change.toFixed(2)}`;
        if (received < totalDue) {
          changeBox.classList.add('insufficient');
          changeEl.textContent = `差 ${sym}${(totalDue - received).toFixed(2)}`;
          okBtn.disabled = true;
        } else {
          changeBox.classList.remove('insufficient');
          okBtn.disabled = false;
        }
      };

      input.addEventListener('input', updateChange);

      // Preset buttons
      modal.querySelectorAll('.cash-preset-btn').forEach(b => {
        b.addEventListener('click', () => {
          input.value = b.dataset.amount;
          updateChange();
          input.focus();
        });
      });

      // Numpad (for touch screens)
      modal.querySelectorAll('.np-btn').forEach(b => {
        b.addEventListener('click', () => {
          if (b.hasAttribute('data-back')) {
            input.value = input.value.slice(0, -1);
          } else {
            const d = b.dataset.digit;
            if (d === '.' && input.value.includes('.')) return;
            input.value = (input.value || '') + d;
          }
          updateChange();
        });
      });

      const done = (result) => {
        modal.classList.remove('show'); modal.innerHTML = ''; resolve(result);
      };
      document.getElementById('m-close').onclick = () => done(null);
      document.getElementById('m-cancel').onclick = () => done(null);
      okBtn.onclick = () => {
        const received = parseFloat(input.value) || 0;
        if (received < totalDue) return;
        done({ received: Math.round(received * 100) / 100, change: Math.round((received - totalDue) * 100) / 100 });
      };

      // Initial focus + clear placeholder
      setTimeout(() => input.focus(), 50);
    });
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
            ${order._cashReceived != null ? `
              <div class="rcpt-line"><span>收 / Tendered</span><span>${sym}${order._cashReceived.toFixed(2)}</span></div>
              <div class="rcpt-line"><span>找 / Change</span><span>${sym}${order._changeGiven.toFixed(2)}</span></div>
            ` : ''}
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
