/**
 * Demo data seeder — populates the customer home dashboard for the "vishalmeti"
 * user so it isn't empty during development.
 *
 * Idempotent: re-running updates the same rows instead of duplicating, because
 * every seeded row uses a deterministic UUID (uuid v5 of a stable key).
 *
 * Run with:  npm run db:seed
 */
import "dotenv/config";
import { v5 as uuidv5 } from "uuid";
import bcrypt from "bcryptjs";
import { pool, query, queryOne } from "../config";

// The library's DNS namespace gives stable UUIDs across runs from a string key.
const sid = (key: string) => uuidv5(`sikka-seed:${key}`, uuidv5.DNS);

const CUSTOMER = { username: "vishalmeti", name: "Vishal Meti", password: "sikka123" };
const OWNER = { username: "sikka_demo_owner", name: "Sikka Demo Owner", password: "sikka123" };

const now = Date.now();
const DAY = 86_400_000;
const isoDaysAgo = (d: number) => new Date(now - d * DAY).toISOString();
const dateDaysAgo = (d: number) => new Date(now - d * DAY).toISOString().slice(0, 10);

interface StoreSpec {
  key: string;
  name: string;
  upi: string;
  wallet: { balance: number; totalEarned: number; tier: string; streak: number; lastVisit: number };
  txs: { amt: number; d: number }[];
  redemptions: { coins: number; rupee: number; bill: number; d: number }[];
}

const STORES: StoreSpec[] = [
  {
    key: "demo-store-lakshmi",
    name: "Sri Lakshmi Stores",
    upi: "srilakshmi.demo@okaxis",
    wallet: { balance: 540, totalEarned: 620, tier: "gold", streak: 7, lastVisit: 0 },
    txs: [
      { amt: 1200, d: 0 },
      { amt: 800, d: 1 },
      { amt: 1500, d: 4 },
      { amt: 600, d: 9 },
    ],
    redemptions: [{ coins: 100, rupee: 50, bill: 300, d: 2 }],
  },
  {
    key: "demo-store-anand",
    name: "Anand Kirana",
    upi: "anandkirana.demo@okhdfcbank",
    wallet: { balance: 180, totalEarned: 300, tier: "silver", streak: 3, lastVisit: 1 },
    txs: [
      { amt: 900, d: 1 },
      { amt: 1100, d: 6 },
    ],
    redemptions: [],
  },
  {
    key: "demo-store-royal",
    name: "Royal Provision",
    upi: "royalprovision.demo@oksbi",
    wallet: { balance: 90, totalEarned: 120, tier: "bronze", streak: 1, lastVisit: 3 },
    txs: [{ amt: 2400, d: 3 }],
    redemptions: [],
  },
];

async function ensureUser(spec: { username: string; name: string; password: string }, role: string) {
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM profiles WHERE lower(username) = lower($1)",
    [spec.username],
  );
  if (existing) return { id: existing.id, created: false };

  const id = sid(`profile-${spec.username}`);
  const hash = await bcrypt.hash(spec.password, 10);
  await query(
    `INSERT INTO profiles (id, username, password_hash, name, role)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, spec.username, hash, spec.name, role],
  );
  return { id, created: true };
}

async function main() {
  console.log("Seeding demo dashboard data...\n");

  const owner = await ensureUser(OWNER, "owner");
  console.log(`Owner  : ${OWNER.username} (${owner.created ? "created" : "existing"})`);

  const customer = await ensureUser(CUSTOMER, "customer");
  console.log(`Customer: ${CUSTOMER.username} (${customer.created ? "created" : "existing"})`);

  for (const s of STORES) {
    await query(
      `INSERT INTO stores (id, owner_id, name, upi_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, upi_id = EXCLUDED.upi_id, is_active = EXCLUDED.is_active`,
      [sid(s.key), owner.id, s.name, s.upi],
    );

    await query(
      `INSERT INTO coin_wallets
         (id, customer_id, store_id, balance, total_earned, streak_days, last_visit_date, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (customer_id, store_id) DO UPDATE
         SET balance = EXCLUDED.balance,
             total_earned = EXCLUDED.total_earned,
             streak_days = EXCLUDED.streak_days,
             last_visit_date = EXCLUDED.last_visit_date,
             tier = EXCLUDED.tier`,
      [
        sid(`wallet-${s.key}`),
        customer.id,
        sid(s.key),
        s.wallet.balance,
        s.wallet.totalEarned,
        s.wallet.streak,
        dateDaysAgo(s.wallet.lastVisit),
        s.wallet.tier,
      ],
    );

    for (let i = 0; i < s.txs.length; i++) {
      const t = s.txs[i];
      const key = `${s.key}-tx-${i}`;
      await query(
        `INSERT INTO transactions
           (id, customer_id, store_id, amount, coins_earned,
            razorpay_order_id, razorpay_payment_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8)
         ON CONFLICT (id) DO UPDATE
           SET amount = EXCLUDED.amount,
               coins_earned = EXCLUDED.coins_earned,
               status = EXCLUDED.status,
               created_at = EXCLUDED.created_at`,
        [
          sid(key),
          customer.id,
          sid(s.key),
          t.amt,
          Math.round(t.amt * 0.05),
          `order_seed_${key}`,
          `pay_seed_${key}`,
          isoDaysAgo(t.d),
        ],
      );
    }

    for (let i = 0; i < s.redemptions.length; i++) {
      const r = s.redemptions[i];
      const key = `${s.key}-red-${i}`;
      await query(
        `INSERT INTO redemption_requests
           (id, customer_id, store_id, coins_to_redeem, rupee_value, bill_amount,
            status, requested_at, resolved_at, resolved_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET coins_to_redeem = EXCLUDED.coins_to_redeem,
               rupee_value = EXCLUDED.rupee_value,
               bill_amount = EXCLUDED.bill_amount,
               status = EXCLUDED.status,
               requested_at = EXCLUDED.requested_at,
               resolved_at = EXCLUDED.resolved_at,
               resolved_by = EXCLUDED.resolved_by`,
        [
          sid(key),
          customer.id,
          sid(s.key),
          r.coins,
          r.rupee,
          r.bill,
          isoDaysAgo(r.d),
          owner.id,
        ],
      );
    }
  }

  const totalCoins = STORES.reduce((sum, s) => sum + s.wallet.balance, 0);
  const txCount = STORES.reduce((sum, s) => sum + s.txs.length, 0);
  const redCount = STORES.reduce((sum, s) => sum + s.redemptions.length, 0);
  console.log(
    `\nSeeded ${STORES.length} stores, ${txCount} transactions, ${redCount} redemption(s).`,
  );
  console.log(`Total balance on dashboard: ${totalCoins} coins.`);
  if (customer.created) {
    console.log(`\nLogin as  username: ${CUSTOMER.username}  password: ${CUSTOMER.password}`);
  } else {
    console.log(`\nLog in as "${CUSTOMER.username}" with your existing password.`);
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\nSeed failed:", err instanceof Error ? err.message : err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
