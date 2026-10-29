import { test, expect } from '@playwright/test';
const password = process.env.DEMO_PASSWORD || 'SupportDesk2026!';
async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
test('customer → Admin assignment → Agent reply → resolution', async ({ browser }, testInfo) => {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = testInfo.project.use;
  const options = { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent };
  const customer = await browser.newContext(options), admin = await browser.newContext(options), agent = await browser.newContext(options);
  const cp = await customer.newPage(), ap = await admin.newPage(), gp = await agent.newPage();
  const subject = `Invoice help ${Date.now()}`;
  await login(cp, 'customer@supportdesk.demo');
  await cp.getByRole('link', { name: 'New ticket', exact: true }).first().click();
  await cp.getByLabel('Subject', { exact: true }).fill(subject);
  await cp.getByLabel('Description', { exact: true }).fill('Please review the extra charge on my invoice.');
  await cp.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await expect(cp.getByRole('heading', { name: subject, exact: true })).toBeVisible();
  const url = cp.url();
  await login(ap, 'admin@supportdesk.demo');
  await ap.goto(url);
  await ap.getByLabel('Assigned agent', { exact: true }).selectOption({ label: 'Jordan Lee' });
  await expect(ap.getByRole('status')).toContainText('Assignment updated');
  await login(gp, 'agent@supportdesk.demo');
  await gp.goto(url);
  await gp.getByLabel('Your reply', { exact: true }).fill('I have corrected your invoice.');
  await gp.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(gp.getByText('I have corrected your invoice.', { exact: true })).toBeVisible();
  await gp.getByLabel('Ticket status', { exact: true }).selectOption('Resolved');
  await expect(gp.getByRole('status')).toContainText('Status updated');
  await cp.reload();
  await expect(cp.getByText('I have corrected your invoice.', { exact: true })).toBeVisible();
  await expect(cp.getByText('Resolved', { exact: true }).first()).toBeVisible();
  await expect(cp.getByLabel('Ticket status', { exact: true })).toHaveCount(0);
  await customer.close(); await admin.close(); await agent.close();
});
test('layout is usable and unauthenticated routes return to login', async ({ page }, testInfo) => {
  await page.goto('/tickets');
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await login(page, 'admin@supportdesk.demo');
  await expect(page.getByText('Ticket overview', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-pie-sector').first()).toBeVisible();
  await expect(page.locator('.ticket-table tbody tr').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}.png`, fullPage: testInfo.project.name !== 'mobile', scale: 'css' });
});
async function createForTest(page, subject) {
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).data.csrfToken;
  const headers = { Origin: 'http://localhost:5173', 'X-CSRF-Token': csrf, 'Idempotency-Key': crypto.randomUUID() };
  const response = await page.request.post('/api/tickets', { headers, data: { subject, description: 'Original description', category: 'General' } });
  expect(response.status()).toBe(201);
  return { ticket: (await response.json()).data, headers };
}
test('a refreshed editor requires explicit reconciliation and preserves unrelated changes', async ({ page }) => {
  await login(page, 'admin@supportdesk.demo');
  const { ticket, headers } = await createForTest(page, `Concurrent edit ${Date.now()}`);
  await page.goto(`/tickets/${ticket.id}`);
  await page.getByRole('button', { name: 'Edit ticket', exact: true }).click();
  await page.getByLabel('Subject', { exact: true }).fill('My subject update');
  const other = await page.request.patch(`/api/tickets/${ticket.id}`, { headers, data: { description: 'Description updated by a colleague', expectedVersion: 1 } });
  expect(other.status()).toBe(200);
  await page.clock.install(); await page.clock.fastForward(21000);
  const refreshed = page.waitForResponse(r => r.url().endsWith(`/api/tickets/${ticket.id}`) && r.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await refreshed;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('My subject update');
  await page.getByRole('button', { name: 'Keep my edits on latest version', exact: true }).click();
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('Description updated by a colleague');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const result = (await (await page.request.get(`/api/tickets/${ticket.id}`)).json()).data;
  expect(result.subject).toBe('My subject update'); expect(result.description).toBe('Description updated by a colleague');
});
test('a reply with a lost response retries the original payload without duplication', async ({ page }) => {
  await login(page, 'customer@supportdesk.demo');
  const { ticket } = await createForTest(page, `Uncertain reply ${Date.now()}`);
  await page.goto(`/tickets/${ticket.id}`);
  let dropped = false;
  await page.route(`**/api/tickets/${ticket.id}/messages`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    if (!dropped) { dropped = true; return route.abort('failed'); }
    return route.fulfill({ response });
  });
  const draft = page.getByLabel('Your reply', { exact: true });
  await draft.fill('This reply must arrive once.');
  await page.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach');
  await expect(draft).toBeDisabled();
  await expect(draft).toHaveValue('This reply must arrive once.');
  await page.getByRole('button', { name: 'Retry reply', exact: true }).click();
  await expect(page.getByText('This reply must arrive once.', { exact: true })).toHaveCount(1);
  await expect(draft).toHaveValue('');
  const saved = (await (await page.request.get(`/api/tickets/${ticket.id}/messages`)).json()).data;
  expect(saved).toHaveLength(1);
});
test('delete confirmation keeps the revision originally confirmed', async ({ page }) => {
  await login(page, 'admin@supportdesk.demo');
  const { ticket, headers } = await createForTest(page, `Stale confirmation ${Date.now()}`);
  await page.goto(`/tickets/${ticket.id}`);
  await page.getByRole('button', { name: 'Delete ticket', exact: true }).click();
  await page.request.patch(`/api/tickets/${ticket.id}`, { headers, data: { subject: 'Newer revision', expectedVersion: 1 } });
  await page.clock.install(); await page.clock.fastForward(21000);
  const refreshed = page.waitForResponse(r => r.url().endsWith(`/api/tickets/${ticket.id}`) && r.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))); await refreshed;
  await page.getByRole('dialog').getByRole('button', { name: 'Delete ticket', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  expect((await page.request.get(`/api/tickets/${ticket.id}`)).status()).toBe(200);
});
