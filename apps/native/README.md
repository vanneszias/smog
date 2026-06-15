# SMOG Native

Expo 55 / React Native app for browsing, searching, saving, and sharing
SMOG gestures.

## Architecture

- Expo Router navigation
- WorkOS OAuth with PKCE
- Convex real-time queries and mutations
- SecureStore for refresh tokens
- AsyncStorage for guest identity, UI preferences, recent searches, and
  analytics consent
- Mux playback through `expo-video`
- Consent-gated OpenPanel analytics

The app does not use the retired SQLite gesture or favorites sync layer.
Network access is currently required for server-backed gesture, favorite, and
list data.

## Commands

From the repository root:

```bash
bun -F native dev
bun -F native ios
bun -F native android
bun -F native test
bun -F native check-types
```

Use a development build rather than Expo Go because the app includes native
modules.

## Environment

Configure the root `.env`:

```env
EXPO_PUBLIC_CONVEX_URL=
EXPO_PUBLIC_SERVER_URL=
EXPO_PUBLIC_WORKOS_CLIENT_ID=

EXPO_PUBLIC_OPENPANEL_API_URL=https://analytics.zias.be/api
EXPO_PUBLIC_OPENPANEL_CLIENT_ID=
EXPO_PUBLIC_OPENPANEL_CLIENT_SECRET=
```

OpenPanel credentials may be omitted locally. Tracking is disabled by default
and remains off until the user grants consent.
