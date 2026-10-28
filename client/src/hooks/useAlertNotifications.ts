import { DEFAULT_ALERT_NOTIFICATIONS, type AlertNotificationSettings } from '@weather/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { currentPlatform, isIos } from '../installHint';
import {
  getAlertSubscriptions,
  samePlace,
  subscribeAlertSubscriptions,
  type AlertSubscription,
} from '../push/alertSubscriptions';
import { pushAvailability, type PushAvailability } from '../push/availability';
import { firebaseConfig } from '../push/config';
import { latestOnly } from '../push/latestOnly';
import {
  disableAlerts,
  enableAlerts,
  PushError,
  pushStrings,
  leavePendingTopics,
  renewAlertsToken,
  writeServiceWorkerState,
} from '../push/pushClient';

function availability(): PushAvailability {
  const platform = currentPlatform();
  const hasNotifications = typeof Notification !== 'undefined';
  return pushAvailability({
    configured: !!firebaseConfig,
    ios: isIos(platform),
    standalone: platform.standalone,
    pushApi: hasNotifications && 'serviceWorker' in navigator && 'PushManager' in window,
    permission: hasNotifications ? Notification.permission : null,
    devServer: import.meta.env.DEV,
  });
}

export type PushFailure = 'unavailable' | 'failed';

/** The bell for one place: whether it can be used, its subscription, and the actions. */
export function useAlertNotifications(place: Omit<AlertSubscription, 'areas' | keyof AlertNotificationSettings>) {
  const { t, language, locale } = useI18n();
  const { places } = useSyncExternalStore(subscribeAlertSubscriptions, getAlertSubscriptions);
  const subscription = places.find((p) => samePlace(p, place));
  const [status, setStatus] = useState<PushAvailability>(availability);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushFailure | null>(null);
  const strings = useRef({ t, language, locale });
  strings.current = { t, language, locale };
  // Quick clicks through the options must end on the last one chosen.
  const [run] = useState(() =>
    latestOnly({
      onStart: () => {
        setBusy(true);
        setError(null);
      },
      onIdle: (failure) => {
        setBusy(false);
        if (!failure) return;
        const reason = failure instanceof PushError ? failure.reason : 'failed';
        if (reason === 'blocked') setStatus('blocked');
        else setError(reason);
      },
    }),
  );
  const apply = (action: () => Promise<void>) =>
    run(async () => {
      await action();
      const { t, language, locale } = strings.current;
      await writeServiceWorkerState(pushStrings(t), language, locale);
    });

  return {
    status,
    subscription,
    settings: subscription ?? DEFAULT_ALERT_NOTIFICATIONS,
    busy,
    error,
    /** Turns on, or changes the settings of, notifications for the place. */
    enable: (settings: AlertNotificationSettings) => apply(() => enableAlerts(place, settings)),
    disable: () => apply(() => disableAlerts(place)),
  };
}

/**
 * Once per app: renews the push token for users with notifications on, and keeps the service
 * worker's strings in the current language (notifications are written there).
 */
export function usePushMaintenance(): void {
  const { t, language, locale } = useI18n();
  const { places, leave } = useSyncExternalStore(subscribeAlertSubscriptions, getAlertSubscriptions);
  const active = places.length > 0;
  const leaving = (leave?.length ?? 0) > 0;
  useEffect(() => {
    if (active) renewAlertsToken().catch(() => {});
  }, [active]);
  // Topics a failed change left behind are left on the next start, even with no place on.
  useEffect(() => {
    if (leaving) void leavePendingTopics();
  }, [leaving]);
  useEffect(() => {
    if (active) void writeServiceWorkerState(pushStrings(t), language, locale);
  }, [active, t, language, locale]);
}
