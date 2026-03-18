# Error Handling

> Last updated: March 18, 2026  
> See also: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Overview

SMOG uses a standardised error handling system defined in `packages/shared/src/errorHandler.ts`. All application errors extend `AppError` and carry a machine-readable `code`, a human-readable `message`, and a `recoverable` flag.

---

## Error Hierarchy

```typescript
AppError (base)
├── ValidationError   — user input fails validation (recoverable)
├── SyncError         — background sync with Convex fails (recoverable)
├── NetworkError      — HTTP request fails/times out (recoverable)
├── DatabaseError     — SQLite operation fails (non-recoverable)
└── ConvexError       — Convex mutation/query fails (recoverable)
```

All errors are exported from `@smog/shared`:

```typescript
import {
  AppError,
  ValidationError,
  SyncError,
  NetworkError,
  DatabaseError,
  ConvexError,
} from "@smog/shared";
```

---

## Error Codes

Each error type has a default code that can be overridden:

| Error Type | Default Code |
|-----------|-------------|
| `AppError` | `UNKNOWN_ERROR` |
| `ValidationError` | `VALIDATION_ERROR` |
| `SyncError` | `SYNC_ERROR` |
| `NetworkError` | `NETWORK_ERROR` |
| `DatabaseError` | `DATABASE_ERROR` |
| `ConvexError` | `CONVEX_ERROR` |

API-level error codes (returned in HTTP responses) are defined in `@smog/types/api.ts` as `ApiErrorCode`.

---

## Safe Async Execution

Use `tryCatch` for async operations that should not throw:

```typescript
import { tryCatch, DatabaseError } from "@smog/shared";

const [err, gesture] = await tryCatch(
  () => databaseService.getGesture(id),
  (rawErr) => new DatabaseError(`Could not load gesture ${id}`)
);

if (err) {
  logger.error("Failed to load gesture", err);
  return;
}

// gesture is defined here
console.log(gesture.name);
```

For synchronous code, use `tryCatchSync`:

```typescript
import { tryCatchSync } from "@smog/shared";

const [err, config] = tryCatchSync(
  () => loadConfig(),
  () => new AppError("Config load failed", "CONFIG_ERROR")
);
```

---

## Logging Errors

Use `logError` for consistent error logging with module prefix:

```typescript
import { logError } from "@smog/shared";

try {
  await databaseService.initialize();
} catch (error) {
  logError("databaseService", "Failed to initialise database", error);
  throw error;
}
```

Or use a module-scoped logger:

```typescript
import { createLogger } from "@smog/shared";

const logger = createLogger("databaseService");

try {
  await db.runAsync(sql, params);
} catch (error) {
  logger.error("Query failed", { sql, error });
}
```

---

## Type Guards

Check error types before accessing specific properties:

```typescript
import { isAppError, isRecoverable } from "@smog/shared";

if (isAppError(error)) {
  console.log(error.code);        // e.g. "DATABASE_ERROR"
  console.log(error.recoverable); // true/false
}

if (!isRecoverable(error)) {
  // Show "restart app" UI
}
```

---

## Error Handling Patterns

### Native App Services

```typescript
// Good: use tryCatch, log at the service boundary
async function syncGestures() {
  const [err, gestures] = await tryCatch(
    () => convexClient.query(api.gestures.list),
    (e) => new SyncError(`Failed to fetch gestures from Convex`)
  );

  if (err) {
    logError("convexSyncService", "Gesture sync failed", err);
    return; // Retry will happen on next poll
  }

  await databaseService.insertGestures(gestures);
}
```

### API Routes (oRPC)

```typescript
// Good: throw typed errors, let the oRPC layer serialize them
export const getSponsorships = publicProcedure
  .input(z.object({ status: z.string().optional() }))
  .query(async ({ input }) => {
    const sponsorships = await convex.query(api.sponsorships.list, input);
    if (!sponsorships) {
      throw new ConvexError("Failed to fetch sponsorships");
    }
    return sponsorships;
  });
```

### React Components

```typescript
// Good: let error boundaries handle rendering errors
// Use toast for user-facing errors from async actions
import { toast } from "sonner";

async function handleSubmit() {
  try {
    await createSponsorship(formData);
  } catch (error) {
    toast.error("Failed to create sponsorship. Please try again.");
    // Do NOT re-throw — let the component stay mounted
  }
}
```

---

## Error Boundaries

### Web App

Wrap major page sections in error boundaries. The `DataTable` component has built-in error rendering for loading states.

### Native App

Top-level error boundaries are configured in `apps/native/app/_layout.tsx`. Individual screens use try/catch in their data loading logic.

---

## Common Error Scenarios

| Scenario | Error Type | Recovery |
|----------|-----------|---------|
| Network offline | `NetworkError` | Retry on reconnect |
| Sync failed | `SyncError` | Retry in `SYNC_RETRY_DELAY_MS` |
| DB migration failed | `DatabaseError` | Full DB reset + re-sync |
| Invalid form input | `ValidationError` | Show field errors to user |
| Convex mutation failed | `ConvexError` | Show toast + allow retry |
| Payment webhook failed | `NetworkError` | Mollie retries automatically |
