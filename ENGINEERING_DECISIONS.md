# Engineering Decisions — Newtonite Ops

## 1. Data Model and Audit History

**Decision:** Activity events are stored in an append-only `activity_events` table with JSONB payloads. Every state change to a work item (status transition, assignment, field edit) creates an activity event in the **same database transaction** as the change itself.

**Alternatives considered:**
- **Mutable audit columns** (e.g., `last_modified_by`): Loses history; cannot reconstruct timeline.
- **Application-level event sourcing**: Over-engineered for MVP scope; adds replay complexity.
- **Separate async audit writes**: Risks losing audit records if the async step fails.

**Trade-off:** Co-transactional writes add slight latency to mutations but guarantee that the audit trail is always consistent with the current state. No work item change can exist without a corresponding audit event.

## 2. Concurrency Control

**Decision:** Optimistic concurrency using a `version` integer column on `work_items`. Every mutation includes the expected version in a conditional `UPDATE ... WHERE id = $1 AND version = $2`. If zero rows are affected, the server returns HTTP 409 Conflict. Claims use an additional `AND assignee_id IS NULL` condition.

**Alternatives considered:**
- **Pessimistic locking (`SELECT ... FOR UPDATE`)**: Adds lock contention under concurrent load; harder to reason about deadlocks.
- **Last-write-wins**: Silent data loss; unacceptable for an operations tool where multiple users coordinate.
- **Row-level timestamps only**: Insufficient granularity when two updates happen within the same millisecond.

**Trade-off:** Optimistic concurrency is simple to implement, scales well for read-heavy workloads, and gives clear user feedback. The cost is that users occasionally need to reload and retry, which is preferable to silent overwrites.

## 3. Authorization Architecture

**Decision:** A single `authorize(user, action, resource)` function makes all permission decisions server-side. Roles (Viewer, Member, Lead, Admin) are loaded from the `memberships` table on each request. Items belonging to teams the user is not a member of return 404 (not 403) to avoid revealing their existence.

**Alternatives considered:**
- **JWT-embedded roles**: Roles become stale between token refresh; a removed team member retains access until token expires.
- **Middleware-only checks**: Scatters authorization logic across routes; easy to miss a check.
- **RBAC library (e.g., CASL)**: Adds dependency complexity for a straightforward role matrix.

**Trade-off:** Centralized authorization is slightly more database-intensive (membership lookup per request) but ensures consistency. The 404-for-non-members pattern prevents information leakage about team structure.

## 4. Search and Pagination

**Decision:** Keyset (cursor) pagination using `(created_at DESC, id DESC)` as the sort key, with a composite index `(team_id, status, created_at DESC, id DESC)`. The cursor encodes both timestamp and ID. Keyword search uses PostgreSQL full-text search with a GIN index on a `tsvector` generated column over title and description.

**Alternatives considered:**
- **Offset pagination**: Inconsistent results when rows are inserted/deleted between pages; performance degrades with large offsets.
- **`ILIKE '%term%'`**: Full table scan; unusable beyond a few thousand rows.
- **External search service (Elasticsearch)**: Over-engineered for MVP; adds infrastructure complexity.

**Trade-off:** Cursor pagination delivers consistent, performant results but prevents jumping to arbitrary page numbers. This is acceptable for an operations dashboard where users browse sequentially. Full-text search provides good-enough keyword matching without external dependencies.

## 5. Synchronous Processing and Deferred Features

**Decision:** All primary state changes (create, update, transition, claim, comment) are synchronous request-response operations. An `outbox_jobs` table exists in the schema for future async processing (notifications, integrations), but no background worker is implemented in MVP.

**Alternatives considered:**
- **Immediate notification delivery in the request path**: Adds latency and coupling; notification failure could block the primary operation.
- **No outbox table**: Would require schema migration later; harder to demonstrate architectural intent.
- **Full worker implementation**: Time-prohibitive under the compressed deadline.

**Trade-off:** The outbox table demonstrates the transactional outbox pattern for reliable async processing without the implementation cost of a worker. This is explicitly documented as a known limitation rather than a hidden gap.

---

## Known Limitations

1. **No reopening of closed items**: Closed → Open transition is intentionally deferred to keep the state machine simple and auditable.
2. **No real-time updates**: Changes require page refresh or window refocus to appear. WebSocket support is deferred.
3. **No email/notification delivery**: The outbox table captures events but no worker processes them.
4. **Single-approver constraint**: If the only Lead in a team is also the item creator, the item cannot be approved. This is documented rather than worked around.
5. **No file attachments or rich text**: Comments and descriptions are plain text only.
6. **Demo authentication only**: Uses seeded users with bcrypt-hashed passwords; no SSO, OAuth, or public signup.
