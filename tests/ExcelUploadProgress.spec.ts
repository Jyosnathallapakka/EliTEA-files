import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'path';

const uploadUrl = process.env.EXCEL_UPLOAD_URL ?? '/excel-upload';
const excelFilePath = path.resolve(
  process.cwd(),
  process.env.EXCEL_TEST_FILE ?? 'tests/fixtures/valid-excel-upload.xlsx',
);

async function openExcelUploadScreen(page: Page) {
  await page.goto(uploadUrl, { waitUntil: 'domcontentloaded' });
}

async function attachValidExcelFile(page: Page) {
  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput, 'Expected an Excel file input to be present').toBeVisible();
  await fileInput.setInputFiles(excelFilePath);
}

async function startUpload(page: Page) {
  const uploadButton = page
    .getByRole('button', { name: /^(start )?upload$/i })
    .first();

  await expect(uploadButton, 'Expected an upload button to be visible').toBeVisible();
  await uploadButton.click();
}

function progressIndicator(page: Page): Locator {
  return page
    .locator(
      '[data-testid="upload-progress"], [data-testid="progress-bar"], [role="progressbar"], [aria-label*="progress" i], [class*="progress" i]',
    )
    .first();
}

function uploadStatusArea(page: Page): Locator {
  return page
    .locator(
      '[data-testid="upload-progress-area"], [data-testid="upload-status"], [aria-label*="upload progress" i], [class*="upload-progress" i]',
    )
    .first();
}

async function readVisibleState(locator: Locator): Promise<string> {
  const attributes = await Promise.allSettled([
    locator.getAttribute('aria-valuenow'),
    locator.getAttribute('aria-valuetext'),
    locator.textContent(),
  ]);

  const values = attributes
    .map((entry) => (entry.status === 'fulfilled' ? entry.value : null))
    .filter((value): value is string => Boolean(value && value.trim()));

  return values.join(' | ');
}

test.describe('Excel upload progress indicators', () => {
  test('TC-001: progress bar updates incrementally during Excel upload', async ({ page }) => {
    await openExcelUploadScreen(page);
    await attachValidExcelFile(page);
    await startUpload(page);

    const progress = progressIndicator(page);
    await expect(progress, 'Expected upload progress to be visible').toBeVisible();

    const snapshots: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const state = await readVisibleState(progress);
      if (state) snapshots.push(state);

      const currentValue = Number(await progress.getAttribute('aria-valuenow'));
      if (!Number.isNaN(currentValue) && currentValue >= 100) {
        break;
      }

      await page.waitForTimeout(250);
    }

    const uniqueSnapshots = [...new Set(snapshots)];
    expect(
      uniqueSnapshots.length,
      `Expected the progress indicator to change over time, but observed: ${snapshots.join(', ')}`,
    ).toBeGreaterThan(1);
  });

  test('TC-002: estimated time remaining is displayed during Excel upload', async ({ page }) => {
    await openExcelUploadScreen(page);
    await attachValidExcelFile(page);
    await startUpload(page);

    const statusArea = uploadStatusArea(page);
    await expect(statusArea, 'Expected the upload status area to be visible').toBeVisible();

    await expect.poll(
      async () => (await statusArea.textContent()) ?? '',
      {
        message: 'Expected estimated time remaining to be shown during upload',
        timeout: 15_000,
      },
    ).toMatch(/estimated time remaining|time remaining|eta/i);
  });

  test('TC-003: current row being processed is displayed during Excel upload', async ({ page }) => {
    await openExcelUploadScreen(page);
    await attachValidExcelFile(page);
    await startUpload(page);

    const statusArea = uploadStatusArea(page);
    await expect(statusArea, 'Expected the upload status area to be visible').toBeVisible();

    await expect.poll(
      async () => (await statusArea.textContent()) ?? '',
      {
        message: 'Expected current row information to be shown during upload',
        timeout: 15_000,
      },
    ).toMatch(/current row|row\s*\d+/i);
  });
});
