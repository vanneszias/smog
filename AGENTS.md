# Development Guidelines

## Commands

### Root Commands
```bash
bun check                    # Run Biome linter with auto-fix
bun build                    # Build all packages
bun check-types              # Typecheck all packages
bun dev                      # Start all dev servers (turbo)
```

### Native App (Expo/React Native)
```bash
bun -F native dev            # Start Expo dev server
bun -F native ios            # Run iOS simulator
bun -F native android        # Run Android emulator
bun -F native test           # Run Jest tests
bun -F native check-types    # Typecheck with tsc
```

### Web App (Vite/React)
```bash
bun -F web dev               # Start dev server (port 3001)
bun -F web build             # Build for production
bun -F web check-types       # Typecheck with tsc
```

### Server (Hono/Bun)
```bash
bun -F server dev            # Start server dev server
bun -F server build          # Build with tsdown
bun -F server check-types    # Typecheck with tsc
```

### Remotion (Video Composition)
```bash
bun -F remotion dev          # Start Remotion server (port 3002)
bun -F remotion dev:studio   # Start Remotion Studio for visual preview
bun -F remotion check-types  # Typecheck with tsc
```

### Convex (Backend)
```bash
bun -F @smog/convex dev      # Start Convex dev server
bun -F @smog/convex codegen  # Generate Convex types
bun -F @smog/convex deploy   # Deploy to production
```

## Code Style

### Imports
- Third-party imports first, then workspace imports
- Use `@/` alias for app-specific imports
- Use `@smog/package-name` for workspace imports

Example:
```ts
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, SHADOWS } from "@smog/styles";
import { useTheme } from "@/context/ThemeContext";
```

### Naming Conventions
- Components: PascalCase (`GestureCard`, `BottomSheet`)
- Hooks: camelCase with `use` prefix (`useBottomSheet`, `useAutoSync`)
- Services/Instances: camelCase (`gestureService`, `databaseService`)
- Types/Interfaces: PascalCase (`GestureCardProps`, `GestureCardRef`)
- Constants: UPPER_SNAKE_CASE (`BORDER_RADIUS`, `SPACING`)

### TypeScript
- Strict mode enabled
- Use `type` keyword for type-only imports: `import type { Gesture } from "@/types"`
- Explicit types for function parameters and return values

### Error Handling
- Use try/catch in async functions
- Log errors with service name prefix: `[serviceName] Failed to ...`
- Rethrow errors for calling code to handle

Example:
```ts
try {
  await service.doSomething();
} catch (error) {
  console.error("[serviceName] Failed to do something:", error);
  throw error;
}
```

## Project Structure
- `apps/*`: Application code (native, web, server, remotion)
- `packages/*`: Shared packages (api, auth, convex, ui, styles, etc.)

## Linting
- Biome handles linting and formatting
- Extends `ultracite` presets
- Run `bun check` before committing to auto-fix issues
