# @smog/ui-web API

The web kit's public surface, for `@smog/ui-native` to mirror (spec §16: same names, props and variants where the platform allows). Every component:

- takes `className`, merged last with `cn()` (clsx + tailwind-merge configured for the SMOG theme);
- forwards `ref` (React 19 `ref` prop) to its root element, and spreads other HTML/Radix props onto it;
- has a 2 px `focus-ring` ring with a 2 px offset (`focus-visible:`), a hover state, and no motion under `prefers-reduced-motion`;
- is at least 44 × 44 px at `md` and `lg`; `sm` (dense admin UI) keeps a 44 px hit area through an invisible pseudo-element;
- takes its copy and accessible names from `@smog/i18n` (`kit.*`, `a11y.*`, `states.*`) unless the caller passes them.

Styles: import `@smog/ui-web/styles.css` after `tailwindcss` and `@smog/styles/theme.css` (it registers the kit as a Tailwind source and adds the overlay animations).

Spacing of `sm` controls: the 44 × 44 hit areas of neighbouring `sm` Buttons, IconButtons and Chips overlap when they are closer than 6 px apart (`gap-2` or more is safe). SegmentedControl `sm` uses a vertical-only hit area, so its segments 4 px apart never share one. The Chip remove button sits inside the chip's hit area and comes after it in the DOM, so it wins where they overlap.

Toggle vocabulary (controller ruling, 2026-09-29): Chip keeps `selected` / `onSelectedChange(next)` (selection semantics, `aria-pressed`); Checkbox and Switch keep `checked` / `onCheckedChange(checked)` (form-control semantics, Radix names). ui-native uses the same names on the same components.

Icons: `icon` props take a ReactNode that the component sizes on web (`*:size-*` on its wrapper). Native cannot size a child through CSS, so ui-native passes the size to the icon (e.g. a `size` from the component's size) with the same prop name.

Native mapping: `onClick` → `onPress`, `className` → NativeWind `className`, `ref` stays. `asChild` (render a link with the component's styles) is web only; native uses `href`/router props on the same component instead.

## Actions

| Component | Props | Variants | Sizes | Notes |
|---|---|---|---|---|
| `Button` | `variant`, `size`, `loading`, `icon` (leading, decorative), `disabled`, `type` (defaults to `button`), `asChild` (web) | `primary` · `secondary` · `ghost` · `danger` | `sm` (32 px, 44 px hit area) · `md` (44) · `lg` (48) | `loading` shows a Spinner, sets `aria-busy` and disables. |
| `IconButton` | `icon`, `label` (required accessible name), `variant`, `size`, `loading`, `disabled` | `primary` · `secondary` · `ghost` (default) · `danger` | `sm` (32, 44 hit area) · `md` (44) · `lg` (48) | Round. |
| `Chip` | `selected` (makes it a toggle, `aria-pressed`), `onSelectedChange(next)`, `onRemove` (adds a remove button named `a11y.remove`), `icon`, `size`, `disabled` | selected / unselected | `sm` (32, 44 hit area) · `md` (44) | A check replaces the icon while selected. |

## Text

| Component | Props | Variants | Notes |
|---|---|---|---|
| `Text` | `size`, `tone`, `weight`, `as` (`p` · `span` · `div` · `label` · `strong` · `small`) | size `body` · `body-sm` · `caption`; tone `default` · `muted` · `primary` · `success` · `warning` · `danger` (the `*-strong` text roles); weight `regular` · `medium` · `semibold` | |
| `Heading` | `level` (1–6, the outline level), `size`, `tone` | size `display` · `title-1` · `title-2` · `title-3` (defaults from `level`: 1 → title-1, 2 → title-2, 3+ → title-3) | |
| `TextLink` | `tone`, `asChild` (web: style a router `Link`), `href` and the other `<a>` props | tone `primary` (default) · `default` · `muted` | A link in or next to text: underline on hover, the focus ring, a 44 px hit area around the text. Native: a pressable `Text` with `accessibilityRole="link"` and `onPress`. |
| `Logo` | `variant`, `tone`, `size`, `decorative` | variant `horizontal` · `stacked`; tone `primary` · `foreground` · `current` | `sm` · `md` · `lg` (height 24 / 32 / 48). `role="img"` named `a11y.logo` unless `decorative`. |

## Forms

| Component | Props | Sizes | Notes |
|---|---|---|---|
| `Field` | `label`, `hint`, `error`, `required`, `optional` (shows `kit.optional`), `counter: { count, max }` (`kit.characterCount`, spoken as `a11y.characterCount`), `id` | | Wires `id`, `aria-describedby`, `aria-invalid` and `required` into the control inside it (`useFieldControl`). The error is `role="alert"`. |
| `Input` | HTML input props, `size`, `invalid`, `leading` (icon), `trailing` (e.g. an IconButton) | `md` (44) · `lg` (48) | |
| `Textarea` | HTML textarea props, `invalid`, `rows` (4) | | |
| `SearchField` | `value` / `defaultValue`, `onValueChange(value)`, `onClear`, `placeholder` (`kit.searchPlaceholder`), `aria-label` (`common.search`), `size` | `md` · `lg` | `type="search"`; the clear button (`a11y.clearSearch`) refocuses the input. |
| `Select` | `options: { value, label, disabled? }[]`, `value` / `defaultValue`, `onValueChange(value)`, `placeholder` (`kit.selectPlaceholder`), `invalid`, `disabled`, `required`, `name`, `open` / `defaultOpen` / `onOpenChange`, `size` | `md` · `lg` | Radix Select (combobox + listbox). Native: a picker sheet with the same props. |
| `Checkbox` | `checked` (`true` · `false` · `"indeterminate"`), `defaultChecked`, `onCheckedChange(checked)`, `label`, `description`, `invalid`, `disabled` | | 20 px box, 44 px hit area; the label toggles it. |
| `Switch` | `checked`, `defaultChecked`, `onCheckedChange(checked)`, `label`, `description`, `disabled` | | For settings that apply at once. Label first, switch trailing. |
| `RadioGroup` | `options: { value, label, description?, disabled? }[]`, `value` / `defaultValue`, `onValueChange(value)`, `orientation` (`vertical` · `horizontal`), `aria-label` | | Inside a Field it is labelled by the Field label. |

## Layout and lists

| Component | Props | Variants | Notes |
|---|---|---|---|
| `Card` (+ `CardHeader`, `CardTitle` (`level` 2–4, default 3), `CardDescription`, `CardContent`, `CardFooter`) | `variant`, `interactive` | `default` (flat, subtle border) · `raised` (elevation 1: shadow in light, border + `surface-raised` in dark) · `sunken` | `interactive` adds the elevation-1 hover. |
| `ListItem` | `title`, `description`, `leading`, `trailing`, `onClick` (the row becomes a button), `disabled`, `asChild` (web: a link row) | | Min height 44. |
| `Badge` | `variant`, `size`, `icon` | `neutral` · `primary` · `accent` · `success` · `warning` · `danger` (`*-strong` on `*-subtle`; `accent` is filled) | `sm` (caption) · `md` (body-sm). Not interactive. |
| `Avatar` | `name` (accessible name + initials), `src`, `size` | | `sm` (32) · `md` (40) · `lg` (48). |

## Navigation

| Component | Props | Variants | Notes |
|---|---|---|---|
| `Tabs`, `TabsList` (`aria-label`), `TabsTrigger` (`value`, `disabled`), `TabsContent` (`value`) | `value` / `defaultValue`, `onValueChange` | | Radix Tabs; underline style, triggers 44 px. |
| `SegmentedControl` | `options: { value, label, icon?, disabled? }[]`, `value`, `onValueChange(value)`, `aria-label`, `disabled`, `size` | | `sm` (32, 44 hit area) · `md` (44). Always has a value (a radiogroup). |
| `Stepper` | `steps: { label }[]`, `current` (zero-based) | done · current · upcoming | A `nav` named `a11y.steps`; the current step has `aria-current="step"`. Below `sm` only markers show, with `kit.stepOf` and the current label. |
| `Pagination` **(web only)** | `page` (one-based), `pageCount`, `onPageChange(page)` | | `a11y.pagination`, `a11y.previousPage` / `nextPage` / `goToPage` / `currentPage`, `kit.pageOf`. Below `sm`: text + prev/next. Native lists load more on scroll. |

## Overlays

| Component | Props | Variants | Notes |
|---|---|---|---|
| `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogFooter` | Root: `open` / `defaultOpen` / `onOpenChange`. Content: `title` (required, the accessible name), `description`, `hideClose` | | Centred, elevation 2, close button `a11y.close`. |
| `AlertDialog` | `title`, `description`, `onConfirm`, `confirmLabel` (`kit.confirm`), `cancelLabel` (`kit.cancel`), `tone`, `loading`, `body` (content before the actions, e.g. a typed confirmation), `confirmDisabled`, `open` / `defaultOpen` / `onOpenChange`; `children` is the trigger | tone `default` · `danger` | `role="alertdialog"`. Confirming closes it; a controlled caller keeps it open (a refused async action) by ignoring that `onOpenChange(false)`. |
| `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetFooter` | Content: `title` (required), `description`, `side`, `hideClose` | side `auto` (bottom on mobile, right from `md`) · `bottom` · `right` · `left` | Native: a bottom sheet for every side. |
| `Menu`, `MenuTrigger`, `MenuContent` (`align`, `sideOffset`), `MenuItem` (`variant`, `icon`, `onSelect`, `disabled`), `MenuLabel`, `MenuSeparator`, `MenuGroup` | Root: `open` / `defaultOpen` / `onOpenChange` | item `default` · `danger` | Radix DropdownMenu. Native: an action sheet. Items 44 px. |
| `Tooltip`, `TooltipProvider` **(web only)** | `content`, `side`, `align`, `open` / `defaultOpen` / `onOpenChange`; `children` is the trigger | | A hint on hover and focus; never the only accessible name (native has no hover). |
| `ToastProvider`, `useToast()` → `{ toast(options) → id, dismiss(id) }` | options: `title`, `description`, `variant`, `action: { label, onClick }`, `duration` (5000 ms) | `neutral` · `success` · `warning` · `danger` | Own implementation on Radix Toast (no sonner). Region `a11y.notifications`, dismiss `a11y.dismiss`; `danger` is assertive, the rest polite. |
| `PortalContainerProvider` | `container` | | Where overlays portal to (default `document.body`). Web: themed subtrees that differ from the page theme; native: the modal root that re-applies `themeVars`. |

## States and feedback

| Component | Props | Variants | Notes |
|---|---|---|---|
| `Skeleton` | `shape` | `text` · `rect` · `circle` | Decorative (`aria-hidden`); put `aria-busy` on the region. No pulse under reduced motion. |
| `EmptyState` | `title` / `description` (`states.empty.*`), `action` (the next action), `icon`, `illustration` (`true` or a brand hand index 0–2), `level` | | |
| `ErrorState` | `title` / `description` (`states.error.*`), `onRetry` (`states.retry`), `retrying`, `level` | | `role="alert"`. |
| `OfflineBanner` | `online` (controlled; browser events when omitted) | | `role="status"`, `states.offline.*`. `useOnline()` is the web hook; native passes NetInfo. |
| `Spinner` | `size` | | `sm` · `md` · `lg`. Reserved for button loading (spec §16); decorative. |
| `ProgressBar` | `label` (required), `value` (omit for indeterminate), `max` (100), `tone` | `primary` · `success` · `warning` · `danger` | `role="progressbar"`. |

## Tables (web only)

| Component | Props | Notes |
|---|---|---|
| `Table` (`containerClassName`), `TableHeader` (`sticky`), `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` | HTML table props | Admin only; dense rows are allowed here. |
| `DataTable<Row>` | `columns: { id, header, cell(row), sortValue?(row), align? ("start" · "end") }[]`, `rows`, `getRowId(row)`, `sort` / `defaultSort` / `onSortChange` (`{ id, direction: "asc" · "desc" } \| null`), `onRowClick(row)`, `stickyHeader`, `empty`, `selectedRowIds` (`ReadonlySet`, `data-state="selected"`), `rowProps(row)` (`{ className?, data-* }`, `RowExtraProps`) | Sort cycles none → ascending → descending; `aria-sort` on the header. Clickable rows take focus and open on Enter/Space. Controlled `sort` is for URL-synced admin filters. Native shows the same data as a list of ListItems. |

## Domain (learning)

Presentational only: no data fetching. Screens pass the feature hooks' data. `GestureCardData` is structural (`id`, `slug`, `name`, `playbackId`, `categories: { name, slug }[]`), so `GestureSummary` and `SearchResult` from `@smog/gestures/schema` fit it. Copy comes from `gesture.*`, `search.*`, `favorites.*` and `lists.*`.

| Component | Props | Notes |
|---|---|---|
| `GestureCard` | `gesture`, `href`, `favorite`, `onFavoriteToggle(next)`, `sponsored`, `level` (2–4, default 3), `linkComponent` (web) | An `article`: a 3:4 Mux still (`alt=""`, lazy), the name as a heading, and the categories. The name is a stretched link: one tab stop, and the whole card is the target. The heart (`FavoriteButton` `overlay`) and the `gesture.sponsored` badge sit on the still. The heart is a sibling of the link. |
| `GestureRow` | as GestureCard without `level`/`sponsored`, plus `dragHandle` (leading slot) and `trailing` (slot before the heart) | The dense variant, 44 px minimum. The slots sit above the stretched link. |
| `GestureGrid<T>` | `items`, `renderItem(item, index)` (a plain GestureCard by default) | A `ul` grid: 2 columns, then 3 / 4 / 5 at `sm` / `lg` / `xl`. |
| `CategoryChips` | `categories`, `selected` (slugs), `onChange(selected)`, `showAll` (true), `aria-label` (`search.categories`) | A `fieldset` of toggle Chips, led by `All` (`search.allCategories`, which clears the selection). `onChange` gets the slugs in category order. It scrolls sideways below `md` and wraps from `md`. |
| `VideoPlayer` | `playbackId`, `autoPlay` (muted), `loop`, `aspect` (`3:4` · `16:9`), `onNearEnd()`, `onEnded()` (not while `loop` is on: a looping video never ends), `title` (the frame's name, `a11y.gestureVideo` by default) | Mux Player is client-only (its own chunk, never in the Worker build; the deploy guard checks `dist/server`); the server and the first client render show the Mux poster. `onNearEnd` fires once per playthrough at ≤ 5 s left (`createNearEndTracker` from `@smog/utils`). Mux Data tracking and cookies are off. |
| `FavoriteButton` | `active`, `onToggle(next)`, `size` (`sm` · `md` · `lg`), `variant` (`ghost` · `overlay`), `label` (`a11y.favorite`) | `aria-pressed`, a filled `primary` heart when on, and a pop (`animate-favorite-pop`) when switched on. No pop under reduced motion. Controlled: the caller updates optimistically. |
| `ListPicker` | `lists: { id, name, contains }[]`, `onToggle(listId)`, `onCreate(name)` (trimmed), `nameMaxLength`, `title` (`lists.addToList`), `description`, `open` / `defaultOpen` / `onOpenChange`; `children` is the trigger | A Sheet with a Checkbox per list (`lists.noLists` when there are none) and a "New list" field whose Create button is disabled while the name is blank. Enter submits. |
| `ShareLink` | `url`, `access` (`view` · `edit`), `onCopy()`, `onRevoke()`, `revoking` | A section headed by the access level (`lists.share.*`), with a read-only field that selects on focus, Copy and Revoke (asks first in a danger AlertDialog). Copy says `kit.copied` for 2 s and an sr-only `status` announces it. The caller does the copying and must show its own error if that fails. |
| `AppBanner` | `appStoreUrl`, `googlePlayUrl`, `onDismiss()` | The app promotion (`appBanner.*`): a labelled `region` in the page flow on the primary colour with the "new" badge, the headline, both store links (new tab) and a close button. The site shows it on the home page, on mobile browsers only, once the consent decision is made. |
| `OpenInAppBanner` | `href` (the page's universal link), `onOpen(event)`, `storeUrl` | "Open in the app" (`openInApp.*`) on a gesture page: a labelled `region` with a short line and a link styled as the primary button. `onOpen` runs before the browser follows `href`. With `storeUrl`, a separate "Get the app" link (new tab) sits under the line. |
| `ConsentBanner` | `onAllow()`, `onDecline()`, `privacyHref`, `busy`, `inline` (in the page flow instead of fixed) | The analytics consent prompt (`consent.*`): a labelled `region` fixed to the bottom of the viewport with the purpose, a privacy link and two equally sized choices (Only necessary · Allow). Not modal and no close button; the app shows it while `useConsent().needsDecision`. |
| `CourseBanner` | `messageIndex` (1–7, `COURSE_MESSAGE_COUNT`), `courseUrl`, `onDismiss` | The disclaimer after a gesture video: `gesture.disclaimer.title` + `gesture.videoComplete.N`. The `<course>` phrase in the copy links to `courseUrl` in a new tab. A polite `status`. |
| `SearchResults<T>` | `state` (`idle` · `loading` · `empty` · `error` · `results`), `items`, `onRetry`, `retrying`, `renderItem`, `emptyAction`, `skeletonCount` (8) | A `status` line (`search.resultCount`, `search.searching`; visible with results, screen-reader-only otherwise), skeleton cards (`aria-busy`), `NoResultsEmptyState`, `ErrorState`, `SearchIdleEmptyState`, or a GestureGrid. |
| `FavoritesEmptyState`, `ListsEmptyState`, `ListItemsEmptyState`, `NoResultsEmptyState`, `SearchIdleEmptyState` | EmptyState props (`action` is the next action) | EmptyState with their copy and a brand hand. Any prop overrides the defaults. |

## Utilities

| Export | Notes |
|---|---|
| `cn(...classes)` | clsx + tailwind-merge with the SMOG scales (`text-body` is a size, `shadow-1` an elevation, `duration-fast` a duration). |
| `buttonVariants`, `badgeVariants` | `cva` configs, for styling another element like a Button or Badge. |
| `useFieldControl(props)` | For custom controls inside a `Field`. |
