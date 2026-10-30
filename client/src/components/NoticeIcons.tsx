/** Icons of the notices above a page (old forecast, offline); decorative, the text says it all. */

export function ClockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="notice__icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function NoSignalIcon({ size = 16 }: { size?: number }) {
  return (
    <svg className="notice__icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 8.8a14 14 0 0 1 19 0M5.5 12.2a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0M3.5 3.5l17 17" />
      <circle cx="12" cy="19" r="0.6" />
    </svg>
  );
}
