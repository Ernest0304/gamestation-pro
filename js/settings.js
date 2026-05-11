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
          <div class="settings-label">最低计费时长<small>Minimum billable minutes (0 = none)</small></div>
          <input type="number" id="min-billing" class="form-input settings-input" value="${s.minBillingMinutes || 0}" min="0" step="5">
        </div>
        <div class="settings-row">
          <div class="settings-label">货币符号<small>Currency symbol</small></div>
          <input type="text" id="currency-sym" class="form-input settings-input" value="${sym}" maxlength="3" style="width:80px;text-align:center">
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
        minBillingMinutes: parseInt(document.getElementById('min-billing').value) || 0,
        currencySymbol: document.getElementById('currency-sym').value || '$',
      };
      await GC.Store.saveSettings(newSettings);
      GC.toast('设置已保存 / Settings saved', 'success');
    });

    document.getElementById('clear-history').addEventListener('click', async () => {
      if (confirm('确定清除所有历史记录吗？此操作不可撤销。\nClear all session history? This cannot be undone.')) {
        await GC.Store.clearSessions();
        GC.toast('已清除 / Cleared', 'success');
      }
    });

    document.getElementById('reset-all').addEventListener('click', async () => {
      if (confirm('确定重置所有数据吗？\n(包括设置、会员、历史)\n\nReset ALL data (settings, members, history)?')) {
        await GC.Store.resetAll();
        GC.toast('已重置 / Reset done', 'success');
        render();
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
      if (!confirm('导入将覆盖所有数据，确定继续？\nImporting will overwrite all data. Continue?')) return;
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
