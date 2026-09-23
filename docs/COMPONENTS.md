# Component Documentation

## Shared UI (`packages/ui-web/`)

The component library for `apps/site`. Exports are listed in
`packages/ui-web/src/index.ts` and include `Avatar`, `Badge`, `Banner`,
`Button`, `Card`, `Checkbox`, `Dialog`, `DropdownMenu`, `EmptyState`, `Field`,
`Input`, `Label`, `Pagination`, `Select`, `Sheet`, `Skeleton`, `Switch`,
`Table`, `Tabs`, `Textarea`, `Toast`, `Tooltip`, and several domain
components (`GestureCard`, `GestureGrid`, `CategoryFilter`, `SearchBar`,
`StatusBadge`, `VideoPlayer`).

`"use client"` is placed on individual components, never on `index.ts` — see
that file's own comment for why.
