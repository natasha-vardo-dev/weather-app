/**
 * Whether this browser can get warning notifications, and if not, why: the bell's panel
 * shows a different thing for each. Plain function, tested without a browser.
 */
export type PushAvailability =
  /** Firebase is not configured for this build: no bell at all. */
  | 'off'
  /** No Push API (old browser, in-app browsers): no bell. */
  | 'unsupported'
  /** iPhone or iPad in the browser: web push works only from the Home Screen app (iOS 16.4+). */
  | 'ios-install'
  /** The user blocked notifications for the site: the browser will not ask again. */
  | 'blocked'
  /** `npm run dev`: the service worker that receives pushes exists only in a build. */
  | 'dev-server'
  | 'available';

export function pushAvailability(env: {
  configured: boolean;
  ios: boolean;
  standalone: boolean;
  pushApi: boolean;
  permission: NotificationPermission | null;
  devServer: boolean;
}): PushAvailability {
  if (!env.configured) return 'off';
  if (env.ios && !env.standalone) return 'ios-install';
  if (!env.pushApi) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  if (env.devServer) return 'dev-server';
  return 'available';
}
