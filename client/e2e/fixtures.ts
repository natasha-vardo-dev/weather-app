import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

/**
 * Every test gets the mocked API and `checkA11y`; after the test, no request may have gone
 * unanswered by the mocks and the page must not have logged errors.
 */
export const test = base.extend<{ checkA11y: (label: string) => Promise<void> }>({
  page: async ({ page }, use) => {
    const { unexpected } = await mockApi(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // A 404 or 502 the test asked for is logged by the browser too; unanswered requests
      // are caught above instead.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        errors.push(message.text());
      }
    });
    await use(page);
    expect(unexpected, 'API requests the mocks do not answer').toEqual([]);
    expect(errors, 'errors in the page').toEqual([]);
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
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, '\n      ')}`).join('\n'),
  );
  expect(report, `accessibility violations: ${label}`).toEqual([]);
}
