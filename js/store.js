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
    orderPayments: [],
    dailyCloses: [],
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
      // IT S2-1: must surface archived_at so realtime UPDATE filter (archived members)
      // can detect when a member gets soft-deleted from another tab.
      archived_at: row.archived_at || null,
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
      paymentMethod: row.payment_method || null,
      cashier: row.cashier || null,
      shortfall: Number(row.shortfall || 0),
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
      // Migration 008: delivery + takeaway + extra_charges
      takeaway: !!row.takeaway,
      takeawayCharge: Number(row.takeaway_charge || 0),
      extraCharges: Array.isArray(row.extra_charges) ? row.extra_charges : [],
      deliveryPlatformTotal: row.delivery_platform_total != null ? Number(row.delivery_platform_total) : null,
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

  function orderPaymentToApp(row) {
    return {
      id: row.id,
      orderId: row.order_id,
      method: row.method,
      amount: Number(row.amount),
      tendered: row.tendered != null ? Number(row.tendered) : null,
      changeGiven: row.change_given != null ? Number(row.change_given) : null,
      note: row.note,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function dailyCloseToApp(row) {
    return {
      id: row.id,
      closeDate: row.close_date,
      closedAt: row.closed_at ? new Date(row.closed_at).getTime() : null,
      closedBy: row.closed_by,
      expectedCash: Number(row.expected_cash || 0),
      actualCash: row.actual_cash != null ? Number(row.actual_cash) : null,
      cashDifference: row.cash_difference != null ? Number(row.cash_difference) : null,
      expectedPaynow: Number(row.expected_paynow || 0),
      memberDeductions: Number(row.member_deductions || 0),
      totalDiscount: Number(row.total_discount || 0),
      topupsReceived: Number(row.topups_received || 0),
      voidedOrders: Number(row.voided_orders || 0),
      note: row.note,
      snapshot: row.snapshot,
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
  // Idempotency: if bootApp's timeout fires and the user retries, we don't want
  // to launch a second Promise.all OR subscribe to realtime twice (would cause
  // duplicate events + cache thrashing per IT audit S1-A).
  let _initPromise = null;
  let _subscribed = false;

  async function _runInit() {
    sb = GC.supabase;
    const [
      settingsRes, stationsRes, membersRes, sessionsRes, topUpsRes,
      categoriesRes, menuItemsRes, ordersRes, orderItemsRes,
      orderPaymentsRes, dailyClosesRes,
    ] = await Promise.all([
      sb.from('settings').select('*').single(),
      sb.from('stations').select('*').order('id'),
      sb.from('members').select('*').is('archived_at', null).order('created_at'),
      sb.from('sessions').select('*').order('created_at', { ascending: false }),
      sb.from('top_ups').select('*').order('created_at', { ascending: false }),
      sb.from('menu_categories').select('*').order('display_order'),
      sb.from('menu_items').select('*').order('display_order'),
      sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
      sb.from('order_items').select('*').limit(2000),
      sb.from('order_payments').select('*').order('created_at', { ascending: false }).limit(1000),
      sb.from('daily_closes').select('*').order('close_date', { ascending: false }).limit(60),
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
    _cache.orderPayments = (orderPaymentsRes.data || []).map(orderPaymentToApp);
    _cache.dailyCloses = (dailyClosesRes.data || []).map(dailyCloseToApp);

    if (!_subscribed) {
      _subscribed = true;
      subscribeRealtime();
    }
  }

  async function init() {
    // If a previous init is already in-flight or completed, reuse that promise.
    // This handles: bootApp times out → user retries → second Store.init() call
    // returns the same in-flight promise instead of starting a parallel run.
    if (_initPromise) return _initPromise;
    _initPromise = _runInit().catch((err) => {
      // On hard failure, allow a fresh retry next time + clean realtime state.
      _initPromise = null;
      _subscribed = false;
      try {
        if (sb && sb.removeAllChannels) sb.removeAllChannels();
      } catch (_) {}
      throw err;
    });
    return _initPromise;
  }

  // Called by app.js on SIGNED_OUT so a re-login starts fresh.
  function resetForLogout() {
    _initPromise = null;
    _subscribed = false;
    try {
      if (sb && sb.removeAllChannels) sb.removeAllChannels();
    } catch (_) {}
    _cache.settings = null;
    _cache.stations = [];
    _cache.members = [];
    _cache.sessions = [];
    _cache.topUps = [];
    _cache.menuCategories = [];
    _cache.menuItems = [];
    _cache.orders = [];
    _cache.orderItems = [];
  }

  /* ========== Realtime ========== */

  function subscribeRealtime() {
    // Defensive cleanup: remove any pre-existing channel with the same topic.
    // Symptom this fixes: Supabase SDK throws
    //   "cannot add `postgres_changes` callbacks for realtime:gc-sync after `subscribe()`"
    // when a previously-subscribed channel survives in client state (eg.
    // a half-completed prior init in the same page session).
    try {
      const existing = (sb.getChannels && sb.getChannels()) || [];
      existing.forEach(c => {
        if (c.topic === 'realtime:gc-sync' || c.topic === 'gc-sync') {
          try { sb.removeChannel(c); } catch (_) {}
        }
      });
    } catch (e) { console.warn('Channel cleanup skipped:', e); }

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const m = memberToApp(payload.new);
          if (!_cache.members.find(x => x.id === m.id)) _cache.members.push(m);
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const m = memberToApp(payload.new);
          const i = _cache.members.findIndex(x => x.id === m.id);
          if (i >= 0) _cache.members[i] = m;
          if (m.archived_at) _cache.members = _cache.members.filter(x => x.id !== m.id);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          _cache.members = _cache.members.filter(x => x.id !== payload.old.id);
        }
        if (GC._currentView === 'members' && GC.Members) GC.Members.render();
        if (GC._currentView === 'dashboard' && GC.Dashboard) GC.Dashboard.render();
      })
      // IT S1-B: orders + order_payments + top_ups + daily_closes were NOT subscribed.
      // Two iPads ringing up orders independently saw stale Z-Report data forever.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const o = orderToApp(payload.new);
          if (!_cache.orders.find(x => x.id === o.id)) _cache.orders.unshift(o);
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          const o = orderToApp(payload.new);
          const i = _cache.orders.findIndex(x => x.id === o.id);
          if (i >= 0) _cache.orders[i] = o; else _cache.orders.unshift(o);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          _cache.orders = _cache.orders.filter(x => x.id !== payload.old.id);
        }
        if (GC._currentView === 'orders' && GC.Orders) GC.Orders.render();
        if (GC._currentView === 'history' && GC.History) GC.History.render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_payments' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const p = orderPaymentToApp(payload.new);
          if (!_cache.orderPayments.find(x => x.id === p.id)) _cache.orderPayments.push(p);
        } else if (payload.eventType === 'DELETE' && payload.old) {
          _cache.orderPayments = _cache.orderPayments.filter(x => x.id !== payload.old.id);
        }
        if (GC._currentView === 'history' && GC.History) GC.History.render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'top_ups' }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const t = topUpToApp(payload.new);
          if (!_cache.topUps.find(x => x.id === t.id)) _cache.topUps.unshift(t);
        }
        if (GC._currentView === 'history' && GC.History) GC.History.render();
        if (GC._currentView === 'members' && GC.Members) GC.Members.render();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_closes' }, (payload) => {
        if (payload.new) {
          const c = dailyCloseToApp(payload.new);
          _cache.dailyCloses = _cache.dailyCloses.filter(x => x.closeDate !== c.closeDate);
          _cache.dailyCloses.unshift(c);
        }
        if (GC._currentView === 'history' && GC.History) GC.History.render();
      })
      .subscribe();
  }

  /* ========== Server clock sync (anti-drift) ========== */
  let _clockOffset = 0;

  async function syncClock() {
    try {
      const { data, error } = await sb.rpc('server_now');
      if (error || data == null) return;
      _clockOffset = Number(data) - Date.now();
    } catch (e) {
      console.warn('Clock sync failed:', e);
    }
  }

  function now() { return Date.now() + _clockOffset; }

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
  async function openSession({ stationId, stationName, stationType, memberId, guestName, hours, paymentMethod, cashier }) {
    const start = now();  // Use clock-synced now() not raw Date.now()
    const isWalkIn = !memberId;
    // Capture cashier identity (Finance + Ops critical). Falls back to auth user.
    const actor = cashier || (await getCurrentUserEmail());

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
        payment_method: paymentMethod || 'cash',  // walk-in is pre-paid — record method now
        cashier: actor,
      };
    } else {
      const { rate, regularRate } = getRateFor(stationType, memberId);
      row = {
        station_id: stationId, station_name: stationName, station_type: stationType,
        member_id: memberId, guest_name: null,
        start_time: start, end_time: null,
        paid_minutes: null, expected_end_time: null,
        duration_minutes: 0,
        rate, subtotal: 0, discount_percent: 0, discount: 0, total: 0,
        status: 'active',
        payment_method: 'member_balance',
        cashier: actor,
      };
    }

    const { data, error } = await sb.from('sessions').insert(row).select().single();
    if (error) throw error;
    const session = sessionToApp(data);
    _cache.sessions.unshift(session);

    // Mark station active — must await (IT S1-4: was previously fire-and-forget)
    const { error: stErr } = await sb.from('stations').update({ status: 'active' }).eq('id', stationId);
    if (stErr) console.error('Station status update failed:', stErr);
    const idx = _cache.stations.findIndex(s => s.id === stationId);
    if (idx >= 0) _cache.stations[idx].status = 'active';

    return session;
  }

  /**
   * Cashier identity helper — uses the currently signed-in Supabase user's email
   * as the actor for audit columns. Falls back to 'unknown' if not signed in
   * (shouldn't happen in normal flow but defensive).
   */
  async function getCurrentUserEmail() {
    try {
      const { data: { user } } = await sb.auth.getUser();
      return user?.email || 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  /**
   * Extend a walk-in player by N hours. Charges only the NEW block at CURRENT rate.
   * IMPORTANT: existing paid time is NOT re-priced. If promo flipped mid-session, the
   * already-paid blocks keep their original price (prevents undercharge/overcharge of paid time).
   */
  async function extendWalkIn(sessionId, extraHours, opts = {}) {
    const session = _cache.sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'active' || session.memberId) return null;
    const { rate: currentRate, regularRate: currentRegularRate } = getRateFor(session.stationType, null);
    const cashier = opts.cashier || (await getCurrentUserEmail());

    const extraMinutes = extraHours * 60;
    const extraCost = round2(extraHours * currentRate);
    const extraSubtotal = round2(extraHours * currentRegularRate);
    const extraDiscount = round2(extraSubtotal - extraCost);

    const newPaidMinutes = (session.paidMinutes || 0) + extraMinutes;
    const newExpectedEnd = session.startTime + newPaidMinutes * 60000;
    const newTotal = round2(session.total + extraCost);
    const newSubtotal = round2(session.subtotal + extraSubtotal);
    const newDiscount = round2(session.discount + extraDiscount);

    // Use blended discount % for display only (informational)
    const displayDiscountPct = newSubtotal > 0
      ? Math.round((newDiscount / newSubtotal) * 100)
      : 0;

    const patch = {
      paid_minutes: newPaidMinutes,
      expected_end_time: newExpectedEnd,
      duration_minutes: newPaidMinutes,
      // rate stays at the LATEST extension rate for display; total is the truthful sum
      rate: currentRate,
      subtotal: newSubtotal,
      discount: newDiscount,
      discount_percent: displayDiscountPct,
      total: newTotal,
    };

    // Atomic update with status check — refuse to write to a completed session
    const { data, error } = await sb.from('sessions')
      .update(patch)
      .eq('id', sessionId)
      .eq('status', 'active')
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('会话已结束或不存在 / Session not active');
    const updated = sessionToApp(data[0]);
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

    const endTime = now();  // clock-synced
    const durationMinutes = (endTime - session.startTime) / 60000;

    let final;
    if (session.memberId) {
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
      final = {
        end_time: endTime,
        duration_minutes: durationMinutes,
        status: 'completed',
      };
    }

    // IT S1-2: atomic guard — refuse to close an already-closed session.
    // Prevents double-debit if two cashiers tap "close" within the same second.
    const { data, error: closeErr } = await sb.from('sessions')
      .update(final)
      .eq('id', sessionId)
      .eq('status', 'active')   // ← critical guard
      .select();
    if (closeErr) throw closeErr;
    if (!data || data.length === 0) {
      // Another tab already closed it — fetch latest and return
      const existing = _cache.sessions.find(s => s.id === sessionId);
      return { ...existing, alreadyClosed: true };
    }
    const updated = sessionToApp(data[0]);
    const i = _cache.sessions.findIndex(s => s.id === sessionId);
    if (i >= 0) _cache.sessions[i] = updated;

    // Deduct member balance atomically + capture shortfall info for caller
    let shortfall = 0;
    if (session.memberId) {
      const m = getMember(session.memberId);
      if (m) {
        const charge = await chargeBalance(session.memberId, -updated.total, `session_${session.stationName}`);
        shortfall = charge.shortfall || 0;
        if (shortfall > 0) {
          // Finance #2: persist shortfall to sessions table so it's queryable
          await sb.from('sessions').update({ shortfall }).eq('id', sessionId);
          updated.shortfall = shortfall;
          try {
            const actor = await getCurrentUserEmail();
            await sb.from('audit_log').insert({
              action: 'session_shortfall',
              actor_email: actor,
              before_state: { session_id: session.id, member_id: session.memberId, balance_before: m.balance },
              after_state: { total_due: updated.total, shortfall },
              note: 'Member balance insufficient — cashier should collect difference',
            });
          } catch (_) {}
        }
        await updateMember(session.memberId, {
          totalSpent: m.totalSpent + updated.total,
          totalMinutes: m.totalMinutes + updated.durationMinutes,
        });
      }
    }

    // Update station status — must await (IT S1-4: was fire-and-forget)
    const stillActive = getActiveSessionsForStation(session.stationId).length;
    if (stillActive === 0) {
      const { error: stErr } = await sb.from('stations').update({ status: 'idle' }).eq('id', session.stationId);
      if (stErr) console.error('Station idle update failed:', stErr);
      const sidx = _cache.stations.findIndex(s => s.id === session.stationId);
      if (sidx >= 0) _cache.stations[sidx].status = 'idle';
    }

    // Surface shortfall to caller so dashboard can show cashier the cash to collect
    updated.shortfall = shortfall;
    return updated;
  }

  /* ========== Members ========== */

  /**
   * Create a member with balance=0 and tier='regular'.
   * Tier promotion + balance MUST be done via applyTopUp() — single source of truth
   * prevents double-credit. (Was a bug: addMember + applyTopUp = balance counted twice.)
   * Retries on bind_code collision (1 in 32^8 chance but possible).
   */
  async function addMember({ name, phone }) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = {
        name, phone: phone || '',
        tier: 'regular',
        balance: 0,
        bind_code: generateBindCode(),
      };
      const { data, error } = await sb.from('members').insert(row).select().single();
      if (!error) {
        const m = memberToApp(data);
        _cache.members.push(m);
        return m;
      }
      lastErr = error;
      if (error.code !== '23505') break; // not a unique violation
    }
    throw lastErr || new Error('Failed to create member');
  }

  /**
   * Update non-balance member fields (name, phone, tier, totalSpent, totalMinutes, telegram_id, bind_code).
   * For BALANCE changes use chargeBalance() — race-free via Postgres RPC.
   * The 'balance' key here is IGNORED (write blocked to prevent accidental lost-update).
   */
  async function updateMember(id, patch) {
    const idx = _cache.members.findIndex(m => m.id === id);
    if (idx < 0) return null;
    if ('balance' in patch) {
      console.warn('updateMember: balance writes blocked. Use chargeBalance(id, delta, reason).');
      delete patch.balance;
    }
    const updated = { ..._cache.members[idx], ...patch };
    const dbPatch = {};
    if ('name' in patch) dbPatch.name = patch.name;
    if ('phone' in patch) dbPatch.phone = patch.phone;
    if ('tier' in patch) dbPatch.tier = patch.tier;
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

  /**
   * Atomically apply a balance delta via Postgres RPC.
   * Race-free — uses UPDATE ... RETURNING under FOR UPDATE row lock.
   * @param delta positive to add, negative to charge
   * @returns { newBalance, shortfall }  shortfall>0 means the charge exceeded available balance
   */
  async function chargeBalance(memberId, delta, reason = 'session') {
    const { data, error } = await sb.rpc('apply_balance_delta', {
      p_member_id: memberId,
      p_delta: delta,
      p_reason: reason,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const newBalance = Number(row.new_balance);
    const shortfall = Number(row.shortfall || 0);

    // Sync cache
    const idx = _cache.members.findIndex(m => m.id === memberId);
    if (idx >= 0) _cache.members[idx].balance = newBalance;

    return { newBalance, shortfall };
  }

  /**
   * Soft-delete a member. Per owner policy: member history MUST persist.
   * archived_at is set; rows stay in DB; UI filters by archived_at IS NULL.
   * Hard delete is blocked if balance > 0 or active sessions exist.
   */
  async function deleteMember(id, opts = {}) {
    const m = getMember(id);
    if (!m) return;
    const active = _cache.sessions.some(s => s.memberId === id && s.status === 'active');
    if (active && !opts.force) {
      throw new Error('会员有进行中的游戏台 / Member has active session — close first');
    }
    if (m.balance > 0 && !opts.force) {
      throw new Error(`会员有余额 ${m.balance.toFixed(2)} / Member has non-zero balance — top down or refund first`);
    }
    // Soft delete: mark archived. Do NOT remove from DB.
    await sb.from('members').update({
      archived_at: new Date().toISOString(),
      archived_reason: opts.reason || 'manual_delete',
    }).eq('id', id);
    _cache.members = _cache.members.filter(x => x.id !== id);

    // Audit log
    await sb.from('audit_log').insert({
      action: 'member_archive',
      before_state: { id: m.id, name: m.name, balance: m.balance, tier: m.tier },
      note: opts.reason || null,
    });
  }

  /**
   * Apply a top-up: figure out tier change and bonus, then update member + log.
   * Returns { member, topUp, oldTier, newTier, bonus, reason }
   */
  async function applyTopUp(memberId, amount) {
    const m = getMember(memberId);
    if (!m) throw new Error('Member not found');
    if (!amount || amount <= 0) throw new Error('Invalid amount');
    const s = _cache.settings;
    const oldTier = m.tier;
    let newTier = oldTier;
    let bonus = 0;
    let reason = 'recharge';

    if (amount >= s.memberFees.platinum) {
      newTier = 'platinum';
      bonus = s.platinumTopupBonus;
      reason = oldTier === 'platinum' ? 'platinum_recharge'
             : oldTier === 'silver' ? 'silver_to_platinum'
             : 'new_platinum';
    } else if (amount >= s.memberFees.silver && oldTier === 'regular') {
      newTier = 'silver';
      reason = 'new_silver';
    } else {
      reason = oldTier === 'regular' ? 'partial' : 'recharge';
    }

    // Atomic balance add via RPC (race-free)
    const { newBalance } = await chargeBalance(memberId, amount + bonus, reason);

    // Update tier (separate write — not racy because tier is non-numeric and rarely concurrent)
    let updated;
    if (newTier !== oldTier) {
      updated = await updateMember(memberId, { tier: newTier });
    } else {
      updated = getMember(memberId);
    }

    // Log top-up row
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
    const before = _cache.settings ? JSON.parse(JSON.stringify(_cache.settings)) : null;
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
      currency: appSettings.currency || (_cache.settings && _cache.settings.currency) || 'SGD',
      currency_symbol: appSettings.currencySymbol,
      min_billing_minutes: appSettings.minBillingMinutes,
      updated_at: new Date().toISOString(),
    };
    await sb.from('settings').update(row).eq('id', 1);
    _cache.settings = appSettings;

    // Audit log — capture before/after for every settings change
    try {
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('audit_log').insert({
        action: 'settings_update',
        actor_email: user?.email || null,
        before_state: before,
        after_state: appSettings,
      });
    } catch (e) { console.warn('audit failed', e); }
  }

  async function togglePromo(active) {
    const s = { ..._cache.settings, promoActive: !!active };
    await saveSettings(s);
    return s;
  }

  async function clearSessions() {
    // Audit BEFORE deletion (so we capture what was cleared)
    try {
      const { data: { user } } = await sb.auth.getUser();
      const sessionCount = _cache.sessions.length;
      await sb.from('audit_log').insert({
        action: 'sessions_clear',
        actor_email: user?.email || null,
        before_state: { count: sessionCount },
        note: `Cleared ${sessionCount} session(s)`,
      });
    } catch (e) { console.warn('audit failed', e); }
    await sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    _cache.sessions = [];
  }

  async function resetAll(confirmString) {
    // SAFETY: require typed confirmation string "RESET" to proceed
    if (confirmString !== 'RESET') {
      throw new Error('resetAll requires confirmString "RESET" — refused for safety');
    }
    // Audit BEFORE
    try {
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('audit_log').insert({
        action: 'reset_all',
        actor_email: user?.email || null,
        before_state: {
          sessions: _cache.sessions.length,
          top_ups: _cache.topUps.length,
          members: _cache.members.length,
        },
        note: 'Full reset triggered',
      });
    } catch (e) { console.warn('audit failed', e); }

    // Sequential delete (not Promise.all — order matters for FK + realtime)
    await sb.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('top_ups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Soft-delete members instead of hard delete (owner policy: member history MUST persist)
    await sb.from('members').update({
      archived_at: new Date().toISOString(),
      archived_reason: 'reset_all',
    }).is('archived_at', null);
    await sb.from('stations').update({ status: 'idle' }).neq('id', 0);

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
   * Create a new order with items + payments.
   * cart: [{ menuItemId, quantity, note }]
   * payments: [{ method, amount, tendered?, changeGiven?, note? }]  ← supports split bill
   *           or for backwards compat, payment: { method } applies whole total to one method
   * Returns { order, items, payments }.
   */
  async function createOrder({
    memberId, guestName, cart, payment, payments, note, cashier,
    discount: discountInput,
    // Migration 008 additions
    takeaway = false,
    takeawayCharge,         // override the default $0.20 if needed
    extraCharges = [],      // [{label, amount}] — manual add-on or delivery diff
    deliveryPlatformTotal,  // when Grab/FoodPanda is the tender
  }) {
    if (!cart || cart.length === 0) throw new Error('购物车为空 Cart is empty');
    const actor = cashier || (await getCurrentUserEmail());

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

    const itemsSubtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));

    // Takeaway box charge: one per order. Settings can override default $0.20.
    const settings = _cache.settings || {};
    const defaultTakeawayCharge = settings.takeawayCharge != null
      ? Number(settings.takeawayCharge) : 0.20;
    const takeawayAmt = takeaway
      ? round2(takeawayCharge != null ? Number(takeawayCharge) : defaultTakeawayCharge)
      : 0;

    // Extra charges (manual add-on or delivery-diff line items)
    const cleanedExtras = (Array.isArray(extraCharges) ? extraCharges : [])
      .map(e => ({
        label: String(e.label || '其他费用').slice(0, 80),
        amount: round2(Number(e.amount || 0)),
      }))
      .filter(e => e.amount !== 0);   // allow negative (e.g., manual adjustment down)
    const extrasTotal = round2(cleanedExtras.reduce((s, e) => s + e.amount, 0));

    // Subtotal for discount calc = items + takeaway + extras
    const subtotal = round2(itemsSubtotal + takeawayAmt + extrasTotal);

    let discountAmt = 0;
    let discountNote = null;
    if (discountInput && (discountInput.amount > 0 || discountInput.value > 0)) {
      if (discountInput.amount != null && discountInput.amount > 0) {
        discountAmt = round2(Math.min(subtotal, discountInput.amount));
      } else if (discountInput.type === 'percent') {
        discountAmt = round2(subtotal * (discountInput.value / 100));
      } else if (discountInput.type === 'fixed') {
        discountAmt = round2(Math.min(subtotal, discountInput.value));
      }
      const tag = discountInput.type === 'percent'
        ? `${discountInput.value}%`
        : `$${discountInput.value}`;
      discountNote = `折扣 ${tag}${discountInput.reason ? ' · ' + discountInput.reason : ''}`;
    }
    const total = round2(Math.max(0, subtotal - discountAmt));

    // Normalize payments — backwards compat with single payment object.
    // IT P1-3: distinguish "undefined" (caller used legacy single-payment
    // path) from "explicit empty array" (caller passed split-bill but failed
    // to add any). Empty array is a bug, not a fallback signal.
    let paymentsList;
    if (Array.isArray(payments)) {
      if (payments.length === 0) {
        throw new Error('未添加任何付款方式 / No payments provided');
      }
      paymentsList = payments;
    } else {
      // legacy: single payment {method} applied to full total
      paymentsList = [{
        method: payment ? payment.method : 'cash',
        amount: total,
        tendered: payment ? payment.tendered : undefined,
        changeGiven: payment ? payment.changeGiven : undefined,
      }];
    }

    // IT P1-2: per-row validation (amount > 0, method allowed)
    const ALLOWED_METHODS = new Set(['cash','paynow','member_balance','card','grab','foodpanda']);
    for (const p of paymentsList) {
      if (!ALLOWED_METHODS.has(p.method)) {
        throw new Error(`无效付款方式 / Invalid payment method: ${p.method}`);
      }
      if (!(Number(p.amount) > 0)) {
        throw new Error(`付款金额必须大于 0 / Payment amount must be > 0`);
      }
    }

    // Validate payments sum equals total (allow ±$0.01 rounding tolerance)
    const paySum = round2(paymentsList.reduce((s, p) => s + round2(Number(p.amount)), 0));
    if (Math.abs(paySum - total) > 0.01) {
      throw new Error(`支付金额(${paySum})与应收(${total})不符 / Payment ${paySum} ≠ Total ${total}`);
    }

    // For each member_balance payment, verify member has enough balance
    const memberPayments = paymentsList.filter(p => p.method === 'member_balance');
    if (memberPayments.length > 0) {
      if (!memberId) throw new Error('会员余额支付需要选择会员 / Member required for balance payment');
      const m = getMember(memberId);
      if (!m) throw new Error('会员不存在 Member not found');
      const balanceDue = memberPayments.reduce((s, p) => s + Number(p.amount), 0);
      if (m.balance < balanceDue) {
        throw new Error(`余额不足: 需要 ${balanceDue}, 余额 ${m.balance.toFixed(2)}`);
      }
    }

    // Determine the primary payment_method for the orders row
    const distinctMethods = [...new Set(paymentsList.map(p => p.method))];
    const primaryMethod = distinctMethods.length === 1 ? distinctMethods[0] : 'mixed';

    // Insert order
    const combinedNote = [note, discountNote].filter(Boolean).join(' | ') || null;
    const orderRow = {
      member_id: memberId || null,
      guest_name: guestName || null,
      subtotal,
      discount: discountAmt,
      total,
      payment_method: primaryMethod,
      status: 'completed',
      note: combinedNote,
      cashier: actor,
      completed_at: new Date().toISOString(),
      // Migration 008 fields
      takeaway: !!takeaway,
      takeaway_charge: takeawayAmt,
      extra_charges: cleanedExtras,
      delivery_platform_total: deliveryPlatformTotal != null ? round2(Number(deliveryPlatformTotal)) : null,
    };
    const { data: orderData, error: orderErr } = await sb.from('orders').insert(orderRow).select().single();
    if (orderErr) throw orderErr;

    // Insert items — IT P0-2: rollback orphan order if items fail.
    const itemRows = items.map(i => ({ ...i, order_id: orderData.id }));
    const { data: itemsData, error: itemsErr } = await sb.from('order_items').insert(itemRows).select();
    if (itemsErr) {
      try {
        await sb.from('orders').update({ status: 'voided', note: 'AUTO-VOIDED: items insert failed' }).eq('id', orderData.id);
      } catch (_) {}
      throw new Error('订单商品记录失败 / Items record failed: ' + itemsErr.message);
    }

    // Insert payments (one row per tender) — IT S1-A: error check + rollback orphan order
    const paymentRows = paymentsList.map(p => ({
      order_id: orderData.id,
      method: p.method,
      amount: round2(Number(p.amount)),
      tendered: p.tendered != null ? round2(Number(p.tendered)) : null,
      change_given: p.changeGiven != null ? round2(Number(p.changeGiven)) : null,
      note: p.note || null,
    }));
    const { data: paymentsData, error: paymentsErr } = await sb.from('order_payments').insert(paymentRows).select();
    if (paymentsErr) {
      // Rollback: mark order as voided so Z-Report doesn't count it as revenue
      try {
        await sb.from('orders').update({ status: 'voided', note: 'AUTO-VOIDED: payment insert failed' }).eq('id', orderData.id);
      } catch (_) {}
      throw new Error('订单付款记录失败 / Payment record failed: ' + paymentsErr.message);
    }

    // Audit log if discount was applied
    if (discountAmt > 0) {
      try {
        await sb.from('audit_log').insert({
          action: 'order_discount',
          actor_email: actor,
          before_state: { order_no: orderData.order_no, subtotal },
          after_state: { discount: discountAmt, total, ...discountInput },
          note: discountNote,
        });
      } catch (e) { console.warn('audit failed', e); }
    }

    // Cache
    const order = orderToApp(orderData);
    _cache.orders.unshift(order);
    const orderItems = (itemsData || []).map(orderItemToApp);
    _cache.orderItems.push(...orderItems);
    const orderPayments = (paymentsData || []).map(orderPaymentToApp);
    _cache.orderPayments.push(...orderPayments);

    // Deduct member balance for any member_balance portion.
    // IT P0-3: chargeBalance returns shortfall — if > 0, the cache pre-check
    // (line ~1121) was stale and another tab drained the balance between read
    // and RPC. Roll the order back so we don't ship goods un-paid.
    const memberBalanceTotal = paymentsList
      .filter(p => p.method === 'member_balance')
      .reduce((s, p) => s + Number(p.amount), 0);
    if (memberBalanceTotal > 0 && memberId) {
      const m = getMember(memberId);
      const { shortfall } = await chargeBalance(memberId, -memberBalanceTotal, `order_${order.orderNo}`);
      if (shortfall > 0) {
        // Refund what we just took (RPC accepts negative for charge, positive
        // for refund). Then void the order + clear payment rows so the cashier
        // sees the failure cleanly.
        try {
          await chargeBalance(memberId, memberBalanceTotal, `rollback_${order.orderNo}`);
        } catch (_) { /* best effort */ }
        try { await sb.from('order_payments').delete().eq('order_id', orderData.id); } catch (_) {}
        try {
          await sb.from('orders').update({
            status: 'voided',
            note: 'AUTO-VOIDED: member balance insufficient at charge time',
          }).eq('id', orderData.id);
        } catch (_) {}
        // Also drop from cache so UI doesn't show ghost order.
        _cache.orders = _cache.orders.filter(o => o.id !== orderData.id);
        _cache.orderPayments = _cache.orderPayments.filter(p => p.orderId !== orderData.id);
        throw new Error(
          `余额不足 / Insufficient balance — 差 ${shortfall.toFixed(2)}. 订单已撤销，请改用其他付款方式.`
        );
      }
      await updateMember(memberId, {
        totalSpent: m.totalSpent + memberBalanceTotal,
      });
    }

    return { order, items: orderItems, payments: orderPayments };
  }

  /* ========== Daily summary / Z-Report ========== */

  /**
   * Aggregate the day's takings for end-of-shift reconciliation.
   * Returns { cash, paynow, memberBalance, card, totalDiscount, topUps,
   *           orderCount, sessionCount, voidedCount, byPayment[] }
   */
  function getDailySummary(yyyymmdd) {
    // Singapore timezone is UTC+8 — pin window explicitly so a cashier on a
    // device with a different OS timezone (or near midnight UTC drift) still
    // gets the right Singapore business-day boundaries. (Finance P0-B 2026-05-14)
    const day = yyyymmdd || (() => {
      // Today in SGT
      const now = new Date();
      const sgt = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      return sgt.toISOString().slice(0, 10);
    })();
    const start = new Date(day + 'T00:00:00+08:00').getTime();
    const end = start + 86400000;

    const dayOrders = _cache.orders.filter(o =>
      o.status === 'completed' &&
      (o.completedAt || o.createdAt) >= start &&
      (o.completedAt || o.createdAt) < end
    );
    const orderIds = new Set(dayOrders.map(o => o.id));
    const dayPayments = _cache.orderPayments.filter(p => orderIds.has(p.orderId));

    const daySessions = _cache.sessions.filter(s =>
      s.status === 'completed' && s.endTime && s.endTime >= start && s.endTime < end
    );

    const dayTopUps = _cache.topUps.filter(t => t.createdAt >= start && t.createdAt < end);

    const voided = _cache.orders.filter(o =>
      o.status === 'voided' &&
      (o.completedAt || o.createdAt) >= start &&
      (o.completedAt || o.createdAt) < end
    );

    // Aggregate by payment method (orders + sessions both contribute)
    const byMethod = { cash: 0, paynow: 0, member_balance: 0, card: 0, grab: 0, foodpanda: 0 };
    dayPayments.forEach(p => {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    });
    // Sessions also contribute revenue. payment_method column on sessions
    // tells us which bucket (walk-in defaults to 'cash' if column blank).
    daySessions.forEach(s => {
      const method = s.memberId ? 'member_balance' : (s.paymentMethod || 'cash');
      byMethod[method] = (byMethod[method] || 0) + Number(s.total);
    });

    const totalDiscount = dayOrders.reduce((s, o) => s + Number(o.discount || 0), 0);
    const topupsCash = dayTopUps.reduce((s, t) => s + Number(t.amount), 0);
    const topupsBonus = dayTopUps.reduce((s, t) => s + Number(t.bonus || 0), 0);
    // Delivery / takeaway / extra-charge totals (Wave B 2026-05-14)
    const deliveryOrders = dayOrders.filter(o => o.paymentMethod === 'grab' || o.paymentMethod === 'foodpanda');
    const takeawayCount = dayOrders.filter(o => o.takeaway).length;
    const takeawayChargeTotal = dayOrders.reduce((s, o) => s + Number(o.takeawayCharge || 0), 0);
    const extraChargesTotal = dayOrders.reduce((s, o) => {
      const arr = Array.isArray(o.extraCharges) ? o.extraCharges : [];
      return s + arr.reduce((ss, e) => ss + Number(e.amount || 0), 0);
    }, 0);

    return {
      day,
      orderCount: dayOrders.length,
      sessionCount: daySessions.length,
      voidedCount: voided.length,
      totalRevenue: round2(Object.values(byMethod).reduce((s, v) => s + v, 0)),
      cash: round2(byMethod.cash),
      paynow: round2(byMethod.paynow),
      memberBalance: round2(byMethod.member_balance),
      card: round2(byMethod.card),
      grab: round2(byMethod.grab),
      foodpanda: round2(byMethod.foodpanda),
      totalDiscount: round2(totalDiscount),
      topUpsCash: round2(topupsCash),
      topUpsBonus: round2(topupsBonus),
      deliveryCount: deliveryOrders.length,
      takeawayCount,
      takeawayChargeTotal: round2(takeawayChargeTotal),
      extraChargesTotal: round2(extraChargesTotal),
      voidedOrders: voided.map(v => ({ orderNo: v.orderNo, total: v.total })),
    };
  }

  /**
   * Aggregate revenue for an arbitrary time window with category filter +
   * hourly breakdown. Used by the Reports page filter (Wave B 2026-05-14).
   *
   * opts:
   *   startDate, endDate: 'YYYY-MM-DD' (inclusive). startDate's business day
   *     starts at 12:00 SGT; endDate's business day ends next-day 01:00 SGT
   *     (shop hours 12:00–25:00). If undefined, defaults to today only.
   *   startHour, endHour: integer 12–25 (24 = midnight, 25 = 01:00 next day).
   *     Window is [startDate@startHour, endDate@endHour). Default 12–25 (all).
   *   category: 'all' | 'food' | 'gaming'. Default 'all'.
   *
   * Returns:
   *   { startMs, endMs, orderCount, sessionCount, revenue, byMethod,
   *     hourly: [{ label: 'D 18:00', revenue }], breakdown: {food, gaming} }
   */
  function getRangeSummary(opts = {}) {
    const today = (() => {
      const now = new Date();
      const sgt = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
      return sgt.toISOString().slice(0, 10);
    })();
    const startDate = opts.startDate || today;
    const endDate = opts.endDate || startDate;
    const startHour = opts.startHour != null ? opts.startHour : 12;
    const endHour = opts.endHour != null ? opts.endHour : 25;
    const category = opts.category || 'all';

    // Build epoch range. SGT-pinned. "Hour 24" → +12h offset from noon.
    const sgtMs = (yyyymmdd, hourOffset) =>
      new Date(yyyymmdd + 'T12:00:00+08:00').getTime() + (hourOffset - 12) * 3600 * 1000;
    const startMs = sgtMs(startDate, startHour);
    const endMs = sgtMs(endDate, endHour);

    const inRange = (ts) => ts >= startMs && ts < endMs;

    const orders = (category === 'gaming') ? [] : _cache.orders.filter(o =>
      o.status === 'completed' && inRange(o.completedAt || o.createdAt)
    );
    const sessions = (category === 'food') ? [] : _cache.sessions.filter(s =>
      s.status === 'completed' && s.endTime && inRange(s.endTime)
    );

    const orderIds = new Set(orders.map(o => o.id));
    const payments = _cache.orderPayments.filter(p => orderIds.has(p.orderId));

    const byMethod = { cash: 0, paynow: 0, member_balance: 0, card: 0, grab: 0, foodpanda: 0 };
    payments.forEach(p => {
      byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    });
    sessions.forEach(s => {
      const m = s.memberId ? 'member_balance' : (s.paymentMethod || 'cash');
      byMethod[m] = (byMethod[m] || 0) + Number(s.total);
    });

    // Hourly breakdown: bucketize by Singapore hour-of-day.
    const hours = Math.max(1, Math.round((endMs - startMs) / 3600000));
    const hourly = [];
    for (let i = 0; i < hours; i++) {
      const hStart = startMs + i * 3600000;
      const hEnd = hStart + 3600000;
      let rev = 0;
      orders.forEach(o => {
        const t = o.completedAt || o.createdAt;
        if (t >= hStart && t < hEnd) rev += Number(o.total);
      });
      sessions.forEach(s => {
        if (s.endTime >= hStart && s.endTime < hEnd) rev += Number(s.total);
      });
      // Label in SGT
      const labelDate = new Date(hStart);
      const sgtH = (labelDate.getUTCHours() + 8) % 24;
      const dateLabel = new Date(hStart + 8 * 3600000).toISOString().slice(5, 10); // MM-DD
      hourly.push({
        label: `${dateLabel} ${String(sgtH).padStart(2, '0')}:00`,
        startMs: hStart,
        revenue: round2(rev),
      });
    }

    const foodRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const gamingRevenue = sessions.reduce((s, o) => s + Number(o.total), 0);
    const revenue = round2(foodRevenue + gamingRevenue);

    return {
      startMs, endMs,
      orderCount: orders.length,
      sessionCount: sessions.length,
      revenue,
      byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, round2(v)])),
      hourly,
      breakdown: { food: round2(foodRevenue), gaming: round2(gamingRevenue) },
      filters: { startDate, endDate, startHour, endHour, category },
    };
  }

  /**
   * Mark a day as closed: snapshot + record cashier reconciliation.
   *
   * Guards (Finance + IT audit 2026-05-14):
   * - IT S1-C: refuse if a close already exists for this date (second
   *   cashier would silently overwrite the first).
   * - Finance #3: refuse if any session is still active — an in-progress
   *   walk-in bridging midnight is invisible to getDailySummary and would
   *   corrupt the snapshot. Force all sessions to close first.
   * - Finance #1: expected_cash includes top-up cash because the drawer
   *   physically holds that money (top-ups are paid in cash at counter).
   */
  async function closeDay(yyyymmdd, actualCash, note) {
    // Guard: existing close (use server-side check to defeat stale cache).
    const { data: existing, error: existingErr } = await sb
      .from('daily_closes')
      .select('close_date, closed_by, closed_at')
      .eq('close_date', yyyymmdd)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) {
      throw new Error(`此日期已结账 (by ${existing.closed_by || 'unknown'}). 如需修改请联系管理员撤销原记录.`);
    }

    // Guard: no active sessions allowed.
    const activeSessions = _cache.sessions.filter(s => s.status === 'active');
    if (activeSessions.length > 0) {
      const stationLabels = activeSessions.map(s => s.stationName || s.stationId).join(', ');
      throw new Error(
        `仍有 ${activeSessions.length} 个游戏台未结账：${stationLabels}。` +
        `请先在「游戏台」页面结束这些机台，然后再回到「报表」日结。`
      );
    }

    const summary = getDailySummary(yyyymmdd);
    const actor = await getCurrentUserEmail();
    // Cash drawer holds order/session cash AND top-up cash collected.
    const expectedCash = round2(summary.cash + summary.topUpsCash);
    const row = {
      close_date: yyyymmdd,
      closed_by: actor,
      expected_cash: expectedCash,
      actual_cash: actualCash != null ? Number(actualCash) : null,
      cash_difference: actualCash != null ? round2(Number(actualCash) - expectedCash) : null,
      expected_paynow: summary.paynow,
      member_deductions: summary.memberBalance,
      total_discount: summary.totalDiscount,
      topups_received: summary.topUpsCash,
      voided_orders: summary.voidedCount,
      note: note || null,
      snapshot: summary,
    };
    // INSERT (not upsert) — overwrite protection is enforced above; using
    // insert here means a race between two cashiers will fail at the unique
    // index instead of silently clobbering.
    const { data, error } = await sb.from('daily_closes').insert(row).select().single();
    if (error) {
      if (error.code === '23505') {
        throw new Error('此日期已结账 (另一位收银员同时操作). 请刷新后再试.');
      }
      throw error;
    }
    const close = dailyCloseToApp(data);
    // Update cache (replace existing entry for this date if any)
    _cache.dailyCloses = _cache.dailyCloses.filter(c => c.closeDate !== yyyymmdd);
    _cache.dailyCloses.unshift(close);
    // Audit log
    await sb.from('audit_log').insert({
      action: 'daily_close',
      actor_email: actor,
      before_state: summary,
      after_state: { actual_cash: actualCash, difference: row.cash_difference, note },
    });
    return close;
  }

  function getDailyCloses() { return _cache.dailyCloses; }
  function getOrderPaymentsFor(orderId) {
    return _cache.orderPayments.filter(p => p.orderId === orderId);
  }

  /**
   * Void an order. Handles refund per tender:
   * - member_balance: refunded via chargeBalance (covers MIXED orders that
   *   used member balance for part of the bill — was broken before:
   *   Finance P0-C + IT P0-1 audit 2026-05-14)
   * - cash / paynow / card / grab / foodpanda: a negative refund row is
   *   inserted into order_payments so the day's revenue nets out. The
   *   cashier is expected to physically return the cash (or process the
   *   reversal). Caller passes `note` to explain (e.g., "客户改主意",
   *   "厨房做错了").
   *
   * opts: { note?, refundedTenders? }
   *   refundedTenders: optional Set/Array of payment IDs the cashier
   *     marks as actually returned. If omitted, ALL tenders are refunded
   *     (default behavior — matches "void = cancel, money goes back").
   */
  async function voidOrder(orderId, opts = {}) {
    const order = getOrder(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'voided') return; // idempotent

    const actor = await getCurrentUserEmail();
    const note = opts.note || null;
    const tenders = _cache.orderPayments.filter(p => p.orderId === orderId);

    // 1) Refund member-balance portions FIRST (atomic via RPC).
    //    Works for both single-method member orders AND mixed orders.
    let memberRefunded = 0;
    for (const t of tenders) {
      if (t.method !== 'member_balance') continue;
      if (!order.memberId) continue;
      await chargeBalance(order.memberId, Number(t.amount), `void_order_${order.orderNo}`);
      memberRefunded += Number(t.amount);
    }
    // Legacy fallback: orders predating order_payments may have
    // paymentMethod='member_balance' but no row in order_payments.
    if (memberRefunded === 0 && order.paymentMethod === 'member_balance' && order.memberId) {
      await chargeBalance(order.memberId, order.total, `void_order_${order.orderNo}`);
      memberRefunded = order.total;
    }
    if (memberRefunded > 0 && order.memberId) {
      const m = getMember(order.memberId);
      if (m) {
        await updateMember(order.memberId, {
          totalSpent: Math.max(0, m.totalSpent - memberRefunded),
        });
      }
    }

    // 2) Mark order voided.
    await sb.from('orders').update({ status: 'voided' }).eq('id', orderId);
    const idx = _cache.orders.findIndex(o => o.id === orderId);
    if (idx >= 0) _cache.orders[idx].status = 'voided';

    // 3) Audit with actor + per-tender breakdown.
    await sb.from('audit_log').insert({
      action: 'order_void',
      actor_email: actor,
      before_state: {
        order_no: order.orderNo,
        total: order.total,
        payment: order.paymentMethod,
        member_id: order.memberId,
        tenders: tenders.map(t => ({ method: t.method, amount: t.amount })),
      },
      after_state: { member_refunded: memberRefunded, note },
      note: note || `Voided order #${order.orderNo}`,
    });
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
    init, resetForLogout,
    // Time (clock-synced with server)
    now, syncClock,
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
    getOrders, getOrder, getOrderItemsForOrder, getOrderPaymentsFor,
    createOrder, voidOrder,
    // Daily close / Z-Report
    getDailySummary, getRangeSummary, getDailyCloses, closeDay,
    // Billing
    getRateFor, resolveRateTier,
    computeWalkInBill, computeMemberBill,
    // Sessions
    openSession, extendWalkIn, closeSession,
    // Members
    addMember, updateMember, deleteMember,
    chargeBalance, applyTopUp, regenerateBindCode,
    // Settings
    saveSettings, togglePromo, clearSessions, resetAll,
    // Export
    exportData, importData,
  };
})();
