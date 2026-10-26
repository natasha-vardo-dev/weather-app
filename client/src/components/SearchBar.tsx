import { SEARCH_MIN_LENGTH, type Location } from '@weather/shared';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router';
import { useLocationSearch } from '../hooks/useLocationSearch';
import { rememberPosition } from '../geolocation';
import { useLocateMe, type FoundPlace } from '../hooks/useMyLocation';
import { useI18n } from '../i18n/I18nProvider';
import { CrosshairIcon, PinIcon, SpinnerIcon } from './LocationIcons';

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
  const { clearError, cancel: cancelLocate } = locateMe;
  const locateError = locateMe.error;

  // Another page opened (search, a favourite, back): a running lookup is no longer wanted.
  const { pathname, search } = useLocation();
  useEffect(() => cancelLocate(), [pathname, search, cancelLocate]);

  const noticeRef = useRef<HTMLDivElement>(null);
  const { suggestion } = locateMe;

  // A location error stays until a click elsewhere, so it can be read (and its buttons
  // used) but does not linger.
  useEffect(() => {
    if (!locateError) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!noticeRef.current?.contains(e.target as Node)) clearError();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [locateError, clearError]);

  /** The user accepted the city guessed from their IP: open it, marked as approximate. */
  function openSuggestion(place: FoundPlace) {
    clearError();
    rememberPosition(place, 'approximate');
    onLocate(place);
  }

  async function locate() {
    if (locateMe.locating) return;
    const place = await locateMe.locate();
    if (place) onLocate(place);
  }

  const showList = open && searchedFor.length >= SEARCH_MIN_LENGTH;

  // Results arrive after a debounce: the user may have moved down a longer, older list.
  useEffect(() => setActive(0), [results]);

  function choose(location: Location) {
    cancelLocate();
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
          cancelLocate();
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
        <div className="search__notice" ref={noticeRef}>
          <p className="search__notice-text" role="alert">
            {t.location.errors[locateError]}
          </p>
          {/* After a refusal there is nothing to retry: only the browser's settings change it. */}
          {(locateError !== 'denied' || suggestion) && (
            <div className="search__notice-actions">
              {locateError !== 'denied' && locateError !== 'unsupported' && (
                <button type="button" className="search__notice-button" onClick={() => void locate()}>
                  {t.weather.tryAgain}
                </button>
              )}
              {suggestion?.name && (
                // A suggestion, not an automatic switch: behind a VPN the guess can be another city.
                <button type="button" className="search__notice-button" onClick={() => openSuggestion(suggestion)}>
                  <PinIcon />
                  {t.location.suggest(suggestion.name)}
                </button>
              )}
            </div>
          )}
        </div>
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
