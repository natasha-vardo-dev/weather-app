import { Link } from 'react-router';
import { usePageMeta } from '../hooks/usePageMeta';

interface Props {
  message?: string;
}

export function NotFoundPage({ message = "This page doesn't exist." }: Props) {
  usePageMeta('Not found');

  return (
    <div className="empty">
      <h1 className="empty__title">Nothing here</h1>
      <p className="empty__text">
        {message} <Link to="/">Go to the start page</Link> or search for a city above.
      </p>
    </div>
  );
}
