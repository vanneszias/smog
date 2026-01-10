# SMOG Native App

Sign language learning mobile app built with React Native and Expo.

## Features

- Smart search with autocomplete
- Video library of gestures
- Favorites system
- Offline support
- Multilingual (EN, FR, NL)
- Learning analytics

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: Expo Router
- **State**: React Context
- **Backend**: Convex (real-time)
- **Local**: SQLite (offline)
- **Analytics**: PostHog

## Commands

```bash
bun dev            # Start Expo dev server
bun ios            # Run iOS simulator
bun android        # Run Android emulator
bun test           # Run tests
bun check-types    # Typecheck
```

## Setup

```bash
# Install dependencies
bun install

# Start dev server
bun dev

# Scan QR code with Expo Go
```

## Structure

```
app/                # Expo Router screens
components/         # Reusable components
context/            # React Context
services/           # Business logic
hooks/              # Custom hooks
types/              # TypeScript types
```

## Environment

Required in `.env`:
```
EXPO_PUBLIC_CONVEX_URL=your_convex_url
```

See [AGENTS.md](./AGENTS.md) for development guidelines.
