/**
 * Decide pg's SSL config from a connection string's `sslmode=` parameter.
 *
 * - Omitted or `disable`  -> no TLS (local Postgres typically doesn't speak it)
 * - Anything else         -> TLS with relaxed cert verification, since managed
 *                            Postgres (Supabase, RDS, etc.) often presents certs
 *                            that don't verify against the system trust store
 */
export function sslFromConnectionString(
  connectionString: string,
): false | { rejectUnauthorized: false } {
  const mode = connectionString.match(/[?&]sslmode=([^&\s]+)/i)?.[1]?.toLowerCase();
  if (!mode || mode === "disable") return false;
  return { rejectUnauthorized: false };
}
