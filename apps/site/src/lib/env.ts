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
