/** The only database surface the server code depends on (port). */
/**
 * Send JSON as a `JSON.stringify` string cast with `$n::text::jsonb`. Drivers serialize a
 * parameter typed jsonb on their own (postgres.js would encode the string a second time).
 */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends SqlExecutor {
  /** Runs `fn` in one transaction; row locks taken inside are held until it commits. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
