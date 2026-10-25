import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { addTyped, isTyping, nextTypeaheadIndex, NOTHING_TYPED } from '../typeahead';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Language of the label, so screen readers pronounce it right ("Deutsch", "日本語"). */
  lang?: string;
}

interface Props<T extends string> {
  /** Accessible name of the control ("Language"); not shown. */
  label: string;
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Modifier for size and placement, e.g. "unit" -> class "dropdown dropdown--unit". */
  variant: string;
}

/**
 * A button that opens a list below it: used for the °C/°F and language switches.
 * Not a native <select>: on macOS its menu opens over the field so that the selected
 * option sits on it, so the list grew upwards for anything but the first option.
 *
 * ARIA select-only pattern: the button opens, the list takes focus and points at the
 * active option with aria-activedescendant. Keys: arrows, Home/End, Enter/Space choose,
 * Escape and Tab close, typed letters jump to an option. A long list scrolls, keeping
 * the active option in view.
 */
export function Dropdown<T extends string>({ label, value, options, onChange, variant }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef(NOTHING_TYPED);
  const id = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  function show() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function choose(index: number) {
    onChange(options[index].value);
    close(true);
  }

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // The list has a max height: keep the active option visible while moving through it.
  // Scrolls the list only; scrollIntoView would also scroll the page.
  useEffect(() => {
    const list = listRef.current;
    const option = document.getElementById(`${id}-${active}`);
    if (!open || !list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [open, active, id]);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onButtonKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show();
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    const last = options.length - 1;
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
      // Space chooses, unless it is part of typed text (no language name has one, but
      // a native select behaves this way too).
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      typed.current = addTyped(typed.current, e.key, Date.now());
      setActive(nextTypeaheadIndex(options.map((o) => o.label), active, typed.current.text));
    }
  }

  return (
    <div className={`dropdown dropdown--${variant}`} ref={rootRef}>
      <span id={`${id}-label`} className="visually-hidden">
        {label}
      </span>
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        className="dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-button`}
        // Safari and Firefox on macOS don't focus a clicked button, so the list would lose
        // focus to nothing, close on blur, and the click would open it again. Keeping
        // focus in the list lets the click close it.
        onMouseDown={(e) => {
          if (open) e.preventDefault();
        }}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="dropdown__value" lang={selected.lang}>
          {selected.label}
        </span>
        <svg className="dropdown__chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="dropdown__list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKeyDown}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node | null)) close(false);
          }}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              lang={option.lang}
              className={index === active ? 'dropdown__option dropdown__option--active' : 'dropdown__option'}
              aria-selected={option.value === value}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
