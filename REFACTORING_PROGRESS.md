# 🎯 Refactoring Progress Tracker

**Start Date:** March 18, 2026  
**Target Completion:** April 8, 2026 (3-4 weeks)  
**Current Status:** 🔴 Not Started

---

## Overall Progress

```
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%

Phase 1: ████░░░░░░░░░░░░░░░░░  0/26 hours
Phase 2: ██░░░░░░░░░░░░░░░░░░░  0/124 hours
Phase 3: ░░░░░░░░░░░░░░░░░░░░░░  0/38 hours
Phase 4: ░░░░░░░░░░░░░░░░░░░░░░  0/66 hours
Phase 5: ░░░░░░░░░░░░░░░░░░░░░░  0/35 hours
```

**Total:** 0/289 hours completed

---

# PHASE 1: Foundation & Critical Fixes

**Timeline:** Week 1-2  
**Estimated Hours:** 26  
**Status:** 🔴 Not Started

## 1.1 Type Safety & Import Organization

### Create Unified Type System
- [ ] Create `packages/types/src/` directory structure
  - [ ] Create `packages/types/src/index.ts`
  - [ ] Create `packages/types/src/admin.ts`
  - [ ] Create `packages/types/src/sponsorships.ts`
  - [ ] Create `packages/types/src/gestures.ts`
  - [ ] Create `packages/types/src/users.ts`
  - [ ] Create `packages/types/src/api.ts`
  - [ ] Create `packages/types/src/database.ts`

**Progress:** 0/7 subtasks

- [ ] Consolidate duplicate type definitions
  - [ ] Extract `Sponsorship` interface from `SponsorshipsManagement.tsx`
  - [ ] Extract `GestureCard` type from `GestureDetail.tsx`
  - [ ] Extract `AdminTableRow` type from `AdminTable.tsx`
  - [ ] Extract `SyncStatus` types from native services
  - [ ] Export all from `@smog/types`

**Progress:** 0/5 subtasks

- [ ] Fix type safety issues
  - [ ] Remove `// biome-ignore lint/suspicious/noExplicitAny` from sponsorships.ts
  - [ ] Replace `as never` casts in gestures.ts with proper nominal type
  - [ ] Create `ConvexId<T>` nominal type
  - [ ] Update all ID references

**Progress:** 0/4 subtasks

- [ ] Update imports across codebase
  - [ ] Update `apps/web/src/components/admin/` imports
  - [ ] Update `apps/web/src/routes/sponsors/` imports
  - [ ] Update `packages/ui/` imports
  - [ ] Update `packages/api/` imports
  - [ ] Remove inline type definitions

**Progress:** 0/5 subtasks

**Task Status:** 🔴 Not Started (0/21 subtasks)

---

### Create Centralized Logging Service
- [ ] Create `packages/shared/src/logger.ts`
  - [ ] Implement log levels: DEBUG, INFO, WARN, ERROR
  - [ ] Implement consistent prefix format
  - [ ] Environment-based filtering
  - [ ] No logs in production:debug mode

**Progress:** 0/4 subtasks

- [ ] Create logger types
  - [ ] Create `packages/shared/src/types/logger.ts`
  - [ ] Define `LogLevel` enum
  - [ ] Define `LogEntry` interface
  - [ ] Define `LoggerConfig` interface

**Progress:** 0/4 subtasks

- [ ] Remove console.log statements
  - [ ] Remove from `apps/native/app/_layout.tsx` (4 calls)
  - [ ] Remove from `apps/native/app/auth-callback.tsx` (6 calls)
  - [ ] Remove from `apps/native/hooks/useOptimizedSearch.ts`
  - [ ] Search and remove all remaining `console.` calls

**Progress:** 0/4 subtasks

- [ ] Create Biome rule
  - [ ] Update `biome.json` to prevent console in production
  - [ ] Run `bun check` to validate
  - [ ] Add to CI/CD pipeline

**Progress:** 0/3 subtasks

**Task Status:** 🔴 Not Started (0/15 subtasks)

---

### Create Error Handler Utility
- [ ] Create `packages/shared/src/errorHandler.ts`
  - [ ] Create base `AppError` class
  - [ ] Implement `logError()` function
  - [ ] Implement `reportError()` for analytics
  - [ ] Create `createErrorBoundary()` utility

**Progress:** 0/4 subtasks

- [ ] Create error types
  - [ ] Create `packages/shared/src/types/errors.ts`
  - [ ] Define `ValidationError`
  - [ ] Define `SyncError`
  - [ ] Define `NetworkError`
  - [ ] Define `DatabaseError`
  - [ ] Define `ConvexError`

**Progress:** 0/6 subtasks

- [ ] Standardize error handling
  - [ ] Create `useErrorHandler()` hook
  - [ ] Create `withErrorBoundary()` HOC
  - [ ] Create `tryCatch()` utility
  - [ ] Update `apps/native/services/` error handling
  - [ ] Update `apps/native/context/` error handling
  - [ ] Update `apps/web/src/` error handling

**Progress:** 0/6 subtasks

- [ ] Add error boundary components
  - [ ] Create `packages/ui/src/ErrorBoundary.tsx`
  - [ ] Create `apps/native/components/ErrorBoundary.tsx`
  - [ ] Wrap app in error boundary

**Progress:** 0/3 subtasks

**Task Status:** 🔴 Not Started (0/19 subtasks)

---

### Centralize Config & Constants
- [ ] Create `packages/config/src/constants.ts`
  - [ ] Extract `VIDEO_COMPLETE_COUNT`
  - [ ] Extract gesture limits
  - [ ] Extract sponsorship pricing
  - [ ] Extract cache durations
  - [ ] Document each constant

**Progress:** 0/5 subtasks

- [ ] Create `packages/config/src/urls.ts`
  - [ ] Extract Mux domain
  - [ ] Extract API endpoints
  - [ ] Extract external service URLs
  - [ ] Extract CDN URLs
  - [ ] Use environment variables

**Progress:** 0/5 subtasks

- [ ] Create `packages/config/src/environment.ts`
  - [ ] Type-safe environment loader
  - [ ] Validation on startup
  - [ ] Required variables check
  - [ ] Fallback defaults

**Progress:** 0/4 subtasks

- [ ] Update files to use config
  - [ ] Update `GestureDetail.tsx`
  - [ ] Update `apps/web/src/` references
  - [ ] Update `apps/native/` references
  - [ ] Update `packages/api/src/` references

**Progress:** 0/4 subtasks

**Task Status:** 🔴 Not Started (0/18 subtasks)

---

## 1.2 Quick Cleanup Wins

### Remove Production Debug Code
- [ ] Remove `console.log` statements
  - [ ] Search and remove all `console.log` calls
  - [ ] Search and remove all `console.warn` calls
  - [ ] Verify no debug code remains

**Progress:** 0/3 subtasks

- [ ] Remove debugging code
  - [ ] Remove commented-out code blocks
  - [ ] Remove obsolete `// TODO` comments
  - [ ] Remove debug conditionals

**Progress:** 0/3 subtasks

- [ ] Add Biome linting rule
  - [ ] Update `biome.json`
  - [ ] Run `bun check`

**Progress:** 0/2 subtasks

**Task Status:** 🔴 Not Started (0/8 subtasks)

---

### Add JSDoc to Core Services
- [ ] `apps/native/services/databaseService.ts`
- [ ] `apps/native/services/convexSyncService.ts`
- [ ] `apps/native/services/analyticsService.ts`
- [ ] `apps/native/services/gestureService.ts`
- [ ] `apps/web/src/services/*`
- [ ] `packages/api/src/routers/*`

**Progress:** 0/6 services

**Task Status:** 🔴 Not Started (0/6 subtasks)

---

## Phase 1 Summary

| Task | Hours | Status | Notes |
|------|-------|--------|-------|
| Type System | 8 | ⬜ | Foundation |
| Error Handling | 8 | ⬜ | Critical |
| Config/Constants | 4 | ⬜ | Maintainability |
| JSDoc Cleanup | 4 | ⬜ | Documentation |
| Debug Code | 2 | ⬜ | Quick wins |
| **TOTAL** | **26** | ⬜ | |

---

# PHASE 2: Module Decomposition

**Timeline:** Week 2-3  
**Estimated Hours:** 124  
**Status:** 🔴 Not Started

## 2.1 Web App Sponsors Route Refactoring (1,494 → 5 files)

### Extract SponsorshipWizard Component
- [ ] Create `apps/web/src/routes/sponsors/components/SponsorshipWizard.tsx` (~250 lines)
- [ ] Create `apps/web/src/routes/sponsors/hooks/useSponsorshipForm.ts` (~150 lines)
- [ ] Extract form validation logic
- [ ] Update sponsors page to use wizard
- [ ] Test wizard component
- [ ] Code review

**Progress:** 0/6 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

### Extract GestureSelector Component
- [ ] Create `apps/web/src/routes/sponsors/components/GestureSelector.tsx` (~200 lines)
- [ ] Create `apps/web/src/routes/sponsors/hooks/useGestureSelection.ts` (~80 lines)
- [ ] Extract search/filter logic to utils
- [ ] Test selection logic
- [ ] Integrate with wizard
- [ ] Code review

**Progress:** 0/6 subtasks | **Estimated:** 6 hours | **Actual:** TBD

---

### Extract SponsorshipPreview Component
- [ ] Create `apps/web/src/routes/sponsors/components/SponsorshipPreview.tsx` (~150 lines)
- [ ] Create `apps/web/src/routes/sponsors/hooks/useVideoComposition.ts` (~120 lines)
- [ ] Create `apps/web/src/routes/sponsors/hooks/useSponsorshipMutation.ts` (~100 lines)
- [ ] Test preview modal
- [ ] Test video generation
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 6 hours | **Actual:** TBD

---

### Extract Validation & Utilities
- [ ] Create `apps/web/src/routes/sponsors/utils/validation.ts`
- [ ] Create `apps/web/src/routes/sponsors/utils/sponsorshipHelpers.ts`
- [ ] Create `apps/web/src/routes/sponsors/utils/dateHelpers.ts`
- [ ] Add unit tests for utilities
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 4 hours | **Actual:** TBD

---

### Create Main Sponsors Page
- [ ] Update `apps/web/src/routes/sponsors/index.tsx` (~100 lines)
- [ ] Remove all nested components
- [ ] Import new components and hooks
- [ ] Test page composition
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 2 hours | **Actual:** TBD

**Sponsors Route Total:** 0/26 subtasks | **26 hours**

---

## 2.2 Admin Dashboard Consolidation

### Create Generic DataTable Component
- [ ] Create `apps/web/src/components/admin/shared/DataTable.tsx` (~300 lines)
- [ ] Create `apps/web/src/components/admin/shared/DataTableColumn.ts` (~50 lines)
- [ ] Create `apps/web/src/components/admin/shared/DataTablePagination.tsx` (~80 lines)
- [ ] Create `apps/web/src/components/admin/shared/DataTableSearch.tsx` (~60 lines)
- [ ] Test DataTable component
- [ ] Code review

**Progress:** 0/6 subtasks | **Estimated:** 10 hours | **Actual:** TBD

---

### Create Admin Table Hooks
- [ ] Create `apps/web/src/components/admin/hooks/useAdminTable.ts` (~120 lines)
- [ ] Create `apps/web/src/components/admin/hooks/useAdminFilters.ts` (~100 lines)
- [ ] Create `apps/web/src/components/admin/hooks/useAdminMutations.ts` (~150 lines)
- [ ] Create `apps/web/src/components/admin/hooks/useAdminSorting.ts` (~80 lines)
- [ ] Test all hooks together
- [ ] Code review

**Progress:** 0/6 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

### Refactor SponsorshipsManagement
- [ ] Update `apps/web/src/components/admin/SponsorshipsManagement.tsx` (~150 lines)
- [ ] Create column definition file
- [ ] Create `SponsorshipsTable.tsx` wrapper
- [ ] Test admin page
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

### Update AdminTable and Types
- [ ] Update `apps/web/src/components/admin/AdminTable.tsx` (~200 lines)
- [ ] Create `apps/web/src/components/admin/types/index.ts`
- [ ] Test updated AdminTable
- [ ] Code review

**Progress:** 0/4 subtasks | **Estimated:** 4 hours | **Actual:** TBD

**Admin Dashboard Total:** 0/25 subtasks | **30 hours**

---

## 2.3 Native Services Decomposition

### Decompose Database Service
- [ ] Create `apps/native/services/database/index.ts` (~100 lines)
- [ ] Create `apps/native/services/database/schema.ts` (~150 lines)
- [ ] Create `apps/native/services/database/migrations.ts` (~200 lines)
- [ ] Create `apps/native/services/database/operations.ts` (~300 lines)
- [ ] Create `apps/native/services/database/sync.ts` (~100 lines)
- [ ] Create `apps/native/services/database/types.ts` (~50 lines)
- [ ] Update imports across app
- [ ] Test database operations
- [ ] Code review

**Progress:** 0/9 subtasks | **Estimated:** 12 hours | **Actual:** TBD

---

### Decompose Analytics Service
- [ ] Create `apps/native/services/analytics/index.ts` (~80 lines)
- [ ] Create `apps/native/services/analytics/config.ts` (~150 lines)
- [ ] Create `apps/native/services/analytics/consent.ts` (~100 lines)
- [ ] Create `apps/native/services/analytics/tracking.ts` (~200 lines)
- [ ] Create `apps/native/services/analytics/types.ts` (~60 lines)
- [ ] Update imports across app
- [ ] Test analytics tracking
- [ ] Code review

**Progress:** 0/8 subtasks | **Estimated:** 10 hours | **Actual:** TBD

---

### Clarify Convex Sync Service
- [ ] Create `apps/native/services/sync/index.ts` (~100 lines)
- [ ] Create `apps/native/services/sync/strategies/optimistic.ts` (~150 lines)
- [ ] Create `apps/native/services/sync/strategies/conservative.ts` (~120 lines)
- [ ] Create `apps/native/services/sync/strategies/conflictResolution.ts` (~100 lines)
- [ ] Create `apps/native/hooks/useSyncStatus.ts` (~80 lines)
- [ ] Test sync strategies
- [ ] Code review

**Progress:** 0/7 subtasks | **Estimated:** 10 hours | **Actual:** TBD

---

### Decompose Other Services
- [ ] Refactor `gestureService.ts` into modular structure
- [ ] Refactor `offlineFavoritesService.ts` if needed
- [ ] Update imports
- [ ] Test services
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 6 hours | **Actual:** TBD

**Native Services Total:** 0/29 subtasks | **38 hours**

---

## 2.4 UI Component Simplification

### Decompose VideoPlayer, GestureCard, GDPRModal, DisclaimerBanner
- [ ] Decompose VideoPlayer (334 → 50 lines + 5 files)
- [ ] Decompose GestureCard (300+ → 60 lines + 4 files)
- [ ] Decompose GDPRConsentModal (370 → 80 lines + 4 files)
- [ ] Decompose DisclaimerBanner (275 → 60 lines + 3 files)
- [ ] Test all components
- [ ] Update imports
- [ ] Code review

**Progress:** 0/18 subtasks | **Estimated:** 18 hours | **Actual:** TBD

---

## 2.5 Backend Refactoring

### Organize Convex Functions
- [ ] Extract validation logic to modules
- [ ] Extract date calculations to modules
- [ ] Extract status transitions to modules
- [ ] Extract bulk operations to modules
- [ ] Test sponsorship logic
- [ ] Code review

**Progress:** 0/6 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

### Extract API Error Codes
- [ ] Create `packages/api/src/errors.ts`
- [ ] Create router-specific error files
- [ ] Update error handling across routers
- [ ] Test error responses
- [ ] Code review

**Progress:** 0/5 subtasks | **Estimated:** 4 hours | **Actual:** TBD

**Backend Total:** 0/11 subtasks | **12 hours**

---

## Phase 2 Summary

| Component | Hours | Status | Notes |
|-----------|-------|--------|-------|
| Sponsors Route | 26 | ⬜ | 🔴 CRITICAL |
| Admin Dashboard | 30 | ⬜ | 🔴 CRITICAL |
| Native Services | 38 | ⬜ | 🔴 CRITICAL |
| UI Components | 18 | ⬜ | 🟠 HIGH |
| Backend | 12 | ⬜ | 🟠 HIGH |
| **TOTAL** | **124** | ⬜ | |

---

# PHASE 3: Documentation & Clarity

**Timeline:** Week 3-4  
**Estimated Hours:** 38  
**Status:** 🔴 Not Started

## 3.1 Architecture Documentation
- [ ] Create `docs/ARCHITECTURE.md` - System design diagram
- [ ] Create `docs/DATA_FLOW.md` - User/gesture/sponsorship data journeys
- [ ] Create `docs/SYNC_STRATEGY.md` - Offline-first and Convex sync
- [ ] Create `docs/ERROR_HANDLING.md` - Error types and recovery
- [ ] Create `docs/PAYMENT_FLOW.md` - Mollie integration and sponsorship purchase

**Progress:** 0/5 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

## 3.2 Service Documentation
- [ ] Document database service with JSDoc
- [ ] Document analytics service with JSDoc
- [ ] Document sync service with JSDoc
- [ ] Document gesture service with JSDoc
- [ ] Document all native contexts with JSDoc
- [ ] Document all API routers with JSDoc

**Progress:** 0/6 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

## 3.3 Component Documentation
- [ ] Document UI components with props/usage
- [ ] Document native components
- [ ] Create component storybook (optional)

**Progress:** 0/3 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

## 3.4 Hook Documentation
- [ ] Document all hooks with examples
- [ ] Document hook composition patterns

**Progress:** 0/2 subtasks | **Estimated:** 4 hours | **Actual:** TBD

---

## 3.5 API Documentation
- [ ] Document all API endpoints with JSDoc
- [ ] Create `packages/api/docs/ENDPOINTS.md`
- [ ] Document error codes and meanings

**Progress:** 0/3 subtasks | **Estimated:** 6 hours | **Actual:** TBD

---

## 3.6 Database Schema Documentation
- [ ] Create `docs/DATABASE.md` with schema diagrams
- [ ] Document Convex schema with JSDoc
- [ ] Document table relationships

**Progress:** 0/3 subtasks | **Estimated:** 4 hours | **Actual:** TBD

---

## Phase 3 Summary

| Task | Hours | Status | Notes |
|------|-------|--------|-------|
| Architecture | 8 | ⬜ | |
| Services | 8 | ⬜ | |
| Components | 8 | ⬜ | |
| Hooks | 4 | ⬜ | |
| API | 6 | ⬜ | |
| Database | 4 | ⬜ | |
| **TOTAL** | **38** | ⬜ | |

---

# PHASE 4: Optimization & Refinement

**Timeline:** Week 4+  
**Estimated Hours:** 66  
**Status:** 🔴 Not Started

## 4.1 Performance Optimization
- [ ] Profile React components with DevTools
- [ ] Optimize gesture list rendering
- [ ] Optimize admin dashboard
- [ ] Optimize sponsors wizard
- [ ] Profile native app with Expo DevTools
- [ ] Optimize video player
- [ ] Implement request caching
- [ ] Optimize payload sizes

**Progress:** 0/8 subtasks | **Estimated:** 30 hours | **Actual:** TBD

---

## 4.2 Complex Algorithm Documentation
- [ ] Document gesture search ranking algorithm
- [ ] Document sponsorship business logic
- [ ] Create test cases for algorithms

**Progress:** 0/3 subtasks | **Estimated:** 16 hours | **Actual:** TBD

---

## 4.3 Testing Infrastructure
- [ ] Create test factories for data
- [ ] Create mock utilities
- [ ] Add critical test cases
- [ ] Achieve coverage targets

**Progress:** 0/4 subtasks | **Estimated:** 20 hours | **Actual:** TBD

---

## Phase 4 Summary

| Task | Hours | Status | Notes |
|------|-------|--------|-------|
| Performance | 30 | ⬜ | |
| Algorithms | 16 | ⬜ | |
| Testing | 20 | ⬜ | |
| **TOTAL** | **66** | ⬜ | |

---

# PHASE 5: Polish & Tools

**Timeline:** Final week  
**Estimated Hours:** 35  
**Status:** 🔴 Not Started

## 5.1 Developer Experience
- [ ] Create `docs/GETTING_STARTED.md`
- [ ] Create `docs/IDE_SETUP.md`
- [ ] Create `docs/COMMON_TASKS.md`
- [ ] Create `docs/TROUBLESHOOTING.md`
- [ ] Create `docs/TYPES.md`
- [ ] Create `docs/CODE_STYLE.md`

**Progress:** 0/6 subtasks | **Estimated:** 15 hours | **Actual:** TBD

---

## 5.2 Code Quality Automation
- [ ] Set up pre-commit hooks with husky
- [ ] Update CI/CD pipeline
- [ ] Update Biome linting rules
- [ ] Create ESLint custom rules (if needed)

**Progress:** 0/4 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

## 5.3 Developer Tools
- [ ] Create development CLI with useful commands
- [ ] Create debugging tools
- [ ] Create data inspection tools

**Progress:** 0/3 subtasks | **Estimated:** 8 hours | **Actual:** TBD

---

## 5.4 Documentation Polish
- [ ] Update root `README.md`
- [ ] Create `docs/README.md`
- [ ] Create `docs/MIGRATION.md`

**Progress:** 0/3 subtasks | **Estimated:** 4 hours | **Actual:** TBD

---

## Phase 5 Summary

| Task | Hours | Status | Notes |
|------|-------|--------|-------|
| DX Guides | 15 | ⬜ | |
| QA Tools | 8 | ⬜ | |
| Dev Tools | 8 | ⬜ | |
| Docs Polish | 4 | ⬜ | |
| **TOTAL** | **35** | ⬜ | |

---

# 📊 Grand Total Progress

```
Phase 1: ████░░░░░░░░░░░░░░░░░ 0/26 hours (0%)
Phase 2: ██░░░░░░░░░░░░░░░░░░░  0/124 hours (0%)
Phase 3: ░░░░░░░░░░░░░░░░░░░░░░  0/38 hours (0%)
Phase 4: ░░░░░░░░░░░░░░░░░░░░░░  0/66 hours (0%)
Phase 5: ░░░░░░░░░░░░░░░░░░░░░░  0/35 hours (0%)

Total: 0/289 hours (0%)
```

---

# 📝 Notes & Updates

## Session Notes
- **Date:** March 18, 2026
- **Created:** Full refactoring roadmap with 289 hours of detailed tasks
- **Team:** Ready to begin Phase 1
- **Next Steps:** Start with Type System (Day 1-2)

---

## Completed Milestones
- [ ] Phase 1 Complete (Validation: all tests pass, linting passes)
- [ ] Phase 2 Complete (Validation: sponsors + admin + services refactored)
- [ ] Phase 3 Complete (Validation: 100% documented)
- [ ] Phase 4 Complete (Validation: performance targets met, tests added)
- [ ] Phase 5 Complete (Validation: all guides complete, DX improved)
- [ ] Final Validation (Validation: new dev can start in <2 hours)

---

## Issues & Blockers

### Reported Issues
(none yet)

### Resolved Issues
(none yet)

---

## Updated Files
- ✅ Created: `DX_REFACTORING_ROADMAP.md` (Main detailed roadmap)
- ✅ Created: `REFACTORING_QUICK_START.md` (Quick reference)
- ✅ Created: `REFACTORING_PROGRESS.md` (This tracking file)

---

## Next Actions
1. Review roadmap with team
2. Get buy-in on priorities
3. Start Phase 1, Day 1
4. Create feature branch `feat/dx-refactor-phase-1`
5. Begin with Type System refactoring

---

**Let's make SMOG a DX masterpiece! 🚀**

