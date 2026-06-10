# Getting Started with SMOG

> This guide gets a new developer productive in under 2 hours.  
> Last updated: March 18, 2026

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| [Bun](https://bun.sh) | ≥ 1.1 | `curl -fsSL https://bun.sh/install \| bash` |
| [Node.js](https://nodejs.org) | ≥ 20 (for some tools) | via [nvm](https://github.com/nvm-sh/nvm) |
| [Xcode](https://developer.apple.com/xcode/) | ≥ 15 | Mac App Store (iOS dev only) |
| [Android Studio](https://developer.android.com/studio) | Latest | android.com (Android dev only) |
| [Git](https://git-scm.com) | ≥ 2.40 | Homebrew: `brew install git` |

## 1. Clone & Install

```bash
git clone <repo-url> swift-forest
cd swift-forest
bun install
```

## 2. Environment Variables

Copy the example env files and fill in the values:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
cp apps/native/.env.example apps/native/.env
```

### Required variables

**`apps/web/.env`**
```env
VITE_CONVEX_URL=https://your-project.convex.cloud
```

**`apps/server/.env`**
```env
CONVEX_URL=https://your-project.convex.cloud
MOLLIE_API_KEY=test_xxx
WORKOS_API_KEY=sk_xxx
WORKOS_CLIENT_ID=client_xxx
```

**`apps/native/.env`**
```env
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
```

## 3. Start Development Servers

You can start all servers at once or individually:

```bash
# All servers in parallel (recommended for full-stack work)
bun dev

# Individual servers
bun -F native dev          # Expo dev server (mobile)
bun -F web dev             # Vite dev server → http://localhost:3001
bun -F server dev          # Hono API server → http://localhost:3000
bun -F remotion dev        # Remotion preview → http://localhost:3002
bun -F @smog/convex dev    # Convex backend
```

## 4. Run the Native App

```bash
# iOS (requires Xcode + iOS Simulator)
bun -F native ios

# Android (requires Android Studio + emulator)
bun -F native android
```

## 5. Project Structure Quick Reference

```
swift-forest/
├── apps/
│   ├── native/          # Expo/React Native mobile app
│   │   ├── app/         # Expo Router screens
│   │   ├── components/  # UI components
│   │   ├── context/     # React contexts
│   │   ├── hooks/       # Custom hooks
│   │   └── services/    # Business logic
│   │       └── database/      # SQLite layer
│   ├── web/             # Vite/React web app
│   │   └── src/
│   │       ├── components/admin/  # Admin dashboard
│   │       └── routes/sponsors/  # Sponsor purchase wizard
│   ├── server/          # Hono/Bun API server
│   └── remotion/        # Video composition
├── packages/
│   ├── @smog/api        # oRPC routers
│   ├── @smog/auth       # Authentication
│   ├── @smog/config     # Constants + URLs
│   ├── @smog/convex     # Convex schema + functions
│   ├── @smog/hooks      # Shared React hooks
│   ├── @smog/shared     # Logger + error handling
│   ├── @smog/styles     # Design tokens
│   ├── @smog/types      # TypeScript types
│   └── @smog/ui         # Shared web components
└── docs/                # This documentation
```

## 6. Key Commands

```bash
# Linting + formatting (auto-fix)
bun check

# Type checking (all packages)
bun check-types

# Build all packages
bun build

# Run tests
bun -F @smog/shared test
bun -F @smog/convex test
bun -F web test
bun -F @smog/hooks test
bun -F native test        # Jest (React Native)
```

## 7. Development Workflow

### Adding a new gesture

1. Go to the admin panel at `http://localhost:3001/admin`
2. Click "New Gesture" in the Gestures tab
3. Fill in name, categories, concepts, and MUX playback ID
4. Save → gesture appears in the native app after next sync

### Adding a new API endpoint

1. Define input/output schemas in `packages/api/src/routers/[router].ts`
2. Implement the handler (use `publicProcedure` or `authProcedure`)
3. The web client picks it up automatically via oRPC

### Adding a new screen (native)

1. Create `apps/native/app/[screen-name].tsx` (Expo Router file-based routing)
2. Export a default React component
3. Navigate with `router.push("/screen-name")`

### Making a Convex schema change

1. Edit `packages/convex/convex/schema.ts`
2. Run `bun -F @smog/convex dev` (Convex auto-deploys in dev mode)
3. Update `DATABASE_TARGET_VERSION` in `@smog/config/constants` if SQLite schema changes too
4. Add a migration in `packages/convex/convex/schema.ts` if needed

## 8. Architecture Overview

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram.

**Key concepts:**
- **Offline-first** — native app reads from SQLite, syncs from Convex in background
- **oRPC** — type-safe HTTP API between web → server (no code generation)
- **Convex** — real-time cloud database + serverless functions

## 9. Useful Resources

| Document | When to read |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Understanding the system |
| [DATA_FLOW.md](./DATA_FLOW.md) | How data moves through the system |
| [SYNC_STRATEGY.md](./SYNC_STRATEGY.md) | Offline sync details |
| [PAYMENT_FLOW.md](./PAYMENT_FLOW.md) | Mollie integration |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Convex + SQLite schemas |
| [COMPONENTS.md](./COMPONENTS.md) | Component reference |
| [HOOKS.md](./HOOKS.md) | Hook reference |
| [API_ROUTERS.md](./API_ROUTERS.md) | API endpoint reference |
| [COMMON_TASKS.md](./COMMON_TASKS.md) | Step-by-step how-tos |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Fix common issues |
| [CODE_STYLE.md](./CODE_STYLE.md) | Coding standards |
