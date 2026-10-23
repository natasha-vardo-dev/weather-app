import { SEARCH_MIN_LENGTH, type Location } from '@weather/shared';
import { useId, useState, type KeyboardEvent } from 'react';
import { useLocationSearch } from '../hooks/useLocationSearch';

interface Props {
  onSelect: (location: Location) => void;
}

function describe(location: Location) {
  return [location.region, location.country].filter(Boolean).join(', ');
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { results, loading, error, searchedFor } = useLocationSearch(query);
  const listId = useId();

  const showList = open && searchedFor.length >= SEARCH_MIN_LENGTH;

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
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="search">
      <label htmlFor="city-search" className="visually-hidden">
        Search for a city
      </label>
      <input
        id="city-search"
        type="search"
        placeholder="Search for a city"
        autoComplete="off"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="search__list">
          {loading && results.length === 0 && <li className="search__hint">Searching…</li>}
          {error && <li className="search__hint search__hint--error">{error}</li>}
          {!loading && !error && results.length === 0 && (
            <li className="search__hint">No cities match “{searchedFor}”. Check the spelling.</li>
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
