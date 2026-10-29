import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
try {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set SEED_PASSWORD to a demo-only password of at least 12 characters.');
  const passwordHash = await bcrypt.hash(password, 12);
  const entries = [
    ['Alex Morgan', 'admin@supportdesk.demo', 'Admin'],
    ['Jordan Lee', 'agent@supportdesk.demo', 'Agent'],
    ['Sam Rivera', 'sam@supportdesk.demo', 'Agent'],
    ['Avery Chen', 'avery@supportdesk.demo', 'Agent'],
    ['Taylor Brooks', 'customer@supportdesk.demo', 'Customer'],
    ['Jamie Wilson', 'jamie@supportdesk.demo', 'Customer'],
    ['Casey Patel', 'casey@supportdesk.demo', 'Customer'],
  ];
  const users = [];
  for (const [name, email, role] of entries) users.push(await db.user.upsert({ where: { email }, update: { passwordHash }, create: { name, email, role, passwordHash } }));
  if (!(await db.ticket.count())) {
    const subjects = [
      ['Unable to access the workspace', 'Technical', 'Urgent', 'Open', 4, 1],
      ['Unexpected charge on my latest invoice', 'Billing', 'High', 'InProgress', 5, 2],
      ['Help connecting our Slack integration', 'Technical', 'Medium', 'Open', 6, null],
      ['Can we add more team members?', 'General', 'Low', 'Resolved', 4, 3],
      ['Exported report is missing data', 'Technical', 'High', 'InProgress', 5, 1],
      ['Update the billing contact', 'Billing', 'Medium', 'Resolved', 6, 2],
      ['How do I change my notification settings?', 'General', 'Low', 'Closed', 4, 3],
      ['Single sign-on returns an error', 'Technical', 'Urgent', 'Open', 6, 1],
      ['Question about our annual plan', 'Billing', 'Medium', 'Open', 4, null],
      ['Invite email has not arrived', 'Other', 'Medium', 'Resolved', 5, 2],
      ['Dashboard takes longer to load', 'Technical', 'High', 'InProgress', 4, 3],
      ['Thanks for helping with our migration', 'General', 'Low', 'Closed', 6, 1],
    ];
    for (let i = 0; i < subjects.length; i++) {
      const [subject, category, priority, status, owner, assignee] = subjects[i];
      const createdAt = new Date(Date.now() - (i * 3 + 1) * 3600000);
      const ticket = await db.ticket.create({ data: { subject, description: `${subject}. We noticed this while working with our team today. Could you take a look and let us know the next steps?`, category, priority, status, customerId: users[owner].id, assignedAgentId: assignee === null ? null : users[assignee].id, createdAt, updatedAt: createdAt } });
      await db.activity.create({ data: { ticketId: ticket.id, actorId: users[owner].id, action: 'ticket.created', createdAt } });
      if (assignee !== null) {
        const time = new Date(createdAt.getTime() + 60000);
        await db.activity.create({ data: { ticketId: ticket.id, actorId: users[0].id, action: 'ticket.assigned', metadata: { assignedAgentId: users[assignee].id }, createdAt: time } });
        await db.message.create({ data: { ticketId: ticket.id, authorId: users[assignee].id, body: 'Thanks for letting us know. I’m looking into this and will keep you updated here.', createdAt: new Date(time.getTime() + 60000) } });
      }
    }
  }
  console.log('Demo accounts and sample tickets are ready. Password is the configured SEED_PASSWORD.');
} finally { await db.$disconnect(); }
