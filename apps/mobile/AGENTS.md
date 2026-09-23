# Mobile App Guidelines

## Overview

`apps/mobile` is the Expo app that consumes `@smog/ui-native` and talks to
the Payload API (`apps/site`) directly, and to nothing else. It ships under
the existing store identity (bundle id and Android package `be.zias.smog`,
the existing EAS project; `app.json`), so store builds update the installs
of the current release (2.0.2, iOS build 50, versionCode 78) in place.

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
