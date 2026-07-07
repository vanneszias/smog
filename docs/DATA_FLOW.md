# Data Flow

> Last updated: June 10, 2026

## Gestures and Search

```text
Admin updates Convex
  └─► native/web Convex subscription
       └─► search/filter UI
            └─► Mux streams the selected video
```

Native search calls `api.gestures.searchForNative`; the web uses shared search
hooks and Convex data. Recent native search terms are stored in AsyncStorage.
Analytics receives only query length and result/category counts after consent,
never the query text.

## Users, Guests, Favorites, and Lists

```text
WorkOS user or generated guest ID
  └─► Convex users row
       ├─► user_favorites
       └─► gesture_lists ─► gesture_list_items
```

Both authenticated users and guests have a Convex user record. Mutations update
favorites and lists immediately, with optimistic UI where appropriate. Shared
lists use view/edit share tokens. Guest records and their related favorites and
lists are removed after 12 months of inactivity.

## Authentication

```text
Client opens WorkOS
  └─► authorization code
       └─► server exchanges code with WorkOS
            ├─► web: refresh token in httpOnly cookie
            └─► native: refresh token in SecureStore
```

Access tokens remain in memory and authenticate API/Convex requests. Logout
clears local session state and the active analytics identity.

## Sponsorship

```text
Sponsor selects gestures and enters contact/invoice details
  └─► Remotion creates Mux preview videos
       └─► Convex creates pending_payment sponsorships
            └─► Mollie hosted checkout
                 └─► verified webhook
                      └─► pending_approval + confirmation email
                           ├─► admin approves: active
                           └─► admin rejects: rejected
```

The server recalculates the price. Unpaid `pending_payment` records are
cancelled after 24 hours. Active sponsorships expire after their configured
term; a reminder is queued 30 days before expiry.

## Analytics

Web sends analytics to the server relay only after stored consent is `true`;
native initializes OpenPanel directly after consent. Navigation and the typed
events in `packages/shared/src/analytics.ts` are forwarded to the OpenPanel API
at `https://analytics.zias.be/api`. See
[Privacy and Analytics](./PRIVACY_AND_ANALYTICS.md).
