# Data Flow

> Last updated: March 18, 2026  
> See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [SYNC_STRATEGY.md](./SYNC_STRATEGY.md)

## Overview

This document explains how the three primary data entities — **gestures**, **sponsorships**, and **user favorites** — flow through the SMOG system.

---

## 1. Gesture Data Flow

### In the Native App

```
Admin creates gesture in Convex dashboard
    ↓
Convex stores gesture (id, name, category[], playbackId, concept[], info)
    ↓
convexSyncService polls Convex (every 2 hours)
    ↓
Writes to local SQLite gestures table
    ↓
gestureService.getAllGestures() reads from SQLite
    ↓
Home screen / Search screen renders gesture list
    ↓
User taps gesture → GestureDetail screen
    ↓
VideoPlayer streams from MUX using playbackId
```

### In the Web App

```
Convex stores gestures
    ↓
Web app uses Convex real-time subscription (useQuery hook)
    ↓
Gesture list rendered (with sponsorship status overlay)
    ↓
Admin panel shows gesture table via oRPC API
```

---

## 2. Sponsorship Data Flow

### Purchase Flow (Web App)

```
Sponsor visits /sponsors page
    ↓
Fetches gesture list with sponsorship status
  (orpc.sponsorships.listGesturesWithSponsorship)
    ↓
Step 1: Selects gestures (StepSelect component)
    ↓
Step 2: Enters sponsor details, contact info, invoice (StepDetails)
    ↓
Calls orpc.sponsorships.generatePreview (one per gesture)
    → Server calls Remotion render API
    → Remotion composes overlay onto gesture video
    → Uploads to MUX
    → Returns previewPlaybackId
    ↓
Step 3: Reviews preview videos (StepPreview)
    ↓
Clicks "Proceed to payment"
    ↓
Calls orpc.sponsorships.createBulkSponsorshipsSimplified
    → Creates Convex sponsorship records (status: pending_payment)
Calls orpc.sponsorships.createBulkPayment
    → Creates Mollie payment order
    → Returns checkoutUrl
    ↓
Browser redirects to Mollie checkout
    ↓
Sponsor completes payment on Mollie
    ↓
Mollie sends webhook to POST /api/webhooks/mollie
    ↓
Server updates sponsorship status → pending_approval
Server sends confirmation email to sponsor
    ↓
Admin reviews in admin dashboard
    ↓
Admin approves → status: active
    → Server enqueues final video composition (Remotion)
    → Convex gesture updated with sponsoredVideoPlaybackId
    → Email sent to sponsor
Admin rejects → status: rejected
    → Email sent with rejection reason
```

### Status State Machine

```
pending_payment
    ↓ (Mollie webhook received)
pending_approval
    ↓ (admin approves)          ↓ (admin rejects)
  active                      rejected
    ↓ (cron job)
  expired
```

For the full sponsorship business logic, see `packages/convex/convex/sponsorships.ts` and the extracted lib modules in `packages/convex/convex/lib/`.

---

## 3. User Favorites Data Flow

### Adding a Favorite (Native App)

```
User double-taps gesture card (or taps heart button)
    ↓
GestureCard calls onToggleFavorite(gestureId)
    ↓
FavoritesContext updates local state (optimistic)
    ↓
offlineFavoritesService queues operation in SQLite
  (favorites_sync_queue table, status: pending)
    ↓
UI updates immediately (no waiting)
    ↓
Background: sync service sends operation to Convex
    ↓
Convex updates user_favorites table
    ↓
SQLite queue entry updated to: synced
```

### Syncing Favorites

```
On app launch / network reconnect:
    ↓
offlineFavoritesService reads pending items from favorites_sync_queue
    ↓
Sends each operation to Convex (add/remove)
    ↓
Updates sync_status in user_favorites table
    ↓
Clears processed items from favorites_sync_queue
```

---

## 4. Real-Time Updates

### Convex Subscriptions

The web app uses Convex real-time subscriptions for:
- Gesture list (admin panel, sponsor selection page)
- Category list (filters)
- Sponsorship status (admin dashboard)

The native app does **not** use real-time subscriptions — it uses polling via `convexSyncService` instead, which is more battery-efficient.

---

## Data Type Summary

| Entity | Convex Schema | SQLite Table | `@smog/types` |
|--------|-------------|-------------|--------------|
| Gesture | `gestures` table | `gestures` | `Gesture` |
| Category | `categories` table | `categories` | `Category` |
| Sponsorship | `sponsorships` table | — (web-only) | `Sponsorship`, `SponsorshipWithGesture` |
| User | `users` table | — | `User` |
| Favorite | `user_favorites` (Convex) | `user_favorites` | — |
