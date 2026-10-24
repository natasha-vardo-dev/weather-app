import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nProvider';

/** Page title. In an SPA the browser doesn't update it on navigation. */
export function usePageMeta(title: string | null) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = title ? `${title} · ${t.appName}` : t.appName;
  }, [title, t.appName]);
}
