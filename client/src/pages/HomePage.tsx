import { FORECAST_DEFAULT_DAYS } from '@weather/shared';
import { FavoritesList } from '../components/FavoritesList';
import { InstallHint } from '../components/InstallHint';
import { usePageMeta } from '../hooks/usePageMeta';
import { useI18n } from '../i18n/I18nProvider';

export function HomePage() {
  usePageMeta(null);
  const { t } = useI18n();

  return (
    <div className="empty">
      <h1 className="empty__title">{t.home.title}</h1>
      <p className="empty__text">{t.home.text(FORECAST_DEFAULT_DAYS)}</p>
      <InstallHint />
      <FavoritesList />
    </div>
  );
}
