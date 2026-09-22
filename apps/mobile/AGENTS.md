# Mobile App Guidelines

## Overview

`apps/mobile` is the Expo app that consumes `@smog/ui-native` and talks to
the Payload API (`apps/site`) directly — the replacement for `apps/native`,
which still talks to Convex. The two apps share no dependency: see
`src/boundary.test.ts`.

## Architecture

- React Native + Expo (SDK 55), Expo Router (file-based routing)
- NativeWind for styling — `@smog/styles` is the single source of truth for
  tokens, via `@smog/ui-native/tailwind.config`
- `src/lib/api.ts`'s `payloadFetch` is the one function every screen makes a
  request through: base URL, `?locale=`, `Authorization`, and the 401 that
  clears the session, all in one place

## Commands

```bash
bun dev            # Start Expo
bun ios            # iOS simulator
bun android        # Android emulator
bun test           # Run tests
bun check-types    # Typecheck
```

## Structure

```
app/                # Screens (expo-router)
src/lib/             # payloadFetch, resolveLocale, session
src/test/            # Jest mocks
```
