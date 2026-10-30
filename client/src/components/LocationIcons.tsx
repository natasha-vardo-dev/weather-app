/** Icons for the user's location; decorative, the buttons carry the text. */

export function CrosshairIcon({ size = 20 }: { size?: number }) {
  return (
    <svg className="location-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle className="location-icon__dot" cx="12" cy="12" r="2" />
    </svg>
  );
}

export function PinIcon({ size = 13 }: { size?: number }) {
  return (
    <svg className="location-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.3" />
    </svg>
  );
}

/** Turns while the position is being found (still in reduced motion: see styles). */
export function SpinnerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="location-icon spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
    </svg>
  );
}
