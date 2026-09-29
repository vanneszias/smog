/**
 * Convex Auth Configuration for WorkOS
 *
 * Configures JWT validation for WorkOS tokens. Convex validates tokens
 * using the JWKS endpoint provided by WorkOS.
 *
 * Required environment variable in Convex dashboard:
 * - WORKOS_CLIENT_ID
 */

const clientId = process.env.WORKOS_CLIENT_ID;

if (!clientId) {
  console.warn(
    "[Auth] WORKOS_CLIENT_ID not set - authentication will not work"
  );
}

export default {
  providers: [
    {
      algorithm: "RS256",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      // WorkOS User Management JWT provider
      type: "customJwt",
    },
    {
      algorithm: "RS256",
      applicationID: clientId,
      issuer: "https://api.workos.com/",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
      // WorkOS SSO JWT provider (for enterprise SSO flows)
      type: "customJwt",
    },
  ],
};
