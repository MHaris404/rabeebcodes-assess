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
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}.png`, fullPage: true });
});
