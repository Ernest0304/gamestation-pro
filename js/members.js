/**
 * Members — Regular / Silver / Platinum, balance, top-ups, Telegram bind code
 */
window.GC = window.GC || {};

GC.Members = (function () {
  let detailId = null;

  const TIER_INFO = {
    regular:  { label: '散客',     en: 'Regular',  icon: '👤' },
    silver:   { label: 'Silver',   en: 'Silver',   icon: '🥈' },
    platinum: { label: 'Platinum', en: 'Platinum', icon: '💎' },
  };

  function fmtDate(ts) { return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
  function fmtDur(mins) {
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function tierBadge(tier) {
    const i = TIER_INFO[tier] || TIER_INFO.regular;
    return `<span class="tier-badge ${tier}">${i.icon} ${i.en}</span>`;
  }
  function reasonLabel(r) {
    return ({
      new_silver: '入会 Silver / New Silver',
      new_platinum: '入会 Platinum / New Platinum',
      silver_to_platinum: '升级 Silver→Platinum',
      platinum_recharge: 'Platinum 续充 + $20 福利',
      recharge: '充值 / Recharge',
      partial: '充值 (低于会员门槛) / Top-up (below tier)',
    })[r] || r;
  }

  function renderList() {
    detailId = null;
    const members = GC.Store.getMembers();
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;

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
          <div class="member-balance-line">
            <span class="balance-label">余额 / Balance</span>
            <span class="balance-value ${m.balance <= 0 ? 'zero' : ''}">${sym}${m.balance.toFixed(2)}</span>
          </div>
          <div class="member-stats">
            <span>累计 / Spent <strong>${sym}${m.totalSpent.toFixed(2)}</strong></span>
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
          <div class="tier-card-fee">${sym}${settings.memberFees.silver}<small> 入会 = 初始余额</small></div>
          <div class="tier-card-rate">Switch 2 ${sym}${settings.rates.silver['Switch 2']}/h · PS5 ${sym}${settings.rates.silver['PS5']}/h · prorated</div>
        </div>
        <div class="tier-card platinum">
          <div class="tier-card-icon">💎</div>
          <div class="tier-card-name">Platinum 会员</div>
          <div class="tier-card-fee">${sym}${settings.memberFees.platinum}<small> 入会 + ${sym}${settings.platinumTopupBonus} 福利金</small></div>
          <div class="tier-card-rate">Switch 2 ${sym}${settings.rates.platinum['Switch 2']}/h · PS5 ${sym}${settings.rates.platinum['PS5']}/h · prorated</div>
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
    const sessions = GC.Store.getSessions().filter(s => s.memberId === id && s.status === 'completed');
    const topUps = GC.Store.getTopUpsForMember(id);

    const tierKey = m.tier === 'regular' ? 'regular' : m.tier;
    const rateLine = settings.rates[tierKey]
      ? `Switch 2 ${sym}${settings.rates[tierKey]['Switch 2']}/h · PS5 ${sym}${settings.rates[tierKey]['PS5']}/h`
      : '—';

    let sessRows = '';
    if (sessions.length === 0) {
      sessRows = '<tr><td colspan="4" class="table-empty">暂无记录 / No records</td></tr>';
    } else {
      sessions.slice(0, 20).forEach(s => {
        sessRows += `<tr>
          <td>${fmtDate(s.endTime)} ${fmtTime(s.endTime)}</td>
          <td>${s.stationName}</td>
          <td>${fmtDur(s.durationMinutes)}</td>
          <td>${sym}${s.total.toFixed(2)}</td>
        </tr>`;
      });
    }

    let topUpRows = '';
    if (topUps.length === 0) {
      topUpRows = '<tr><td colspan="4" class="table-empty">暂无充值记录 / No top-ups</td></tr>';
    } else {
      topUps.slice(0, 10).forEach(t => {
        topUpRows += `<tr>
          <td>${fmtDate(t.createdAt)} ${fmtTime(t.createdAt)}</td>
          <td>${sym}${t.amount.toFixed(2)}${t.bonus > 0 ? ` <small style="color:var(--green)">+${sym}${t.bonus.toFixed(2)}</small>` : ''}</td>
          <td><small>${reasonLabel(t.reason)}</small></td>
          <td>${sym}${t.resultingBalance.toFixed(2)}</td>
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
          <button class="btn btn-primary btn-sm" id="topup">充值 / Top Up</button>
          <button class="btn btn-secondary btn-sm" id="edit-member">编辑 / Edit</button>
          <button class="btn btn-sm" style="background:var(--bg-input);color:var(--red);border:1px solid var(--border)" id="del-member">删除 / Delete</button>
        </div>
      </div>

      <div class="detail-stats">
        <div class="detail-stat highlight">
          <span class="stat-label">余额 / Balance</span>
          <span class="stat-value" style="color:var(--green)">${sym}${m.balance.toFixed(2)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">累计消费 / Total Spent</span>
          <span class="stat-value">${sym}${m.totalSpent.toFixed(2)}</span>
        </div>
        <div class="detail-stat">
          <span class="stat-label">游玩时长 / Play Time</span>
          <span class="stat-value">${fmtDur(m.totalMinutes)}</span>
        </div>
      </div>

      <div class="bind-section">
        <div class="bind-title">📱 Telegram 绑定码 / Bind Code</div>
        <div class="bind-code-display">${m.bindCode || '—'}</div>
        <div class="form-hint">
          ${m.telegramId
            ? `✓ 已绑定 Telegram ID: <code>${m.telegramId}</code>`
            : '让会员在 Telegram bot 发送：<code>/bind ' + (m.bindCode || 'XXXXXXXX') + '</code>'}
          <button class="btn btn-ghost btn-sm" id="regen-code" style="margin-left:8px">🔄 重新生成 / Regen</button>
        </div>
      </div>

      <h3 class="section-title">充值记录 / Top-up History</h3>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>时间</th><th>金额</th><th>类型</th><th>余额</th></tr></thead>
          <tbody>${topUpRows}</tbody>
        </table>
      </div>

      <h3 class="section-title" style="margin-top:24px">消费记录 / Session History</h3>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>时间</th><th>机台</th><th>时长</th><th>金额</th></tr></thead>
          <tbody>${sessRows}</tbody>
        </table>
      </div>`;

    document.getElementById('back-list').addEventListener('click', renderList);
    document.getElementById('topup').addEventListener('click', () => showTopUpModal(id));
    document.getElementById('edit-member').addEventListener('click', () => showEditModal(id));
    document.getElementById('regen-code').addEventListener('click', async () => {
      if (!confirm('重新生成绑定码？旧的将立即失效。\nRegenerate bind code? Old one becomes invalid.')) return;
      await GC.Store.regenerateBindCode(id);
      renderDetail(id);
      GC.toast('已生成新绑定码 / New code generated', 'success');
    });
    document.getElementById('del-member').addEventListener('click', async () => {
      const sym = settings.currencySymbol;
      let warning = `确定删除会员 "${m.name}"？\nDelete this member?`;
      if (m.balance > 0) {
        warning += `\n\n⚠️  当前余额 / Balance: ${sym}${m.balance.toFixed(2)} 必须先退款或扣零。\nMust refund or zero out balance first.`;
      }
      if (!confirm(warning)) return;
      try {
        // soft-delete (archive) — preserves member history per owner policy
        await GC.Store.deleteMember(id, { reason: prompt('删除原因 / Reason (optional):') || 'manual' });
        renderList();
        GC.toast('已存档 / Archived', 'success');
      } catch (e) {
        GC.toast(e.message, 'error');
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
              <input id="inp-name" class="form-input" placeholder="会员姓名" autofocus>
            </div>
            <div class="form-group">
              <label class="form-label">手机号 / Phone</label>
              <input id="inp-phone" class="form-input" placeholder="电话">
            </div>
            <div class="form-group">
              <label class="form-label">入会方案 / Membership</label>
              <select id="inp-tier" class="form-input">
                <option value="regular">👤 散客 / Regular（不收费，无余额）</option>
                <option value="silver" selected>🥈 Silver — ${sym}${settings.memberFees.silver}（余额 ${sym}${settings.memberFees.silver}）</option>
                <option value="platinum">💎 Platinum — ${sym}${settings.memberFees.platinum}（余额 ${sym}${settings.memberFees.platinum + settings.platinumTopupBonus} 含福利金）</option>
              </select>
              <div class="form-hint">入会费 = 初始余额。Platinum 额外送 ${sym}${settings.platinumTopupBonus} 福利金。</div>
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

      const okBtn = document.getElementById('m-ok');
      okBtn.disabled = true; // debounce
      try {
        // Always create as regular with balance=0 (single source of truth).
        // applyTopUp handles balance + tier promotion + audit log.
        const m = await GC.Store.addMember({ name, phone });

        if (tier === 'silver') {
          await GC.Store.applyTopUp(m.id, settings.memberFees.silver);
        } else if (tier === 'platinum') {
          await GC.Store.applyTopUp(m.id, settings.memberFees.platinum);
        }
        // Re-read updated member from cache
        const final = GC.Store.getMember(m.id) || m;
        close();
        renderList();
        GC.toast(`会员已添加 · 绑定码 ${final.bindCode}`, 'success');
      } catch (e) {
        GC.toast('添加失败 / Failed: ' + e.message, 'error');
        okBtn.disabled = false;
      }
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
              <label class="form-label">会员等级 / Tier (manual override)</label>
              <select id="inp-tier" class="form-input">
                <option value="regular" ${m.tier === 'regular' ? 'selected' : ''}>👤 Regular</option>
                <option value="silver" ${m.tier === 'silver' ? 'selected' : ''}>🥈 Silver</option>
                <option value="platinum" ${m.tier === 'platinum' ? 'selected' : ''}>💎 Platinum</option>
              </select>
              <div class="form-hint">手动调整等级 (不影响余额) / Manual tier change (balance untouched)</div>
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

  function showTopUpModal(id) {
    const m = GC.Store.getMember(id);
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const silverFee = settings.memberFees.silver;
    const platinumFee = settings.memberFees.platinum;
    const bonus = settings.platinumTopupBonus;
    if (!m) return;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3>充值 / Top Up — ${m.name}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="topup-current">
              <span>当前 / Current: ${tierBadge(m.tier)}</span>
              <span>余额 / Balance: <strong>${sym}${m.balance.toFixed(2)}</strong></span>
            </div>

            <div class="form-group" style="margin-top:20px">
              <label class="form-label">充值方案 / Top Up Option</label>
              <div class="topup-options">
                ${m.tier === 'regular' ? `
                  <button class="topup-option" data-amount="${silverFee}" data-action="silver">
                    <div class="topup-tag">🥈 Silver</div>
                    <div class="topup-amount">${sym}${silverFee}</div>
                    <div class="topup-detail">余额 +${sym}${silverFee} · 升 Silver</div>
                  </button>
                ` : ''}
                <button class="topup-option" data-amount="${platinumFee}" data-action="platinum">
                  <div class="topup-tag">💎 Platinum ${m.tier === 'platinum' ? '续充' : '升级'}</div>
                  <div class="topup-amount">${sym}${platinumFee}</div>
                  <div class="topup-detail">余额 +${sym}${platinumFee + bonus} (含 ${sym}${bonus} 福利金)</div>
                </button>
                ${m.tier !== 'regular' ? `
                  <button class="topup-option" data-amount="0" data-action="custom">
                    <div class="topup-tag">自定义 Custom</div>
                    <div class="topup-amount">${sym}—</div>
                    <div class="topup-detail">输入金额，无福利金</div>
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="form-group" id="custom-group" style="display:none">
              <label class="form-label">自定义金额 / Custom Amount</label>
              <div class="rate-input-group">
                <span class="rate-prefix">${sym}</span>
                <input type="number" id="inp-custom" class="form-input settings-input" placeholder="0" min="1" step="1" style="width:140px;text-align:right">
              </div>
            </div>

            <div class="topup-summary" id="topup-summary"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">取消 / Cancel</button>
            <button class="btn btn-primary" id="m-ok" disabled>充值 / Confirm</button>
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    let selectedAmount = 0;
    let selectedAction = null;

    const updateSummary = () => {
      const summary = document.getElementById('topup-summary');
      const okBtn = document.getElementById('m-ok');
      if (selectedAmount <= 0) {
        summary.innerHTML = '';
        okBtn.disabled = true;
        return;
      }
      // Calculate bonus
      let willBonus = 0, willTier = m.tier, badge = '';
      if (selectedAmount >= platinumFee) {
        willTier = 'platinum';
        willBonus = bonus;
        badge = m.tier === 'platinum' ? 'Platinum 续充' : (m.tier === 'silver' ? '升级 Silver→Platinum' : '入会 Platinum');
      } else if (selectedAmount >= silverFee && m.tier === 'regular') {
        willTier = 'silver';
        badge = '入会 Silver';
      } else {
        badge = '充值 (无升级)';
      }
      const newBal = m.balance + selectedAmount + willBonus;
      summary.innerHTML = `
        <div class="topup-summary-card">
          <div>支付 / Pay: <strong>${sym}${selectedAmount.toFixed(2)}</strong></div>
          ${willBonus > 0 ? `<div style="color:var(--green)">+ 福利金 / Bonus: <strong>${sym}${willBonus.toFixed(2)}</strong></div>` : ''}
          <div class="summary-divider"></div>
          <div>余额变化 / Balance: ${sym}${m.balance.toFixed(2)} → <strong class="balance-after">${sym}${newBal.toFixed(2)}</strong></div>
          <div>等级 / Tier: ${tierBadge(m.tier)} → ${tierBadge(willTier)} <small>${badge}</small></div>
        </div>`;
      okBtn.disabled = false;
    };

    modal.querySelectorAll('.topup-option').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.topup-option').forEach(b => b.classList.toggle('selected', b === btn));
        const action = btn.dataset.action;
        selectedAction = action;
        if (action === 'custom') {
          document.getElementById('custom-group').style.display = 'block';
          selectedAmount = parseFloat(document.getElementById('inp-custom').value) || 0;
        } else {
          document.getElementById('custom-group').style.display = 'none';
          selectedAmount = parseFloat(btn.dataset.amount);
        }
        updateSummary();
      });
    });

    const customInput = document.getElementById('inp-custom');
    if (customInput) {
      customInput.addEventListener('input', () => {
        if (selectedAction === 'custom') {
          selectedAmount = parseFloat(customInput.value) || 0;
          updateSummary();
        }
      });
    }

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    document.getElementById('m-ok').onclick = async () => {
      if (selectedAmount <= 0) return;
      try {
        const result = await GC.Store.applyTopUp(id, selectedAmount);
        close();
        renderDetail(id);
        const bonusMsg = result.bonus > 0 ? ` (+${sym}${result.bonus} 福利)` : '';
        GC.toast(`充值成功 / Top-up done · ${sym}${selectedAmount}${bonusMsg}`, 'success');
      } catch (e) {
        GC.toast('充值失败 / Failed: ' + e.message, 'error');
      }
    };
  }

  function render() { detailId ? renderDetail(detailId) : renderList(); }
  function destroy() { detailId = null; }

  return { render, destroy };
})();
