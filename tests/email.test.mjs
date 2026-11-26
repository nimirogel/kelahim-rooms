// Local test of the new-booking email flow, with stand-ins for pg_net and Vault.
// Run: node tests/email.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create schema extensions; create schema net; create schema vault;
  create table net.sent (id bigserial primary key, url text, headers jsonb, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
    returns bigint language sql as $$ insert into net.sent (url, headers, body) values (url, headers, body) returning id $$;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);`);
const read = f => readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
await db.exec(read("schema.sql"));
await db.exec(read("email.sql").replace(/create extension if not exists pg_net;/g, ""));
const settings = { ...JSON.parse(read("settings.json")), notifyEmail: "manager@example.com", siteUrl: "https://example.org/" };
await db.query("update settings set data = $1 where id = 1", [settings]);
const call = async (fn, ...a) => (await db.query(`select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")}) as r`, a)).rows[0].r;
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const book = (extra = {}) => call("create_booking", { room_id: "beitam", option_id: "b1", name: "דנה", phone: "050-1234567", email: "dana@example.com", items: [{ date: day(10), start: "10:00", end: "12:00" }], ...extra });
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log("✓", n); };

await t("no email call until the script address is stored", async () => {
  await book();
  assert.equal((await db.query("select count(*)::int n from net.sent")).rows[0].n, 0);
});
await db.exec("insert into vault.decrypted_secrets values ('mail_webhook_url', 'https://script.google.com/macros/s/TEST/exec')");
let token;
await t("a new booking sends only its token to the script", async () => {
  token = (await book({ items: [{ date: day(11), start: "10:00", end: "12:00" }] })).token;
  const m = (await db.query("select * from net.sent order by id desc limit 1")).rows[0];
  assert.equal(m.url, "https://script.google.com/macros/s/TEST/exec");
  assert.deepEqual(Object.keys(m.body), ["token"]);
  assert.equal(m.body.token, token);
});
await t("the script gets full details once", async () => {
  const d = await call("claim_booking_mail", token);
  assert.equal(d.manager_email, "manager@example.com");
  assert.equal(d.email, "dana@example.com");
  assert.equal(d.room, "בית העם (המועדון הגדול)");
  assert.equal(d.total, 200); assert.equal(d.deposit, 500);
  assert.equal(d.slots.length, 1); assert.equal(d.slots[0].start, "10:00");
  assert.match(d.rules, /נקי/);
  assert.equal(await call("claim_booking_mail", token), null);
});
await t("wrong or old tokens get nothing", async () => {
  assert.equal(await call("claim_booking_mail", "nope"), null);
  const old = (await book({ items: [{ date: day(12), start: "10:00", end: "12:00" }] })).token;
  await db.query("update bookings set created_at = now() - interval '1 hour' where token = $1", [old]);
  assert.equal(await call("claim_booking_mail", old), null);
});
await t("a failed booking sends nothing", async () => {
  const before = (await db.query("select count(*)::int n from net.sent")).rows[0].n;
  try { await book({ items: [{ date: day(11), start: "11:00", end: "12:00" }] }); } catch (e) { assert.match(e.message, /clash/); }
  assert.equal((await db.query("select count(*)::int n from net.sent")).rows[0].n, before);
});
console.log(`\n${ok} tests passed`);
