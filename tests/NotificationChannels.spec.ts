import { expect, test, Page } from '@playwright/test';

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000' });

const notificationMessage = process.env.TEST_NOTIFICATION_MESSAGE ?? 'Automated test notification';
const username = process.env.TEST_USERNAME ?? '';
const password = process.env.TEST_PASSWORD ?? '';
const emailInboxUrl = process.env.EMAIL_INBOX_URL ?? '';
const smsInboxUrl = process.env.SMS_INBOX_URL ?? '';
const notificationPagePath = process.env.NOTIFICATIONS_PATH ?? '/notifications';
const deliveryLogsPath = process.env.DELIVERY_LOGS_PATH ?? '/delivery-logs';
const loginPath = process.env.LOGIN_PATH ?? '/login';

function requireConfiguredValue(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required for this test run. Set the corresponding environment variable and retry.`);
  }
  return value;
}

async function login(page: Page): Promise<void> {
  await requireConfiguredValue('TEST_USERNAME', username);
  await requireConfiguredValue('TEST_PASSWORD', password);

  await page.goto(loginPath);
  await page.getByLabel(/email|username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page.getByText(/dashboard|home|notifications/i)).toBeVisible({ timeout: 15_000 });
}

async function triggerNotification(page: Page): Promise<void> {
  await page.goto(notificationPagePath);
  await expect(page.getByRole('heading', { name: /notification/i })).toBeVisible({ timeout: 15_000 });

  const triggerButton = page.getByRole('button', { name: /trigger notification|send notification/i });
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  await triggerButton.click();

  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 15_000 });
}

async function openNotificationCenter(page: Page): Promise<void> {
  await page.goto(notificationPagePath);
  const inAppTab = page.getByRole('tab', { name: /in-app|in app/i });
  if (await inAppTab.count()) {
    await inAppTab.click();
  }
}

async function openDeliveryLogs(page: Page): Promise<void> {
  await page.goto(deliveryLogsPath);
  await expect(page.getByRole('heading', { name: /delivery log|delivery logs|logs/i })).toBeVisible({ timeout: 15_000 });
}

async function verifyInboxNotification(page: Page, inboxUrl: string, channelName: string): Promise<void> {
  await requireConfiguredValue(`${channelName.toUpperCase()}_INBOX_URL`, inboxUrl);
  await page.goto(inboxUrl);
  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 30_000 });
}

test('TC-001 Verify notification is delivered through Email using the existing email flow', async ({ page }) => {
  await login(page);
  await triggerNotification(page);
  await verifyInboxNotification(page, emailInboxUrl, 'email');
});

test('TC-002 Verify notification is delivered through In-App channel', async ({ page }) => {
  await login(page);
  await triggerNotification(page);
  await openNotificationCenter(page);

  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 15_000 });
});

test('TC-003 Verify notification is delivered through SMS channel', async ({ page }) => {
  await login(page);
  await triggerNotification(page);
  await verifyInboxNotification(page, smsInboxUrl, 'sms');
});

test('TC-004 Verify notification dispatch routes messages based on user preferences', async ({ page }) => {
  await login(page);
  await triggerNotification(page);

  await openNotificationCenter(page);
  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 15_000 });

  await openDeliveryLogs(page);
  await expect(page.getByText(/email/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/in-app|in app/i)).not.toBeVisible();
  await expect(page.getByText(/sms/i)).not.toBeVisible();
});

test('TC-005 Verify delivery log is created for a notification', async ({ page }) => {
  await login(page);
  await triggerNotification(page);
  await openDeliveryLogs(page);

  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 15_000 });
});

test('TC-006 Verify retry handling occurs when notification delivery fails', async ({ page }) => {
  await login(page);

  const failureInjectionUrl = process.env.FAILED_DELIVERY_PATH ?? `${notificationPagePath}?simulateFailure=true`;
  await page.goto(failureInjectionUrl);

  const triggerButton = page.getByRole('button', { name: /trigger notification|send notification/i });
  await expect(triggerButton).toBeVisible({ timeout: 10_000 });
  await triggerButton.click();

  await openDeliveryLogs(page);
  await expect(page.getByText(notificationMessage, { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/retry/i)).toBeVisible({ timeout: 15_000 });
});
