import { test, expect } from '@playwright/test';

test('EPAM client work navigation', async ({ page }) => {
  await page.goto('https://www.epam.com/');

  const acceptCookies = page.getByRole('button', { name: /accept all cookies|accept all/i });
  if (await acceptCookies.count()) {
    await acceptCookies.first().click().catch(() => {});
  }

  const servicesLink = page.getByRole('link', { name: /^Services$/ }).first();
  await servicesLink.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await servicesLink.evaluate((el) => (el as HTMLElement).click());

  await expect(page).toHaveURL(/\/services$/);

  const exploreClientWork = page.getByRole('link', { name: 'Explore Our Client Work', exact: true });
  await expect(exploreClientWork).toBeVisible();
  await exploreClientWork.click();

  await expect(page).toHaveURL(/\/services\/client-work$/);
  await expect(page.getByRole('heading', { name: /Client Work/i })).toBeVisible();
  await expect(page.getByText('Client Work', { exact: true })).toBeVisible();
});
