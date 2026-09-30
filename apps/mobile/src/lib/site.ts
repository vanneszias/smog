import { Platform, Share } from "react-native";
import { mobileEnv } from "./env";

/** A page on the site (`EXPO_PUBLIC_SITE_HOST`), e.g. a gesture's share URL. */
function siteUrl(path: string): string {
  return `https://${mobileEnv().EXPO_PUBLIC_SITE_HOST}${path}`;
}

/** The site's privacy policy (the consent prompt and settings link to it). */
export function privacyUrl(): string {
  return siteUrl("/privacy");
}

/** `https://<site host>/gestures/<slug>`: what the gesture share sends. */
export function gestureUrl(slug: string): string {
  return siteUrl(`/gestures/${encodeURIComponent(slug)}`);
}

export interface ShareUrlOptions {
  /** The text with the url in it (Android shares text only). */
  message: string;
  /** The subject (iOS mail, Android chooser title). */
  title: string;
  url: string;
}

/**
 * Opens the system share sheet. iOS takes the url on its own (a link
 * preview); Android shares the message, which carries the url.
 */
export async function shareUrl({
  message,
  title,
  url,
}: ShareUrlOptions): Promise<void> {
  try {
    await Share.share(
      Platform.OS === "ios" ? { title, url } : { message, title },
      { dialogTitle: title, subject: title }
    );
  } catch (error) {
    console.error("[share] Failed to open the share sheet:", error);
    throw error;
  }
}
