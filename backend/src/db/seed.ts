import bcrypt from 'bcryptjs';
import { TeamRole, WorkItemPriority, WorkItemStatus, WorkItemType } from '../generated/prisma/client.js';
import { prisma } from './prisma.js';

const DEMO_PASSWORD = 'password123';

interface SeedUser {
  email: string;
  displayName: string;
}

interface SeedTeam {
  name: string;
}

type SeedMembership = {
  email: string;
  team: string;
  role: TeamRole;
};

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
    const existingUser = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true, passwordHash: true },
    });
    const hasDemoPassword = existingUser
      ? await bcrypt.compare(DEMO_PASSWORD, existingUser.passwordHash)
      : false;
    const savedUser = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            displayName: user.displayName,
            ...(hasDemoPassword ? {} : { passwordHash }),
          },
        })
      : await prisma.user.create({
          data: { email: user.email, passwordHash, displayName: user.displayName },
        });
    userIds[user.email] = savedUser.id;
  }

  // Upsert teams
  const teamIds: Record<string, string> = {};
  for (const team of TEAMS) {
    const savedTeam = await prisma.team.upsert({
      where: { name: team.name },
      update: {},
      create: { name: team.name },
    });
    teamIds[team.name] = savedTeam.id;
  }

  // Memberships:
  // Operations: Alice (Admin), Bob (Lead), Carol (Member), Dave (Viewer)
  // Engineering: Bob (Admin), Eve (Lead), Frank (Member)
  // Support: Carol (Lead), Dave (Member), Alice (Viewer)
  const memberships: SeedMembership[] = [
    { email: 'alice@newtonite.com', team: 'Operations', role: TeamRole.Admin },
    { email: 'bob@newtonite.com', team: 'Operations', role: TeamRole.Lead },
    { email: 'carol@newtonite.com', team: 'Operations', role: TeamRole.Member },
    { email: 'dave@newtonite.com', team: 'Operations', role: TeamRole.Viewer },
    { email: 'bob@newtonite.com', team: 'Engineering', role: TeamRole.Admin },
    { email: 'eve@newtonite.com', team: 'Engineering', role: TeamRole.Lead },
    { email: 'frank@newtonite.com', team: 'Engineering', role: TeamRole.Member },
    { email: 'carol@newtonite.com', team: 'Support', role: TeamRole.Lead },
    { email: 'dave@newtonite.com', team: 'Support', role: TeamRole.Member },
    { email: 'alice@newtonite.com', team: 'Support', role: TeamRole.Viewer },
  ];

  for (const m of memberships) {
    const userId = userIds[m.email];
    const teamId = teamIds[m.team];
    await prisma.membership.upsert({
      where: { userId_teamId: { userId, teamId } },
      update: { role: m.role },
      create: { userId, teamId, role: m.role },
    });
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
      type: WorkItemType.Incident,
      priority: WorkItemPriority.Critical,
      status: WorkItemStatus.Open,
      assigneeId: null,
      createdBy: carolId,
      teamId: opsTeamId,
    },
    {
      title: 'Update backup rotation schedule',
      description: 'Weekly backup rotation needs to be updated per Q4 compliance requirements.',
      type: WorkItemType.Task,
      priority: WorkItemPriority.High,
      status: WorkItemStatus.InProgress,
      assigneeId: bobId,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
    {
      title: 'New employee access provisioning',
      description: 'Provision VPN and building access for 3 new hires starting next Monday.',
      type: WorkItemType.Request,
      priority: WorkItemPriority.Medium,
      status: WorkItemStatus.AwaitingApproval,
      assigneeId: carolId,
      createdBy: carolId,
      teamId: opsTeamId,
    },
    {
      title: 'Firewall rule change for staging',
      description: 'Open port 8443 on staging firewall for new API gateway.',
      type: WorkItemType.Change,
      priority: WorkItemPriority.Medium,
      status: WorkItemStatus.Open,
      assigneeId: null,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
    {
      title: 'Monthly infrastructure audit',
      description: 'Complete October infrastructure audit checklist and submit report.',
      type: WorkItemType.Task,
      priority: WorkItemPriority.Low,
      status: WorkItemStatus.Resolved,
      assigneeId: bobId,
      createdBy: aliceId,
      teamId: opsTeamId,
    },
  ];

  for (const item of items) {
    const existing = await prisma.workItem.findFirst({
      where: { title: item.title, teamId: item.teamId },
      select: { id: true },
    });
    if (existing) continue;

    const savedItem = await prisma.workItem.create({
      data: item,
      select: { id: true },
    });

    // Add initial activity event
    await prisma.activityEvent.create({
      data: {
        workItemId: savedItem.id,
        teamId: item.teamId,
        actorId: item.createdBy,
        eventType: 'created',
        payload: { title: item.title, status: item.status },
      },
    });
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
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
