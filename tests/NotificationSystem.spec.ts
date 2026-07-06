import { expect, test, type Page, type Locator } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? '/';
const notificationPreferencesPath = process.env.NOTIFICATION_PREFERENCES_PATH ?? '/notification-preferences';
const notificationsPath = process.env.NOTIFICATIONS_PATH ?? '/notifications';
const schedulerPath = process.env.SCHEDULER_PATH ?? '/scheduler';

async function gotoPath(page: Page, path: string) {
  await page.goto(new URL(path, baseURL).toString());
}

async function firstVisible(page: Page, candidates: Locator[]) {
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  throw new Error('None of the candidate locators were visible.');
}

async function openNotificationPreferences(page: Page) {
  await gotoPath(page, notificationPreferencesPath);
  await expect(page.getByRole('heading', { name: /notification preferences/i })).toBeVisible();
}

async function openNotificationsCenter(page: Page) {
  await gotoPath(page, notificationsPath);
  await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();
}

async function openScheduler(page: Page) {
  await gotoPath(page, schedulerPath);
  await expect(page.getByRole('heading', { name: /scheduler/i })).toBeVisible();
}

async function fillPreferenceControl(page: Page, labelPattern: RegExp, value: string) {
  const combobox = page.getByRole('combobox', { name: labelPattern });
  if (await combobox.isVisible().catch(() => false)) {
    await combobox.selectOption({ label: value });
    return;
  }

  const select = page.locator('select').filter({ has: page.getByText(labelPattern) });
  if (await select.first().isVisible().catch(() => false)) {
    await select.first().selectOption({ label: value });
    return;
  }

  const input = page.getByLabel(labelPattern);
  if (await input.isVisible().catch(() => false)) {
    await input.fill(value);
    return;
  }

  throw new Error(`Could not find a preference control for ${labelPattern.toString()}`);
}

async function expectPreferenceSaved(page: Page, labelPattern: RegExp, expectedValue: string) {
  const combobox = page.getByRole('combobox', { name: labelPattern });
  if (await combobox.isVisible().catch(() => false)) {
    await expect(combobox).toHaveValue(expectedValue);
    return;
  }

  const select = page.locator('select').filter({ has: page.getByText(labelPattern) });
  if (await select.first().isVisible().catch(() => false)) {
    await expect(select.first()).toHaveValue(/.+/);
    await expect(select.first()).toContainText(expectedValue);
    return;
  }

  const summary = page.getByText(new RegExp(`${labelPattern.source}.*${expectedValue}`, 'i'));
  await expect(summary).toBeVisible();
}

async function triggerStandardNotification(page: Page) {
  const triggerButton = await firstVisible(page, [
    page.getByRole('button', { name: /trigger notification/i }),
    page.getByRole('button', { name: /send notification/i }),
    page.getByRole('button', { name: /generate notification/i }),
    page.getByRole('button', { name: /standard test notification/i }),
  ]);
  await triggerButton.click();
}

test.describe('Notification management and delivery flows', () => {
  test('TC-001: Verify user preferences can be configured for notification channels, frequency, and types', async ({ page }) => {
    await openNotificationPreferences(page);

    await expect(page.getByText(/channels?/i)).toBeVisible();
    await expect(page.getByText(/frequency/i)).toBeVisible();
    await expect(page.getByText(/types?/i)).toBeVisible();

    await expect(page.getByText(/email/i)).toBeVisible();

    await fillPreferenceControl(page, /channel/i, 'Email');

    const frequencyControl = page.getByRole('combobox', { name: /frequency/i });
    if (await frequencyControl.isVisible().catch(() => false)) {
      const options = await frequencyControl.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(0);
      await frequencyControl.selectOption({ index: 0 });
    } else {
      const frequencyInput = page.getByLabel(/frequency/i);
      await expect(frequencyInput).toBeVisible();
      await frequencyInput.fill('As available in the application');
    }

    const typeControl = page.getByRole('combobox', { name: /notification type/i });
    if (await typeControl.isVisible().catch(() => false)) {
      const options = await typeControl.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(0);
      await typeControl.selectOption({ index: 0 });
    } else {
      const typeInput = page.getByLabel(/notification type/i);
      await expect(typeInput).toBeVisible();
      const currentValue = await typeInput.inputValue().catch(() => '');
      if (!currentValue) {
        await typeInput.fill('Default');
      }
    }

    const saveButton = await firstVisible(page, [
      page.getByRole('button', { name: /save preferences/i }),
      page.getByRole('button', { name: /^save$/i }),
    ]);
    await saveButton.click();

    await expect(page.getByText(/saved|updated|success/i)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /notification preferences/i })).toBeVisible();
    await expectPreferenceSaved(page, /channel/i, 'Email');
  });

  test('TC-002: Verify notifications can be sent through Email, In-App, and SMS channels', async ({ page }) => {
    await openNotificationsCenter(page);

    await triggerStandardNotification(page);

    await expect(page.getByText(/notification/i)).toBeVisible();
    await expect(page.getByText(/email/i)).toBeVisible();
    await expect(page.getByText(/in-app/i)).toBeVisible();
    await expect(page.getByText(/sms/i)).toBeVisible();

    const content = page.getByText(/standard test notification|notification content|message/i);
    await expect(content).toBeVisible();
  });

  test('TC-003: Verify delivery tracking logs are created and retry is performed for failed notification delivery', async ({ page }) => {
    await openNotificationsCenter(page);

    await page.route(/.*\/api\/notifications.*deliver.*/i, async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Simulated failed delivery',
        }),
      });
    });

    await triggerStandardNotification(page);

    const simulateFailureButton = page.getByRole('button', { name: /simulate.*failure/i });
    if (await simulateFailureButton.isVisible().catch(() => false)) {
      await simulateFailureButton.click();
    }

    await expect(page.getByText(/delivery log|tracking log/i)).toBeVisible();
    await expect(page.getByText(/failed/i)).toBeVisible();
    await expect(page.getByText(/retry/i)).toBeVisible();

    const finalStatus = page.getByText(/delivered|retry succeeded|final status/i);
    await expect(finalStatus).toBeVisible();
  });

  test('TC-004: Verify notification processing integrates with MailGenerationService and scheduler', async ({ page }) => {
    await openScheduler(page);

    await expect(page.getByText(/mailgenerationservice|mail generation service/i)).toBeVisible();

    const runButton = await firstVisible(page, [
      page.getByRole('button', { name: /run now/i }),
      page.getByRole('button', { name: /trigger job/i }),
      page.getByRole('button', { name: /execute/i }),
      page.getByRole('button', { name: /start scheduler/i }),
    ]);
    await runButton.click();

    await expect(page.getByText(/scheduler.*initiated|job started|processing/i)).toBeVisible();
    await expect(page.getByText(/mailgenerationservice|notification generated|generated through the scheduled flow/i)).toBeVisible();
    await expect(page.getByText(/available for delivery|ready for delivery/i)).toBeVisible();
  });
});
