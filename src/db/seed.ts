/**
 * Demo data seeder — populates the customer home dashboard for the "vishalmeti"
 * user so it isn't empty during development.
 *
 * Idempotent: re-running updates the same rows instead of duplicating, because
 * every seeded row uses a deterministic UUID (uuid v5 of a stable key).
 *
 * It uses the service-role client, which bypasses RLS and can create the auth
 * users it needs. Run with:  npm run db:seed
 */
import "dotenv/config";
import { v5 as uuidv5 } from "uuid";
import { supabaseAdmin } from "../config";

// The library's DNS namespace gives stable UUIDs across runs from a string key.
const sid = (key: string) => uuidv5(`sikka-seed:${key}`, uuidv5.DNS);

const emailFor = (username: string) => `${username}@sikka.local`;

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

async function findUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureUser(spec: { username: string; password: string }, role: string) {
  const email = emailFor(spec.username);
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: spec.password,
    email_confirm: true,
    user_metadata: { username: spec.username, role },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create auth user ${spec.username}`);
  return { id: data.user.id, created: true };
}

async function ensureProfile(id: string, username: string, name: string, role: string) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ id, username, name, role }, { onConflict: "id" });
  if (error) throw error;
}

async function upsert(table: string, rows: any[], onConflict: string) {
  if (rows.length === 0) return;
  const { error } = await supabaseAdmin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Upsert into ${table} failed: ${error.message}`);
}

async function main() {
  console.log("Seeding demo dashboard data...\n");

  const owner = await ensureUser(OWNER, "owner");
  await ensureProfile(owner.id, OWNER.username, OWNER.name, "owner");
  console.log(`Owner  : ${OWNER.username} (${owner.created ? "created" : "existing"})`);

  const customer = await ensureUser(CUSTOMER, "customer");
  await ensureProfile(customer.id, CUSTOMER.username, CUSTOMER.name, "customer");
  console.log(`Customer: ${CUSTOMER.username} (${customer.created ? "created" : "existing"})`);

  await upsert(
    "stores",
    STORES.map((s) => ({
      id: sid(s.key),
      owner_id: owner.id,
      name: s.name,
      upi_id: s.upi,
      is_active: true,
    })),
    "id"
  );

  await upsert(
    "coin_wallets",
    STORES.map((s) => ({
      id: sid(`wallet-${s.key}`),
      customer_id: customer.id,
      store_id: sid(s.key),
      balance: s.wallet.balance,
      total_earned: s.wallet.totalEarned,
      streak_days: s.wallet.streak,
      last_visit_date: dateDaysAgo(s.wallet.lastVisit),
      tier: s.wallet.tier,
    })),
    "customer_id,store_id"
  );

  const txRows: any[] = [];
  for (const s of STORES) {
    s.txs.forEach((t, i) => {
      const key = `${s.key}-tx-${i}`;
      txRows.push({
        id: sid(key),
        customer_id: customer.id,
        store_id: sid(s.key),
        amount: t.amt,
        coins_earned: Math.round(t.amt * 0.05),
        razorpay_order_id: `order_seed_${key}`,
        razorpay_payment_id: `pay_seed_${key}`,
        status: "confirmed",
        created_at: isoDaysAgo(t.d),
      });
    });
  }
  await upsert("transactions", txRows, "id");

  const redRows: any[] = [];
  for (const s of STORES) {
    s.redemptions.forEach((r, i) => {
      redRows.push({
        id: sid(`${s.key}-red-${i}`),
        customer_id: customer.id,
        store_id: sid(s.key),
        coins_to_redeem: r.coins,
        rupee_value: r.rupee,
        bill_amount: r.bill,
        status: "approved",
        requested_at: isoDaysAgo(r.d),
        resolved_at: isoDaysAgo(r.d),
        resolved_by: owner.id,
      });
    });
  }
  await upsert("redemption_requests", redRows, "id");

  const totalCoins = STORES.reduce((sum, s) => sum + s.wallet.balance, 0);
  console.log(
    `\nSeeded ${STORES.length} stores, ${txRows.length} transactions, ${redRows.length} redemption(s).`
  );
  console.log(`Total balance on dashboard: ${totalCoins} coins.`);
  if (customer.created) {
    console.log(`\nLogin as  username: ${CUSTOMER.username}  password: ${CUSTOMER.password}`);
  } else {
    console.log(`\nLog in as "${CUSTOMER.username}" with your existing password.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
