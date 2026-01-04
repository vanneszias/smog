/**
 * Detects if the user is on a mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isMobile =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );

  return isMobile;
}

/**
 * Detects if the user is on iOS
 */
export function isIOS(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * Detects if the user is on Android
 */
export function isAndroid(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /android/.test(userAgent);
}

/**
 * Attempts to open the app using deep link
 * @param path - The path to open in the app (e.g., "/gestures/123")
 */
export function openInApp(path: string): void {
  // Try custom scheme first (works on both iOS and Android)
  const customSchemeUrl = `smog://${path}`;

  // Try to open the custom scheme
  window.location.href = customSchemeUrl;

  // Fallback to https URL after a short delay if app doesn't open
  // This will trigger Universal Links (iOS) or App Links (Android)
  setTimeout(() => {
    // If we're still on the page, try the https URL
    const httpsUrl = `https://smog.zias.be${path}`;
    window.location.href = httpsUrl;
  }, 500);
}
