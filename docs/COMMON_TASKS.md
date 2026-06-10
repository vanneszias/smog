# Common Development Tasks

> Step-by-step guides for the most frequent development tasks.  
> Last updated: June 10, 2026

---

## Native App

### Add a new screen

1. Create `apps/native/app/my-screen.tsx`:
```tsx
import { Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

export default function MyScreen() {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Text style={{ color: theme.text }}>Hello</Text>
    </View>
  );
}
```

2. Navigate to it:
```typescript
import { router } from "expo-router";
router.push("/my-screen");
```

---

### Add a tracked interaction

1. Add the event and its property type to
   `packages/shared/src/analytics.ts`.
2. Call the platform `trackAnalyticsEvent` helper only after the user action
   succeeds.
3. Use stable IDs, enums, booleans, and counts. Never send search text,
   authentication tokens, free-form sponsor data, or invoice/payment details.
4. Verify that no request is sent before consent and that withdrawal stops new
   events.
5. Update `docs/PRIVACY_AND_ANALYTICS.md` when the data inventory changes.

---

## Web App

### Add a new admin page

1. Add the view or tab to `apps/web/src/routes/admin.tsx`.
2. Add feature components under `apps/web/src/components/admin/`.
3. Protect server mutations with the existing admin authorization helpers.

---

### Add a new oRPC endpoint

1. Add the procedure to the appropriate router in `packages/api/src/routers/`:
```typescript
export const myProcedure = publicProcedure
  .input(z.object({ gestureId: z.string() }))
  .output(z.object({ result: z.string() }))
  .query(async ({ input }) => {
    const result = await doSomething(input.gestureId);
    return { result };
  });
```

2. Export it from the router's `index`:
```typescript
export { myProcedure } from "./myProcedure";
```

3. Use in the web app:
```typescript
const { data } = useQuery(orpc.gestures.myProcedure.queryOptions({ gestureId }));
// or
const result = await client.gestures.myProcedure({ gestureId });
```

---

### Add a new Convex query

1. Add the query to the appropriate file in `packages/convex/convex/`:
```typescript
export const getByCategory = query({
  args: { categoryId: v.id("categories") },
  returns: v.array(v.object({ name: v.string() })),
  handler: async (ctx, args) => {
    return ctx.db
      .query("gestures")
      .withIndex("by_category", q => q.eq("categoryIds", args.categoryId))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  },
});
```

2. Use in the web app (Convex real-time):
```typescript
import { api } from "@smog/convex";
import { useQuery } from "convex/react";
const gestures = useQuery(api.gestures.getByCategory, { categoryId });
```

---

### Update the sponsorship wizard

The wizard is split into three step components:

| File | Responsibility |
|------|---------------|
| `routes/sponsors/index.tsx` | Data fetching + step routing |
| `components/-StepSelect.tsx` | Step 1: gesture selection |
| `components/-StepDetails.tsx` | Step 2: sponsor details |
| `components/-StepPreview.tsx` | Step 3: preview + pay |
| `hooks/-useSponsorshipForm.ts` | All form state |
| `hooks/-useSponsorshipMutation.ts` | API calls |

To add a new form field:
1. Add to `SponsorshipFormState` in `-useSponsorshipForm.ts`
2. Add state + setter in `useSponsorshipForm`
3. Add validation in `utils/-validation.ts` if needed
4. Add the UI in the appropriate step component

---

## Convex Backend

### Add a sponsorship mutation

1. Add to `packages/convex/convex/sponsorships.ts`
2. Use lib helpers from `packages/convex/convex/lib/`:
   - `sponsorshipValidation.ts` — conflict checks
   - `sponsorshipDates.ts` — date calculations
   - `sponsorshipStatus.ts` — status helpers

```typescript
export const myMutation = mutation({
  args: { sponsorshipId: v.id("sponsorships") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const sponsorship = await ctx.db.get(args.sponsorshipId);
    if (!sponsorship) throw new Error("Not found");
    
    // Use lib helpers
    const { startDate, endDate } = activateDates(sponsorship.durationYears);
    
    await ctx.db.patch(args.sponsorshipId, { startDate, endDate, status: "active" });
    return null;
  },
});
```

---

## Testing

### Run all tests
```bash
bun -F @smog/shared test
bun -F @smog/convex test
bun -F web test
bun -F @smog/hooks test
bun -F native test
```

### Write a new test
```typescript
// packages/shared/src/__tests__/myUtil.test.ts
import { describe, expect, it } from "vitest";
import { myUtil } from "../myUtil";

describe("myUtil", () => {
  it("does the thing", () => {
    expect(myUtil("input")).toBe("expected");
  });
});
```

### Use test factories
```typescript
import { createGesture, createSponsorship, resetFactoryCounters } from "../__tests__/factories";
import { beforeEach } from "vitest";

beforeEach(() => resetFactoryCounters());

const gesture = createGesture({ name: "Custom Name" });
const sponsorship = createSponsorship({ gestureId: gesture.id, status: "active" });
```

---

## Linting & Type Checking

```bash
# Fix all auto-fixable issues
bun check

# Type-check all packages
bun check-types

# Type-check a single package
bun -F @smog/shared check-types
bun -F native check-types
bun -F web check-types
```
