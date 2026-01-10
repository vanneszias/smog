# Native App Guidelines

## Overview

SMOG is a sign language learning app that helps users discover, learn, and practice gestures.

## Architecture

### Frontend
- React Native + Expo
- TypeScript
- Expo Router (file-based routing)
- React Context for state
- StyleSheet with theme system

### Backend
- Convex (real-time database)
- SQLite (local storage)
- Custom sync service

## Key Services

- `gestureService.ts` - Gesture data & search
- `databaseService.ts` - SQLite operations
- `convexSyncService.ts` - Data sync
- `analyticsService.ts` - PostHog events

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
app/                # Screens
components/         # UI components
context/            # Providers
services/           # Business logic
hooks/              # Custom hooks
types/              # Types
```

## Convex

Schema in `convex/` with tables for `categories` and `gestures`.

```bash
bun convex dev      # Local dev
bun convex deploy   # Production
```

## Analytics

Events tracked via PostHog:
- Search Performed
- Gesture Viewed
- Favorite Added/Removed
- Video Playback Started/Completed
