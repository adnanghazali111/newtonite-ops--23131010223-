import pool, { query } from './pool.js';

const MIGRATIONS = [
  // 001: Create extension and enum types
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

  `DO $$ BEGIN
    CREATE TYPE work_item_status AS ENUM ('Open', 'InProgress', 'AwaitingApproval', 'Resolved', 'Closed');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `DO $$ BEGIN
    CREATE TYPE work_item_priority AS ENUM ('Low', 'Medium', 'High', 'Critical');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `DO $$ BEGIN
    CREATE TYPE work_item_type AS ENUM ('Task', 'Incident', 'Request', 'Change');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `DO $$ BEGIN
    CREATE TYPE team_role AS ENUM ('Viewer', 'Member', 'Lead', 'Admin');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `DO $$ BEGIN
    CREATE TYPE outbox_status AS ENUM ('Pending', 'Processing', 'Completed', 'Failed');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  // 002: users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 003: teams table
  `CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 004: memberships table
  `CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role team_role NOT NULL DEFAULT 'Member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, team_id)
  );`,

  // 005: work_items table
  `CREATE TABLE IF NOT EXISTS work_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT DEFAULT '',
    type work_item_type NOT NULL DEFAULT 'Task',
    priority work_item_priority NOT NULL DEFAULT 'Medium',
    status work_item_status NOT NULL DEFAULT 'Open',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    due_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 006: full-text search column
  `DO $$ BEGIN
    ALTER TABLE work_items ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      ) STORED;
  EXCEPTION WHEN duplicate_column THEN NULL;
  END $$;`,

  // 007: comments table
  `CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 008: activity_events table
  `CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 009: idempotency_keys table
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, key)
  );`,

  // 010: outbox_jobs table
  `CREATE TABLE IF NOT EXISTS outbox_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status outbox_status NOT NULL DEFAULT 'Pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 011: Indexes for work_items
  `CREATE INDEX IF NOT EXISTS idx_work_items_team_status_created
    ON work_items (team_id, status, created_at DESC, id DESC);`,

  `CREATE INDEX IF NOT EXISTS idx_work_items_team_assignee_status
    ON work_items (team_id, assignee_id, status);`,

  `CREATE INDEX IF NOT EXISTS idx_work_items_search
    ON work_items USING GIN (search_vector);`,

  `CREATE INDEX IF NOT EXISTS idx_work_items_team_created
    ON work_items (team_id, created_at DESC, id DESC);`,

  // 012: Indexes for activity_events
  `CREATE INDEX IF NOT EXISTS idx_activity_events_work_item
    ON activity_events (work_item_id, created_at DESC, id DESC);`,

  `CREATE INDEX IF NOT EXISTS idx_activity_events_team_created
    ON activity_events (team_id, created_at DESC, id DESC);`,

  // 013: Indexes for comments
  `CREATE INDEX IF NOT EXISTS idx_comments_work_item
    ON comments (work_item_id, created_at DESC);`,

  // 014: Indexes for memberships
  `CREATE INDEX IF NOT EXISTS idx_memberships_user
    ON memberships (user_id);`,

  `CREATE INDEX IF NOT EXISTS idx_memberships_team
    ON memberships (team_id);`,

  // 015: Indexes for outbox
  `CREATE INDEX IF NOT EXISTS idx_outbox_jobs_pending
    ON outbox_jobs (status, available_at) WHERE status = 'Pending';`,
];

export async function runMigrations() {
  console.log('Running migrations...');

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      index INTEGER NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (let i = 0; i < MIGRATIONS.length; i++) {
    // Check if already applied
    const check = await query('SELECT id FROM _migrations WHERE index = $1', [i]);
    if (check.rows.length > 0) continue;

    try {
      await query(MIGRATIONS[i]);
      await query('INSERT INTO _migrations (index) VALUES ($1)', [i]);
      console.log(`  Migration ${i} applied`);
    } catch (err) {
      console.error(`  Migration ${i} failed:`, err);
      throw err;
    }
  }

  console.log('Migrations complete.');
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (isMain) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
