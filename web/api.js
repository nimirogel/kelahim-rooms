// Data layer: Supabase when web/config.js is filled in, otherwise an in-browser demo with sample data.
(() => {
  const CFG = window.KELAHIM || {};
  const ERRS = ["missing_email", "clash", "past_time", "missing_details", "room_not_found", "option_not_found", "too_long", "bad_block", "bad_time", "nothing_to_cancel", "checkout_not_allowed"];
  const errCode = e => { const m = String(e?.message || e?.code || e || ""); return ERRS.find(c => m.includes(c)) || "unavailable"; };
  const fail = e => { throw { code: errCode(e) }; };

  // DB row -> the shape the app uses
  const toSlot = r => ({
    id: r.id, roomId: r.room_id, date: String(r.date).slice(0, 10), start: r.start_time ?? r.start, end: r.end_time ?? r.end,
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : undefined, status: r.status || "pending", price: r.price, optionName: r.option_name,
    series: r.series, detailId: r.booking_id, paidAt: r.paid_at, cancelledAt: r.cancelled_at, cancelledBy: r.cancelled_by,
    refund: r.refund, refundedAt: r.refunded_at, reminded: r.reminded_at, reminderVia: r.reminder_via, reminderError: r.reminder_error, deposit: r.deposit, depositStatus: r.deposit_status,
    checkout: r.checkout, createdAt: r.created_at, source: r.bookings?.source, token: r.bookings?.token, booking: r.bookings
  });
  const SNAKE = { status: "status", paidAt: "paid_at", cancelledAt: "cancelled_at", cancelledBy: "cancelled_by", refund: "refund", refundedAt: "refunded_at", reminded: "reminded_at", reminderVia: "reminder_via", depositStatus: "deposit_status", depositAt: "deposit_at", checkout: "checkout" };
  const toSnake = patch => Object.fromEntries(Object.entries(patch).filter(([k]) => SNAKE[k]).map(([k, v]) => [SNAKE[k], v]));
  const fromBooking = b => ({ ...b, roomId: b.room_id, optionName: b.option_name, slots: (b.slots || []).map(s => toSlot({ ...s, booking_id: b.id })) });

  if (CFG.supabaseUrl && CFG.supabaseAnonKey && !window.supabase) {
    // the site is set up for the real database but the library did not load: report it, never show demo data
    const down = async () => { throw { code: "unavailable" }; };
    window.api = { mode: "live", isAdmin: async () => false, loadSettings: down, listSlots: down, getBookings: down, createBooking: down, cancelMine: down,
      uploadCheckoutPhoto: down, submitCheckout: down, updateSlot: down, uploadSiteImage: down, signedUrls: async () => ({}), signIn: down, signOut: async () => {} };
    return;
  }
  if (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    const isAdmin = async () => { const { data: s } = await sb.auth.getSession(); if (!s.session) return false; const { data } = await sb.rpc("is_admin"); return !!data; };
    window.api = {
      mode: "live",
      isAdmin,
      async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw { code: "login" }; return isAdmin(); },
      async signOut() { await sb.auth.signOut(); },
      async loadSettings() { const { data, error } = await sb.from("settings").select("data").eq("id", 1).single(); if (error) fail(error); return data.data || {}; },
      async saveSettings(d) { const { error } = await sb.from("settings").update({ data: d, updated_at: new Date().toISOString() }).eq("id", 1); if (error) fail(error); },
      async listSlots(from, admin, to) {
        let q = admin ? sb.from("slots").select("*, bookings(*)").gte("date", from).order("starts_at") : sb.from("public_slots").select("*").gte("date", from);
        if (to) q = q.lte("date", to);
        const { data, error } = await q; if (error) fail(error); return data.map(toSlot);
      },
      async getBookings(tokens) { if (!tokens.length) return []; const { data, error } = await sb.rpc("get_bookings", { tokens }); if (error) fail(error); return (data || []).map(fromBooking); },
      async createBooking(p) { const { data, error } = await sb.rpc("create_booking", { p }); if (error) fail(error); return data; },
      async cancelMine(token, ids) { const { data, error } = await sb.rpc("cancel_booking", { tok: token, slot_ids: ids || null }); if (error) fail(error); return data; },
      async uploadCheckoutPhoto(token, blob) {
        const path = `${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error } = await sb.storage.from("checkout").upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw { code: "upload" }; return path;
      },
      async submitCheckout(token, slot, photos, note, via) { const { error } = await sb.rpc("submit_checkout", { tok: token, slot, photos, note, via }); if (error) fail(error); },
      async updateSlot(id, patch) { const { error } = await sb.from("slots").update(toSnake(patch)).eq("id", id); if (error) fail(error); },
      async uploadSiteImage(blob) {
        const ext = ((blob.type || "image/jpeg").split("/")[1] || "jpg").replace("svg+xml", "svg").replace("jpeg", "jpg");
        const path = `img-${Date.now()}.${ext}`;
        const { error } = await sb.storage.from("site").upload(path, blob, { contentType: blob.type });
        if (error) throw { code: "upload" }; return sb.storage.from("site").getPublicUrl(path).data.publicUrl;
      },
      async signedUrls(paths) { if (!paths.length) return {}; const { data } = await sb.storage.from("checkout").createSignedUrls(paths, 3600); return Object.fromEntries((data || []).filter(x => x.signedUrl).map(x => [x.path, x.signedUrl])); }
    };
    return;
  }

  // ---------------- Demo mode: everything lives in this browser ----------------
  const KEY = "kelahim-demo-v1";
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const ms = (date, hm) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hm.split(":").map(Number); return new Date(y, m - 1, d, h, mi).getTime(); };
  const id = () => crypto.randomUUID();
  let st = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  async function load() {
    if (st) return st;
    try { st = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { st = null; }
    if (st && st.settings) return st;
    const settings = await (await fetch("demo-settings.json")).json();
    st = { settings, bookings: [], slots: [], admin: false };
    const sample = [["beitam", 3, "18:00", "22:00", "לפי שעה", 400, "paid", "משפחת לוי"], ["noar1", 1, "17:00", "19:00", "לפי שעה", 100, "paid", "תנועת הנוער"],
      ["library", 1, "19:00", "21:00", "לפי שעה", 100, "pending", "חוג קריאה"], ["clinic", 2, "09:00", "13:00", "לפי שעה", 80, "paid", "קלינאית תקשורת"],
      ["soccer", 2, "16:00", "18:00", "לפי שעה", 50, "pending", "קבוצת ילדים"], ["zahav", 6, "10:00", "13:00", "לפי שעה", 300, "paid", "ועד גיל הזהב"],
      ["hugim", 4, "17:00", "19:00", "לפי שעה", 120, "paid", "סטודיו פילאטיס"], ["beitam", -1, "09:00", "12:00", "לפי שעה", 300, "paid", "משפחת דוד"]];
    for (const [room, n, a, b, opt, price, status, name] of sample) {
      const bid = id(), dep = room === "beitam" || room === "zahav" ? 500 : 0;
      st.bookings.push({ id: bid, token: id().replace(/-/g, ""), room_id: room, option_name: opt, name: name + " (דוגמה)", phone: "050-0000000", residency: "local", total: price, deposit: dep, source: "manual" });
      st.slots.push({ id: id(), booking_id: bid, room_id: room, date: day(n), start_time: a, end_time: b, price, option_name: opt, status, deposit: dep, paid_at: status === "paid" ? new Date().toISOString() : null, created_at: new Date().toISOString(), starts: ms(day(n), a), ends: ms(day(n), b) });
    }
    save(); return st;
  }
  const findRoom = (s, rid) => { for (const b of s.buildings || []) for (const r of b.rooms || []) if (r.id === rid) return r; return null; };
  const withBooking = sl => ({ ...sl, bookings: st.bookings.find(b => b.id === sl.booking_id) });

  window.api = {
    mode: "demo",
    async isAdmin() { await load(); return !!st.admin; },
    async signIn() { await load(); st.admin = true; save(); return true; },
    async signOut() { await load(); st.admin = false; save(); },
    async loadSettings() { await load(); return JSON.parse(JSON.stringify(st.settings)); },
    async saveSettings(d) { await load(); st.settings = JSON.parse(JSON.stringify(d)); save(); },
    async listSlots(from, admin, to) { await load(); return st.slots.filter(s => s.date >= from && (!to || s.date <= to) && (admin || s.status !== "cancelled")).map(s => toSlot(admin ? withBooking(s) : { id: s.id, room_id: s.room_id, date: s.date, start_time: s.start_time, end_time: s.end_time, end_date: s.end_date })); },
    async getBookings(tokens) { await load(); return st.bookings.filter(b => tokens.includes(b.token)).map(b => fromBooking({ ...b, slots: st.slots.filter(s => s.booking_id === b.id).map(s => ({ ...s, start: s.start_time, end: s.end_time })) })); },
    async createBooking(p) {
      await load();
      const room = findRoom(st.settings, p.room_id); if (!room) throw { code: "room_not_found" };
      if ((p.name || "").trim().length < 2 || String(p.phone || "").replace(/\D/g, "").length < 9) throw { code: "missing_details" };
      if (!(st.admin && p.source === "manual") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email || "").trim())) throw { code: "missing_email" };
      const adm = st.admin && p.source === "manual", opt = (room.options || []).find(o => o.id === p.option_id);
      if (!adm && !opt) throw { code: "option_not_found" };
      const mult = !adm && p.residency === "outside" ? Number(st.settings.outsidePct || 150) / 100 : 1, buf = Number(room.bufferMin || 0) * 60000;
      const rows = p.items.map(it => {
        const starts = ms(it.date, it.start), ends = ms(it.end_date || it.date, it.end === "24:00" ? "23:59" : it.end) + (it.end === "24:00" ? 60000 : 0);
        if (ends <= starts) throw { code: "bad_time" };
        if (!adm && starts < Date.now()) throw { code: "past_time" };
        const hrs = (ends - starts) / 3600e3;
        const price = adm ? Number(it.price || 0) : Math.round((opt.kind === "hourly" || !opt.kind ? opt.price * hrs : opt.price) * mult);
        return { starts, ends, it, price };
      });
      for (const r of rows) if (st.slots.some(s => s.room_id === p.room_id && s.status !== "cancelled" && r.starts < s.ends + buf && s.starts < r.ends + buf) || rows.some(o => o !== r && r.starts < o.ends + buf && o.starts < r.ends + buf)) throw { code: "clash" };
      const bid = id(), token = id().replace(/-/g, "") + id().replace(/-/g, ""), dep = Number(room.deposit || 0), total = rows.reduce((a, r) => a + r.price, 0);
      st.bookings.push({ id: bid, token, room_id: p.room_id, option_id: p.option_id, option_name: opt?.name || "הזמנה ידנית", name: p.name, phone: p.phone, email: p.email, purpose: p.purpose, people: p.people, residency: p.residency === "outside" ? "outside" : "local", repeat: p.repeat, until: p.until, ranges: p.ranges, total, deposit: dep, source: adm ? "manual" : "self" });
      for (const r of rows) st.slots.push({ id: id(), booking_id: bid, room_id: p.room_id, date: r.it.date, start_time: r.it.start, end_time: r.it.end, end_date: r.it.end_date || null, price: r.price, option_name: opt?.name || "הזמנה ידנית", series: rows.length > 1, status: adm && p.status === "paid" ? "paid" : "pending", paid_at: adm && p.status === "paid" ? new Date().toISOString() : null, deposit: dep, created_at: new Date().toISOString(), starts: r.starts, ends: r.ends });
      save(); return { id: bid, token, total, count: rows.length };
    },
    async cancelMine(token, ids) {
      await load(); const b = st.bookings.find(x => x.token === token); if (!b) throw { code: "nothing_to_cancel" };
      const hrs = Number(st.settings.refundHours ?? 24); let n = 0, full = 0;
      for (const s of st.slots) if (s.booking_id === b.id && s.status !== "cancelled" && s.starts > Date.now() && (!ids || ids.includes(s.id))) {
        s.refund = s.starts - Date.now() >= hrs * 3600e3 ? "full" : "none"; if (s.status === "paid") s.paid_at ||= s.created_at;
        s.status = "cancelled"; s.cancelled_at = new Date().toISOString(); s.cancelled_by = "renter"; n++; if (s.refund === "full") full++;
      }
      if (!n) throw { code: "nothing_to_cancel" }; save(); return { cancelled: n, full_refund: full };
    },
    async uploadCheckoutPhoto(token, blob) { return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); },
    async submitCheckout(token, slot, photos, note, via) {
      await load(); const b = st.bookings.find(x => x.token === token), s = st.slots.find(x => x.id === slot && x.booking_id === b?.id);
      if (!s || s.checkout || s.status === "cancelled" || s.starts > Date.now()) throw { code: "checkout_not_allowed" };
      s.checkout = { photos, note, via, at: new Date().toISOString() }; s.deposit_status = "review"; save();
    },
    async updateSlot(sid, patch) { await load(); const s = st.slots.find(x => x.id === sid); if (s) Object.assign(s, toSnake(patch)); save(); },
    async uploadSiteImage(blob) { return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); },
    async signedUrls(paths) { return Object.fromEntries(paths.map(p => [p, p])); },
    async resetDemo() { localStorage.removeItem(KEY); st = null; }
  };
})();
