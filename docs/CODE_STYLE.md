# Code Style Guide

> Last updated: June 10, 2026
> Enforced by: Biome (see `biome.json` + `ultracite` presets)

## Quick Reference

```bash
# Auto-fix all style issues
bun check

# Check without fixing
bunx biome check .
```

---

## Imports

### Order
```typescript
// 1. Third-party (node_modules)
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

// 2. Workspace packages (@smog/*)
import { PRICE_PER_YEAR_CENTS } from "@smog/config/constants";
import type { Gesture } from "@smog/types";

// 3. App-internal (@/ alias)
import { useTheme } from "@/context/ThemeContext";
import { useTheme } from "@/context/ThemeContext";
```

### Type-only imports
Always use `import type` for type-only imports:
```typescript
// Good
import type { Gesture } from "@smog/types";
import type { SponsorshipFormState } from "./hooks/useSponsorshipForm";

// Bad — triggers a runtime import when it's just a type
import { Gesture } from "@smog/types";
```

---

## Naming Conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `GestureCard`, `StepDetails` |
| Hooks | camelCase + `use` prefix | `useSponsorshipForm`, `useAdminFilters` |
| Services (instances) | camelCase | `mollieClient`, `convexClient` |
| Service classes | PascalCase | `OpenPanel`, `ConvexHttpClient` |
| Types/interfaces | PascalCase | `Gesture`, `SponsorshipFormState` |
| Constants | UPPER_SNAKE_CASE | `PRICE_PER_YEAR_CENTS`, `VIDEO_COMPLETE_COUNT` |
| Files (components) | PascalCase | `GestureCard.tsx`, `StepSelect.tsx` |
| Files (hooks/utils) | camelCase | `useSponsorshipForm.ts`, `validation.ts` |
| Test files | same name + `.test.ts` | `validation.test.ts` |

---

## TypeScript

### Strict mode
All packages use `"strict": true`. Never disable this.

### No `any`
```typescript
// Bad
const result: any = someFunction();

// Good — use the actual type
const result: SponsorshipId = someFunction();

// Good — use unknown with a type guard when input type is truly unknown
function handleError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
```

### Prefer `type` over `interface` for shapes without extension
```typescript
// Good for simple data shapes
type SponsorshipStatus = "pending" | "active" | "expired";
type SponsorDetails = { name: string; email: string };

// Good for extensible contracts
interface DatabaseService {
  initialize(): Promise<void>;
  getAllGestures(): Promise<Gesture[]>;
}
```

### Explicit return types on exported functions
```typescript
// Good
export function calculatePrice(count: number, hasLogo: boolean): number {
  return count * PRICE_PER_YEAR_CENTS + (hasLogo ? LOGO_ADDON_CENTS * count : 0);
}

// Bad — implicit return type
export function calculatePrice(count: number, hasLogo: boolean) {
  return count * PRICE_PER_YEAR_CENTS + (hasLogo ? LOGO_ADDON_CENTS * count : 0);
}
```

---

## Error Handling

### Handle async failures at the owning boundary
```typescript
try {
  await toggleFavorite({ userId, gestureId });
} catch (error) {
  logger.error("Failed to toggle favorite", error);
  throw error;
}
```

`tryCatch` from `@smog/shared` is useful when tuple-style recovery makes the
caller clearer. Plain `try/catch` is preferred for service methods that must log
and rethrow.

### Use the logger, not console
```typescript
import { createLogger } from "@smog/shared";
const logger = createLogger("myModule");

// Good
logger.info("Sponsorship render started");
logger.error("Sponsorship render failed", error);

// Bad
console.log("[myModule] Sponsorship render started");
console.error("[myModule] Sponsorship render failed:", error);
```

---

## React Conventions

### Memo for list items
Components rendered in lists (FlatList, map) should be wrapped in `React.memo`:
```typescript
export default memo(GestureCard);
```

### useCallback for stable handlers
Event handlers passed as props should be stable:
```typescript
// Good — stable reference
const handleToggle = useCallback((id: string) => {
  setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
}, []);

// Bad — new function on every render
const handleToggle = (id: string) => { ... };
```

### useMemo for derived data
Expensive computations should be memoised:
```typescript
// Good
const filteredGestures = useMemo(
  () => gestures?.filter(g => g.isActive) ?? [],
  [gestures]
);

// Bad — computed on every render
const filteredGestures = gestures?.filter(g => g.isActive) ?? [];
```

---

## File Organisation

### One component per file
Each component gets its own file. Sub-components live in a subdirectory:
```
components/admin/AdminTable.tsx           ← Main component
components/admin/gestures/EditableCell.tsx  ← Sub-component
components/admin/gestures/types.ts          ← Sub-component types
components/admin/gestures/useGestureTableEditing.ts  ← Sub-component hook
```

### File size limit
**Target: under 300 lines per file.**  
If a file exceeds 300 lines, consider extracting:
- Sub-components → new file
- Logic → custom hook
- Types → `types.ts` file
- Constants → `@smog/config`

---

## JSDoc

All exported functions and components require JSDoc:

```typescript
/**
 * Calculate the total sponsorship price in euro cents.
 *
 * @param gestureCount - Number of gestures being sponsored.
 * @param includeLogo - Whether the logo add-on is included.
 * @returns Total price in euro cents.
 *
 * @example
 * calculatePrice(3, true); // 3 * 5000 + 1000 = 16000 (€160)
 */
export function calculatePrice(gestureCount: number, includeLogo: boolean): number {
  return gestureCount * PRICE_PER_YEAR_CENTS + (includeLogo ? LOGO_ADDON_CENTS * gestureCount : 0);
}
```

---

## Styling

### Web (Tailwind)
- Utility classes in JSX — no CSS modules, no inline style objects (except dynamic values)
- Admin CSS variables: `var(--admin-accent)`, `var(--admin-text)`, etc.
- Use `cn()` from `@smog/ui` to merge conditional classes

### Native (StyleSheet)
- `StyleSheet.create()` at module level (never inline)
- Design tokens from `@smog/styles`: `SPACING`, `BORDER_RADIUS`, `SHADOWS`, `FONT_SIZE`
- Theme values from `useTheme()`: `theme.primary`, `theme.text`, `theme.background`

---

## Testing

### Test file location
Co-locate tests with source files in a `__tests__` subdirectory:
```
packages/shared/src/logger.ts
packages/shared/src/__tests__/logger.test.ts
```

### Test naming
```typescript
describe("calculatePrice", () => {
  it("includes logo add-on when includeLogo is true", () => { ... });
  it("excludes logo add-on when includeLogo is false", () => { ... });
  it("scales linearly with gesture count", () => { ... });
});
```

### Use factories for test data
```typescript
import { createGesture, createSponsorship } from "../__tests__/factories";

const gesture = createGesture({ name: "Hello" });
const sponsorship = createSponsorship({ status: "pending_approval" });
```
