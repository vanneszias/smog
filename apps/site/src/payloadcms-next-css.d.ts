// `@payloadcms/next` maps this subpath directly to a compiled CSS file and
// ships no type declarations for it. Declaring it here lets the pure
// side-effect imports of it (in the admin layout and API routes) type-check.
declare module "@payloadcms/next/css";
