import { OpenPanel } from "@openpanel/web";
import type { WorkOSUser } from "@smog/auth";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";

const OPENPANEL_API_URL =
  import.meta.env.VITE_OPENPANEL_API_URL || "https://analytics.zias.be";
const OPENPANEL_CLIENT_ID = import.meta.env.VITE_OPENPANEL_CLIENT_ID || "";
const ANALYTICS_CONSENT_KEY = "smog_analytics_consent";

const consentListeners = new Set<() => void>();
let inMemoryConsent: boolean | null | undefined;
let op: OpenPanel | null = null;

export function getAnalyticsConsent(): boolean | null {
  if (inMemoryConsent !== undefined) {
    return inMemoryConsent;
  }

  try {
    const storedConsent = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    inMemoryConsent = storedConsent === null ? null : storedConsent === "true";
  } catch {
    inMemoryConsent = null;
  }
  if (inMemoryConsent === null) {
    return null;
  }
  return inMemoryConsent;
}

export function subscribeAnalyticsConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => consentListeners.delete(listener);
}

function getOpenPanel(): OpenPanel | null {
  if (getAnalyticsConsent() !== true || !OPENPANEL_CLIENT_ID) {
    return null;
  }

  op ??= new OpenPanel({
    apiUrl: OPENPANEL_API_URL,
    clientId: OPENPANEL_CLIENT_ID,
    filter: () => getAnalyticsConsent() === true,
    sessionReplay: { enabled: false },
    trackAttributes: false,
    trackOutgoingLinks: false,
    trackScreenViews: false,
  });

  return op;
}

export function setAnalyticsConsent(enabled: boolean): void {
  inMemoryConsent = enabled;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, String(enabled));
  } catch {
    // Consent remains active for this session when storage is unavailable.
  }
  if (enabled) {
    getOpenPanel();
  } else {
    op?.clear();
  }
  for (const listener of consentListeners) {
    listener();
  }
}

export function identifyAnalyticsUser(user: WorkOSUser): void {
  getOpenPanel()?.identify({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileId: user.id,
    properties: { auth_mode: "authenticated", platform: "web" },
  });
}

export function clearAnalyticsIdentity(): void {
  op?.clear();
}

export function trackScreenView(path: string): void {
  getOpenPanel()?.screenView(path, {
    platform: "web",
    url: window.location.href,
  });
}

export function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventMap[EventName]
): void {
  getOpenPanel()?.track(eventName, {
    ...properties,
    platform: "web",
  });
}
