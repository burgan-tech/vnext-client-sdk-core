import { test, expect } from '@playwright/test';

// Boots from a single clientId; the ENTIRE chrome (brand, token switcher, nav,
// status, app bar) is the backend master-layout View rendered by pseudo-ui, with
// the device dashboard in the router outlet. Real browser → WebCrypto works.
test('clientId → backend master chrome + device homepage', async ({ page }) => {
  const booted = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('booted from clientId=IbWeb'),
    timeout: 30_000,
  });
  await page.goto('/');
  await booted;

  // Chrome — all backend-defined (master View + sub-components + nav outlet):
  await expect(page.getByText('shell·IbWeb')).toBeVisible(); // shell-brand sub-component
  await expect(page.getByText('Burgan', { exact: true })).toBeVisible(); // AppBar (master)
  await expect(page.getByRole('button', { name: 'device', exact: true })).toBeVisible(); // shell-tokenbar
  await expect(page.getByText('Karsilama')).toBeVisible(); // nav outlet (NavMenu)

  // Content (router outlet) — device pre-login dashboard:
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();

  // Status line (master, bound to instance data): device token + registration.
  await expect(page.getByText(/tokens device✓/)).toBeVisible();
  await expect(page.getByText(/\(B\)/)).toBeVisible();

  // Theme (from the shell `theme` workflow) applied as CSS variables at boot.
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
  );
  expect(primary).toBe('#4f46e5');
});
