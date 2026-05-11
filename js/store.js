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
      rates: {
        regular: { 'Switch 2': Number(row.rate_regular_switch2), 'PS5': Number(row.rate_regular_ps5) },
        silver:  { 'Switch 2': Number(row.rate_silver_switch2),  'PS5': Number(row.rate_silver_ps5) },
        platinum:{ 'Switch 2': Number(row.rate_platinum_switch2),'PS5': Number(row.rate_platinum_ps5) },
        promo:   { 'Switch 2': Number(row.rate_promo_switch2),   'PS5': Number(row.rate_promo_ps5) },
      },
      promoActive: !!row.promo_active,
      memberFees: {
        silver: Number(row.member_fee_silver),
        platinum: Number(row.member_fee_platinum),
      },
      currency: row.currency,
      currencySymbol: row.currency_symbol,
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
      tier: row.tier || 'regular',
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

  /**
   * Pick the rate tier for a billing context:
   * - Promo active → everyone gets promo rate
   * - Member (silver/platinum) → tier rate
   * - Otherwise → regular walk-in rate
   */
  function resolveRateTier(memberId) {
    const s = _cache.settings;
    if (s.promoActive) return 'promo';
    if (memberId) {
      const m = getMember(memberId);
      if (m && m.tier && m.tier !== 'regular' && s.rates[m.tier]) return m.tier;
    }
    return 'regular';
  }

  function getRateFor(stationType, memberId) {
    const s = _cache.settings;
    const tier = resolveRateTier(memberId);
    return {
      rate: s.rates[tier][stationType] || 0,
      rateTier: tier,
      regularRate: s.rates.regular[stationType] || 0,
    };
  }

  function calculateBill(stationType, durationMinutes, memberId) {
    const s = _cache.settings;
    const billableMinutes = Math.max(durationMinutes, s.minBillingMinutes || 0);
    const { rate, rateTier, regularRate } = getRateFor(stationType, memberId);

    // Subtotal at regular rate, then show discount if actual rate is lower
    const subtotal = Math.round((billableMinutes / 60) * regularRate * 100) / 100;
    const total = Math.round((billableMinutes / 60) * rate * 100) / 100;
    const discount = Math.round((subtotal - total) * 100) / 100;
    const discountPercent = regularRate > 0
      ? Math.round((1 - rate / regularRate) * 100)
      : 0;

    return {
      rate,
      rateTier,
      regularRate,
      durationMinutes: billableMinutes,
      subtotal,
      discount,
      discountPercent,
      total,
    };
  }

  /* ========== Async Writes ========== */

  async function updateStation(id, patch) {
    const dbPatch = {};
    if ('status' in patch) dbPatch.status = patch.status;
    if ('startTime' in patch) dbPatch.start_time = patch.startTime;
    if ('memberId' in patch) dbPatch.member_id = patch.memberId;

    await sb.from('stations').update(dbPatch).eq('id', id);

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
    const row = {
      name: memberData.name,
      phone: memberData.phone || '',
      tier: memberData.tier || 'regular',
    };
    const { data } = await sb.from('members').insert(row).select().single();
    const appMember = memberToApp(data);
    _cache.members.push(appMember);
    return appMember;
  }

  async function updateMember(id, patch) {
    const idx = _cache.members.findIndex(m => m.id === id);
    if (idx < 0) return null;

    const updated = { ..._cache.members[idx], ...patch };

    const dbPatch = {};
    if ('name' in patch) dbPatch.name = patch.name;
    if ('phone' in patch) dbPatch.phone = patch.phone;
    if ('totalSpent' in patch) dbPatch.total_spent = updated.totalSpent;
    if ('totalMinutes' in patch) dbPatch.total_minutes = updated.totalMinutes;
    if ('tier' in patch) dbPatch.tier = updated.tier;

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
      rate_regular_switch2: appSettings.rates.regular['Switch 2'],
      rate_regular_ps5: appSettings.rates.regular['PS5'],
      rate_silver_switch2: appSettings.rates.silver['Switch 2'],
      rate_silver_ps5: appSettings.rates.silver['PS5'],
      rate_platinum_switch2: appSettings.rates.platinum['Switch 2'],
      rate_platinum_ps5: appSettings.rates.platinum['PS5'],
      rate_promo_switch2: appSettings.rates.promo['Switch 2'],
      rate_promo_ps5: appSettings.rates.promo['PS5'],
      promo_active: appSettings.promoActive,
      member_fee_silver: appSettings.memberFees.silver,
      member_fee_platinum: appSettings.memberFees.platinum,
      currency: appSettings.currency,
      currency_symbol: appSettings.currencySymbol,
      min_billing_minutes: appSettings.minBillingMinutes,
      updated_at: new Date().toISOString(),
    };
    await sb.from('settings').update(row).eq('id', 1);
    _cache.settings = appSettings;
  }

  async function togglePromo(active) {
    const s = { ..._cache.settings, promoActive: !!active };
    await saveSettings(s);
    return s;
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
        rate_regular_switch2: 15, rate_regular_ps5: 16,
        rate_silver_switch2: 12, rate_silver_ps5: 13,
        rate_platinum_switch2: 7, rate_platinum_ps5: 8,
        rate_promo_switch2: 5, rate_promo_ps5: 6,
        promo_active: true,
        member_fee_silver: 100, member_fee_platinum: 300,
        currency: 'SGD', currency_symbol: '$',
        min_billing_minutes: 0,
      }).eq('id', 1),
    ]);
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

    if (data.members && data.members.length > 0) {
      await sb.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const memberRows = data.members.map(m => ({
        id: m.id, name: m.name, phone: m.phone || '',
        total_spent: m.totalSpent, total_minutes: m.totalMinutes,
        tier: m.tier === 'bronze' ? 'regular' : (m.tier === 'gold' ? 'platinum' : (m.tier || 'regular')),
        created_at: new Date(m.createdAt).toISOString(),
      }));
      await sb.from('members').insert(memberRows);
    }

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
    calculateBill, getRateFor, resolveRateTier,
    // Async writes
    updateStation, addSession,
    addMember, updateMember, deleteMember,
    saveSettings, togglePromo, clearSessions, resetAll,
    // Export / Import
    exportData, importData,
  };
})();
