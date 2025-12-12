// Export Mollie client for payment handling
export { mollieClient } from "./lib/payments";

// WorkOS configuration
export const workosConfig = {
  clientId: process.env.WORKOS_CLIENT_ID || "",
  clientSecret: process.env.WORKOS_CLIENT_SECRET || "",
  redirectUri: process.env.WORKOS_REDIRECT_URI || "",
  authorizationEndpoint: "https://api.workos.com/user_management/authorize",
  tokenEndpoint: "https://api.workos.com/user_management/authenticate",
};
