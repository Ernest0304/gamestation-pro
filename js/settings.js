/**
 * Settings — Pricing, membership config, export/import
 */
window.GC = window.GC || {};

GC.Settings = (function () {

  function render() {
    const s = GC.Store.getSettings();
    const sym = s.currencySymbol;

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">设置</h2>
      </div>

      <div class="settings-section">
        <div class="settings-title">计费设置</div>
        <div class="settings-row">
          <div class="settings-label">PS5 时费<small>每小时费率 (${s.currency})</small></div>
          <input type="number" id="rate-ps5" class="form-input settings-input" value="${s.rates.PS5}" min="0" step="0.5">
        </div>
        <div class="settings-row">
          <div class="settings-label">Switch 2 时费<small>每小时费率 (${s.currency})</small></div>
          <input type="number" id="rate-switch" class="form-input settings-input" value="${s.rates['Switch 2']}" min="0" step="0.5">
        </div>
        <div class="settings-row">
          <div class="settings-label">最低计费时长<small>低于此时长按此时长收费（分钟，0 = 无限制）</small></div>
          <input type="number" id="min-billing" class="form-input settings-input" value="${s.minBillingMinutes || 0}" min="0" step="5">
        </div>
        <div class="settings-row">
          <div class="settings-label">货币符号<small>显示在金额前的符号</small></div>
          <input type="text" id="currency-sym" class="form-input settings-input" value="${sym}" maxlength="3" style="width:80px;text-align:center">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-title">会员等级门槛</div>
        <div class="settings-row">
          <div class="settings-label">Silver 门槛<small>累计消费达到此金额自动升级</small></div>
          <input type="number" id="th-silver" class="form-input settings-input" value="${s.tierThresholds.silver}" min="0" step="10">
        </div>
        <div class="settings-row">
          <div class="settings-label">Gold 门槛<small>累计消费达到此金额自动升级</small></div>
          <input type="number" id="th-gold" class="form-input settings-input" value="${s.tierThresholds.gold}" min="0" step="10">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-title">会员折扣</div>
        <div class="settings-row">
          <div class="settings-label">Bronze 折扣<small>新会员默认等级</small></div>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="disc-bronze" class="form-input settings-input" value="${s.memberDiscounts.bronze}" min="0" max="100" step="1">
            <span style="color:var(--text-muted)">%</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">Silver 折扣</div>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="disc-silver" class="form-input settings-input" value="${s.memberDiscounts.silver}" min="0" max="100" step="1">
            <span style="color:var(--text-muted)">%</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">Gold 折扣</div>
          <div style="display:flex;align-items:center;gap:6px">
            <input type="number" id="disc-gold" class="form-input settings-input" value="${s.memberDiscounts.gold}" min="0" max="100" step="1">
            <span style="color:var(--text-muted)">%</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-title">数据管理</div>
        <div class="settings-row">
          <div class="settings-label">导出数据<small>下载所有数据为 JSON 文件备份</small></div>
          <button class="btn btn-secondary btn-sm" id="export-data">导出 JSON</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">导入数据<small>从 JSON 备份文件恢复数据</small></div>
          <div>
            <input type="file" id="import-file" accept=".json" style="display:none">
            <button class="btn btn-secondary btn-sm" id="import-data">导入 JSON</button>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-primary" id="save-settings">保存设置</button>
        <button class="btn btn-secondary" id="clear-history">清除历史记录</button>
        <button class="btn btn-secondary" id="reset-all">重置所有数据</button>
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('save-settings').addEventListener('click', async () => {
      const s = GC.Store.getSettings();
      s.rates.PS5 = parseFloat(document.getElementById('rate-ps5').value) || 0;
      s.rates['Switch 2'] = parseFloat(document.getElementById('rate-switch').value) || 0;
      s.minBillingMinutes = parseInt(document.getElementById('min-billing').value) || 0;
      s.currencySymbol = document.getElementById('currency-sym').value || '$';
      s.tierThresholds.silver = parseFloat(document.getElementById('th-silver').value) || 0;
      s.tierThresholds.gold = parseFloat(document.getElementById('th-gold').value) || 0;
      s.memberDiscounts.bronze = parseFloat(document.getElementById('disc-bronze').value) || 0;
      s.memberDiscounts.silver = parseFloat(document.getElementById('disc-silver').value) || 0;
      s.memberDiscounts.gold = parseFloat(document.getElementById('disc-gold').value) || 0;
      await GC.Store.saveSettings(s);
      GC.toast('设置已保存', 'success');
    });

    document.getElementById('clear-history').addEventListener('click', async () => {
      if (confirm('确定要清除所有历史记录吗？此操作不可撤销。')) {
        await GC.Store.clearSessions();
        GC.toast('历史记录已清除', 'success');
      }
    });

    document.getElementById('reset-all').addEventListener('click', async () => {
      if (confirm('确定要重置所有数据吗？（包括设置、会员、历史记录）\n此操作不可撤销！')) {
        await GC.Store.resetAll();
        GC.toast('所有数据已重置', 'success');
        render();
      }
    });

    // Export
    document.getElementById('export-data').addEventListener('click', () => {
      const json = GC.Store.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gamestation-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      GC.toast('数据已导出', 'success');
    });

    // Import
    document.getElementById('import-data').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('导入将覆盖当前所有数据，确定继续吗？')) return;
      try {
        const text = await file.text();
        await GC.Store.importData(text);
        GC.toast('数据已导入', 'success');
        render();
      } catch (err) {
        GC.toast('导入失败: ' + err.message, 'error');
      }
    });
  }

  function destroy() {}
  return { render, destroy };
})();
