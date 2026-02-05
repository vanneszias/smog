# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMOG is a sign language learning platform with native mobile (React Native/Expo), web (React/Vite), and server (Hono/Bun) components. It's a Turborepo monorepo using Bun as the package manager.

## Commands

### Root Commands
```bash
bun install              # Install dependencies
bun dev                  # Start all dev servers (turbo)
bun build                # Build all packages
bun check                # Biome lint with auto-fix
bun check-types          # Typecheck all packages
```

### App-Specific Commands
```bash
# Native (React Native/Expo)
bun -F native dev        # Start Expo dev server
bun -F native ios        # Run iOS simulator
bun -F native android    # Run Android emulator
bun -F native test       # Run Jest tests

# Web (port 3001)
bun -F web dev           # Start Vite dev server
bun -F web build         # Build for production

# Server (port 3000)
bun -F server dev        # Start Hono server

# Remotion (port 3002)
bun -F remotion dev      # Start Remotion video composition server

# Convex Backend
bun -F @smog/convex dev      # Start Convex dev server
bun -F @smog/convex codegen  # Generate Convex types
bun -F @smog/convex deploy   # Deploy to production
```

## Architecture

### Applications (`apps/`)
- **native**: React Native + Expo mobile app (iOS/Android) with Expo Router
- **web**: React + Vite SPA with TanStack Router and Tailwind CSS v4
- **server**: Hono API server with oRPC, Mux video integration, cron jobs
- **remotion**: Remotion video composition service for sponsor overlays

### Shared Packages (`packages/`)
- **@smog/api**: oRPC API layer (server procedures, client, OpenAPI)
- **@smog/auth**: Authentication (WorkOS) and payments (Mollie)
- **@smog/convex**: Convex schema, functions, and generated types
- **@smog/ui**: Radix UI-based React components
- **@smog/styles**: Tailwind config, colors, spacing constants
- **@smog/hooks**: Shared React hooks
- **@smog/i18n**: i18next internationalization with JSON locales
- **@smog/types**: Shared TypeScript types
- **@smog/config**: Shared TypeScript/Biome configurations

### External Services
- **Convex**: Serverless database and backend functions
- **Mux**: Video hosting and streaming
- **WorkOS**: Authentication/SSO
- **Mollie**: Payment processing
- **PostHog**: Analytics (web and native)
- **Redis**: Session storage (Docker-managed)

## Code Style

### Imports
Third-party first, then workspace packages, then local:
```ts
import { useState } from "react";
import { BORDER_RADIUS } from "@smog/styles";
import { useTheme } from "@/context/ThemeContext";
```

### Naming
- Components: `PascalCase`
- Hooks: `useCamelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Services: `camelCase`

### TypeScript
- Use `type` keyword for type-only imports
- Prefer `unknown` over `any`
- Use `as const` for immutable values

### Error Logging
Prefix with service name:
```ts
console.error("[serviceName] Failed to do something:", error);
```

## Linting

Uses **Ultracite** (Biome preset). Run `bun check` before committing.

```bash
npx ultracite fix    # Format and fix
npx ultracite check  # Check for issues
```
