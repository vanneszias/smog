# @smog/ui-native API

The native kit mirrors `@smog/ui-web` (`packages/ui-web/API.md`): the same component names, props and variants wherever React Native allows. This file lists only what the native kit does differently or adds; everything not listed here behaves as the web API describes.

Every component:

- takes `className` (NativeWind, preset classes only), merged last with `cn()` (the same tailwind-merge configuration as web), plus `testID` and the other React Native props of its root, and `ref` (React 19 `ref` prop);
- has its accessibility role, state and name from `@smog/i18n` (`kit.*`, `a11y.*`, `states.*`) unless the caller passes them;
- is at least 44 × 44 pt: `md`/`lg` by size, `sm` (and small inline targets such as a Chip's remove button) through `hitSlop`. `hitSlop` has limits: Android does not extend a touch area beyond a parent that clips (`overflow-hidden`), and two `sm` controls closer than 12 pt share the overlap (which one gets the tap there is not defined), so give `sm` controls a `gap-3` and no clipping parent;
- drops its animation when the system asks for reduced motion (`useReducedMotion` from Reanimated).

Colours are CSS variables (`themeVars` from `@smog/styles/native`), so the same class set follows light and dark mode. Overlays (Dialog, AlertDialog, Sheet, Select, Menu) re-apply the variables at their own root.

## Setup

Wrap the navigator, inside the app's `ThemeRoot`:

```tsx
<I18nextProvider i18n={i18n}>
  <KitProvider>
    <ToastProvider>{navigator}</ToastProvider>
  </KitProvider>
</I18nextProvider>
```

| Export | Notes |
|---|---|
| `KitProvider` **(native only)** | `GestureHandlerRootView` + `@gorhom/bottom-sheet`'s `BottomSheetModalProvider`. Sheet, Select and Menu need it. |
| `ToastProvider`, `useToast()` | As web. |
| `useColor(role)`, `useThemeName()`, `useThemeVars()` **(native only)** | A colour role as a value for props that take a colour instead of a class (icons, a screen header), the active scheme, and the `vars()` style of that scheme. |
| `@smog/ui-native/jest-setup` **(native only)** | The kit's Jest mocks for Reanimated (with `useReducedMotion`), Worklets, Gesture Handler, the bottom sheet, safe area and haptics. Apps list it in `setupFiles`. |

Not ported: `Tooltip`/`TooltipProvider` (no hover), `Pagination` (lists load more on scroll), `Table`/`DataTable` (admin is web only; show rows as `ListItem`s), `PortalContainerProvider` (overlays re-apply the theme themselves), `buttonVariants`-styled links (`asChild`), `useOnline` (the app passes NetInfo). `badgeVariants` and `buttonVariants` are exported and style a `View`.

## Divergences

| Component | Native |
|---|---|
| All pressables | Web `onClick` is `onPress`. Web `asChild` does not exist: `DialogTrigger`, `DialogClose`, `SheetTrigger`, `SheetClose`, `MenuTrigger` and AlertDialog's `children` wrap **one pressable child** (a Button, IconButton, ListItem) and add to its `onPress`; a trigger also sets `accessibilityState.expanded`. The focus ring is the platform's (VoiceOver / TalkBack focus); there is no hover. |
| Icons (`icon`, `leading`, `trailing`) | A `lucide-react-native` element. Native has no `currentColor`, so the kit sets `color` (the colour of the label next to it) and `size` on the element unless the caller set them. Import icons per file (`lucide-react-native/icons/heart`): the barrel adds about 2 MB to the bundle (Metro does not tree-shake). |
| `Button`, `IconButton` | No `type`/`asChild`. `variant="danger"` plays the warning haptic (`expo-haptics`) on press. `loading` sets `accessibilityState.busy` and disables. |
| `Chip` | A toggle is `accessibilityRole="togglebutton"` with `accessibilityState.checked` (web: `aria-pressed`); toggling plays the selection haptic. |
| `TextLink` | A pressable `Text` with `accessibilityRole="link"`; `onPress` (required, navigate there) instead of `href`/`asChild`; 12 pt vertical padding makes the target 44 pt (RN `Text` has no `hitSlop`; nested in a sentence it has no padding, so give it its own line); underlined while pressed (no hover). Tones as web. |
| `Text`, `Heading`, `CardTitle` | No `as` (RN has one `Text`). `Heading`/`CardTitle` are `accessibilityRole="header"`; `Heading`'s `level` only picks the default size, `CardTitle`'s `level` (2–4) is accepted and has no effect (RN has no heading levels). |
| `Logo` | `@smog/brand/svg` drawn with `react-native-svg`. `tone="current"` takes a `color` role (default `foreground`), since there is no `currentColor`. |
| `Field` / `useFieldControl` | No `id`/`aria-describedby` on native: the control is named by the label (`accessibilityLabel`, plus `accessibilityLabelledBy` on Android) and its `accessibilityHint` is the error, hint and counter. The error is `accessibilityRole="alert"` with a polite live region. No `id` prop. |
| `Input`, `Textarea` | `TextInput` props (`onChangeText`, `keyboardType`, `secureTextEntry`), not HTML ones. `disabled` maps to `editable={false}`. `containerClassName` styles the bordered box, `className` the text. `Textarea` `rows` sets the minimum height. |
| `SearchField` | `accessibilityRole="search"`, `returnKeyType="search"`. |
| `Select` | A field-styled `combobox` that opens a picker sheet of `radio` options (the Field label is its heading). `name` is accepted and ignored (no forms). |
| `Checkbox`, `Switch`, `RadioGroup` | The whole row is the control (`checkbox` / `switch` / `radio` with `accessibilityState.checked`; `"mixed"` for indeterminate). `Switch` is the platform switch inside that row and plays the selection haptic. `description` is the `accessibilityHint`. |
| `Card` | `onPress` makes the card a button (name it with `accessibilityLabel`); `interactive` (web hover) is accepted and has no effect. Elevation 1 is the token shadow in light mode, a border and `surface-raised` in dark. |
| `ListItem` | `onPress` (web `onClick`) makes the row a button; no `asChild` (navigate in `onPress`). |
| `Avatar` | `accessibilityRole="image"`, named by `name`. |
| `Tabs`, `SegmentedControl`, `RadioGroup` | The containers (`tablist`, `radiogroup`) are named by `aria-label` but are not accessibility elements themselves, so their tabs and radios stay individually focusable. `SegmentedControl` `sm` extends the target vertically only. |
| `Stepper` | Always web's small-screen layout ("Step n of m" and the current label above the markers). Each marker is named by its step (done ones add `a11y.stepCompleted`); the current one has `accessibilityState.selected` (web: `aria-current="step"`). |
| `Dialog`, `AlertDialog` | A native `Modal` (its own window, so VoiceOver/TalkBack focus stays inside; Android back closes it): fades in, or appears at once under reduced motion. Footers stack their buttons (primary first). AlertDialog's card has `accessibilityRole="alert"`; its backdrop does not close it; confirming closes it (as Radix's Action). |
| `Sheet` | A `@gorhom/bottom-sheet` modal sized to its content, for every `side` (`side` is accepted and ignored). Swipe down, the backdrop and the close button (`a11y.close`) close it. The content sets `accessibilityViewIsModal`, but the sheet is not a native window (it renders in the provider's portal host), so VoiceOver may still reach the screen behind it; to verify on a device. |
| `Menu` | An action sheet: `MenuContent` is a bottom sheet with `accessibilityRole="menu"` and 44 pt `menuitem` rows. `align`/`sideOffset` are accepted and ignored. `MenuItem` takes `onSelect` (and `onPress`); the menu closes after it. |
| `Toast` | `action: { label, onPress }` (web `onClick`); `variant` and `duration` (5000 ms) as web. Drawn at the bottom (safe area aware) of the topmost surface: the screen, or an open Dialog/AlertDialog/Sheet/Select/Menu, which each mount a toast viewport while open (only the most recent one draws, so a toast shows once and above the overlay). The region is named `a11y.notifications`; `danger` is an `alert` with an assertive live region, the rest polite, and iOS also gets `AccessibilityInfo.announceForAccessibility`. |
| `Skeleton` | Hidden from assistive tech (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`); pulses with NativeWind's `animate-pulse`, none under reduced motion. |
| `EmptyState`, `ErrorState` | `level` is accepted (web heading level) and has no effect. ErrorState's title and description are one `alert`; the retry button stays its own element. |
| `OfflineBanner` | `online` is **required** (the app passes `@react-native-community/netinfo`; there are no browser events). A polite live region. |
| `Spinner` | `tone` (a colour role, `primary` by default) instead of `currentColor`. iOS has two sizes: `sm`/`md` are the small indicator, `lg` the large one. Decorative. |
| `ProgressBar` | `accessibilityRole="progressbar"` with `accessibilityValue` (`{ min: 0, max, now }`, no `now` when indeterminate). |
| `GestureCard`, `GestureRow` | `onPress` instead of web `href` / `linkComponent`: the card or row body is a `button` named by the gesture, with its categories as the hint. The heart and the row slots (`dragHandle`, `trailing`) are siblings of that button, not inside it, so each one stays focusable. GestureCard's `level` is accepted and has no effect. The still is an `Image` hidden from assistive tech, at 3:4 through `aspectRatio`. |
| `GestureGrid` | A FlatList (virtualised) with `numColumns` (2). The last row is padded with empty cells. The other FlatList props pass through (`onEndReached`, `ListHeaderComponent`, `scrollEnabled={false}` inside a ScrollView). |
| `CategoryChips` | A horizontal ScrollView of toggle Chips (`togglebutton`), named by `aria-label` but not an accessibility element itself. |
| `VideoPlayer` | `expo-video` on the Mux HLS stream (`muxStreamUrl`), with native controls. Adds `isFocused` (pass `useIsFocused()`): it pauses on blur and an autoplaying video resumes on focus. `onNearEnd` follows the same rule as web (`timeUpdate` every 0.25 s); `onEnded` is `playToEnd` (whether it fires on every loop is not verified on a device). The frame is named by `title`. `expo-video` is a peer dependency, and `@smog/ui-native/jest-setup` mocks it (`mockVideoPlayers` holds the players, and `emit(event, payload)` drives them). |
| `FavoriteButton` | `togglebutton` with `checked`. It plays the selection haptic, and the pop is a Reanimated `withSequence` (none under reduced motion). `sm` keeps 44 pt through `hitSlop`. |
| `ListPicker` | A bottom Sheet. Its `children` is one pressable trigger. The name field submits on the keyboard's return key. It adds `testID` (on the sheet content). |
| `ShareLink` | A non-editable field (`selectTextOnFocus`). `onCopy` is the caller's (expo-clipboard), and "Copied" is announced with `AccessibilityInfo.announceForAccessibility`. Revoke confirms in the kit's AlertDialog. |
| `CourseBanner` | The `<course>` phrase is a nested `Text` with the `link` role that calls `Linking.openURL(courseUrl)`. The banner is a polite live region. |
| `SearchResults` | Full-bleed: its count, grid and skeletons carry the screen gutter (`px-4`). The count is a polite live region and is announced on iOS. It adds `onEndReached` and `scrollEnabled` (passed to the grid) and marks the region `busy` while loading. |
