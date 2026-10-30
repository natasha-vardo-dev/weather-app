import { MAX_FAVORITES, type Favorite } from '@weather/shared';
import { useEffect, useRef, useState } from 'react';
import { useFavorites } from '../hooks/useFavorites';
import { withVerifiedId } from '../hooks/useLocalizedPlace';
import { useI18n } from '../i18n/I18nProvider';

/** Outline star; filled when the city is saved. Also marks saved cities in the settings. */
export function StarIcon({ className = 'save__star', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

/**
 * Save, next to the place name: the star alone.
 *
 * A full list does not change how the star looks: it is no concern until someone tries to add
 * a city. Then a short message opens under the buttons, saying why and what to do
 * (variant A on the mockups: the hint used to sit in the
 * row of buttons, dashed star and all, on every page while the list was full). The message
 * is in a live region, so screen readers announce it; Escape or a click elsewhere closes it.
 *
 * Saving keeps the place's id only once it is confirmed (`withVerifiedId`). The button
 * stays enabled meanwhile: a click waits for the check, which has almost always finished.
 */
export function FavoriteButton({ place }: { place: Favorite }) {
  const { t, language } = useI18n();
  const { isFavorite, save, remove, isFull } = useFavorites();
  // Clicks run through one queue, in click order: a removal clicked right after a save is
  // not overtaken by it. Saving waits for the id check, removing does not, but both wait
  // for earlier clicks. Repeats are harmless (saving a saved city or removing a removed one
  // does nothing).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const wrapRef = useRef<HTMLSpanElement>(null);
  const saved = isFavorite(place);
  const blocked = !saved && isFull;
  const [notice, setNotice] = useState(false);
  const showNotice = notice && blocked;

  // Closed for good once the list has room: otherwise, filled up again (in another tab), it
  // would reappear and be announced with nobody pressing the star.
  useEffect(() => {
    if (!blocked) setNotice(false);
  }, [blocked]);

  useEffect(() => {
    if (!showNotice) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setNotice(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotice(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showNotice]);

  function enqueue(step: () => unknown) {
    // A failure must not stop later clicks from running.
    queue.current = queue.current.then(step).then(
      () => {},
      () => {},
    );
  }

  /** Saving waits for the id check (usually done already: the page started it). */
  function saveAfterCheck() {
    enqueue(() => withVerifiedId(place, language).then(save));
  }

  return (
    <span className="save-wrap save-wrap--star" ref={wrapRef}>
      {/* The star alone: the sign of favourites everywhere. Its name says what pressing does
          ("Add to favourites" / "Remove from favourites"), which also tells the state, so no
          aria-pressed; the tooltip shows the state ("In favourites"). One word for it all,
          "favourites": the section is called so, and "Save" landing in "Favourites" read as
          two different things. */}
      <button
        type="button"
        className="save save--icon"
        // Not aria-expanded: read as "collapsed" it suggested the star opens something instead
        // of saving. The message announces itself (live region); this only hides the tooltip.
        data-open={showNotice || undefined}
        data-saved={saved || undefined}
        data-tip={saved ? t.favorites.saved : t.favorites.save}
        onClick={() => {
          // A full list blocks saving rather than silently dropping another city: say so.
          if (blocked) {
            setNotice((open) => !open);
            return;
          }
          // Removing needs no id check (places match by coordinates), only earlier clicks.
          if (saved) enqueue(() => remove(place));
          else saveAfterCheck();
        }}
      >
        <StarIcon />
        <span className="visually-hidden">
          {saved ? t.favorites.remove : t.favorites.save}
        </span>
      </button>
      {/* Always in the page, so the message is announced when it appears. */}
      <span role="status" className="save__live">
        {showNotice && (
          <span className="save__notice">
            {/* Two lines rather than one sentence: no full stop to join them, which differs
                by language ("。" in Japanese and Chinese). */}
            <span className="save__notice-line">{t.favorites.full(MAX_FAVORITES)}</span>
            {t.favorites.fullAction}
          </span>
        )}
      </span>
    </span>
  );
}
