import { useEffect } from 'react';
import { showSaved, type SavedReason } from '../api/savedResponses';

/** While mounted with a reason, the stale-data banner is shown for it (see savedResponses). */
export function useReportSaved(reason: SavedReason | undefined): void {
  useEffect(() => (reason ? showSaved(reason) : undefined), [reason]);
}
