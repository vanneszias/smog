/**
 * Allowed workspace dependencies (spec §4.1), enforced by
 * `scripts/check-boundaries.ts`.
 *
 * - A plain entry (`@smog/db`) allows the package and every subpath.
 * - A subpath entry (`@smog/render/contract`) allows the package as a
 *   dependency, but only that subpath (and deeper) in imports.
 * - `@smog/feature:*` stands for every package in `FEATURE_PACKAGES`, and
 *   the same pattern followed by `/schema` means the `./schema` subpath of each.
 * - Feature packages share the `@smog/feature:*` key.
 * - A package may always import itself.
 * - Packages in `TOOLING_DEV_DEPENDENCIES` may be a devDependency of any
 *   package (tsconfig bases); importing them is still checked.
 */

export const FEATURE_PATTERN = "@smog/feature:*";

export const FEATURE_PACKAGES = [
  "@smog/gestures",
  "@smog/favorites",
  "@smog/lists",
  "@smog/account",
  "@smog/sponsorships",
  "@smog/admin",
] as const;

export const BOUNDARIES: Record<string, readonly string[]> = {
  "@smog/api": ["@smog/rpc", FEATURE_PATTERN, "@smog/config"],
  "@smog/mobile": [
    "@smog/api/client",
    "@smog/auth/expo",
    "@smog/rpc/react",
    `${FEATURE_PATTERN}/client`,
    `${FEATURE_PATTERN}/schema`,
    "@smog/local-store",
    "@smog/analytics/native",
    "@smog/i18n",
    "@smog/styles",
    "@smog/brand",
    "@smog/ui-native",
    "@smog/config",
    "@smog/utils",
  ],
  "@smog/site": [
    "@smog/api",
    "@smog/auth",
    "@smog/rpc",
    "@smog/db",
    "@smog/jobs",
    "@smog/render",
    "@smog/analytics",
    "@smog/email",
    "@smog/payments",
    "@smog/video",
    FEATURE_PATTERN,
    "@smog/local-store",
    "@smog/i18n",
    "@smog/styles",
    "@smog/brand",
    "@smog/ui-web",
    "@smog/config",
    "@smog/utils",
  ],
  [FEATURE_PATTERN]: [
    "@smog/rpc",
    "@smog/db",
    "@smog/auth",
    "@smog/local-store",
    "@smog/payments",
    "@smog/video",
    "@smog/email",
    "@smog/jobs",
    "@smog/render/contract",
    "@smog/analytics/server",
    "@smog/i18n",
    "@smog/config",
    "@smog/utils",
    `${FEATURE_PATTERN}/schema`,
  ],
  "@smog/analytics": ["@smog/config", "@smog/utils"],
  "@smog/auth": ["@smog/db", "@smog/email", "@smog/config", "@smog/utils"],
  // The icon generator reads the brand colours from the tokens.
  "@smog/brand": ["@smog/styles", "@smog/config"],
  "@smog/config": [],
  "@smog/db": ["@smog/config", "@smog/utils"],
  "@smog/email": [
    "@smog/i18n",
    "@smog/styles",
    "@smog/brand",
    "@smog/config",
    "@smog/utils",
  ],
  "@smog/i18n": ["@smog/config"],
  "@smog/jobs": [
    "@smog/db",
    "@smog/email",
    "@smog/payments",
    "@smog/video",
    "@smog/render/contract",
    "@smog/config",
    "@smog/utils",
  ],
  "@smog/local-store": ["@smog/config", "@smog/utils"],
  "@smog/payments": ["@smog/config", "@smog/utils"],
  "@smog/render": [
    "@smog/config",
    "@smog/utils",
    "@smog/styles",
    "@smog/brand",
  ],
  "@smog/rpc": ["@smog/auth", "@smog/db", "@smog/config", "@smog/utils"],
  "@smog/styles": ["@smog/config"],
  "@smog/ui-native": [
    "@smog/styles",
    "@smog/i18n",
    "@smog/brand",
    "@smog/utils",
  ],
  "@smog/ui-web": ["@smog/styles", "@smog/i18n", "@smog/brand", "@smog/utils"],
  "@smog/utils": ["@smog/config"],
  "@smog/video": ["@smog/config", "@smog/utils"],
};

/** Allowed as a devDependency everywhere, for the shared tsconfig bases. */
export const TOOLING_DEV_DEPENDENCIES: readonly string[] = ["@smog/config"];

const SCOPE_PREFIX = "@smog/";

function isFeature(name: string): boolean {
  return (FEATURE_PACKAGES as readonly string[]).includes(name);
}

/** Splits `@smog/render/contract` into `["@smog/render", "contract"]`. */
export function splitSpecifier(specifier: string): [string, string] {
  const [scope, name, ...rest] = specifier.split("/");
  return [`${scope}/${name}`, rest.join("/")];
}

/** The allowed targets for a package, or `undefined` if it is not listed. */
export function allowedTargets(name: string): readonly string[] | undefined {
  return BOUNDARIES[isFeature(name) ? FEATURE_PATTERN : name];
}

function parseEntry(entry: string): [string, string] {
  return entry.startsWith(FEATURE_PATTERN)
    ? [FEATURE_PATTERN, entry.slice(FEATURE_PATTERN.length + 1)]
    : splitSpecifier(entry);
}

function packageMatches(entryPkg: string, pkg: string): boolean {
  return entryPkg === FEATURE_PATTERN ? isFeature(pkg) : entryPkg === pkg;
}

/** Whether `from` may list `to` (a package name) as a dependency. */
export function isAllowedDependency(from: string, to: string): boolean {
  if (from === to) {
    return true;
  }
  const allowed = allowedTargets(from) ?? [];
  return allowed.some((entry) => packageMatches(parseEntry(entry)[0], to));
}

/** Whether `from` may import `specifier` (`@smog/<name>[/<subpath>]`). */
export function isAllowedImport(from: string, specifier: string): boolean {
  if (!specifier.startsWith(SCOPE_PREFIX)) {
    return true;
  }
  const [pkg, subpath] = splitSpecifier(specifier);
  if (pkg === from) {
    return true;
  }
  const allowed = allowedTargets(from) ?? [];
  return allowed.some((entry) => {
    const [entryPkg, entrySubpath] = parseEntry(entry);
    return (
      packageMatches(entryPkg, pkg) &&
      (entrySubpath === "" ||
        subpath === entrySubpath ||
        subpath.startsWith(`${entrySubpath}/`))
    );
  });
}
