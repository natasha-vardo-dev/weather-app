import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

// The other tests fail on any console error, so they would catch the app breaking the policy;
// this one makes sure the policy is there and enforced, or they would prove nothing.
test("the site's security headers are sent and its Content-Security-Policy is enforced", async ({ page }) => {
  await mockApi(page);
  const response = await page.goto('/');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('geolocation=(self)');

  const blocked = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.effectiveDirective));
    // An injected script and an inline style: what an XSS would try.
    const script = document.createElement('script');
    script.textContent = 'window.__injected = true';
    document.body.append(script);
    document.body.setAttribute('style', 'background: red');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { violations, ran: 'injected' in window };
  });
  expect(blocked.ran).toBe(false);
  expect(blocked.violations).toEqual(expect.arrayContaining(['script-src-elem', 'style-src-attr']));
});
