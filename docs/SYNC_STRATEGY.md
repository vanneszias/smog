# Data Synchronization

> Last updated: June 10, 2026

## Current Model

Convex is the sole application database and the source of truth. Native and web
use Convex subscriptions for server-backed data:

- gestures and categories;
- users and guest identities;
- favorites;
- lists and list items;
- sponsorship state;
- admin data.

There is no SQLite database, polling sync service, favorites operation queue,
schema version, or last-write-wins reconciliation in the current native app.

## Optimistic Updates

The native favorites context keeps a temporary optimistic list while the Convex
mutation is running. On failure it restores the previous value. The next
subscription result becomes authoritative.

## Local-Only State

The following is intentionally device or browser local:

- language and theme;
- native recent searches;
- guest-mode identity bootstrap;
- secure native refresh token;
- web query cache;
- analytics consent and SDK delivery state.

Local state is not a general offline database. Browsing uncached server content
or changing favorites/lists requires connectivity.

## Retention Jobs

Convex cron removes guest users, favorites, and lists after 12 months of
inactivity and removes admin logs after 3 years. The server separately handles
sponsorship expiry, renewal reminders, and cancellation of payment attempts
older than 24 hours.
