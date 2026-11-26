// Local test of the admin edit/delete functions, using PGlite.
// Run: node tests/admin.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;`);
const read = f => readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
await db.exec(read("schema.sql"));
await db.exec(read("admin-edit.sql"));
await db.query("update settings set data = $1 where id = 1", [JSON.parse(read("settings.json"))]);
const as = on => db.exec(on ? "select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); insert into admins values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;" : "select set_config('test.uid', '', false);");
const call = async (fn, ...a) => (await db.query(`select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")}) as r`, a)).rows[0].r;
const fails = async (p, msg) => { try { await p; assert.fail("expected " + msg); } catch (e) { assert.match(e.message, new RegExp(msg)); } };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const slotsOf = async tok => (await db.query("select s.* from slots s join bookings b on b.id = s.booking_id where b.token = $1 order by starts_at", [tok])).rows;
const bk = async tok => (await db.query("select * from bookings where token = $1", [tok])).rows[0];
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log("✓", n); };

const base = { room_id: "beitam", option_id: "b1", name: "דנה", phone: "050-1234567", email: "d@example.com" };
const a = (await call("create_booking", { ...base, items: [{ date: day(10), start: "10:00", end: "12:00" }, { date: day(17), start: "10:00", end: "12:00" }] })).token;
const sA = await slotsOf(a);

await t("renters cannot edit or delete", async () => {
  await fails(call("admin_update_slot", { slot_id: sA[0].id, price: 1 }), "not_admin");
  await fails(call("admin_delete_slot", sA[0].id, false), "not_admin");
});
await as(true);
await t("admin sets a different price; total follows", async () => {
  await call("admin_update_slot", { slot_id: sA[0].id, price: 50 });
  assert.equal((await slotsOf(a))[0].price, 50);
  assert.equal((await bk(a)).total, 250);
});
await t("admin edits renter details", async () => {
  await call("admin_update_slot", { slot_id: sA[0].id, name: "דנה כהן", phone: "052-7654321", email: "", purpose: "יום הולדת", people: "30", residency: "outside" });
  const b = await bk(a);
  assert.deepEqual([b.name, b.phone, b.email, b.purpose, b.people, b.residency], ["דנה כהן", "052-7654321", null, "יום הולדת", 30, "outside"]);
  await fails(call("admin_update_slot", { slot_id: sA[0].id, name: "x" }), "missing_details");
  await fails(call("admin_update_slot", { slot_id: sA[0].id, email: "bad" }), "missing_email");
});
await t("admin moves a date and time; buffer and clashes still apply", async () => {
  await call("admin_update_slot", { slot_id: sA[0].id, date: day(11), start: "16:00", end: "19:00" });
  const s = (await slotsOf(a))[0];
  assert.deepEqual([String(s.date.toISOString?.() ?? s.date).slice(0, 10), s.start_time, s.end_time], [day(11), "16:00", "19:00"]);
  const other = (await call("create_booking", { ...base, items: [{ date: day(12), start: "10:00", end: "12:00" }] })).token;
  await fails(call("admin_update_slot", { slot_id: (await slotsOf(other))[0].id, date: day(11), start: "20:00", end: "21:00" }), "clash");
  await fails(call("admin_update_slot", { slot_id: sA[0].id, start: "19:00", end: "18:00" }), "bad_time");
});
await t("delete one date keeps the rest; delete whole booking removes all", async () => {
  await call("admin_delete_slot", sA[0].id, false);
  assert.equal((await slotsOf(a)).length, 1);
  assert.equal((await bk(a)).total, 200);
  const n = await call("admin_delete_slot", sA[1].id, true);
  assert.equal(n, 1);
  assert.equal(await bk(a), undefined);
});
await t("deleting the last date removes the booking", async () => {
  const c = (await call("create_booking", { ...base, items: [{ date: day(30), start: "10:00", end: "12:00" }] })).token;
  await call("admin_delete_slot", (await slotsOf(c))[0].id, false);
  assert.equal(await bk(c), undefined);
});
console.log(`\n${ok} tests passed`);
