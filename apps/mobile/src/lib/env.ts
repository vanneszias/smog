import { type MobileEnv, parseMobileEnv } from "@smog/config/env/mobile";

/** `EXPO_PUBLIC_*`, validated on use (Expo inlines each member). */
export function mobileEnv(): MobileEnv {
  return parseMobileEnv({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT,
    EXPO_PUBLIC_SITE_HOST: process.env.EXPO_PUBLIC_SITE_HOST,
  });
}
