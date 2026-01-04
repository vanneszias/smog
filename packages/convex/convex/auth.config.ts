/**
 * Convex Auth Configuration for WorkOS AuthKit
 *
 * This configuration enables Convex to validate JWTs issued by WorkOS.
 * The WORKOS_CLIENT_ID environment variable must be set in the Convex dashboard.
 *
 * @see https://docs.convex.dev/auth/authkit
 */

const clientId = process.env.WORKOS_CLIENT_ID;

const authConfig = {
  providers: [
    {
      // SSO provider configuration
      type: "customJwt",
      issuer: "https://api.workos.com/",
      algorithm: "RS256",
      applicationID: clientId,
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
    {
      // User Management provider configuration
      type: "customJwt",
      issuer: `https://api.workos.com/user_management/${clientId}`,
      algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`,
    },
  ],
};

export default authConfig;
