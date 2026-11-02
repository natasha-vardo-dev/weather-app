# client

The React web app (Vite, React Router), its service workers and the Vercel middleware that proxies `/api`.

```bash
npm run dev -w client        # http://localhost:5173, /api proxied to :3001; no service worker, no CSP
npm run build && npm run preview -w client   # http://localhost:4173, as users get it (offline, push, headers)
npm test -w client           # component tests (Vitest, Testing Library)
npm run test:e2e             # Playwright + axe on the production build (once: npx playwright install chromium)
```

- `src/pages` one component per route; `src/components` the UI; `src/hooks` data loading; `src/i18n/locales` the 8
  languages; `src/sw` and `public/push-sw.js` the service workers; `e2e` the Playwright tests with `/api` mocked.
- Settings: `.env.example` (Firebase values only with push).
- How it works: [docs/architecture.md](../docs/architecture.md) (Frontend, Languages, Installable app…); rules:
  [CONTRIBUTING.md](../CONTRIBUTING.md#rules-that-are-easy-to-miss).
