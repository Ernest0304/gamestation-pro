/**
 * Settings — Pricing, membership config, promo toggle, export/import
 */
window.GC = window.GC || {};

GC.Settings = (function () {

  function render() {
    const s = GC.Store.getSettings();
    const sym = s.currencySymbol;

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">设置 / Settings</h2>
      </div>

      <!-- Promo toggle -->
      <div class="settings-section promo-section ${s.promoActive ? 'active' : ''}">
        <div class="settings-title">
          🎮 开业促销 / Opening Promotion
          <label class="toggle-switch" style="margin-left:auto">
            <input type="checkbox" id="promo-toggle" ${s.promoActive ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <div class="settings-label">促销 Switch 2 时费<small>Promo rate per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-promo-switch" class="form-input settings-input" value="${s.rates.promo['Switch 2']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">促销 PS5 时费<small>Promo rate per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-promo-ps5" class="form-input settings-input" value="${s.rates.promo['PS5']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
        <div class="form-hint" style="margin-top:8px">促销开启时，所有玩家（含会员）一律按促销价计费<br/>When promo is active, all players (including members) use promo rates.</div>
      </div>

      <!-- Regular (walk-in) -->
      <div class="settings-section">
        <div class="settings-title">👤 散客原价 / Regular Walk-in</div>
        <div class="settings-row">
          <div class="settings-label">Switch 2 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-reg-switch" class="form-input settings-input" value="${s.rates.regular['Switch 2']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">PS5 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-reg-ps5" class="form-input settings-input" value="${s.rates.regular['PS5']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
      </div>

      <!-- Silver tier -->
      <div class="settings-section">
        <div class="settings-title">🥈 Silver 会员 / Silver Member</div>
        <div class="settings-row">
          <div class="settings-label">入会费<small>One-time join fee</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="fee-silver" class="form-input settings-input" value="${s.memberFees.silver}" min="0" step="10">
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">Switch 2 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-silver-switch" class="form-input settings-input" value="${s.rates.silver['Switch 2']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">PS5 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-silver-ps5" class="form-input settings-input" value="${s.rates.silver['PS5']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
      </div>

      <!-- Platinum tier -->
      <div class="settings-section">
        <div class="settings-title">💎 Platinum 会员 / Platinum Member</div>
        <div class="settings-row">
          <div class="settings-label">入会费<small>One-time join fee</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="fee-platinum" class="form-input settings-input" value="${s.memberFees.platinum}" min="0" step="10">
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">Switch 2 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-plat-switch" class="form-input settings-input" value="${s.rates.platinum['Switch 2']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">PS5 时费<small>Per hour</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="rate-plat-ps5" class="form-input settings-input" value="${s.rates.platinum['PS5']}" min="0" step="0.5">
            <span class="rate-suffix">/h</span>
          </div>
        </div>
      </div>

      <!-- Other -->
      <div class="settings-section">
        <div class="settings-title">通用 / General</div>
        <div class="settings-row">
          <div class="settings-label">Platinum 充值福利金<small>$X bonus per Platinum top-up (≥ ${sym}${s.memberFees.platinum})</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="platinum-bonus" class="form-input settings-input" value="${s.platinumTopupBonus}" min="0" step="5">
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">提醒分钟数<small>Warn N minutes before walk-in time up / member balance runs out</small></div>
          <input type="number" id="warn-minutes" class="form-input settings-input" value="${s.warnMinutes}" min="1" max="60" step="1">
        </div>
        <div class="settings-row">
          <div class="settings-label">每台最多人数<small>Max players per station (1-6)</small></div>
          <input type="number" id="max-players" class="form-input settings-input" value="${s.maxPlayersPerStation}" min="1" max="6" step="1">
        </div>
        <div class="settings-row">
          <div class="settings-label">货币符号<small>Currency symbol</small></div>
          <input type="text" id="currency-sym" class="form-input settings-input" value="${sym}" maxlength="3" style="width:80px;text-align:center">
        </div>
      </div>

      <!-- Store ops (Migration 012 / Tier 0.5 + 0.9) -->
      <div class="settings-section">
        <div class="settings-title">门店 / Store</div>
        <div class="settings-row">
          <div class="settings-label">外带打包费<small>Takeaway box fee per order</small></div>
          <div class="rate-input-group">
            <span class="rate-prefix">${sym}</span>
            <input type="number" id="takeaway-charge" class="form-input settings-input" value="${(s.takeawayCharge != null ? s.takeawayCharge : 0.20).toFixed(2)}" min="0" step="0.05">
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">员工名单<small>Staff names for void/discount attribution — comma separated</small></div>
          <input type="text" id="staff-names" class="form-input" style="min-width:280px" value="${GC.esc((s.staffNames || []).join(', '))}">
        </div>
        <div class="settings-row">
          <div class="settings-label">经理 PIN<small>${s.managerPin ? '已设置 — 输入新 PIN 可更换；留空保持不变' : '未设置 — 设置后作废/大额折扣需要 PIN'}</small></div>
          <input type="password" id="manager-pin" class="form-input settings-input" inputmode="numeric" maxlength="8" placeholder="${s.managerPin ? '••••' : '4-8 位数字'}" autocomplete="new-password" style="width:140px;text-align:center">
        </div>
      </div>

      <!-- Data -->
      <div class="settings-section">
        <div class="settings-title">数据管理 / Data Management</div>
        <div class="settings-row">
          <div class="settings-label">导出数据<small>Download all data as JSON backup</small></div>
          <button class="btn btn-secondary btn-sm" id="export-data">导出 / Export</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">导入数据<small>Restore from JSON backup</small></div>
          <div>
            <input type="file" id="import-file" accept=".json" style="display:none">
            <button class="btn btn-secondary btn-sm" id="import-data">导入 / Import</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">
        <button class="btn btn-primary" id="save-settings">保存设置 / Save</button>
        <button class="btn btn-secondary" id="clear-history">清除历史 / Clear History</button>
        <button class="btn btn-secondary" id="reset-all">重置所有 / Reset All</button>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    // Promo live toggle
    document.getElementById('promo-toggle').addEventListener('change', async (e) => {
      const active = e.target.checked;
      await GC.Store.togglePromo(active);
      GC.toast(active ? '促销已开启 / Promo ON' : '促销已关闭 / Promo OFF', 'success');
      render();
    });

    document.getElementById('save-settings').addEventListener('click', async () => {
      const s = GC.Store.getSettings();
      const newSettings = {
        ...s,
        rates: {
          regular: {
            'Switch 2': parseFloat(document.getElementById('rate-reg-switch').value) || 0,
            'PS5': parseFloat(document.getElementById('rate-reg-ps5').value) || 0,
          },
          silver: {
            'Switch 2': parseFloat(document.getElementById('rate-silver-switch').value) || 0,
            'PS5': parseFloat(document.getElementById('rate-silver-ps5').value) || 0,
          },
          platinum: {
            'Switch 2': parseFloat(document.getElementById('rate-plat-switch').value) || 0,
            'PS5': parseFloat(document.getElementById('rate-plat-ps5').value) || 0,
          },
          promo: {
            'Switch 2': parseFloat(document.getElementById('rate-promo-switch').value) || 0,
            'PS5': parseFloat(document.getElementById('rate-promo-ps5').value) || 0,
          },
        },
        memberFees: {
          silver: parseFloat(document.getElementById('fee-silver').value) || 0,
          platinum: parseFloat(document.getElementById('fee-platinum').value) || 0,
        },
        promoActive: document.getElementById('promo-toggle').checked,
        platinumTopupBonus: parseFloat(document.getElementById('platinum-bonus').value) || 0,
        warnMinutes: parseInt(document.getElementById('warn-minutes').value) || 10,
        maxPlayersPerStation: Math.max(1, Math.min(6, parseInt(document.getElementById('max-players').value) || 4)),
        currencySymbol: document.getElementById('currency-sym').value || '$',
        minBillingMinutes: 0,
        // Store ops (Tier 0.5 + 0.9)
        takeawayCharge: Math.max(0, parseFloat(document.getElementById('takeaway-charge').value) || 0),
        // UX audit 2026-07-03: owners type with Chinese IME — split on
        // fullwidth ，and 、too, or "A，B" silently saves as ONE staff name.
        staffNames: document.getElementById('staff-names').value
          .split(/[,，、]/).map(x => x.trim()).filter(Boolean),
        managerPin: s.managerPin || null,   // may be replaced below
      };
      // PIN field: blank = keep existing; a new value is hashed before save.
      const pinRaw = document.getElementById('manager-pin').value.trim();
      if (pinRaw) {
        if (!/^\d{4,8}$/.test(pinRaw)) {
          GC.toast('PIN 需为 4-8 位数字 / PIN must be 4-8 digits', 'error');
          return;
        }
        // Finance audit 2026-07-03: changing an EXISTING PIN requires the
        // current PIN first — otherwise any cashier could replace it and
        // self-approve voids/discounts.
        if (s.managerPin) {
          const ok = await GC.requireManagerPin('更换经理 PIN / Change manager PIN');
          if (!ok) {
            GC.toast('未授权 — PIN 未更改 / Not authorized', 'error');
            return;
          }
        }
        newSettings.managerPin = await GC.pinHash(pinRaw);
      }
      await GC.Store.saveSettings(newSettings);
      GC.toast('设置已保存 / Settings saved', 'success');
    });

    document.getElementById('clear-history').addEventListener('click', async () => {
      const ok = await GC.confirm(
        '确定清除所有游戏台历史记录吗？\n此操作不可撤销。\n\nClear all session history? This cannot be undone.',
        { title: '清除历史 / Clear History', danger: true, confirmText: '清除 / Clear' }
      );
      if (ok) {
        await GC.Store.clearSessions();
        GC.toast('已清除 / Cleared', 'success');
      }
    });

    document.getElementById('reset-all').addEventListener('click', async () => {
      const typed = await GC.prompt(
        '⚠️ 危险操作：将清空所有订单、游戏台、充值记录。\n会员将被软删除（数据保留）。\n\n请输入 RESET 确认。',
        { title: '🛑 重置所有数据 / Reset All', placeholder: 'RESET' }
      );
      if (typed !== 'RESET') {
        if (typed !== null) GC.toast('未输入 RESET — 已取消 / Cancelled', 'error');
        return;
      }
      try {
        await GC.Store.resetAll('RESET');
        GC.toast('已重置 / Reset done', 'success');
        render();
      } catch (e) {
        GC.toast(e.message, 'error');
      }
    });

    document.getElementById('export-data').addEventListener('click', () => {
      const json = GC.Store.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamestation-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      GC.toast('已导出 / Exported', 'success');
    });

    document.getElementById('import-data').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await GC.confirm(
        '导入将覆盖所有数据。\nImporting will overwrite all data.',
        { title: '导入备份 / Import Backup', danger: true, confirmText: '导入 / Import' }
      );
      if (!ok) return;
      try {
        const text = await file.text();
        await GC.Store.importData(text);
        GC.toast('已导入 / Imported', 'success');
        render();
      } catch (err) {
        GC.toast('导入失败 / Import failed: ' + err.message, 'error');
      }
    });
  }

  function destroy() {}
  return { render, destroy };
})();
