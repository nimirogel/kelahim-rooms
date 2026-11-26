// Google Apps Script: שולח מייל על הזמנה חדשה — למנהל ולשוכר — מה-Gmail של מי שהתקין אותו.
// התקנה: script.google.com ← פרויקט חדש ← הדבקת הקובץ ← Deploy ← New deployment ← Web app
//        (Execute as: Me, Who has access: Anyone) ← מעתיקים את כתובת ה-Web app ל-Vault ב-Supabase.
// הכתובת והמפתח למטה הם ציבוריים (אותם שיש באתר). הפרטים נמשכים מהמסד, לא מהבקשה.

const SUPABASE_URL = "https://zcnypdwhemjtxudvctwm.supabase.co";
const SUPABASE_KEY = "sb_publishable_iiNBXEtRuvDWDzJGP5x8gA_ZThnP0rT";

function doPost(e) {
  const body = JSON.parse(e.postData.contents || "{}");
  const token = String(body.token || "");
  if (!/^[a-f0-9]{20,80}$/.test(token)) return out("bad token");
  Utilities.sleep(1500); // ממתינים רגע, כדי שביטול של כמה מועדים ייצא במייל אחד
  if (body.event === "cancel") return sendCancel(token);
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/claim_booking_mail", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    payload: JSON.stringify({ tok: token })
  });
  const d = JSON.parse(res.getContentText() || "null");
  if (!d || !d.token) return out("nothing to send");
  const name = d.site_name || "השכרת חדרים";
  if (d.manager_email && d.source !== "manual") {
    GmailApp.sendEmail(d.manager_email, "הזמנה חדשה: " + d.room + " · " + firstWhen(d), plain(managerHtml(d)),
      { htmlBody: managerHtml(d), name: name, replyTo: d.email || undefined });
  }
  if (d.email) {
    GmailApp.sendEmail(d.email, "אישור הזמנה: " + d.room + " · " + firstWhen(d), plain(renterHtml(d)),
      { htmlBody: renterHtml(d), name: name, replyTo: d.manager_email || undefined });
  }
  return out("sent");
}

function sendCancel(token) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/claim_cancel_mail", {
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
    payload: JSON.stringify({ tok: token })
  });
  const d = JSON.parse(res.getContentText() || "null");
  if (!d || !d.token) return out("nothing to send");
  const name = d.site_name || "השכרת חדרים";
  if (d.manager_email) {
    GmailApp.sendEmail(d.manager_email, "ביטול הזמנה: " + d.room + " · " + firstWhen(d), plain(cancelManagerHtml(d)),
      { htmlBody: cancelManagerHtml(d), name: name, replyTo: d.email || undefined });
  }
  if (d.email) {
    GmailApp.sendEmail(d.email, "ההזמנה בוטלה: " + d.room + " · " + firstWhen(d), plain(cancelRenterHtml(d)),
      { htmlBody: cancelRenterHtml(d), name: name, replyTo: d.manager_email || undefined });
  }
  return out("sent");
}
function refundText(d) {
  const s = d.slots || [], paid = s.filter(x => x.paid), full = paid.filter(x => x.refund === "full");
  const sum = a => a.reduce((t, x) => t + Number(x.price || 0), 0);
  if (!paid.length) return "לא בוצע תשלום על המועדים שבוטלו, ולכן אין חיוב.";
  if (full.length === paid.length) return "יוחזר מלוא הסכום ששולם: " + money(sum(full)) + ".";
  if (!full.length) return "הביטול נעשה פחות מ־" + d.refund_hours + " שעות לפני המועד, ולכן לפי תנאי הביטול אין החזר.";
  return "יוחזרו " + money(sum(full)) + " (על מועדים שבוטלו בזמן). על השאר אין החזר לפי תנאי הביטול.";
}
function cancelManagerHtml(d) {
  return wrap("הזמנה בוטלה", "<table style='border-collapse:collapse'>" +
    row("חדר", esc(d.room) + (d.building ? " · " + esc(d.building) : "")) + row("מועדים שבוטלו", slotsHtml(d)) +
    row("בוטל על ידי", d.cancelled_by === "admin" ? "מנהל" : "השוכר/ת") +
    row("שוכר/ת", esc(d.name)) + row("טלפון", "<span dir='ltr'>" + esc(d.phone) + "</span>") + row("אימייל", esc(d.email)) +
    row("החזר", esc(refundText(d))) + (d.remaining ? row("נשארו בהזמנה", (d.remaining === 1 ? "מועד אחד" : d.remaining + " מועדים")) : "") + "</table>" +
    (d.site_url ? "<p><a href='" + esc(d.site_url) + "#admin' style='color:#3f7d1c'>למסך הניהול</a></p>" : ""));
}
function cancelRenterHtml(d) {
  return wrap("ההזמנה בוטלה", "<p>שלום " + esc(d.name) + ", " + (d.cancelled_by === "admin" ? "מנהל המבנים ביטל" : "ביטלת") + " את ההזמנה הזו:</p><table style='border-collapse:collapse'>" +
    row("חדר", esc(d.room) + (d.building ? " · " + esc(d.building) : "")) + row("מועדים שבוטלו", slotsHtml(d)) +
    (d.remaining ? row("נשארו בהזמנה", (d.remaining === 1 ? "מועד אחד" : d.remaining + " מועדים")) : "") + "</table>" +
    "<p><b>החזר כספי:</b> " + esc(refundText(d)) + "</p>" +
    (d.manager_phone ? "<p>לשאלות: " + esc(d.manager_name || "מנהל המבנים") + " · <span dir='ltr'>" + esc(d.manager_phone) + "</span></p>" : "") +
    (d.site_url ? "<p><a href='" + esc(d.site_url) + "' style='color:#3f7d1c'>להזמנה חדשה</a></p>" : ""));
}

// לבדיקה ידנית מתוך העורך: בוחרים testSend ולוחצים Run (שולח מייל דוגמה לחשבון שלך)
function testSend() {
  const me = Session.getActiveUser().getEmail();
  const d = { site_name: "חדרים להשכרה · קלחים", site_url: "", manager_email: me, room: "ספרייה", building: "מבני ציבור", address: "",
    name: "בדיקה", phone: "050-0000000", email: me, purpose: "בדיקת מייל", people: 3, residency: "local", option: "לפי שעה", repeat: "",
    total: 100, deposit: 0, source: "self", token: "test", pay_link: "", rules: "• דוגמה לנוהל", refund_hours: 24, manager_name: "", manager_phone: "",
    slots: [{ day: "ראשון", date: "01.12.2026", start: "10:00", end: "12:00", end_date: null, price: 100 }] };
  GmailApp.sendEmail(me, "בדיקה: מייל למנהל", plain(managerHtml(d)), { htmlBody: managerHtml(d), name: d.site_name });
  GmailApp.sendEmail(me, "בדיקה: מייל לשוכר", plain(renterHtml(d)), { htmlBody: renterHtml(d), name: d.site_name });
}

function out(t) { return ContentService.createTextOutput(t); }
function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function money(n) { return "₪" + Number(n || 0).toLocaleString("he-IL"); }
function when(s) { return "יום " + s.day + " " + s.date + ", " + s.start + "–" + s.end + (s.end_date ? " (עד " + s.end_date + ")" : ""); }
function firstWhen(d) { const s = (d.slots || [])[0]; return s ? s.date + " " + s.start : ""; }
function plain(html) {
  return html.replace(/<\/td><td/g, ": </td><td").replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|tr|h2|li)>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
}
function row(k, v) { return v === "" || v == null ? "" : "<tr><td style='padding:4px 0 4px 16px;color:#647063'>" + esc(k) + "</td><td style='padding:4px 0;font-weight:600'>" + v + "</td></tr>"; }
function slotsHtml(d) {
  const s = d.slots || [];
  if (s.length <= 1) return s[0] ? esc(when(s[0])) : "";
  return s.length + " מועדים:<br>" + s.map(x => esc(when(x))).join("<br>");
}
function wrap(title, body) {
  return "<div dir='rtl' style='font-family:Arial,sans-serif;font-size:15px;color:#1b2314;line-height:1.6;max-width:560px'>" +
    "<h2 style='color:#3f7d1c;margin:0 0 12px'>" + esc(title) + "</h2>" + body + "</div>";
}
function managerHtml(d) {
  return wrap("הזמנה חדשה", "<table style='border-collapse:collapse'>" +
    row("חדר", esc(d.room) + (d.building ? " · " + esc(d.building) : "")) + row("מתי", slotsHtml(d)) + row("אפשרות", esc(d.option)) +
    row("שוכר/ת", esc(d.name)) + row("טלפון", "<span dir='ltr'>" + esc(d.phone) + "</span>") + row("אימייל", esc(d.email)) +
    row("מטרה", esc(d.purpose)) + row("משתתפים", esc(d.people || "")) + row("תעריף", d.residency === "outside" ? "תושב/ת חוץ" : "תושב/ת קלחים") +
    row("סה״כ", money(d.total)) + (d.deposit ? row("פיקדון", money(d.deposit)) : "") + "</table>" +
    (d.site_url ? "<p><a href='" + esc(d.site_url) + "#admin' style='color:#3f7d1c'>למסך הניהול</a></p>" : ""));
}
function renterHtml(d) {
  const link = d.site_url ? d.site_url + "#my/" + d.token : "";
  return wrap("ההזמנה התקבלה, תודה!", "<p>שלום " + esc(d.name) + ", אלה פרטי ההזמנה שלך:</p><table style='border-collapse:collapse'>" +
    row("חדר", esc(d.room) + (d.building ? " · " + esc(d.building) : "")) + row("מתי", slotsHtml(d)) + row("אפשרות", esc(d.option)) +
    (d.address ? row("כתובת", esc(d.address)) : "") + row("לתשלום", money(d.total)) +
    (d.deposit ? row("פיקדון", money(d.deposit) + " (מוחזר אחרי הזדכות עם תמונות)") : "") + "</table>" +
    (d.pay_link ? "<p><a href='" + esc(d.pay_link) + "' style='background:#3f7d1c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block'>לתשלום</a></p>" : "") +
    (link ? "<p>הקישור האישי להזמנה (לביטול, ובסיום להזדכות): <a href='" + esc(link) + "' style='color:#3f7d1c'>" + esc(link) + "</a></p>" : "") +
    "<p><b>תנאי ביטול:</b> ביטול עד " + esc(d.refund_hours) + " שעות לפני מועד ההשכרה: החזר כספי מלא. ביטול מאוחר יותר: ללא החזר.</p>" +
    (d.rules ? "<p><b>נהלי השימוש:</b><br>" + esc(d.rules).replace(/\n/g, "<br>") + "</p>" : "") +
    (d.manager_phone ? "<p>לשאלות: " + esc(d.manager_name || "מנהל המבנים") + " · <span dir='ltr'>" + esc(d.manager_phone) + "</span></p>" : ""));
}
