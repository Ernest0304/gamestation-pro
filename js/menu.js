/**
 * Menu — Admin: Add, edit, deactivate menu items. Dark theme.
 */
window.GC = window.GC || {};

GC.Menu = (function () {
  let filterCategoryId = null;
  let showInactive = false;
  let query = '';

  function render() {
    const cats = GC.Store.getMenuCategories();
    const sym = GC.Store.getSettings().currencySymbol;
    if (!filterCategoryId && cats.length > 0) filterCategoryId = cats[0].id;

    let allItems = GC.Store.getMenuItems({ includeInactive: showInactive, categoryId: filterCategoryId });
    if (query) {
      const q = query.toLowerCase();
      allItems = allItems.filter(i =>
        i.nameZh.toLowerCase().includes(q) ||
        (i.nameEn || '').toLowerCase().includes(q) ||
        String(i.menuNo).includes(q)
      );
    }

    const catTabs = cats.map(c => {
      const count = GC.Store.getMenuItems({ categoryId: c.id }).length;
      return `<button class="cat-pill-dark ${c.id === filterCategoryId ? 'active' : ''}" data-cat="${c.id}">
        ${c.emoji} ${c.nameZh} <span class="cat-count">${count}</span>
      </button>`;
    }).join('');

    let rows = '';
    if (allItems.length === 0) {
      rows = `<tr><td colspan="6" class="table-empty">没有商品 / No items</td></tr>`;
    } else {
      rows = allItems.map(i => `
        <tr class="${!i.active ? 'inactive' : ''}">
          <td class="menu-no-cell">#${i.menuNo}</td>
          <td>
            <span style="font-size:1.4rem;margin-right:8px">${i.emoji}</span>
            <strong>${i.nameZh}</strong>
            ${i.isFeatured ? '<span class="badge-rec-small">招牌</span>' : ''}
            <div class="menu-en">${i.nameEn || ''}</div>
          </td>
          <td><strong>${sym}${i.price.toFixed(2)}</strong></td>
          <td><span class="status-dot-mini ${i.active ? 'on' : 'off'}">${i.active ? '上架' : '下架'}</span></td>
          <td class="actions-cell">
            <button class="btn btn-secondary btn-sm" data-edit="${i.id}">编辑</button>
            <button class="btn btn-sm" style="background:var(--bg-input);color:${i.active ? 'var(--amber)' : 'var(--green)'};border:1px solid var(--border)" data-toggle="${i.id}">${i.active ? '下架' : '上架'}</button>
            <button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" data-del="${i.id}">删除</button>
          </td>
        </tr>`).join('');
    }

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">菜单管理 / Menu</h2>
        <div class="report-buttons">
          <button class="btn btn-primary btn-sm" id="add-item">+ 新增商品</button>
        </div>
      </div>

      <div class="menu-cat-bar">${catTabs}</div>

      <div class="menu-toolbar">
        <input type="text" id="menu-search" class="form-input" placeholder="搜索 (名称/编号) / Search" value="${query}" style="flex:1">
        <label class="menu-toggle">
          <input type="checkbox" id="show-inactive" ${showInactive ? 'checked' : ''}>
          显示已下架
        </label>
      </div>

      <div class="table-container" style="margin-top:14px">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:80px">编号</th>
              <th>商品 / Item</th>
              <th style="width:90px">价格</th>
              <th style="width:90px">状态</th>
              <th style="width:240px">操作</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    document.querySelectorAll('.cat-pill-dark').forEach(b => {
      b.addEventListener('click', () => {
        filterCategoryId = parseInt(b.dataset.cat);
        render();
      });
    });
    document.getElementById('menu-search').addEventListener('input', e => {
      query = e.target.value;
      // Debounce by render delay? Just re-render
      render();
      // Restore focus
      const el = document.getElementById('menu-search');
      if (el) { el.focus(); el.setSelectionRange(query.length, query.length); }
    });
    document.getElementById('show-inactive').addEventListener('change', e => {
      showInactive = e.target.checked;
      render();
    });
    document.getElementById('add-item').addEventListener('click', () => showEditModal(null));

    document.querySelectorAll('[data-edit]').forEach(b =>
      b.addEventListener('click', () => showEditModal(b.dataset.edit)));
    document.querySelectorAll('[data-toggle]').forEach(b =>
      b.addEventListener('click', async () => {
        const id = b.dataset.toggle;
        const item = GC.Store.getMenuItem(id);
        await GC.Store.updateMenuItem(id, { active: !item.active });
        GC.toast(item.active ? '已下架' : '已上架', 'success');
        render();
      }));
    document.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        const id = b.dataset.del;
        const item = GC.Store.getMenuItem(id);
        if (!confirm(`确定删除 "${item.nameZh}"？/ Delete?`)) return;
        await GC.Store.deleteMenuItem(id);
        GC.toast('已删除', 'success');
        render();
      }));
  }

  function showEditModal(itemId) {
    const editing = itemId ? GC.Store.getMenuItem(itemId) : null;
    const cats = GC.Store.getMenuCategories();
    const sym = GC.Store.getSettings().currencySymbol;

    // Next menu_no for new item
    const usedNos = new Set(GC.Store.getMenuItems({ includeInactive: true }).map(i => i.menuNo));
    let nextNo = editing ? editing.menuNo : 1;
    if (!editing) while (usedNos.has(nextNo)) nextNo++;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h3>${editing ? '编辑商品' : '新增商品'} / ${editing ? 'Edit' : 'New'} Item</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">编号 / No.</label>
                <input type="number" id="inp-no" class="form-input" value="${nextNo}" min="1">
              </div>
              <div class="form-group">
                <label class="form-label">分类 / Category</label>
                <select id="inp-cat" class="form-input">
                  ${cats.map(c => `<option value="${c.id}" ${editing && c.id === editing.categoryId ? 'selected' : ''}>${c.emoji} ${c.nameZh}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">中文名 / Chinese Name</label>
                <input type="text" id="inp-zh" class="form-input" value="${editing ? editing.nameZh : ''}" placeholder="例：芋圆冰">
              </div>
              <div class="form-group">
                <label class="form-label">English Name</label>
                <input type="text" id="inp-en" class="form-input" value="${editing ? editing.nameEn : ''}" placeholder="e.g. Taro Ball Ice">
              </div>
            </div>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">价格 / Price</label>
                <div class="rate-input-group">
                  <span class="rate-prefix">${sym}</span>
                  <input type="number" id="inp-price" class="form-input settings-input" value="${editing ? editing.price : ''}" min="0" step="0.10" placeholder="0.00">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Emoji 图标</label>
                <input type="text" id="inp-emoji" class="form-input" value="${editing ? editing.emoji : '🍴'}" maxlength="4">
                <div class="form-hint">单字符 emoji，可贴 🍧 🥭 🥞 🧋 等</div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" id="inp-featured" ${editing && editing.isFeatured ? 'checked' : ''}>
                标记为招牌商品（在 POS 显示"招牌"标签）
              </label>
            </div>
            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" id="inp-active" ${!editing || editing.active ? 'checked' : ''}>
                上架（在 POS 显示）
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消</button>
            <button class="btn btn-primary" id="m-ok">${editing ? '保存' : '添加'}</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      const data = {
        menuNo: parseInt(document.getElementById('inp-no').value),
        categoryId: parseInt(document.getElementById('inp-cat').value),
        nameZh: document.getElementById('inp-zh').value.trim(),
        nameEn: document.getElementById('inp-en').value.trim(),
        price: parseFloat(document.getElementById('inp-price').value),
        emoji: document.getElementById('inp-emoji').value.trim() || '🍴',
        isFeatured: document.getElementById('inp-featured').checked,
        active: document.getElementById('inp-active').checked,
      };
      if (!data.nameZh) { GC.toast('请输入中文名', 'error'); return; }
      if (isNaN(data.price) || data.price < 0) { GC.toast('请输入有效价格', 'error'); return; }
      if (isNaN(data.menuNo)) { GC.toast('请输入编号', 'error'); return; }

      try {
        if (editing) {
          await GC.Store.updateMenuItem(editing.id, data);
          GC.toast('已保存', 'success');
        } else {
          await GC.Store.addMenuItem(data);
          GC.toast('已添加', 'success');
        }
        close();
        render();
      } catch (e) {
        GC.toast('保存失败: ' + e.message, 'error');
      }
    };
  }

  function destroy() {}
  return { render, destroy };
})();
