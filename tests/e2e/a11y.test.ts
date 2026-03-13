/**
 * Accessibility E2E Tests
 *
 * Uses axe-core to scan all main pages for accessibility violations.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const CAMP_CODE = process.env.CAMP_CODE || 'test-camp-2026';

const pages = [
  { name: 'Landing page', path: '/' },
  { name: 'Admin login', path: '/admin' },
];

for (const { name, path } of pages) {
  test(`${name} (${path}) has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();

    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log(`A11y violations on ${path}:`);
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
      }
    }

    expect(results.violations).toEqual([]);
  });
}

test.describe('Teacher pages a11y (requires camp code)', () => {
  test.beforeEach(async ({ page }) => {
    // Set camp code in localStorage before navigating
    await page.goto('/');
    await page.evaluate((code) => {
      localStorage.setItem('camp_code', code);
    }, CAMP_CODE);
  });

  test('landing page after auth has no a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('Admin pages a11y', () => {
  test('admin login page has no a11y violations', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
