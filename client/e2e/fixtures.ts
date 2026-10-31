import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

/**
 * When axe ran on each page: it sets inline styles on elements while it measures (colour
 * contrast), which the site's Content-Security-Policy refuses and the browser logs as an
 * error. Those are axe's, not the app's, so they are not counted then, and only then: the
 * policy itself is checked by every test (vite preview sends the site's headers).
 */
const axeRuns = new WeakMap<Page, { from: number; to: number }[]>();
const AXE_INLINE_STYLE = /^Applying inline style violates the following Content Security Policy directive/;

/**
 * Every test gets the mocked API and `checkA11y`; after the test, no request may have gone
 * unanswered by the mocks and the page must not have logged errors (a Content-Security-Policy
 * violation included).
 */
export const test = base.extend<{ checkA11y: (label: string) => Promise<void> }>({
  page: async ({ page }, use) => {
    const { unexpected } = await mockApi(page);
    const errors: { text: string; at: number }[] = [];
    page.on('pageerror', (error) => errors.push({ text: error.message, at: Date.now() }));
    page.on('console', (message) => {
      // A 404 or 502 the test asked for is logged by the browser too; unanswered requests
      // are caught above instead.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        errors.push({ text: message.text(), at: Date.now() });
      }
    });
    await use(page);
    expect(unexpected, 'API requests the mocks do not answer').toEqual([]);
    const runs = axeRuns.get(page) ?? [];
    const byAxe = ({ text, at }: { text: string; at: number }) =>
      AXE_INLINE_STYLE.test(text) && runs.some(({ from, to }) => at >= from && at <= to);
    expect(
      errors.filter((error) => !byAxe(error)).map(({ text }) => text),
      'errors in the page',
    ).toEqual([]);
  },
  checkA11y: async ({ page }, use) => {
    await use((label) => checkA11y(page, label));
  },
});

export { expect };

/**
 * axe-core on the page as it is now, against WCAG 2.1 A and AA. Run it in each state worth
 * checking (a menu open, a list shown): axe sees only what is in the DOM at that moment.
 */
async function checkA11y(page: Page, label: string) {
  const from = Date.now();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // Console messages arrive a moment after they are logged.
  await page.waitForTimeout(100);
  axeRuns.set(page, [...(axeRuns.get(page) ?? []), { from, to: Date.now() }]);
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, '\n      ')}`).join('\n'),
  );
  expect(report, `accessibility violations: ${label}`).toEqual([]);
}
