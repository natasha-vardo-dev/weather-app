/**
 * When to suggest "Add to Home Screen". Chrome, Edge and Android offer installation
 * themselves; iOS never does, so there the start page explains the steps.
 * Plain functions, not React, so the rules are tested without a browser.
 */

const DISMISSED_KEY = 'install-hint-dismissed:v1';

export interface Platform {
  userAgent: string;
  maxTouchPoints: number;
  /** Already opened from the Home Screen. */
  standalone: boolean;
}

/**
 * iPhone, iPod and iPad. iPadOS reports itself as a Mac by default; a Mac has no touch
 * screen, so touch points tell them apart. Every iOS browser runs on WebKit and, since
 * iOS 16.4, can add a site to the Home Screen from its Share menu, so Chrome or Firefox
 * on iOS get the hint too.
 */
export function isIos({ userAgent, maxTouchPoints }: Pick<Platform, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function shouldShowInstallHint(platform: Platform, dismissed: boolean): boolean {
  return isIos(platform) && !platform.standalone && !dismissed;
}

export function currentPlatform(): Platform {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches,
  };
}

export function isInstallHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** For good: the hint is advice, and a closed one should not come back. */
export function dismissInstallHint(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Storage unavailable: the hint is hidden for this visit only.
  }
}
