# Sikka Backend — Express API

## Stack
- Node.js + Express 4 + TypeScript (strict)
- Postgres via `pg` (raw SQL, no ORM); pool exposed from `src/config/db.ts`
- Local JWT auth: bcryptjs for password hashing, jsonwebtoken for access/refresh tokens
- Razorpay for payment processing
- Zod for request validation
- Docker for deployment

## Architecture
```
Route → Controller → Service → pg pool
```
- **Routes**: define endpoints + attach middleware (auth, validation)
- **Controllers**: extract request data, delegate to service, format response
- **Services**: business logic, pg queries via `query`/`queryOne`/`withTx` helpers from `config`
- **Middleware**: auth (verifies JWT from `Authorization: Bearer …`), validation (Zod), error handling

## Project Structure
```
src/
  config/         # env validation, pg pool + query helpers, business constants
  middleware/     # auth, errorHandler, validate
  modules/        # feature modules (auth, profile, store, transaction, wallet, redemption, offer, notification)
    <module>/
      <module>.routes.ts
      <module>.controller.ts
      <module>.service.ts
      <module>.schema.ts    # Zod schemas (where applicable)
  types/          # shared TypeScript types
  utils/          # errors, response helpers, pagination, tier calculation
  app.ts          # Express app setup
  server.ts       # Entry point
```

## Commands
- `npm run dev` — start dev server with hot reload (tsx watch)
- `npm run build` — compile TypeScript
- `npm start` — run compiled output
- `npm run lint` — type check only
- `docker compose up --build` — build and run in Docker

## API Routes
All under `/api/`:
- `POST /auth/register` — create account (username + password), get tokens
- `POST /auth/login` — log in (username + password), get tokens
- `POST /auth/refresh` — refresh access token
- `GET /profile` — get current user profile
- `PUT /profile` — update profile
- `PUT /profile/fcm-token` — update FCM token
- `GET /stores` — list active stores
- `GET /stores/my` — owner's stores
- `GET /stores/dashboard` — owner home dashboard (GMV, visits, redemptions, offer, leaderboard)
- `GET /stores/lookup/:upiId` — lookup by UPI QR
- `POST /stores` — create store (owner)
- `PUT /stores/:id` — update store (owner)
- `POST /transactions/order` — create Razorpay order
- `POST /transactions/verify` — verify payment + award coins
- `GET /transactions` — customer transaction history
- `GET /wallets` — customer wallets
- `GET /wallets/dashboard` — home screen data
- `POST /redemptions` — request coin redemption
- `PUT /redemptions/:id` — approve/reject (owner)
- `CRUD /offers` — manage store offers (owner)
- `GET /notifications` — notification feed
- `PUT /notifications/read-all` — mark all read

## Environment
Copy `.env.example` → `.env` and fill in `DATABASE_URL`, `JWT_SECRET`, Razorpay credentials.

## Database
- Migrations: `npm run db:migrate` (apply) / `db:rollback` / `db:status` / `db:new <name>`
- Migration files in `migrations/` use `-- +migrate Up` / `-- +migrate Down` markers
- Seed: `npm run db:seed` populates a demo customer (`vishalmeti` / `sikka123`) and owner (`sikka_demo_owner` / `sikka123`) with three stores
- Schema reference: `docs/ER_diagrams.md` (note: the doc still describes the Supabase auth.users FK and RLS policies — the in-repo schema in `migrations/000_initial_schema.sql` is the source of truth)
