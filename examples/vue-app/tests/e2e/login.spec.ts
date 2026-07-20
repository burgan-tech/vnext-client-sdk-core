import { test, expect, type Page } from '@playwright/test';
import { CREDS } from './fixtures';

const { userName: USER, password: PASS, otp: OTP } = CREDS;

// Drives the interactive 2FA login end-to-end through the server-driven pseudo-ui
// views, handling either the push or OTP second factor, and asserts the app flips
// to the 2FA dashboard.
test('2FA login → 2fa token + navigation flip', async ({ page }) => {
  // Boot does real IDM work + several config reads; wait for the boot signal
  // before interacting rather than racing the default assertion timeout.
  const booted = page.waitForEvent('console', {
    predicate: (m) => m.text().includes('booted from clientId=IbWeb'),
    timeout: 120_000,
  });
  await page.goto('/');
  await booted;
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Credentials view (user-login pre-login state). pseudo-ui renders both fields
  // as textboxes: [0] = User Name, [1] = Password.
  const boxes = page.getByRole('textbox');
  await expect(boxes.first()).toBeVisible({ timeout: 20_000 });
  await boxes.nth(0).fill(USER);
  await boxes.nth(1).fill(PASS);
  // The pseudo-ui submit button is "Login" (exact); avoid the debug transitions chip "login".
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // Second factor — OTP field or push approve, whichever the backend routes to.
  await handleSecondFactor(page);

  // Flip to 2FA: the master swaps to the 2FA chrome (authenticated AppBar title).
  await expect(page.getByText('Burgan · Accounts')).toBeVisible({ timeout: 60_000 });

  // The profile menu now shows the logged-in identity; opening it reveals the
  // 2fa token flag (the session status moved from the sidebar into the profile).
  const profile = page.getByRole('button', { name: /Hesabım/ });
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(page.getByText(/2-Factor ✓/)).toBeVisible();

  // Change-password flow is wired into the 2FA profile menu. Open it and assert
  // the start form renders (keyed by the logged-in userId). We do NOT submit —
  // completing the flow would change the test user's real password.
  await page.getByRole('button', { name: 'Change Password' }).click();
  await expect(page.getByText('Current Password')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Confirm New Password')).toBeVisible();
});

async function handleSecondFactor(page: Page): Promise<void> {
  // OTP-submit button label varies by backend view (Verify / Continue / TR variants).
  const verify = page.getByRole('button', { name: /^(Verify|Continue|Doğrula|Devam)$/ });
  const approve = page.getByRole('button', { name: /^(Approve|Onayla)$/ });

  // Wait for the 2nd-factor view (OTP or push), then act ONCE — re-clicking would
  // re-submit the same OTP mid-transition and the backend rejects the duplicate.
  await Promise.race([
    verify.waitFor({ state: 'visible', timeout: 40_000 }).catch(() => undefined),
    approve.first().waitFor({ state: 'visible', timeout: 40_000 }).catch(() => undefined),
  ]);

  if (await verify.isVisible().catch(() => false)) {
    await page.getByRole('textbox').last().fill(OTP);
    await verify.click();
  } else if (await approve.first().isVisible().catch(() => false)) {
    await approve.first().click();
  }
}
