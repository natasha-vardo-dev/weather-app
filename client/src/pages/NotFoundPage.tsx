import { Link } from 'react-router';
import { usePageMeta } from '../hooks/usePageMeta';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  message?: string;
}

export function NotFoundPage({ message }: Props) {
  const { t } = useI18n();
  usePageMeta(t.notFound.pageTitle);

  return (
    <div className="empty">
      <h1 className="empty__title">{t.notFound.title}</h1>
      <p className="empty__text">
        {message ?? t.notFound.pageMissing} <Link to="/">{t.notFound.goHome}</Link>{' '}
        {t.notFound.orSearch}
      </p>
    </div>
  );
}
