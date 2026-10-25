/**
 * Creates (or reuses) a permanent Supabase account and lets it into /admin.
 *
 *   node scripts/create-admin.ts <email> <password>
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL. Locally, `npm run admin:local`
 * fills them in from `supabase status`. The service role key never leaves this script.
 */
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const [email, password] = process.argv.slice(2);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
if (!email || !password) {
  console.error('Usage: node scripts/create-admin.ts <email> <password>');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = postgres(DATABASE_URL, { prepare: false });

const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
let userId = created.data.user?.id;
if (!userId) {
  // Already registered: look the account up instead.
  const rows = await sql<{ id: string }[]>`select id from auth.users where email = ${email.toLowerCase()}`;
  userId = rows[0]?.id;
}
if (!userId) {
  console.error(created.error?.message ?? 'Could not create the account.');
  await sql.end();
  process.exit(1);
}
await sql`insert into public.admins (user_id) values (${userId}) on conflict do nothing`;
await sql.end();
console.log(`${email} can now sign in to /admin.`);
