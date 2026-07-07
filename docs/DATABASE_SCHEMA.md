# Database Schema

> Last updated: June 10, 2026

Convex is the only application database. The canonical schema is
`packages/convex/convex/schema.ts`.

## Tables

### `categories`

Category name and active state. Indexed by name.

### `gestures`

Gesture name, category references, Mux playback ID, concepts, informational
text, active state, and last-updated timestamp. Includes name/category indexes
and a search index.

### `users`

Optional WorkOS ID or guest ID, optional email, role, creation time, and last
activity. WorkOS and guest identifiers are separately indexed.

### `user_favorites`

User-to-gesture relation with creation time. Mutations enforce one favorite per
user/gesture pair.

### `gesture_lists`

Owner, name, optional description, private/shared visibility, view/edit share
tokens, shared-editing flag, default-favorites flag, and timestamps.

### `gesture_list_items`

List and gesture references, optional adding user, position, and creation time.

### `sponsorships`

Includes:

- gesture, sponsor, contact, and overlay fields;
- original, preview, and sponsored Mux playback IDs;
- status, duration, start/end dates, and timestamps;
- Mollie payment reference and amount;
- admin review and rejection details;
- temporary re-edit token and expiry;
- optional invoice name, VAT number, and email;
- renewal reminder timestamp.

Current statuses include `pending_payment`, `pending_approval`,
`pending_resubmission`, `active`, `expired`, `rejected`, and `cancelled`.

### `adminLogs`

Admin user, action, target, optional metadata, and creation time. Logs are
deleted after 3 years. Account deletion marks relevant logs as belonging to a
deleted user and removes direct reviewer references.

## Storage

Convex file storage and Mux hold generated media where a workflow requires it.
The native app has no SQLite schema. Device storage is limited to session and UI
state described in [Data Synchronization](./SYNC_STRATEGY.md).
