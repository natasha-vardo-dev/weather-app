import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { LANGUAGES, type Language } from '../../i18n';
import { addTyped, isTyping, nextTypeaheadIndex, NOTHING_TYPED } from '../../typeahead';
import { ChevronIcon } from '../ChevronIcon';
import { NAMES } from './languageNames';

interface ListProps {
  label: string;
  back: string;
  value: Language;
  onChoose: (language: Language) => void;
  onBack: () => void;
}

/**
 * The languages, ARIA listbox: the list takes focus and points at the active option
 * with aria-activedescendant. Arrows, Home/End, Enter/Space choose, typed letters jump
 * ("po" → Polski), Escape goes back. Scrolls itself, not the page.
 */
export function LanguageList({ label, back, value, onChoose, onBack }: ListProps) {
  const [active, setActive] = useState(Math.max(0, LANGUAGES.indexOf(value)));
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef(NOTHING_TYPED);
  const id = useId();

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const option = document.getElementById(`${id}-${active}`);
    if (!list || !option) return;
    const top = option.offsetTop - list.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [active, id]);

  function onKeyDown(e: KeyboardEvent) {
    const last = LANGUAGES.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]);
    } else if (e.key === 'Enter' || (e.key === ' ' && !isTyping(typed.current, Date.now()))) {
      e.preventDefault();
      onChoose(LANGUAGES[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typed.current = addTyped(typed.current, e.key, Date.now());
      setActive(nextTypeaheadIndex(NAMES, active, typed.current.text));
    }
  }

  return (
    <>
      <button type="button" className="settings__back" onClick={onBack}>
        <ChevronIcon className="settings__backward" />
        <span className="visually-hidden">{back}: </span>
        <span id={`${id}-label`}>{label}</span>
      </button>
      <ul
        ref={listRef}
        className="settings__list"
        role="listbox"
        // In the Tab order, not only focused on opening: Shift+Tab back from outside must reach
        // it, and a scrolling region needs keyboard access (axe: scrollable-region-focusable).
        tabIndex={0}
        aria-labelledby={`${id}-label`}
        aria-activedescendant={`${id}-${active}`}
        onKeyDown={onKeyDown}
      >
        {LANGUAGES.map((code, index) => (
          <li
            key={code}
            id={`${id}-${index}`}
            role="option"
            lang={code}
            className={index === active ? 'settings__option settings__option--active' : 'settings__option'}
            aria-selected={code === value}
            onPointerEnter={() => setActive(index)}
            onClick={() => onChoose(code)}
          >
            {NAMES[index]}
          </li>
        ))}
      </ul>
    </>
  );
}
