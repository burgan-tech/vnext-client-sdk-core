import { test, expect } from '@playwright/test';

// The browser Back button must drive the page-router's OWN history (goBack) in
// SDI, NOT unload the SPA. bindBrowserHistory() wires window.history ↔ router.
test('SDI: browser Back uses page-router history (no full reload)', async ({ page }) => {
  let bootCount = 0;
  page.on('console', (m) => {
    if (m.text().includes('booted from clientId=IbWeb')) bootCount += 1;
  });

  const booted = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('booted from clientId=IbWeb'),
    timeout: 120_000,
  });
  await page.goto('/');
  await booted;

  // Homepage (device dashboard) is showing.
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

  // Navigate to a content view via the sidebar (SDI → replaces the router body).
  await page.getByRole('button', { name: 'Information Security' }).click();
  await expect(page).toHaveURL(/#\/info-security$/);
  await expect(page.getByRole('button', { name: 'Sign In' })).toHaveCount(0);

  // Browser Back → router.goBack(), back to the homepage — WITHOUT re-booting.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  expect(bootCount).toBe(1); // no full app reload happened
});
