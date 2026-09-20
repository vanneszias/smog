/**
 * The public surface of `@smog/ui-web`.
 *
 * Everything a consumer may import is re-exported here with `export *`. A
 * module that is not re-exported from this file is internal to the package.
 *
 * **`"use client"` is on individual components, never on this file.** A
 * directive here would make the whole library — `cn()` included — a client
 * boundary, so a React Server Component that wanted a `Badge` would ship
 * every overlay and the Mux player to the browser with it. Seven files carry
 * it, each because it holds a hook React's server build does not export or an
 * event handler that cannot cross the boundary; each says which at the top.
 *
 * The rest genuinely render on the server: React's server entry exports
 * `forwardRef`, `useId`, `useMemo`, `useCallback`, `Children` and
 * `cloneElement` (verified in
 * `node_modules/react/cjs/react.react-server.development.js`), and every
 * Radix package wrapped here already ships its own `"use client"`, so the
 * boundary is inside the dependency rather than in our wrapper. The one
 * exception is `@radix-ui/react-slot`, which has no directive because it
 * needs none.
 */

export * from "./components/Avatar";
export * from "./components/Badge";
export * from "./components/Button";
export * from "./components/Card";
export * from "./components/Checkbox";
export * from "./components/Dialog";
export * from "./components/DropdownMenu";
export * from "./components/EmptyState";
export * from "./components/Field";
export * from "./components/Input";
export * from "./components/Label";
export * from "./components/Pagination";
export * from "./components/Select";
export * from "./components/Sheet";
export * from "./components/Skeleton";
export * from "./components/Switch";
export * from "./components/Table";
export * from "./components/Tabs";
export * from "./components/Textarea";
export * from "./components/Toast";
export * from "./components/Tooltip";
export * from "./domain/CategoryFilter";
export * from "./domain/GestureCard";
export * from "./domain/GestureGrid";
export * from "./domain/SearchBar";
export * from "./domain/StatusBadge";
export * from "./domain/VideoPlayer";
export * from "./lib/cn";
