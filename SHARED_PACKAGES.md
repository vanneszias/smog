# SMOG - Shared Packages

This document describes the shared packages architecture for the SMOG monorepo. These packages allow code reuse between the native mobile app and web sponsor app.

## Packages Overview

### @smog/styles
**Location:** `packages/styles`

Shared design system including colors, typography, spacing, and theme definitions.

**Exports:**
- `colors` - Brand color palette
- `themes` - Light and dark theme configurations
- `SPACING`, `BORDER_RADIUS`, `FONT_SIZE`, `FONT_WEIGHT` - Design tokens
- `ANIMATION_DURATION`, `ICON_SIZE`, `HIT_SLOP` - UI constants

**Usage:**
```typescript
import { colors, themes, SPACING } from '@smog/styles';

// Use brand colors
const primaryColor = colors.primary; // #00805F

// Access theme
const lightTheme = themes.light;

// Use spacing
const padding = SPACING.md; // 16
```

**Design System:**
- **Primary Color:** `#00805F` (Dark green)
- **Secondary Color:** `#97C699` (Light green)
- **Accent Color:** `#EE971C` (Orange)
- **Spacing Scale:** xs(4), sm(8), md(16), lg(24), xl(32), xxl(48)
- **Font Sizes:** xs(12), sm(14), md(16), lg(18), xl(24), xxl(32)

### @smog/types
**Location:** `packages/types`

Shared TypeScript types and interfaces for the entire application.

**Exports:**
- `Gesture` - Gesture/sign data structure
- `User` - User profile type
- `AuthContextType` - Authentication context
- `Theme`, `ThemeContextType` - Theme types
- `FavoritesContextType` - Favorites functionality
- `Category`, `SearchResult`, `SearchFilters` - Search types

**Usage:**
```typescript
import type { Gesture, User, Theme } from '@smog/types';

const gesture: Gesture = {
  id: '1',
  name: 'Hello',
  category: ['greetings'],
  playbackId: 'abc123',
  concept: ['greeting', 'polite'],
  info: 'A common greeting gesture'
};
```

**Key Types:**
- `Gesture` - Core gesture/sign entity with MUX video playback
- `User` - User profile with authentication metadata
- `Category` - Gesture categorization
- `Theme` - App theming configuration

### @smog/i18n
**Location:** `packages/i18n`

Internationalization resources and translation files.

**Supported Languages:**
- English (en)
- French (fr)
- Dutch (nl)

**Exports:**
- `en`, `fr`, `nl` - Translation JSON objects
- `availableLocales` - Array of supported locale codes
- `AvailableLocale` - TypeScript type for locales
- `TranslationKeys` - Type-safe translation key structure

**Usage:**
```typescript
import { en, fr, nl, availableLocales } from '@smog/i18n';

// Access translations
console.log(en.search.placeholder); // "Search signs..."
console.log(fr.search.placeholder); // "Rechercher des signes..."

// Iterate available locales
availableLocales.forEach(locale => {
  console.log(locale); // 'en', 'fr', 'nl'
});
```

**Translation Structure:**
The translation files include keys for:
- `search` - Search functionality
- `home` - Home screen
- `favorites` - Favorites management
- `auth` - Authentication flows
- `settings` - App settings
- `gesture` - Gesture details
- `common` - Common UI elements
- `tabs` - Navigation tabs

### @smog/ui
**Location:** `packages/ui`

Shared UI components that work across web and native platforms.

**Status:** Placeholder - components will be added as needed

**Usage:**
```typescript
import { version } from '@smog/ui';
```

**Future Components:**
- Button variants
- Card layouts
- Form inputs
- Modal/Dialog components
- Loading states
- Empty states

## Using Shared Packages

### In Native App (`apps/native`)

The native app uses these packages for consistent styling and types:

```typescript
// Import styles
import { colors, SPACING } from '@smog/styles';
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: SPACING.md,
  }
});

// Import types
import type { Gesture } from '@smog/types';

// Import translations
import { en } from '@smog/i18n';
```

### In Web App (`apps/web`)

The web app can adapt the shared packages for Tailwind CSS:

```typescript
// Use colors in Tailwind config
import { colors } from '@smog/styles';

export default {
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
      }
    }
  }
}

// Use shared types
import type { Gesture, User } from '@smog/types';

// Use translations with i18next or similar
import { en, fr } from '@smog/i18n';
```

## Package Structure

Each package follows this structure:

```
packages/[package-name]/
├── src/
│   ├── index.ts          # Main export file
│   └── [modules].ts      # Module files
├── package.json          # Package configuration
└── tsconfig.json         # TypeScript configuration
```

## Development Workflow

### Adding New Shared Code

1. **Identify common code** between native and web apps
2. **Choose appropriate package** (or create new one)
3. **Add code to package** with proper TypeScript types
4. **Export from index.ts** (if needed)
5. **Run type checking:** `bun run check-types`
6. **Update consuming apps** to use shared code

### Creating a New Shared Package

```bash
# Create package structure
mkdir -p packages/[name]/src

# Create package.json
cat > packages/[name]/package.json << EOF
{
  "name": "@smog/[name]",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
EOF

# Create tsconfig.json
cat > packages/[name]/tsconfig.json << EOF
{
  "extends": "@smog/config/tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  }
}
EOF

# Install dependencies
bun install
```

## Best Practices

### 1. Keep Packages Focused
Each package should have a single, clear responsibility.

### 2. Use TypeScript Strictly
All shared code must be properly typed with TypeScript.

### 3. Document Exports
Add JSDoc comments to exported functions and types.

### 4. Avoid Platform-Specific Code
Shared packages should work on both web and native unless explicitly designed otherwise.

### 5. Version Together
All packages share the same version (0.0.0) and are released together.

### 6. Test Imports
Ensure both apps can import and use shared code successfully.

## Migration Strategy

The native app's existing code is being gradually migrated to shared packages:

### Phase 1: Foundation (Complete)
- ✅ Created `@smog/styles` with colors, themes, constants
- ✅ Created `@smog/types` with core domain types
- ✅ Created `@smog/i18n` with translations
- ✅ Created `@smog/ui` placeholder

### Phase 2: Component Migration (Next)
- Move reusable components from native to `@smog/ui`
- Adapt components to work on both platforms
- Update native app to use shared components

### Phase 3: Business Logic (Future)
- Extract data fetching logic
- Share validation rules
- Consolidate utility functions

## Troubleshooting

### Import Errors
If you get import errors, ensure:
1. Package is added to `dependencies` in consuming app's package.json
2. Run `bun install` after adding dependencies
3. TypeScript references are set up correctly

### Type Errors
If you get type errors:
1. Run `bun run check-types` in the package directory
2. Ensure tsconfig.json extends the base config
3. Check that types are properly exported

### Build Errors
If builds fail:
1. Check that all dependencies are installed
2. Ensure no circular dependencies between packages
3. Verify turbo.json includes necessary tasks

## Resources

- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Turbo Monorepo](https://turbo.build/repo/docs)
