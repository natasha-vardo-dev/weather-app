import { createApiClient } from '@weather/shared';
import { markSavedResponse } from './savedResponses';

export { ApiError } from '@weather/shared';

/** In development Vite proxies /api to the server, so an empty base URL works. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  fetchFn: async (...args) => markSavedResponse(await fetch(...args)),
});
