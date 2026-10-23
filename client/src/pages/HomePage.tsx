import { usePageMeta } from '../hooks/usePageMeta';

export function HomePage() {
  usePageMeta(null);

  return (
    <div className="empty">
      <h1 className="empty__title">What's the weather where you're going?</h1>
      <p className="empty__text">Search for a city to see the current conditions and a 10-day forecast.</p>
    </div>
  );
}
