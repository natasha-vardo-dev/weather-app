/**
 * The server's settings, read from the environment in one place and checked before anything
 * starts. In production a setting that would quietly weaken a security boundary stops the
 * server instead (fail closed): an instance that refuses to start is noticed at once, one
 * that serves without its proxy check is not. Locally every setting stays optional.
 */

/** Secrets are compared to what the proxy and the scheduler send: long random strings. */
export const MIN_SECRET_LENGTH = 32;

export interface Config {
  production: boolean;
  port: number;
  /** Address to listen on; all interfaces when unset. */
  host?: string;
  forecastTtlSeconds: number;
  corsOrigins: string[];
  nominatimUserAgent: string;
  trustProxy: number | false;
  proxySecret?: string;
  ipSelfLookup: boolean;
  /** The Firebase service account's JSON key, parsed; null without push. */
  firebaseAccount: Record<string, string> | null;
  notifySecret?: string;
  metricsSecret?: string;
  version?: string;
}

type Env = Record<string, string | undefined>;

/**
 * Production is NODE_ENV=production (set by the systemd unit in deploy/vm), or Render
 * (which sets RENDER=true): the host is enough, so a deploy where nobody set NODE_ENV is
 * still checked.
 */
export function isProduction(env: Env): boolean {
  return env.NODE_ENV?.trim() === 'production' || env.RENDER?.trim() === 'true';
}

const value = (env: Env, name: string): string | undefined => env[name]?.trim() || undefined;

/**
 * A positive number from the environment, or the default when unset or empty. Anything
 * else stops the server: an empty or mistyped value used to give 0 (no cache, every
 * request to the rate-limited provider) or NaN (cached forecasts never expiring).
 */
function positiveNumber(env: Env, name: string, fallback: number): number {
  const raw = value(env, name);
  if (!raw) return fallback;
  const number = Number(raw);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return number;
}

function serviceAccount(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  try {
    const account: unknown = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (account && typeof account === 'object' && !Array.isArray(account)) return account as Record<string, string>;
  } catch {
    // Reported below without the value: it is a secret.
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not a JSON key (plain or base64)');
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Reads and checks the settings; throws with every problem found, never with a secret's value. */
export function loadConfig(env: Env): Config {
  const production = isProduction(env);
  // The site calls the API through its own origin (ADR 0005), so production needs no CORS at
  // all; the default is for the Vite dev server only.
  const corsOrigins = (env.CORS_ORIGIN ?? (production ? '' : 'http://localhost:5173'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const config: Config = {
    production,
    port: positiveNumber(env, 'PORT', 3001),
    // On the VM only Caddy, on the same machine, should reach the server (deploy/vm).
    host: value(env, 'LISTEN_HOST'),
    forecastTtlSeconds: positiveNumber(env, 'FORECAST_CACHE_TTL', 900),
    corsOrigins,
    // Nominatim's policy asks for an identifying User-Agent with a way to reach the app's author.
    nominatimUserAgent:
      value(env, 'NOMINATIM_USER_AGENT') ?? 'weather-app/1.0 (+https://github.com/natasha-vardo-dev/weather-app)',
    // Proxies in front of the server that may set X-Forwarded-For (Caddy on the VM: 1).
    // Only these are trusted; otherwise anyone could fake their address in the header.
    trustProxy: value(env, 'TRUST_PROXY') ? positiveNumber(env, 'TRUST_PROXY', 1) : false,
    proxySecret: value(env, 'PROXY_SECRET'),
    ipSelfLookup: value(env, 'IP_SELF_LOOKUP') === '1',
    firebaseAccount: serviceAccount(value(env, 'FIREBASE_SERVICE_ACCOUNT')),
    notifySecret: value(env, 'ALERTS_NOTIFY_SECRET'),
    metricsSecret: value(env, 'METRICS_SECRET'),
    // Written by deploy/vm/deploy.sh; Render sets its own.
    version: (value(env, 'GIT_COMMIT') ?? value(env, 'RENDER_GIT_COMMIT'))?.slice(0, 7),
  };

  const problems: string[] = [];
  const secret = (name: string, given: string | undefined, required: boolean) => {
    if (!given) {
      if (required) problems.push(`${name} is required in production`);
    } else if (production && given.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  };
  if (production) {
    // Without the secret anyone can call the API host directly with a forged address and get a
    // fresh per-IP allowance with every request (app.ts, proxySecret).
    secret('PROXY_SECRET', config.proxySecret, true);
    if (config.trustProxy === false) problems.push('TRUST_PROXY is required in production (1 behind Caddy on the VM)');
    // Local development only: on a server it would offer the data centre's city to everyone.
    if (config.ipSelfLookup) problems.push('IP_SELF_LOOKUP=1 is for local development only');
    // Push on but no scheduler secret: devices could subscribe, and nothing would ever be sent.
    if (config.firebaseAccount) secret('ALERTS_NOTIFY_SECRET', config.notifySecret, true);
    secret('METRICS_SECRET', config.metricsSecret, false);
    if (corsOrigins.some((origin) => !origin.startsWith('https://') || isLocalOrigin(origin))) {
      problems.push('CORS_ORIGIN may list only public https:// origins in production');
    }
  }
  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  return config;
}
