# Newtonite Ops

An internal operations management system for creating, assigning, tracking, approving, and resolving operational work items across teams.

## Features

- **Authentication** — Seeded demo users with JWT-based auth
- **Dashboard** — Summary cards (assigned to me, unassigned urgent, awaiting approval), status counts, recent activity feed
- **Work Items** — Create, list, search (full-text), filter by status/priority/team, cursor-paginated
- **Task Detail** — Status, priority, assignee, due date, comments, append-only activity timeline
- **Workflow Engine** — Open → In Progress → Awaiting Approval → Resolved → Closed, with role-based authorization
- **Team-Scoped Authorization** — Viewer, Member, Lead, Admin roles per team; items outside user's teams return 404
- **Concurrency Control** — Optimistic versioning; atomic claims; stale updates rejected with 409
- **Idempotency** — Duplicate-safe item creation with `Idempotency-Key` header
- **Automated Tests** — 32 integration tests covering migrations, concurrent claim, concurrent idempotent retries, stale updates, workflow authorization, resource authorization, assignment validation, activity atomicity, search, and dashboard data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Client State | TanStack Query (React Query) |
| Routing | React Router v7 |
| Backend | Node.js 22 + Express + TypeScript (ESM) |
| Database | PostgreSQL 16 + Prisma ORM |
| Validation | Zod |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Tests | Vitest + Supertest + real PostgreSQL |

## Prerequisites

- **Node.js** ≥ 22 (check with `node -v`)
- **PostgreSQL** 16+ running locally
- **npm** ≥ 10

If using Homebrew on macOS:
```bash
brew install node@22 postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

Alternatively, use the included `docker-compose.yml` for PostgreSQL:
```bash
docker compose up -d db
```

## Setup

### 1. Clone and install

```bash
git clone <repository-url>
cd newtonite-ops

# Install dependencies
npm install                     # root (concurrently)
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if your PostgreSQL credentials differ
```

### 3. Create databases

```bash
# If using local PostgreSQL:
psql -d postgres -c "CREATE USER newtonite WITH PASSWORD 'newtonite_dev_only' CREATEDB;"
psql -d postgres -c "CREATE DATABASE newtonite OWNER newtonite;"
psql -d postgres -c "CREATE DATABASE newtonite_test OWNER newtonite;"
```

### 4. Run migrations and seed

```bash
npm --prefix backend run prisma:generate  # Generates the typed Prisma client
npm run db:migrate    # Applies tracked Prisma migrations
npm run db:seed       # Seeds demo users, teams, and sample work items
```

### 5. Start development servers

```bash
npm run dev           # Starts API (port 3001) and frontend (port 5173) concurrently
```

Open **http://localhost:5173** in your browser.

## Demo Accounts

All accounts use password: `password123`

| Email | Teams & Roles |
|-------|--------------|
| alice@newtonite.com | Operations: **Admin**, Support: Viewer |
| bob@newtonite.com | Operations: **Lead**, Engineering: Admin |
| carol@newtonite.com | Operations: **Member**, Support: Lead |
| dave@newtonite.com | Operations: **Viewer**, Support: Member |
| eve@newtonite.com | Engineering: **Lead** |
| frank@newtonite.com | Engineering: **Member** |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + frontend dev servers |
| `npm run dev:api` | Start only the API server |
| `npm run dev:web` | Start only the frontend |
| `npm test` | Run all backend tests |
| `npm run typecheck` | Backend type check and frontend production build |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed demo data |
| `npm run setup` | Generate Prisma Client, migrate, and seed |
| `npm --prefix backend run prisma:status` | Check Prisma migration state |
| `npm --prefix backend run prisma:studio` | Open Prisma Studio locally |

### Re-seeding data

To reset to a fresh state, drop and recreate the database, then migrate and seed:
```bash
psql -d postgres -c "DROP DATABASE newtonite;"
psql -d postgres -c "CREATE DATABASE newtonite OWNER newtonite;"
npm run db:migrate
npm run db:seed
```

## Running Tests

Tests run against a real PostgreSQL test database (`newtonite_test`):

```bash
# Ensure the test database exists
psql -d postgres -c "CREATE DATABASE newtonite_test OWNER newtonite;"

# Run all tests
npm test
```

Tests cover:
- ✅ Prisma migration and database health connection
- ✅ Concurrent claim (two parallel requests, exactly one wins)
- ✅ Stale version update rejected with 409
- ✅ Idempotency (same key returns the same result, including parallel retries; different payload returns 409)
- ✅ Workflow authorization (invalid transitions blocked; Member can't approve; creator can't approve own item)
- ✅ Resource authorization (cross-team access blocked; Viewer restrictions enforced)
- ✅ Assignment and request validation (assignees must be team members; malformed IDs and enum filters return 400)
- ✅ Activity atomicity (events created in same transaction as state changes)
- ✅ Search and cursor pagination
- ✅ Dashboard summary

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user + memberships |
| GET | `/api/dashboard/summary` | Dashboard counts + recent activity |
| GET | `/api/items` | List/search/filter items (cursor-paginated) |
| POST | `/api/items` | Create item (supports Idempotency-Key) |
| GET | `/api/items/:id` | Item detail |
| PATCH | `/api/items/:id` | Update item (version required) |
| POST | `/api/items/:id/claim` | Claim unassigned item (atomic) |
| POST | `/api/items/:id/transition` | Status transition (role-validated) |
| POST | `/api/items/:id/comments` | Add comment |
| GET | `/api/items/:id/comments` | List comments |
| GET | `/api/items/:id/activity` | Activity timeline (cursor-paginated) |

## Known Limitations

1. **No reopening of closed items** — Closed is a terminal state in this version
2. **No real-time updates** — Requires page refresh or window refocus (TanStack Query refetches on focus)
3. **No email/notification delivery** — Outbox table exists but no worker processes it
4. **Single-approver constraint** — If the only Lead is the creator, the item can't be approved
5. **No file attachments** — Comments and descriptions are plain text only
6. **Demo auth only** — Seeded users; no SSO, OAuth, or public signup
7. **No deployment** — Runs locally only; no production build or hosting configured

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── app.ts              # Express app setup (Supertest-friendly)
│   │   ├── server.ts           # Listen on port
│   │   ├── db/
│   │   │   ├── prisma.ts       # Prisma client singleton
│   │   │   ├── pool.ts         # Parameterized SQL + atomic transaction helper
│   │   │   └── seed.ts         # Prisma demo data seeder
│   │   ├── middleware/
│   │   │   └── auth.ts         # JWT auth + membership loader
│   │   ├── routes/
│   │   │   ├── auth.ts         # Login, /me
│   │   │   ├── dashboard.ts    # Summary endpoint
│   │   │   ├── health.ts       # Health check
│   │   │   └── items.ts        # All work item CRUD + workflow
│   │   └── services/
│   │       ├── authorize.ts    # Central authorization function
│   │       └── workflow.ts     # State machine + transition validation
│   ├── tests/
│   │   ├── setup.ts            # Test DB config
│   │   └── api.test.ts         # 32 integration tests
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       # Data model and indexes
│   │   └── migrations/         # Versioned Prisma migration SQL
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Routes + providers
│   │   ├── api.ts              # API client + types
│   │   ├── auth.tsx            # Auth context
│   │   ├── components/         # AppShell, Badges
│   │   └── pages/              # Login, Dashboard, Items, ItemDetail, CreateItem
│   ├── package.json
│   └── vite.config.ts          # Proxy + Tailwind
├── .env.example
├── .gitignore
├── docker-compose.yml
├── ENGINEERING_DECISIONS.md
├── package.json                # Root scripts
└── README.md
```
