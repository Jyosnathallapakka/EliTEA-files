import { expect, test, type Page } from '@playwright/test';

test.use({
  baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
});

const DEFAULT_TIMEOUT_MS = 15_000;

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function login(page: Page, emailEnv: string, passwordEnv: string): Promise<void> {
  const email = requireEnv(emailEnv);
  const password = requireEnv(passwordEnv);

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  await expect(page).toHaveURL(/(dashboard|home|app)/i, { timeout: DEFAULT_TIMEOUT_MS });
}

async function openAuditLogs(page: Page): Promise<void> {
  const auditLogsUrl = process.env.AUDIT_LOGS_URL;

  if (auditLogsUrl) {
    await page.goto(auditLogsUrl);
  } else {
    const auditLogLink = page.getByRole('link', { name: /audit log|audit logs/i });
    if (await auditLogLink.count()) {
      await auditLogLink.first().click();
    } else {
      await page.goto('/audit-logs');
    }
  }

  await expect(page.getByRole('heading', { name: /audit log|audit logs/i })).toBeVisible({
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

async function getAuditRowCount(page: Page): Promise<number> {
  const tableRows = page.getByRole('row');
  return tableRows.count();
}

async function verifyAuditEntryCreated(page: Page, previousRowCount: number, expectedText: string | RegExp): Promise<void> {
  await expect
    .poll(async () => getAuditRowCount(page), { timeout: DEFAULT_TIMEOUT_MS })
    .toBeGreaterThan(previousRowCount);

  await expect(page.getByText(expectedText, { exact: false })).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

async function submitRating(page: Page): Promise<void> {
  await page.goto('/ratings');

  const ratingInput = page.getByLabel(/rating/i).first();
  if (await ratingInput.count()) {
    await ratingInput.fill(process.env.RATING_VALUE ?? '5');
  } else {
    await page.getByRole('radio', { name: /5|excellent|high/i }).first().click();
  }

  await page.getByRole('button', { name: /submit rating|save rating|rate/i }).click();
  await expect(page.getByText(/rating submitted|submission successful|thank you/i)).toBeVisible({
    timeout: DEFAULT_TIMEOUT_MS,
  });
}

async function deactivateUser(page: Page): Promise<void> {
  const targetUser = requireEnv('TARGET_USER_NAME', 'active-user');

  await page.goto('/users');
  await page.getByRole('searchbox', { name: /search/i }).fill(targetUser);
  await page.getByRole('button', { name: /search/i }).click();
  await page.getByRole('button', { name: /deactivate/i }).first().click();
  await page.getByRole('button', { name: /confirm|yes, deactivate|deactivate user/i }).click();
  await expect(page.getByText(/deactivated|user deactivated/i)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

async function changeDelegation(page: Page): Promise<void> {
  await page.goto('/delegation');

  const delegateTo = requireEnv('DELEGATE_TO_USER', 'delegate-user');
  const delegationField = page.getByLabel(/delegate to|assignee|delegate/i).first();
  if (await delegationField.count()) {
    await delegationField.fill(delegateTo);
  } else {
    await page.getByRole('combobox').first().selectOption({ label: delegateTo }).catch(() => undefined);
  }

  const effectiveDate = page.getByLabel(/effective date|start date/i).first();
  if (await effectiveDate.count()) {
    await effectiveDate.fill(process.env.DELEGATION_DATE ?? '2026-01-01');
  }

  await page.getByRole('button', { name: /save|update|apply/i }).click();
  await expect(page.getByText(/delegation (saved|updated|changed)|success/i)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

async function uploadFile(page: Page): Promise<void> {
  await page.goto('/files/upload');

  const uploadPath = requireEnv('UPLOAD_FILE_PATH');
  await page.setInputFiles('input[type="file"]', uploadPath);
  await page.getByRole('button', { name: /upload/i }).click();
  await expect(page.getByText(/uploaded|upload successful|file added/i)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

async function approveItem(page: Page): Promise<void> {
  const approvableItem = requireEnv('APPROVAL_ITEM_NAME', 'pending-approval-item');

  await page.goto('/approvals');
  await page.getByRole('searchbox', { name: /search/i }).fill(approvableItem);
  await page.getByRole('button', { name: /search/i }).click();
  await page.getByRole('button', { name: /approve/i }).first().click();
  await page.getByRole('button', { name: /confirm|approve/i }).click();
  await expect(page.getByText(/approved|approval completed/i)).toBeVisible({ timeout: DEFAULT_TIMEOUT_MS });
}

test.describe('Audit logging compliance checks', () => {
  test('TC-001 Verify audit logging is created for rating submission', async ({ page }) => {
    await login(page, 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD');
    await submitRating(page);

    const previousRowCount = await getAuditRowCount(page);
    await openAuditLogs(page);
    await verifyAuditEntryCreated(page, previousRowCount, /rating submission|submitted rating|rating/i);
  });

  test('TC-002 Verify audit logging is created for user deactivation', async ({ page }) => {
    await login(page, 'ADMIN_USER_EMAIL', 'ADMIN_USER_PASSWORD');
    await deactivateUser(page);

    const previousRowCount = await getAuditRowCount(page);
    await openAuditLogs(page);
    await verifyAuditEntryCreated(page, previousRowCount, /user deactivation|deactivated user|deactivate/i);
  });

  test('TC-003 Verify audit logging is created for delegation changes', async ({ page }) => {
    await login(page, 'DELEGATION_USER_EMAIL', 'DELEGATION_USER_PASSWORD');
    await changeDelegation(page);

    const previousRowCount = await getAuditRowCount(page);
    await openAuditLogs(page);
    await verifyAuditEntryCreated(page, previousRowCount, /delegation change|delegation updated|delegation/i);
  });

  test('TC-004 Verify audit logging is created for file upload', async ({ page }) => {
    await login(page, 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD');
    await uploadFile(page);

    const previousRowCount = await getAuditRowCount(page);
    await openAuditLogs(page);
    await verifyAuditEntryCreated(page, previousRowCount, /file upload|uploaded file|upload/i);
  });

  test('TC-005 Verify audit logging is created for approval action', async ({ page }) => {
    await login(page, 'APPROVER_USER_EMAIL', 'APPROVER_USER_PASSWORD');
    await approveItem(page);

    const previousRowCount = await getAuditRowCount(page);
    await openAuditLogs(page);
    await verifyAuditEntryCreated(page, previousRowCount, /approval action|approved item|approval/i);
  });
});
