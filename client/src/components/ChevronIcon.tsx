/**
 * The "opens below" arrow: every expandable detail uses the same one, and the settings
 * turn it to point onwards and back. Decorative; the control's aria-expanded carries the
 * state, and CSS turns the arrow up from that same attribute, so eye and screen reader
 * can't disagree.
 */
export function ChevronIcon({ className }: { className: string }) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
