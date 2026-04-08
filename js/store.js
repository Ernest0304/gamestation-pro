/**
 * Store — Supabase backend + in-memory cache
 * Sync reads (from cache), async writes (to Supabase)
 */
window.GC = window.GC || {};

GC.Store = (function () {
  let sb = null; // supabase client
  const _cache = {
    settings: null,
    stations: [],
    members: [],
    sessions: [],
  };

  /* ========== Helpers ========== */

  function settingsToApp(row) {
    return {
      rates: { PS5: Number(row.rate_ps5), 'Switch 2': Number(row.rate_switch2) },
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      memberDiscounts: {
        bronze: Number(row.discount_bronze),
        silver: Number(row.discount_silver),
        gold: Number(row.discount_gold),
      },
      tierThresholds: {
        silver: Number(row.threshold_silver),
        gold: Number(row.threshold_gold),
      },
      minBillingMinutes: Number(row.min_billing_minutes),
    };
  }

  function stationToApp(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status,
      startTime: row.start_time ? Number(row.start_time) : null,
      memberId: row.member_id,
    };
  }

  function memberToApp(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      totalSpent: Number(row.total_spent),
      totalMinutes: Number(row.total_minutes),
      tier: row.tier,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function sessionToApp(row) {
    return {
      id: row.id,
      stationId: row.station_id,
      stationName: row.station_name,
      stationType: row.station_type,
      memberId: row.member_id,
      startTime: Number(row.start_time),
      endTime: Number(row.end_time),
      durationMinutes: Number(row.duration_minutes),
      rate: Number(row.rate),
      subtotal: Number(row.subtotal),
      discountPercent: Number(row.discount_percent),
      discount: Number(row.discount),
      total: Number(row.total),
    };
  }

  function computeTier(totalSpent) {
    const s = _cache.settings;
    if (totalSpent >= s.tierThresholds.gold) return 'gold';
    if (totalSpent >= s.tierThresholds.silver) return 'silver';
    return 'bronze';
  }

  /* ========== Init ========== */

  async function init() {
    sb = GC.supabase;

    const [settingsRes, stationsRes, membersRes, sessionsRes] = await Promise.all([
      sb.from('settings').select('*').single(),
      sb.from('stations').select('*').order('id'),
      sb.from('members').select('*').order('created_at'),
      sb.from('sessions').select('*').order('created_at', { ascending: false }),
    ]);

    _cache.settings = settingsToApp(settingsRes.data);
    _cache.stations = (stationsRes.data || []).map(stationToApp);
    _cache.members = (membersRes.data || []).map(memberToApp);
    _cache.sessions = (sessionsRes.data || []).map(sessionToApp);

    subscribeRealtime();
  }

  /* ========== Realtime ========== */

  function subscribeRealtime() {
    sb.channel('stations-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updated = stationToApp(payload.new);
          const idx = _cache.stations.findIndex(s => s.id === updated.id);
          if (idx >= 0) _cache.stations[idx] = updated;
          // Re-render dashboard if it's the active view
          if (GC._currentView === 'dashboard' && GC.Dashboard) {
            GC.Dashboard.render();
          }
        }
      })
      .subscribe();
  }

  /* ========== Sync Reads (from cache) ========== */

  function getSettings() { return _cache.settings; }
  function getStations() { return _cache.stations; }
  function getStation(id) { return _cache.stations.find(s => s.id === id); }
  function getMembers() { return _cache.members; }
  function getMember(id) { return _cache.members.find(m => m.id === id); }
  function getSessions() { return _cache.sessions; }

  function calculateBill(stationType, durationMinutes, memberId) {
    const s = _cache.settings;
    const billableMinutes = Math.max(durationMinutes, s.minBillingMinutes || 0);
    const rate = s.rates[stationType] || 15;
    const subtotal = (billableMinutes / 60) * rate;
    let discountPercent = 0;
    if (memberId) {
      const m = getMember(memberId);
      if (m) discountPercent = s.memberDiscounts[m.tier] || 0;
    }
    const discount = subtotal * (discountPercent / 100);
    return {
      rate,
      durationMinutes: billableMinutes,
      subtotal: Math.round(subtotal * 100) / 100,
      discountPercent,
      discount: Math.round(discount * 100) / 100,
      total: Math.round((subtotal - discount) * 100) / 100,
    };
  }

  /* ========== Async Writes ========== */

  async function updateStation(id, patch) {
    const dbPatch = {};
    if ('status' in patch) dbPatch.status = patch.status;
    if ('startTime' in patch) dbPatch.start_time = patch.startTime;
    if ('memberId' in patch) dbPatch.member_id = patch.memberId;

    await sb.from('stations').update(dbPatch).eq('id', id);

    // Optimistic cache update (realtime will confirm)
    const idx = _cache.stations.findIndex(s => s.id === id);
    if (idx >= 0) _cache.stations[idx] = { ..._cache.stations[idx], ...patch };
  }

  async function addSession(session) {
    const row = {
      station_id: session.stationId,
      station_name: session.stationName,
      station_type: session.stationType,
      member_id: session.memberId || null,
      start_time: session.startTime,
      end_time: session.endTime,
      duration_minutes: session.durationMinutes,
      rate: session.rate,
      subtotal: session.subtotal,
      discount_percent: session.discountPercent,
      discount: session.discount,
      total: session.total,
    };
    const { data } = await sb.from('sessions').insert(row).select().single();
    const appSession = sessionToApp(data);
    _cache.sessions.unshift(appSession);
    return appSession;
  }

  async function addMember(memberData) {
    const row = { name: memberData.name, phone: memberData.phone || '' };
    const { data } = await sb.from('members').insert(row).select().single();
    const appMember = memberToApp(data);
    _cache.members.push(appMember);
    return appMember;
  }

  async function updateMember(id, patch) {
    const idx = _cache.members.findIndex(m => m.id === id);
    if (idx < 0) return null;

    const updated = { ..._cache.members[idx], ...patch };
    updated.tier = computeTier(updated.totalSpent);

    const dbPatch = {};
    if ('name' in patch) dbPatch.name = patch.name;
    if ('phone' in patch) dbPatch.phone = patch.phone;
    if ('totalSpent' in patch) dbPatch.total_spent = updated.totalSpent;
    if ('totalMinutes' in patch) dbPatch.total_minutes = updated.totalMinutes;
    dbPatch.tier = updated.tier;

    await sb.from('members').update(dbPatch).eq('id', id);
    _cache.members[idx] = updated;
    return updated;
  }

  async function deleteMember(id) {
    await sb.from('members').delete().eq('id', id);
    _cache.members = _cache.members.filter(m => m.id !== id);
  }

  async function saveSettings(appSettings) {
    const row = {
      rate_ps5: appSettings.rates.PS5,
      rate_switch2: appSettings.rates['Switch 2'],
      currency: appSettings.currency,
      currency_symbol: appSettings.currencySymbol,
      min_billing_minutes: appSettings.minBillingMinutes,
      discount_bronze: appSettings.memberDiscounts.bronze,
      discount_silver: appSettings.memberDiscounts.silver,
      discount_gold: appSettings.memberDiscounts.gold,
      threshold_silver: appSettings.tierThresholds.silver,
      threshold_gold: appSettings.tierThresholds.gold,
      updated_at: new Date().toISOString(),
    };
    await sb.from('settings').update(row).eq('id', 1);
    _cache.settings = appSettings;
  }

  async function clearSessions() {
    await sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    _cache.sessions = [];
  }

  async function resetAll() {
    await Promise.all([
      sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      sb.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      sb.from('stations').update({ status: 'idle', start_time: null, member_id: null }).neq('id', 0),
      sb.from('settings').update({
        rate_ps5: 15, rate_switch2: 15, currency: 'SGD', currency_symbol: '$',
        min_billing_minutes: 0, discount_bronze: 0, discount_silver: 5, discount_gold: 10,
        threshold_silver: 200, threshold_gold: 500,
      }).eq('id', 1),
    ]);
    // Reload cache
    await init();
  }

  /* ========== Export / Import ========== */

  function exportData() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      settings: _cache.settings,
      members: _cache.members,
      sessions: _cache.sessions,
    }, null, 2);
  }

  async function importData(json) {
    const data = JSON.parse(json);

    // Restore members
    if (data.members && data.members.length > 0) {
      await sb.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const memberRows = data.members.map(m => ({
        id: m.id, name: m.name, phone: m.phone || '',
        total_spent: m.totalSpent, total_minutes: m.totalMinutes,
        tier: m.tier, created_at: new Date(m.createdAt).toISOString(),
      }));
      await sb.from('members').insert(memberRows);
    }

    // Restore sessions
    if (data.sessions && data.sessions.length > 0) {
      await sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const sessionRows = data.sessions.map(s => ({
        station_id: s.stationId, station_name: s.stationName, station_type: s.stationType,
        member_id: s.memberId || null, start_time: s.startTime, end_time: s.endTime,
        duration_minutes: s.durationMinutes, rate: s.rate, subtotal: s.subtotal,
        discount_percent: s.discountPercent, discount: s.discount, total: s.total,
      }));
      await sb.from('sessions').insert(sessionRows);
    }

    // Restore settings
    if (data.settings) {
      await saveSettings(data.settings);
    }

    await init();
  }

  /* ========== Public API ========== */

  return {
    init,
    // Sync reads
    getSettings, getStations, getStation,
    getMembers, getMember, getSessions,
    calculateBill,
    // Async writes
    updateStation, addSession,
    addMember, updateMember, deleteMember,
    saveSettings, clearSessions, resetAll,
    // Export / Import
    exportData, importData,
  };
})();
