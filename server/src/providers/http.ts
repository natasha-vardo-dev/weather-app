import { ProviderError } from '../errors.js';

/**
 * Most a provider's answer may weigh, by kind. Far above what they send (a forecast is ~30 KB,
 * the largest MeteoAlarm feed ~1 MB, a CAP ~20 KB), far below what would hurt a 512 MB
 * instance: a broken or hostile upstream must not make the server buffer or parse without end.
 */
export const MAX_BYTES = {
  json: 2 * 1024 * 1024,
  feed: 8 * 1024 * 1024,
  cap: 1024 * 1024,
} as const;

/**
 * The body as text, read as a stream and abandoned as soon as it passes `maxBytes` (a
 * Content-Length over it is refused before reading). `where` names the provider in the error.
 */
export async function readText(response: Response, maxBytes: number, where: string): Promise<string> {
  const tooLarge = () => new ProviderError(`${where}: response over ${maxBytes} bytes`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    // A timeout or a dropped connection while reading the body.
    throw new ProviderError(`${where}: ${(err as Error).name === 'TimeoutError' ? 'timeout' : 'body read failed'}`);
  }
  return text + decoder.decode();
}

/** A failed answer's body for the log: the first 64 KB at most, '' if it can't be read. */
export function readErrorText(response: Response, where: string): Promise<string> {
  return readText(response, 64 * 1024, where).catch(() => '');
}

/** The body as JSON, within `maxBytes`; broken JSON is the provider's error, not ours (a 502). */
export async function readJson(response: Response, maxBytes: number, where: string): Promise<unknown> {
  const text = await readText(response, maxBytes, where);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError(`${where}: invalid JSON`);
  }
}

/**
 * Runs at most `max` tasks at a time, the rest in order as slots free up: a page or a notifier
 * run that needs dozens of documents must not open dozens of connections (and buffers) at once.
 */
export function concurrencyLimit(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    // A finished task hands its slot straight to the next in line, so a newcomer can't slip in between.
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
