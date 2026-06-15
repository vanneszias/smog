import type { WorkOSUser } from "@smog/auth";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";

const ANALYTICS_CONSENT_KEY = "smog_analytics_consent";
const ANALYTICS_RELAY_URL = `${import.meta.env.VITE_SERVER_URL}/analytics/track`;

const consentListeners = new Set<() => void>();
let inMemoryConsent: boolean | null | undefined;
let currentProfileId: string | null = null;

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

function sendAnalyticsPayload(payload: {
  payload: Record<string, unknown>;
  type: "identify" | "track";
}): void {
  if (getAnalyticsConsent() !== true) {
    return;
  }

  fetch(ANALYTICS_RELAY_URL, {
    body: JSON.stringify(payload),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    keepalive: payload.type === "track",
    method: "POST",
  }).catch((error) => {
    console.warn("[openpanel] Failed to send analytics payload:", error);
  });
}

export function setAnalyticsConsent(enabled: boolean): void {
  inMemoryConsent = enabled;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, String(enabled));
  } catch {
    // Consent remains active for this session when storage is unavailable.
  }
  if (!enabled) {
    currentProfileId = null;
  }
  for (const listener of consentListeners) {
    listener();
  }
}

export function identifyAnalyticsUser(user: WorkOSUser): void {
  currentProfileId = user.id;
  sendAnalyticsPayload({
    type: "identify",
    payload: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileId: user.id,
      properties: { auth_mode: "authenticated", platform: "web" },
    },
  });
}

export function clearAnalyticsIdentity(): void {
  currentProfileId = null;
}

export function trackScreenView(path: string): void {
  sendAnalyticsPayload({
    type: "track",
    payload: {
      name: "screen_view",
      properties: {
        __path: path,
        platform: "web",
        url: window.location.href,
      },
      ...(currentProfileId ? { profileId: currentProfileId } : {}),
    },
  });
}

export function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventMap[EventName]
): void {
  sendAnalyticsPayload({
    type: "track",
    payload: {
      name: eventName,
      properties: {
        ...properties,
        platform: "web",
      },
      ...(currentProfileId ? { profileId: currentProfileId } : {}),
    },
  });
}
