/**
 * Store — Supabase backend + in-memory cache
 *
 * Data model:
 * - settings: pricing config, promo flag, bonuses
 * - stations: 6 stations (id, name, type, status)
 * - members: with balance, telegram_id, bind_code
 * - sessions: per-player records (active or completed)
 * - top_ups: balance recharge history
 *
 * Billing rules:
 * - Walk-in: hourly blocks, pre-paid (no proration, no refund)
 * - Member (silver/platinum): prorated, deducted from balance
 * - Promo active: everyone pays promo rate (walk-in still hourly blocks)
 */
window.GC = window.GC || {};

GC.Store = (function () {
  let sb = null;
  const _cache = {
    settings: null,
    stations: [],
    members: [],
    sessions: [],
    topUps: [],
    menuCategories: [],
    menuItems: [],
    orders: [],
    orderItems: [],
  };

  /* ========== Mappers ========== */

  function settingsToApp(row) {
    return {
      rates: {
        regular:  { 'Switch 2': Number(row.rate_regular_switch2),  'PS5': Number(row.rate_regular_ps5) },
        silver:   { 'Switch 2': Number(row.rate_silver_switch2),   'PS5': Number(row.rate_silver_ps5) },
        platinum: { 'Switch 2': Number(row.rate_platinum_switch2), 'PS5': Number(row.rate_platinum_ps5) },
        promo:    { 'Switch 2': Number(row.rate_promo_switch2),    'PS5': Number(row.rate_promo_ps5) },
      },
      promoActive: !!row.promo_active,
      memberFees: {
        silver: Number(row.member_fee_silver),
        platinum: Number(row.member_fee_platinum),
      },
      platinumTopupBonus: Number(row.platinum_topup_bonus || 20),
      warnMinutes: Number(row.warn_minutes || 10),
      maxPlayersPerStation: Number(row.max_players_per_station || 4),
      currency: row.currency,
      currencySymbol: row.currency_symbol,
      minBillingMinutes: Number(row.min_billing_minutes),
    };
  }

  function stationToApp(row) {
    return { id: row.id, name: row.name, type: row.type, status: row.status };
  }

  function memberToApp(row) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      totalSpent: Number(row.total_spent),
      totalMinutes: Number(row.total_minutes),
      tier: row.tier || 'regular',
      balance: Number(row.balance || 0),
      telegramId: row.telegram_id || null,
      bindCode: row.bind_code || null,
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
      guestName: row.guest_name || null,
      startTime: Number(row.start_time),
      endTime: row.end_time ? Number(row.end_time) : null,
      durationMinutes: Number(row.duration_minutes || 0),
      paidMinutes: row.paid_minutes != null ? Number(row.paid_minutes) : null,
      expectedEndTime: row.expected_end_time ? Number(row.expected_end_time) : null,
      rate: Number(row.rate || 0),
      subtotal: Number(row.subtotal || 0),
      discountPercent: Number(row.discount_percent || 0),
      discount: Number(row.discount || 0),
      total: Number(row.total || 0),
      status: row.status || 'completed',
    };
  }

  function topUpToApp(row) {
    return {
      id: row.id,
      memberId: row.member_id,
      amount: Number(row.amount),
      bonus: Number(row.bonus || 0),
      resultingBalance: Number(row.resulting_balance),
      reason: row.reason || null,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function menuCategoryToApp(row) {
    return {
      id: row.id,
      nameZh: row.name_zh,
      nameEn: row.name_en,
      emoji: row.emoji,
      displayOrder: Number(row.display_order),
      active: !!row.active,
    };
  }

  function menuItemToApp(row) {
    return {
      id: row.id,
      menuNo: Number(row.menu_no),
      categoryId: row.category_id,
      nameZh: row.name_zh,
      nameEn: row.name_en || '',
      description: row.description || '',
      price: Number(row.price),
      emoji: row.emoji || '🍴',
      photoUrl: row.photo_url || null,
      isFeatured: !!row.is_featured,
      active: !!row.active,
      displayOrder: Number(row.display_order),
    };
  }

  function orderToApp(row) {
    return {
      id: row.id,
      orderNo: row.order_no,
      memberId: row.member_id,
      guestName: row.guest_name,
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      total: Number(row.total),
      paymentMethod: row.payment_method,
      status: row.status,
      note: row.note,
      cashier: row.cashier,
      createdAt: new Date(row.created_at).getTime(),
      completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    };
  }

  function orderItemToApp(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      menuItemId: row.menu_item_id,
      menuNo: row.menu_no ? Number(row.menu_no) : null,
      nameZh: row.name_zh,
      nameEn: row.name_en || '',
      emoji: row.emoji || '🍴',
      unitPrice: Number(row.unit_price),
      quantity: Number(row.quantity),
      subtotal: Number(row.subtotal),
      note: row.note,
    };
  }

  /* ========== Bind code helpers ========== */

  function generateBindCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /* ========== Init ========== */

  async function init() {
    sb = GC.supabase;
    const [
      settingsRes, stationsRes, membersRes, sessionsRes, topUpsRes,
      categoriesRes, menuItemsRes, ordersRes, orderItemsRes,
    ] = await Promise.all([
      sb.from('settings').select('*').single(),
      sb.from('stations').select('*').order('id'),
      sb.from('members').select('*').order('created_at'),
      sb.from('sessions').select('*').order('created_at', { ascending: false }),
      sb.from('top_ups').select('*').order('created_at', { ascending: false }),
      sb.from('menu_categories').select('*').order('display_order'),
      sb.from('menu_items').select('*').order('display_order'),
      sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('order_items').select('*').limit(2000),
    ]);

    _cache.settings = settingsToApp(settingsRes.data);
    _cache.stations = (stationsRes.data || []).map(stationToApp);
    _cache.members = (membersRes.data || []).map(memberToApp);
    _cache.sessions = (sessionsRes.data || []).map(sessionToApp);
    _cache.topUps = (topUpsRes.data || []).map(topUpToApp);
    _cache.menuCategories = (categoriesRes.data || []).map(menuCategoryToApp);
    _cache.menuItems = (menuItemsRes.data || []).map(menuItemToApp);
    _cache.orders = (ordersRes.data || []).map(orderToApp);
    _cache.orderItems = (orderItemsRes.data || []).map(orderItemToApp);

    subscribeRealtime();
  }

  /* ========== Realtime ========== */

  function subscribeRealtime() {
    sb.channel('gc-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const s = sessionToApp(payload.new);
          if (!_cache.sessions.find(x => x.id === s.id)) _cache.sessions.unshift(s);
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const s = sessionToApp(payload.new);
          const i = _cache.sessions.findIndex(x => x.id === s.id);
          if (i >= 0) _cache.sessions[i] = s; else _cache.sessions.unshift(s);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          _cache.sessions = _cache.sessions.filter(x => x.id !== payload.old.id);
        }
        if (GC._currentView === 'dashboard' && GC.Dashboard) GC.Dashboard.render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, (payload) => {
        if (payload.new) {
          const s = stationToApp(payload.new);
          const i = _cache.stations.findIndex(x => x.id === s.id);
          if (i >= 0) _cache.stations[i] = s;
          if (GC._currentView === 'dashboard' && GC.Dashboard) GC.Dashboard.render();
        }
      })
      .subscribe();
  }

  /* ========== Sync Reads ========== */

  function getSettings() { return _cache.settings; }
  function getStations() { return _cache.stations; }
  function getStation(id) { return _cache.stations.find(s => s.id === id); }
  function getMembers() { return _cache.members; }
  function getMember(id) { return _cache.members.find(m => m.id === id); }
  function getMemberByBindCode(code) { return _cache.members.find(m => m.bindCode === code); }
  function getSessions() { return _cache.sessions; }
  function getActiveSessions() { return _cache.sessions.filter(s => s.status === 'active'); }
  function getActiveSessionsForStation(stationId) {
    return _cache.sessions.filter(s => s.status === 'active' && s.stationId === stationId);
  }
  function getTopUps() { return _cache.topUps; }
  function getTopUpsForMember(memberId) { return _cache.topUps.filter(t => t.memberId === memberId); }

  /**
   * Determine rate tier (used for pricing lookup).
   * Promo overrides everything when active.
   */
  function resolveRateTier(memberId) {
    const s = _cache.settings;
    if (s.promoActive) return 'promo';
    if (memberId) {
      const m = getMember(memberId);
      if (m && m.tier !== 'regular' && s.rates[m.tier]) return m.tier;
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

  /**
   * Walk-in pre-paid billing: hourly blocks only.
   * @returns { rate, paidMinutes, total, expectedEndTime, durationMinutes }
   */
  function computeWalkInBill(stationType, hours, startTime, memberId) {
    const { rate, rateTier, regularRate } = getRateFor(stationType, memberId);
    const paidMinutes = hours * 60;
    const total = hours * rate;
    const subtotal = hours * regularRate;
    const discount = subtotal - total;
    const discountPercent = regularRate > 0 ? Math.round((1 - rate / regularRate) * 100) : 0;
    return {
      rate, rateTier, regularRate,
      paidMinutes,
      durationMinutes: paidMinutes,
      expectedEndTime: startTime + paidMinutes * 60000,
      subtotal: round2(subtotal),
      discount: round2(discount),
      discountPercent,
      total: round2(total),
    };
  }

  /**
   * Member prorated billing: minute-based.
   * Used at close time for members.
   */
  function computeMemberBill(stationType, durationMinutes, memberId) {
    const { rate, rateTier, regularRate } = getRateFor(stationType, memberId);
    const minutes = Math.max(durationMinutes, 0);
    const total = round2((minutes / 60) * rate);
    const subtotal = round2((minutes / 60) * regularRate);
    const discount = round2(subtotal - total);
    const discountPercent = regularRate > 0 ? Math.round((1 - rate / regularRate) * 100) : 0;
    return {
      rate, rateTier, regularRate,
      durationMinutes: minutes,
      subtotal, discount, discountPercent, total,
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* ========== Sessions ========== */

  /**
   * Open a session (walk-in pre-paid or member open-ended).
   * For walk-in: hours required, paid upfront. For member: balance-based.
   */
  async function openSession({ stationId, stationName, stationType, memberId, guestName, hours }) {
    const start = Date.now();
    const isWalkIn = !memberId;

    let row;
    if (isWalkIn) {
      const bill = computeWalkInBill(stationType, hours, start, null);
      row = {
        station_id: stationId, station_name: stationName, station_type: stationType,
        member_id: null, guest_name: guestName || null,
        start_time: start, end_time: null,
        paid_minutes: bill.paidMinutes,
        expected_end_time: bill.expectedEndTime,
        duration_minutes: bill.durationMinutes,
        rate: bill.rate, subtotal: bill.subtotal,
        discount_percent: bill.discountPercent, discount: bill.discount, total: bill.total,
        status: 'active',
      };
    } else {
      // Member: no pre-paid, will be billed on close from balance
      const { rate, regularRate } = getRateFor(stationType, memberId);
      row = {
        station_id: stationId, station_name: stationName, station_type: stationType,
        member_id: memberId, guest_name: null,
        start_time: start, end_time: null,
        paid_minutes: null, expected_end_time: null,
        duration_minutes: 0,
        rate, subtotal: 0, discount_percent: 0, discount: 0, total: 0,
        status: 'active',
      };
    }

    const { data, error } = await sb.from('sessions').insert(row).select().single();
    if (error) throw error;
    const session = sessionToApp(data);
    _cache.sessions.unshift(session);

    // Mark station active
    await sb.from('stations').update({ status: 'active' }).eq('id', stationId);
    const idx = _cache.stations.findIndex(s => s.id === stationId);
    if (idx >= 0) _cache.stations[idx].status = 'active';

    return session;
  }

  /**
   * Extend a walk-in player by N hours. Charges another paid block.
   */
  async function extendWalkIn(sessionId, extraHours) {
    const session = _cache.sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'active' || session.memberId) return null;
    const settings = _cache.settings;
    const { rate, regularRate } = getRateFor(session.stationType, null);
    const newPaidMinutes = (session.paidMinutes || 0) + extraHours * 60;
    const newExpectedEnd = session.startTime + newPaidMinutes * 60000;
    const newSubtotal = (newPaidMinutes / 60) * regularRate;
    const newTotal = (newPaidMinutes / 60) * rate;
    const newDiscount = newSubtotal - newTotal;

    const patch = {
      paid_minutes: newPaidMinutes,
      expected_end_time: newExpectedEnd,
      duration_minutes: newPaidMinutes,
      rate,
      subtotal: round2(newSubtotal),
      discount: round2(newDiscount),
      total: round2(newTotal),
    };
    const { data } = await sb.from('sessions').update(patch).eq('id', sessionId).select().single();
    const updated = sessionToApp(data);
    const i = _cache.sessions.findIndex(s => s.id === sessionId);
    if (i >= 0) _cache.sessions[i] = updated;
    return updated;
  }

  /**
   * Close a session.
   * - Walk-in: total stays at pre-paid amount (no refund, no overtime)
   * - Member: compute prorated cost, deduct from balance
   */
  async function closeSession(sessionId) {
    const session = _cache.sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'active') return null;

    const endTime = Date.now();
    const durationMinutes = (endTime - session.startTime) / 60000;

    let final;
    if (session.memberId) {
      // Member: prorated, deduct from balance
      const bill = computeMemberBill(session.stationType, durationMinutes, session.memberId);
      final = {
        end_time: endTime,
        duration_minutes: bill.durationMinutes,
        rate: bill.rate,
        subtotal: bill.subtotal,
        discount: bill.discount,
        discount_percent: bill.discountPercent,
        total: bill.total,
        status: 'completed',
      };
    } else {
      // Walk-in: total stays at pre-paid amount
      final = {
        end_time: endTime,
        duration_minutes: durationMinutes,
        status: 'completed',
        // rate/subtotal/discount/total unchanged
      };
    }

    const { data } = await sb.from('sessions').update(final).eq('id', sessionId).select().single();
    const updated = sessionToApp(data);
    const i = _cache.sessions.findIndex(s => s.id === sessionId);
    if (i >= 0) _cache.sessions[i] = updated;

    // Deduct member balance + update stats
    if (session.memberId) {
      const m = getMember(session.memberId);
      if (m) {
        const newBalance = Math.max(0, m.balance - updated.total);
        await updateMember(session.memberId, {
          balance: newBalance,
          totalSpent: m.totalSpent + updated.total,
          totalMinutes: m.totalMinutes + updated.durationMinutes,
        });
      }
    }

    // If no more active sessions for this station, mark idle
    const stillActive = getActiveSessionsForStation(session.stationId).length;
    if (stillActive === 0) {
      await sb.from('stations').update({ status: 'idle' }).eq('id', session.stationId);
      const sidx = _cache.stations.findIndex(s => s.id === session.stationId);
      if (sidx >= 0) _cache.stations[sidx].status = 'idle';
    }

    return updated;
  }

  /* ========== Members ========== */

  async function addMember({ name, phone, tier, initialBalance }) {
    const bindCode = generateBindCode();
    const row = {
      name, phone: phone || '',
      tier: tier || 'regular',
      balance: initialBalance || 0,
      bind_code: bindCode,
    };
    const { data, error } = await sb.from('members').insert(row).select().single();
    if (error) throw error;
    const m = memberToApp(data);
    _cache.members.push(m);
    return m;
  }

  async function updateMember(id, patch) {
    const idx = _cache.members.findIndex(m => m.id === id);
    if (idx < 0) return null;
    const updated = { ..._cache.members[idx], ...patch };
    const dbPatch = {};
    if ('name' in patch) dbPatch.name = patch.name;
    if ('phone' in patch) dbPatch.phone = patch.phone;
    if ('tier' in patch) dbPatch.tier = patch.tier;
    if ('balance' in patch) dbPatch.balance = patch.balance;
    if ('totalSpent' in patch) dbPatch.total_spent = updated.totalSpent;
    if ('totalMinutes' in patch) dbPatch.total_minutes = updated.totalMinutes;
    if ('telegramId' in patch) dbPatch.telegram_id = patch.telegramId;
    if ('bindCode' in patch) dbPatch.bind_code = patch.bindCode;
    if (Object.keys(dbPatch).length === 0) {
      _cache.members[idx] = updated;
      return updated;
    }
    await sb.from('members').update(dbPatch).eq('id', id);
    _cache.members[idx] = updated;
    return updated;
  }

  async function deleteMember(id) {
    await sb.from('members').delete().eq('id', id);
    _cache.members = _cache.members.filter(m => m.id !== id);
  }

  /**
   * Apply a top-up: figure out tier change and bonus, then update member + log.
   * Returns { member, topUp, oldTier, newTier, bonus, reason }
   */
  async function applyTopUp(memberId, amount) {
    const m = getMember(memberId);
    if (!m) throw new Error('Member not found');
    const s = _cache.settings;
    const oldTier = m.tier;
    let newTier = oldTier;
    let bonus = 0;
    let reason = 'recharge';

    if (amount >= s.memberFees.platinum) {
      // Becomes Platinum (or stays Platinum). $20 bonus.
      newTier = 'platinum';
      bonus = s.platinumTopupBonus;
      reason = oldTier === 'platinum' ? 'platinum_recharge'
             : oldTier === 'silver' ? 'silver_to_platinum'
             : 'new_platinum';
    } else if (amount >= s.memberFees.silver && oldTier === 'regular') {
      // New Silver
      newTier = 'silver';
      reason = 'new_silver';
    } else {
      // Stays current tier
      reason = oldTier === 'regular' ? 'partial' : 'recharge';
    }

    const newBalance = m.balance + amount + bonus;
    const updated = await updateMember(memberId, { balance: newBalance, tier: newTier });

    // Log top-up
    const topUpRow = {
      member_id: memberId,
      amount, bonus,
      resulting_balance: newBalance,
      reason,
    };
    const { data } = await sb.from('top_ups').insert(topUpRow).select().single();
    const topUp = topUpToApp(data);
    _cache.topUps.unshift(topUp);

    return { member: updated, topUp, oldTier, newTier, bonus, reason };
  }

  async function regenerateBindCode(memberId) {
    const code = generateBindCode();
    return updateMember(memberId, { bindCode: code });
  }

  /* ========== Settings ========== */

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
      platinum_topup_bonus: appSettings.platinumTopupBonus,
      warn_minutes: appSettings.warnMinutes,
      max_players_per_station: appSettings.maxPlayersPerStation,
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
      sb.from('top_ups').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      sb.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      sb.from('stations').update({ status: 'idle' }).neq('id', 0),
    ]);
    await init();
  }

  /* ========== Menu ========== */

  function getMenuCategories() {
    return _cache.menuCategories.filter(c => c.active);
  }
  function getMenuCategory(id) { return _cache.menuCategories.find(c => c.id === id); }
  function getMenuItems(opts = {}) {
    let items = _cache.menuItems.filter(i => opts.includeInactive ? true : i.active);
    if (opts.categoryId != null) items = items.filter(i => i.categoryId === opts.categoryId);
    if (opts.featured) items = items.filter(i => i.isFeatured);
    return items;
  }
  function getMenuItem(id) { return _cache.menuItems.find(i => i.id === id); }
  function getMenuItemByNo(no) { return _cache.menuItems.find(i => i.menuNo === Number(no)); }

  async function addMenuItem(data) {
    const row = {
      menu_no: data.menuNo,
      category_id: data.categoryId,
      name_zh: data.nameZh,
      name_en: data.nameEn || null,
      description: data.description || null,
      price: data.price,
      emoji: data.emoji || '🍴',
      photo_url: data.photoUrl || null,
      is_featured: !!data.isFeatured,
      active: data.active !== false,
      display_order: data.displayOrder || 0,
    };
    const { data: inserted, error } = await sb.from('menu_items').insert(row).select().single();
    if (error) throw error;
    const item = menuItemToApp(inserted);
    _cache.menuItems.push(item);
    return item;
  }

  async function updateMenuItem(id, patch) {
    const dbPatch = {};
    if ('menuNo' in patch) dbPatch.menu_no = patch.menuNo;
    if ('categoryId' in patch) dbPatch.category_id = patch.categoryId;
    if ('nameZh' in patch) dbPatch.name_zh = patch.nameZh;
    if ('nameEn' in patch) dbPatch.name_en = patch.nameEn;
    if ('description' in patch) dbPatch.description = patch.description;
    if ('price' in patch) dbPatch.price = patch.price;
    if ('emoji' in patch) dbPatch.emoji = patch.emoji;
    if ('photoUrl' in patch) dbPatch.photo_url = patch.photoUrl;
    if ('isFeatured' in patch) dbPatch.is_featured = patch.isFeatured;
    if ('active' in patch) dbPatch.active = patch.active;
    if ('displayOrder' in patch) dbPatch.display_order = patch.displayOrder;
    dbPatch.updated_at = new Date().toISOString();

    const { data, error } = await sb.from('menu_items').update(dbPatch).eq('id', id).select().single();
    if (error) throw error;
    const updated = menuItemToApp(data);
    const idx = _cache.menuItems.findIndex(i => i.id === id);
    if (idx >= 0) _cache.menuItems[idx] = updated;
    return updated;
  }

  async function deleteMenuItem(id) {
    await sb.from('menu_items').delete().eq('id', id);
    _cache.menuItems = _cache.menuItems.filter(i => i.id !== id);
  }

  /* ========== Orders ========== */

  function getOrders() { return _cache.orders; }
  function getOrder(id) { return _cache.orders.find(o => o.id === id); }
  function getOrderItemsForOrder(orderId) {
    return _cache.orderItems.filter(oi => oi.orderId === orderId);
  }

  /**
   * Create a new order with items, optionally pay immediately.
   * cart: [{ menuItemId, quantity, note }]
   * payment: { method: 'cash'|'paynow'|'member_balance'|'card', memberId? }
   * Returns the completed order.
   */
  async function createOrder({ memberId, guestName, cart, payment, note, cashier }) {
    if (!cart || cart.length === 0) throw new Error('购物车为空 Cart is empty');

    // Snapshot items
    const items = cart.map(c => {
      const item = getMenuItem(c.menuItemId);
      if (!item) throw new Error(`商品不存在 Item not found: ${c.menuItemId}`);
      const qty = c.quantity || 1;
      return {
        menu_item_id: item.id,
        menu_no: item.menuNo,
        name_zh: item.nameZh,
        name_en: item.nameEn,
        emoji: item.emoji,
        unit_price: item.price,
        quantity: qty,
        subtotal: round2(item.price * qty),
        note: c.note || null,
      };
    });

    const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
    const discount = 0; // no member discount on food in Phase 1
    const total = round2(subtotal - discount);

    // If member balance payment, check sufficient balance
    if (payment.method === 'member_balance') {
      if (!memberId) throw new Error('需要选择会员 Member required');
      const m = getMember(memberId);
      if (!m) throw new Error('会员不存在 Member not found');
      if (m.balance < total) {
        throw new Error(`余额不足: 需要 ${total}, 余额 ${m.balance.toFixed(2)}`);
      }
    }

    // Insert order
    const orderRow = {
      member_id: memberId || null,
      guest_name: guestName || null,
      subtotal, discount, total,
      payment_method: payment.method,
      status: 'completed',
      note: note || null,
      cashier: cashier || null,
      completed_at: new Date().toISOString(),
    };
    const { data: orderData, error: orderErr } = await sb.from('orders').insert(orderRow).select().single();
    if (orderErr) throw orderErr;

    // Insert items
    const itemRows = items.map(i => ({ ...i, order_id: orderData.id }));
    const { data: itemsData, error: itemsErr } = await sb.from('order_items').insert(itemRows).select();
    if (itemsErr) throw itemsErr;

    // Cache
    const order = orderToApp(orderData);
    _cache.orders.unshift(order);
    const orderItems = (itemsData || []).map(orderItemToApp);
    _cache.orderItems.push(...orderItems);

    // Deduct from member balance if applicable
    if (payment.method === 'member_balance' && memberId) {
      const m = getMember(memberId);
      await updateMember(memberId, {
        balance: Math.max(0, m.balance - total),
        totalSpent: m.totalSpent + total,
      });
    }

    return { order, items: orderItems };
  }

  async function voidOrder(orderId) {
    const order = getOrder(orderId);
    if (!order) throw new Error('Order not found');

    // Refund to member balance if it was deducted
    if (order.paymentMethod === 'member_balance' && order.memberId) {
      const m = getMember(order.memberId);
      if (m) {
        await updateMember(order.memberId, {
          balance: m.balance + order.total,
          totalSpent: Math.max(0, m.totalSpent - order.total),
        });
      }
    }

    await sb.from('orders').update({ status: 'voided' }).eq('id', orderId);
    const idx = _cache.orders.findIndex(o => o.id === orderId);
    if (idx >= 0) _cache.orders[idx].status = 'voided';
  }

  /* ========== Export / Import ========== */

  function exportData() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      settings: _cache.settings,
      members: _cache.members,
      sessions: _cache.sessions,
      topUps: _cache.topUps,
    }, null, 2);
  }

  async function importData(json) {
    const data = JSON.parse(json);
    if (data.members?.length) {
      await sb.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const rows = data.members.map(m => ({
        id: m.id, name: m.name, phone: m.phone || '',
        total_spent: m.totalSpent, total_minutes: m.totalMinutes,
        tier: ['regular','silver','platinum'].includes(m.tier) ? m.tier : 'regular',
        balance: m.balance || 0,
        telegram_id: m.telegramId || null,
        bind_code: m.bindCode || generateBindCode(),
        created_at: new Date(m.createdAt).toISOString(),
      }));
      await sb.from('members').insert(rows);
    }
    if (data.sessions?.length) {
      await sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const rows = data.sessions.map(s => ({
        station_id: s.stationId, station_name: s.stationName, station_type: s.stationType,
        member_id: s.memberId || null, guest_name: s.guestName || null,
        start_time: s.startTime, end_time: s.endTime,
        duration_minutes: s.durationMinutes,
        paid_minutes: s.paidMinutes, expected_end_time: s.expectedEndTime,
        rate: s.rate, subtotal: s.subtotal,
        discount_percent: s.discountPercent, discount: s.discount, total: s.total,
        status: s.status || 'completed',
      }));
      await sb.from('sessions').insert(rows);
    }
    if (data.settings) await saveSettings(data.settings);
    await init();
  }

  return {
    init,
    // Reads
    getSettings, getStations, getStation,
    getMembers, getMember, getMemberByBindCode,
    getSessions, getActiveSessions, getActiveSessionsForStation,
    getTopUps, getTopUpsForMember,
    // Menu
    getMenuCategories, getMenuCategory,
    getMenuItems, getMenuItem, getMenuItemByNo,
    addMenuItem, updateMenuItem, deleteMenuItem,
    // Orders
    getOrders, getOrder, getOrderItemsForOrder,
    createOrder, voidOrder,
    // Billing
    getRateFor, resolveRateTier,
    computeWalkInBill, computeMemberBill,
    // Sessions
    openSession, extendWalkIn, closeSession,
    // Members
    addMember, updateMember, deleteMember,
    applyTopUp, regenerateBindCode,
    // Settings
    saveSettings, togglePromo, clearSessions, resetAll,
    // Export
    exportData, importData,
  };
})();
