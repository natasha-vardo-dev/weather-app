import { useEffect } from 'react';

const APP_NAME = 'Weather forecast';

/** Page title. In an SPA the browser doesn't update it on navigation. */
export function usePageMeta(title: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
