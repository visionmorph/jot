# Browser regression tests

The tests protect user-visible behavior while the application scripts are modularized.

## First-time setup

1. Install Node.js 20 or newer.
2. Run `pnpm install`.
3. Run `pnpm exec playwright install chromium`.

## Running tests

- `pnpm test` runs the suite in a headless browser.
- `pnpm test:headed` shows the browser while the tests run.
- `pnpm test:ui` opens Playwright's interactive test runner.
- `pnpm test:report` opens the most recent HTML report.

When a test fails, Playwright keeps its trace, screenshot, and video in `test-results/`. The HTML report is written to `playwright-report/`.

Add regression coverage for a user-visible behavior before moving that behavior into another module. Prefer role, label, and `data-*` locators over CSS classes tied to styling.
