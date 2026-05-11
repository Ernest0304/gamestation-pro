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
    return GC.Store.getSessions().filter(s => s.endTime >= start && s.endTime < end);
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
    doc.text('GameStation Pro', 14, 20);
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

    doc.save(`GameStation-Report-${label.replace(/[~/\s]/g, '_')}.pdf`);
    GC.toast('PDF 报表已下载', 'success');
  }

  function generateExcel(filtered) {
    const sym = GC.Store.getSettings().currencySymbol;
    const { label } = getRange();
    const totalRev = filtered.reduce((s, x) => s + x.total, 0);
    const totalTime = filtered.reduce((s, x) => s + x.durationMinutes, 0);

    // Summary sheet data
    const summaryData = [
      ['GameStation Pro - Revenue Report'],
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
    XLSX.writeFile(wb, `GameStation-Report-${label.replace(/[~/\s]/g, '_')}.xlsx`);
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

    document.getElementById('main-content').innerHTML = `
      <div class="page-header">
        <h2 class="page-title">历史记录 / History</h2>
        <div class="report-buttons">
          <button class="btn btn-secondary btn-sm" id="dl-pdf">📄 PDF 报表</button>
          <button class="btn btn-secondary btn-sm" id="dl-excel">📊 Excel 报表</button>
        </div>
      </div>

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

  return { render, destroy };
})();
