/**
 * Members — Membership management
 */
window.GC = window.GC || {};

GC.Members = (function () {
  let detailId = null;

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  function fmtDur(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function renderList() {
    detailId = null;
    const members = GC.Store.getMembers();
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;

    let cards = '';
    members.forEach(m => {
      cards += `
        <div class="member-card" data-id="${m.id}">
          <div class="member-top">
            <div class="member-avatar ${m.tier}">${m.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="member-name">${m.name}</div>
              <div class="member-phone">${m.phone || '—'}</div>
            </div>
            <span class="tier-badge ${m.tier}" style="margin-left:auto">${m.tier}</span>
          </div>
          <div class="member-stats">
            <span>累计消费 <strong>${sym}${m.totalSpent.toFixed(2)}</strong></span>
            <span>游玩 <strong>${fmtDur(m.totalMinutes)}</strong></span>
          </div>
        </div>`;
    });

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">会员管理</h2>
      </div>
      <div class="members-grid">
        ${cards}
        <div class="add-card" id="add-member">+ 添加会员</div>
      </div>`;

    document.querySelectorAll('.member-card').forEach(c =>
      c.addEventListener('click', () => renderDetail(c.dataset.id)));
    document.getElementById('add-member').addEventListener('click', showAddModal);
  }

  function renderDetail(id) {
    detailId = id;
    const m = GC.Store.getMember(id);
    if (!m) return renderList();
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const sessions = GC.Store.getSessions().filter(s => s.memberId === id);
    const discount = settings.memberDiscounts[m.tier] || 0;

    let rows = '';
    if (sessions.length === 0) {
      rows = '<tr><td colspan="4" class="table-empty">暂无记录</td></tr>';
    } else {
      sessions.slice(0, 20).forEach(s => {
        rows += `
          <tr>
            <td>${fmtDate(s.endTime)} ${fmtTime(s.endTime)}</td>
            <td>${s.stationName}</td>
            <td>${fmtDur(s.durationMinutes)}</td>
            <td>${sym}${s.total.toFixed(2)}</td>
          </tr>`;
      });
    }

    let nextTierHtml = '';
    if (m.tier === 'bronze') {
      const need = settings.tierThresholds.silver - m.totalSpent;
      if (need > 0) nextTierHtml = `<div class="form-hint" style="margin-top:12px">距离 Silver 还需消费 ${sym}${need.toFixed(2)}</div>`;
    } else if (m.tier === 'silver') {
      const need = settings.tierThresholds.gold - m.totalSpent;
      if (need > 0) nextTierHtml = `<div class="form-hint" style="margin-top:12px">距离 Gold 还需消费 ${sym}${need.toFixed(2)}</div>`;
    }

    document.getElementById('main-content').innerHTML = `
      <div style="margin-bottom:20px">
        <button class="btn btn-ghost" id="back-list">← 返回会员列表</button>
      </div>
      <div class="detail-header">
        <div class="detail-avatar member-avatar ${m.tier}">${m.name.charAt(0).toUpperCase()}</div>
        <div class="detail-info">
          <h2>${m.name} <span class="tier-badge ${m.tier}" style="vertical-align:middle;margin-left:8px">${m.tier}</span></h2>
          <div style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">${m.phone || '—'} · 注册于 ${fmtDate(m.createdAt)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" id="edit-member">编辑</button>
          <button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" id="del-member">删除</button>
        </div>
      </div>
      <div class="detail-stats">
        <div class="detail-stat">
          <span class="stat-label">累计消费</span>
          <span class="stat-value" style="color:var(--green)">${sym}${m.totalSpent.toFixed(2)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">游玩时长</span>
          <span class="stat-value">${fmtDur(m.totalMinutes)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">当前折扣</span>
          <span class="stat-value" style="color:var(--purple)">${discount}%</span>
        </div>
      </div>
      ${nextTierHtml}
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;margin-top:8px">消费记录</h3>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>时间</th><th>机台</th><th>时长</th><th>金额</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('back-list').addEventListener('click', renderList);
    document.getElementById('edit-member').addEventListener('click', () => showEditModal(id));
    document.getElementById('del-member').addEventListener('click', async () => {
      if (confirm(`确定要删除会员 "${m.name}" 吗？`)) {
        await GC.Store.deleteMember(id);
        renderList();
        GC.toast('已删除会员', 'success');
      }
    });
  }

  function showAddModal() {
    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>添加会员</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">姓名</label>
              <input id="inp-name" class="form-input" placeholder="输入会员姓名" autofocus>
            </div>
            <div class="form-group">
              <label class="form-label">手机号</label>
              <input id="inp-phone" class="form-input" placeholder="输入手机号">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消</button>
            <button class="btn btn-primary" id="m-ok">添加</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      const name = document.getElementById('inp-name').value.trim();
      const phone = document.getElementById('inp-phone').value.trim();
      if (!name) { alert('请输入姓名'); return; }
      await GC.Store.addMember({ name, phone });
      close();
      renderList();
      GC.toast('会员已添加', 'success');
    };
  }

  function showEditModal(id) {
    const m = GC.Store.getMember(id);
    if (!m) return;
    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>编辑会员</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">姓名</label>
              <input id="inp-name" class="form-input" value="${m.name}">
            </div>
            <div class="form-group">
              <label class="form-label">手机号</label>
              <input id="inp-phone" class="form-input" value="${m.phone || ''}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消</button>
            <button class="btn btn-primary" id="m-ok">保存</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      const name = document.getElementById('inp-name').value.trim();
      const phone = document.getElementById('inp-phone').value.trim();
      if (!name) { alert('请输入姓名'); return; }
      await GC.Store.updateMember(id, { name, phone });
      close();
      renderDetail(id);
      GC.toast('会员信息已更新', 'success');
    };
  }

  function render() { detailId ? renderDetail(detailId) : renderList(); }
  function destroy() { detailId = null; }

  return { render, destroy };
})();
