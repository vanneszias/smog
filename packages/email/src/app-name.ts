import { DEFAULT_LOCALE, resources } from "@smog/i18n";

/** The product name (`common.appName`), for places without a locale: the
 * Better Auth app name and the passkey relying-party name. */
export const APP_NAME: string =
  resources[DEFAULT_LOCALE].translation.common.appName;
