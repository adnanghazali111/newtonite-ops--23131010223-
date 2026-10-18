CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "work_item_status" AS ENUM ('Open', 'InProgress', 'AwaitingApproval', 'Resolved', 'Closed');
CREATE TYPE "work_item_priority" AS ENUM ('Low', 'Medium', 'High', 'Critical');
CREATE TYPE "work_item_type" AS ENUM ('Task', 'Incident', 'Request', 'Change');
CREATE TYPE "team_role" AS ENUM ('Viewer', 'Member', 'Lead', 'Admin');
CREATE TYPE "outbox_status" AS ENUM ('Pending', 'Processing', 'Completed', 'Failed');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teams" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "role" "team_role" NOT NULL DEFAULT 'Member',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "team_id" UUID NOT NULL,
  "title" VARCHAR(500) NOT NULL,
  "description" TEXT DEFAULT '',
  "type" "work_item_type" NOT NULL DEFAULT 'Task',
  "priority" "work_item_priority" NOT NULL DEFAULT 'Medium',
  "status" "work_item_status" NOT NULL DEFAULT 'Open',
  "assignee_id" UUID,
  "created_by" UUID NOT NULL,
  "due_at" TIMESTAMPTZ,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "work_items"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE TABLE "comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_keys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "key" VARCHAR(255) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "response_status" INTEGER NOT NULL,
  "response_body" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "team_id" UUID NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(50) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "outbox_status" NOT NULL DEFAULT 'Pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ,
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");
CREATE UNIQUE INDEX "memberships_user_id_team_id_key" ON "memberships"("user_id", "team_id");
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

CREATE INDEX "idx_work_items_team_status_created" ON "work_items"("team_id", "status", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_work_items_team_assignee_status" ON "work_items"("team_id", "assignee_id", "status");
CREATE INDEX "idx_work_items_search" ON "work_items" USING GIN ("search_vector");
CREATE INDEX "idx_work_items_team_created" ON "work_items"("team_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_activity_events_work_item" ON "activity_events"("work_item_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_activity_events_team_created" ON "activity_events"("team_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_comments_work_item" ON "comments"("work_item_id", "created_at" DESC);
CREATE INDEX "idx_memberships_user" ON "memberships"("user_id");
CREATE INDEX "idx_memberships_team" ON "memberships"("team_id");
CREATE INDEX "idx_outbox_jobs_pending" ON "outbox_jobs"("status", "available_at") WHERE "status" = 'Pending';

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
