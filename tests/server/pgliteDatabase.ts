import type { PGlite } from '@electric-sql/pglite';
import type { Database, SqlExecutor } from '@/server/db/database';

/** Test adapter: the same Database port, backed by in-process Postgres. */
export function pgliteDatabase(db: PGlite): Database {
  const exec = (client: Pick<PGlite, 'query'>): SqlExecutor => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await client.query<T>(text, params)).rows;
    },
  });
  return { ...exec(db), transaction: (fn) => db.transaction((tx) => fn(exec(tx))) };
}
