// Local test of the database logic, using PGlite (PostgreSQL in Node).
// Run: node tests/db.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { btree_gist } });
// Minimal stand-in for Supabase's auth schema
await db.exec(`create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
await db.exec(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
const settings = JSON.parse(readFileSync(new URL("../supabase/settings.json", import.meta.url), "utf8"));
await db.query("update settings set data = $1 where id = 1", [settings]);

const asAdmin = async on => db.exec(on ? "select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); insert into admins values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;" : "select set_config('test.uid', '', false);");
const call = async (fn, ...args) => (await db.query(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(", ")}) as r`, args)).rows[0].r;
const fails = async (p, msg) => { try { await p; assert.fail("expected failure: " + msg); } catch (e) { assert.match(e.message, new RegExp(msg)); } };

// future dates (Israel)
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
const D10 = day(10), D11 = day(11), D17 = day(17);
let ok = 0; const t = async (name, f) => { await f(); ok++; console.log("✓", name); };

await asAdmin(false);
await t("hourly booking: price from server, resident", async () => {
  const r = await call("create_booking", { room_id: "library", option_id: "l1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "10:00", end: "12:00" }] });
  assert.equal(r.total, 100);
  assert.equal(r.token.length, 64);
});
await t("non-resident pays 150%", async () => {
  const r = await call("create_booking", { room_id: "library", option_id: "l1", residency: "outside", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "14:00", end: "16:00" }] });
  assert.equal(r.total, 150);
});
await t("overlap in same room is rejected", async () => {
  await fails(call("create_booking", { room_id: "library", option_id: "l1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "11:00", end: "13:00" }] }), "clash");
});
await t("same time in another room is fine", async () => {
  const r = await call("create_booking", { room_id: "noar1", option_id: "n1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "11:00", end: "13:00" }] });
  assert.equal(r.total, 100);
});
await t("2-hour gap after a Beit Ha'am booking is enforced", async () => {
  await call("create_booking", { room_id: "beitam", option_id: "b1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D11, start: "10:00", end: "12:00" }] });
  await fails(call("create_booking", { room_id: "beitam", option_id: "b1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D11, start: "13:00", end: "14:00" }] }), "clash");
  await fails(call("create_booking", { room_id: "beitam", option_id: "b1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D11, start: "08:30", end: "09:00" }] }), "clash");
  const r = await call("create_booking", { room_id: "beitam", option_id: "b1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D11, start: "14:00", end: "15:00" }] });
  assert.equal(r.total, 100);
});
await t("24h block across midnight, price 600, deposit 500", async () => {
  const r = await call("create_booking", { room_id: "zahav", option_id: "z2", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "18:00", end: "18:00", end_date: day(11) }] });
  assert.equal(r.total, 600);
  const b = (await db.query("select deposit from bookings where token = $1", [r.token])).rows[0];
  assert.equal(b.deposit, 500);
});
await t("price sent by the browser is ignored", async () => {
  const r = await call("create_booking", { room_id: "clinic", option_id: "c1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D10, start: "09:00", end: "10:00", price: 1 }] });
  assert.equal(r.total, 20);
});
await t("recurring booking: all-or-nothing", async () => {
  const items = [D10, D17].map(d => ({ date: d, start: "19:00", end: "20:00" }));
  const r = await call("create_booking", { room_id: "hugim", option_id: "h1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", repeat: "weekly", items });
  assert.equal(r.count, 2); assert.equal(r.total, 120);
  await fails(call("create_booking", { room_id: "hugim", option_id: "h1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: day(24), start: "19:00", end: "20:00" }, { date: D17, start: "19:30", end: "20:30" }] }), "clash");
  const n = (await db.query("select count(*)::int n from slots where room_id = 'hugim' and date = $1", [day(24)])).rows[0].n;
  assert.equal(n, 0);
});
await t("past time rejected for renters", async () => {
  await fails(call("create_booking", { room_id: "library", option_id: "l1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: day(-1), start: "10:00", end: "11:00" }] }), "past_time");
});
await t("missing or invalid email rejected for renters", async () => {
  await fails(call("create_booking", { room_id: "library", option_id: "l1", name: "בדיקה", phone: "050-1234567", items: [{ date: D17, start: "12:00", end: "13:00" }] }), "missing_email");
  await fails(call("create_booking", { room_id: "library", option_id: "l1", name: "בדיקה", phone: "050-1234567", email: "not-an-email", items: [{ date: D17, start: "12:00", end: "13:00" }] }), "missing_email");
});
await t("missing name/phone rejected", async () => {
  await fails(call("create_booking", { room_id: "library", option_id: "l1", name: "", phone: "1", items: [{ date: D17, start: "10:00", end: "11:00" }] }), "missing_details");
});
await t("get_bookings returns only the renter's own booking", async () => {
  const r = await call("create_booking", { room_id: "court", option_id: "t1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D17, start: "18:00", end: "19:00" }] });
  const list = await call("get_bookings", [r.token]);
  assert.equal(list.length, 1); assert.equal(list[0].slots.length, 1); assert.equal(list[0].slots[0].price, 25);
  assert.equal((await call("get_bookings", ["nope"])).length, 0);
});
await t("cancel > 24h before: full refund, slot freed", async () => {
  const r = await call("create_booking", { room_id: "soccer", option_id: "s1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D17, start: "16:00", end: "17:00" }] });
  const c = await call("cancel_booking", r.token, null);
  assert.equal(c.cancelled, 1); assert.equal(c.full_refund, 1);
  const again = await call("create_booking", { room_id: "soccer", option_id: "s1", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D17, start: "16:00", end: "17:00" }] });
  assert.equal(again.total, 25);
});
await t("cancel < 24h before: no refund", async () => {
  const soon = new Date(Date.now() + 3 * 3600e3);
  const d = soon.toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" }), h = soon.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  const end = new Date(soon.getTime() + 3600e3).toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false });
  if (end <= h) return; // crosses midnight; skip on late-night runs
  const r = await call("create_booking", { room_id: "noar3", option_id: "n3", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: d, start: h, end }] });
  const c = await call("cancel_booking", r.token, null);
  assert.equal(c.full_refund, 0);
});
await t("checkout only after start, only once", async () => {
  const r = await call("create_booking", { room_id: "noar2", option_id: "n2", name: "בדיקה", phone: "050-1234567", email: "t@example.com", items: [{ date: D17, start: "10:00", end: "11:00" }] });
  const sid = (await call("get_bookings", [r.token]))[0].slots[0].id;
  await fails(call("submit_checkout", r.token, sid, ["a.jpg"], "", "upload"), "checkout_not_allowed");
  await db.query("update slots set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour', blocked = tstzrange(now() - interval '2 hours', now() - interval '1 hour') where id = $1", [sid]);
  await call("submit_checkout", r.token, sid, [r.token + "/a.jpg", r.token + "/b.jpg"], "נקי", "upload");
  const s = (await db.query("select deposit_status, checkout from slots where id = $1", [sid])).rows[0];
  assert.equal(s.deposit_status, "review"); assert.equal(s.checkout.photos.length, 2);
  await fails(call("submit_checkout", r.token, sid, ["c.jpg"], "", "upload"), "checkout_not_allowed");
  await fails(call("submit_checkout", "wrong-token", sid, ["c.jpg"], "", "upload"), "checkout_not_allowed");
});
await t("admin manual booking: custom price and paid status", async () => {
  await asAdmin(true);
  const r = await call("create_booking", { room_id: "library", source: "manual", status: "paid", name: "ידני", phone: "050-7654321", items: [{ date: D17, start: "08:00", end: "09:00", price: 0 }] });
  const s = (await db.query("select s.status, s.price, b.source from slots s join bookings b on b.id = s.booking_id where b.token = $1", [r.token])).rows[0];
  assert.deepEqual([s.status, s.price, s.source], ["paid", 0, "manual"]);
  await asAdmin(false);
});
await t("public view hides personal details", async () => {
  const cols = (await db.query("select * from public_slots limit 1")).fields.map(f => f.name);
  assert.deepEqual(cols.sort(), ["date", "end_date", "end_time", "id", "room_id", "start_time"].sort());
});
console.log(`\n${ok} tests passed`);
