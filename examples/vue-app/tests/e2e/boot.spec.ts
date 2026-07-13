import { test, expect } from '@playwright/test';

// Boots from a single clientId; the ENTIRE chrome (brand, nav, app bar, profile
// menu) is the backend master-layout View rendered by pseudo-ui, with the device
// dashboard in the router outlet. Real browser → WebCrypto works.
test('clientId → backend master chrome + device homepage', async ({ page }) => {
  // Boot does real work against the bank IDM (device registration + token) plus
  // several backend config reads, so allow generous headroom for network variance.
  const booted = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('booted from clientId=IbWeb'),
    timeout: 120_000,
  });
  await page.goto('/');
  await booted;

  // Chrome — all backend-defined (master View + sub-components + outlets):
  await expect(page.getByText('Amorphie')).toBeVisible(); // shell-brand sub-component
  await expect(page.getByText('Burgan', { exact: true })).toBeVisible(); // AppBar (master)
  // nav outlet (NavMenu) — localized item label resolved for the default (en) locale.
  await expect(page.getByRole('button', { name: 'About Us' })).toBeVisible();

  // Content (router outlet) — device pre-login dashboard:
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

  // Profile menu (AppBar outlet): pre-login shows the guest trigger; opening it
  // reveals the session status flags (device token held + registration).
  const profile = page.getByRole('button', { name: /Misafir/ });
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(page.getByText(/Device ✓/)).toBeVisible(); // device token flag (localized level label)
  await expect(page.getByText(/\(B\)/)).toBeVisible(); // registration status

  // Language toggle (profile menu) → backend nav labels are localized: switching
  // to TR re-resolves the [{language,label}] arrays ("About Us" → "Hakkımızda").
  await expect(page.getByRole('button', { name: 'About Us' })).toBeVisible();
  await page.getByRole('button', { name: 'TR', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hakkımızda' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'About Us' })).toHaveCount(0);

  // Theme (from the shell `theme` workflow) applied as CSS variables at boot.
  const primary = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
  );
  expect(primary).toBe('#4f46e5');
});
