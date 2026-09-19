export function requireEnv(
  name: string,
  source: Record<string, string | undefined> = process.env
): string {
  const value = source[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Cloudflare bindings (D1, R2) are declared only inside named `env.staging`
 * / `env.production` blocks in wrangler.jsonc, never at the top level, so
 * neither environment can be reached by accident. `wrangler types` therefore
 * types the base `CloudflareEnv["D1" | "R2"]` as optional. This asserts the
 * binding is actually present at runtime instead of silencing the type with
 * a non-null assertion.
 */
export function requireBinding<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(
      `Missing required Cloudflare binding: ${name}. Is CLOUDFLARE_ENV set to a valid environment?`
    );
  }

  return value;
}
