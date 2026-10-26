import { useEffect } from 'react';
import { showSaved } from '../api/savedResponses';

/** While mounted with `saved` true, the stale-data banner is shown (see savedResponses). */
export function useReportSaved(saved: boolean): void {
  useEffect(() => (saved ? showSaved() : undefined), [saved]);
}
