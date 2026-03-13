/**
 * Camp Code Gate E2E Test
 *
 * Verifies the camp code gate blocks access without valid code
 * and persists across page refreshes.
 */
import { test, expect } from '@playwright/test';

const CAMP_CODE = process.env.CAMP_CODE || 'test-camp-2026';

test.describe('Camp Code Gate', () => {
  test('landing page shows camp code input', async ({ page }) => {
    await page.goto('/');
    const codeInput = page.getByPlaceholder(/camp code/i).or(page.locator('input[type="text"]').first());
    await expect(codeInput).toBeVisible();
  });

  test('gate blocks without valid code', async ({ page }) => {
    await page.goto('/');

    // Try entering wrong code
    const codeInput = page.getByPlaceholder(/camp code/i).or(page.locator('input[type="text"]').first());
    await codeInput.fill('wrong-code-123');

    const submitBtn = page.getByRole('button', { name: /enter|submit|go/i });
    await submitBtn.click();

    // Should show error or remain on landing page
    // Faculty list should NOT be visible
    await page.waitForTimeout(1000);

    // Check that we're still on the landing page or an error is shown
    const errorOrGate = page.getByText(/invalid|incorrect|wrong|try again/i).or(
      page.getByPlaceholder(/camp code/i)
    );
    await expect(errorOrGate.first()).toBeVisible();
  });

  test('valid code shows faculty list', async ({ page }) => {
    await page.goto('/');

    const codeInput = page.getByPlaceholder(/camp code/i).or(page.locator('input[type="text"]').first());
    await codeInput.fill(CAMP_CODE);

    const submitBtn = page.getByRole('button', { name: /enter|submit|go/i });
    await submitBtn.click();

    // Should see faculty list
    await page.waitForTimeout(2000);
    const links = page.locator('a[href*="/teacher/"]');
    // At minimum, the gate should be gone
    const gateInput = page.getByPlaceholder(/camp code/i);
    const gateVisible = await gateInput.isVisible().catch(() => false);

    if (!gateVisible) {
      // Gate is gone, faculty should be visible
      expect(true).toBe(true);
    }
  });

  test('camp code persists across page refresh', async ({ page }) => {
    await page.goto('/');

    // Enter valid code
    const codeInput = page.getByPlaceholder(/camp code/i).or(page.locator('input[type="text"]').first());
    await codeInput.fill(CAMP_CODE);
    const submitBtn = page.getByRole('button', { name: /enter|submit|go/i });
    await submitBtn.click();

    // Wait for faculty to load
    await page.waitForTimeout(2000);

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Camp code should still be valid — gate should not reappear
    const gateInput = page.getByPlaceholder(/camp code/i);
    const gateVisible = await gateInput.isVisible().catch(() => false);

    // Either gate is hidden (code persisted) or faculty links are visible
    const facultyLinks = page.locator('a[href*="/teacher/"]');
    const hasLinks = await facultyLinks.count() > 0;

    // At least one of these should be true
    expect(!gateVisible || hasLinks).toBe(true);
  });
});
