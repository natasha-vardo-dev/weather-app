# server

The Express API: `routes/` (HTTP and validation) → `services/` (logic, caches) → `providers/` (one adapter per
external API). Settings come from `.env` (`cp .env.example .env`; every variable explained there).

```bash
npm run dev -w server               # http://localhost:3001/api/health, with pino-pretty
npm test -w server                  # Vitest with fake providers (tests/fakeProvider.ts)
npm run openapi                     # regenerate docs/openapi.json after a schema change
npm run providers:check -w server   # the real Open-Meteo and MeteoAlarm (daily in CI)
npm run push:test -w server -- --token <token>   # a test notification to one device
```

- How it works: [docs/architecture.md](../docs/architecture.md) (Backend layers, Caching, Observability…).
- Running it: [docs/operations.md](../docs/operations.md), [docs/deploy-aws.md](../docs/deploy-aws.md).
- Rules: [CONTRIBUTING.md](../CONTRIBUTING.md#rules-that-are-easy-to-miss).
