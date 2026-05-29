/**
 * Migration runner — Alembic-style, for raw SQL migrations on Supabase Postgres.
 *
 * Each file in `migrations/` is named `NNN_description.sql` and contains two
 * sections marked with comments:
 *
 *   -- +migrate Up
 *   <statements applied on `up`>
 *
 *   -- +migrate Down
 *   <statements applied on `down`>
 *
 * Applied versions are recorded in the `schema_migrations` table (the audit
 * trail): version, name, checksum, applied_at, applied_by, exec_ms.
 *
 * Commands (see package.json db:* scripts):
 *   up [n]          apply all pending migrations (or just the next n)
 *   down [n]        roll back the last applied migration (or the last n)
 *   status          show applied vs pending, flag drift
 *   create <name>   scaffold a new migration file
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = resolve(__dirname, "../../migrations");
const FILE_RE = /^(\d+)_(.+)\.sql$/;
// Stable arbitrary key so concurrent runners can't apply migrations at once.
const ADVISORY_LOCK_KEY = 947382;

interface Migration {
  version: string;
  name: string;
  file: string;
  up: string;
  down: string;
  checksum: string;
}

function splitDirections(raw: string): { up: string; down: string } {
  const up: string[] = [];
  const down: string[] = [];
  let section: "none" | "up" | "down" = "none";
  for (const line of raw.split(/\r?\n/)) {
    if (/^--\s*\+migrate\s+up\s*$/i.test(line)) {
      section = "up";
      continue;
    }
    if (/^--\s*\+migrate\s+down\s*$/i.test(line)) {
      section = "down";
      continue;
    }
    if (section === "up") up.push(line);
    else if (section === "down") down.push(line);
  }
  // No markers => legacy file, treat the whole thing as Up (no rollback).
  if (section === "none") return { up: raw.trim(), down: "" };
  return { up: up.join("\n").trim(), down: down.join("\n").trim() };
}

function loadMigrations(): Migration[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILE_RE.test(f))
    .map((file) => {
      const [, version, name] = file.match(FILE_RE)!;
      const { up, down } = splitDirections(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      const checksum = createHash("sha256").update(up).digest("hex").slice(0, 16);
      return { version, name, file, up, down, checksum };
    })
    .sort((a, b) => Number(a.version) - Number(b.version));
}

function makeClient(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to .env before running migrations.");
  }
  // Supabase requires TLS; the direct host's cert chain isn't worth verifying for a CLI.
  return new Client({ connectionString, ssl: { rejectUnauthorized: false } });
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL DEFAULT current_user,
      exec_ms    integer
    );
  `);
}

interface AppliedRow {
  checksum: string;
  applied_at: Date;
}

async function getApplied(client: Client): Promise<Map<string, AppliedRow>> {
  const { rows } = await client.query(
    "SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version",
  );
  const map = new Map<string, AppliedRow>();
  for (const r of rows) map.set(r.version, { checksum: r.checksum, applied_at: r.applied_at });
  return map;
}

async function withLock<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
  try {
    return await fn();
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  }
}

async function cmdStatus(): Promise<void> {
  const migrations = loadMigrations();
  const client = makeClient();
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    console.log("\nMigration status:\n");
    if (migrations.length === 0) console.log("  (no migration files found)");
    for (const m of migrations) {
      const a = applied.get(m.version);
      if (!a) {
        console.log(`  [ ] ${m.version}_${m.name}  — pending`);
      } else {
        const drift = a.checksum !== m.checksum ? "  ⚠ MODIFIED since applied" : "";
        console.log(`  [x] ${m.version}_${m.name}  — applied ${a.applied_at.toISOString()}${drift}`);
      }
    }
    for (const [version, a] of applied) {
      if (!migrations.some((m) => m.version === version)) {
        console.log(`  [?] ${version}  — recorded ${a.applied_at.toISOString()} but file is missing`);
      }
    }
    console.log("");
  } finally {
    await client.end();
  }
}

async function cmdUp(limit?: number): Promise<void> {
  const migrations = loadMigrations();
  const client = makeClient();
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    await withLock(client, async () => {
      const applied = await getApplied(client);
      const pending = migrations.filter((m) => !applied.has(m.version));
      if (pending.length === 0) {
        console.log("Already up to date. Nothing to apply.");
        return;
      }
      const toRun = limit ? pending.slice(0, limit) : pending;
      for (const m of toRun) {
        if (!m.up) {
          console.log(`Skipping ${m.version}_${m.name}: empty Up section.`);
          continue;
        }
        process.stdout.write(`Applying ${m.version}_${m.name} ... `);
        const start = Date.now();
        try {
          await client.query("BEGIN");
          await client.query(m.up);
          const ms = Date.now() - start;
          await client.query(
            "INSERT INTO schema_migrations (version, name, checksum, exec_ms) VALUES ($1, $2, $3, $4)",
            [m.version, m.name, m.checksum, ms],
          );
          await client.query("COMMIT");
          console.log(`done (${ms}ms)`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.log("FAILED");
          throw err;
        }
      }
      console.log(`\nApplied ${toRun.length} migration(s).`);
    });
  } finally {
    await client.end();
  }
}

async function cmdDown(limit: number): Promise<void> {
  const migrations = loadMigrations();
  const client = makeClient();
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    await withLock(client, async () => {
      const applied = await getApplied(client);
      const toRollback = [...applied.keys()].sort((a, b) => Number(b) - Number(a)).slice(0, limit);
      if (toRollback.length === 0) {
        console.log("No applied migrations to roll back.");
        return;
      }
      for (const version of toRollback) {
        const m = migrations.find((x) => x.version === version);
        if (!m) {
          throw new Error(`Cannot roll back ${version}: its file is missing from migrations/.`);
        }
        if (!m.down) {
          throw new Error(
            `Migration ${m.version}_${m.name} has no Down section; refusing to roll back. ` +
              `Add a "-- +migrate Down" block, or remove its schema_migrations row manually.`,
          );
        }
        process.stdout.write(`Rolling back ${m.version}_${m.name} ... `);
        try {
          await client.query("BEGIN");
          await client.query(m.down);
          await client.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
          await client.query("COMMIT");
          console.log("done");
        } catch (err) {
          await client.query("ROLLBACK");
          console.log("FAILED");
          throw err;
        }
      }
      console.log(`\nRolled back ${toRollback.length} migration(s).`);
    });
  } finally {
    await client.end();
  }
}

function cmdCreate(name?: string): void {
  if (!name) {
    throw new Error("Usage: npm run db:new <name>  (e.g. npm run db:new add_orders_table)");
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const migrations = loadMigrations();
  const next = migrations.length ? Math.max(...migrations.map((m) => Number(m.version))) + 1 : 1;
  const version = String(next).padStart(3, "0");
  const file = `${version}_${slug}.sql`;
  const template = `-- Migration ${version}: ${slug}\n\n-- +migrate Up\n\n\n-- +migrate Down\n\n`;
  writeFileSync(join(MIGRATIONS_DIR, file), template, { flag: "wx" });
  console.log(`Created migrations/${file}`);
}

function usage(): void {
  console.log("Usage: migrate <command>\n");
  console.log("  up [n]         apply all pending migrations (or just the next n)");
  console.log("  down [n]       roll back the last applied migration (or the last n)");
  console.log("  status         show applied vs pending");
  console.log("  create <name>  scaffold a new migration file");
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "up":
      await cmdUp(arg ? Number(arg) : undefined);
      break;
    case "down":
      await cmdDown(arg ? Number(arg) : 1);
      break;
    case "status":
      await cmdStatus();
      break;
    case "create":
      cmdCreate(arg);
      break;
    default:
      usage();
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("\nMigration error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
