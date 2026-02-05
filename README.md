# SMOG

Sign language learning platform with mobile, web, and server components.

## Tech Stack

- **Native**: React Native + Expo
- **Web**: React + Vite + TanStack Router
- **Server**: Hono + ORPC + Bun
- **Backend**: Convex (database & functions)
- **Video**: Mux (hosting)
- **Build**: Turborepo + Bun
- **Linting**: Biome

## Quick Start

```bash
# Install dependencies
bun install

# Start all dev servers
bun dev
```

## Commands

### Root
```bash
bun check          # Lint and format
bun build          # Build all
bun check-types    # Typecheck all
bun dev            # Start all dev servers
```

### Individual Apps
```bash
# Native (React Native)
bun -F native dev
bun -F native ios
bun -F native android

# Web
bun -F web dev

# Server
bun -F server dev

# Remotion (Video Composition)
bun -F remotion dev

# Convex
bun -F @smog/convex dev
bun -F @smog/convex codegen
```

## Project Structure

```
apps/
├── native/          # React Native mobile app
├── web/             # React web app
├── server/          # Hono API server
└── remotion/        # Remotion video composition

packages/
├── api/             # API layer
├── auth/            # Authentication
├── convex/          # Convex schema & types
├── ui/              # Shared UI components
├── styles/          # Shared styles
└── types/           # Shared types
```

## Development

See [AGENTS.md](./AGENTS.md) for detailed development guidelines.
