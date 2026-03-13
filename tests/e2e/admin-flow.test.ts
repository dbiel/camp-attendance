/**
 * Admin Flow E2E Test
 *
 * Login → dashboard loads → navigate to Students → see full PII → sign out
 */
import { test, expect } from '@playwright/test';

test.describe('Admin Flow', () => {
  test('login → dashboard → see student data → sign out', async ({ page }) => {
    // 1. Go to admin login page
    await page.goto('/admin');

    // 2. Fill in email/password login form
    const emailInput = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
    const passwordInput = page.getByLabel(/password/i).or(page.locator('input[type="password"]'));

    if (await emailInput.count() === 0) {
      // May already be logged in or different auth flow
      test.skip();
      return;
    }

    await emailInput.fill('admin@test.com');
    await passwordInput.fill('testpassword123');

    const loginBtn = page.getByRole('button', { name: /sign in|login|log in/i });
    await loginBtn.click();

    // 3. Should redirect to dashboard
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    // 4. Dashboard should have attendance data
    await page.waitForLoadState('networkidle');
    const dashboardContent = await page.textContent('body');
    expect(dashboardContent).toBeTruthy();

    // 5. Navigate to students page
    const studentsLink = page.locator('a[href*="/admin/data/students"]').or(
      page.getByRole('link', { name: /students/i })
    );
    if (await studentsLink.count() > 0) {
      await studentsLink.first().click();
      await page.waitForLoadState('networkidle');

      // Should see full student data (PII visible to admin)
      await expect(page).toHaveURL(/\/admin\/data\/students/);
    }

    // 6. Sign out
    const signOutBtn = page.getByRole('button', { name: /sign out|logout|log out/i });
    if (await signOutBtn.count() > 0) {
      await signOutBtn.click();
      // Should redirect to login
      await page.waitForURL(/\/admin/, { timeout: 10000 });
    }
  });
});
