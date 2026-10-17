import bcrypt from 'bcryptjs';
import { query } from './pool.js';

const DEMO_PASSWORD = 'password123';

interface SeedUser {
  email: string;
  displayName: string;
}

interface SeedTeam {
  name: string;
}

const USERS: SeedUser[] = [
  { email: 'alice@newtonite.com', displayName: 'Alice Johnson' },
  { email: 'bob@newtonite.com', displayName: 'Bob Smith' },
  { email: 'carol@newtonite.com', displayName: 'Carol Williams' },
  { email: 'dave@newtonite.com', displayName: 'Dave Brown' },
  { email: 'eve@newtonite.com', displayName: 'Eve Davis' },
  { email: 'frank@newtonite.com', displayName: 'Frank Miller' },
];

const TEAMS: SeedTeam[] = [
  { name: 'Operations' },
  { name: 'Engineering' },
  { name: 'Support' },
];

export async function seed() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Upsert users
  const userIds: Record<string, string> = {};
  for (const user of USERS) {
    const res = await query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [user.email, passwordHash, user.displayName]
    );
    userIds[user.email] = res.rows[0].id;
  }

  // Upsert teams
  const teamIds: Record<string, string> = {};
  for (const team of TEAMS) {
    const res = await query(
      `INSERT INTO teams (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [team.name]
    );
    teamIds[team.name] = res.rows[0].id;
  }

  // Memberships:
  // Operations: Alice (Admin), Bob (Lead), Carol (Member), Dave (Viewer)
  // Engineering: Bob (Admin), Eve (Lead), Frank (Member)
  // Support: Carol (Lead), Dave (Member), Alice (Viewer)
  const memberships = [
    { email: 'alice@newtonite.com', team: 'Operations', role: 'Admin' },
    { email: 'bob@newtonite.com', team: 'Operations', role: 'Lead' },
    { email: 'carol@newtonite.com', team: 'Operations', role: 'Member' },
    { email: 'dave@newtonite.com', team: 'Operations', role: 'Viewer' },
    { email: 'bob@newtonite.com', team: 'Engineering', role: 'Admin' },
    { email: 'eve@newtonite.com', team: 'Engineering', role: 'Lead' },
    { email: 'frank@newtonite.com', team: 'Engineering', role: 'Member' },
    { email: 'carol@newtonite.com', team: 'Support', role: 'Lead' },
    { email: 'dave@newtonite.com', team: 'Support', role: 'Member' },
    { email: 'alice@newtonite.com', team: 'Support', role: 'Viewer' },
  ];

  for (const m of memberships) {
    await query(
      `INSERT INTO memberships (user_id, team_id, role)
       VALUES ($1, $2, $3::team_role)
       ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role`,
      [userIds[m.email], teamIds[m.team], m.role]
    );
  }

  // Seed some work items
  const opsTeamId = teamIds['Operations'];
  const aliceId = userIds['alice@newtonite.com'];
  const bobId = userIds['bob@newtonite.com'];
  const carolId = userIds['carol@newtonite.com'];

  const items = [
    {
      title: 'Server room temperature alert',
      description: 'Temperature sensors in rack B3 reading above threshold. Investigate HVAC unit.',
      type: 'Incident',
      priority: 'Critical',
      status: 'Open',
      assigneeId: null,
      createdBy: carolId,
      teamId: opsTeamId,
    },
    {
      title: 'Update backup rotation schedule',
      description: 'Weekly backup rotation needs to be updated per Q4 compliance requirements.',
      type: 'Task',
      priority: 'High',
      status: 'InProgress',
      assigneeId: bobId,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
    {
      title: 'New employee access provisioning',
      description: 'Provision VPN and building access for 3 new hires starting next Monday.',
      type: 'Request',
      priority: 'Medium',
      status: 'AwaitingApproval',
      assigneeId: carolId,
      createdBy: carolId,
      teamId: opsTeamId,
    },
    {
      title: 'Firewall rule change for staging',
      description: 'Open port 8443 on staging firewall for new API gateway.',
      type: 'Change',
      priority: 'Medium',
      status: 'Open',
      assigneeId: null,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
    {
      title: 'Monthly infrastructure audit',
      description: 'Complete October infrastructure audit checklist and submit report.',
      type: 'Task',
      priority: 'Low',
      status: 'Resolved',
      assigneeId: bobId,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
  ];

  for (const item of items) {
    const existing = await query(
      'SELECT id FROM work_items WHERE title = $1 AND team_id = $2',
      [item.title, item.teamId]
    );
    if (existing.rows.length > 0) continue;

    const res = await query(
      `INSERT INTO work_items (title, description, type, priority, status, assignee_id, created_by, team_id)
       VALUES ($1, $2, $3::work_item_type, $4::work_item_priority, $5::work_item_status, $6, $7, $8)
       RETURNING id`,
      [item.title, item.description, item.type, item.priority, item.status, item.assigneeId, item.createdBy, item.teamId]
    );

    // Add initial activity event
    await query(
      `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
       VALUES ($1, $2, $3, 'created', $4)`,
      [res.rows[0].id, item.teamId, item.createdBy, JSON.stringify({ title: item.title, status: item.status })]
    );
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Demo accounts (all use password: password123):');
  console.log('  alice@newtonite.com - Operations Admin, Support Viewer');
  console.log('  bob@newtonite.com   - Operations Lead, Engineering Admin');
  console.log('  carol@newtonite.com - Operations Member, Support Lead');
  console.log('  dave@newtonite.com  - Operations Viewer, Support Member');
  console.log('  eve@newtonite.com   - Engineering Lead');
  console.log('  frank@newtonite.com - Engineering Member');
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');
if (isMain) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
