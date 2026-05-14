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
  // Wave B (Migration 008): takeaway flag + ad-hoc extra charges
  let takeaway = false;
  let extraCharges = [];     // [{ label, amount }]
  const TAKEAWAY_FEE = 0.20; // SG per-order box fee

  function tierIcon(t) { return ({ platinum: '💎', silver: '🥈', regular: '👤' })[t] || '👤'; }
  function tierLabel(t) { return ({ platinum: 'Platinum', silver: 'Silver', regular: 'Regular' })[t] || ''; }

  function takeawayAmount() { return takeaway ? TAKEAWAY_FEE : 0; }
  function extrasAmount() {
    return Math.round(extraCharges.reduce((s, e) => s + Number(e.amount || 0), 0) * 100) / 100;
  }
  function cartSubtotal() {
    // Items + takeaway box + extra charges. Discount applies AFTER.
    const items = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    return Math.round((items + takeawayAmount() + extrasAmount()) * 100) / 100;
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
    takeaway = false;
    extraCharges = [];
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
          <div class="pos-tr"><span>小计 / Subtotal</span><span>${sym}${cart.reduce((s,c) => s + c.unitPrice * c.quantity, 0).toFixed(2)}</span></div>

          <div class="pos-tr takeaway-row">
            <span>
              <label class="pos-takeaway-toggle">
                <input type="checkbox" id="pos-takeaway" ${takeaway ? 'checked' : ''} ${!canCheckout ? 'disabled' : ''}>
                <span>🥡 外带打包 / Takeaway</span>
              </label>
            </span>
            <span class="${takeaway ? '' : 'pos-muted'}">+ ${sym}${TAKEAWAY_FEE.toFixed(2)}</span>
          </div>

          ${extraCharges.length > 0 ? extraCharges.map((e, i) => `
            <div class="pos-tr extra-charge-line">
              <span>
                ${GC.esc(e.label)}
                <button class="pos-discount-remove" data-rm-extra="${i}" title="移除">×</button>
              </span>
              <span class="${e.amount >= 0 ? '' : 'discount-amount'}">${e.amount >= 0 ? '＋' : '−'}${sym}${Math.abs(e.amount).toFixed(2)}</span>
            </div>
          `).join('') : ''}

          <div class="pos-discount-row">
            <button class="pos-discount-btn" id="pos-add-charge" ${!canCheckout ? 'disabled' : ''}>
              ➕ 加收费 / Add Charge
            </button>
          </div>

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

          <button class="pos-checkout-btn" id="pos-checkout" ${!canCheckout ? 'disabled' : ''}>
            <span class="pos-checkout-arrow">→</span>
            <span class="pos-checkout-label">结账 / Pay</span>
            <span class="pos-checkout-amount">${sym}${total.toFixed(2)}</span>
          </button>
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

    // Takeaway toggle
    const tw = document.getElementById('pos-takeaway');
    if (tw) tw.addEventListener('change', e => { takeaway = e.target.checked; render(); });

    // Add custom charge
    const addCharge = document.getElementById('pos-add-charge');
    if (addCharge) addCharge.addEventListener('click', showAddChargeModal);
    document.querySelectorAll('[data-rm-extra]').forEach(b => {
      b.addEventListener('click', () => {
        extraCharges.splice(parseInt(b.dataset.rmExtra), 1);
        render();
      });
    });

    // Single checkout button → opens pay sheet (Option C 2026-05-14)
    const checkoutBtn = document.getElementById('pos-checkout');
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => showPaySheet());

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
        takeaway,
        extraCharges,
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

  /* ---- Delivery checkout (Grab / FoodPanda) ----
     Smart flow: cashier confirms items match the platform order, then enters
     the platform's total. System computes diff vs in-store price and adds
     it as an "外卖差额" extra-charge line so the order total matches the
     platform's invoice.
  */
  async function checkoutDelivery(platform) {
    if (cart.length === 0) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const inStoreTotal = cartTotal();
    const label = platform === 'grab' ? '🛵 Grab' : '🐼 FoodPanda';

    // Step 1: ask for the platform's total
    const platformTotal = await showAmountNumpadModal({
      title: `${label} — 平台账单总额 / Platform Total`,
      maxAmount: inStoreTotal * 5,   // generous ceiling, allowExceed
      sym,
      hint: `本店金额 ${sym}${inStoreTotal.toFixed(2)}。请输入平台显示的应收总额，系统会自动加差额。`,
      allowExceed: true,
    });
    if (platformTotal == null) return;

    // Step 2: compute diff. Positive diff → add as extra charge.
    // Negative diff (platform charges less) → also record as negative extra
    // so the books balance. Tiny (|diff|<0.01) → skip the extra line.
    const diff = Math.round((platformTotal - inStoreTotal) * 100) / 100;
    let appliedExtras = extraCharges.slice();
    if (Math.abs(diff) >= 0.01) {
      appliedExtras = [...appliedExtras, {
        label: `外卖差额 (${platform === 'grab' ? 'Grab' : 'FoodPanda'})`,
        amount: diff,
      }];
    }

    // Step 3: confirm
    const ok = await GC.confirm(
      `平台 / Platform: ${label}\n` +
      `本店金额 / In-store: ${sym}${inStoreTotal.toFixed(2)}\n` +
      `平台金额 / Platform: ${sym}${platformTotal.toFixed(2)}\n` +
      (Math.abs(diff) >= 0.01 ? `差额 / Diff: ${diff >= 0 ? '+' : ''}${sym}${diff.toFixed(2)}\n` : '') +
      `应收 / Total to Record: ${sym}${platformTotal.toFixed(2)}`,
      { title: '确认外卖订单 / Confirm Delivery Order', confirmText: '确认 / Confirm' }
    );
    if (!ok) return;

    try {
      const cartPayload = cart.map(c => ({
        menuItemId: c.menuItemId, quantity: c.quantity, note: c.note,
      }));
      const result = await GC.Store.createOrder({
        memberId: selectedMemberId,
        guestName: guestName || `${label} 外卖`,
        cart: cartPayload,
        payment: { method: platform },
        discount: discount ? { ...discount, amount: discountAmount() } : null,
        takeaway,
        extraCharges: appliedExtras,
        deliveryPlatformTotal: platformTotal,
        note: `${label} 外卖订单 · 平台总额 ${sym}${platformTotal.toFixed(2)}`,
      });
      GC.toast(`✅ ${label} 订单 #${result.order.orderNo} · ${sym}${platformTotal.toFixed(2)}`, 'success');
      showReceipt(result.order, result.items);
      clearCart();
    } catch (e) {
      GC.toast('结账失败 / Failed: ' + e.message, 'error');
    }
  }

  /* ---- Pay sheet (Option C 2026-05-14) ----
     One big "结账" button on the cart panel opens this sheet to choose
     payment method. Keeps the cart panel uncluttered so the items list
     is always visible (was being pushed off-screen by 5 stacked pay buttons).
  */
  function showPaySheet() {
    if (cart.length === 0) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const total = cartTotal();
    const member = selectedMemberId ? GC.Store.getMember(selectedMemberId) : null;
    const canMemberPay = member && member.balance >= total;
    const memberBalShort = member && !canMemberPay;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content pay-sheet">
          <div class="modal-header">
            <h3>💳 选择付款方式 / Choose Payment</h3>
            <button class="modal-close" id="ps-close">&times;</button>
          </div>
          <div class="pay-sheet-amount">
            <span>应收 / Total</span>
            <span class="pay-sheet-total">${sym}${total.toFixed(2)}</span>
          </div>
          <div class="pay-sheet-list">
            ${member ? `
              <button class="pay-option ${canMemberPay ? 'primary' : ''}" data-pay="member_balance" ${!canMemberPay ? 'disabled' : ''}>
                <span class="pay-option-icon">💎</span>
                <div class="pay-option-text">
                  <div>扣余额 / Member Pay</div>
                  <small>${GC.esc(member.name)} · 余额 ${sym}${member.balance.toFixed(2)}${memberBalShort ? ' ⚠️ 余额不足' : ''}</small>
                </div>
              </button>
            ` : ''}
            <button class="pay-option" data-pay="cash">
              <span class="pay-option-icon">💵</span>
              <div class="pay-option-text">
                <div>现金 / Cash</div>
                <small>含找零计算</small>
              </div>
            </button>
            <button class="pay-option" data-pay="paynow">
              <span class="pay-option-icon">📱</span>
              <div class="pay-option-text">
                <div>PayNow</div>
                <small>扫码即付</small>
              </div>
            </button>
            <button class="pay-option" data-pay="split">
              <span class="pay-option-icon">🔀</span>
              <div class="pay-option-text">
                <div>拆账 / Split</div>
                <small>多种方式组合付款</small>
              </div>
            </button>
            <button class="pay-option pay-option-grab" data-pay="grab">
              <span class="pay-option-icon">🛵</span>
              <div class="pay-option-text">
                <div>Grab</div>
                <small>外卖平台 · 自动计算差额</small>
              </div>
            </button>
            <button class="pay-option pay-option-foodpanda" data-pay="foodpanda">
              <span class="pay-option-icon">🐼</span>
              <div class="pay-option-text">
                <div>FoodPanda</div>
                <small>外卖平台 · 自动计算差额</small>
              </div>
            </button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('ps-close').onclick = close;

    modal.querySelectorAll('[data-pay]').forEach(b => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const method = b.dataset.pay;
        close();
        // Defer to next tick so close animation doesn't conflict with next modal.
        setTimeout(() => {
          if (method === 'split') showSplitBillModal();
          else if (method === 'grab') checkoutDelivery('grab');
          else if (method === 'foodpanda') checkoutDelivery('foodpanda');
          else checkout(method);
        }, 50);
      });
    });
  }

  /* ---- Add custom charge modal ---- */
  async function showAddChargeModal() {
    const sym = GC.Store.getSettings().currencySymbol;
    const label = await GC.prompt(
      '收费名称 / Charge Label (例：包装费, 加大杯, 外卖差额)',
      { title: '➕ 加收费 / Add Charge', defaultValue: '' }
    );
    if (label == null || !label.trim()) return;
    const amount = await showAmountNumpadModal({
      title: `${label.trim()} — 金额 / Amount`,
      maxAmount: 9999,
      sym,
      hint: '可以输入正数（加价）或之后用减号；金额不可为 0',
      allowExceed: true,
    });
    if (amount == null || amount <= 0) return;
    extraCharges.push({ label: label.trim(), amount });
    render();
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

  /* ---- Split Bill modal ----
     Lets cashier build a list of payments (cash / paynow / member balance)
     that sum to the order total. All methods use showAmountNumpadModal
     (numpad-based, default empty) so cashiers can do partial cash, partial
     PayNow, etc. — fixes UX P0-1/2/3 from 2026-05-14 audit.
     If the final cash tender brings the bill over total (customer overpays),
     showCashModal is invoked for change calc on the LAST cash row.
  */
  async function showSplitBillModal() {
    if (cart.length === 0) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const total = cartTotal();
    let payments = [];   // [{method, amount, tendered?, changeGiven?}]

    const methodLabel = (m) => ({
      cash: '💵 现金 Cash',
      paynow: '📱 PayNow',
      member_balance: '💎 会员余额',
      card: '💳 信用卡',
    })[m] || m;

    const modal = document.getElementById('modal');

    const renderModal = () => {
      // Always re-read member (balance may have changed via realtime sync)
      const member = selectedMemberId ? GC.Store.getMember(selectedMemberId) : null;
      // Available member balance = current balance minus already-pledged member rows
      const memberPledged = payments.filter(p => p.method === 'member_balance')
        .reduce((s, p) => s + p.amount, 0);
      const memberAvailable = member ? Math.max(0, member.balance - memberPledged) : 0;

      const paidSoFar = round2Local(payments.reduce((s, p) => s + p.amount, 0));
      const remaining = Math.max(0, round2Local(total - paidSoFar));
      const canConfirm = Math.abs(remaining) < 0.01;

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-wide modal-split">
            <div class="modal-header">
              <h3>🔀 拆账 / Split Bill</h3>
              <button class="modal-close" id="m-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="split-summary">
                <div class="split-row total"><span>应收 / Total</span><span class="split-amount-total">${sym}${total.toFixed(2)}</span></div>
                <div class="split-row paid"><span>已收 / Paid So Far</span><span>${sym}${paidSoFar.toFixed(2)}</span></div>
                <div class="split-row remaining ${remaining > 0.01 ? 'positive' : 'zero'}">
                  <span>${remaining > 0.01 ? '差 / Remaining' : '✅ 已收满 / Paid'}</span>
                  <span>${sym}${remaining.toFixed(2)}</span>
                </div>
              </div>

              <div class="split-list-header">
                <h4 class="split-section-title">已添加的付款 / Payments Added</h4>
                ${payments.length > 0 ? '<button class="split-clear-all" id="split-clear">🗑 清空 / Clear All</button>' : ''}
              </div>
              <div class="split-payments-list">
                ${payments.length === 0 ? '<div class="split-empty">还没添加付款 / No payments yet</div>' : payments.map((p, i) => `
                  <div class="split-payment-row">
                    <span class="split-pay-method">${methodLabel(p.method)}</span>
                    <span class="split-pay-amount">${sym}${p.amount.toFixed(2)}</span>
                    ${p.tendered != null ? `<small>收 ${sym}${p.tendered.toFixed(2)} 找 ${sym}${p.changeGiven.toFixed(2)}</small>` : ''}
                    <button class="split-pay-remove" data-rm="${i}" title="移除">×</button>
                  </div>`).join('')}
              </div>

              ${remaining > 0.01 ? `
                <h4 class="split-section-title" style="margin-top:18px">添加付款 / Add Payment (差 ${sym}${remaining.toFixed(2)})</h4>
                <div class="split-add-buttons">
                  <button class="split-add-btn" data-add="cash">💵 现金 Cash</button>
                  <button class="split-add-btn" data-add="paynow">📱 PayNow</button>
                  ${memberAvailable > 0 ? `<button class="split-add-btn" data-add="member_balance">💎 会员余额 (${sym}${memberAvailable.toFixed(2)})</button>` : ''}
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
              <button class="btn btn-primary" id="m-confirm-split" ${!canConfirm ? 'disabled' : ''}>
                ${canConfirm ? '✅ 确认结账 / Confirm Split' : `差 ${sym}${remaining.toFixed(2)} 未付`}
              </button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');

      const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
      document.getElementById('m-close').onclick = close;
      document.getElementById('m-cancel').onclick = close;

      // Clear all
      const clearBtn = document.getElementById('split-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => { payments = []; renderModal(); });

      // Remove single payment
      modal.querySelectorAll('[data-rm]').forEach(b => {
        b.addEventListener('click', () => {
          payments.splice(parseInt(b.dataset.rm), 1);
          renderModal();
        });
      });

      // Smart default — pre-fill with `remaining` once at least one payment
      // has been added (cashier almost always wants the gap for second+
      // tender). First tender stays empty so cashier consciously enters
      // the partial amount they want (avoids accidental overpay).
      // Per user request 2026-05-14: "第二个付款方式打开时默认剩余金额".
      const smartDefault = payments.length > 0 ? remaining : undefined;

      // Add payment buttons — all use the numpad modal (UX P0-1/2/3)
      modal.querySelectorAll('[data-add]').forEach(b => {
        b.addEventListener('click', async () => {
          const method = b.dataset.add;
          if (method === 'cash') {
            // Fix 2026-05-14: do NOT auto-route to showCashModal when amount
            // equals remaining — that forced cashier into a ≥amount input
            // and locked them out of revising to a smaller value (user-
            // reported bug: "点选现金金额不够无法确认"). Cash in split now
            // always pushes as a plain amount. If overpay+change calc is
            // needed, cashier should use the regular (non-split) cash flow.
            const amount = await showAmountNumpadModal({
              title: '💵 现金金额 / Cash Amount',
              maxAmount: remaining,
              sym,
              hint: `差 ${sym}${remaining.toFixed(2)} (可输入更少做部分现金)`,
              defaultValue: smartDefault,
            });
            if (amount != null) payments.push({ method: 'cash', amount });
            renderModal();
          } else if (method === 'paynow') {
            const amount = await showAmountNumpadModal({
              title: '📱 PayNow 金额 / Amount',
              maxAmount: remaining,
              sym,
              hint: '客户已扫码付款',
              defaultValue: smartDefault,
            });
            if (amount != null) payments.push({ method: 'paynow', amount });
            renderModal();
          } else if (method === 'member_balance') {
            const max = Math.min(remaining, memberAvailable);
            const amount = await showAmountNumpadModal({
              title: '💎 会员余额扣款 / Member Balance',
              maxAmount: max,
              sym,
              hint: `可用余额 ${sym}${memberAvailable.toFixed(2)}`,
              defaultValue: smartDefault != null ? Math.min(smartDefault, max) : undefined,
            });
            if (amount != null) payments.push({ method: 'member_balance', amount });
            renderModal();
          }
        });
      });

      // Final confirm
      const confirmBtn = document.getElementById('m-confirm-split');
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.onclick = async (e) => {
          if (e.currentTarget.disabled) return;
          e.currentTarget.disabled = true;
          try {
            const cartPayload = cart.map(c => ({
              menuItemId: c.menuItemId, quantity: c.quantity, note: c.note,
            }));
            const result = await GC.Store.createOrder({
              memberId: selectedMemberId,
              guestName: guestName || null,
              cart: cartPayload,
              payments,
              discount: discount ? { ...discount, amount: discountAmount() } : null,
              takeaway,
              extraCharges,
              note: `拆账 Split: ${payments.map(p => methodLabel(p.method) + ' ' + sym + p.amount.toFixed(2)).join(' + ')}`,
            });
            GC.toast(`✅ 订单 #${result.order.orderNo} 完成 · ${sym}${total.toFixed(2)}`, 'success');
            close();
            // Pass last cash tender's change info to receipt (if any)
            const cashPart = payments.find(p => p.method === 'cash' && p.tendered != null);
            if (cashPart) {
              result.order._cashReceived = cashPart.tendered;
              result.order._changeGiven = cashPart.changeGiven;
            }
            showReceipt(result.order, result.items);
            clearCart();
          } catch (err) {
            e.currentTarget.disabled = false;
            GC.toast('结账失败 / Failed: ' + err.message, 'error');
          }
        };
      }
    };

    renderModal();
  }

  function round2Local(n) { return Math.round(n * 100) / 100; }

  /**
   * Numpad-based amount entry modal — touch-first, no OS keyboard.
   * Used by Split Bill for cash partials, PayNow, member-balance tenders.
   * (UX P0-1/2/3 audit 2026-05-14: GC.prompt had no numpad and auto-filled
   *  the full max, causing one-tap-overpay bugs on iPad.)
   *
   * opts: { title, maxAmount, sym, hint?, allowExceed?, defaultValue? }
   *   defaultValue: optional number to pre-fill the input (e.g., remaining
   *   amount on second+ split tender so cashier doesn't retype it).
   * Returns: Promise<number|null>
   */
  function showAmountNumpadModal(opts) {
    return new Promise(resolve => {
      const { title, maxAmount, sym, hint, allowExceed, defaultValue } = opts;
      const modal = document.getElementById('modal');
      const presets = (() => {
        // Smart quick presets: full, half, common round values <= max
        const set = new Set();
        set.add(maxAmount);
        if (maxAmount > 1) set.add(Math.floor(maxAmount));
        if (maxAmount > 10) set.add(Math.round(maxAmount / 2));
        // Common SG bill denominations
        [2, 5, 10, 20, 50].forEach(v => { if (v <= maxAmount) set.add(v); });
        return [...set].sort((a, b) => a - b);
      })();
      const initial = defaultValue != null ? Number(defaultValue).toFixed(2) : '';

      modal.innerHTML = `
        <div class="modal-overlay">
          <div class="modal-content modal-cash">
            <div class="modal-header">
              <h3>${GC.esc(title)}</h3>
              <button class="modal-close" id="m-close">&times;</button>
            </div>
            <div class="modal-body">
              <div class="cash-due-line">
                <span>剩余 / Remaining</span>
                <span class="cash-due-amount">${sym}${maxAmount.toFixed(2)}</span>
              </div>
              ${hint ? `<div class="form-hint" style="margin-top:6px">${GC.esc(hint)}</div>` : ''}

              <div class="form-group" style="margin-top:18px">
                <label class="form-label">输入金额 / Enter Amount</label>
                <div class="rate-input-group" style="max-width:240px">
                  <span class="rate-prefix">${sym}</span>
                  <input type="text" inputmode="none" id="amt-input" class="form-input settings-input"
                    placeholder="0.00" value="${initial}"
                    style="font-size:1.5rem;font-weight:700;width:160px;text-align:right" readonly>
                </div>
                <div class="cash-presets">
                  ${presets.map(p => `<button class="cash-preset-btn" data-amount="${p}">${sym}${p}</button>`).join('')}
                </div>
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
              <button class="btn btn-primary" id="m-ok" disabled>确认 / Confirm</button>
            </div>
          </div>
        </div>`;
      modal.classList.add('show');

      const input = document.getElementById('amt-input');
      const okBtn = document.getElementById('m-ok');
      const updateOk = () => {
        const n = parseFloat(input.value) || 0;
        if (n <= 0) { okBtn.disabled = true; return; }
        if (!allowExceed && n > maxAmount + 0.01) {
          okBtn.disabled = true;
          input.style.color = 'var(--red)';
          return;
        }
        input.style.color = '';
        okBtn.disabled = false;
      };
      // Enable OK if pre-filled and valid
      if (initial) updateOk();

      modal.querySelectorAll('.cash-preset-btn').forEach(b => {
        b.addEventListener('click', () => { input.value = b.dataset.amount; updateOk(); });
      });
      modal.querySelectorAll('.np-btn').forEach(b => {
        b.addEventListener('click', () => {
          if (b.hasAttribute('data-back')) {
            input.value = input.value.slice(0, -1);
          } else {
            const d = b.dataset.digit;
            if (d === '.' && input.value.includes('.')) return;
            input.value = (input.value || '') + d;
          }
          updateOk();
        });
      });

      const done = (result) => { modal.classList.remove('show'); modal.innerHTML = ''; resolve(result); };
      document.getElementById('m-close').onclick = () => done(null);
      document.getElementById('m-cancel').onclick = () => done(null);
      okBtn.onclick = () => {
        const n = parseFloat(input.value) || 0;
        if (n <= 0) return;
        if (!allowExceed && n > maxAmount + 0.01) return;
        done(Math.round(n * 100) / 100);
      };
    });
  }

  /* ---- Receipt modal ---- */
  function showReceipt(order, items) {
    const sym = GC.Store.getSettings().currencySymbol;
    const fmtTime = ts => new Date(ts).toLocaleString('zh-CN', { hour12: false });
    const member = order.memberId ? GC.Store.getMember(order.memberId) : null;
    const methodNameMap = {
      cash: '现金 Cash',
      paynow: 'PayNow',
      member_balance: '会员余额 Member Balance',
      card: '信用卡 Card',
      grab: '🛵 Grab',
      foodpanda: '🐼 FoodPanda',
      mixed: '拆账 Split',
    };
    const methodLabel = methodNameMap[order.paymentMethod] || order.paymentMethod;
    // For mixed orders show per-tender breakdown (Ops P0-2 audit 2026-05-14)
    const tenderRows = order.paymentMethod === 'mixed'
      ? (GC.Store.getOrderPaymentsFor ? GC.Store.getOrderPaymentsFor(order.id) : [])
      : [];
    // Pre/post balance line for any order with a member_balance tender (Ops P1-7)
    const memberTender = order.paymentMethod === 'member_balance'
      ? order.total
      : tenderRows.filter(t => t.method === 'member_balance').reduce((s, t) => s + Number(t.amount), 0);

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
            ${tenderRows.length > 0 ? `
              <div class="rcpt-divider" style="margin:6px 0"></div>
              ${tenderRows.map(t => `
                <div class="rcpt-line">
                  <span>${methodNameMap[t.method] || t.method}</span>
                  <span>${sym}${Number(t.amount).toFixed(2)}</span>
                </div>
                ${t.tendered != null ? `<div class="rcpt-line"><span style="padding-left:12px;font-size:0.85em">收 / Tendered</span><span>${sym}${Number(t.tendered).toFixed(2)}</span></div>` : ''}
                ${t.changeGiven != null && Number(t.changeGiven) > 0 ? `<div class="rcpt-line"><span style="padding-left:12px;font-size:0.85em">找 / Change</span><span>${sym}${Number(t.changeGiven).toFixed(2)}</span></div>` : ''}
              `).join('')}
            ` : ''}
            ${order._cashReceived != null && tenderRows.length === 0 ? `
              <div class="rcpt-line"><span>收 / Tendered</span><span>${sym}${order._cashReceived.toFixed(2)}</span></div>
              <div class="rcpt-line"><span>找 / Change</span><span>${sym}${order._changeGiven.toFixed(2)}</span></div>
            ` : ''}
            ${member && memberTender > 0 ? `<div class="rcpt-meta">余额 / Balance: ${sym}${(member.balance + memberTender).toFixed(2)} → ${sym}${member.balance.toFixed(2)}</div>` : ''}
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
