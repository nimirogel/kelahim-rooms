// Local test of the WhatsApp reminder job, with stand-ins for pg_net, Vault and pg_cron.
// Run: node tests/whatsapp.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { btree_gist } });
await db.exec(`create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create schema extensions; create schema net; create schema vault;
  create table net.sent (id bigserial primary key, url text, headers jsonb, body jsonb);
  create table net._http_response (id bigint primary key, status_code int, content text, error_msg text);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
    returns bigint language sql as $$ insert into net.sent (url, headers, body) values (url, headers, body) returning id $$;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);`);
const read = f => readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
await db.exec(read("schema.sql"));
await db.exec(read("whatsapp.sql").replace(/create extension if not exists pg_(net|cron);/g, ""));
const settings = JSON.parse(read("settings.json"));
await db.query("update settings set data = $1 where id = 1", [settings]);

const call = async (fn, ...a) => (await db.query(`select public.${fn}(${a.map((_, i) => "$" + (i + 1)).join(",")}) as r`, a)).rows[0].r;
const book = async (room, opt, hoursFromNow, phone = "050-1234567") => {
  const t = new Date(Date.now() + hoursFromNow * 3600e3);
  const date = t.toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const hh = t.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }).slice(0, 2);
  const start = hh + ":00", end = String((Number(hh) + 1) % 24).padStart(2, "0") + ":00";
  if (end === "00:00") return null;
  return call("create_booking", { room_id: room, option_id: opt, name: "דנה", phone, items: [{ date, start, end }] });
};
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log("✓", n); };

await t("phone numbers become 9725…", async () => {
  assert.equal(await call("wa_number", "050-123-4567"), "972501234567");
  assert.equal(await call("wa_number", "+972 50 1234567"), "972501234567");
});
const soon = await book("library", "l1", 5);      // inside the 24h window
const later = await book("noar1", "n1", 24 * 5);  // outside the window
await book("noar2", "n2", 6, "123456789");         // too short for WhatsApp: skipped
await t("only bookings in the next 24h with a valid phone are due", async () => {
  const due = (await db.query("select * from due_reminders()")).rows;
  if (soon) { assert.equal(due.length, 1); assert.equal(due[0].room, "ספרייה"); assert.match(due[0].day, /^יום /); }
});
await t("nothing is sent while the feature is off", async () => {
  assert.equal(await call("send_due_reminders"), 0);
  assert.equal((await db.query("select count(*)::int n from net.sent")).rows[0].n, 0);
});
await t("nothing is sent without the Meta secrets", async () => {
  await db.query("update settings set data = data || '{\"waAuto\": true}'::jsonb");
  assert.equal(await call("send_due_reminders"), 0);
});
await t("sends a Meta template message and marks it", async () => {
  await db.exec("insert into vault.decrypted_secrets values ('wa_token', 'TEST'), ('wa_phone_id', '123456')");
  const n = await call("send_due_reminders");
  if (!soon) return;
  assert.equal(n, 1);
  const m = (await db.query("select * from net.sent")).rows[0];
  assert.equal(m.url, "https://graph.facebook.com/v21.0/123456/messages");
  assert.equal(m.headers.Authorization, "Bearer TEST");
  assert.equal(m.body.to, "972501234567");
  assert.equal(m.body.template.name, "booking_reminder");
  assert.equal(m.body.template.language.code, "he");
  assert.equal(m.body.template.components[0].parameters.length, 4);
  assert.equal(m.body.template.components[0].parameters[0].text, "דנה");
  const s = (await db.query("select reminder_via, reminded_at from slots where reminder_request = $1", [m.id])).rows[0];
  assert.equal(s.reminder_via, "whatsapp"); assert.ok(s.reminded_at);
});
await t("a reminder is never sent twice", async () => {
  assert.equal(await call("send_due_reminders"), 0);
});
await t("a failed send is flagged for the manager and not retried", async () => {
  if (!soon) return;
  const id = (await db.query("select id from net.sent limit 1")).rows[0].id;
  await db.query("insert into net._http_response values ($1, 400, '{\"error\":\"template not approved\"}', null)", [id]);
  assert.equal(await call("send_due_reminders"), 0);
  const s = (await db.query("select reminder_via, reminded_at, reminder_error from slots where reminder_request = $1", [id])).rows[0];
  assert.equal(s.reminder_via, "whatsapp_failed"); assert.equal(s.reminded_at, null); assert.match(s.reminder_error, /template/);
  assert.equal((await db.query("select count(*)::int n from net.sent")).rows[0].n, 1);
});
await t("cancelled bookings get no reminder", async () => {
  const r = await book("court", "t1", 3);
  if (!r) return;
  await call("cancel_booking", r.token, null);
  assert.equal(await call("send_due_reminders"), 0);
});
console.log(`\n${ok} tests passed`);
