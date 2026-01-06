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
      // WorkOS User Management JWT provider
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    {
      // WorkOS SSO JWT provider (for enterprise SSO flows)
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      applicationID: clientId,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};
