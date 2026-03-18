# 🚀 SMOG DX Refactoring Roadmap

**Objective:** Transform SMOG codebase into a maintainable, well-documented, highly optimized system with excellent developer experience.

**Timeline:** 3-4 weeks of focused work (~182 hours)  
**Status:** 🟡 Not Started  
**Last Updated:** March 18, 2026

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Phase 1: Foundation & Critical Fixes](#phase-1-foundation--critical-fixes)
3. [Phase 2: Module Decomposition](#phase-2-module-decomposition)
4. [Phase 3: Documentation & Clarity](#phase-3-documentation--clarity)
5. [Phase 4: Optimization & Refinement](#phase-4-optimization--refinement)
6. [Phase 5: Polish & Tools](#phase-5-polish--tools)
7. [Metrics & Success Criteria](#metrics--success-criteria)

---

## Executive Summary

### Current State Analysis

| Metric | Current | Target |
|--------|---------|--------|
| **Monolithic Files** | 15+ (1000+ lines each) | 0 (max 300 lines) |
| **Type Safety** | Partial (`any` types present) | 100% |
| **Documentation** | ~20% of files | 100% |
| **Duplication** | ~25% of code | <5% |
| **Circular Dependencies** | 3-4 detected | 0 |
| **Error Handling** | 6+ patterns | 1 pattern |
| **Unused Exports** | ~50+ exports | 0 |
| **Code Comments** | Sparse | Every function |
| **Test Coverage** | ~35% | 70%+ |

### Key Issues Identified

🔴 **Critical (Immediate Action Required)**
- [ ] Sponsors route: 1,494 lines in single file (56 nested functions)
- [ ] Admin dashboard: 1,115 + 901 lines spread across files with duplication
- [ ] Sponsorship logic: 971 lines with tangled business logic
- [ ] Type safety: Multiple `any` casts and missing type exports
- [ ] Error handling: 6 different patterns across codebase

🟠 **Major (High Priority)**
- [ ] Native services: Over-engineered with mixed concerns
- [ ] Component sizes: VideoPlayer (334), GestureCard (300+), GDPRModal (370)
- [ ] Documentation: Missing JSDoc on core services and APIs
- [ ] Console logging: Production code has debug logs without levels
- [ ] Optimization: Potential unnecessary re-renders, underutilized memoization

---

# PHASE 1: Foundation & Critical Fixes

**Duration:** Week 1-2 (26 hours)  
**Goal:** Stabilize codebase and fix critical issues  
**Status:** 🔴 Not Started

## 1.1 Type Safety & Import Organization

### Task: Create Unified Type System

- [ ] Create `packages/types/src/` directory structure
  - [ ] `packages/types/src/index.ts` - Main exports
  - [ ] `packages/types/src/admin.ts` - Admin types
  - [ ] `packages/types/src/sponsorships.ts` - Sponsorship types
  - [ ] `packages/types/src/gestures.ts` - Gesture types
  - [ ] `packages/types/src/users.ts` - User types
  - [ ] `packages/types/src/api.ts` - API types
  - [ ] `packages/types/src/database.ts` - Database model types

- [ ] Consolidate duplicate type definitions
  - [ ] Extract `Sponsorship` interface from `SponsorshipsManagement.tsx`
  - [ ] Extract `GestureCard` type from `GestureDetail.tsx`
  - [ ] Extract `AdminTableRow` type from `AdminTable.tsx`
  - [ ] Extract `SyncStatus` types from native services
  - [ ] Export all from `@smog/types`

- [ ] Fix type safety issues
  - [ ] Remove `// biome-ignore lint/suspicious/noExplicitAny` from `sponsorships.ts:101`
  - [ ] Replace `as never` casts in `gestures.ts:71` with proper nominal type for Convex IDs
  - [ ] Create `ConvexId<T>` nominal type for type-safe ID handling
  - [ ] Update all ID references to use nominal type

- [ ] Update imports across codebase
  - [ ] Update `apps/web/src/components/admin/` imports
  - [ ] Update `apps/web/src/routes/sponsors/` imports
  - [ ] Update `packages/ui/` imports
  - [ ] Update `packages/api/` imports
  - [ ] Remove inline type definitions

**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Create Centralized Logging Service

- [ ] Create `packages/shared/src/logger.ts`
  ```typescript
  // Required functionality:
  // - Log levels: DEBUG, INFO, WARN, ERROR
  // - Consistent prefix format: [moduleName]
  // - Environment-based filtering
  // - No logs in production:debug
  ```

- [ ] Create logger types in `packages/shared/src/types/logger.ts`
  - [ ] `LogLevel` enum
  - [ ] `LogEntry` interface
  - [ ] `LoggerConfig` interface

- [ ] Remove all console.log statements
  - [ ] `apps/native/app/_layout.tsx` - 4 console.log calls
  - [ ] `apps/native/app/auth-callback.tsx` - 6 console.log calls
  - [ ] `apps/native/hooks/useOptimizedSearch.ts` - console.log without prefix
  - [ ] Search for and remove all remaining `console.` calls (scan entire codebase)

- [ ] Create Biome rule to prevent console in production code
  - [ ] Add to `biome.json`: rule to prevent `console.log/warn/error`
  - [ ] Configure to allow only in development or test files

**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Create Error Handler Utility

- [ ] Create `packages/shared/src/errorHandler.ts`
  ```typescript
  // Required functionality:
  // - Define error types: ValidationError, SyncError, NetworkError, DatabaseError
  // - logError() with consistent prefix
  // - reportError() for analytics
  // - createErrorBoundary() utility
  ```

- [ ] Create error types in `packages/shared/src/types/errors.ts`
  - [ ] `AppError` base class
  - [ ] `ValidationError` extends AppError
  - [ ] `SyncError` extends AppError
  - [ ] `NetworkError` extends AppError
  - [ ] `DatabaseError` extends AppError
  - [ ] `ConvexError` extends AppError
  - [ ] Each with code, message, recoverable flag

- [ ] Standardize error handling patterns
  - [ ] Create `useErrorHandler()` hook for React components
  - [ ] Create `withErrorBoundary()` HOC for components
  - [ ] Create `tryCatch()` utility for async functions
  - [ ] Update all try/catch blocks in:
    - [ ] `apps/native/services/` (6+ services)
    - [ ] `apps/native/context/` (4+ contexts)
    - [ ] `apps/web/src/` (API calls, mutations)

- [ ] Add error boundary components
  - [ ] `packages/ui/src/ErrorBoundary.tsx` for web
  - [ ] `apps/native/components/ErrorBoundary.tsx` for native
  - [ ] Wrap top-level app in error boundary

**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Centralize Config & Constants

- [ ] Create `packages/config/src/constants.ts`
  - [ ] Extract `VIDEO_COMPLETE_COUNT = 7` from `GestureDetail.tsx`
  - [ ] Extract gesture limits and pagination defaults
  - [ ] Extract sponsorship pricing tiers
  - [ ] Extract cache durations
  - [ ] Extract gesture category limits
  - [ ] Document each constant with comment

- [ ] Create `packages/config/src/urls.ts`
  - [ ] Extract Mux domain
  - [ ] Extract API endpoints
  - [ ] Extract external service URLs
  - [ ] Extract CDN URLs
  - [ ] Use environment variables with fallbacks

- [ ] Create `packages/config/src/environment.ts`
  - [ ] Type-safe environment variable loader
  - [ ] Validation on startup
  - [ ] Required variables check
  - [ ] Fallback defaults

- [ ] Update all files to use config
  - [ ] `packages/ui/src/gestures/GestureDetail.tsx` - use VIDEO_COMPLETE_COUNT
  - [ ] `apps/web/src/` - use config URLs
  - [ ] `apps/native/` - use config constants
  - [ ] `packages/api/src/` - use config endpoints

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

## 1.2 Quick Cleanup Wins

### Task: Remove Production Debug Code

- [ ] Remove all `console.log` statements
  - [ ] Search: `console\.log\(` (estimated 20+ occurrences)
  - [ ] Search: `console\.warn\(` (estimated 5+ occurrences)
  - [ ] Search: `console\.error\(` (should use logger instead)

- [ ] Remove debugging code
  - [ ] Remove commented-out code blocks
  - [ ] Remove `// TODO` comments that are obsolete
  - [ ] Remove debug-only conditional branches

- [ ] Add Biome linting rule
  - [ ] Update `biome.json` to prevent console in production
  - [ ] Run `bun check` to validate

**Estimated Time:** 2 hours  
**Priority:** 🟢 MEDIUM

---

### Task: Add JSDoc to Core Services

Add file-level and function-level JSDoc to:

- [ ] `apps/native/services/databaseService.ts`
  ```typescript
  /**
   * @fileoverview Manages SQLite database operations with offline-first sync
   * 
   * Handles:
   * - Local data persistence
   * - Schema management and migrations
   * - Sync with Convex backend
   * 
   * Architecture:
   * - Maintains local-first state
   * - Queues operations during offline
   * - Syncs when network available
   */
  ```

- [ ] `apps/native/services/convexSyncService.ts`
- [ ] `apps/native/services/analyticsService.ts`
- [ ] `apps/native/services/gestureService.ts`
- [ ] `apps/web/src/services/` (all services)
- [ ] `packages/api/src/routers/` (all routers)

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

## Phase 1 Summary

| Task | Time | Status | Notes |
|------|------|--------|-------|
| Type System | 8 hrs | ⬜ | Foundation for everything |
| Error Handling | 8 hrs | ⬜ | Critical for stability |
| Config/Constants | 4 hrs | ⬜ | Makes code maintainable |
| JSDoc Cleanup | 4 hrs | ⬜ | Foundation for Phase 3 |
| Remove Debug Code | 2 hrs | ⬜ | Quick wins |
| **PHASE 1 TOTAL** | **26 hrs** | ⬜ | |

---

# PHASE 2: Module Decomposition

**Duration:** Week 2-3 (56 hours)  
**Goal:** Break monolithic files into focused, single-responsibility modules  
**Status:** 🔴 Not Started

## 2.1 Web App Sponsors Route Refactoring

### Current State
- **File:** `apps/web/src/routes/sponsors/index.tsx`
- **Size:** 1,494 lines
- **Functions:** 56 nested functions
- **Issues:** Testing impossible, debugging difficult, code reuse impossible

### Target State
- 5 focused files
- Single responsibility each
- Each <300 lines
- Reusable composition

---

### Task: Extract SponsorshipWizard Component

- [ ] Create `apps/web/src/routes/sponsors/components/SponsorshipWizard.tsx` (~250 lines)
  - [ ] Contains: Multi-step form UI (step 1-5)
  - [ ] Props: `onComplete`, `onCancel`, `initialGestures`
  - [ ] State: Current step, form data
  - [ ] Export: `SponsorshipWizard` component

- [ ] Create `apps/web/src/routes/sponsors/hooks/useSponsorshipForm.ts` (~150 lines)
  - [ ] Contains: Form state machine logic
  - [ ] Returns: `currentStep`, `formData`, `goToStep`, `updateFormData`, `canProceed`
  - [ ] Validation: Each step before proceeding
  - [ ] Persistence: Save form state to localStorage

- [ ] Update sponsors page to use wizard
  - [ ] Remove inline wizard code
  - [ ] Import `SponsorshipWizard` from new file
  - [ ] Pass props for composition

**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Extract GestureSelector Component

- [ ] Create `apps/web/src/routes/sponsors/components/GestureSelector.tsx` (~200 lines)
  - [ ] Contains: Gesture list, search, selection
  - [ ] Props: `onSelect`, `selected`, `searchQuery`
  - [ ] Features: Search/filter, pagination, selection UI

- [ ] Create `apps/web/src/routes/sponsors/hooks/useGestureSelection.ts` (~80 lines)
  - [ ] Contains: Selection state and logic
  - [ ] Returns: `selected`, `toggleGesture`, `clearSelection`, `isSelected`
  - [ ] Validation: Max gesture count

- [ ] Extract gesture search from main component
  - [ ] Move to: `apps/web/src/routes/sponsors/utils/gestureSearch.ts`
  - [ ] Contains: Filter/search logic
  - [ ] Pure functions, fully testable

**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Extract SponsorshipPreview Component

- [ ] Create `apps/web/src/routes/sponsors/components/SponsorshipPreview.tsx` (~150 lines)
  - [ ] Contains: Preview modal UI
  - [ ] Props: `sponsorship`, `isOpen`, `onClose`, `onConfirm`
  - [ ] Shows: Selected gestures, pricing, terms

- [ ] Create `apps/web/src/routes/sponsors/hooks/useVideoComposition.ts` (~120 lines)
  - [ ] Contains: Video generation logic
  - [ ] Returns: `isGenerating`, `videoUrl`, `generateVideo`, `error`
  - [ ] Calls: Remotion service

- [ ] Create `apps/web/src/routes/sponsors/hooks/useSponsorshipMutation.ts` (~100 lines)
  - [ ] Contains: API call logic
  - [ ] Returns: `isLoading`, `createSponsorship`, `error`
  - [ ] Handles: Success/error states

**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Extract Validation & Utilities

- [ ] Create `apps/web/src/routes/sponsors/utils/validation.ts`
  - [ ] Export: `validateStep1`, `validateStep2`, `validateStep3`, `validateStep4`, `validateStep5`
  - [ ] Use: Zod schemas from `@smog/types`
  - [ ] Return: `{ isValid: boolean, errors: Record<string, string> }`

- [ ] Create `apps/web/src/routes/sponsors/utils/sponsorshipHelpers.ts`
  - [ ] Export: `calculateSponsorsshipPrice`, `formatSponsorshipTerm`, `generateSponsorshipCode`
  - [ ] Pure functions, fully testable

- [ ] Create `apps/web/src/routes/sponsors/utils/dateHelpers.ts`
  - [ ] Export: `calculateEndDate`, `formatDate`, `isDateValid`
  - [ ] Handle: Different date formats, timezones

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

### Task: Create Main Sponsors Page

- [ ] Update `apps/web/src/routes/sponsors/index.tsx` (~100 lines)
  - [ ] Remove: All component definitions, hooks, utilities
  - [ ] Keep: Page-level composition only
  - [ ] Import: `SponsorshipWizard`, `useSponsorshipForm`, hooks
  - [ ] Simple: Just render components and wire up

**Code Structure:**
```typescript
// apps/web/src/routes/sponsors/index.tsx (~100 lines)
export default function SponsorsPage() {
  const form = useSponsorshipForm();
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  
  return (
    <div>
      <header>Become a Sponsor</header>
      <SponsorshipWizard
        isOpen={isWizardOpen}
        onComplete={form.handleComplete}
        onCancel={() => setIsWizardOpen(false)}
      />
    </div>
  );
}
```

**Estimated Time:** 2 hours  
**Priority:** 🟠 HIGH

---

### Sponsors Route Refactoring Summary

| File | Lines | Purpose |
|------|-------|---------|
| `index.tsx` | ~100 | Page composition |
| `components/SponsorshipWizard.tsx` | ~250 | Multi-step form |
| `components/GestureSelector.tsx` | ~200 | Gesture selection |
| `components/SponsorshipPreview.tsx` | ~150 | Preview modal |
| `hooks/useSponsorshipForm.ts` | ~150 | Form state |
| `hooks/useGestureSelection.ts` | ~80 | Selection state |
| `hooks/useVideoComposition.ts` | ~120 | Video generation |
| `hooks/useSponsorshipMutation.ts` | ~100 | API calls |
| `utils/validation.ts` | ~80 | Form validation |
| `utils/sponsorshipHelpers.ts` | ~60 | Calculations |
| `utils/dateHelpers.ts` | ~40 | Date logic |
| **TOTAL** | **~1,330** | ↓ 164 lines (11% reduction) |
| **Result** | Max 250 | Each file single-purpose |

**Time:** 26 hours | **Priority:** 🔴 CRITICAL

---

## 2.2 Admin Dashboard Consolidation

### Current State
- `SponsorshipsManagement.tsx`: 1,115 lines
- `AdminTable.tsx`: 901 lines
- Duplicated filtering/search logic
- Mixed concerns in both files

### Target State
- Reusable `DataTable` component
- Single filter/search implementation
- Clear separation of concerns

---

### Task: Create Generic DataTable Component

- [ ] Create `apps/web/src/components/admin/shared/DataTable.tsx` (~300 lines)
  ```typescript
  interface DataTableProps<TData> {
    columns: DataTableColumn<TData>[];
    data: TData[];
    onRowClick?: (row: TData) => void;
    onEdit?: (row: TData) => void;
    onDelete?: (row: TData) => void;
    isLoading?: boolean;
    error?: Error | null;
  }
  ```

- [ ] Create `apps/web/src/components/admin/shared/DataTableColumn.ts` (~50 lines)
  ```typescript
  export interface DataTableColumn<TData> {
    key: keyof TData;
    header: string;
    render?: (value: any, row: TData) => ReactNode;
    sortable?: boolean;
    filterable?: boolean;
  }
  ```

- [ ] Create `apps/web/src/components/admin/shared/DataTablePagination.tsx` (~80 lines)
  - [ ] Export pagination controls
  - [ ] Props: `page`, `pageSize`, `total`, `onPageChange`

- [ ] Create `apps/web/src/components/admin/shared/DataTableSearch.tsx` (~60 lines)
  - [ ] Export search/filter input
  - [ ] Props: `query`, `onQueryChange`, `placeholder`

**Estimated Time:** 10 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Create Admin Table Hooks

- [ ] Create `apps/web/src/components/admin/hooks/useAdminTable.ts` (~120 lines)
  - [ ] Contains: Table state (page, sort, filters)
  - [ ] Returns: `page`, `pageSize`, `sortBy`, `setSortBy`, `setPage`
  - [ ] Persistence: Save to localStorage

- [ ] Create `apps/web/src/components/admin/hooks/useAdminFilters.ts` (~100 lines)
  - [ ] Contains: Shared filter logic
  - [ ] Returns: `filters`, `setFilter`, `clearFilters`, `applyFilters`
  - [ ] Single source of truth for all admin filters

- [ ] Create `apps/web/src/components/admin/hooks/useAdminMutations.ts` (~150 lines)
  - [ ] Contains: Edit/delete/create mutations
  - [ ] Returns: `editSponsorship`, `deleteSponsorship`, `isLoading`, `error`
  - [ ] Handles: Success/error states, optimistic updates

- [ ] Create `apps/web/src/components/admin/hooks/useAdminSorting.ts` (~80 lines)
  - [ ] Contains: Sort logic
  - [ ] Returns: `sortBy`, `setSortBy`, `toggleSort`

**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Refactor SponsorshipsManagement

- [ ] Update `apps/web/src/components/admin/SponsorshipsManagement.tsx` (~150 lines)
  - [ ] Remove: DataTable definition, filter logic, sort logic
  - [ ] Keep: Domain-specific UI layout
  - [ ] Import: `DataTable`, hooks from shared

- [ ] Create column definition file
  - [ ] `apps/web/src/components/admin/SponsorshipsManagement/columns.ts` (~100 lines)
  - [ ] Define sponsorship table columns with renderers

- [ ] Create `apps/web/src/components/admin/SponsorshipsManagement/SponsorshipsTable.tsx` (~100 lines)
  - [ ] Wrapper: DataTable + sponsorship-specific logic
  - [ ] Props: `sponsorships`, `onEdit`, `onDelete`

**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Update AdminTable and Create Admin Types

- [ ] Update `apps/web/src/components/admin/AdminTable.tsx` (~200 lines)
  - [ ] Remove: Duplicate logic
  - [ ] Use: Shared DataTable instead
  - [ ] Keep: Admin-specific features if any

- [ ] Create `apps/web/src/components/admin/types/index.ts`
  - [ ] Export: `DataTableColumn`, `DataTableProps`, `AdminFilter`
  - [ ] Remove: Inline type definitions

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

### Admin Dashboard Refactoring Summary

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| SponsorshipsManagement.tsx | 1,115 | 150 | ⬜ |
| AdminTable.tsx | 901 | 200 | ⬜ |
| DataTable (new) | - | 300 | ⬜ |
| Hooks (new) | - | 450 | ⬜ |
| **NET CHANGE** | 2,016 | 1,100 | ↓ 45% |

**Time:** 30 hours | **Priority:** 🔴 CRITICAL

---

## 2.3 Native Services Decomposition

### Task: Decompose Database Service

**Current:** `apps/native/services/databaseService.ts` (707 lines)

- [ ] Create `apps/native/services/database/index.ts` (~100 lines)
  - [ ] Public API: `openDatabase`, `closeDatabase`, `getGesture`, etc.
  - [ ] Re-export from submodules

- [ ] Create `apps/native/services/database/schema.ts` (~150 lines)
  - [ ] Database schema definition
  - [ ] Table creation SQL
  - [ ] Index definitions

- [ ] Create `apps/native/services/database/migrations.ts` (~200 lines)
  - [ ] Version management
  - [ ] Migration functions
  - [ ] `ensureCorrectSchema()` refactored

- [ ] Create `apps/native/services/database/operations.ts` (~300 lines)
  - [ ] CRUD operations
  - [ ] Query functions
  - [ ] Batch operations

- [ ] Create `apps/native/services/database/sync.ts` (~100 lines)
  - [ ] Sync-related operations
  - [ ] Conflict resolution
  - [ ] Queue management

- [ ] Create `apps/native/services/database/types.ts` (~50 lines)
  - [ ] TypeScript types
  - [ ] Interfaces
  - [ ] Result types

**Estimated Time:** 12 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Decompose Analytics Service

**Current:** `apps/native/services/analyticsService.ts` (787 lines)

- [ ] Create `apps/native/services/analytics/index.ts` (~80 lines)
  - [ ] Public tracking API
  - [ ] `trackEvent`, `trackScreen`, `setUserProperties`

- [ ] Create `apps/native/services/analytics/config.ts` (~150 lines)
  - [ ] PostHog configuration
  - [ ] Feature flags
  - [ ] Auto-capture settings

- [ ] Create `apps/native/services/analytics/consent.ts` (~100 lines)
  - [ ] GDPR consent management
  - [ ] Privacy controls
  - [ ] Data collection preferences

- [ ] Create `apps/native/services/analytics/tracking.ts` (~200 lines)
  - [ ] Event definitions
  - [ ] Tracking implementations
  - [ ] Custom properties

- [ ] Create `apps/native/services/analytics/types.ts` (~60 lines)
  - [ ] Event types
  - [ ] Configuration types
  - [ ] Property definitions

**Estimated Time:** 10 hours  
**Priority:** 🔴 CRITICAL

---

### Task: Clarify Convex Sync Service

**Current:** `apps/native/services/convexSyncService.ts` (unclear responsibility)

- [ ] Create `apps/native/services/sync/index.ts` (~100 lines)
  - [ ] Public sync API
  - [ ] `startSync`, `stopSync`, `syncStatus`

- [ ] Create `apps/native/services/sync/strategies/optimistic.ts` (~150 lines)
  - [ ] Optimistic update strategy
  - [ ] Rollback logic
  - [ ] Conflict handling

- [ ] Create `apps/native/services/sync/strategies/conservative.ts` (~120 lines)
  - [ ] Conservative sync strategy
  - [ ] Safe merge logic
  - [ ] User confirmation

- [ ] Create `apps/native/services/sync/strategies/conflictResolution.ts` (~100 lines)
  - [ ] Conflict detection
  - [ ] Resolution algorithms
  - [ ] User prompts

- [ ] Create hook: `apps/native/hooks/useSyncStatus.ts` (~80 lines)
  - [ ] UI hook for sync state
  - [ ] Returns: `isSyncing`, `error`, `lastSyncTime`

**Estimated Time:** 10 hours  
**Priority:** 🟠 HIGH

---

### Task: Decompose Other Native Services

- [ ] `gestureService.ts` - Create modular `gesture/` directory
  - [ ] `index.ts` - Public API
  - [ ] `queries.ts` - Read operations
  - [ ] `mutations.ts` - Write operations
  - [ ] `search.ts` - Search logic

- [ ] `offlineFavoritesService.ts` - Refactor if >200 lines
  - [ ] Ensure single responsibility
  - [ ] Add error handling

**Estimated Time:** 6 hours  
**Priority:** 🟠 HIGH

---

### Native Services Decomposition Summary

| Service | Before | After | Modules |
|---------|--------|-------|---------|
| Database | 707 | 800 (modular) | 6 files |
| Analytics | 787 | 600 (modular) | 5 files |
| Sync | unknown | 550 (modular) | 5 files |
| Gesture | unknown | modular | 4 files |
| Favorites | unknown | focused | 1-2 files |

**Time:** 38 hours | **Priority:** 🔴 CRITICAL

---

## 2.4 UI Component Simplification

### Task: Decompose VideoPlayer Component

**Current:** `apps/native/components/VideoPlayer.tsx` (334 lines)

- [ ] Create `apps/native/components/video/VideoPlayer.tsx` (~50 lines)
  - [ ] Wrapper component
  - [ ] Composition of sub-components

- [ ] Create `apps/native/components/video/VideoPlayerContent.tsx` (~120 lines)
  - [ ] UI-only rendering
  - [ ] No logic, only props

- [ ] Create `apps/native/components/video/hooks/useVideoPlayer.ts` (~80 lines)
  - [ ] Playback logic
  - [ ] State management

- [ ] Create `apps/native/components/video/hooks/useVideoAnalytics.ts` (~60 lines)
  - [ ] Analytics tracking
  - [ ] Event handling

- [ ] Create `apps/native/components/video/hooks/useVideoState.ts` (~40 lines)
  - [ ] Play/pause state
  - [ ] Progress tracking

**Estimated Time:** 6 hours  
**Priority:** 🟠 HIGH

---

### Task: Decompose GestureCard Component

**Current:** `apps/native/components/GestureCard.tsx` (300+ lines)

- [ ] Create `apps/native/components/gesture/GestureCard.tsx` (~60 lines)
  - [ ] Wrapper component
  - [ ] Composition

- [ ] Create `apps/native/components/gesture/GestureCardContent.tsx` (~100 lines)
  - [ ] UI rendering
  - [ ] Layout

- [ ] Create `apps/native/components/gesture/hooks/useGestureNavigation.ts` (~50 lines)
  - [ ] Navigation logic
  - [ ] Route handling

- [ ] Create `apps/native/components/gesture/hooks/useGestureOptimization.ts` (~60 lines)
  - [ ] Memoization
  - [ ] Performance tuning

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

### Task: Decompose GDPRConsentModal

**Current:** `apps/native/components/GDPRConsentModal.tsx` (370 lines)

- [ ] Create `apps/native/components/gdpr/GDPRConsentModal.tsx` (~80 lines)
  - [ ] Modal wrapper

- [ ] Create `apps/native/components/gdpr/GDPRConsentContent.tsx` (~150 lines)
  - [ ] Modal content UI

- [ ] Create `apps/native/components/gdpr/hooks/useGDPRConsent.ts` (~100 lines)
  - [ ] Consent logic
  - [ ] Local storage

- [ ] Create `apps/native/components/gdpr/hooks/useGDPRi18n.ts` (~50 lines)
  - [ ] i18n logic
  - [ ] Translation handling

**Estimated Time:** 5 hours  
**Priority:** 🟠 HIGH

---

### Task: Decompose DisclaimerBanner

**Current:** `apps/native/components/DisclaimerBanner.tsx` (275 lines)

- [ ] Create `apps/native/components/disclaimer/DisclaimerBanner.tsx` (~60 lines)
  - [ ] Wrapper component

- [ ] Create `apps/native/components/disclaimer/DisclaimerContent.tsx` (~100 lines)
  - [ ] Banner UI

- [ ] Create `apps/native/components/disclaimer/hooks/useDisclaimerState.ts` (~80 lines)
  - [ ] State management
  - [ ] Dismissal logic

**Estimated Time:** 3 hours  
**Priority:** 🟠 MEDIUM

---

### UI Component Simplification Summary

| Component | Before | After | Modules | Status |
|-----------|--------|-------|---------|--------|
| VideoPlayer | 334 | 50 | 5 files | ⬜ |
| GestureCard | 300+ | 60 | 4 files | ⬜ |
| GDPRModal | 370 | 80 | 4 files | ⬜ |
| DisclaimerBanner | 275 | 60 | 3 files | ⬜ |

**Time:** 18 hours | **Priority:** 🟠 HIGH

---

## 2.5 Backend Refactoring

### Task: Organize Convex Functions

**Current:** `packages/convex/convex/sponsorships.ts` (971 lines)

- [ ] Extract validation logic to `packages/convex/convex/lib/sponsorshipValidation.ts`
  - [ ] Move: `checkExistingSponsorship` (currently lines 24-55)
  - [ ] Move: Status validation (lines 94-160)
  - [ ] Create reusable validation functions

- [ ] Extract date calculations to `packages/convex/convex/lib/sponsorshipDates.ts`
  - [ ] Move: Date math (line 58 and others)
  - [ ] Create: `calculateEndDate`, `formatDateRange`
  - [ ] Pure functions, fully testable

- [ ] Extract status transitions to `packages/convex/convex/lib/sponsorshipStatus.ts`
  - [ ] Define: Valid status transitions
  - [ ] Implement: State machine for status
  - [ ] Validate: Status changes

- [ ] Extract bulk operations to `packages/convex/convex/lib/sponsorshipBulk.ts`
  - [ ] Move: Bulk creation logic
  - [ ] Move: Bulk updates
  - [ ] Error handling per item

**Estimated Time:** 8 hours  
**Priority:** 🟠 HIGH

---

### Task: Extract API Error Codes

- [ ] Create `packages/api/src/errors.ts`
  - [ ] Define: Error codes (400, 401, 403, 404, 422, 500, etc.)
  - [ ] Document: What each error means
  - [ ] Provide: Recovery suggestions
  - [ ] Example: `SPONSORSHIP_INVALID`, `USER_NOT_FOUND`, `NETWORK_ERROR`

- [ ] Create `packages/api/src/routers/[route].errors.ts` for each router
  - [ ] Document: Router-specific errors
  - [ ] Status codes: For each operation

**Estimated Time:** 4 hours  
**Priority:** 🟠 HIGH

---

## Phase 2 Summary

| Component | Time | Priority | Status |
|-----------|------|----------|--------|
| Sponsors Route | 26 hrs | 🔴 CRITICAL | ⬜ |
| Admin Dashboard | 30 hrs | 🔴 CRITICAL | ⬜ |
| Native Services | 38 hrs | 🔴 CRITICAL | ⬜ |
| UI Components | 18 hrs | 🟠 HIGH | ⬜ |
| Backend | 12 hrs | 🟠 HIGH | ⬜ |
| **PHASE 2 TOTAL** | **124 hrs** | | |

---

# PHASE 3: Documentation & Clarity

**Duration:** Week 3-4 (32 hours)  
**Goal:** Make codebase self-documenting and easy to understand  
**Status:** 🔴 Not Started

## 3.1 Architecture Documentation

- [ ] Create `docs/ARCHITECTURE.md`
  - [ ] System design diagram (ASCII or SVG)
  - [ ] Component hierarchy
  - [ ] Data flow overview
  - [ ] Service interactions

- [ ] Create `docs/DATA_FLOW.md`
  - [ ] User data journey
  - [ ] Gesture data lifecycle
  - [ ] Sponsorship flow
  - [ ] Real-time sync strategy

- [ ] Create `docs/SYNC_STRATEGY.md`
  - [ ] Offline-first architecture
  - [ ] Convex ↔ local sync
  - [ ] Conflict resolution
  - [ ] Sync error recovery

- [ ] Create `docs/ERROR_HANDLING.md`
  - [ ] Error types and codes
  - [ ] How to debug errors
  - [ ] Recovery strategies
  - [ ] User-facing error messages

- [ ] Create `docs/PAYMENT_FLOW.md`
  - [ ] Mollie integration
  - [ ] Sponsorship purchase flow
  - [ ] Webhook handling
  - [ ] Refund process

**Estimated Time:** 8 hours  
**Priority:** 🟠 HIGH

---

## 3.2 Service Documentation

Add comprehensive JSDoc + file-level docs to:

- [ ] `apps/native/services/database/index.ts`
  ```typescript
  /**
   * @fileoverview SQLite database management with Convex sync
   * 
   * This service provides the primary data access layer for the mobile app,
   * implementing an offline-first architecture where:
   * 1. All data is stored locally in SQLite
   * 2. Operations complete immediately (optimistic updates)
   * 3. Changes sync to Convex when network available
   * 4. Conflicts resolved with last-write-wins strategy
   * 
   * @architecture
   * ```
   * Component → useGestures() → gestureService → database
   *                          ↓
   *                      convexSync (background)
   *                          ↓
   *                       Convex
   * ```
   * 
   * @example
   * const gesture = await database.getGesture('gesture-123');
   * 
   * @errors
   * - DatabaseError: If database operations fail
   * - SyncError: If sync with Convex fails (queued for later)
   */
  ```

- [ ] `apps/native/services/analytics/index.ts`
- [ ] `apps/native/services/sync/index.ts`
- [ ] `packages/api/src/routers/gestures.ts`
- [ ] `packages/api/src/routers/sponsorships.ts`
- [ ] `packages/api/src/routers/admin.ts`
- [ ] All context files in `apps/native/context/`
- [ ] All hook files in `packages/hooks/`

**Estimated Time:** 8 hours  
**Priority:** 🟠 HIGH

---

## 3.3 Component Documentation

For all shared UI components:

- [ ] Create component documentation template
  ```typescript
  /**
   * Component: GestureCard
   * 
   * Displays a gesture with video preview, title, and category info.
   * 
   * @props
   * - gesture: Gesture data with video URL
   * - onSelect?: Called when user selects gesture
   * - isSelected?: Visual indicator of selection
   * - size?: 'small' | 'medium' | 'large'
   * 
   * @example
   * <GestureCard
   *   gesture={gesture}
   *   onSelect={() => handleSelect(gesture.id)}
   *   isSelected={selectedIds.includes(gesture.id)}
   * />
   * 
   * @a11y
   * - Has proper ARIA labels
   * - Keyboard accessible
   * - Screen reader friendly
   */
  ```

- [ ] Document all UI components in `packages/ui/`
  - [ ] GestureCard.tsx
  - [ ] GestureDetail.tsx
  - [ ] SponsorshipForm.tsx
  - [ ] All Radix UI wrappers

- [ ] Document all native components
  - [ ] VideoPlayer
  - [ ] GestureCard
  - [ ] GDPRModal
  - [ ] DisclaimerBanner

**Estimated Time:** 8 hours  
**Priority:** 🟠 HIGH

---

## 3.4 Hook Documentation

Document all custom hooks with:

- [ ] Purpose and responsibility
- [ ] Parameters with types
- [ ] Return values with descriptions
- [ ] Usage examples
- [ ] Common pitfalls
- [ ] Performance notes

- [ ] Document all hooks in `packages/hooks/`
- [ ] Document all hooks in component directories

**Estimated Time:** 4 hours  
**Priority:** 🟠 MEDIUM

---

## 3.5 API Documentation

For each API router:

- [ ] Document endpoints with JSDoc
  ```typescript
  /**
   * Get a single gesture by ID
   * 
   * @procedure gestures.get
   * @method GET /api/gestures/:id
   * 
   * @params
   * - id: string - Gesture ID
   * 
   * @returns
   * - id: string
   * - title: string
   * - videoUrl: string
   * - category: { id: string; name: string }
   * 
   * @errors
   * - 404: Gesture not found
   * - 500: Database error
   * 
   * @example
   * const gesture = await api.gestures.get({ id: 'gesture-123' });
   */
  ```

- [ ] Create `packages/api/docs/ENDPOINTS.md`
  - [ ] List all endpoints
  - [ ] Request/response examples
  - [ ] Error codes reference

- [ ] Document each router file:
  - [ ] `packages/api/src/routers/gestures.ts`
  - [ ] `packages/api/src/routers/sponsorships.ts`
  - [ ] `packages/api/src/routers/admin.ts`
  - [ ] `packages/api/src/routers/users.ts`
  - [ ] `packages/api/src/routers/favorites.ts`

**Estimated Time:** 6 hours  
**Priority:** 🟠 HIGH

---

## 3.6 Database Schema Documentation

- [ ] Create `docs/DATABASE.md`
  - [ ] Table relationships diagram
  - [ ] Field descriptions for each table
  - [ ] Constraints and validations
  - [ ] Indexes and their purpose
  - [ ] Sync strategy for each table

- [ ] Document schema files in Convex
  - [ ] Add JSDoc to `packages/convex/convex/schema.ts`
  - [ ] Document each table definition
  - [ ] Explain field types and validations

**Estimated Time:** 4 hours  
**Priority:** 🟡 MEDIUM

---

## Phase 3 Summary

| Task | Time | Priority | Status |
|------|------|----------|--------|
| Architecture Docs | 8 hrs | 🟠 HIGH | ⬜ |
| Service Docs | 8 hrs | 🟠 HIGH | ⬜ |
| Component Docs | 8 hrs | 🟠 HIGH | ⬜ |
| Hook Docs | 4 hrs | 🟠 MEDIUM | ⬜ |
| API Docs | 6 hrs | 🟠 HIGH | ⬜ |
| DB Docs | 4 hrs | 🟡 MEDIUM | ⬜ |
| **PHASE 3 TOTAL** | **38 hrs** | | |

---

# PHASE 4: Optimization & Refinement

**Duration:** Week 4+ (36 hours)  
**Goal:** Improve performance and add testing  
**Status:** 🔴 Not Started

## 4.1 Performance Optimization

### Task: React Component Optimization (Web)

- [ ] Profile with React DevTools
  - [ ] Identify unnecessary re-renders
  - [ ] Check component render times
  - [ ] Look for wasted renders

- [ ] Optimize gesture list rendering
  - [ ] Add `useMemo` for filtered lists
  - [ ] Add `useCallback` for handlers
  - [ ] Consider virtualization for large lists

- [ ] Optimize admin dashboard
  - [ ] Lazy-load admin sections
  - [ ] Memoize DataTable rows
  - [ ] Debounce search input

- [ ] Optimize sponsors wizard
  - [ ] Memoize form validation
  - [ ] Lazy-load preview step
  - [ ] Cache gesture selections

**Estimated Time:** 12 hours  
**Priority:** 🟠 MEDIUM

---

### Task: Native Performance Optimization

- [ ] Profile with Expo DevTools
  - [ ] JavaScript thread performance
  - [ ] Native thread usage
  - [ ] Memory consumption

- [ ] Optimize gesture list rendering
  - [ ] Add FlatList virtualization
  - [ ] Memoize gesture items
  - [ ] Optimize video thumbnail loading

- [ ] Optimize video player
  - [ ] Lazy-load video sources
  - [ ] Cache video metadata
  - [ ] Optimize seek operations

- [ ] Database query optimization
  - [ ] Index frequently-queried columns
  - [ ] Batch operations where possible
  - [ ] Profile query times

**Estimated Time:** 12 hours  
**Priority:** 🟠 MEDIUM

---

### Task: Network Optimization

- [ ] Implement request caching
  - [ ] Cache API responses with TanStack Query
  - [ ] Set appropriate cache durations
  - [ ] Implement stale-while-revalidate pattern

- [ ] Optimize payload sizes
  - [ ] Analyze API response sizes
  - [ ] Remove unnecessary fields
  - [ ] Compress large responses

- [ ] Implement request batching
  - [ ] Combine multiple requests into single call
  - [ ] Batch Convex operations

**Estimated Time:** 6 hours  
**Priority:** 🟠 MEDIUM

---

## 4.2 Complex Algorithm Documentation

### Task: Document Gesture Search Ranking

**File:** `packages/hooks/src/gestureSearchRanking.ts` (393 lines)

- [ ] Create `docs/SEARCH_RANKING.md`
  - [ ] Algorithm explanation with examples
  - [ ] Scoring formula documentation
  - [ ] Weight explanation and tuning guide
  - [ ] Performance characteristics

- [ ] Extract weight constants to config
  - [ ] Create `packages/config/src/searchWeights.ts`
  - [ ] Document why each weight has that value
  - [ ] Make weights configurable

- [ ] Add test cases showing scoring
  - [ ] Example queries and expected rankings
  - [ ] Edge cases and how they're handled
  - [ ] Performance test cases

- [ ] Create visualization tool (optional)
  - [ ] Show how search query scores different gestures
  - [ ] Debug tool for tuning weights

**Estimated Time:** 8 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Document Sponsorship Logic

**File:** `packages/convex/convex/sponsorships.ts` (971 lines)

- [ ] Create `docs/SPONSORSHIPS.md`
  - [ ] Business rules explanation
  - [ ] Status transition state machine diagram
  - [ ] Edge cases and how they're handled
  - [ ] Payment flow integration

- [ ] Extract helper modules from sponsorships.ts
  - [ ] `lib/sponsorshipValidation.ts` (already planned in Phase 2)
  - [ ] `lib/sponsorshipDates.ts` (already planned in Phase 2)
  - [ ] `lib/sponsorshipStatus.ts` (already planned in Phase 2)

- [ ] Add decision tree documentation
  - [ ] When sponsorship status changes
  - [ ] What emails are sent
  - [ ] What webhooks fire

- [ ] Add unit tests for business logic
  - [ ] Each validation rule has test case
  - [ ] Each status transition tested
  - [ ] Edge cases tested

**Estimated Time:** 8 hours  
**Priority:** 🟡 MEDIUM

---

## 4.3 Testing Infrastructure

### Task: Create Test Utilities

- [ ] Create `packages/testing/src/factories.ts`
  - [ ] `createGesture()` - Factory for gesture test data
  - [ ] `createUser()` - Factory for user test data
  - [ ] `createSponsorship()` - Factory for sponsorship test data
  - [ ] `createCategory()` - Factory for category test data
  - [ ] Randomized values for each factory

- [ ] Create `packages/testing/src/mocks/convex.ts`
  - [ ] Mock ConvexProvider
  - [ ] Mock Convex hooks
  - [ ] Test data providers

- [ ] Create `packages/testing/src/mocks/analytics.ts`
  - [ ] Mock analytics service
  - [ ] Track event calls in tests
  - [ ] Assert analytics calls

- [ ] Create `packages/testing/src/mocks/network.ts`
  - [ ] Mock API responses
  - [ ] Mock network errors
  - [ ] Mock slow networks

**Estimated Time:** 8 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Add Critical Test Cases

- [ ] Service tests (80% coverage target)
  - [ ] Database operations: CRUD, queries, migrations
  - [ ] Analytics: Event tracking, consent
  - [ ] Sync: Conflict resolution, offline handling

- [ ] Hook tests (75% coverage target)
  - [ ] useSponsorshipForm: Validation, state changes
  - [ ] useAdminTable: Pagination, sorting, filtering
  - [ ] useGestureSelection: Selection logic

- [ ] Component tests (50% coverage target)
  - [ ] SponsorshipWizard: Navigation, validation
  - [ ] DataTable: Rendering, interactions
  - [ ] VideoPlayer: Playback controls

- [ ] API tests (60% coverage target)
  - [ ] Endpoint validation (Zod schemas work)
  - [ ] Error codes (correct codes returned)
  - [ ] Authorization (proper auth checks)

**Estimated Time:** 12 hours  
**Priority:** 🟡 MEDIUM

---

## Phase 4 Summary

| Task | Time | Priority | Status |
|------|------|----------|--------|
| React Optimization | 12 hrs | 🟠 MEDIUM | ⬜ |
| Native Optimization | 12 hrs | 🟠 MEDIUM | ⬜ |
| Network Optimization | 6 hrs | 🟠 MEDIUM | ⬜ |
| Algorithm Docs | 8 hrs | 🟡 MEDIUM | ⬜ |
| Business Logic Docs | 8 hrs | 🟡 MEDIUM | ⬜ |
| Test Utilities | 8 hrs | 🟡 MEDIUM | ⬜ |
| Test Cases | 12 hrs | 🟡 MEDIUM | ⬜ |
| **PHASE 4 TOTAL** | **66 hrs** | | |

---

# PHASE 5: Polish & Tools

**Duration:** Final week (24 hours)  
**Goal:** Developer experience automation and final polish  
**Status:** 🔴 Not Started

## 5.1 Developer Experience

### Task: Create Setup & Onboarding Guides

- [ ] Create `docs/GETTING_STARTED.md`
  - [ ] Prerequisites
  - [ ] Installation steps
  - [ ] First-time setup
  - [ ] Running dev servers
  - [ ] Troubleshooting common issues

- [ ] Create `docs/IDE_SETUP.md`
  - [ ] VS Code extensions recommended
  - [ ] Settings and launch configs
  - [ ] Debugging setup for each app
  - [ ] Useful shortcuts and commands

- [ ] Create `docs/COMMON_TASKS.md`
  - [ ] How to add a new gesture
  - [ ] How to add a new API endpoint
  - [ ] How to add new admin feature
  - [ ] How to debug sync issues
  - [ ] How to add new gesture category
  - [ ] How to run migrations
  - [ ] How to test payment flow

- [ ] Create `docs/TROUBLESHOOTING.md`
  - [ ] Common errors and solutions
  - [ ] Performance debugging guide
  - [ ] Mobile build issues
  - [ ] Network debugging
  - [ ] Database issues
  - [ ] Sync conflicts

**Estimated Time:** 8 hours  
**Priority:** 🟢 HIGH

---

### Task: Create Type System Guide

- [ ] Create `docs/TYPES.md`
  - [ ] Type hierarchy diagram
  - [ ] Naming conventions
  - [ ] Nominal types (IDs) vs structural types
  - [ ] When to use `interface` vs `type`
  - [ ] Common type patterns
  - [ ] How to add new types

**Estimated Time:** 3 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Create Code Style Guide

- [ ] Create `docs/CODE_STYLE.md`
  - [ ] Component composition patterns
  - [ ] Hook composition patterns
  - [ ] Service/utility patterns
  - [ ] Naming conventions (components, hooks, services, constants)
  - [ ] Error handling patterns
  - [ ] Async/await patterns
  - [ ] Testing patterns

- [ ] Create code examples for each pattern
  - [ ] Good: Well-structured component
  - [ ] Bad: Anti-patterns to avoid
  - [ ] Explanation: Why the good way is better

**Estimated Time:** 4 hours  
**Priority:** 🟡 MEDIUM

---

## 5.2 Code Quality Automation

### Task: Pre-commit Hooks

- [ ] Install and configure `husky`
  ```bash
  npm install -D husky
  npx husky install
  ```

- [ ] Create pre-commit hook to:
  - [ ] Prevent console.log in production code
  - [ ] Ensure JSDoc on public functions
  - [ ] Check for TODO comments that should be issues
  - [ ] Run linter (bun check)
  - [ ] Run type checker (bun check-types)

- [ ] Create pre-push hook to:
  - [ ] Run test suite
  - [ ] Check code coverage
  - [ ] Verify no lingering debug code

**Estimated Time:** 3 hours  
**Priority:** 🟢 HIGH

---

### Task: CI/CD Improvements

- [ ] Update GitHub Actions workflow
  - [ ] Add type checking step
  - [ ] Add unused exports detection
  - [ ] Add dependency analysis
  - [ ] Add bundle size tracking
  - [ ] Store metrics over time

- [ ] Create Dependabot configuration
  - [ ] Automated dependency updates
  - [ ] Security vulnerability checks

**Estimated Time:** 3 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Linting & Code Quality Rules

- [ ] Update `biome.json`
  - [ ] Add rule preventing console.log in production
  - [ ] Add rule for JSDoc on public exports
  - [ ] Add rule for no empty blocks
  - [ ] Add rule for no unused imports
  - [ ] Add rule for consistent naming conventions

- [ ] Create custom ESLint plugin (if needed)
  - [ ] Detect duplicate type definitions
  - [ ] Detect common mistakes
  - [ ] Enforce code patterns

**Estimated Time:** 2 hours  
**Priority:** 🟡 MEDIUM

---

## 5.3 Developer Tools

### Task: Create Local Development CLI

- [ ] Create `scripts/dev-cli.js` with commands:
  - [ ] `bun dev:fresh` - Clean install + run all dev servers
  - [ ] `bun dev:reset-db` - Reset mobile DB to factory settings
  - [ ] `bun dev:seed` - Add test data to database
  - [ ] `bun dev:logs` - View logs from all services
  - [ ] `bun dev:debug` - Start debug session
  - [ ] `bun dev:test-sync` - Test sync functionality

**Estimated Time:** 4 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Create Debugging Tools

- [ ] Create `scripts/debug-sync.ts`
  - [ ] Show current sync state
  - [ ] Display queued operations
  - [ ] Show last sync time
  - [ ] Trigger manual sync

- [ ] Create `scripts/debug-analytics.ts`
  - [ ] Show tracked events
  - [ ] Show user properties
  - [ ] Test event tracking

- [ ] Create `scripts/debug-db.ts`
  - [ ] Inspect local database
  - [ ] Run migrations
  - [ ] Export/import data

**Estimated Time:** 4 hours  
**Priority:** 🟡 MEDIUM

---

## 5.4 Documentation Polish

### Task: Create README Updates

- [ ] Update root `README.md`
  - [ ] Link to all documentation
  - [ ] Quick start guide
  - [ ] Technology stack overview
  - [ ] Contribution guidelines

- [ ] Create `docs/README.md`
  - [ ] Documentation index
  - [ ] Guides by topic
  - [ ] Architecture overview
  - [ ] Common questions

**Estimated Time:** 2 hours  
**Priority:** 🟡 MEDIUM

---

### Task: Create Migration Guide

- [ ] Create `docs/MIGRATION.md`
  - [ ] How refactored code differs from old
  - [ ] What imports changed
  - [ ] How to update old code to use new structure
  - [ ] Deprecation timeline

**Estimated Time:** 2 hours  
**Priority:** 🟡 MEDIUM

---

## Phase 5 Summary

| Task | Time | Priority | Status |
|------|------|----------|--------|
| Onboarding Guides | 8 hrs | 🟢 HIGH | ⬜ |
| Type & Style Guides | 7 hrs | 🟡 MEDIUM | ⬜ |
| Pre-commit Hooks | 3 hrs | 🟢 HIGH | ⬜ |
| CI/CD Improvements | 3 hrs | 🟡 MEDIUM | ⬜ |
| Linting Rules | 2 hrs | 🟡 MEDIUM | ⬜ |
| Developer Tools | 8 hrs | 🟡 MEDIUM | ⬜ |
| Documentation Polish | 4 hrs | 🟡 MEDIUM | ⬜ |
| **PHASE 5 TOTAL** | **35 hrs** | | |

---

# 📊 Metrics & Success Criteria

## Quantitative Metrics

- [ ] **Code Health**
  - [ ] No files >300 lines (except auto-generated)
  - [ ] 0 `any` types in production code
  - [ ] 100% of public functions have JSDoc
  - [ ] <5% code duplication (measured with tools)
  - [ ] 0 circular dependencies

- [ ] **Test Coverage**
  - [ ] Services: 80%+
  - [ ] Hooks: 75%+
  - [ ] Utils: 90%+
  - [ ] Components: 50%+

- [ ] **Documentation**
  - [ ] 100% of services documented
  - [ ] 100% of public APIs documented
  - [ ] 100% of complex algorithms documented
  - [ ] All setup guides complete

- [ ] **Performance**
  - [ ] Web: Lighthouse score 85+
  - [ ] Mobile: Frame rate stable 60fps
  - [ ] API: P95 response time <500ms
  - [ ] Database: Q95 query time <100ms

---

## Qualitative Metrics

- [ ] **Developer Experience**
  - [ ] New developer can start in <2 hours
  - [ ] Common tasks take <15 minutes with docs
  - [ ] Debugging is straightforward
  - [ ] Error messages are clear and actionable

- [ ] **Codebase Clarity**
  - [ ] File purposes are obvious from names
  - [ ] Component responsibilities are clear
  - [ ] Data flow is easy to trace
  - [ ] State management is explicit

- [ ] **Maintainability**
  - [ ] Bug fixes don't require multiple file changes
  - [ ] New features can be added without refactoring
  - [ ] Refactoring is low-risk
  - [ ] Type system catches errors early

---

## Validation Checklist

Before declaring refactoring complete:

- [ ] All tests pass (`bun test`)
- [ ] All type checks pass (`bun check-types`)
- [ ] All linting passes (`bun check`)
- [ ] All apps build successfully (`bun build`)
- [ ] No console warnings or errors
- [ ] No TypeScript errors
- [ ] No Biome violations
- [ ] No unused imports
- [ ] No dead code
- [ ] All documentation links work
- [ ] Code examples in docs are accurate
- [ ] New developers can follow onboarding guide

---

# 📈 Overall Timeline

| Phase | Duration | Focus | Status |
|-------|----------|-------|--------|
| **Phase 1** | Week 1-2 | Foundation & Critical Fixes | ⬜ |
| **Phase 2** | Week 2-3 | Module Decomposition | ⬜ |
| **Phase 3** | Week 3-4 | Documentation & Clarity | ⬜ |
| **Phase 4** | Week 4+ | Optimization & Testing | ⬜ |
| **Phase 5** | Final week | Polish & Tools | ⬜ |
| **TOTAL** | 3-4 weeks | ~280 hours | ⬜ |

---

# 🎯 Getting Started

## Week 1 Action Items

1. **Day 1-2: Foundation**
   - [ ] Set up type system (`@smog/types`)
   - [ ] Create logging service
   - [ ] Create error handler

2. **Day 3-4: Critical Cleanup**
   - [ ] Remove console logs
   - [ ] Add JSDoc to services
   - [ ] Extract constants

3. **Day 5: Validation**
   - [ ] All tests pass
   - [ ] All types check
   - [ ] All linting passes

## Week 2 Action Items

1. **Day 1-2: Sponsors Route**
   - [ ] Extract wizard component
   - [ ] Extract gesture selector
   - [ ] Extract preview component

2. **Day 3-4: Admin Dashboard**
   - [ ] Create DataTable component
   - [ ] Extract filter/sort hooks
   - [ ] Refactor management page

3. **Day 5: Validation**
   - [ ] All tests pass
   - [ ] Manual testing complete
   - [ ] Code review

---

# 🚀 Ready to Begin!

This roadmap is your guide to DX heaven. Follow the phases sequentially, check off items as you go, and use the priority levels to guide your focus.

**Remember:**
- Small commits, frequent testing
- Validate frequently (tests, linting, types)
- Document as you go
- Ask for review on big changes

Let's build the best codebase! 🎉

