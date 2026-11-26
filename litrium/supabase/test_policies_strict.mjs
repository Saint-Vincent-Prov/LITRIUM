import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const db = new PGlite();
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok -", m); };
// --- minimal stand-in for what Supabase provides
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create publication supabase_realtime;
`);
await db.exec(fs.readFileSync(new URL("./migrations/0001_init.sql", import.meta.url), "utf8"));
await db.exec(fs.readFileSync(new URL("./migrations/0002_grants.sql", import.meta.url), "utf8"));
ok(true, "migration applies");

const mk = async (email, name) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { full_name: name }])).rows[0].id;
const as = async (uid, sql, params = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
};
const fails = async (fn) => { try { await fn(); return false; } catch (e) { return e.message; } };

const A = await mk("Ana@Ex.fr", "Ana"), B = await mk("bob@ex.fr", "Bob"), C = await mk("cy@ex.fr", "Cy");
ok((await as(A, "select name, email from profiles where id = auth.uid()")).rows[0]?.email === "ana@ex.fr", "profile created with lower-cased email");
ok((await as(A, "select count(*)::int n from cities")).rows[0].n === 1 && (await as(A, "select count(*)::int n from notes")).rows[0].n === 1, "starter city + welcome note");

// personal data isolation
await as(A, `insert into events (title, start_at, end_at) values ('Dentiste', now(), now() + interval '1 hour')`);
ok((await as(B, "select count(*)::int n from events")).rows[0].n === 0, "B cannot see A's events");
ok(await fails(() => as(B, `insert into events (user_id, title, start_at, end_at) values ('${A}', 'x', now(), now())`)), "B cannot write into A's events");
ok(!!(await fails(() => as(null, "select * from events"))) || (await as(null, "select count(*)::int n from events")).rows[0].n === 0, "anonymous sees nothing");
ok(await fails(() => as(A, `insert into alarms (time) values ('25:00')`)), "invalid alarm time rejected");

// profiles hidden until related
ok((await as(A, "select count(*)::int n from profiles")).rows[0].n === 1, "A sees only own profile before friendships");
ok(await fails(() => as(A, "update profiles set email = 'bob@ex.fr' where id = auth.uid()")), "cannot change own email (anti-impersonation)");
await as(A, "update profiles set name = 'Ana B.' where id = auth.uid()");
ok((await as(A, "select name from profiles where id = auth.uid()")).rows[0].name === "Ana B.", "can rename self");

// messaging needs friendship
ok(await fails(() => as(A, `insert into messages (recipient, body) values ('${B}', 'hi')`)), "cannot message a non-friend");
let r = (await as(A, "select add_friend_by_email('BOB@ex.fr') r")).rows[0].r;
ok(r.outcome === "requested" && r.name === "Bob", "A requests B");
ok(await fails(() => as(A, "select add_friend_by_email('bob@ex.fr')")), "duplicate request rejected");
ok(await fails(() => as(A, "select add_friend_by_email('ana@ex.fr')")), "cannot add self");
ok(await fails(() => as(A, `insert into messages (recipient, body) values ('${B}', 'hi')`)), "pending is not enough to message");
ok((await as(B, "select count(*)::int n from profiles")).rows[0].n === 2, "B can see A's profile (pending request)");
ok((await as(C, "select count(*)::int n from friendships")).rows[0].n === 0, "C sees no one else's friendships");
ok(await fails(() => as(A, `select respond_to_friend('${B}', true)`)), "requester cannot accept own request");
await as(B, `select respond_to_friend('${A}', true)`);
await as(A, `insert into messages (recipient, body) values ('${B}', 'Salut Bob')`);
ok((await as(B, "select body from messages")).rows[0]?.body === "Salut Bob", "B receives A's message");
ok((await as(C, "select count(*)::int n from messages")).rows[0].n === 0, "C cannot read their messages");
ok(await fails(() => as(A, `insert into messages (sender, recipient, body) values ('${B}', '${A}', 'fake')`)), "cannot send as someone else");
ok(await fails(() => as(B, "update messages set body = 'edited'")), "recipient cannot edit body");
await as(B, "update messages set read_at = now() where recipient = auth.uid()");
ok((await as(A, "select read_at is not null r from messages")).rows[0].r, "recipient can mark as read");
ok((await as(A, "update messages set read_at = null returning id")).rows.length === 0, "sender cannot change read state");

// invitation to an e-mail without account, then they sign up
r = (await as(A, "select add_friend_by_email('dana@ex.fr') r")).rows[0].r;
ok(r.outcome === "invited", "invite unknown email");
const D = await mk("Dana@ex.fr", "Dana");
ok((await as(D, "select count(*)::int n from friendships where addressee = auth.uid() and status = 'pending'")).rows[0].n === 1, "invite becomes a request when Dana signs up");
r = (await as(D, "select add_friend_by_email('ana@ex.fr') r")).rows[0].r;
ok(r.outcome === "accepted", "adding someone who already asked you accepts it");

// AI cap
for (let i = 0; i < 3; i++) await as(A, "select bump_ai_usage(3)");
ok(await fails(() => as(A, "select bump_ai_usage(3)")), "AI daily cap enforced");
ok(await fails(() => as(null, "select bump_ai_usage(3)")), "anonymous cannot use AI");

// delete account cascades
await as(B, "select delete_my_account()");
ok((await db.query(`select count(*)::int n from auth.users where id = '${B}'`)).rows[0].n === 0, "account deleted");
ok((await db.query(`select count(*)::int n from messages`)).rows[0].n === 0, "B's messages gone with the account");
ok((await as(A, "select count(*)::int n from events")).rows[0].n === 1, "A's data untouched");
