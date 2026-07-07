# Error Handling

> Last updated: June 10, 2026

## Shared Errors

`@smog/shared` exports `AppError`, `ValidationError`, `NetworkError`,
`ConvexError`, `SyncError`, and `DatabaseError`, plus `tryCatch`,
`tryCatchSync`, `isAppError`, `isRecoverable`, and `logError`.

`SyncError` and `DatabaseError` remain for compatibility with older consumers;
the current native app does not have a SQLite or background-sync service.

```typescript
import { ConvexError, tryCatch } from "@smog/shared";

const [error, result] = await tryCatch(
  () => convex.query(api.gestures.list, {}),
  () => new ConvexError("Failed to load gestures")
);

if (error) {
  return;
}
```

## Logging

Use a named logger or the established service-prefixed `console.error` pattern
at integration boundaries:

```typescript
import { createLogger } from "@smog/shared";

const logger = createLogger("favorites");

try {
  await toggleFavorite({ userId, gestureId });
} catch (error) {
  logger.error("Failed to toggle favorite", error);
  throw error;
}
```

Never log authentication tokens, OpenPanel client secrets, invoice details, or
payment credentials.

## Layer Patterns

### React

Catch errors from user actions, restore optimistic state, and show a useful
toast or inline retry. Rendering failures belong in route or app error
boundaries.

### oRPC

Validate input with Zod. Log provider failures with enough context to trace the
operation, then return a safe message that does not expose secrets.

### Webhooks

Return a non-2xx response for retryable failures. Verify payment state by
fetching it from Mollie; do not trust the incoming payment ID as proof of
payment. Make side effects idempotent where duplicate webhooks are possible.

### Scheduled Jobs

Handle one record at a time so a single failure does not abort the batch. Jobs
must be safe to run again.

### Analytics

Analytics must never make a product action fail. SDK initialization and event
delivery errors are logged and swallowed. Consent checks happen before client
creation and before every event.

## User-Facing Messages

- Explain what failed and what the user can do next.
- Keep provider internals and stack traces out of public messages.
- Preserve field-level validation errors.
- Do not claim a payment failed until Mollie reports the final state.
- Avoid personal data in error text or URLs.
