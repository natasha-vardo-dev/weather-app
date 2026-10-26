import { SEARCH_MIN_LENGTH, type Location } from '@weather/shared';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { useLocateMe, type FoundPlace } from '../hooks/useMyLocation';
import { useI18n } from '../i18n/I18nProvider';
import { CrosshairIcon, SpinnerIcon } from './LocationIcons';

interface Props {
  onSelect: (location: Location) => void;
  /** The user's position was found (crosshair button). */
  onLocate: (place: FoundPlace) => void;
}

function describe(location: Location) {
  return [location.region, location.country].filter(Boolean).join(', ');
}

export function SearchBar({ onSelect, onLocate }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { t, language } = useI18n();
  const { results, loading, error, searchedFor } = useLocationSearch(query, language);
  const listId = useId();
  const locateMe = useLocateMe();
  const { clearError } = locateMe;
  const locateError = locateMe.error;

  // A location error stays until the next click anywhere, so it can be read but not linger.
  useEffect(() => {
    if (!locateError) return;
    const onPointerDown = () => clearError();
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [locateError, clearError]);

  async function locate() {
    if (locateMe.locating) return;
    const place = await locateMe.locate();
    if (place) onLocate(place);
  }

  const showList = open && searchedFor.length >= SEARCH_MIN_LENGTH;

  // Results arrive after a debounce: the user may have moved down a longer, older list.
  useEffect(() => setActive(0), [results]);

  function choose(location: Location) {
    onSelect(location);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!showList || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const location = results[active];
      if (location) choose(location);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="search">
      <label htmlFor="city-search" className="visually-hidden">
        {t.search.label}
      </label>
      <input
        id="city-search"
        type="search"
        placeholder={t.search.label}
        autoComplete="off"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          clearError();
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {/* Inside the field, at its end: one tap from any page, no extra header item. */}
      <button
        type="button"
        className="search__locate"
        aria-label={t.location.useMine}
        title={t.location.useMine}
        aria-busy={locateMe.locating || undefined}
        onClick={() => void locate()}
      >
        {locateMe.locating ? <SpinnerIcon /> : <CrosshairIcon />}
      </button>
      {/* The browser may take seconds: say what is happening. */}
      <span className="visually-hidden" role="status">
        {locateMe.locating ? t.location.locating : ''}
      </span>
      {locateError && (
        <p className="search__notice" role="alert">
          {t.location.errors[locateError]}
        </p>
      )}
      {showList && (
        <ul id={listId} role="listbox" className="search__list">
          {loading && results.length === 0 && <li className="search__hint">{t.search.searching}</li>}
          {error && <li className="search__hint search__hint--error">{t.errors[error]}</li>}
          {!loading && !error && results.length === 0 && (
            <li className="search__hint">{t.search.noResults(searchedFor)}</li>
          )}
          {results.map((location, i) => (
            <li
              key={location.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="search__option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(location)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__name">{location.name}</span>
              <span className="search__meta">{describe(location)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
