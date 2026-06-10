# Component Documentation

> Last updated: June 10, 2026
> See also: [HOOKS.md](./HOOKS.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

## Overview

SMOG components are split across four locations:

| Location | Purpose |
|----------|---------|
| `packages/ui/src/` | Shared web components (used by web + remotion) |
| `apps/web/src/components/` | Web-only components |
| `apps/native/components/` | Native-only components |
| `apps/web/src/routes/*/components/` | Route-scoped components |

---

## Shared UI (`packages/ui/`)

### `GestureWithSponsorshipStatus`
Type used by the sponsor selection page. Each gesture has a `status` field:
- `"available"` — can be sponsored
- `"sponsored"` — currently has an active sponsorship  
- `"pending"` — payment or approval in progress

### shadcn/ui Components
The following shadcn/ui components are re-exported from `@smog/ui`:
`Badge`, `Button`, `Dialog`, `Input`, `Select`, `Switch`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Tabs`, etc.

---

## Native Components (`apps/native/components/`)

### `VideoPlayer`
**File:** `VideoPlayer.tsx` (120 lines)  
**Purpose:** MUX HLS gesture video player with Liquid Glass UI.

```typescript
interface VideoPlayerProps {
  playbackId: string;        // MUX playback ID
  autoPlay?: boolean;        // Default: true
  onComplete?: () => void;   // Called 5s before video end
  onPlayToEnd?: () => void;  // Called when video reaches end
}
```

**Architecture:**
- `video/useVideoPlayerState` — expo-video player instance, event subscriptions

**Key behaviours:**
- Pauses automatically when screen loses focus (navigation away)
- Shows `ActivityIndicator` while loading
- Play/pause button uses Liquid Glass effect on supported devices

---

### `GestureCard`
**File:** `GestureCard.tsx` (300 lines)  
**Purpose:** Swipeable gesture list item with double-tap to favourite.

```typescript
interface GestureCardProps {
  gesture: Gesture;
  onPress: (gesture: Gesture) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (gestureId: string) => void;
}
```

**Key behaviours:**
- Single tap: navigate to gesture detail (300ms debounce)
- Double tap: toggle favourite with heart animation
- Long press: opens options bottom sheet
- Haptic feedback on favourite toggle
- Animated scale + heart overlay on like action

---

### `DisclaimerBanner`
**File:** `DisclaimerBanner.tsx` (273 lines)  
**Purpose:** Animated banner shown after the user watches `VIDEO_COMPLETE_COUNT` (7) gesture videos.

```typescript
interface DisclaimerBannerProps {
  visible: boolean;
  onDismiss: () => void;
}
```

**Key behaviours:**
- Fade + slide-in animation on show; fade + slide-out on dismiss
- Randomly selects one of 7 course-promotion messages
- "Klik hier"/"klik dan hier" phrases are rendered as tappable links to `COURSE_URL`
- Uses `VIDEO_COMPLETE_COUNT` and `COURSE_URL` from `@smog/config`

---

### `AnalyticsConsentPrompt`
**Purpose:** First-choice prompt for optional native analytics.

It links to the public privacy policy and offers equally visible allow and
required-only actions. It is shown while consent is unknown.

---

## Web Admin Components (`apps/web/src/components/admin/`)

### `AdminTable`
**File:** `AdminTable.tsx` (~260 lines)  
**Purpose:** Inline-editable gesture management table.

**Architecture:**
- `gestures/useGestureTableEditing` — pending changes state machine
- `gestures/EditableCell` — inline input/textarea
- `gestures/ConceptsCell` — concept tag add/remove
- `gestures/CategoriesCell` — category multi-select
- `gestures/ChangesConfirmationDialog` — diff review before save

**Key behaviours:**
- All edits are buffered locally (no immediate API calls)
- "Save Changes" button shows count of pending edits
- Confirmation dialog shows old→new diff for each changed field
- Discard button reverts all pending changes

---

### `SponsorshipsManagement`
**File:** `SponsorshipsManagement.tsx`
**Purpose:** Admin view for managing sponsorship lifecycle (approve, reject,
expire, cancel, and re-edit).

---

### Shared Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| `DataTable<TData>` | `shared/DataTable.tsx` | Generic reusable data table |
| `DataTableSearch` | `shared/DataTableSearch.tsx` | Search input with clear button |

---

## Web Sponsors Route Components (`apps/web/src/routes/sponsors/components/`)

### Three-Step Wizard

| Component | File | Responsibility |
|-----------|------|---------------|
| `StepSelect` | `-StepSelect.tsx` | Step 1: Browse + select gestures |
| `StepDetails` | `-StepDetails.tsx` | Step 2: Sponsor info, contact, invoice |
| `StepPreview` | `-StepPreview.tsx` | Step 3: Preview videos + payment CTA |
| `SponsorGestureCard` | `-SponsorGestureCard.tsx` | Gesture card for selection grid |
| `SelectionBar` | `-SelectionBar.tsx` | Floating selection summary bar |

Form state lives in `hooks/-useSponsorshipForm.ts`; network actions live in
`hooks/-useSponsorshipMutation.ts`.

---

## Component Conventions

### Props
- Use explicit TypeScript interfaces for all props (no inline object types)
- Handlers are named `on<Event>` (e.g. `onPress`, `onToggle`)
- Boolean props use `is` prefix where ambiguous (e.g. `isDisabled`, `isLoading`)

### State
- Component-local UI state (hover, focus, animation) lives in the component
- Domain state (gestures, sponsorships) lives in hooks or context
- Form state lives in dedicated form hooks (e.g. `useSponsorshipForm`)

### Styling (Web)
- Tailwind utility classes
- Admin-specific CSS variables: `--admin-accent`, `--admin-text`, `--admin-border`, etc.
- No inline styles except for dynamic values (animation transforms)

### Styling (Native)
- `StyleSheet.create()` at module level
- Theme values from `useTheme()` context
- Design tokens from `@smog/styles` (`SPACING`, `BORDER_RADIUS`, `SHADOWS`, etc.)
