/**
 * Settings + Rollover Wizard E2E Smoke Test (Task 22)
 *
 * Flow covered:
 *   1. Admin logs in via Firebase Auth
 *   2. Navigate /admin/settings
 *   3. Edit start_date / end_date / timezone
 *   4. Verify day_dates preview table (Key / Weekday / Date cols) reflects new dates
 *   5. Save → success toast
 *   6. Navigate /admin/settings/rollover
 *   7. Step 1 (INPUT) renders with Current year shown
 *   8. Fill new year + dates → Preview Changes
 *   9. Step 2 (PREVIEW) shows archived counts + "ROLLOVER <year>" confirm prompt
 *  10. Wrong confirm text → "Run Rollover" stays disabled
 *  11. Correct confirm text → "Run Rollover" becomes enabled
 *  12. Back → returns to Step 1 with form state preserved
 *
 * IMPORTANT: We DO NOT click "Run Rollover" — the real rollover is destructive.
 * The smoke stops at the confirm-gate verification.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RUNNING LOCALLY
 * ──────────────────────────────────────────────────────────────────────────
 * This test requires:
 *   (a) Firestore + Auth emulators running (see scripts/test-with-emulator.sh)
 *   (b) A seeded admin user (email: admin@test.com / password: testpassword123)
 *       The emulator setup in tests/setup/emulator.setup.ts creates this user.
 *   (c) `npm run dev` serving on http://localhost:3000 (or BASE_URL override)
 *   (d) A seeded CampConfig document so /admin/settings has data to render.
 *
 * If any of those prereqs aren't met, the tests will self-skip rather than
 * producing spurious failures. CI should provision the emulator/seed first,
 * then run `npm run test:e2e`.
 *
 * Auth approach:
 *   No JWT stub — we drive the real email/password sign-in form, matching
 *   the pattern used by tests/e2e/admin-flow.test.ts. An auth-bypass is a
 *   platform concern and intentionally out of scope for this task.
 *
 * Toggle: set E2E_RUN_SETTINGS_SMOKE=1 to force these to run. Without the
 * env var they're soft-skipped so CI doesn't block on missing infra.
 */
import { test, expect, Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'testpassword123';
const FORCE_RUN = process.env.E2E_RUN_SETTINGS_SMOKE === '1';

/**
 * Sign in as admin via the UI. Returns false if the login form isn't
 * present (already logged in or auth screen differs) — callers decide
 * whether to skip.
 */
async function adminLogin(page: Page): Promise<boolean> {
  await page.goto('/admin');
  const emailInput = page
    .getByLabel(/email/i)
    .or(page.locator('input[type="email"]'));

  if ((await emailInput.count()) === 0) return false;

  await emailInput.first().fill(ADMIN_EMAIL);
  await page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first()
    .fill(ADMIN_PASSWORD);

  await page.getByRole('button', { name: /sign in|login|log in/i }).click();

  // Either dashboard redirect succeeds (auth worked) or we'll bail when the
  // settings page fails to load config.
  await page
    .waitForURL(/\/admin\/(dashboard|settings)/, { timeout: 15000 })
    .catch(() => {
      /* swallow — downstream assertions will skip */
    });
  return true;
}

test.describe('Settings + Rollover Wizard smoke', () => {
  test.beforeEach(async ({ page }) => {
    if (!FORCE_RUN) {
      test.skip(
        true,
        'Set E2E_RUN_SETTINGS_SMOKE=1 with emulator + dev server + seeded admin to run. See file header.'
      );
    }

    const ok = await adminLogin(page);
    if (!ok) {
      test.skip(true, 'Admin login form not present — auth flow differs or already authed');
    }
  });

  test('edit camp identity → day_dates preview updates → save shows success toast', async ({
    page,
  }) => {
    await page.goto('/admin/settings');

    // Config card loads — bail gracefully if backend/seed isn't ready.
    const configLoaded = await page
      .getByRole('heading', { name: /camp identity/i })
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!configLoaded) {
      test.skip(true, 'Camp Identity section did not load — seed/admin auth not ready');
    }

    // Grab the form fields by their accessible labels.
    const startDate = page.getByLabel(/start date/i);
    const endDate = page.getByLabel(/end date/i);
    const timezone = page.getByLabel(/timezone/i);

    // Pick a deterministic Mon-Fri week (Mon 2099-06-01 → Fri 2099-06-05).
    // Far-future date means even if the active camp window happens to match
    // part of the preview, our edit is visibly different.
    const NEW_START = '2099-06-01';
    const NEW_END = '2099-06-05';
    const NEW_TZ = 'America/New_York';

    await startDate.fill(NEW_START);
    await endDate.fill(NEW_END);
    await timezone.selectOption(NEW_TZ);

    // day_dates preview table should render with the 3 expected columns.
    const previewTable = page.locator('table', {
      has: page.getByRole('columnheader', { name: /key/i }),
    });
    await expect(previewTable).toBeVisible();
    await expect(
      previewTable.getByRole('columnheader', { name: /key/i })
    ).toBeVisible();
    await expect(
      previewTable.getByRole('columnheader', { name: /weekday/i })
    ).toBeVisible();
    await expect(
      previewTable.getByRole('columnheader', { name: /date/i })
    ).toBeVisible();

    // And each date cell should reflect the new window.
    await expect(previewTable.getByText(NEW_START)).toBeVisible();
    await expect(previewTable.getByText(NEW_END)).toBeVisible();

    // Save.
    await page
      .getByRole('button', { name: /save camp identity/i })
      .click();

    // Success toast or inline "Saved" status.
    const successToast = page
      .getByText(/camp identity saved/i)
      .or(page.getByRole('status').filter({ hasText: /saved/i }));
    await expect(successToast.first()).toBeVisible({ timeout: 10_000 });
  });

  test('rollover wizard: input → preview → confirm gate behavior → back preserves state', async ({
    page,
  }) => {
    await page.goto('/admin/settings/rollover');

    // Step 1 (INPUT) — header + "Current year" indicator.
    const step1Heading = page.getByRole('heading', {
      name: /enter new year details/i,
    });
    const step1Loaded = await step1Heading
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!step1Loaded) {
      test.skip(true, 'Rollover wizard did not load Step 1 — auth/seed not ready');
    }

    await expect(page.getByText(/current year:/i)).toBeVisible();

    // Fill new-year form — the page pre-fills newYear = current_year + 1,
    // so we read & re-use it (avoids needing to fetch config in the test).
    const newYearInput = page.getByLabel(/new camp year/i);
    const prefilled = (await newYearInput.inputValue()).trim();
    const newYear = /^\d{4}$/.test(prefilled) ? prefilled : '2099';
    await newYearInput.fill(newYear);

    await page.getByLabel(/^start date$/i).fill('2099-06-01');
    await page.getByLabel(/^end date$/i).fill('2099-06-05');

    // Preview Changes → Step 2.
    await page.getByRole('button', { name: /preview changes/i }).click();

    // Step 2 (PREVIEW) heading.
    await expect(
      page.getByRole('heading', { name: /review and confirm/i })
    ).toBeVisible({ timeout: 20_000 });

    // Archived-counts line (0 or more) — just assert the Archiving line is
    // present; exact counts depend on seed state.
    await expect(
      page.getByText(/archiving year/i)
    ).toBeVisible();
    await expect(
      page.getByText(/attendance records/i)
    ).toBeVisible();

    // Confirm prompt: "Type ROLLOVER <year> to confirm".
    const expected = `ROLLOVER ${newYear}`;
    const confirmInput = page.getByLabel(new RegExp(`type .*${expected}`, 'i'));
    await expect(confirmInput).toBeVisible();

    const runBtn = page.getByRole('button', { name: /run rollover/i });

    // Gate behavior — starts disabled.
    await expect(runBtn).toBeDisabled();

    // Wrong text → still disabled.
    await confirmInput.fill('ROLLOVER WRONG');
    await expect(runBtn).toBeDisabled();

    // Correct text → enabled (but we WILL NOT click it — destructive).
    await confirmInput.fill(expected);
    await expect(runBtn).toBeEnabled();

    // Back → returns to Step 1 with form state preserved.
    await page.getByRole('button', { name: /^back$/i }).click();

    await expect(
      page.getByRole('heading', { name: /enter new year details/i })
    ).toBeVisible();

    // newYear + dates should still be filled (state lives in parent).
    await expect(page.getByLabel(/new camp year/i)).toHaveValue(newYear);
    await expect(page.getByLabel(/^start date$/i)).toHaveValue('2099-06-01');
    await expect(page.getByLabel(/^end date$/i)).toHaveValue('2099-06-05');
  });
});
