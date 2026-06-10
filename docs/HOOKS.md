# Hooks Documentation

> Last updated: June 10, 2026
> See also: [COMPONENTS.md](./COMPONENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

## Overview

Custom hooks are split across four locations:

| Location | Scope |
|----------|-------|
| `packages/hooks/src/` | Shared hooks (web + remotion) |
| `apps/native/hooks/` | Native-only hooks |
| `apps/web/src/*/hooks/` | Route/feature-scoped hooks |
| `apps/native/components/*/` | Component-scoped hooks |

---

## Shared Hooks (`packages/hooks/`)

### `useGestureFiltering`
**File:** `useGestureFiltering.ts`  
**Purpose:** Client-side search + category filtering for gesture lists.

```typescript
const {
  searchQuery,
  setSearchQuery,
  selectedCategories,
  handleCategoryToggle,
  allCategories,         // Derived: unique category names from gesture list
  filteredGestures,      // Result: gestures matching current filters
} = useGestureFiltering({ gestures: GestureWithSponsorshipStatus[] });
```

**Algorithm:**
1. Filter by `selectedCategories` (AND logic — gesture must have ALL selected cats)
2. Filter by `searchQuery` using fuzzy search via `gestureSearchRanking.ts`
3. Returns filtered list; all categories derived from the input list

---

## Native Hooks (`apps/native/hooks/`)

### `useOptimizedSearch`
**Purpose:** Debounced gesture search.

```typescript
const {
  query,
  setQuery,
  results,
  isSearching,
  searchDuration,
} = useOptimizedSearch({ gestures, debounceMs: 300 });
```

---

### `useSyncStatus`
**Purpose:** Exposes the current sync state from `convexSyncService`.

```typescript
const {
  isSyncing,
  lastSync,
  lastAttempt,
  nextSync,
} = useSyncStatus();
```

---

### `useBottomSheet`
**Purpose:** Controls bottom sheet open/close state with animation.

```typescript
const { isOpen, open, close, toggle } = useBottomSheet();
```

---

### `useAutoSync`
**Purpose:** Triggers background sync on app foreground with configurable interval.

```typescript
useAutoSync({ intervalMs: SYNC_INTERVAL_MS, onSync: handleSync });
```

---

## Sponsors Route Hooks (`apps/web/src/routes/sponsors/hooks/`)

### `useSponsorshipForm`
**File:** `useSponsorshipForm.ts`  
**Purpose:** Central form state for the 3-step sponsorship wizard.

```typescript
const form = useSponsorshipForm();
// Step navigation
form.currentStep;           // "select" | "details" | "preview"
form.setCurrentStep(step);
// Gesture selection
form.selectedGestureIds;
form.handleToggleSelection(gestureId);
// Sponsor info
form.sponsorName; form.setSponsorName(v);
form.includeLogo; form.setIncludeLogo(v);
form.logoFile;    form.setLogoFile(file);
form.logoPreview; form.setLogoPreview(url);
// Contact
form.contactFullName; form.setContactFullName(v);
form.contactEmail;    form.setContactEmail(v);
form.contactCompany;  form.setContactCompany(v);
// Invoice
form.invoiceRequested;   form.setInvoiceRequested(v);
form.invoiceName;        form.setInvoiceName(v);
form.invoiceVatNumber;   form.setInvoiceVatNumber(v);
form.invoiceEmail;       form.setInvoiceEmail(v);
// Validation
form.errors;
form.setErrors(errors);
form.runValidateDetails(t); // Returns boolean
// Preview state
form.previewPlaybackIds;    form.setPreviewPlaybackIds(ids);
form.isGeneratingPreview;   form.setIsGeneratingPreview(v);
form.previewProgress;       form.setPreviewProgress(v);
// Payment state
form.isProcessing;          form.setIsProcessing(v);
form.paymentProgress;       form.setPaymentProgress(v);
```

---

### `useGeneratePreview` / `useCreateSponsorship`
**File:** `useSponsorshipMutation.ts`  
**Purpose:** API mutation hooks for the wizard step transitions.

```typescript
// Step 2 → 3: generate preview videos
const handleGeneratePreview = useGeneratePreview({ form, selectedGestures });
await handleGeneratePreview();

// Step 3: create sponsorships and redirect to payment
const handleProceedToPayment = useCreateSponsorship({ form, totalCents });
await handleProceedToPayment();
```

---

## Admin Hooks (`apps/web/src/components/admin/`)

### `useAdminFilters`
**File:** `hooks/useAdminFilters.ts`  
**Purpose:** Shared filter state for admin data tables.

```typescript
const {
  searchQuery, setSearchQuery,
  statusFilter, setStatusFilter,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  clearFilters,
  hasActiveFilters,
} = useAdminFilters();
```

---

### `useGestureTableEditing`
**File:** `gestures/useGestureTableEditing.ts`  
**Purpose:** Pending-changes state machine for the inline gesture editor.

```typescript
const editing = useGestureTableEditing({ gestures, onSave });

editing.updateField(gestureId, "name", newName);
editing.getGestureWithChanges(gesture);       // Returns merged version
editing.getChangesForConfirmation();           // Returns diff array
editing.handleSave();                          // Calls onSave with all changes
editing.discardChanges();                      // Resets to original
editing.clearAfterSave();                      // Called after successful mutation
editing.hasChanges;                            // boolean
editing.pendingCount;                          // number
editing.showConfirmation; editing.setShowConfirmation(v);
```

---

## Video Component Hooks (`apps/native/components/video/`)

### `useVideoPlayerState`
**Purpose:** Core playback state for `VideoPlayer` — expo-video instance, event subscriptions, focus handling.

```typescript
const { player, isLoading, isPlaying, togglePlayPause } = useVideoPlayerState({
  playbackId, autoPlay, onComplete, onPlayToEnd,
});
```

---

## Hook Conventions

- **Naming:** `use` prefix, camelCase (`useGestureFiltering`, `useSponsorshipForm`)
- **Single responsibility:** Each hook handles one concern
- **Return:** Plain objects with named fields (not arrays, unless TanStack Query style)
- **Side effects:** Documented in JSDoc `@example` and `@see` tags
- **Dependencies:** Hooks that call other hooks declare them in JSDoc
