(() => {
// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const DOW = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const DOWS = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
const toHM = m => m >= 1439 ? "24:00" : String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const parseYmd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const heDate = s => { const d = parseYmd(s); return `יום ${DOW[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}`; };
const heDateY = s => heDate(s) + " " + parseYmd(s).getFullYear();
const money = n => "₪" + Number(n || 0).toLocaleString("he-IL", { maximumFractionDigits: 0 });
const hrs = h => h === 1 ? "שעה" : h === 2 ? "שעתיים" : (h + " שעות");
const safeUrl = u => /^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
const photoUrl = id => { const v = String(id || ""); if (/^https:\/\//.test(v) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(v) || /^[\w.-]+\.(webp|png|jpe?g|svg)$/i.test(v)) return v; return S.signed?.[v] || ""; };
const waNum = p => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "972" + d.slice(1); return d.length >= 11 ? d : ""; };
const waLink = (phone, text) => { const n = waNum(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ""; };
const STATUS = { pending: "ממתין לתשלום", paid: "שולם", cancelled: "בוטל" };
const ICON = {
  people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 5.4"/></svg>',
  pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  check: '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 3200); }
function gcalLink(title, s, details, location) {
  const [A, B] = slotAbs(s), f = T => ymdOf(Math.floor(T / 1440)).replace(/-/g, "") + "T" + toHM(T % 1440).replace(":", "") + "00";
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: title, dates: f(A) + "/" + f(B), ctz: "Asia/Jerusalem", details, location: location || "" }).toString();
}
const PH_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 42V20L24 7l18 13v22" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 42V29h12v13" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M2 42h44" stroke="var(--sun)" stroke-width="3" stroke-linecap="round"/></svg>';
const phHtml = (r, cls = "") => { const u = photoUrl(r.photoId); return `<div class="ph ${cls}${u ? "" : " noimg"}">${u ? `<img src="${esc(u)}" alt="${esc(r.name)}" loading="lazy" onerror="this.remove()">` : PH_ICON}</div>`; };

try { if (localStorage.getItem("bigText") === "1") document.documentElement.classList.add("big"); } catch (e) {}
const bigBtn = $("#bigText");
const syncBig = () => bigBtn.setAttribute("aria-pressed", document.documentElement.classList.contains("big"));
syncBig();
bigBtn.onclick = () => { const on = document.documentElement.classList.toggle("big"); syncBig(); try { localStorage.setItem("bigText", on ? "1" : "0"); } catch (e) {} };

// ---------- state ----------
const S = {
  db: null, assets: null, me: null, isAdmin: false,
  config: null, configLoaded: false, slots: [], myItems: [],
  view: "public", step: 1, buildingId: null, roomId: null, date: null, calYM: null,
  sel: null, pick: null,
  form: { name: "", phone: "", email: "", purpose: "", people: "", agree: false },
  done: null, adminTab: "calendar", draft: null, dirty: false, details: {}, offline: false, selB: null, selR: null
};
const blankConfig = () => ({ siteName: "השכרת חדרים במושב", managerName: "", managerPhone: "", generalRules: "", reminderHours: 24, buildings: [] });
const bById = id => (S.config?.buildings || []).find(b => b.id === id);
const rById = id => { for (const b of S.config?.buildings || []) { const r = (b.rooms || []).find(r => r.id === id); if (r) return { b, r }; } return null; };

// ---------- availability ----------
// End of Shabbat for Kelahim: sunset + 40 min, rounded up to the half hour
const LAT = 31.40, LNG = 34.62;
const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
function tzOffsetH(ds) { const [y, m, d] = ds.split("-").map(Number); const h = Number(new Date(Date.UTC(y, m - 1, d, 12)).toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false })); return h - 12; }
function sunsetMin(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lh = LNG / 15, t = N + (18 - lh) / 24, M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634) % 360; if (L < 0) L += 360;
  let RA = deg(Math.atan(0.91764 * Math.tan(rad(L)))) % 360; if (RA < 0) RA += 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L)), cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(LAT))) / (cosDec * Math.cos(rad(LAT)));
  const H = deg(Math.acos(cosH)) / 15, T = H + RA - 0.06571 * t - 6.622;
  let UT = (T - lh) % 24; if (UT < 0) UT += 24;
  return Math.round((UT + tzOffsetH(ds)) * 60);
}
const motzash = ds => Math.ceil((sunsetMin(ds) + 40) / 30) * 30;
function daySchedule(b, date) {
  if ((b.closedDates || []).includes(date)) return null;
  const dow = parseYmd(date).getDay(), s = (b.schedule || {})[dow];
  if (!s || !s.open) return null;
  let from = toMin(s.from); const to = toMin(s.to), auto = dow === 6 && s.auto;
  if (auto) { try { from = Math.max(from, motzash(date)); } catch (e) {} }
  return from < to ? { from, to, motzash: dow === 6 } : null;
}
// Shabbat window: Friday closing time until Saturday opening (or all of Saturday when closed)
function shabbatHits(b, A, B) {
  for (let d = Math.floor(A / 1440) - 1; d <= Math.floor(B / 1440) + 1; d++) {
    if (new Date(d * 864e5).getUTCDay() !== 6) continue;
    const fri = daySchedule(b, ymdOf(d - 1)), sat = daySchedule(b, ymdOf(d));
    const ws = (d - 1) * 1440 + (fri ? fri.to : 0), we = d * 1440 + (sat ? sat.from : 1440);
    if (A < we && B > ws) return true;
  }
  return false;
}
const dayNum = s => { const [y, m, d] = String(s).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const ymdOf = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); };
const slotAbs = s => { const a = dayNum(s.date) * 1440 + toMin(s.start); let b = dayNum(s.endDate || s.date) * 1440 + toMin(s.end); if (b <= a) b += 1440; return [a, b]; };
const roomBusy = roomId => S.slots.filter(s => s.roomId === roomId && s.status !== "cancelled").map(s => { const [A, B] = slotAbs(s); return { A, B, s }; });
const busyFor = (roomId, date) => { const D0 = dayNum(date) * 1440, D1 = D0 + 1440; return roomBusy(roomId).filter(x => x.A < D1 && x.B > D0).map(x => ({ a: Math.max(x.A, D0) - D0, b: Math.min(x.B, D1) - D0, s: x.s })).sort((x, y) => x.a - y.a); };
const fitsAbs = (room, A, B) => { const buf = Number(room.bufferMin || 0); return !roomBusy(room.id).some(x => A < x.B + buf && B > x.A - buf); };
const fits = (room, date, a, b) => fitsAbs(room, dayNum(date) * 1440 + a, dayNum(date) * 1440 + b);
const endOf = (date, startMin, hours) => { const T = dayNum(date) * 1440 + startMin + Math.round(hours * 60); return { endDate: ymdOf(Math.floor(T / 1440)), end: toHM(T % 1440) }; };
// Time range kept left-to-right inside Hebrew text, so it always reads 08:00–09:00
const tr = (a, b) => "\u2066" + a + "–" + b + "\u2069";
const whenText = (date, start, end, endDate, short) => endDate && endDate !== date
  ? `${short ? heDate(date) : heDateY(date)} ${start} – ${heDate(endDate)} ${end}`
  : `${short ? heDate(date) : heDateY(date)}, ${tr(start, end)}`;
function nowCut(date) { if (date !== ymd(new Date())) return -1; const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function hourlyStarts(b, room, date, h) {
  const sch = daySchedule(b, date); if (!sch) return [];
  const len = Math.round(h * 60), out = [], cut = nowCut(date);
  for (let m = sch.from; m + len <= sch.to; m += 30) if (m > cut && fits(room, date, m, m + len)) out.push(m);
  return out;
}
function blockStarts(b, room, date, h) {
  const sch = daySchedule(b, date); if (!sch) return [];
  const len = Math.round(h * 60), out = [], cut = nowCut(date), D0 = dayNum(date) * 1440;
  for (let m = sch.from; m < sch.to; m += 60) {
    if (m <= cut) continue;
    const A = D0 + m, B = A + len; let ok = true;
    for (let d = Math.floor(A / 1440); d * 1440 < B; d++) if (!daySchedule(b, ymdOf(d))) { ok = false; break; }
    if (ok && shabbatHits(b, A, B)) ok = false;
    if (ok && fitsAbs(room, A, B)) out.push(m);
  }
  return out;
}
const fixedOk = (room, date, o) => toMin(o.start) > nowCut(date) && fits(room, date, toMin(o.start), toMin(o.end));
function dayStatus(b, room, date) {
  if (!daySchedule(b, date)) return "closed";
  if (!(room.options || []).length) return busyFor(room.id, date).length ? "part" : "free";
  const any = (room.options || []).some(o => o.kind === "fixed" ? fixedOk(room, date, o) : o.kind === "block" ? blockStarts(b, room, date, Number(o.hours || 24)).length : hourlyStarts(b, room, date, Number(o.minHours || 1)).length);
  if (!any) return "full";
  return busyFor(room.id, date).length ? "part" : "free";
}
const REFUND_H = () => Number(S.config?.refundHours ?? 24);
const policyText = () => S.config?.cancelPolicy || `ביטול עד ${REFUND_H() === 48 ? "יומיים" : hrs(REFUND_H())} לפני מועד ההשכרה: החזר כספי מלא. ביטול מאוחר יותר: ללא החזר.`;
const slotStartMs = s => { const t = parseYmd(s.date), m = toMin(s.start); t.setHours(Math.floor(m / 60), m % 60, 0, 0); return t.getTime(); };
const cancelData = (s, by) => ({ status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: by, refund: refundFor(s), ...(s.status === "paid" && !s.paidAt ? { paidAt: s.createdAt || new Date().toISOString() } : {}) });
const refundFor = s => (slotStartMs(s) - Date.now()) >= REFUND_H() * 3600e3 ? "full" : "none";
const REP = { once: "פעם אחת", weekly: "כל שבוע", daily: "כל יום" };
// Every date of a repeating booking from `date` to `until`; ok = free dates, bad = taken/closed dates
// A pick's time ranges in minutes: one range normally, several when separate hours were marked
const rangesOf = p => p.ranges ? p.ranges.map(x => [toMin(x.start), toMin(x.end)]) : [[toMin(p.start), toMin(p.end)]];
const rangesStr = p => (p.ranges || [{ start: p.start, end: p.end }]).map(x => tr(x.start, x.end)).join(", ");
const whenP = (date, p, short) => p.ranges && p.ranges.length > 1 ? `${short ? heDate(date) : heDateY(date)}, ${rangesStr(p)}` : whenText(date, p.start, p.end, p.endDate, short);
function mergeHours(list) {
  const out = []; [...list].sort((a, b) => a - b).forEach(m => { const last = out[out.length - 1]; if (last && last[1] === m) last[1] = m + 60; else out.push([m, m + 60]); });
  return out.map(([a, b]) => ({ start: toHM(a), end: toHM(b) }));
}
function occurrences(b, r, p, date, mode, until) {
  const ok = [], bad = [], step = mode === "daily" ? 1 : 7, today = ymd(new Date());
  const last = mode === "once" ? date : until;
  for (let n = dayNum(date); n <= dayNum(last); n += step) {
    const d = ymdOf(n); if (d < today) continue;
    const sch = daySchedule(b, d);
    if (!sch) { if (mode === "daily") continue; bad.push(d); continue; }
    const good = rangesOf(p).every(([a, e]) => (p.kind === "fixed" || (a >= sch.from && e <= sch.to)) && a > nowCut(d) && fits(r, d, a, e));
    (good ? ok : bad).push(d);
  }
  return { ok, bad };
}
const shortDate = d => { const x = parseYmd(d); return `${DOWS[x.getDay()]} ${x.getDate()}.${x.getMonth() + 1}`; };
const SITE_URL = () => S.config?.siteUrl || (location.origin + location.pathname);
const depositOf = r => Number(r?.deposit || 0);
const depAmt = s => Number(s.deposit ?? depositOf(rById(s.roomId)?.r));
const slotEndMs = s => { const t = parseYmd(s.endDate || s.date), m = toMin(s.end); t.setHours(0, 0, 0, 0); return t.getTime() + m * 60000 + ((toMin(s.end) <= toMin(s.start) && !s.endDate) ? 864e5 : 0); };
const checkoutLink = (token, slotId) => SITE_URL() + "#checkout/" + token + "/" + slotId;
// Personal booking links saved on this device
const myTokens = () => { try { return JSON.parse(localStorage.getItem("myBookings") || "[]"); } catch (e) { return []; } };
const addToken = t => { try { const l = myTokens(); if (!l.includes(t)) { l.push(t); localStorage.setItem("myBookings", JSON.stringify(l.slice(-50))); } } catch (e) {} };
const ERR_TEXT = { clash: "מישהו הזמין את השעות האלה ממש עכשיו. חזרו ובחרו מועד אחר.", past_time: "המועד כבר עבר. בחרו מועד אחר.", missing_details: "נא למלא שם וטלפון.", missing_email: "נא למלא כתובת אימייל תקינה.", too_long: "ההזמנה ארוכה מהמותר לחדר הזה.", bad_time: "שעות לא תקינות.", option_not_found: "אפשרות ההשכרה השתנתה. רעננו את הדף ונסו שוב.", room_not_found: "החדר לא נמצא. רעננו את הדף." };
const DEFAULT_TIPS = "צלמו את החדר כמו שהשארתם אותו:\n• מבט כללי על החדר מכמה זוויות\n• הרצפה\n• המטבחון והכיור\n• השירותים\n• השולחנות והכיסאות במקומם\n• פחי האשפה ריקים";
const DEP_STATUS = { returned: "הפיקדון הוחזר", withheld: "הפיקדון לא הוחזר" };
async function shrinkImage(file) {
  try {
    const url = URL.createObjectURL(file), img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    return (await new Promise(r => c.toBlob(r, "image/jpeg", 0.82))) || file;
  } catch (e) { return file; }
}
const minPrice = room => { const p = (room.options || []).map(o => Number(o.price) || 0).filter(Boolean); return p.length ? Math.min(...p) : 0; };
// Resident (Kelahim) vs non-resident rate; listed prices are resident prices
try { S.resident = localStorage.getItem("resident") === "outside" ? "outside" : "local"; } catch (e) { S.resident = "local"; }
const outsidePct = () => Number(S.config?.outsidePct || 150);
const mult = () => S.resident === "outside" ? outsidePct() / 100 : 1;
const P = n => Math.round(Number(n || 0) * mult());
const RES = { local: "תושב/ת קלחים", outside: "תושב/ת חוץ" };
const resToggle = () => `<div class="seg res" role="group" aria-label="תעריף">${Object.entries(RES).map(([k, t]) => `<button type="button" data-res="${k}" aria-pressed="${S.resident === k}">${t}</button>`).join("")}</div>`;
const rateNote = () => S.resident === "outside" ? `<p class="small muted">המחירים כוללים מע״מ.</p>` : (S.config.priceNote ? `<p class="small muted">${esc(S.config.priceNote)}</p>` : "");
const priceOf = p => Math.round((p.kind === "hourly" ? Number(p.price) * p.hours : Number(p.price)) * mult());
const dateRange = r => { const t = new Date(); t.setHours(0, 0, 0, 0); const e = new Date(t); e.setDate(e.getDate() + Math.max(1, Number(r.maxAdvanceDays || 60)) - 1); return [ymd(t), ymd(e)]; };

// ---------- render ----------
function render() {
  $("#siteName").textContent = S.config?.siteName || "השכרת חדרים";
  const lu = photoUrl(S.config?.logoId), slot = $("#logoSlot");
  if (slot.dataset.id !== (lu || "")) { slot.dataset.id = lu || ""; slot.innerHTML = lu ? `<img src="${esc(lu)}" alt="">` : ""; }
  $("#logoIcon").style.display = lu ? "none" : "";
  $("#toAdmin").hidden = !S.isAdmin;
  $("#toAdmin").setAttribute("aria-current", S.view === "admin" ? "page" : "false");
  $("#toCal").setAttribute("aria-current", S.view === "calendar" ? "page" : "false");
  $("#bar").hidden = true;
  const app = $("#app");
  if (S.view === "login") return renderLogin(app);
  if (S.view === "admin") return renderAdmin(app);
  if (S.view === "checkout") return renderCheckout(app);
  if (S.view === "calendar") {
    if (!S.configLoaded) { app.innerHTML = `<div class="empty">טוען…</div>`; return; }
    app.innerHTML = `<div class="stack" style="gap:6px;margin-block:8px 18px"><span class="eyebrow">כל המבנים</span><h1>לוח השכרות</h1><p class="muted">מה תפוס ומתי, בכל החדרים. לחצו על יום כדי לראות את השעות.</p></div><div id="calBody"></div>`;
    return adminCalendar($("#calBody"), true);
  }
  if (!S.configLoaded) { app.innerHTML = `<div class="empty">${S.offline ? "הנתונים עדיין לא נטענו. ייתכן שיש בעיית חיבור – נסו לרענן בעוד רגע." : "טוען את החדרים והזמינות…"}</div>`; return; }
  if (S.loadError) return renderLoadError(app);
  const bs = (S.config.buildings || []).filter(b => (b.rooms || []).length);
  if (!bs.length) {
    app.innerHTML = `<div class="empty stack" style="align-items:center"><h2>עדיין לא הוגדרו חדרים</h2><p>${S.isAdmin ? "התחילו במסך הניהול: הוסיפו מבנים, חדרים, מחירים ושעות פעילות." : "החדרים יופיעו כאן ברגע שמנהל המבנים יגדיר אותם."}</p>${S.isAdmin ? `<button class="primary" id="goAdm">למסך הניהול</button>` : ""}</div>`;
    $("#goAdm")?.addEventListener("click", () => go("admin"));
    return;
  }
  if (!S.buildingId || !bById(S.buildingId)) S.buildingId = bs[0].id;
  if (S.step === 4) return renderDone(app);
  if (S.step >= 2 && !rById(S.roomId)) S.step = 1;
  let html = S.step === 1 ? myBookingsHtml() + step1(bs) : S.step === 2 ? step2() : step3();
  app.innerHTML = html;
  bindPublic(app);
  renderBar();
}

function roomCard(r) {
  return `<button class="room" data-room="${esc(r.id)}" aria-label="${esc(r.name)} – בדיקת זמינות">
    ${phHtml(r)}
    <div class="body">
      <h3>${esc(r.name)}</h3>
      ${r.description ? `<p class="small muted">${esc(r.description)}</p>` : ""}
      <div class="foot">${r.capacity ? `<span class="tag">${ICON.people}עד ${esc(r.capacity)} איש</span>` : "<span></span>"}${!(r.options || []).length ? `<span class="from">בתיאום מול המזכירות</span>` : ""}${minPrice(r) ? `<span class="from">החל מ־<b>${money(P(minPrice(r)))}</b>${(r.options || []).every(o => o.kind === "hourly" || !o.kind) ? "/שעה" : ""}</span>` : ""}</div>
    </div>
  </button>`;
}
function step1(bs) {
  const note = `<div class="stack" style="gap:6px;margin-top:6px"><span class="lbl">מחירים עבור</span>${resToggle()}${rateNote()}</div>`;
  return `<section class="hero"><span class="eyebrow">מבני הציבור של המושב</span><h1>איזה חדר תרצו להזמין?</h1><p>בוחרים חדר, רואים בלוח מתי הוא פנוי, ומזמינים בכמה לחיצות.</p>
    <button class="cal-cta" data-gocal><span class="cal-ico"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01" stroke-width="3"/></svg></span><span class="cal-txt"><b>לוח השכרות</b><span>מה תפוס ומתי, בכל החדרים</span></span><span class="cal-arrow" aria-hidden="true">←</span></button>${note}${S.config.example ? `<span class="demo-note">מוצגים נתוני דוגמה</span>` : ""}</section>
  ${bs.length > 1 ? `<nav class="jump" aria-label="קפיצה לאזור">${bs.map(x => `<button class="chip" data-jump="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</nav>` : ""}
  ${bs.map(b => `<section class="section" id="b-${esc(b.id)}">
    <div class="stack" style="gap:2px"><h2>${esc(b.name)}</h2>${b.address ? `<p class="tag">${ICON.pin}${esc(b.address)}</p>` : ""}</div>
    <div class="grid">${(b.rooms || []).map(roomCard).join("")}</div>
  </section>`).join("")}`;
}

function calendarHtml(b, r) {
  const [minD, maxD] = dateRange(r);
  if (!S.calYM) S.calYM = (S.date || minD).slice(0, 7);
  const [y, m] = S.calYM.split("-").map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), today = ymd(new Date());
  const prevOk = S.calYM > minD.slice(0, 7), nextOk = S.calYM < maxD.slice(0, 7);
  let cells = DOWS.map(d => `<div class="wd" aria-hidden="true">${d}</div>`).join("");
  let startDay = 1;
  if (S.calYM === minD.slice(0, 7)) { const md = parseYmd(minD).getDate(); startDay = Math.max(1, md - parseYmd(minD).getDay()); }
  const lead = startDay === 1 ? first.getDay() : 0;
  for (let i = 0; i < lead; i++) cells += "<div></div>";
  const lbl = { free: "פנוי", part: "פנוי חלקית", full: "תפוס", closed: "סגור" };
  for (let d = startDay; d <= days; d++) {
    const ds = ymd(new Date(y, m - 1, d));
    if (ds < minD || ds > maxD) { cells += `<button class="d" disabled aria-label="${heDate(ds)} – לא ניתן להזמין">${d}<span class="dot"></span></button>`; continue; }
    const st = dayStatus(b, r, ds);
    cells += `<button class="d ${st}${ds === today ? " today" : ""}" data-date="${ds}" aria-pressed="${ds === S.date}" aria-label="${heDate(ds)} – ${lbl[st]}">${d}<span class="dot"></span></button>`;
  }
  return `<div class="panel">
    <div class="cal-head"><button data-mon="-1" aria-label="החודש הקודם" ${prevOk ? "" : "disabled"}>›</button><h3>${MONTHS[m - 1]} ${y}</h3><button data-mon="1" aria-label="החודש הבא" ${nextOk ? "" : "disabled"}>‹</button></div>
    <div class="cal" role="group" aria-label="בחירת תאריך">${cells}</div>
    <div class="legend"><span><i style="background:var(--free)"></i>פנוי</span><span><i style="background:var(--part)"></i>פנוי חלקית</span><span><i style="background:var(--line2)"></i>תפוס / סגור</span></div>
  </div>`;
}

function dayPanelHtml(b, r) {
  if (!S.date) return `<div class="panel"><h3>בחרו תאריך בלוח</h3><p class="muted">הימים הירוקים פנויים. לחיצה על יום תראה בדיוק אילו שעות פנויות ומה המחיר.</p></div>`;
  const sch = daySchedule(b, S.date);
  if (!sch) return `<div class="panel"><h3>${heDate(S.date)}</h3><div class="notice">המבנה סגור ביום זה. בחרו יום אחר בלוח.</div></div>`;
  const span = sch.to - sch.from, pos = mm => ((mm - sch.from) / span * 100).toFixed(2);
  const busy = busyFor(r.id, S.date);
  const marks = []; for (let h = Math.floor(sch.from / 60) * 60 + 120; h <= sch.to - 60; h += span > 600 ? 180 : 120) marks.push(h);
  const tl = `<div class="tl" role="img" aria-label="${busy.length ? "תפוס: " + busy.map(x => toHM(x.a) + "–" + toHM(x.b)).join(", ") : "פנוי כל היום"}">${busy.map(x => `<div class="blk${x.s.uid && x.s.uid === S.me ? " mine" : ""}" style="right:${pos(Math.max(x.a, sch.from))}%;width:${(Math.min(x.b, sch.to) - Math.max(x.a, sch.from)) / span * 100}%">${x.s.uid && x.s.uid === S.me ? "שלך" : "תפוס"}</div>`).join("")}</div>
    <div class="tl-scale num" aria-hidden="true">${marks.map(mm => `<span style="right:${pos(mm)}%">${toHM(mm)}</span>`).join("")}</div>`;
  const opts = (r.options || []).map((o, i) => {
    const sel = S.sel && S.sel.opt === i;
    if (o.kind === "fixed") {
      const ok = fixedOk(r, S.date, o);
      return `<button class="opt${sel ? " sel" : ""}${ok ? "" : " na"}" data-fixed="${i}" ${ok ? "" : "disabled"} aria-pressed="${sel}">
        <span class="opt-top"><b>${esc(o.name)}</b><span class="price">${money(P(o.price))}</span></span>
        <span class="small muted num">${tr(toHM(toMin(o.start)), toHM(toMin(o.end)))}${ok ? "" : " · לא פנוי"}</span></button>`;
    }
    if (o.kind === "block") {
      const H = Number(o.hours || 24), starts = blockStarts(b, r, S.date, H), ok = starts.length > 0;
      let inner = "";
      if (sel) {
        const e = S.sel.start != null ? endOf(S.date, S.sel.start, H) : null;
        inner = `<div class="stack" style="gap:10px"><span class="lbl">מאיזו שעה מתחילים?</span>
          <div class="chips">${starts.map(mm => `<button class="chip" data-bstart="${mm}" aria-pressed="${mm === S.sel.start}">${toHM(mm)}</button>`).join("")}</div>
          <p class="small ${e ? "" : "muted"}">${e ? `עד ${e.endDate !== S.date ? heDate(e.endDate) + " ב־" : ""}<b class="num">${e.end}</b>` : `${hrs(H)} רצופות משעת ההתחלה`}</p></div>`;
      }
      return `<div class="opt${sel ? " sel" : ""}${ok ? "" : " na"}">
        <button class="opt-head" data-block="${i}" ${ok ? "" : "disabled"} aria-expanded="${sel}">
          <span class="opt-top"><b>${esc(o.name)}</b><span class="price">${money(P(o.price))}</span></span></button>
        <span class="small muted">${ok ? `${hrs(H)} רצופות · בוחרים שעת התחלה` : "לא פנוי ממועד זה"}</span>${inner}</div>`;
    }
    if (o.multi) {
      const sch2 = daySchedule(b, S.date), cut = nowCut(S.date), free = [];
      for (let m = sch2.from; m + 60 <= sch2.to; m += 60) if (m > cut && fits(r, S.date, m, m + 60)) free.push(m);
      const maxH = Number(o.maxHours || 24), chosen = sel ? S.sel.hours : [];
      const inner = sel ? `<div class="stack" style="gap:10px"><span class="lbl">סמנו את השעות שאתם צריכים (אפשר כמה)</span>
        <div class="chips hours">${free.map(m => `<button class="chip" data-mh="${m}" aria-pressed="${chosen.includes(m)}">${tr(toHM(m), toHM(m + 60))}</button>`).join("")}</div>
        <p class="small ${chosen.length ? "" : "muted"}">${chosen.length ? `נבחרו ${hrs(chosen.length)}: <span class="num">${rangesStr({ ranges: mergeHours(chosen) })}</span>` : `אפשר לסמן עד ${hrs(maxH)} באותו יום.`}</p></div>` : "";
      return `<div class="opt${sel ? " sel" : ""}${free.length ? "" : " na"}">
        <button class="opt-head" data-multi="${i}" ${free.length ? "" : "disabled"} aria-expanded="${sel}">
          <span class="opt-top"><b>${esc(o.name)}</b><span class="price">${money(P(o.price))} <span class="small muted" style="font-weight:400">לשעה</span></span></span></button>
        <span class="small muted">${free.length ? `${free.length} שעות פנויות · מסמנים כמה שרוצים` : "אין שעות פנויות ביום זה"}</span>${inner}</div>`;
    }
    const minH = Math.max(0.5, Number(o.minHours || 1)), maxH = Math.max(minH, Number(o.maxHours || minH));
    const anyStart = hourlyStarts(b, r, S.date, minH).length > 0;
    let inner = "";
    if (sel) {
      const durs = [minH]; for (let h = Math.floor(minH) + 1; h <= maxH + 1e-9; h += 1) durs.push(h);
      const starts = hourlyStarts(b, r, S.date, S.sel.hours);
      inner = `<div class="stack" style="gap:10px">
        <span class="lbl">כמה זמן?</span><div class="chips">${durs.map(h => `<button class="chip" data-dur="${h}" aria-pressed="${h === S.sel.hours}">${hrs(h)}</button>`).join("")}</div>
        <span class="lbl">מאיזו שעה?</span>${starts.length ? `<div class="chips">${starts.map(mm => `<button class="chip" data-start="${mm}" aria-pressed="${mm === S.sel.start}">${toHM(mm)}</button>`).join("")}</div>` : `<p class="small muted">אין זמן פנוי באורך הזה ביום זה. נסו משך קצר יותר או יום אחר.</p>`}
      </div>`;
    }
    return `<div class="opt${sel ? " sel" : ""}${anyStart ? "" : " na"}">
      <button class="opt-head" data-hourly="${i}" ${anyStart ? "" : "disabled"} aria-expanded="${sel}">
        <span class="opt-top"><b>${esc(o.name)}</b><span class="price">${money(P(o.price))} <span class="small muted" style="font-weight:400">לשעה</span></span></span></button>
      <span class="small muted">${anyStart ? `${hrs(minH)} עד ${hrs(maxH)} · בחרו שעה` : "אין שעות פנויות ביום זה"}</span>${inner}</div>`;
  }).join("");
  return `<div class="panel">
    <div><h3>${heDate(S.date)}</h3><p class="small muted num">${sch.motzash ? "מוצאי שבת · " : ""}פתוח ${tr(toHM(sch.from), toHM(sch.to))}${Number(r.bufferMin) ? ` · ${esc(r.bufferMin)} דק׳ הפרדה בין הזמנות` : ""}</p></div>
    ${tl}
    ${(r.options || []).length ? `<span class="lbl">בחרו אפשרות</span>
    <div class="stack" style="gap:10px">${opts}</div>` : contactBox(r, b)}
  </div>`;
}
// Rooms with no online price yet: show availability, book by phone/WhatsApp
function contactBox(r, b) {
  const ph = S.config.managerPhone, wa = waLink(ph, `שלום, אשמח להזמין את ${r.name} (${b.name}) ב${heDate(S.date)}. מה המחיר והשעות האפשריות?`);
  return `<div class="notice ok"><b>ההזמנה ב${esc(r.name)} בתיאום מול המזכירות.</b><br>אפשר לראות כאן מתי פנוי, ולתאם בטלפון או בוואטסאפ.</div>
    ${wa ? `<a class="btn primary big-btn" href="${esc(wa)}" target="_blank" rel="noopener">לתיאום בוואטסאפ</a>` : ""}
    ${ph ? `<p class="small muted">${esc(S.config.managerName || "מזכירות")} · <span class="num" dir="ltr">${esc(ph)}</span></p>` : ""}`;
}

function step2() {
  const { b, r } = rById(S.roomId);
  return `<div class="back"><button class="link" data-back="1">→ כל החדרים</button></div>
  <section class="roomhead">
    ${phHtml(r)}
    <div class="stack" style="gap:10px">
      <span class="eyebrow">${esc(b.name)}</span><h1>${esc(r.name)}</h1>
      ${r.description ? `<p class="muted">${esc(r.description)}</p>` : ""}
      <div class="row" style="gap:18px">${r.capacity ? `<span class="tag">${ICON.people}עד ${esc(r.capacity)} איש</span>` : ""}${b.address ? `<span class="tag">${ICON.pin}${esc(b.address)}</span>` : ""}</div>
      <div class="row small">${(r.options || []).map(o => `<span class="pill" style="background:var(--soft);color:var(--fg)">${esc(o.name)} · ${money(P(o.price))}${o.kind === "fixed" || o.kind === "block" ? "" : "/שעה"}</span>`).join("")}</div>
      ${Number(r.bufferMin) >= 60 ? `<p class="small muted">לא ניתן להשכיר ${Number(r.bufferMin) === 120 ? "שעתיים" : hrs(Number(r.bufferMin) / 60)} לפני ואחרי כל השכרה.</p>` : ""}
      ${(r.options || []).length ? `${resToggle()}${rateNote()}<p class="small muted">${esc(policyText())}</p>` : `<p class="small muted">ההזמנה בתיאום מול המזכירות.</p>`}
      ${depositOf(r) ? `<p class="small"><b>פיקדון ${money(depositOf(r))}</b> · מוחזר אחרי ההזדכות: בסיום מצלמים את המבנה נקי ומעלים את התמונות.</p>` : ""}
    </div>
  </section>
  <section class="split">${calendarHtml(b, r)}${dayPanelHtml(b, r)}</section>`;
}

function renderCheckout(app) {
  if (!S.coData || S.coData.token !== S.coToken) {
    app.innerHTML = `<div class="empty">טוען את ההזמנה…</div>`;
    if (!S.coLoading) { S.coLoading = true; api.getBookings([S.coToken]).then(list => { S.coData = { token: S.coToken, booking: list[0] || null }; if (list[0]) addToken(S.coToken); }).catch(() => { S.coData = { token: S.coToken, booking: null }; }).finally(() => { S.coLoading = false; render(); }); }
    return;
  }
  const bk = S.coData.booking, s = bk?.slots.find(x => x.id === S.coId) || bk?.slots.find(x => x.status !== "cancelled" && depAmt(x) > 0 && !x.checkout && slotStartMs(x) <= Date.now());
  if (!s) { app.innerHTML = `<section class="section narrow"><h1>הזדכות</h1><div class="notice">לא מצאנו את ההזמנה הזו. ייתכן שהקישור ישן או שההזמנה בוטלה. פנו למנהל המבנים.</div></section>`; return; }
  const rr = rById(s.roomId), r = rr?.r || {}, b = rr?.b || {}, dep = depAmt(s), co = s.checkout, minP = Number(S.config.minCheckoutPhotos || 3);
  if (!S.co || S.co.id !== s.id) S.co = { id: s.id, files: [], note: "" };
  const tips = r.checkoutTips || S.config.checkoutTips || DEFAULT_TIPS;
  const head = `<div class="stack" style="gap:6px"><span class="eyebrow">הזדכות על המבנה</span><h1>${esc(r.name || "")}</h1></div>
    <dl class="summary"><dt>מבנה</dt><dd>${esc(b.name || "")}</dd><dt>מתי</dt><dd class="num">${esc(whenText(s.date, s.start, s.end, s.endDate))}</dd>${dep ? `<dt>פיקדון</dt><dd class="price">${money(dep)}</dd>` : ""}</dl>`;
  if (co) {
    const photos = (co.photos || []).map(photoUrl).filter(Boolean);
    app.innerHTML = `<section class="section narrow">${head}
      <div class="notice ok"><b>ההזדכות התקבלה, תודה!</b> ${s.depositStatus === "returned" ? "הפיקדון הוחזר." : s.depositStatus === "withheld" ? "הפיקדון לא הוחזר. לפרטים פנו למנהל המבנים." : "מנהל המבנים יבדוק את התמונות ויחזיר את הפיקדון."}</div>
      ${co.via === "whatsapp" ? `<p class="small muted">התמונות נשלחו בוואטסאפ.</p>` : `<p class="small muted">נשלחו ${(co.photos || []).length} תמונות.</p>`}
    </section>`;
    return;
  }
  const n = S.co.files.length, mgr = S.config.managerPhone;
  const waMsg = `שלום${S.config.managerName ? " " + S.config.managerName : ""}, סיימתי את ההשכרה של ${r.name} (${b.name}) ב${whenText(s.date, s.start, s.end, s.endDate)}. מצרף/ת תמונות של המבנה נקי לצורך החזרת הפיקדון.`;
  app.innerHTML = `<section class="section narrow">${head}
    <p>כדי לקבל את הפיקדון בחזרה, צלמו את המבנה כמו שהשארתם אותו והעלו לפחות ${minP} תמונות.</p>
    <div class="stack" style="gap:8px"><h3>מה לצלם</h3><div class="rules">${esc(tips)}</div></div>
    ${S.canUpload ? `
      <div class="actions">
        <label class="btn primary big-btn" for="camIn" style="flex-direction:row;cursor:pointer">צילום תמונה<input type="file" id="camIn" accept="image/*" capture="environment" hidden></label>
        <label class="btn big-btn" for="galIn" style="flex-direction:row;cursor:pointer">בחירה מהגלריה<input type="file" id="galIn" accept="image/*" multiple hidden></label>
      </div>
      ${n ? `<div class="thumbs">${S.co.files.map((f, i) => `<div class="thumb"><img src="${esc(f.url)}" alt="תמונה ${i + 1}"><button data-rmph="${i}" aria-label="הסרת תמונה ${i + 1}">×</button></div>`).join("")}</div>` : `<div class="empty small">עדיין לא צולמו תמונות</div>`}
      <label for="coNote">הערות למנהל (לא חובה)<textarea id="coNote" rows="3" placeholder="למשל: נשבר כוס, החלפנו">${esc(S.co.note)}</textarea></label>
      <div id="coErr" class="notice bad" hidden></div>
      <button class="primary big-btn" id="coSend" ${n >= minP ? "" : "disabled"}>${n >= minP ? `שליחת ההזדכות (${n} תמונות)` : `צריך עוד ${minP - n} תמונות`}</button>`
    : `<div class="notice">מהחשבון הזה אי אפשר להעלות תמונות לאתר. צלמו את המבנה ושלחו את התמונות למנהל המבנים בוואטסאפ.</div>
      ${waLink(mgr, waMsg) ? `<a class="btn primary big-btn" href="${esc(waLink(mgr, waMsg))}" target="_blank" rel="noopener">פתיחת וואטסאפ למנהל</a>` : ""}
      ${mgr ? `<p class="small muted">מספר המנהל: <span class="num" dir="ltr">${esc(mgr)}</span></p>` : ""}
      <button class="big-btn" id="coWa">שלחתי את התמונות בוואטסאפ</button>`}
  </section>`;
  const addFiles = list => { for (const f of list) if (/^image\//.test(f.type) || !f.type) S.co.files.push({ file: f, url: URL.createObjectURL(f) }); rerender(); };
  $("#camIn")?.addEventListener("change", e => addFiles(e.target.files));
  $("#galIn")?.addEventListener("change", e => addFiles(e.target.files));
  $("#coNote")?.addEventListener("input", e => { S.co.note = e.target.value; });
  app.querySelectorAll("[data-rmph]").forEach(x => x.onclick = () => { const [f] = S.co.files.splice(Number(x.dataset.rmph), 1); URL.revokeObjectURL(f.url); rerender(); });
  $("#coSend")?.addEventListener("click", async () => {
    const btn = $("#coSend"), err = $("#coErr"), ids = []; btn.disabled = true; err.hidden = true;
    try {
      for (let i = 0; i < S.co.files.length; i++) { btn.textContent = `מעלה תמונה ${i + 1} מתוך ${S.co.files.length}…`; const blob = await shrinkImage(S.co.files[i].file); ids.push(await api.uploadCheckoutPhoto(S.coToken, blob)); }
      btn.textContent = "שומר…";
      await api.submitCheckout(S.coToken, s.id, ids, S.co.note.trim(), "upload");
      S.co.files.forEach(f => URL.revokeObjectURL(f.url)); S.co = null; S.coData = null; toast("ההזדכות נשלחה. תודה!"); render();
    } catch (e) {
      btn.disabled = false; btn.textContent = `שליחת ההזדכות (${S.co.files.length} תמונות)`;
      err.textContent = e?.code === "checkout_not_allowed" ? "אי אפשר לשלוח הזדכות על ההזמנה הזו (ייתכן שכבר נשלחה, או שההשכרה עוד לא התחילה)." : e?.code === "upload" ? "העלאת התמונות נכשלה. נסו שוב, או שלחו אותן למנהל בוואטסאפ." : "השליחה לא הצליחה. בדקו את החיבור ונסו שוב.";
      err.hidden = false;
    }
  });
  $("#coWa")?.addEventListener("click", async () => {
    try { await api.submitCheckout(S.coToken, s.id, [], "", "whatsapp"); S.coData = null; toast("תודה! המנהל יבדוק ויחזיר את הפיקדון."); render(); }
    catch (e) { toast("תודה! המנהל יעדכן אחרי שיראה את התמונות."); }
  });
}

function renderBar() {
  const bar = $("#bar");
  if (S.view !== "public" || S.step !== 2 || !S.pick) { bar.hidden = true; return; }
  const p = S.pick;
  bar.innerHTML = `<div class="in"><div class="sum"><div class="price">${money(priceOf(p))}</div><div class="num">${whenP(S.date, p, true)}</div><div class="num muted">${esc(p.name)}</div></div><button class="primary big-btn" id="toForm">המשך ←</button></div>`;
  bar.hidden = false;
  $("#toForm").onclick = () => { S.step = 3; render(); window.scrollTo({ top: 0 }); };
}

function step3() {
  const { b, r } = rById(S.roomId), p = S.pick, F = S.form;
  const rules = [S.config.generalRules, r.rules].filter(Boolean).join("\n\n");
  const canRepeat = p.kind !== "block", [, maxD] = dateRange(r);
  S.rep ||= { mode: "once", until: "" };
  if (!canRepeat) S.rep.mode = "once";
  if (!S.rep.until || S.rep.until <= S.date || S.rep.until > maxD) { const e = parseYmd(S.date); e.setMonth(e.getMonth() + 1); e.setDate(0); S.rep.until = ymd(e) > S.date ? (ymd(e) > maxD ? maxD : ymd(e)) : (ymdOf(Math.min(dayNum(S.date) + 28, dayNum(maxD)))); }
  const occ = occurrences(b, r, p, S.date, S.rep.mode, S.rep.until), n = occ.ok.length, total = priceOf(p) * n;
  S.occ = occ;
  return `<div class="back"><button class="link" data-back="2">→ חזרה לבחירת מועד</button></div>
  <section class="section narrow">
    <div class="stack" style="gap:6px"><span class="eyebrow">שלב אחרון</span><h1>הפרטים שלכם</h1></div>
    <dl class="summary"><dt>חדר</dt><dd>${esc(r.name)} · ${esc(b.name)}</dd><dt>${n > 1 ? "החל מ־" : "מתי"}</dt><dd class="num">${whenP(S.date, p)}</dd><dt>אפשרות</dt><dd>${esc(p.name)}${p.ranges && p.ranges.length > 1 ? ` · ${hrs(p.hours)}` : ""}</dd><dt>תעריף</dt><dd>${RES[S.resident]}</dd>
      ${n > 1 ? `<dt>חזרה</dt><dd>${REP[S.rep.mode]} עד ${esc(heDate(S.rep.until))} · ${n} מועדים</dd>` : ""}${depositOf(r) ? `<dt>פיקדון</dt><dd>${money(depositOf(r))} <span class="small muted" style="font-weight:400">(מוחזר אחרי הזדכות)</span></dd>` : ""}<dt>${n > 1 ? "סה״כ" : "מחיר"}</dt><dd class="price">${money(total)}${n > 1 ? ` <span class="small muted" style="font-weight:400">(${money(priceOf(p))} × ${n})</span>` : ""}</dd></dl>
    <div class="stack" style="gap:10px"><h3>תעריף</h3>${resToggle()}</div>
    ${canRepeat ? `<div class="stack" style="gap:10px">
      <h3>הזמנה חוזרת</h3><p class="small muted" style="margin-top:-6px">לחוג קבוע או להשכרה לכל החודש: אותן שעות, שוב ושוב.</p>
      <div class="seg" role="group" aria-label="חזרה">${Object.entries(REP).map(([k, t]) => `<button type="button" data-rep="${k}" aria-pressed="${S.rep.mode === k}">${t}</button>`).join("")}</div>
      ${S.rep.mode !== "once" ? `<label for="repUntil">עד תאריך<input id="repUntil" type="date" min="${ymdOf(dayNum(S.date) + 1)}" max="${maxD}" value="${esc(S.rep.until)}"></label>
        <div class="notice ${occ.bad.length ? "" : "ok"} small"><b>${n} מועדים פנויים</b>${S.rep.mode === "daily" ? " (בימי הפעילות של המבנה)" : ""}: ${occ.ok.map(shortDate).join(", ")}
        ${occ.bad.length ? `<br><b>לא פנויים ולא ייכללו:</b> ${occ.bad.map(shortDate).join(", ")}` : ""}</div>` : ""}
    </div>` : ""}
    <form id="bookForm" class="stack" novalidate>
      <label for="fName">שם מלא<input id="fName" autocomplete="name" required value="${esc(F.name)}"></label>
      <label for="fPhone">טלפון נייד<input id="fPhone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(F.phone)}" placeholder="050-0000000" dir="ltr" style="text-align:right"></label>
      <div class="form2">
        <label for="fEmail">אימייל (לאישור ההזמנה)<input id="fEmail" type="email" autocomplete="email" required value="${esc(F.email)}" dir="ltr" style="text-align:right"></label>
        <label for="fPeople">כמה משתתפים<input id="fPeople" type="number" min="1" inputmode="numeric" value="${esc(F.people)}"></label>
      </div>
      <label for="fPurpose">לאיזו מטרה?<input id="fPurpose" value="${esc(F.purpose)}" placeholder="יום הולדת, חוג, אסיפה…"></label>
      ${rules ? `<div class="stack" style="gap:8px"><h3>נהלי השימוש</h3><div class="rules">${esc(rules)}</div></div>` : ""}
      <div class="stack" style="gap:8px"><h3>תנאי ביטול</h3><div class="rules">${esc(policyText())}</div></div>
      <label class="inline" for="fAgree"><input type="checkbox" id="fAgree" ${F.agree ? "checked" : ""}> קראתי את הנהלים ואת תנאי הביטול ואני מסכים/ה להם</label>
      <div id="formErr" class="notice bad" hidden></div>
      <button class="primary big-btn" type="submit" id="bookBtn" ${n ? "" : "disabled"}>${n > 1 ? `אישור ${n} הזמנות · ${money(total)}` : `אישור ההזמנה · ${money(total)}`}</button>
    </form>
  </section>`;
}

function renderDone(app) {
  const d = S.done, rr = rById(d.roomId) || { b: {}, r: {} }, { b, r } = rr;
  const pay = safeUrl(r.payLink);
  const rules = [S.config.generalRules, r.rules].filter(Boolean).join("\n\n");
  const cal = gcalLink(`השכרת ${r.name}`, d, `${r.name} · ${b.name}\n${d.optionName} · ${money(d.price)}\n\nנהלים:\n${rules}`, `${b.name}${b.address ? ", " + b.address : ""}`);
  const many = (d.dates || []).length > 1, repLine = many ? `\n${REP[d.repeat]} עד ${heDate(d.until)} (${d.dates.length} מועדים: ${d.dates.map(shortDate).join(", ")})` : "";
  const msg = `שלום${S.config.managerName ? " " + S.config.managerName : ""}, ${d.request ? "אני מבקש/ת להזמין" : "הזמנתי"} את ${r.name} (${b.name})\n${whenP(d.date, d)}${repLine}\n${d.optionName} – ${money(d.total ?? d.price)}\nשם: ${d.name}\nטלפון: ${d.phone}\nתעריף: ${RES[d.residency || "local"]}${d.purpose ? "\nמטרה: " + d.purpose : ""}${d.people ? "\nמשתתפים: " + d.people : ""}`;
  const wa = waLink(S.config.managerPhone, msg);
  app.innerHTML = `<section class="section narrow" style="margin-top:10px">
    ${d.request ? "" : `<div class="done-mark">${ICON.check}</div>`}
    <div class="stack" style="gap:6px"><h1>${d.request ? "עוד צעד אחד: שליחת הבקשה" : "החדר שוריין עבורכם"}</h1>
      <p class="muted">${d.request ? "החשבון שלכם יכול לראות את הזמינות אבל לא לשמור הזמנה ישירות. שלחו את הבקשה למנהל המבנים, והוא ישריין לכם את החדר." : "ההזמנה תאושר סופית אחרי התשלום."}</p></div>
    <dl class="summary"><dt>חדר</dt><dd>${esc(r.name)} · ${esc(b.name)}</dd><dt>מתי</dt><dd class="num">${esc(whenP(d.date, d))}</dd><dt>אפשרות</dt><dd>${esc(d.optionName)}</dd>${many ? `<dt>חזרה</dt><dd>${REP[d.repeat]} · ${d.dates.length} מועדים עד ${esc(heDate(d.until))}</dd>` : ""}<dt>לתשלום</dt><dd class="price">${money(d.total ?? d.price)}</dd>${d.deposit ? `<dt>פיקדון</dt><dd>${money(d.deposit)} <span class="small muted" style="font-weight:400">(מוחזר אחרי הזדכות)</span></dd>` : ""}${b.address ? `<dt>כתובת</dt><dd>${esc(b.address)}</dd>` : ""}</dl>
    <div class="actions">
      ${d.request && wa ? `<a class="btn primary big-btn" href="${esc(wa)}" target="_blank" rel="noopener">שליחת הבקשה בוואטסאפ</a>` : ""}
      ${pay ? `<a class="btn ${d.request ? "" : "primary"} big-btn" href="${esc(pay)}" target="_blank" rel="noopener">תשלום ${money((d.total ?? d.price) + Number(d.deposit || 0))}${d.deposit ? " (כולל פיקדון)" : ""}</a>` : ""}
      <a class="btn big-btn" href="${esc(cal)}" target="_blank" rel="noopener">הוספה ליומן עם תזכורת</a>
      ${!d.request && wa ? `<a class="btn big-btn" href="${esc(wa)}" target="_blank" rel="noopener">עדכון המנהל בוואטסאפ</a>` : ""}
      <button class="big-btn" id="copyDetails">העתקת הפרטים</button>
    </div>
    ${!pay ? `<p class="small muted">קישור לתשלום יישלח אליכם ממנהל המבנים.</p>` : ""}
    ${S.config.managerPhone ? `<p class="small muted">לשאלות: ${esc(S.config.managerName || "מנהל המבנים")} · <span class="num" dir="ltr">${esc(S.config.managerPhone)}</span></p>` : ""}
    ${rules ? `<div class="stack" style="gap:8px"><h3>נהלי השימוש</h3><div class="rules">${esc(rules)}</div></div>` : ""}
    <div class="stack" style="gap:8px"><h3>תנאי ביטול</h3><div class="rules">${esc(policyText())}</div></div>
    ${d.deposit && !d.request ? `<div class="notice ok"><b>החזרת הפיקדון:</b> בסיום ההשכרה היכנסו ל״ההזמנות שלי״ ולחצו ״הזדכות״, או השתמשו בקישור שתקבלו מהמנהל. מצלמים את המבנה נקי, מעלים את התמונות, והפיקדון מוחזר אחרי בדיקה.</div>` : ""}
    ${d.token ? `<div class="stack" style="gap:8px"><h3>הקישור האישי להזמנה</h3><p class="small muted">דרכו אפשר לבטל, ובסיום לבצע הזדכות, גם מטלפון אחר. כדאי לשמור אותו.</p>
      <div class="row"><input id="myLink" readonly dir="ltr" value="${esc(SITE_URL() + "#my/" + d.token)}" style="flex:1"><button id="copyMy">העתקה</button></div></div>` : ""}
    <div><button class="link" id="again">← הזמנה נוספת</button></div>
  </section>`;
  $("#copyDetails").onclick = () => navigator.clipboard.writeText(msg + "\n\nנהלים:\n" + rules + "\n\nתנאי ביטול: " + policyText() + (pay ? "\n\nתשלום: " + pay : "")).then(() => toast("הפרטים הועתקו"), () => toast("לא ניתן להעתיק אוטומטית"));
  $("#copyMy")?.addEventListener("click", () => { const i = $("#myLink"); navigator.clipboard.writeText(i.value).then(() => toast("הקישור הועתק"), () => { i.select(); toast("סמנו והעתיקו את הקישור"); }); });
  $("#again").onclick = () => { S.step = 1; S.done = null; S.pick = null; S.sel = null; S.rep = null; render(); };
}

function myBookingsHtml() {
  const now = Date.now(), list = S.myBookings || [];
  const groups = list.map(x => ({ x, slots: x.slots.filter(sl => sl.status !== "cancelled" && slotStartMs(sl) > now).sort((a, b) => slotStartMs(a) - slotStartMs(b)) }))
    .filter(g => g.slots.length).sort((a, b) => slotStartMs(a.slots[0]) - slotStartMs(b.slots[0]));
  const toCheckout = list.flatMap(x => x.slots.filter(sl => sl.status !== "cancelled" && depAmt(sl) > 0 && !sl.checkout && !sl.depositStatus && slotStartMs(sl) <= now && slotEndMs(sl) > now - 14 * 864e5).map(sl => ({ sl, token: x.token })));
  const coHtml = toCheckout.length ? `<section class="section"><h2>הזדכות והחזר פיקדון</h2>${toCheckout.map(({ sl, token }) => `<div class="mine-card"><div><b>${esc(rById(sl.roomId)?.r.name || "")}</b><p class="small muted num">${esc(whenText(sl.date, sl.start, sl.end, sl.endDate))} · פיקדון ${money(depAmt(sl))}</p></div><button class="primary" data-gocheckout="${esc(token)}/${esc(sl.id)}">הזדכות</button></div>`).join("")}</section>` : "";
  if (!groups.length) return coHtml;
  return coHtml + `<section class="section"><h2>ההזמנות שלי</h2><p class="small muted" style="margin-top:-8px">${esc(policyText())}</p>${groups.map(({ x, slots }) => { const rr = rById(x.roomId), pay = safeUrl(rr?.r.payLink), first = slots[0], many = slots.length > 1;
    const unpaid = slots.some(sl => sl.status === "pending"), full = slots.filter(sl => refundFor(sl) === "full").length;
    return `<div class="mine-card"><div style="min-width:0"><b>${esc(rr?.r.name || "")}</b> <span class="pill ${unpaid ? "pending" : "paid"}">${unpaid ? STATUS.pending : STATUS.paid}</span>
        <p class="small muted num">${x.repeat ? `${REP[x.repeat]} · ${new Set(slots.map(z => z.date)).size} מועדים קרובים · הבא: ` : ""}${x.ranges && x.ranges.length > 1 ? esc(whenP(first.date, x)) : esc(whenText(first.date, first.start, first.end, first.endDate))}</p></div>
      <div class="row">${pay && unpaid ? `<a class="btn primary" href="${esc(pay)}" target="_blank" rel="noopener">לתשלום</a>` : ""}
        <button class="danger" data-cancel-mine="${esc(x.token)}" data-refund="${many ? `החזר מלא על ${full} מתוך ${slots.length}` : (full ? "החזר מלא" : "ללא החזר")}">${many ? "ביטול הסדרה" : "ביטול"}</button></div></div>`; }).join("")}</section>`;
}
async function refreshMine() {
  const t = myTokens(); if (!t.length) { S.myBookings = []; return; }
  try { S.myBookings = await api.getBookings(t); } catch (e) {}
}

function bindPublic(app) {
  app.querySelectorAll("[data-jump]").forEach(x => x.onclick = () => document.getElementById("b-" + x.dataset.jump)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  app.querySelectorAll("[data-room]").forEach(x => x.onclick = () => {
    S.roomId = x.dataset.room; S.step = 2; S.sel = null; S.pick = null; S.calYM = null;
    const { b, r } = rById(S.roomId); const [minD, maxD] = dateRange(r);
    S.date = null; for (let d = parseYmd(minD); ymd(d) <= maxD; d.setDate(d.getDate() + 1)) { const s = dayStatus(b, r, ymd(d)); if (s === "free" || s === "part") { S.date = ymd(d); break; } }
    render(); window.scrollTo({ top: 0 });
  });
  app.querySelectorAll("[data-back]").forEach(x => x.onclick = () => { S.step = Number(x.dataset.back); render(); window.scrollTo({ top: 0 }); });
  app.querySelectorAll("[data-mon]").forEach(x => x.onclick = () => { const [y, m] = S.calYM.split("-").map(Number); const d = new Date(y, m - 1 + Number(x.dataset.mon), 1); S.calYM = ymd(d).slice(0, 7); render(); });
  app.querySelectorAll("[data-date]").forEach(x => x.onclick = () => { S.date = x.dataset.date; S.sel = null; S.pick = null; render(); document.querySelector(`[data-date="${S.date}"]`)?.focus(); });
  const opts = () => rById(S.roomId).r.options;
  app.querySelectorAll("[data-fixed]").forEach(x => x.onclick = () => {
    const i = Number(x.dataset.fixed), o = opts()[i];
    S.sel = { opt: i }; S.pick = { kind: "fixed", optionId: o.id, name: o.name, start: toHM(toMin(o.start)), end: toHM(toMin(o.end)), price: o.price }; render();
  });
  app.querySelectorAll("[data-hourly]").forEach(x => x.onclick = () => {
    const i = Number(x.dataset.hourly), o = opts()[i];
    if (S.sel && S.sel.opt === i) { S.sel = null; S.pick = null; } else { S.sel = { opt: i, hours: Math.max(0.5, Number(o.minHours || 1)), start: null }; S.pick = null; }
    render();
  });
  app.querySelectorAll("[data-block]").forEach(x => x.onclick = () => {
    const i = Number(x.dataset.block);
    if (S.sel && S.sel.opt === i) { S.sel = null; S.pick = null; } else { S.sel = { opt: i, start: null }; S.pick = null; }
    render();
  });
  app.querySelectorAll("[data-bstart]").forEach(x => x.onclick = () => {
    const o = opts()[S.sel.opt], H = Number(o.hours || 24), m = Number(x.dataset.bstart), e = endOf(S.date, m, H);
    S.sel.start = m;
    S.pick = { kind: "block", optionId: o.id, name: o.name, hours: H, start: toHM(m), end: e.end, endDate: e.endDate !== S.date ? e.endDate : undefined, price: o.price };
    render(); document.querySelector(`[data-bstart="${m}"]`)?.focus();
  });
  app.querySelectorAll("[data-multi]").forEach(x => x.onclick = () => {
    const i = Number(x.dataset.multi);
    if (S.sel && S.sel.opt === i) { S.sel = null; S.pick = null; } else { S.sel = { opt: i, multi: true, hours: [] }; S.pick = null; }
    render();
  });
  app.querySelectorAll("[data-mh]").forEach(x => x.onclick = () => {
    const o = opts()[S.sel.opt], m = Number(x.dataset.mh), maxH = Number(o.maxHours || 24), h = S.sel.hours;
    if (h.includes(m)) h.splice(h.indexOf(m), 1); else if (h.length < maxH) h.push(m); else { toast(`אפשר לסמן עד ${hrs(maxH)}`); return; }
    const ranges = mergeHours(h);
    S.pick = h.length ? { kind: "hourly", optionId: o.id, name: o.name, hours: h.length, start: ranges[0].start, end: ranges[ranges.length - 1].end, ranges, price: o.price } : null;
    const y = window.scrollY; render(); window.scrollTo({ top: y }); document.querySelector(`[data-mh="${m}"]`)?.focus({ preventScroll: true });
  });
  const setHourlyPick = () => { const o = opts()[S.sel.opt]; S.pick = S.sel.start == null ? null : { kind: "hourly", optionId: o.id, name: o.name, hours: S.sel.hours, start: toHM(S.sel.start), end: toHM(S.sel.start + S.sel.hours * 60), price: o.price }; };
  app.querySelectorAll("[data-dur]").forEach(x => x.onclick = () => {
    S.sel.hours = Number(x.dataset.dur);
    const { b, r } = rById(S.roomId); if (S.sel.start != null && !hourlyStarts(b, r, S.date, S.sel.hours).includes(S.sel.start)) S.sel.start = null;
    setHourlyPick(); render(); document.querySelector(`[data-dur="${S.sel.hours}"]`)?.focus();
  });
  app.querySelectorAll("[data-start]").forEach(x => x.onclick = () => { S.sel.start = Number(x.dataset.start); setHourlyPick(); render(); document.querySelector(`[data-start="${S.sel.start}"]`)?.focus(); });
  const f = app.querySelector("#bookForm");
  if (f) {
    const sync = () => Object.assign(S.form, { name: $("#fName").value.trim(), phone: $("#fPhone").value.trim(), email: $("#fEmail").value.trim(), people: $("#fPeople").value, purpose: $("#fPurpose").value.trim(), agree: $("#fAgree").checked });
    f.addEventListener("input", sync); f.addEventListener("change", sync);
    f.addEventListener("submit", e => { e.preventDefault(); sync(); submitBooking(); });
  }
  app.querySelectorAll("[data-cancel-mine]").forEach(btn => btn.onclick = async () => {
    if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = `לאשר ביטול? (${btn.dataset.refund})`; return; }
    btn.disabled = true;
    try { const r = await api.cancelMine(btn.dataset.cancelMine); toast(r.cancelled > 1 ? `${r.cancelled} מועדים בוטלו` : "ההזמנה בוטלה"); await Promise.all([refreshMine(), refreshSlots()]); render(); }
    catch (e) { toast("הביטול לא הצליח. פנו למנהל המבנים."); btn.disabled = false; }
  });
  app.querySelectorAll("[data-res]").forEach(x => x.onclick = () => { S.resident = x.dataset.res; try { localStorage.setItem("resident", S.resident); } catch (e) {} rerender(); });
  app.querySelectorAll("[data-gocal]").forEach(x => x.onclick = () => go("calendar"));
  app.querySelectorAll("[data-gocheckout]").forEach(x => x.onclick = () => { const [t, id] = x.dataset.gocheckout.split("/"); S.coToken = t; S.coId = id; S.coData = null; go("checkout"); });
  app.querySelectorAll("[data-rep]").forEach(x => x.onclick = () => { S.rep.mode = x.dataset.rep; rerender(); });
  app.querySelector("#repUntil")?.addEventListener("change", e => { if (e.target.value) { S.rep.until = e.target.value; rerender(); } });
}

async function submitBooking() {
  const F = S.form, err = $("#formErr"), btn = $("#bookBtn"), label = btn.textContent;
  const problems = [];
  if (F.name.length < 2) problems.push("נא למלא שם מלא");
  if (String(F.phone).replace(/\D/g, "").length < 9) problems.push("נא למלא מספר טלפון תקין");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(F.email)) problems.push("נא למלא כתובת אימייל תקינה");
  if (!F.agree) problems.push("יש לאשר את הנהלים ואת תנאי הביטול");
  if (!S.occ || !S.occ.ok.length) problems.push("אין מועד פנוי להזמנה");
  if (problems.length) { err.textContent = problems.join(" · "); err.hidden = false; return; }
  err.hidden = true; btn.disabled = true; btn.textContent = "שומר…";
  const { r } = rById(S.roomId), p = S.pick;
  const base = { roomId: r.id, date: S.date, start: p.start, end: p.end, optionId: p.optionId, optionName: p.name, price: priceOf(p) };
  if (p.endDate) base.endDate = p.endDate;
  if (depositOf(r)) base.deposit = depositOf(r);
  const dates = S.occ.ok, many = dates.length > 1, ranges = p.ranges || [{ start: p.start, end: p.end }];
  base.date = dates[0];
  const details = { ...base, name: F.name, phone: F.phone, email: F.email, purpose: F.purpose, people: F.people, residency: S.resident, total: base.price * dates.length, ...(p.ranges ? { ranges: p.ranges, hours: p.hours } : {}), ...(many ? { dates, repeat: S.rep.mode, until: S.rep.until } : {}) };
  const items = []; dates.forEach(d => ranges.forEach(x => { const crosses = p.endDate && ranges.length === 1; items.push({ date: d, start: x.start, end: x.end, ...(crosses ? { end_date: ymdOf(dayNum(d) + dayNum(p.endDate) - dayNum(S.date)) } : {}) }); }));
  try {
    const res = await api.createBooking({ room_id: r.id, option_id: p.optionId, residency: S.resident, name: F.name, phone: F.phone, email: F.email, purpose: F.purpose, people: F.people,
      repeat: many ? S.rep.mode : null, until: many ? S.rep.until : null, ranges: p.ranges || null, items });
    addToken(res.token);
    S.done = { ...details, id: res.id, token: res.token, total: res.total }; S.step = 4; S.form.agree = false; S.pick = null; S.sel = null; S.rep = null;
    refreshSlots(); refreshMine(); render(); window.scrollTo({ top: 0 });
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    err.textContent = ERR_TEXT[e?.code] || "השמירה לא הצליחה. בדקו את החיבור ונסו שוב."; err.hidden = false;
    if (e?.code === "clash") refreshSlots().then(() => {});
  }
}

// ---------- admin ----------
function renderAdmin(app) {
  if (!S.isAdmin) { S.view = "login"; return render(); }
  if (!S.configLoaded) { app.innerHTML = `<div class="empty">טוען…</div>`; return; }
  if (!S.draft) S.draft = JSON.parse(JSON.stringify(S.config || blankConfig()));
  const tabs = [["calendar", "לוח"], ["bookings", "הזמנות"], ["report", "דוח תשלומים"], ["rooms", "חדרים ומחירים"], ["general", "כללי ונהלים"]];
  app.innerHTML = `<div class="stack" style="gap:6px;margin-block:8px 18px"><div class="row" style="justify-content:space-between"><span class="eyebrow">ניהול</span><button class="link small" id="logout">יציאה</button></div><h1>${{ calendar: "לוח השכרות", bookings: "הזמנות ותזכורות", report: "הזמנות מול תשלום בפועל" }[S.adminTab] || "הגדרות"}</h1></div>
    <div class="seg atabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${S.adminTab === k}" data-tab="${k}">${t}</button>`).join("")}</div><div id="adminBody"></div>`;
  app.querySelectorAll("[data-tab]").forEach(x => x.onclick = () => { S.adminTab = x.dataset.tab; render(); });
  $("#logout").onclick = async () => { await api.signOut(); S.isAdmin = false; await refreshSlots(); go("public"); };
  const body = $("#adminBody"); S.rowSeq = 0;
  if (S.adminTab === "report") adminReport(body); else if (S.adminTab === "calendar") adminCalendar(body); else if (S.adminTab === "bookings") adminBookings(body); else if (S.adminTab === "rooms") adminRooms(body); else adminGeneral(body);
  if (S.adminTab === "rooms" || S.adminTab === "general") renderSaveBar();
}

function loadDetail(s) { if (s.booking) S.details[s.id] = s.booking; }
function reminderText(s, det) {
  const rr = rById(s.roomId), r = rr?.r || {}, b = rr?.b || {}, pay = safeUrl(r.payLink);
  return `שלום ${det.name || ""}, תזכורת: הזמנת את ${r.name} (${b.name}${b.address ? ", " + b.address : ""})\n${whenText(s.date, s.start, s.end, s.endDate)}.\n${s.status === "pending" && pay ? "טרם התקבל תשלום – לתשלום: " + pay + "\n" : ""}\nנהלים:\n${[S.config.generalRules, r.rules].filter(Boolean).join("\n")}\n\nתנאי ביטול: ${policyText()}\n\nתודה, ${S.config.managerName || "מנהל המבנים"}`;
}

function bookingRow(s) {
  const k = S.rowSeq = (S.rowSeq || 0) + 1, editing = S.editSlot === s.id && S.editKey === k;
  const det = S.details[s.id] || {}, rr = rById(s.roomId), wl = waLink(det.phone, reminderText(s, det));
  const owesRefund = s.status === "cancelled" && s.paidAt && s.refund === "full" && !s.refundedAt;
  const ended = slotEndMs(s) <= Date.now(), dep = s.status !== "cancelled" ? depAmt(s) : 0, co = s.checkout, photos = (co?.photos || []).map(photoUrl).filter(Boolean);
  const depPill = dep ? (s.depositStatus === "returned" ? `<span class="pill paid">פיקדון הוחזר</span>` : s.depositStatus === "withheld" ? `<span class="pill cancelled">פיקדון לא הוחזר</span>` : co ? `<span class="pill pending">הזדכות לבדיקה</span>` : `<span class="pill" style="background:var(--soft);color:var(--fg)">פיקדון ${money(dep)}</span>`) : "";
  const coWa = dep && !co && s.token ? waLink(det.phone, `שלום ${det.name || ""}, תודה שהשכרת את ${rr?.r.name || ""}. כדי לקבל את הפיקדון בחזרה, צלם/י את המבנה נקי והעלה/י את התמונות כאן:\n${checkoutLink(s.token, s.id)}`) : "";
  return `<div class="bk"><div class="t">${tr(esc(s.start), esc(s.end))}${s.endDate && s.endDate !== s.date ? `<div class="small muted" style="font-weight:400">עד ${esc(heDate(s.endDate))}</div>` : ""}${S.adminTab === "bookings" && s.status === "cancelled" ? `<div class="small muted" style="font-weight:400">${esc(heDate(s.date))}</div>` : ""}</div>
    <div style="min-width:0"><div class="row" style="gap:6px"><b>${esc(rr?.r.name || "חדר שנמחק")}</b><span class="pill ${s.status}">${STATUS[s.status]}</span>${s.detailId && s.series ? `<span class="pill" style="background:var(--soft);color:var(--fg)">חוזר</span>` : ""}${s.reminded && s.status !== "cancelled" ? `<span class="pill paid">${s.reminderVia === "whatsapp" ? "תזכורת נשלחה אוטומטית" : "נשלחה תזכורת"}</span>` : ""}${s.reminderVia === "whatsapp_failed" && s.status !== "cancelled" ? `<span class="pill pending" title="${esc(s.reminderError || "")}">התזכורת האוטומטית נכשלה</span>` : ""}${owesRefund ? `<span class="pill pending">להחזיר ${money(s.price)}</span>` : ""}${s.refundedAt ? `<span class="pill cancelled">הוחזר</span>` : ""}${s.status === "cancelled" && s.paidAt && s.refund === "none" ? `<span class="pill cancelled">ללא החזר</span>` : ""}${depPill}</div>
      <div class="small">${det.residency === "outside" ? `<span class="pill" style="background:var(--sun-soft);color:var(--sun-text)">תושב חוץ</span> ` : ""}${det.name ? esc(det.name) + " · " : ""}<span class="num" dir="ltr">${esc(det.phone || "")}</span>${det.purpose ? " · " + esc(det.purpose) : ""}${det.people ? " · " + esc(det.people) + " משתתפים" : ""}</div>
      <div class="small muted">${esc(s.optionName || "")} · ${money(s.price)}${s.source === "manual" ? " · הוזן ידנית" : ""}</div>
      ${co ? `<div class="small">${co.via === "whatsapp" ? "השוכר דיווח שהתמונות נשלחו בוואטסאפ." : `הזדכות עם ${(co.photos || []).length} תמונות`}${co.note ? ` · הערה: ${esc(co.note)}` : ""}</div>` : ""}
      ${co && S.openPhotos?.[s.id] && photos.length ? `<div class="thumbs" style="margin-top:8px">${photos.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="תמונת הזדכות" loading="lazy"></a>`).join("")}</div>` : ""}</div>
    <div class="acts">${s.status === "pending" ? `<button data-paid="${esc(s.id)}">סימון שולם</button>` : ""}
      ${owesRefund ? `<button data-refunded="${esc(s.id)}">סימון הוחזר</button>` : ""}
      ${s.status !== "cancelled" && !ended && wl ? `<a class="btn" href="${esc(wl)}" target="_blank" rel="noopener" data-remind="${esc(s.id)}">תזכורת</a>` : ""}
      <button data-edit="${esc(s.id)}" data-key="${k}" aria-expanded="${editing}">${editing ? "סגירת עריכה" : "עריכה"}</button>
      ${s.status !== "cancelled" ? `<button class="danger" data-cancel="${esc(s.id)}" data-refund="${refundFor(s) === "full" ? "החזר מלא" : "ללא החזר"}">ביטול</button>` : ""}
      ${coWa ? `<a class="btn" href="${esc(coWa)}" target="_blank" rel="noopener">קישור הזדכות</a>` : ""}
      ${dep && !co && s.token ? `<button data-copyco="${esc(checkoutLink(s.token, s.id))}">העתקת קישור</button>` : ""}
      ${(co?.photos || []).length ? `<button data-photos="${esc(s.id)}">${S.openPhotos?.[s.id] ? "הסתרת תמונות" : `תמונות (${co.photos.length})`}</button>` : ""}
      ${dep && co && !s.depositStatus || s.depositStatus === "review" ? `<button class="primary" data-depret="${esc(s.id)}">החזרת פיקדון</button><button class="danger" data-depkeep="${esc(s.id)}">עיכוב פיקדון</button>` : ""}
      ${s.status !== "cancelled" && s.series ? `<button class="danger" data-cancel-series="${esc(s.detailId)}">ביטול הסדרה</button>` : ""}
      <button class="danger" data-del="${esc(s.id)}">מחיקה</button></div></div>${editing ? editForm(s, det) : ""}`;
}
function editForm(s, det) {
  const n = S.slots.filter(y => y.detailId && y.detailId === s.detailId).length, f = `ed-${s.id}`;
  return `<form class="panel edit-form" data-edit-form="${esc(s.id)}" style="gap:12px;margin:4px 0 14px">
    <h3>עריכת הזמנה</h3>
    <div class="form2">
      <label for="${f}-price">מחיר למועד הזה (₪)<input id="${f}-price" name="price" type="number" min="0" inputmode="numeric" value="${esc(s.price ?? 0)}"></label>
      <label for="${f}-date">תאריך<input id="${f}-date" name="date" type="date" value="${esc(s.date)}"></label>
      <label for="${f}-start">משעה<input id="${f}-start" name="start" type="time" value="${esc(s.start)}"></label>
      <label for="${f}-end">עד שעה<input id="${f}-end" name="end" type="time" value="${esc(s.end)}"></label>
      <label for="${f}-name">שם השוכר/ת<input id="${f}-name" name="name" value="${esc(det.name || "")}" autocomplete="off"></label>
      <label for="${f}-phone">טלפון<input id="${f}-phone" name="phone" type="tel" dir="ltr" style="text-align:right" value="${esc(det.phone || "")}"></label>
      <label for="${f}-email">אימייל<input id="${f}-email" name="email" type="email" dir="ltr" style="text-align:right" value="${esc(det.email || "")}"></label>
      <label for="${f}-people">משתתפים<input id="${f}-people" name="people" type="number" min="0" inputmode="numeric" value="${esc(det.people ?? "")}"></label>
      <label for="${f}-purpose">מטרה<input id="${f}-purpose" name="purpose" value="${esc(det.purpose || "")}"></label>
      <label for="${f}-res">תעריף<select id="${f}-res" name="residency"><option value="local" ${det.residency !== "outside" ? "selected" : ""}>תושב/ת קלחים</option><option value="outside" ${det.residency === "outside" ? "selected" : ""}>תושב/ת חוץ</option></select></label>
    </div>
    ${n > 1 ? `<p class="small muted">פרטי השוכר משותפים לכל ${n} המועדים בהזמנה. המחיר והמועד משתנים רק למועד הזה.</p>` : ""}
    <p class="small muted">שינוי כאן לא שולח מייל לשוכר.</p>
    <div class="row" style="gap:8px">
      <button type="submit" class="primary">שמירת השינויים</button>
      <button type="button" data-edit-close>ביטול העריכה</button>
      ${n > 1 ? `<button type="button" class="danger" data-del-all="${esc(s.id)}">מחיקת כל ההזמנה (${n} מועדים)</button>` : ""}
    </div>
  </form>`;
}
function bindRows(body) {
  const up = async (id, data, msg, x) => { x.disabled = true; try { await api.updateSlot(id, data); toast(msg); await refreshSlots(); rerender(); } catch (e) { toast("העדכון לא נשמר"); x.disabled = false; } };
  body.querySelectorAll("[data-paid]").forEach(x => x.onclick = () => up(x.dataset.paid, { status: "paid", paidAt: new Date().toISOString() }, "סומן כשולם", x));
  body.querySelectorAll("[data-refunded]").forEach(x => x.onclick = () => up(x.dataset.refunded, { refundedAt: new Date().toISOString() }, "סומן שההחזר בוצע", x));
  body.querySelectorAll("[data-depret]").forEach(x => x.onclick = () => up(x.dataset.depret, { depositStatus: "returned", depositAt: new Date().toISOString() }, "סומן שהפיקדון הוחזר", x));
  body.querySelectorAll("[data-depkeep]").forEach(x => x.onclick = () => { if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = "לאשר עיכוב?"; return; } up(x.dataset.depkeep, { depositStatus: "withheld", depositAt: new Date().toISOString() }, "סומן שהפיקדון לא יוחזר", x); });
  body.querySelectorAll("[data-photos]").forEach(x => x.onclick = async () => {
    S.openPhotos ||= {}; const id = x.dataset.photos; S.openPhotos[id] = !S.openPhotos[id];
    const s = S.slots.find(y => y.id === id), paths = (s?.checkout?.photos || []).filter(p => !S.signed?.[p] && !photoUrl(p));
    if (S.openPhotos[id] && paths.length) { x.disabled = true; x.textContent = "טוען…"; S.signed = { ...(S.signed || {}), ...(await api.signedUrls(paths)) }; }
    rerender();
  });
  body.querySelectorAll("[data-copyco]").forEach(x => x.onclick = () => navigator.clipboard.writeText(x.dataset.copyco).then(() => toast("הקישור הועתק"), () => toast(x.dataset.copyco)));
  body.querySelectorAll("[data-remind]").forEach(x => x.addEventListener("click", () => { api.updateSlot(x.dataset.remind, { reminded: new Date().toISOString(), reminderVia: "manual" }).then(refreshSlots).catch(() => {}); }));
  body.querySelectorAll("[data-cancel]").forEach(x => x.onclick = () => {
    if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = `לאשר? (${x.dataset.refund})`; return; }
    const s = S.slots.find(y => y.id === x.dataset.cancel); if (s) up(s.id, cancelData(s, "admin"), "ההזמנה בוטלה והחדר שוחרר", x);
  });
  body.querySelectorAll("[data-edit]").forEach(x => x.onclick = () => { const same = S.editSlot === x.dataset.edit && S.editKey === Number(x.dataset.key); S.editSlot = same ? null : x.dataset.edit; S.editKey = Number(x.dataset.key); rerender(); });
  body.querySelectorAll("[data-edit-close]").forEach(x => x.onclick = () => { S.editSlot = null; rerender(); });
  const EDIT_ERR = { clash: "המועד החדש מתנגש בהזמנה אחרת בחדר הזה", bad_time: "שעת הסיום צריכה להיות אחרי שעת ההתחלה", missing_details: "חסר שם או מספר טלפון תקין", missing_email: "כתובת האימייל לא תקינה" };
  body.querySelectorAll("[data-edit-form]").forEach(form => form.onsubmit = async ev => {
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(form)), btn = form.querySelector("[type=submit]");
    if (!v.date || !v.start || !v.end) { toast("יש למלא תאריך ושעות"); return; }
    btn.disabled = true;
    try {
      await api.adminUpdateSlot({ slot_id: form.dataset.editForm, ...v, price: Number(v.price) || 0 });
      S.editSlot = null; toast("השינויים נשמרו"); await refreshSlots(); rerender();
    } catch (e) { toast(EDIT_ERR[e.code] || "השינויים לא נשמרו"); btn.disabled = false; }
  });
  const del = async (x, id, whole) => {
    if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = whole ? "למחוק את כל ההזמנה לצמיתות?" : "למחוק לצמיתות?"; return; }
    x.disabled = true;
    try { await api.adminDeleteSlot(id, whole); S.editSlot = null; toast(whole ? "ההזמנה נמחקה" : "המועד נמחק"); await refreshSlots(); rerender(); }
    catch (e) { toast("המחיקה לא הצליחה"); x.disabled = false; }
  };
  body.querySelectorAll("[data-del]").forEach(x => x.onclick = () => del(x, x.dataset.del, false));
  body.querySelectorAll("[data-del-all]").forEach(x => x.onclick = () => del(x, x.dataset.delAll, true));
  body.querySelectorAll("[data-cancel-series]").forEach(x => x.onclick = async () => {
    const now = Date.now(), list = S.slots.filter(y => y.detailId === x.dataset.cancelSeries && y.status !== "cancelled" && slotStartMs(y) > now);
    if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = `לבטל ${list.length} מועדים?`; return; }
    x.disabled = true;
    try { for (const y of list) await api.updateSlot(y.id, cancelData(y, "admin")); toast(`${list.length} מועדים בוטלו`); await refreshSlots(); rerender(); } catch (e) { toast("הביטול לא הושלם"); x.disabled = false; }
  });
}

function adminCalendar(body, pub) {
  const today = ymd(new Date());
  S.acalYM ||= today.slice(0, 7); S.acalDay ||= today; S.acalB ||= "all"; S.acalR ||= "all";
  if (S.acalB === "all" || !(bById(S.acalB)?.rooms || []).some(r => r.id === S.acalR)) S.acalR = "all";
  const [y, m] = S.acalYM.split("-").map(Number), first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const roomIds = S.acalR !== "all" ? new Set([S.acalR]) : S.acalB === "all" ? null : new Set((bById(S.acalB)?.rooms || []).map(r => r.id));
  const live = S.slots.filter(s => s.status !== "cancelled" && (!roomIds || roomIds.has(s.roomId)));
  const onDay = d => { const D0 = dayNum(d) * 1440, D1 = D0 + 1440; return live.filter(s => { const [A, B] = slotAbs(s); return A < D1 && B > D0; }).sort((a, b) => slotAbs(a)[0] - slotAbs(b)[0]); };
  let cells = DOWS.map(d => `<div class="wd" aria-hidden="true">${d}</div>`).join("");
  for (let i = 0; i < first.getDay(); i++) cells += "<div></div>";
  for (let d = 1; d <= days; d++) {
    const ds = ymd(new Date(y, m - 1, d)), list = onDay(ds), pend = !pub && list.some(s => s.status === "pending");
    cells += `<button class="ad${ds === today ? " today" : ""}${ds < today ? " past" : ""}" data-aday="${ds}" aria-pressed="${ds === S.acalDay}" aria-label="${heDate(ds)}: ${list.length} השכרות">
      <span class="n">${d}</span>${list.length ? `<span class="cnt ${pend ? "pend" : ""}">${list.length}</span>` : ""}
      <span class="evs">${list.slice(0, 3).map(s => `<span class="ev ${pub ? "" : s.status}">${esc(s.start)} ${esc(rById(s.roomId)?.r.name || "")}</span>`).join("")}${list.length > 3 ? `<span class="ev more">+${list.length - 3}</span>` : ""}</span></button>`;
  }
  const dayList = onDay(S.acalDay); if (!pub) dayList.forEach(loadDetail);
  const pubRow = s => { const rr = rById(s.roomId); return `<div class="bk"><div class="t">${tr(esc(s.start), esc(s.end))}${s.endDate && s.endDate !== s.date ? `<div class="small muted" style="font-weight:400">עד ${esc(heDate(s.endDate))}</div>` : ""}</div>
    <div style="min-width:0"><b>${esc(rr?.r.name || "")}</b><div class="small muted">${esc(rr?.b.name || "")}</div></div>
    <div class="acts">${rr ? `<button data-goroom="${esc(rr.r.id)}">להזמנה</button>` : ""}</div></div>`; };
  const monthList = []; for (let d = 1; d <= days; d++) monthList.push(...onDay(ymd(new Date(y, m - 1, d))).filter(s => s.date === ymd(new Date(y, m - 1, d))));
  const income = monthList.reduce((a, s) => a + Number(s.price || 0), 0);
  body.innerHTML = `
    <div class="chips jump" style="margin-bottom:14px">${[["all", "הכל"], ...(S.config.buildings || []).map(b => [b.id, b.name])].map(([k, t]) => `<button class="chip" data-acb="${esc(k)}" aria-pressed="${S.acalB === k}">${esc(t)}</button>`).join("")}</div>
    ${S.acalB !== "all" && (bById(S.acalB)?.rooms || []).length > 1 ? `<div class="chips jump room-chips" style="margin:-6px 0 14px" aria-label="סינון לפי חדר">${[["all", "כל החדרים ב" + (bById(S.acalB)?.name || "")], ...bById(S.acalB).rooms.map(r => [r.id, r.name])].map(([k, t]) => `<button class="chip" data-acr="${esc(k)}" aria-pressed="${S.acalR === k}">${esc(t)}</button>`).join("")}</div>` : ""}
    <div class="panel" style="margin-bottom:22px">
      <div class="cal-head"><button data-amon="-1" aria-label="החודש הקודם">›</button><div style="text-align:center"><h3>${MONTHS[m - 1]} ${y}</h3><span class="small muted">${monthList.length} השכרות${pub ? "" : ` · ${money(income)}`}</span></div><button data-amon="1" aria-label="החודש הבא">‹</button></div>
      <div class="acal" role="group" aria-label="בחירת יום">${cells}</div>
      ${pub ? `<p class="small muted">המספר בכל יום הוא מספר ההשכרות בו.</p>` : `<div class="legend"><span><i style="background:var(--accent)"></i>שולם</span><span><i style="background:var(--part)"></i>ממתין לתשלום</span></div>`}
    </div>
    <section class="section"><h2>${heDateY(S.acalDay)}</h2>
      ${dayList.length ? `<div>${dayList.map(pub ? pubRow : bookingRow).join("")}</div>` : `<p class="muted">אין השכרות ביום זה. כל החדרים פנויים בשעות הפעילות.</p>`}</section>`;
  body.querySelectorAll("[data-goroom]").forEach(x => x.onclick = () => { const target = S.acalDay; go("public"); S.roomId = x.dataset.goroom; S.step = 2; S.sel = null; S.pick = null; S.date = target >= ymd(new Date()) ? target : null; S.calYM = (S.date || ymd(new Date())).slice(0, 7); render(); window.scrollTo({ top: 0 }); });
  body.querySelectorAll("[data-acb]").forEach(x => x.onclick = () => { S.acalB = x.dataset.acb; S.acalR = "all"; rerender(); });
  body.querySelectorAll("[data-acr]").forEach(x => x.onclick = () => { S.acalR = x.dataset.acr; rerender(); });
  body.querySelectorAll("[data-amon]").forEach(x => x.onclick = () => { const d = new Date(y, m - 1 + Number(x.dataset.amon), 1); S.acalYM = ymd(d).slice(0, 7); rerender(); });
  body.querySelectorAll("[data-aday]").forEach(x => x.onclick = () => { S.acalDay = x.dataset.aday; rerender(); });
  if (!pub) bindRows(body);
}

// Bookings vs actual payments, per month, with Excel (CSV) export
function adminReport(body) {
  const now = new Date(); S.repYM ||= ymd(now).slice(0, 7);
  const [y, m] = S.repYM.split("-").map(Number), from = S.repYM + "-01", to = ymd(new Date(y, m, 0));
  if (S.repRows?.ym !== S.repYM) {
    body.innerHTML = `<div class="empty">טוען את נתוני ${MONTHS[m - 1]} ${y}…</div>`;
    api.listSlots(from, true, to).then(rows => { S.repRows = { ym: S.repYM, rows }; if (S.view === "admin" && S.adminTab === "report") rerender(); })
      .catch(() => { body.innerHTML = `<div class="notice bad">לא ניתן לטעון את הדוח. נסו שוב.</div>`; });
    return;
  }
  const rows = S.repRows.rows.filter(s => s.date >= from && s.date <= to).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const live = rows.filter(s => s.status !== "cancelled"), paid = live.filter(s => s.status === "paid"), open = live.filter(s => s.status === "pending");
  const cancelledPaid = rows.filter(s => s.status === "cancelled" && s.paidAt);
  const toRefund = cancelledPaid.filter(s => s.refund === "full" && !s.refundedAt), kept = cancelledPaid.filter(s => s.refund === "none");
  const sum = a => a.reduce((t, s) => t + Number(s.price || 0), 0);
  const roomName = id => rById(id)?.r.name || id;
  const byRoom = {}; live.forEach(s => { const k = roomName(s.roomId); byRoom[k] ||= { n: 0, due: 0, paid: 0 }; byRoom[k].n++; byRoom[k].due += Number(s.price || 0); if (s.status === "paid") byRoom[k].paid += Number(s.price || 0); });
  const statusText = s => s.status === "cancelled" ? (s.paidAt ? (s.refund === "full" ? (s.refundedAt ? "בוטל · הוחזר" : "בוטל · להחזיר") : "בוטל · ללא החזר") : "בוטל") : STATUS[s.status];
  body.innerHTML = `
    <div class="cal-head" style="margin-bottom:16px"><button data-rmon="-1" aria-label="החודש הקודם">›</button><h2>${MONTHS[m - 1]} ${y}</h2><button data-rmon="1" aria-label="החודש הבא">‹</button></div>
    <div class="stats">
      <div class="stat"><span class="small muted">הוזמן (${live.length})</span><b>${money(sum(live))}</b></div>
      <div class="stat"><span class="small muted">שולם בפועל (${paid.length})</span><b style="color:var(--free)">${money(sum(paid))}</b></div>
      <div class="stat"><span class="small muted">פתוח לתשלום (${open.length})</span><b style="color:var(--part)">${money(sum(open))}</b></div>
    </div>
    ${toRefund.length || kept.length ? `<p class="small">ביטולים ששולמו: ${toRefund.length ? `להחזיר ${money(sum(toRefund))} (${toRefund.length})` : ""}${toRefund.length && kept.length ? " · " : ""}${kept.length ? `נשאר בקופה לפי תנאי הביטול ${money(sum(kept))} (${kept.length})` : ""}</p>` : ""}
    <div class="row" style="margin:10px 0 18px"><button class="primary" id="csvBtn">ייצוא לאקסל (CSV)</button></div>
    ${Object.keys(byRoom).length ? `<section class="section"><h3>לפי חדר</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>חדר</th><th>הזמנות</th><th>הוזמן</th><th>שולם</th><th>פתוח</th></tr></thead><tbody>${Object.entries(byRoom).sort((a, b) => b[1].due - a[1].due).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${money(v.due)}</td><td class="num">${money(v.paid)}</td><td class="num">${money(v.due - v.paid)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="section"><h3>כל ההזמנות בחודש</h3>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>תאריך</th><th>שעות</th><th>חדר</th><th>שוכר/ת</th><th>תעריף</th><th>סכום</th><th>סטטוס</th></tr></thead><tbody>${rows.map(s => `<tr class="${s.status}"><td class="num">${esc(s.date.split("-").reverse().join("."))}</td><td class="num">${tr(esc(s.start), esc(s.end))}</td><td>${esc(roomName(s.roomId))}</td><td>${esc(s.booking?.name || "")}</td><td>${s.booking?.residency === "outside" ? "חוץ" : "תושב"}</td><td class="num">${money(s.price)}</td><td><span class="pill ${s.status}">${esc(statusText(s))}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">אין הזמנות בחודש הזה.</div>`}
    </section>`;
  body.querySelectorAll("[data-rmon]").forEach(x => x.onclick = () => { const d = new Date(y, m - 1 + Number(x.dataset.rmon), 1); S.repYM = ymd(d).slice(0, 7); rerender(); });
  $("#csvBtn").onclick = () => {
    const q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const head = ["תאריך", "התחלה", "סיום", "חדר", "שוכר/ת", "טלפון", "אימייל", "תעריף", "אפשרות", "סכום", "סטטוס", "תאריך תשלום", "החזר"];
    const lines = rows.map(s => [s.date, s.start, s.end, roomName(s.roomId), s.booking?.name, s.booking?.phone, s.booking?.email, s.booking?.residency === "outside" ? "חוץ" : "תושב", s.optionName, s.price, statusText(s), s.paidAt ? String(s.paidAt).slice(0, 10) : "", s.refund === "full" ? (s.refundedAt ? "הוחזר" : "להחזיר") : s.refund === "none" ? "ללא" : ""].map(q).join(","));
    const blob = new Blob(["\ufeff" + [head.map(q).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kelahim-payments-${S.repYM}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
}

function adminBookings(body) {
  const today = ymd(new Date());
  const all = S.slots.filter(s => s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  all.forEach(loadDetail);
  const H = Number(S.config.reminderHours || 24), now = Date.now();
  const due = all.filter(s => { if (s.status === "cancelled" || s.reminded) return false; const t = parseYmd(s.date), m = toMin(s.start); t.setHours(Math.floor(m / 60), m % 60); const diff = t - now; return diff > 0 && diff <= H * 3600e3; });
  const active = all.filter(s => s.status !== "cancelled"), unpaid = active.filter(s => s.status === "pending");
  const roomsOpts = (S.config.buildings || []).flatMap(b => (b.rooms || []).map(r => `<option value="${esc(r.id)}">${esc(r.name)} · ${esc(b.name)}</option>`)).join("");
  const byDate = {}; all.forEach(s => (byDate[s.date] ||= []).push(s));
  const refunds = S.slots.filter(s => s.status === "cancelled" && s.paidAt && s.refund === "full" && !s.refundedAt);
  const nowMs = Date.now();
  const review = S.slots.filter(s => s.status !== "cancelled" && s.checkout && (!s.depositStatus || s.depositStatus === "review")).sort((a, b) => slotStartMs(a) - slotStartMs(b));
  const awaitCo = S.slots.filter(s => s.status !== "cancelled" && depAmt(s) > 0 && !s.checkout && !s.depositStatus && slotEndMs(s) <= nowMs).sort((a, b) => slotStartMs(a) - slotStartMs(b));
  [...review, ...awaitCo].forEach(loadDetail);
  refunds.forEach(loadDetail);
  const row = bookingRow;
  body.innerHTML = `
    ${review.length ? `<section class="section"><div class="stack" style="gap:4px"><h2>הזדכויות לבדיקה</h2><p class="small muted">בדקו את התמונות, ואז החזירו את הפיקדון או עכבו אותו.</p></div><div>${review.map(bookingRow).join("")}</div></section>` : ""}
    ${awaitCo.length ? `<section class="section"><div class="stack" style="gap:4px"><h2>ממתינים להזדכות</h2><p class="small muted">השכרות עם פיקדון שהסתיימו ועדיין לא נשלחה עליהן הזדכות. שלחו לשוכר את הקישור.</p></div><div>${awaitCo.map(bookingRow).join("")}</div></section>` : ""}
    ${refunds.length ? `<section class="section"><div class="stack" style="gap:4px"><h2>החזרים לביצוע</h2><p class="small muted">הזמנות ששולמו ובוטלו בזמן, לפי תנאי הביטול.</p></div><div>${refunds.map(row).join("")}</div></section>` : ""}
    <div class="stats">
      <div class="stat"><span class="small muted">הזמנות קרובות</span><b>${active.length}</b></div>
      <div class="stat"><span class="small muted">${refunds.length ? "החזרים לביצוע" : "ממתינות לתשלום"}</span><b style="color:var(--part)">${refunds.length || unpaid.length}</b></div>
      <div class="stat"><span class="small muted">הכנסות צפויות</span><b>${money(active.reduce((a, s) => a + Number(s.price || 0), 0))}</b></div>
    </div>
    <section class="section"><div class="stack" style="gap:4px"><h2>תזכורות לשליחה</h2><p class="small muted">${S.config.waAuto ? `תזכורות נשלחות אוטומטית בוואטסאפ ${H} שעות לפני. כאן מופיעות רק הזמנות שהתזכורת האוטומטית אליהן לא יצאה.` : `הזמנות ב־${H} השעות הקרובות. הכפתור פותח וואטסאפ עם הודעה מוכנה לשוכר.`}</p></div>
      ${due.length ? `<div>${due.map(row).join("")}</div>` : `<p class="muted">אין תזכורות שממתינות לשליחה.</p>`}</section>
    <section class="section"><h2>כל ההזמנות הקרובות</h2>
      ${all.length ? Object.entries(byDate).map(([d, list]) => `<div class="datehead">${heDateY(d)}</div>${list.map(row).join("")}`).join("") : `<div class="empty">עדיין אין הזמנות. הזמנות חדשות יופיעו כאן מיד.</div>`}</section>
    <details class="box"><summary>הוספת הזמנה ידנית (טלפון / וואטסאפ)</summary>
      <form id="manual" class="stack" novalidate>
        <div class="form2">
          <label for="mRoom">חדר<select id="mRoom">${roomsOpts}</select></label>
          <label for="mDate">תאריך<input id="mDate" type="date" value="${today}"></label>
          <label for="mStart">משעה<input id="mStart" type="time" value="18:00"></label>
          <label for="mEnd">עד שעה<input id="mEnd" type="time" value="22:00"></label>
          <label for="mName">שם השוכר<input id="mName"></label>
          <label for="mPhone">טלפון<input id="mPhone" type="tel"></label>
          <label for="mEmail">אימייל השוכר (לאישור ולביטול)<input id="mEmail" type="email" dir="ltr" style="text-align:right"></label>
          <label for="mPrice">מחיר (₪)<input id="mPrice" type="number" min="0" inputmode="numeric"></label>
          <label for="mStatus">סטטוס<select id="mStatus"><option value="pending">ממתין לתשלום</option><option value="paid">שולם</option></select></label>
          <label for="mRep">חזרה<select id="mRep"><option value="once">פעם אחת</option><option value="weekly">כל שבוע</option><option value="daily">כל יום</option></select></label>
          <label for="mUntil">עד תאריך (בהזמנה חוזרת)<input id="mUntil" type="date"></label>
        </div>
        <p class="small muted">בהזמנה חוזרת, המחיר הוא לכל מועד. מועדים תפוסים או סגורים יידלגו.</p>
        <label for="mRes">תעריף<select id="mRes"><option value="local">תושב/ת קלחים</option><option value="outside">תושב/ת חוץ</option></select></label>
        <label for="mPurpose">מטרה / הערות<input id="mPurpose"></label>
        <div id="mErr" class="notice bad" hidden></div>
        <div><button class="primary" type="submit">שמירת ההזמנה</button></div>
      </form></details>`;
  bindRows(body);
  $("#manual").onsubmit = async e => {
    e.preventDefault(); const er = $("#mErr");
    const v = { roomId: $("#mRoom").value, date: $("#mDate").value, start: $("#mStart").value, end: $("#mEnd").value };
    const rr = rById(v.roomId);
    if (!rr || !v.date || !v.start || !v.end || toMin(v.end) <= toMin(v.start)) { er.textContent = "בדקו חדר, תאריך ושעות (שעת הסיום אחרי שעת ההתחלה)."; er.hidden = false; return; }
    const mode = $("#mRep").value, until = $("#mUntil").value;
    if (mode !== "once" && (!until || until <= v.date)) { er.textContent = "בהזמנה חוזרת יש לבחור תאריך סיום אחרי התאריך הראשון."; er.hidden = false; return; }
    const occ = occurrences(rr.b, rr.r, { kind: "fixed", start: v.start, end: v.end }, v.date, mode, until);
    if (!occ.ok.length) { er.textContent = "החדר תפוס או סגור בכל המועדים שנבחרו."; er.hidden = false; return; }
    const dates = occ.ok, many = dates.length > 1, price = Number($("#mPrice").value || 0);
    try {
      await api.createBooking({ room_id: v.roomId, source: "manual", status: $("#mStatus").value, residency: $("#mRes").value, option_name: "הזמנה ידנית",
        name: $("#mName").value.trim(), phone: $("#mPhone").value.trim(), email: $("#mEmail").value.trim(), purpose: $("#mPurpose").value.trim(), repeat: many ? mode : null, until: many ? until : null,
        items: dates.map(d => ({ date: d, start: v.start, end: v.end, price })) });
      toast(many ? `${dates.length} מועדים נשמרו${occ.bad.length ? ` (${occ.bad.length} דולגו)` : ""}` : "ההזמנה נשמרה");
      await refreshSlots(); rerender();
    } catch (x) { er.textContent = x?.code === "clash" ? "החדר תפוס בחלק מהמועדים." : x?.code === "missing_details" ? "נא למלא שם וטלפון של השוכר." : "השמירה לא הצליחה."; er.hidden = false; }
  };
}

const NUMK = ["outsidePct", "deposit", "minCheckoutPhotos", "refundHours", "hours", "capacity", "maxAdvanceDays", "bufferMin", "price", "minHours", "maxHours", "reminderHours"];
const numv = (k, v) => NUMK.includes(k) ? (v === "" ? "" : Number(v)) : v;
function markDirty() { S.dirty = true; const d = $("#dirty"); if (d) d.textContent = "יש שינויים שלא נשמרו"; }
function renderSaveBar() {
  const bar = $("#bar"); bar.className = "savebar";
  bar.innerHTML = `<div class="in"><button class="primary" id="saveCfg">שמירה ופרסום לשוכרים</button><span class="small muted" id="dirty">${S.dirty ? "יש שינויים שלא נשמרו" : "כל השינויים שמורים"}</span></div>`;
  bar.hidden = false;
  $("#saveCfg").onclick = async () => {
    const btn = $("#saveCfg"); btn.disabled = true; btn.textContent = "שומר…";
    try { await api.saveSettings(JSON.parse(JSON.stringify(S.draft))); S.config = JSON.parse(JSON.stringify(S.draft)); S.dirty = false; toast("ההגדרות נשמרו ומופיעות לשוכרים"); }
    catch (e) { toast(e?.code === "quota_exceeded" ? "ההגדרות גדולות מדי לשמירה" : "השמירה לא הצליחה. נסו שוב."); }
    btn.disabled = false; btn.textContent = "שמירה ופרסום לשוכרים"; const dd = $("#dirty"); if (dd) dd.textContent = S.dirty ? "יש שינויים שלא נשמרו" : "כל השינויים שמורים";
  };
}
function rerender() { const y = window.scrollY; render(); window.scrollTo({ top: y }); }

function adminGeneral(body) {
  const D = S.draft;
  body.innerHTML = `<div class="ed narrow">
    <div class="ed-sec"><h3>פרטי האתר</h3>
      <label for="gSite">שם האתר<input id="gSite" data-g="siteName" value="${esc(D.siteName)}"></label>
      <div class="form2">
        <label for="gMgr">שם מנהל/ת המבנים<input id="gMgr" data-g="managerName" value="${esc(D.managerName)}"></label>
        <label for="gPhone">וואטסאפ לקבלת הזמנות<input id="gPhone" type="tel" data-g="managerPhone" value="${esc(D.managerPhone)}" placeholder="050-0000000" dir="ltr" style="text-align:right"></label>
      </div>
      <label for="gMail">אימייל להתראה על כל הזמנה חדשה<input id="gMail" type="email" data-g="notifyEmail" value="${esc(D.notifyEmail || "")}" dir="ltr" style="text-align:right" placeholder="office@example.com"></label>
      <p class="small muted" style="margin-top:-6px">גם השוכר מקבל מייל אישור, אם מילא אימייל בהזמנה.</p>
      <label for="gNote">הערה על המחירים (מוצגת לשוכרים)<input id="gNote" data-g="priceNote" value="${esc(D.priceNote)}" placeholder="למשל: המחירים כוללים מע״מ"></label>
      <label for="gRefund">החזר מלא בביטול עד כמה שעות לפני<input id="gRefund" type="number" min="0" data-g="refundHours" value="${esc(D.refundHours ?? 24)}"></label>
      <label for="gOut">מחיר לתושבי חוץ (% ממחיר התושבים)<input id="gOut" type="number" min="100" step="5" data-g="outsidePct" value="${esc(D.outsidePct ?? 150)}"></label>
      <label for="gPolicy">נוסח תנאי הביטול (מוצג לשוכרים)<textarea id="gPolicy" data-g="cancelPolicy" rows="3" placeholder="${esc(policyText())}">${esc(D.cancelPolicy || "")}</textarea></label>
      <label for="gMinP">מספר תמונות מינימלי בהזדכות<input id="gMinP" type="number" min="1" data-g="minCheckoutPhotos" value="${esc(D.minCheckoutPhotos ?? 3)}"></label>
      <label class="inline" for="gWa"><input type="checkbox" id="gWa" ${D.waAuto ? "checked" : ""}> שליחת תזכורת אוטומטית לשוכר בוואטסאפ (דרך WhatsApp של Meta)</label>
      ${D.waAuto ? `<label for="gWaT">שם תבנית ההודעה המאושרת ב-Meta<input id="gWaT" data-g="waTemplate" dir="ltr" style="text-align:right" value="${esc(D.waTemplate || "booking_reminder")}"></label>` : ""}
      <label for="gRem">להציג תזכורת כמה שעות לפני ההזמנה<input id="gRem" type="number" min="1" data-g="reminderHours" value="${esc(D.reminderHours)}"></label>
    </div>
    <div class="ed-sec"><h3>לוגו</h3>
      <div class="photo-ed">${photoUrl(D.logoId) ? `<img src="${esc(photoUrl(D.logoId))}" alt="הלוגו הנוכחי" style="height:72px;width:auto">` : `<span class="small muted">עדיין לא הועלה לוגו.</span>`}
        ${S.isAdmin ? `<label class="btn" for="logoIn" style="flex-direction:row;cursor:pointer">${D.logoId ? "החלפת הלוגו" : "העלאת לוגו"}<input type="file" id="logoIn" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>${D.logoId ? `<button class="link" id="logoDel">הסרה</button>` : ""}` : ""}
        <span class="small muted" id="logoMsg"></span></div></div>
    <div class="ed-sec"><h3>נהלים כלליים</h3><p class="small muted">מוצגים לכל שוכר לפני האישור, בדף הסיום ובהודעת התזכורת.</p>
      <label for="gRules" class="sr"><textarea id="gRules" data-g="generalRules" rows="8" aria-label="נהלים כלליים">${esc(D.generalRules)}</textarea></label>
      ${D.example ? `<label class="inline" for="gEx"><input type="checkbox" id="gEx" checked> להציג לשוכרים הודעה שהנתונים הם דוגמה</label>` : ""}
    </div></div>`;
  body.querySelectorAll("[data-g]").forEach(x => x.oninput = () => { D[x.dataset.g] = numv(x.dataset.g, x.value); markDirty(); });
  $("#gEx")?.addEventListener("change", e => { D.example = e.target.checked; markDirty(); });
  $("#gWa")?.addEventListener("change", e => { D.waAuto = e.target.checked; markDirty(); rerender(); });
  $("#logoDel")?.addEventListener("click", () => { delete D.logoId; markDirty(); rerender(); });
  $("#logoIn")?.addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return; const msg = $("#logoMsg"); msg.textContent = "מעלה…";
    try { D.logoId = await api.uploadSiteImage(await shrinkImage(f)); markDirty(); rerender(); toast("הלוגו עלה. לחצו ׳שמירה׳ כדי לפרסם."); }
    catch (err) { msg.textContent = err?.code === "unsupported_type" ? "השתמשו ב־PNG, JPG, WEBP או SVG." : "ההעלאה לא הצליחה. נסו שוב."; }
  });
}

function adminRooms(body) {
  const D = S.draft;
  if (S.selB && !D.buildings.find(b => b.id === S.selB)) { S.selB = null; S.selR = null; }
  if (!S.selB && D.buildings[0]) S.selB = D.buildings[0].id;
  const b = D.buildings.find(x => x.id === S.selB);
  const r = b && S.selR ? (b.rooms || []).find(x => x.id === S.selR) : null;
  if (S.selR && !r) S.selR = null;
  const tree = `<nav class="tree" aria-label="מבנים וחדרים">${D.buildings.map(x => `
      <button data-selb="${esc(x.id)}" aria-current="${x.id === S.selB && !S.selR}">${esc(x.name || "מבנה ללא שם")}</button>
      ${(x.rooms || []).map(y => `<button class="sub" data-selr="${esc(x.id)}|${esc(y.id)}" aria-current="${y.id === S.selR}">${esc(y.name || "חדר ללא שם")}</button>`).join("")}
      <button class="sub link" data-addroom="${esc(x.id)}">+ חדר</button><hr>`).join("")}
      <button class="link" id="addB">+ הוספת מבנה</button></nav>`;
  let ed = `<div class="empty">הוסיפו מבנה ראשון כדי להתחיל.</div>`;
  if (b && !r) ed = buildingEditor(b);
  if (r) ed = roomEditor(b, r);
  const picker = `<div class="picker"><label for="pick">מה לערוך?<select id="pick">${D.buildings.map(x => `<option value="${esc(x.id)}|" ${x.id === S.selB && !S.selR ? "selected" : ""}>${esc(x.name || "מבנה")} (מבנה)</option>${(x.rooms || []).map(y => `<option value="${esc(x.id)}|${esc(y.id)}" ${y.id === S.selR ? "selected" : ""}>　${esc(y.name || "חדר")}</option>`).join("")}`).join("")}</select></label>
      <div class="row">${b ? `<button class="quiet" data-addroom="${esc(b.id)}">+ חדר ב${esc(b.name)}</button>` : ""}<button class="quiet" id="addB2">+ מבנה</button></div></div>`;
  body.innerHTML = `<div class="settings">${tree}${picker}<div class="ed" id="editor">${ed}</div></div>`;
  $("#pick")?.addEventListener("change", e => { const [bi, ri] = e.target.value.split("|"); S.selB = bi; S.selR = ri || null; rerender(); });

  body.querySelectorAll("[data-selb]").forEach(x => x.onclick = () => { S.selB = x.dataset.selb; S.selR = null; rerender(); });
  body.querySelectorAll("[data-selr]").forEach(x => x.onclick = () => { const [bi, ri] = x.dataset.selr.split("|"); S.selB = bi; S.selR = ri; rerender(); });
  body.querySelectorAll("[data-addroom]").forEach(x => x.onclick = () => {
    const bb = D.buildings.find(y => y.id === x.dataset.addroom), id = uid();
    (bb.rooms ||= []).push({ id, name: "חדר חדש", capacity: 20, maxAdvanceDays: 60, bufferMin: 30, description: "", payLink: "", rules: "", options: [{ id: uid(), name: "לפי שעה", kind: "hourly", price: 50, minHours: 1, maxHours: 4 }] });
    S.selB = bb.id; S.selR = id; markDirty(); rerender();
  });
  $("#addB2").onclick = () => $("#addB").click();
  $("#addB").onclick = () => { const id = uid(), sch = {}; for (let d = 0; d < 7; d++) sch[d] = { open: d !== 6, from: "08:00", to: d === 5 ? "14:00" : "22:00" };
    D.buildings.push({ id, name: "מבנה חדש", address: "", schedule: sch, closedDates: [], rooms: [] }); S.selB = id; S.selR = null; markDirty(); rerender(); };
  if (b && !r) bindBuilding(b); if (r) bindRoom(b, r);
}

function buildingEditor(b) {
  return `<div class="ed-sec"><h2>${esc(b.name || "מבנה")}</h2>
      <div class="form2"><label for="bName">שם המבנה<input id="bName" data-bf="name" value="${esc(b.name)}"></label>
      <label for="bAddr">כתובת / מיקום<input id="bAddr" data-bf="address" value="${esc(b.address)}"></label></div></div>
    <div class="ed-sec"><h3>ימים ושעות שבהם אפשר להשכיר</h3>
      <div class="sched">${[0,1,2,3,4,5,6].map(d => { const s = (b.schedule || {})[d] || { open: false, from: "08:00", to: "22:00" };
        if (d === 6) return `<label class="inline"><input type="checkbox" data-sch="6.open" ${s.open ? "checked" : ""}> מוצ״ש</label>
          ${s.auto ? `<span class="small" style="align-self:center">מצאת השבת<br><span class="muted num">השבוע: ${toHM(motzash(ymdOf(dayNum(ymd(new Date())) + ((6 - new Date().getDay() + 7) % 7))))}</span></span>` : `<input type="time" aria-label="מוצאי שבת משעה" data-sch="6.from" value="${esc(s.from)}" ${s.open ? "" : "disabled"}>`}
          <input type="time" aria-label="מוצאי שבת עד שעה" data-sch="6.to" value="${esc(s.to)}" ${s.open ? "" : "disabled"}>
          ${s.open ? `<label class="inline small" style="grid-column:1/-1"><input type="checkbox" data-sch="6.auto" ${s.auto ? "checked" : ""}> שעת הפתיחה מתעדכנת אוטומטית לפי צאת השבת בקלחים (שקיעה + 40 דקות)</label>` : ""}`;
        return `<label class="inline"><input type="checkbox" data-sch="${d}.open" ${s.open ? "checked" : ""}> ${DOW[d]}</label>
          <input type="time" aria-label="יום ${DOW[d]} משעה" data-sch="${d}.from" value="${esc(s.from)}" ${s.open ? "" : "disabled"}>
          <input type="time" aria-label="יום ${DOW[d]} עד שעה" data-sch="${d}.to" value="${esc(s.to)}" ${s.open ? "" : "disabled"}>`; }).join("")}</div></div>
    <div class="ed-sec"><h3>ימים סגורים</h3><p class="small muted">חגים, אירועי מושב או תחזוקה. בימים האלה לא ניתן להזמין.</p>
      <div class="row"><input type="date" id="closedIn" style="max-width:220px" aria-label="תאריך סגור"><button id="closedAdd">הוספה</button></div>
      <div class="datechips">${(b.closedDates || []).slice().sort().map(d => `<span class="datechip num">${heDateY(d)}<button data-unclose="${d}" aria-label="הסרת ${heDate(d)}">×</button></span>`).join("") || `<span class="small muted">אין ימים סגורים.</span>`}</div></div>
    <div class="ed-sec"><button class="danger" id="delB" style="align-self:flex-start">מחיקת המבנה וכל החדרים שבו</button></div>`;
}
function bindBuilding(b) {
  const D = S.draft;
  document.querySelectorAll("[data-bf]").forEach(x => x.oninput = () => { b[x.dataset.bf] = x.value; markDirty(); });
  document.querySelectorAll("[data-sch]").forEach(x => { const h = () => { const [d, k] = x.dataset.sch.split("."); b.schedule ||= {}; b.schedule[d] ||= { open: false, from: "08:00", to: "22:00" }; b.schedule[d][k] = (k === "open" || k === "auto") ? x.checked : x.value; if (d === "6" && k === "open" && x.checked && b.schedule[6].auto === undefined) b.schedule[6].auto = true; markDirty(); if (k === "open" || k === "auto") rerender(); }; x.oninput = h; x.onchange = h; });
  $("#closedAdd").onclick = () => { const v = $("#closedIn").value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return; b.closedDates ||= []; if (!b.closedDates.includes(v)) b.closedDates.push(v); markDirty(); rerender(); };
  document.querySelectorAll("[data-unclose]").forEach(x => x.onclick = () => { b.closedDates = b.closedDates.filter(d => d !== x.dataset.unclose); markDirty(); rerender(); });
  $("#delB").onclick = e => { const x = e.currentTarget; if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = "לחצו שוב לאישור המחיקה"; return; } D.buildings = D.buildings.filter(y => y.id !== b.id); S.selB = null; markDirty(); rerender(); };
}

function roomEditor(b, r) {
  const u = photoUrl(r.photoId);
  return `<div class="ed-sec"><span class="eyebrow">${esc(b.name)}</span><h2>${esc(r.name || "חדר")}</h2>
      <div class="photo-ed">${phHtml(r)}<div class="stack" style="gap:8px">
        ${S.isAdmin ? `<label class="btn" for="photoIn" style="flex-direction:row;cursor:pointer">${u ? "החלפת תמונה" : "העלאת תמונה של החדר"}<input type="file" id="photoIn" accept="image/png,image/jpeg,image/webp" hidden></label>${u ? `<button class="link" id="photoDel" style="align-self:flex-start">הסרת התמונה</button>` : ""}` : `<p class="small muted">העלאת תמונות זמינה למי שיש לו הרשאת עריכה.</p>`}
        <span class="small muted" id="photoMsg">תמונה רוחבית נראית הכי טוב.</span></div></div></div>
    <div class="ed-sec"><h3>פרטי החדר</h3>
      <div class="form2"><label for="rName">שם החדר<input id="rName" data-rf="name" value="${esc(r.name)}"></label>
        <label for="rCap">תפוסה מרבית (איש)<input id="rCap" type="number" min="1" data-rf="capacity" value="${esc(r.capacity)}"></label></div>
      <label for="rDesc">תיאור קצר לשוכרים<input id="rDesc" data-rf="description" value="${esc(r.description)}"></label></div>
    <div class="ed-sec"><h3>מתי אפשר להזמין</h3>
      <div class="form2"><label for="rAdv">עד כמה ימים קדימה<input id="rAdv" type="number" min="1" data-rf="maxAdvanceDays" value="${esc(r.maxAdvanceDays)}"></label>
        <label for="rDep">פיקדון (₪, 0 = ללא)<input id="rDep" type="number" min="0" step="50" data-rf="deposit" value="${esc(r.deposit || "")}"></label>
        <label for="rBuf">דקות הפרדה בין הזמנות (ניקיון)<input id="rBuf" type="number" min="0" step="15" data-rf="bufferMin" value="${esc(r.bufferMin)}"></label></div>
      <p class="small muted">שעות הפעילות נקבעות ברמת המבנה (${esc(b.name)}).</p></div>
    <div class="ed-sec"><h3>אפשרויות השכרה ומחירים</h3>
      ${(r.options || []).map((o, oi) => `<div class="optcard">
        <div class="full"><div class="seg" role="group" aria-label="סוג האפשרות"><button data-kind="${oi}.hourly" aria-pressed="${o.kind !== "fixed" && o.kind !== "block"}">לפי שעה</button><button data-kind="${oi}.block" aria-pressed="${o.kind === "block"}">בלוק שעות</button><button data-kind="${oi}.fixed" aria-pressed="${o.kind === "fixed"}">שעות קבועות</button></div>
          <button class="danger" data-delopt="${oi}">מחיקה</button></div>
        <label>שם האפשרות<input data-of="${oi}.name" value="${esc(o.name)}"></label>
        <label>${o.kind === "hourly" || !o.kind ? "מחיר לשעה (₪)" : "מחיר (₪)"}<input type="number" min="0" data-of="${oi}.price" value="${esc(o.price)}"></label>
        ${o.kind === "block" ? `<label>כמה שעות רצופות<input type="number" min="1" step="1" data-of="${oi}.hours" value="${esc(o.hours)}"></label><p class="small muted" style="grid-column:1/-1">השוכר בוחר שעת התחלה, וההשכרה יכולה להימשך אל היום הבא.</p>` : o.kind === "fixed"
          ? `<label>משעה<input type="time" data-of="${oi}.start" value="${esc(o.start)}"></label><label>עד שעה<input type="time" data-of="${oi}.end" value="${esc(o.end)}"></label>`
          : `<label>מינימום שעות<input type="number" min="0.5" step="0.5" data-of="${oi}.minHours" value="${esc(o.minHours)}"></label><label>מקסימום שעות<input type="number" min="0.5" step="0.5" data-of="${oi}.maxHours" value="${esc(o.maxHours)}"></label><label class="inline small" style="grid-column:1/-1"><input type="checkbox" data-ofc="${oi}.multi" ${o.multi ? "checked" : ""}> השוכר יכול לסמן כמה שעות נפרדות באותו יום</label>`}
      </div>`).join("")}
      <button id="addOpt" style="align-self:flex-start">+ אפשרות השכרה</button></div>
    <div class="ed-sec"><h3>תשלום</h3>
      <label for="rPay">קישור לדף התשלום<input id="rPay" dir="ltr" data-rf="payLink" value="${esc(r.payLink)}" placeholder="https://"></label>
      <p class="small muted">${safeUrl(r.payLink) ? "השוכר יראה כפתור תשלום אחרי ההזמנה." : r.payLink ? "הקישור חייב להתחיל ב־https://" : "בלי קישור, השוכר יראה שהתשלום יישלח אליו בנפרד."}</p></div>
    <div class="ed-sec"><h3>מה לצלם בהזדכות</h3><p class="small muted">מוצג לשוכר בדף ההזדכות. השאירו ריק כדי להשתמש בנוסח הכללי.</p>
      <textarea data-rf="checkoutTips" rows="4" aria-label="מה לצלם בהזדכות" placeholder="${esc(S.config.checkoutTips || DEFAULT_TIPS)}">${esc(r.checkoutTips || "")}</textarea></div>
    <div class="ed-sec"><h3>נהלים מיוחדים לחדר</h3>
      <textarea data-rf="rules" rows="5" aria-label="נהלים מיוחדים לחדר">${esc(r.rules)}</textarea></div>
    <div class="ed-sec"><button class="danger" id="delR" style="align-self:flex-start">מחיקת החדר</button></div>`;
}
function bindRoom(b, r) {
  document.querySelectorAll("[data-rf]").forEach(x => x.oninput = () => { r[x.dataset.rf] = numv(x.dataset.rf, x.value); markDirty(); });
  document.querySelectorAll("[data-ofc]").forEach(x => x.onchange = () => { const [oi, k] = x.dataset.ofc.split("."); r.options[oi][k] = x.checked; markDirty(); });
  document.querySelectorAll("[data-of]").forEach(x => x.oninput = () => { const [oi, k] = x.dataset.of.split("."); r.options[oi][k] = numv(k, x.value); markDirty(); });
  document.querySelectorAll("[data-kind]").forEach(x => x.onclick = () => { const [oi, k] = x.dataset.kind.split("."), o = r.options[oi]; o.kind = k;
    if (k === "fixed") { o.start ||= "08:00"; o.end ||= "14:00"; } else if (k === "block") { o.hours ||= 24; } else { o.minHours ||= 1; o.maxHours ||= 4; } markDirty(); rerender(); });
  document.querySelectorAll("[data-delopt]").forEach(x => x.onclick = () => { r.options.splice(Number(x.dataset.delopt), 1); markDirty(); rerender(); });
  $("#addOpt").onclick = () => { (r.options ||= []).push({ id: uid(), name: "אפשרות חדשה", kind: "hourly", price: 50, minHours: 1, maxHours: 4 }); markDirty(); rerender(); };
  $("#delR").onclick = e => { const x = e.currentTarget; if (x.dataset.armed !== "1") { x.dataset.armed = "1"; x.textContent = "לחצו שוב לאישור המחיקה"; return; } b.rooms = b.rooms.filter(y => y.id !== r.id); S.selR = null; markDirty(); rerender(); };
  $("#photoDel")?.addEventListener("click", () => { delete r.photoId; markDirty(); rerender(); });
  $("#photoIn")?.addEventListener("change", async e => {
    const f = e.target.files?.[0]; if (!f) return; const msg = $("#photoMsg");
    if (f.size > 20 * 1024 * 1024) { msg.textContent = "התמונה גדולה מדי (עד 20MB)."; return; }
    msg.textContent = "מעלה…";
    try { r.photoId = await api.uploadSiteImage(await shrinkImage(f)); markDirty(); rerender(); toast("התמונה עלתה. לחצו ׳שמירה׳ כדי לפרסם."); }
    catch (err) { msg.textContent = err?.code === "unsupported_type" ? "סוג הקובץ לא נתמך. השתמשו ב־JPG, PNG או WEBP." : err?.code === "too_large" ? "התמונה גדולה מדי." : "ההעלאה לא הצליחה. נסו שוב."; }
  });
}

// ---------- routing ----------
function go(v) { S.view = v; if (v === "admin") { S.draft = null; S.dirty = false; } $("#bar").className = "bar"; const h = v === "public" ? "" : v === "checkout" ? "checkout/" + S.coToken + (S.coId ? "/" + S.coId : "") : v; if (location.hash.slice(1) !== h) history.replaceState(null, "", h ? "#" + h : location.pathname + location.search); if (v === "admin" && S.isAdmin) refreshSlots().then(render); render(); window.scrollTo({ top: 0 }); }
$("#toAdmin").onclick = () => go("admin");
$("#toCal").onclick = () => go("calendar");
$("#homeBtn").onclick = () => { S.step = 1; S.done = null; S.pick = null; S.sel = null; S.rep = null; go("public"); };
const viewOfHash = () => { const h = location.hash, my = h.match(/^#my\/([a-f0-9]{20,80})$/); if (my) { addToken(my[1]); history.replaceState(null, "", location.pathname + location.search); return "public"; } m = h.match(/^#checkout\/([a-f0-9]{20,80})(?:\/([a-f0-9-]{20,40}))?$/); if (m) { S.coToken = m[1]; S.coId = m[2] || null; return "checkout"; } return ({ "#admin": "admin", "#calendar": "calendar" })[h] || "public"; };
window.addEventListener("hashchange", () => { const v = viewOfHash(); if (v !== S.view) go(v); });
S.view = viewOfHash();

// ---------- boot ----------
const typing = () => { const ae = document.activeElement; return ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName); };
async function refreshSlots() {
  const from = new Date(); from.setDate(1); from.setMonth(from.getMonth() - 1);
  try { S.slots = await api.listSlots(ymd(from), S.isAdmin && S.view === "admin"); S.slotsLoaded = true; S.offline = false; } catch (e) { S.offline = true; }
}
// Load the site settings, retrying on flaky mobile connections; remember the last good copy on this device
async function loadSettingsWithRetry() {
  for (let i = 0; i < 4; i++) {
    try {
      S.config = await api.loadSettings(); S.configLoaded = true; S.loadError = false; S.offline = false;
      try { localStorage.setItem("lastSettings", JSON.stringify(S.config)); } catch (e) {}
      return true;
    } catch (e) {
      console.error("[kelahim] loading settings failed, attempt " + (i + 1), e);
      await new Promise(r => setTimeout(r, [800, 2000, 4000, 0][i]));
    }
  }
  let saved = null; try { saved = JSON.parse(localStorage.getItem("lastSettings") || "null"); } catch (e) {}
  if (!saved) { try { saved = await (await fetch("demo-settings.json", { cache: "no-store" })).json(); } catch (e) {} }
  S.config = saved || blankConfig(); S.configLoaded = true; S.loadError = true; S.offline = true;
  return false;
}
function renderLoadError(app) {
  const ph = S.config?.managerPhone, wa = waLink(ph, "שלום, ניסיתי להזמין חדר באתר ולא הצלחתי להתחבר.");
  app.innerHTML = `<section class="section narrow" style="margin-top:10px">
    <div class="notice bad"><b>אין כרגע חיבור למערכת ההזמנות.</b><br>זה קורה לפעמים בחיבור סלולרי חלש, או כשהאינטרנט מסונן (למשל רימון או נתיב) או כשיש חוסם פרסומות שחוסם את האתר supabase.co.</div>
    <button class="primary big-btn" id="retryLoad">לנסות שוב</button>
    <p class="small muted">אפשר גם לנסות מרשת אחרת (Wi-Fi במקום סלולרי, או להפך).</p>
    ${ph ? `<div class="stack" style="gap:8px"><h3>להזמנה בטלפון</h3><p>${esc(S.config.managerName || "מנהל המבנים")} · <span class="num" dir="ltr">${esc(ph)}</span></p>${wa ? `<a class="btn big-btn" href="${esc(wa)}" target="_blank" rel="noopener">שליחת הודעה בוואטסאפ</a>` : ""}</div>` : ""}
  </section>`;
  $("#retryLoad").onclick = async e => { e.target.disabled = true; e.target.textContent = "מתחבר…"; if (await loadSettingsWithRetry()) { await Promise.all([refreshSlots(), refreshMine()]); } render(); };
}

render();
(async () => {
  S.db = true; S.canUpload = true;
  if (api.mode === "demo") { $("#demoBanner").hidden = false; $("#demoReset").onclick = async () => { await api.resetDemo(); try { localStorage.removeItem("myBookings"); } catch (e) {} location.reload(); }; }
  try { S.isAdmin = await api.isAdmin(); } catch (e) { S.isAdmin = false; }
  await loadSettingsWithRetry();
  await Promise.all([refreshSlots(), refreshMine()]);
  render();
  // keep availability fresh: other people book too
  setInterval(async () => { if (document.hidden || typing() || (S.view === "admin" && S.dirty)) return; await refreshSlots(); if (S.view === "public" && S.step === 1) await refreshMine(); if (!typing() && !(S.view === "admin" && (S.adminTab === "rooms" || S.adminTab === "general"))) rerender(); }, 30000);
})();

// ---------- manager sign-in ----------
$("#adminLogin").onclick = () => { if (S.isAdmin) go("admin"); else go("login"); };
function renderLogin(app) {
  app.innerHTML = `<section class="login stack"><span class="eyebrow">ניהול</span><h1>כניסת מנהלים</h1>
    ${api.mode === "demo" ? `<p class="notice">במצב הדגמה אפשר להיכנס עם כל אימייל וסיסמה.</p>` : ""}
    <form id="loginForm" class="stack" novalidate>
      <label for="lEmail">אימייל<input id="lEmail" type="email" autocomplete="username" dir="ltr" style="text-align:right" required></label>
      <label for="lPass">סיסמה<input id="lPass" type="password" autocomplete="current-password" dir="ltr" style="text-align:right" required></label>
      <div id="lErr" class="notice bad" hidden></div>
      <button class="primary big-btn" type="submit">כניסה</button>
    </form></section>`;
  $("#loginForm").onsubmit = async e => {
    e.preventDefault(); const err = $("#lErr"), btn = e.target.querySelector("button"); btn.disabled = true; err.hidden = true;
    try {
      S.isAdmin = await api.signIn($("#lEmail").value.trim(), $("#lPass").value);
      if (!S.isAdmin) { err.textContent = "המשתמש הזה אינו מוגדר כמנהל."; err.hidden = false; btn.disabled = false; return; }
      go("admin");
    } catch (x) { err.textContent = "האימייל או הסיסמה שגויים."; err.hidden = false; btn.disabled = false; }
  };
}
})();
