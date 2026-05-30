import { Pool, PoolClient, QueryResultRow } from "pg";
import { env } from "./env";
import { sslFromConnectionString } from "./ssl";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: sslFromConnectionString(env.DATABASE_URL),
});

pool.on("error", (err) => {
  console.error("Unexpected pg pool error:", err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<T[]> {
  const result = await pool.query<T>(text, params as unknown[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>,
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// COUNT(*) returns bigint as a string. Centralize the cast so callers get a number.
export async function queryCount(text: string, params?: ReadonlyArray<unknown>): Promise<number> {
  const row = await queryOne<{ count: string }>(text, params);
  return row ? Number(row.count) : 0;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
