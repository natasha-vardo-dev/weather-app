import { ApiError, ERROR_CODES, MAX_FAVORITES, type ApiClient, type Forecast } from '@weather/shared';
import { isSavedValue, markSavedValue } from './savedResponses';

interface Waiting {
  latitude: number;
  longitude: number;
  resolve: (forecast: Forecast) => void;
  reject: (error: unknown) => void;
}

/**
 * Forecasts asked for in the same moment go out as one request. The start page renders a card
 * per saved city, each asking for its own forecast in an effect; those effects run one after
 * another in a single task, so collecting until the next microtask catches all of them: ten
 * cards are one GET /api/forecasts instead of ten. Nothing else changes for the components,
 * which still ask for one place each (through the shared forecast cache).
 *
 * Only the saved cities' tiles and cards are batched. The city page asks for its own forecast
 * alone (`sendAlone`): in a batch it would wait for the slowest saved city, and the service
 * worker would keep it only inside that batch, not as the city's own /forecast for offline
 * use. A single place left in a batch also goes out alone. (Found by roborev.)
 */
export function createForecastBatcher(
  client: Pick<ApiClient, 'getForecast' | 'getForecasts'>,
  schedule: (flush: () => void) => void = queueMicrotask,
) {
  let queue: Waiting[] = [];

  function flush() {
    const waiting = queue;
    queue = [];
    for (let i = 0; i < waiting.length; i += MAX_FAVORITES) void send(waiting.slice(i, i + MAX_FAVORITES));
  }

  async function sendEach(waiting: Waiting[]) {
    for (const w of waiting) client.getForecast(w.latitude, w.longitude).then(w.resolve, w.reject);
  }

  async function send(waiting: Waiting[]) {
    if (waiting.length === 1) return sendEach(waiting);
    let response;
    try {
      response = await client.getForecasts(waiting);
    } catch (err) {
      // One request each rather than every card empty, when:
      // - the server is older than the client (they deploy separately): no /api/forecasts yet;
      // - the network failed and the service worker has no copy of this exact list of places
      //   (favourites changed since, or the city page batched with the strip): it may still
      //   have each city's own /forecast. (Found by roborev.)
      if (err instanceof ApiError && (err.code === ERROR_CODES.NOT_FOUND || err.code === ERROR_CODES.NETWORK_ERROR)) {
        return sendEach(waiting);
      }
      waiting.forEach((w) => w.reject(err));
      return;
    }
    // A batch the service worker served from its cache: so is each forecast in it, and the
    // page must say it may be old (savedResponses).
    const saved = isSavedValue(response);
    // Another shape (a proxy's own JSON): every place gets "missing" rather than waiting forever.
    const results = Array.isArray(response?.forecasts) ? response.forecasts : [];
    waiting.forEach((w, i) => {
      const result = results[i];
      if (result && 'forecast' in result) {
        if (saved) markSavedValue(result.forecast);
        w.resolve(result.forecast);
      } else {
        const error = result?.error ?? { code: ERROR_CODES.INTERNAL, message: 'Missing from the answer.' };
        w.reject(new ApiError(error.message, error.code, 200));
      }
    });
  }

  return {
    /** Queued with the others asked for in this moment. */
    getForecast(latitude: number, longitude: number): Promise<Forecast> {
      return new Promise((resolve, reject) => {
        if (queue.length === 0) schedule(flush);
        queue.push({ latitude, longitude, resolve, reject });
      });
    },

    /**
     * Takes a queued place out of the batch and asks for it alone, now. For the city page: its
     * place's tile in the strip renders first (children's effects run before the parent's)
     * and queues it, and the page then joins that request through the shared cache.
     */
    sendAlone(latitude: number, longitude: number): void {
      const i = queue.findIndex((w) => w.latitude === latitude && w.longitude === longitude);
      if (i >= 0) void sendEach(queue.splice(i, 1));
    },
  };
}
