/**
 * History — Session history, charts, and report generation
 */
window.GC = window.GC || {};

GC.History = (function () {
  let chart = null;
  let mode = 'day';   // 'day' | 'month' | 'range'
  let selectedDate = localDateStr(new Date());
  let selectedMonth = selectedDate.slice(0, 7);
  let rangeFrom = localDateStr(new Date());
  let rangeTo = localDateStr(new Date());

  // Hour/category filter state (Wave B 2026-05-14)
  // Shop hours: 12:00 → 25:00 (next-day 01:00). Default = full business day today.
  let filterStartDate = localDateStr(new Date());
  let filterEndDate = localDateStr(new Date());
  let filterStartHour = 12;
  let filterEndHour = 25;
  let filterCategory = 'all';   // 'all' | 'food' | 'gaming'

  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  function fmtDur(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /* ---- Date range helpers ---- */
  function getDayRange() {
    const start = new Date(selectedDate + 'T00:00:00').getTime();
    return { start, end: start + 86400000, label: selectedDate };
  }

  function getMonthRange() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    return { start, end, label: `${y}年${m}月` };
  }

  function getCustomRange() {
    const start = new Date(rangeFrom + 'T00:00:00').getTime();
    const end = new Date(rangeTo + 'T00:00:00').getTime() + 86400000;
    return { start, end, label: `${rangeFrom} ~ ${rangeTo}` };
  }

  function getRange() {
    if (mode === 'month') return getMonthRange();
    if (mode === 'range') return getCustomRange();
    return getDayRange();
  }

  function getFiltered() {
    const { start, end } = getRange();
    // Migration 009: scope to current branch
    const bId = GC.Store.getCurrentBranchId ? GC.Store.getCurrentBranchId() : null;
    return GC.Store.getSessions().filter(s => {
      if (s.endTime < start || s.endTime >= end) return false;
      if (bId && s.branchId && s.branchId !== bId) return false;
      return true;
    });
  }

  /* ---- Chart data builders ---- */
  function buildDayChartData(filtered) {
    // Group by hour
    const hours = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;
    filtered.forEach(s => {
      const h = new Date(s.endTime).getHours();
      hours[h] += s.total;
    });
    return {
      labels: Object.keys(hours).map(h => `${h}:00`),
      data: Object.values(hours),
      xLabel: '时段',
    };
  }

  function buildMonthChartData(filtered) {
    // Group by day
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = {};
    for (let i = 1; i <= daysInMonth; i++) days[i] = 0;
    filtered.forEach(s => {
      const d = new Date(s.endTime).getDate();
      days[d] += s.total;
    });
    return {
      labels: Object.keys(days).map(d => `${d}日`),
      data: Object.values(days),
      xLabel: '日期',
    };
  }

  function buildRangeChartData(filtered) {
    // Group by date
    const days = {};
    filtered.forEach(s => {
      const key = localDateStr(new Date(s.endTime));
      days[key] = (days[key] || 0) + s.total;
    });
    // Fill gaps
    const start = new Date(rangeFrom + 'T00:00:00');
    const end = new Date(rangeTo + 'T00:00:00');
    const allDays = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = localDateStr(d);
      allDays[key] = days[key] || 0;
    }
    const labels = Object.keys(allDays);
    // Shorten labels if too many
    const shortLabels = labels.map(l => l.slice(5)); // MM-DD
    return {
      labels: shortLabels,
      data: Object.values(allDays),
      xLabel: '日期',
    };
  }

  function getChartData(filtered) {
    if (mode === 'month') return buildMonthChartData(filtered);
    if (mode === 'range') return buildRangeChartData(filtered);
    return buildDayChartData(filtered);
  }

  /* ---- Render chart ---- */
  function renderChart(filtered) {
    if (chart) { chart.destroy(); chart = null; }
    const canvas = document.getElementById('revenue-chart');
    if (!canvas) return;
    const sym = GC.Store.getSettings().currencySymbol;
    const { labels, data, xLabel } = getChartData(filtered);

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `收入 (${sym})`,
          data,
          backgroundColor: 'rgba(6, 182, 212, 0.5)',
          borderColor: 'rgba(6, 182, 212, 1)',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${sym}${ctx.raw.toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: xLabel, color: '#64748b' },
            ticks: { color: '#94a3b8', maxRotation: 45, font: { size: 10 } },
            grid: { color: 'rgba(30,41,59,0.5)' },
          },
          y: {
            title: { display: true, text: `金额 (${sym})`, color: '#64748b' },
            ticks: { color: '#94a3b8', callback: v => `${sym}${v}` },
            grid: { color: 'rgba(30,41,59,0.5)' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  /* ---- Report generation ---- */
  function generatePDF(filtered) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const sym = GC.Store.getSettings().currencySymbol;
    const { label } = getRange();
    const totalRev = filtered.reduce((s, x) => s + x.total, 0);
    const totalTime = filtered.reduce((s, x) => s + x.durationMinutes, 0);

    // Title
    doc.setFontSize(18);
    doc.text('Yuu Xiang Dam (YXD) - 郁香潭', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Revenue Report - ${label}`, 14, 28);

    // Summary
    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(`Total Sessions: ${filtered.length}`, 14, 38);
    doc.text(`Total Duration: ${fmtDur(totalTime)}`, 14, 44);
    doc.text(`Total Revenue: ${sym}${totalRev.toFixed(2)}`, 14, 50);
    doc.text(`Generated: ${new Date().toLocaleString('zh-CN')}`, 14, 56);

    // Table
    const rows = filtered.map(s => {
      let player = 'Walk-in';
      if (s.memberId) {
        const m = GC.Store.getMember(s.memberId);
        if (m) player = m.name;
      }
      return [
        fmtDate(s.endTime),
        fmtTime(s.startTime) + '-' + fmtTime(s.endTime),
        s.stationName,
        s.stationType,
        player,
        fmtDur(s.durationMinutes),
        `${sym}${s.total.toFixed(2)}`,
      ];
    });

    doc.autoTable({
      startY: 62,
      head: [['Date', 'Time', 'Station', 'Type', 'Player', 'Duration', 'Amount']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [6, 182, 212], textColor: 255 },
    });

    doc.save(`YXD-Report-${label.replace(/[~/\s]/g, '_')}.pdf`);
    GC.toast('PDF 报表已下载', 'success');
  }

  function generateExcel(filtered) {
    const sym = GC.Store.getSettings().currencySymbol;
    const { label } = getRange();
    const totalRev = filtered.reduce((s, x) => s + x.total, 0);
    const totalTime = filtered.reduce((s, x) => s + x.durationMinutes, 0);

    // Summary sheet data
    const summaryData = [
      ['Yuu Xiang Dam (YXD) - Revenue Report'],
      ['Period', label],
      ['Total Sessions', filtered.length],
      ['Total Duration', fmtDur(totalTime)],
      ['Total Revenue', `${sym}${totalRev.toFixed(2)}`],
      ['Generated', new Date().toLocaleString('zh-CN')],
    ];

    // Detail sheet data
    const detailData = [
      ['Date', 'Start', 'End', 'Station', 'Type', 'Player', 'Duration', 'Rate', 'Subtotal', 'Discount%', 'Total'],
    ];
    filtered.forEach(s => {
      let player = 'Walk-in';
      if (s.memberId) {
        const m = GC.Store.getMember(s.memberId);
        if (m) player = m.name;
      }
      detailData.push([
        fmtDate(s.endTime),
        fmtTime(s.startTime),
        fmtTime(s.endTime),
        s.stationName,
        s.stationType,
        player,
        fmtDur(s.durationMinutes),
        s.rate,
        s.subtotal,
        s.discountPercent,
        s.total,
      ]);
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
    // Set column widths
    wsDetail['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Details');
    XLSX.writeFile(wb, `YXD-Report-${label.replace(/[~/\s]/g, '_')}.xlsx`);
    GC.toast('Excel 报表已下载', 'success');
  }

  /* ---- Main render ---- */
  function render() {
    const settings = GC.Store.getSettings();
    const sym = settings.currencySymbol;
    const filtered = getFiltered();
    const totalRev = filtered.reduce((s, x) => s + x.total, 0).toFixed(2);
    const totalTime = filtered.reduce((s, x) => s + x.durationMinutes, 0);

    // Table rows
    let rows = '';
    if (filtered.length === 0) {
      rows = `<tr><td colspan="6" class="table-empty">暂无记录 / No records</td></tr>`;
    } else {
      filtered.forEach(s => {
        let player = '散客 / Walk-in';
        if (s.memberId) {
          const m = GC.Store.getMember(s.memberId);
          if (m) {
            const tierIcon = m.tier === 'platinum' ? '💎' : m.tier === 'silver' ? '🥈' : '';
            player = `${tierIcon} ${m.name}`.trim();
          }
        }
        rows += `
          <tr>
            <td>${fmtDate(s.endTime)} ${fmtTime(s.startTime)}-${fmtTime(s.endTime)}</td>
            <td>${s.stationName}</td>
            <td><span class="type-badge ${s.stationType === 'PS5' ? 'ps5' : 'switch'}" style="font-size:0.7rem">${s.stationType}</span></td>
            <td>${player}</td>
            <td>${fmtDur(s.durationMinutes)}</td>
            <td style="font-weight:600">${sym}${s.total.toFixed(2)}${s.discountPercent > 0 ? ` <small style="color:var(--green)">(-${s.discountPercent}%)</small>` : ''}</td>
          </tr>`;
      });
    }

    // Z-Report data — today's takings across F&B + gaming + top-ups, by tender.
    // BUSINESS date (06:00 SGT cutoff): at 00:30 the Z-Report still shows the
    // trading day the cashier is about to close, not the calendar's new day.
    const today = GC.Store.getBusinessDate();
    const z = GC.Store.getDailySummary(today);
    const closeRecord = (GC.Store.getDailyCloses() || []).find(c => c.closeDate === today);
    const isClosed = !!closeRecord;

    const zReportHtml = `
      <div class="z-report-card ${isClosed ? 'closed' : ''}">
        <div class="z-report-header">
          <div>
            <div class="z-report-title">📊 今日营收 / Today's Takings</div>
            <div class="z-report-subtitle">${today} · ${isClosed ? '已结账 / Closed at ' + new Date(closeRecord.closedAt).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) : '未结账 / Open'}</div>
          </div>
          <button class="btn ${isClosed ? 'btn-secondary' : 'btn-primary'} btn-sm" id="z-close-day">
            ${isClosed ? '查看 / View Close' : '🔒 结账 / Close Day'}
          </button>
        </div>
        <div class="z-report-grid">
          <div class="z-stat cash">
            <span class="z-stat-label">💵 现金 / Cash</span>
            <span class="z-stat-value">${sym}${z.cash.toFixed(2)}</span>
            ${z.topUpsCash > 0 ? `<small>含充值 +${sym}${z.topUpsCash.toFixed(2)}</small>` : ''}
          </div>
          <div class="z-stat paynow">
            <span class="z-stat-label">📱 PayNow</span>
            <span class="z-stat-value">${sym}${z.paynow.toFixed(2)}</span>
          </div>
          <div class="z-stat member">
            <span class="z-stat-label">💎 会员余额 / Member</span>
            <span class="z-stat-value">${sym}${z.memberBalance.toFixed(2)}</span>
          </div>
          <div class="z-stat topup">
            <span class="z-stat-label">💰 充值收款 / Top-ups</span>
            <span class="z-stat-value">${sym}${z.topUpsCash.toFixed(2)}</span>
            ${z.topUpsBonus > 0 ? `<small>+ ${sym}${z.topUpsBonus.toFixed(2)} 福利金 / bonus given</small>` : ''}
          </div>
          ${(z.grab || 0) > 0 || (z.foodpanda || 0) > 0 || z.deliveryCount > 0 ? `
            <div class="z-stat grab">
              <span class="z-stat-label">🛵 Grab</span>
              <span class="z-stat-value">${sym}${(z.grab || 0).toFixed(2)}</span>
            </div>
            <div class="z-stat foodpanda">
              <span class="z-stat-label">🐼 FoodPanda</span>
              <span class="z-stat-value">${sym}${(z.foodpanda || 0).toFixed(2)}</span>
            </div>
          ` : ''}
        </div>
        <div class="z-report-totals">
          <span>
            订单 ${z.orderCount} · 游戏台 ${z.sessionCount}${z.voidedCount > 0 ? ` · 作废 ${z.voidedCount}` : ''}${z.takeawayCount ? ` · 外带 ${z.takeawayCount}` : ''}${z.deliveryCount ? ` · 外卖 ${z.deliveryCount}` : ''} · 折扣 ${sym}${z.totalDiscount.toFixed(2)}
          </span>
          <span class="z-report-total"><strong>总收入 / Total: ${sym}${z.totalRevenue.toFixed(2)}</strong></span>
        </div>
      </div>`;

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">报表 / Reports</h2>
        <div class="report-buttons">
          <button class="btn btn-secondary btn-sm" id="dl-pdf">📄 PDF 报表</button>
          <button class="btn btn-secondary btn-sm" id="dl-excel">📊 Excel 报表</button>
        </div>
      </div>

      ${zReportHtml}

      ${renderHourFilter(sym)}

      <h3 class="section-title" style="margin-top:24px">🎮 游戏台明细 / Gaming Detail</h3>

      <!-- Mode tabs -->
      <div class="history-tabs">
        <button class="history-tab ${mode === 'day' ? 'active' : ''}" data-mode="day">按日 / Daily</button>
        <button class="history-tab ${mode === 'month' ? 'active' : ''}" data-mode="month">按月 / Monthly</button>
        <button class="history-tab ${mode === 'range' ? 'active' : ''}" data-mode="range">自定义 / Custom</button>
      </div>

      <!-- Date selector -->
      <div class="date-selector">
        ${mode === 'day' ? `
          <input type="date" id="sel-date" class="form-input" value="${selectedDate}">
        ` : mode === 'month' ? `
          <input type="month" id="sel-month" class="form-input" value="${selectedMonth}">
        ` : `
          <div class="range-inputs">
            <label class="form-label" style="margin-bottom:0">从 / From</label>
            <input type="date" id="sel-from" class="form-input" value="${rangeFrom}">
            <label class="form-label" style="margin-bottom:0">到 / To</label>
            <input type="date" id="sel-to" class="form-input" value="${rangeTo}">
            <button class="btn btn-primary btn-sm" id="apply-range">查询 / Search</button>
          </div>
        `}
      </div>

      <!-- Stats -->
      <div class="stats-bar" style="margin-bottom:20px">
        <div class="stat-card">
          <span class="stat-label">订单数 / Sessions</span>
          <span class="stat-value muted">${filtered.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总时长 / Duration</span>
          <span class="stat-value muted">${fmtDur(totalTime)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">总收入 / Revenue</span>
          <span class="stat-value green">${sym}${totalRev}</span>
        </div>
      </div>

      <!-- Chart -->
      <div class="chart-container">
        <canvas id="revenue-chart"></canvas>
      </div>

      <!-- Table -->
      <div class="table-container" style="margin-top:20px">
        <table class="data-table">
          <thead>
            <tr><th>时间 / Time</th><th>机台 / Station</th><th>类型 / Type</th><th>玩家 / Player</th><th>时长 / Duration</th><th>金额 / Amount</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    bindEvents(filtered);
    renderChart(filtered);
  }

  function bindEvents(filtered) {
    // Z-Report close-day button
    const zBtn = document.getElementById('z-close-day');
    if (zBtn) zBtn.addEventListener('click', showCloseDayModal);

    // Hour/category filter panel
    bindHourFilterEvents();

    // Mode tabs
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        mode = tab.dataset.mode;
        render();
      });
    });

    // Date selectors
    if (mode === 'day') {
      document.getElementById('sel-date').addEventListener('change', e => {
        selectedDate = e.target.value;
        render();
      });
    } else if (mode === 'month') {
      document.getElementById('sel-month').addEventListener('change', e => {
        selectedMonth = e.target.value;
        render();
      });
    } else {
      document.getElementById('apply-range').addEventListener('click', () => {
        rangeFrom = document.getElementById('sel-from').value;
        rangeTo = document.getElementById('sel-to').value;
        if (rangeFrom > rangeTo) {
          GC.toast('开始日期不能晚于结束日期', 'error');
          return;
        }
        render();
      });
    }

    // Report downloads
    document.getElementById('dl-pdf').addEventListener('click', () => generatePDF(filtered));
    document.getElementById('dl-excel').addEventListener('click', () => generateExcel(filtered));
  }

  function destroy() {
    if (chart) { chart.destroy(); chart = null; }
  }

  /* ---- Hour / Category filter (Wave B 2026-05-14) ---- */
  // 12pm to next-day 1am: 13 integer steps (12..25).
  function hourOptions(selected) {
    const opts = [];
    for (let h = 12; h <= 25; h++) {
      const label = h < 24 ? `${String(h).padStart(2, '0')}:00`
                   : h === 24 ? '00:00 (午夜)'
                   : '01:00 (次日)';
      opts.push(`<option value="${h}" ${selected === h ? 'selected' : ''}>${label}</option>`);
    }
    return opts.join('');
  }

  function renderHourFilter(sym) {
    const summary = GC.Store.getRangeSummary({
      startDate: filterStartDate, endDate: filterEndDate,
      startHour: filterStartHour, endHour: filterEndHour,
      category: filterCategory,
    });

    // Quick presets for current state
    const catPill = (key, label) =>
      `<button class="cat-pill ${filterCategory === key ? 'active' : ''}" data-cat="${key}">${label}</button>`;

    // Hourly bars: max revenue for scaling
    const maxRev = Math.max(0.01, ...summary.hourly.map(h => h.revenue));
    const bars = summary.hourly.map(h => `
      <div class="hour-bar-row" title="${h.label}: ${sym}${h.revenue.toFixed(2)}">
        <div class="hour-bar-label">${h.label}</div>
        <div class="hour-bar-track">
          <div class="hour-bar-fill" style="width:${(h.revenue / maxRev * 100).toFixed(1)}%"></div>
        </div>
        <div class="hour-bar-value">${sym}${h.revenue.toFixed(2)}</div>
      </div>
    `).join('');

    return `
      <div class="filter-panel">
        <div class="filter-panel-header">
          <h3 class="section-title" style="margin:0">⏰ 时段筛选 / Time-Range Filter</h3>
          <small style="color:var(--text-muted)">营业时间 12:00 — 次日 01:00</small>
        </div>

        <div class="filter-controls">
          <div class="filter-group">
            <label class="form-label">起始日期 / Start Date</label>
            <input type="date" id="flt-start-date" class="form-input" value="${filterStartDate}">
          </div>
          <div class="filter-group">
            <label class="form-label">结束日期 / End Date</label>
            <input type="date" id="flt-end-date" class="form-input" value="${filterEndDate}">
          </div>
          <div class="filter-group">
            <label class="form-label">从几点 / From Hour</label>
            <select id="flt-start-hour" class="form-input">${hourOptions(filterStartHour)}</select>
          </div>
          <div class="filter-group">
            <label class="form-label">到几点 / To Hour</label>
            <select id="flt-end-hour" class="form-input">${hourOptions(filterEndHour)}</select>
          </div>
        </div>

        <div class="filter-cat-row">
          <span style="font-size:0.85rem;color:var(--text-secondary);font-weight:600">类型 / Type:</span>
          ${catPill('all', '全部 / All')}
          ${catPill('food', '🍴 餐饮 / F&B')}
          ${catPill('gaming', '🎮 游戏 / Gaming')}
        </div>

        <div class="filter-result-card">
          <div class="filter-result-tiles">
            <div class="filter-result-tile">
              <span class="filter-result-label">营业额 / Revenue</span>
              <span class="filter-result-value">${sym}${summary.revenue.toFixed(2)}</span>
            </div>
            <div class="filter-result-tile">
              <span class="filter-result-label">订单 / F&B Orders</span>
              <span class="filter-result-value">${summary.orderCount}</span>
            </div>
            <div class="filter-result-tile">
              <span class="filter-result-label">游戏台 / Sessions</span>
              <span class="filter-result-value">${summary.sessionCount}</span>
            </div>
            <div class="filter-result-tile">
              <span class="filter-result-label">餐饮 / F&B $</span>
              <span class="filter-result-value">${sym}${summary.breakdown.food.toFixed(2)}</span>
            </div>
            <div class="filter-result-tile">
              <span class="filter-result-label">游戏 / Gaming $</span>
              <span class="filter-result-value">${sym}${summary.breakdown.gaming.toFixed(2)}</span>
            </div>
          </div>

          <h4 class="section-title" style="margin:18px 0 10px;font-size:0.9rem">按小时分布 / Hourly Breakdown</h4>
          <div class="hour-bars">
            ${bars || '<div class="filter-result-empty">所选时段没有订单 / No orders in selected range</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function bindHourFilterEvents() {
    const startD = document.getElementById('flt-start-date');
    const endD = document.getElementById('flt-end-date');
    const startH = document.getElementById('flt-start-hour');
    const endH = document.getElementById('flt-end-hour');
    if (startD) startD.addEventListener('change', e => { filterStartDate = e.target.value; render(); });
    if (endD) endD.addEventListener('change', e => { filterEndDate = e.target.value; render(); });
    if (startH) startH.addEventListener('change', e => {
      filterStartHour = parseInt(e.target.value);
      if (filterEndHour <= filterStartHour) filterEndHour = Math.min(25, filterStartHour + 1);
      render();
    });
    if (endH) endH.addEventListener('change', e => {
      filterEndHour = parseInt(e.target.value);
      if (filterEndHour <= filterStartHour) filterStartHour = Math.max(12, filterEndHour - 1);
      render();
    });
    document.querySelectorAll('[data-cat]').forEach(b => {
      b.addEventListener('click', () => { filterCategory = b.dataset.cat; render(); });
    });
  }

  /* ---- Z-Report: Close Day modal ---- */
  async function showCloseDayModal() {
    const sym = GC.Store.getSettings().currencySymbol;
    // BUSINESS date — closing at 00:30 closes the trading day that started
    // yesterday noon, not the new calendar date.
    const today = GC.Store.getBusinessDate();
    const z = GC.Store.getDailySummary(today);
    const existing = (GC.Store.getDailyCloses() || []).find(c => c.closeDate === today);
    // Tier 0.3: branch opening float is part of the expected drawer count.
    const curBranch = GC.Store.getCurrentBranch ? GC.Store.getCurrentBranch() : null;
    const openingFloat = Number((curBranch && curBranch.openingFloat) || 0);

    const modal = document.getElementById('modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-content modal-wide">
          <div class="modal-header">
            <h3>🔒 ${existing ? '已结账记录' : '日结 / Close Day'} — ${today}</h3>
            <button class="modal-close" id="m-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="z-report-grid" style="margin-bottom:18px">
              <div class="z-stat cash">
                <span class="z-stat-label">💵 现金 / Cash 预期</span>
                <span class="z-stat-value">${sym}${z.cash.toFixed(2)}</span>
              </div>
              <div class="z-stat paynow">
                <span class="z-stat-label">📱 PayNow</span>
                <span class="z-stat-value">${sym}${z.paynow.toFixed(2)}</span>
              </div>
              <div class="z-stat member">
                <span class="z-stat-label">💎 会员余额</span>
                <span class="z-stat-value">${sym}${z.memberBalance.toFixed(2)}</span>
              </div>
              <div class="z-stat topup">
                <span class="z-stat-label">💰 充值收款</span>
                <span class="z-stat-value">${sym}${z.topUpsCash.toFixed(2)}</span>
              </div>
            </div>

            <div class="settlement-row" style="font-size:1rem;margin-bottom:8px">
              <span>订单 / Orders</span><span>${z.orderCount}</span>
            </div>
            <div class="settlement-row" style="font-size:1rem;margin-bottom:8px">
              <span>游戏台 / Sessions</span><span>${z.sessionCount}</span>
            </div>
            ${z.voidedCount > 0 ? `
              <div class="settlement-row" style="font-size:1rem;margin-bottom:8px;color:var(--red)">
                <span>作废 / Voided</span><span>${z.voidedCount}</span>
              </div>` : ''}
            ${z.totalDiscount > 0 ? `
              <div class="settlement-row" style="font-size:1rem;margin-bottom:8px;color:var(--amber)">
                <span>折扣总额 / Discounts</span><span>-${sym}${z.totalDiscount.toFixed(2)}</span>
              </div>` : ''}
            <div class="settlement-divider"></div>
            <div class="settlement-row total" style="margin-bottom:18px">
              <span>总收入 / Total</span><span>${sym}${z.totalRevenue.toFixed(2)}</span>
            </div>

            ${existing ? `
              <div class="form-hint" style="margin-top:10px">
                此日已于 ${new Date(existing.closedAt).toLocaleString('zh-CN', { hour12: false })} 由
                ${GC.esc(existing.closedBy || '?')} 结账。
                ${existing.actualCash != null ? `<br>实际清点现金: ${sym}${existing.actualCash.toFixed(2)} (差 ${existing.cashDifference >= 0 ? '+' : ''}${sym}${existing.cashDifference.toFixed(2)})` : ''}
                ${existing.note ? `<br>备注: ${GC.esc(existing.note)}` : ''}
              </div>
            ` : `
              <div class="form-group">
                <label class="form-label">实际清点现金 / Actual Cash in Drawer (选填 optional)</label>
                <div class="rate-input-group" style="max-width:240px">
                  <span class="rate-prefix">${sym}</span>
                  <input type="number" id="z-actual-cash" class="form-input settings-input"
                    step="0.10" placeholder="${(openingFloat + z.cash + z.topUpsCash).toFixed(2)}"
                    style="font-size:1.3rem;font-weight:700;width:140px;text-align:right">
                </div>
                <div class="form-hint" style="line-height:1.5">
                  <strong>预期现金</strong> ${sym}${(openingFloat + z.cash + z.topUpsCash).toFixed(2)}<br>
                  <small style="color:var(--text-muted)">
                    包括：${openingFloat > 0 ? `备用金 ${sym}${openingFloat.toFixed(2)} ＋ ` : ''}订单/台 ${sym}${z.cash.toFixed(2)}${z.topUpsCash > 0 ? ` ＋ 充值 ${sym}${z.topUpsCash.toFixed(2)}` : ''}${z.refundsTotal > 0 ? ` － 退款 ${sym}已计入` : ''}
                  </small><br>
                  <small style="color:var(--text-muted)">差额会自动记录到日结</small>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">备注 / Note (选填)</label>
                <input type="text" id="z-note" class="form-input" placeholder="例：员工 A 接班; 缺零钱 ...">
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="m-cancel">${existing ? '关闭 / Close' : '取消 / Cancel'}</button>
            ${existing ? '' : '<button class="btn btn-primary" id="m-confirm-close">🔒 确认结账 / Confirm Close Day</button>'}
          </div>
        </div>
      </div>`;
    modal.classList.add('show');

    const close = () => { modal.classList.remove('show'); modal.innerHTML = ''; };
    document.getElementById('m-close').onclick = close;
    document.getElementById('m-cancel').onclick = close;
    const confirmBtn = document.getElementById('m-confirm-close');
    if (confirmBtn) {
      confirmBtn.onclick = async (e) => {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          const actualCashStr = document.getElementById('z-actual-cash').value.trim();
          const actualCash = actualCashStr ? parseFloat(actualCashStr) : null;
          const note = document.getElementById('z-note').value.trim() || null;
          await GC.Store.closeDay(today, actualCash, note);
          close();
          render();
          GC.toast('✅ 已结账 / Day closed', 'success');
        } catch (err) {
          btn.disabled = false;
          GC.toast('结账失败 / Failed: ' + err.message, 'error');
        }
      };
    }
  }

  return { render, destroy };
})();
