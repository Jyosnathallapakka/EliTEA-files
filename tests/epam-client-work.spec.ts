import { test, expect } from '@playwright/test';

test('EPAM client work page is reachable from Services menu', async ({ page }) => {
  await page.goto('https://www.epam.com/');

  await page.getByRole('link', { name: 'Services' }).click();
  await page.getByRole('link', { name: 'Explore Our Client Work' }).click();

  await expect(page.getByText('Client Work')).toBeVisible();
});