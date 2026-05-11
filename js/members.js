/**
 * Members — Membership management (Regular / Silver / Platinum)
 */
window.GC = window.GC || {};

GC.Members = (function () {
  let detailId = null;

  const TIER_INFO = {
    regular:  { label: '散客',     en: 'Regular',  icon: '👤' },
    silver:   { label: 'Silver',   en: 'Silver',   icon: '🥈' },
    platinum: { label: 'Platinum', en: 'Platinum', icon: '💎' },
  };

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

  function tierBadge(tier) {
    const info = TIER_INFO[tier] || TIER_INFO.regular;
    return `<span class="tier-badge ${tier}">${info.icon} ${info.en}</span>`;
  }

  function renderList() {
    detailId = null;
    const members = GC.Store.getMembers();
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;

    // Sort: platinum > silver > regular, then by name
    const sorted = [...members].sort((a, b) => {
      const order = { platinum: 0, silver: 1, regular: 2 };
      const t = (order[a.tier] ?? 3) - (order[b.tier] ?? 3);
      if (t !== 0) return t;
      return a.name.localeCompare(b.name);
    });

    let cards = '';
    sorted.forEach(m => {
      const info = TIER_INFO[m.tier] || TIER_INFO.regular;
      cards += `
        <div class="member-card" data-id="${m.id}">
          <div class="member-top">
            <div class="member-avatar ${m.tier}">${m.name.charAt(0).toUpperCase()}</div>
            <div style="flex:1;min-width:0">
              <div class="member-name">${m.name}</div>
              <div class="member-phone">${m.phone || '—'}</div>
            </div>
            <span class="tier-badge ${m.tier}">${info.icon} ${info.en}</span>
          </div>
          <div class="member-stats">
            <span>消费 / Spent <strong>${sym}${m.totalSpent.toFixed(2)}</strong></span>
            <span>时长 / Time <strong>${fmtDur(m.totalMinutes)}</strong></span>
          </div>
        </div>`;
    });

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">会员管理 / Members</h2>
      </div>

      <div class="member-tier-cards">
        <div class="tier-card silver">
          <div class="tier-card-icon">🥈</div>
          <div class="tier-card-name">Silver 会员</div>
          <div class="tier-card-fee">${sym}${settings.memberFees.silver}<small> 入会 / Join Fee</small></div>
          <div class="tier-card-rate">Switch 2 ${sym}${settings.rates.silver['Switch 2']}/h · PS5 ${sym}${settings.rates.silver['PS5']}/h</div>
        </div>
        <div class="tier-card platinum">
          <div class="tier-card-icon">💎</div>
          <div class="tier-card-name">Platinum 会员</div>
          <div class="tier-card-fee">${sym}${settings.memberFees.platinum}<small> 入会 / Join Fee</small></div>
          <div class="tier-card-rate">Switch 2 ${sym}${settings.rates.platinum['Switch 2']}/h · PS5 ${sym}${settings.rates.platinum['PS5']}/h</div>
        </div>
      </div>

      <div class="members-grid">
        ${cards}
        <div class="add-card" id="add-member">+ 添加会员 / Add Member</div>
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
    const info = TIER_INFO[m.tier] || TIER_INFO.regular;

    // Current rates for this member's tier
    const tierKey = m.tier === 'regular' ? 'regular' : m.tier;
    const rateLine = settings.rates[tierKey]
      ? `Switch 2 ${sym}${settings.rates[tierKey]['Switch 2']}/h · PS5 ${sym}${settings.rates[tierKey]['PS5']}/h`
      : '—';

    let rows = '';
    if (sessions.length === 0) {
      rows = '<tr><td colspan="4" class="table-empty">暂无记录 / No records</td></tr>';
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

    document.getElementById('main-content').innerHTML = `
      <div style="margin-bottom:20px">
        <button class="btn btn-ghost" id="back-list">← 返回 / Back</button>
      </div>
      <div class="detail-header">
        <div class="detail-avatar member-avatar ${m.tier}">${m.name.charAt(0).toUpperCase()}</div>
        <div class="detail-info">
          <h2>${m.name} ${tierBadge(m.tier)}</h2>
          <div style="color:var(--text-muted);font-size:0.85rem;margin-top:4px">${m.phone || '—'} · 注册 / Joined ${fmtDate(m.createdAt)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" id="edit-member">编辑 / Edit</button>
          <button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" id="del-member">删除 / Delete</button>
        </div>
      </div>
      <div class="detail-stats">
        <div class="detail-stat">
          <span class="stat-label">累计消费 / Total Spent</span>
          <span class="stat-value" style="color:var(--green)">${sym}${m.totalSpent.toFixed(2)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">游玩时长 / Play Time</span>
          <span class="stat-value">${fmtDur(m.totalMinutes)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">当前等级费率 / Tier Rate</span>
          <span class="stat-value" style="font-size:0.95rem;color:var(--cyan)">${rateLine}</span>
        </div>
      </div>
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:16px;margin-top:8px">消费记录 / Session History</h3>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>时间 / Time</th><th>机台 / Station</th><th>时长 / Duration</th><th>金额 / Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('back-list').addEventListener('click', renderList);
    document.getElementById('edit-member').addEventListener('click', () => showEditModal(id));
    document.getElementById('del-member').addEventListener('click', async () => {
      if (confirm(`确定要删除会员 "${m.name}" 吗？ / Delete this member?`)) {
        await GC.Store.deleteMember(id);
        renderList();
        GC.toast('已删除 / Deleted', 'success');
      }
    });
  }

  function showAddModal() {
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>添加会员 / Add Member</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">姓名 / Name</label>
              <input id="inp-name" class="form-input" placeholder="会员姓名 / Full name" autofocus>
            </div>
            <div class="form-group">
              <label class="form-label">手机号 / Phone</label>
              <input id="inp-phone" class="form-input" placeholder="手机号 / Phone number">
            </div>
            <div class="form-group">
              <label class="form-label">会员等级 / Membership Tier</label>
              <select id="inp-tier" class="form-input">
                <option value="regular">👤 散客 / Regular (no fee)</option>
                <option value="silver">🥈 Silver — ${sym}${settings.memberFees.silver}</option>
                <option value="platinum">💎 Platinum — ${sym}${settings.memberFees.platinum}</option>
              </select>
              <div class="form-hint">付费入会后享受对应等级优惠 / Paid membership unlocks tier discount</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok">添加 / Add</button>
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
      const tier = document.getElementById('inp-tier').value;
      if (!name) { alert('请输入姓名 / Name required'); return; }
      await GC.Store.addMember({ name, phone, tier });
      close();
      renderList();
      GC.toast('会员已添加 / Member added', 'success');
    };
  }

  function showEditModal(id) {
    const m = GC.Store.getMember(id);
    if (!m) return;
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>编辑会员 / Edit Member</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">姓名 / Name</label>
              <input id="inp-name" class="form-input" value="${m.name}">
            </div>
            <div class="form-group">
              <label class="form-label">手机号 / Phone</label>
              <input id="inp-phone" class="form-input" value="${m.phone || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">会员等级 / Membership Tier</label>
              <select id="inp-tier" class="form-input">
                <option value="regular" ${m.tier === 'regular' ? 'selected' : ''}>👤 散客 / Regular</option>
                <option value="silver" ${m.tier === 'silver' ? 'selected' : ''}>🥈 Silver — ${sym}${settings.memberFees.silver}</option>
                <option value="platinum" ${m.tier === 'platinum' ? 'selected' : ''}>💎 Platinum — ${sym}${settings.memberFees.platinum}</option>
              </select>
              <div class="form-hint">手动调整会员等级 / Manually set tier</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok">保存 / Save</button>
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
      const tier = document.getElementById('inp-tier').value;
      if (!name) { alert('请输入姓名 / Name required'); return; }
      await GC.Store.updateMember(id, { name, phone, tier });
      close();
      renderDetail(id);
      GC.toast('已更新 / Updated', 'success');
    };
  }

  function render() { detailId ? renderDetail(detailId) : renderList(); }
  function destroy() { detailId = null; }

  return { render, destroy };
})();
