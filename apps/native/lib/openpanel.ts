import { OpenPanel } from "@openpanel/react-native";
import {
  type IdentifyPayload,
  OpenPanel as OpenPanelBase,
  type TrackProperties,
} from "@openpanel/sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WorkOSUser } from "@smog/auth";
import { ANALYTICS_CONSENT_STORAGE_KEY } from "@smog/config/constants";
import type { AnalyticsEventMap, AnalyticsEventName } from "@smog/shared";
import logger from "@/utils/logger";

const OPENPANEL_API_URL =
  process.env.EXPO_PUBLIC_OPENPANEL_API_URL || "https://analytics.zias.be";
const OPENPANEL_CLIENT_ID = process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_ID || "";
const OPENPANEL_CLIENT_SECRET =
  process.env.EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET || "";

const consentListeners = new Set<() => void>();
let analyticsConsent: boolean | null = null;
let initializationFailed = false;

interface AnalyticsClient {
  clear: () => void;
  identify: (payload: IdentifyPayload) => unknown;
  screenView?: (path: string, properties?: TrackProperties) => void;
  track: (name: string, properties?: TrackProperties) => unknown;
}

let op: AnalyticsClient | null = null;

export function getAnalyticsConsent(): boolean | null {
  return analyticsConsent;
}

export function subscribeAnalyticsConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  return () => consentListeners.delete(listener);
}

function notifyConsentListeners(): void {
  for (const listener of consentListeners) {
    listener();
  }
}

function getOpenPanel(): AnalyticsClient | null {
  if (
    analyticsConsent !== true ||
    !OPENPANEL_CLIENT_ID ||
    !OPENPANEL_CLIENT_SECRET ||
    initializationFailed
  ) {
    return null;
  }

  if (op) {
    return op;
  }

  try {
    op = new OpenPanel({
      apiUrl: OPENPANEL_API_URL,
      clientId: OPENPANEL_CLIENT_ID,
      clientSecret: OPENPANEL_CLIENT_SECRET,
      filter: () => analyticsConsent === true,
      storage: AsyncStorage,
    });
  } catch (error) {
    logger.warn(
      "[openpanel] Native SDK initialization failed; using generic client:",
      error
    );
    try {
      op = new OpenPanelBase({
        apiUrl: OPENPANEL_API_URL,
        clientId: OPENPANEL_CLIENT_ID,
        clientSecret: OPENPANEL_CLIENT_SECRET,
        filter: () => analyticsConsent === true,
        sdk: "react-native-fallback",
      });
    } catch (fallbackError) {
      initializationFailed = true;
      logger.error(
        "[openpanel] Failed to initialize analytics fallback:",
        fallbackError
      );
    }
  }

  return op;
}

export async function initializeOpenPanel(): Promise<void> {
  try {
    const storedConsent = await AsyncStorage.getItem(
      ANALYTICS_CONSENT_STORAGE_KEY
    );
    analyticsConsent = storedConsent === null ? null : storedConsent === "true";
    if (analyticsConsent) {
      getOpenPanel();
    }
  } catch (error) {
    analyticsConsent = null;
    logger.error("[openpanel] Failed to restore analytics consent:", error);
  } finally {
    notifyConsentListeners();
  }
}

export async function setAnalyticsConsent(enabled: boolean): Promise<void> {
  analyticsConsent = enabled;
  try {
    await AsyncStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, String(enabled));
  } catch (error) {
    logger.error("[openpanel] Failed to persist analytics consent:", error);
  }

  if (enabled) {
    getOpenPanel();
  } else {
    op?.clear();
  }
  notifyConsentListeners();
}

export function identifyAnalyticsUser(user: WorkOSUser): void {
  getOpenPanel()?.identify({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileId: user.id,
    properties: { auth_mode: "authenticated", platform: "native" },
  });
}

export function identifyAnalyticsGuest(guestId: string): void {
  getOpenPanel()?.identify({
    profileId: `guest:${guestId}`,
    properties: { auth_mode: "guest", platform: "native" },
  });
}

export function clearAnalyticsIdentity(): void {
  op?.clear();
}

export function trackScreenView(path: string): void {
  const client = getOpenPanel();
  if (client?.screenView) {
    client.screenView(path, { platform: "native" });
    return;
  }
  client?.track("screen_view", {
    __path: path,
    platform: "native",
  });
}

export function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventMap[EventName]
): void {
  getOpenPanel()?.track(eventName, {
    ...properties,
    platform: "native",
  });
}
