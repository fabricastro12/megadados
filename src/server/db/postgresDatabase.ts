import postgres from 'postgres';
import type { Database, SqlExecutor } from './database';

/**
 * Adapter over postgres.js. Point DATABASE_URL at Supabase's transaction pooler (port 6543);
 * the pooler cannot keep prepared statements, so they are turned off.
 */
export function createPostgresDatabase(url: string): Database {
  const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  const run = (client: postgres.Sql | postgres.TransactionSql): SqlExecutor => ({
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await client.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
      return rows as unknown as T[];
    },
  });
  return {
    ...run(sql),
    transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) => sql.begin((tx) => fn(run(tx))) as Promise<T>,
  };
}

let shared: Database | null = null;

/** One pool per server instance. */
export function serverDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  shared ??= createPostgresDatabase(url);
  return shared;
}
