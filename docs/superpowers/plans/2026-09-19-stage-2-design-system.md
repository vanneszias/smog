# Stage 2: Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A token package both platforms consume and a complete web component library, so Stages 3 through 5 assemble pages from finished parts instead of inventing a button each time.

**Architecture:** One source of truth for design tokens in `@smog/styles`, emitted as CSS custom properties for web and a plain object for native. Web components live in `packages/ui-web` as thin, typed wrappers over Radix primitives styled with Tailwind v4 utilities bound to those tokens. A kitchen-sink route renders every component in every state, which is how the library gets reviewed and how visual regressions get caught.

**Tech Stack:** Tailwind CSS v4, Radix UI, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`, Vitest, `@testing-library/react`, `jsdom`.

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

**Prerequisite:** Stage 0 complete. Stage 1 is not required — this stage touches no collections — so it may run in parallel with Stage 1 if two people are working.

## Global Constraints

Inherits all Stage 0 global constraints. Additionally:

- **The brand palette is fixed.** `#00805F` primary, `#97C699` secondary, `#EE971C` accent, `#F0C814` warning, `#FF3B30` error. These come from brand guidelines and are not open to redesign. Everything around them is.
- Every color pairing used for text must meet **WCAG AA**: 4.5:1 for body text, 3:1 for large text and UI boundaries. This is tested, not eyeballed.
- Components take `className` and merge it last through `cn()`, so a consumer can always override. A component that cannot be overridden gets reimplemented by the first person who needs it different.
- No component fetches data, reads a router, or imports from `apps/`. They take props and render. Domain components take already-loaded data.
- Every interactive component forwards its `ref` and spreads remaining props onto the underlying element.
- Icons come from `lucide-react`, already a dependency of the current web app.
- No component library dependency beyond Radix. Not shadcn as a package, not a UI kit — Radix primitives plus our own styling, which is what `apps/web/src/components/ui` already does.

## Review Focus

Five failure modes the spec implies that no component's happy-path test would catch:

1. **Token drift between platforms.** Web reads CSS variables, native reads a JS object; nothing structurally stops them diverging. Task 1 tests both exports derive from the same source.
2. **Contrast failures in dark mode.** The brand green on a dark surface is the likely offender. Task 2 tests every semantic foreground/background pair in both themes.
3. **A `className` prop that silently loses.** `cn()` must let a caller's `bg-red-500` beat a variant's `bg-primary`; naive template-string concatenation leaves the winner up to CSS source order. Task 3 tests override precedence directly.
4. **Keyboard traps in overlays.** Dialog, Sheet and DropdownMenu must close on Escape and return focus to their trigger. Task 6 tests focus return, which is the half people forget.
5. **Long content breaking layout.** Gesture names vary from two characters to a full phrase, and the seed fixtures include a deliberately long one. Task 7 tests GestureCard renders a long name without overflowing its container.

---

### Task 1: Rewrite `@smog/styles` as the cross-platform token source

**Files:**
- Create: `packages/styles/src/tokens.ts`
- Create: `packages/styles/src/tokens.test.ts`
- Create: `packages/styles/src/css.ts`
- Create: `packages/styles/src/css.test.ts`
- Modify: `packages/styles/src/index.ts`
- Delete: `packages/styles/src/colors.ts`, `packages/styles/src/constants.ts`, `packages/styles/src/shadows.ts`, `packages/styles/src/theme.ts`

**Interfaces:**
- Consumes: the existing brand palette values.
- Produces: `tokens` (nested object, native-consumable), `toCssVariables(tokens, theme): string` from `packages/styles`.

The current package exports four flat objects with React Native units baked in. The rewrite keeps every brand value and restructures around semantic roles, because `colors.primary` tells a component author nothing about whether it is safe to put text on.

- [ ] **Step 1: Write the failing test**

Create `packages/styles/src/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tokens } from "./tokens";

describe("tokens", () => {
  it("preserves the brand primary", () => {
    expect(tokens.color.brand.primary).toBe("#00805F");
  });

  it("preserves the brand secondary and accent", () => {
    expect(tokens.color.brand.secondary).toBe("#97C699");
    expect(tokens.color.brand.accent).toBe("#EE971C");
  });

  it("defines a light and a dark semantic theme", () => {
    expect(tokens.semantic.light).toBeDefined();
    expect(tokens.semantic.dark).toBeDefined();
  });

  it("defines the same semantic keys in both themes", () => {
    expect(Object.keys(tokens.semantic.light).sort()).toEqual(
      Object.keys(tokens.semantic.dark).sort()
    );
  });

  it("exposes a spacing scale in unitless numbers so native can use it", () => {
    expect(typeof tokens.spacing.md).toBe("number");
  });

  it("exposes a type scale with matching line heights", () => {
    expect(Object.keys(tokens.fontSize).sort()).toEqual(
      Object.keys(tokens.lineHeight).sort()
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F @smog/styles test`
Expected: FAIL — `Failed to resolve import "./tokens"`.

- [ ] **Step 3: Implement the tokens**

Create `packages/styles/src/tokens.ts`. Structure:

- `color.brand` — the five fixed brand values, unchanged.
- `color.neutral` — a 50–950 grey ramp.
- `color.brandScale` — primary and accent expanded to 50–950 ramps, generated around the fixed brand value so `primary.600` *is* `#00805F`.
- `semantic.light` and `semantic.dark` — role names pointing at ramp values: `background`, `surface`, `surfaceRaised`, `border`, `borderStrong`, `foreground`, `foregroundMuted`, `primary`, `primaryForeground`, `accent`, `accentForeground`, `success`, `successForeground`, `warning`, `warningForeground`, `danger`, `dangerForeground`, `ring`.
- `spacing` — unitless numbers on a 4px base: `0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24`. Keep `xs`/`sm`/`md`/`lg`/`xl` aliases mapping to the existing values (4, 8, 16, 24, 32) so the native app's current code keeps compiling until Stage 8 replaces it.
- `radius` — `sm: 8, md: 12, lg: 16, xl: 20, full: 9999`, matching the existing `BORDER_RADIUS`.
- `fontSize` and `lineHeight` — matching key sets.
- `duration` — `fast: 150, normal: 250, slow: 350`, matching the existing `ANIMATION_DURATION`.
- `shadow` — elevation levels defined per platform in Stage 8; web values here.

Export as `export const tokens = { ... } as const`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F @smog/styles test`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing test for CSS emission**

Review Focus item 1. The web and native exports must be provably the same data.

Create `packages/styles/src/css.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toCssVariables } from "./css";
import { tokens } from "./tokens";

describe("toCssVariables", () => {
  it("emits a variable for every semantic role", () => {
    const css = toCssVariables(tokens, "light");
    for (const role of Object.keys(tokens.semantic.light)) {
      expect(css).toContain(`--color-${kebab(role)}:`);
    }
  });

  it("emits the brand primary unchanged", () => {
    expect(toCssVariables(tokens, "light")).toContain("#00805F");
  });

  it("emits spacing with px units, because CSS needs them", () => {
    expect(toCssVariables(tokens, "light")).toContain("--spacing-md: 16px");
  });

  it("produces different values for light and dark", () => {
    expect(toCssVariables(tokens, "light")).not.toBe(
      toCssVariables(tokens, "dark")
    );
  });
});

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun -F @smog/styles test css`
Expected: FAIL — `Failed to resolve import "./css"`.

- [ ] **Step 7: Implement CSS emission**

Create `packages/styles/src/css.ts` exporting `toCssVariables(tokens, theme: "light" | "dark"): string`, walking the semantic map for the given theme plus the spacing, radius, font-size and duration scales, kebab-casing keys and appending `px` to the numeric scales.

Native consumes `tokens` directly and never calls this. That is the whole guarantee: one object, two renderings.

- [ ] **Step 8: Run the test, replace the old exports, and commit**

```bash
bun -F @smog/styles test
git rm packages/styles/src/colors.ts packages/styles/src/constants.ts \
       packages/styles/src/shadows.ts packages/styles/src/theme.ts
```

Re-export the old names from `index.ts` as deprecated aliases derived from `tokens`, so `apps/native` and `apps/web` keep building during the parallel run. Mark each with a `@deprecated` JSDoc naming Stage 10 as its removal.

Run: `bun check-types` across the workspace to confirm nothing broke.

```bash
git add packages/styles
git commit -m "feat(styles): restructure tokens as cross-platform source of truth"
```

---

### Task 2: Contrast verification

**Files:**
- Create: `packages/styles/src/contrast.ts`
- Create: `packages/styles/src/contrast.test.ts`

**Interfaces:**
- Consumes: `tokens` from Task 1.
- Produces: `contrastRatio(foreground: string, background: string): number`.

Review Focus item 2. Brand green on a dark surface is the likely offender, and finding that in Stage 3 by squinting at a screenshot is worse than finding it here with a number.

- [ ] **Step 1: Write the failing test**

Create `packages/styles/src/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { tokens } from "./tokens";

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#00805F", "#00805F")).toBeCloseTo(1, 2);
  });
});

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const s = tokens.semantic[theme];

  const bodyPairs: [string, string, string][] = [
    ["foreground on background", s.foreground, s.background],
    ["foreground on surface", s.foreground, s.surface],
    ["foregroundMuted on background", s.foregroundMuted, s.background],
    ["primaryForeground on primary", s.primaryForeground, s.primary],
    ["accentForeground on accent", s.accentForeground, s.accent],
    ["dangerForeground on danger", s.dangerForeground, s.danger],
    ["warningForeground on warning", s.warningForeground, s.warning],
    ["successForeground on success", s.successForeground, s.success],
  ];

  it.each(bodyPairs)("%s meets AA body text", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  const uiPairs: [string, string, string][] = [
    ["border on background", s.border, s.background],
    ["ring on background", s.ring, s.background],
  ];

  it.each(uiPairs)("%s meets AA for UI boundaries", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F @smog/styles test contrast`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement the ratio function**

Create `packages/styles/src/contrast.ts` implementing the WCAG 2.1 relative luminance formula: parse the hex to sRGB, linearize each channel (`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055) ** 2.4`), weight `0.2126 R + 0.7152 G + 0.0722 B`, then `(lighter + 0.05) / (darker + 0.05)`.

- [ ] **Step 4: Run the tests and fix the tokens, not the test**

Run: `bun -F @smog/styles test contrast`

Pairs will fail. When they do, adjust the *token* — pick a different step on the ramp — until it passes. Do not lower a threshold and do not delete a pair. `#00805F` itself is fixed, but which surface it sits on and which foreground sits on it are both free.

- [ ] **Step 5: Commit**

```bash
git add packages/styles
git commit -m "feat(styles): verify WCAG AA contrast for all semantic pairs"
```

---

### Task 3: Scaffold `packages/ui-web` and the `cn` utility

**Files:**
- Create: `packages/ui-web/package.json`, `tsconfig.json`, `src/index.ts`
- Create: `packages/ui-web/src/lib/cn.ts`
- Create: `packages/ui-web/src/lib/cn.test.ts`
- Create: `packages/ui-web/src/styles/theme.css`
- Modify: `turbo.json`, root `package.json`

**Interfaces:**
- Consumes: `@smog/styles` from Tasks 1 and 2.
- Produces: `cn(...inputs: ClassValue[]): string`; the `@smog/ui-web` package; `theme.css` declaring the token variables under `:root` and `.dark`.

- [ ] **Step 1: Create the package**

`packages/ui-web/package.json` with name `@smog/ui-web`, `"type": "module"`, exports pointing at `src/index.ts`, dependencies on `@smog/styles`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` and the Radix packages, peer dependencies on `react` and `react-dom`, and scripts for `check-types` and `test`.

Register `@smog/ui-web` in the root workspace and confirm `turbo.json` already covers its `build`, `check-types` and `test` tasks.

- [ ] **Step 2: Write the failing test for `cn`**

Review Focus item 3.

Create `packages/ui-web/src/lib/cn.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later conflicting utility win", () => {
    expect(cn("bg-primary", "bg-red-500")).toBe("bg-red-500");
  });

  it("lets a caller className override a variant class", () => {
    const variant = "px-4 py-2 bg-primary text-primary-foreground";
    expect(cn(variant, "bg-red-500")).toContain("bg-red-500");
    // Split, don't substring: `hover:bg-primary/90` contains "bg-primary".
    expect(cn(variant, "bg-red-500").split(/\s+/)).not.toContain("bg-primary");
  });

  it("keeps non-conflicting utilities from both sides", () => {
    expect(cn("px-4 bg-primary", "bg-red-500")).toContain("px-4");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun -F @smog/ui-web test`
Expected: FAIL — `Failed to resolve import "./cn"`.

- [ ] **Step 4: Implement `cn`**

Create `packages/ui-web/src/lib/cn.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

`twMerge` is what makes the override test pass; `clsx` alone would return both classes and leave the winner to CSS source order.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun -F @smog/ui-web test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Emit the theme stylesheet**

Create `packages/ui-web/src/styles/theme.css` containing a Tailwind v4 `@theme` block that maps the token CSS variables into Tailwind's namespace, so `bg-primary`, `text-foreground` and `rounded-md` resolve to tokens rather than Tailwind defaults. Declare light values under `:root` and dark overrides under `.dark`.

Generate the variable declarations with `toCssVariables` from Task 1 rather than typing them, and commit the generated output with a header comment naming the generator. A hand-maintained copy is Review Focus item 1 waiting to happen.

- [ ] **Step 7: Commit**

```bash
git add packages/ui-web turbo.json package.json
git commit -m "feat(ui-web): scaffold web component package with token-bound theme"
```

---

### Task 4: `Button` — the reference implementation

**Files:**
- Create: `packages/ui-web/src/components/Button.tsx`
- Create: `packages/ui-web/src/components/Button.test.tsx`
- Modify: `packages/ui-web/src/index.ts`

**Interfaces:**
- Consumes: `cn` from Task 3.
- Produces: `Button`, `buttonVariants`, `type ButtonProps`. Variants `primary | secondary | outline | ghost | danger`; sizes `sm | md | lg | icon`.

Every later component follows this file's shape: a `cva` config, a forwarded ref, `cn(variants, className)` last, props spread onto the element, Radix `asChild` support where a consumer may need to render a different tag.

- [ ] **Step 1: Write the failing test**

Create `packages/ui-web/src/components/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Opslaan</Button>);
    expect(screen.getByRole("button", { name: "Opslaan" })).toBeDefined();
  });

  // Assert against the CLASS LIST, never a substring of `className`.
  // `expect(className).not.toContain("bg-primary")` cannot pass: the primary
  // variant also carries `hover:bg-primary/90`, and that string contains
  // "bg-primary". Worse, the substring form is exactly the assertion that
  // still passes when the merge is broken and both classes are emitted — it
  // is the bug it is supposed to catch, wearing the shape of a test.
  // Tasks 5 through 7 copy this helper, not the substring form.
  const classesOf = (el: Element) => el.className.split(/\s+/).filter(Boolean);

  it("defaults to the primary variant", () => {
    render(<Button>Opslaan</Button>);
    expect(classesOf(screen.getByRole("button"))).toContain("bg-primary");
  });

  it("lets className override a variant class", () => {
    render(<Button className="bg-red-500">Opslaan</Button>);
    const classes = classesOf(screen.getByRole("button"));
    expect(classes).toContain("bg-red-500");
    expect(classes).not.toContain("bg-primary");
  });

  it("forwards a ref to the button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Opslaan</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads arbitrary props onto the element", () => {
    render(<Button data-testid="save">Opslaan</Button>);
    expect(screen.getByTestId("save")).toBeDefined();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Opslaan
      </Button>
    );
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks itself busy and disabled while loading", () => {
    render(<Button loading>Opslaan</Button>);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button).toHaveProperty("disabled", true);
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/gebaren">Gebaren</a>
      </Button>
    );
    expect(screen.getByRole("link", { name: "Gebaren" })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F @smog/ui-web test Button`
Expected: FAIL — `Failed to resolve import "./Button"`.

- [ ] **Step 3: Implement the component**

Create `packages/ui-web/src/components/Button.tsx`:

```tsx
import { Slot, Slottable } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-surface text-foreground border border-border hover:bg-surface-raised",
        outline: "border border-border-strong bg-transparent hover:bg-surface",
        ghost: "bg-transparent hover:bg-surface",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref
  ) => {
    const Component = asChild ? Slot : "button";

    return (
      <Component
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        ref={ref}
        {...props}
      >
        {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
        {/*
          `Slottable` is load-bearing, not decoration. With `asChild`,
          `Component` is Radix's `Slot`, which calls `React.Children.only`.
          A bare `{children}` alongside the spinner expression hands it two
          children — `null` counts — so EVERY `asChild` use throws, not only
          the loading one. `Slottable` marks which child the slot replaces.
        */}
        <Slottable>{children}</Slottable>
      </Component>
    );
  }
);

Button.displayName = "Button";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F @smog/ui-web test Button`
Expected: PASS, 8 tests.

- [ ] **Step 5: Export and commit**

Add `export * from "./components/Button";` to `packages/ui-web/src/index.ts`.

```bash
git add packages/ui-web
git commit -m "feat(ui-web): add Button as the reference component implementation"
```

---

### Task 5: Form primitives

**Files:**
- Create: `packages/ui-web/src/components/{Input,Textarea,Label,Select,Checkbox,Switch,Field}.tsx` and a `.test.tsx` beside each
- Modify: `packages/ui-web/src/index.ts`

**Interfaces:**
- Consumes: `cn`, `buttonVariants` sizing conventions from Task 4.
- Produces: `Input`, `Textarea`, `Label`, `Select`, `Checkbox`, `Switch`, `Field`.

Each follows Task 4's file shape exactly: `cva` config, forwarded ref, `cn(variants, className)` last, props spread.

- [ ] **Step 1: Write the shared contract tests**

For each of `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, write a test file asserting: it renders, it forwards its ref to the underlying element, `className` overrides a default utility (same assertion shape as the Button test), it spreads arbitrary props, it reflects `disabled`, and it associates with a `Label` via `htmlFor`/`id`.

- [ ] **Step 2: Write the `Field` test**

`Field` is the wrapper that makes accessible forms the default rather than a thing each page remembers. Test that it renders a label bound to its control, renders help text referenced by `aria-describedby`, renders an error message referenced by `aria-describedby` and sets `aria-invalid` on the control, and that error replaces help text rather than stacking with it.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun -F @smog/ui-web test`
Expected: FAIL for each new component — unresolved imports.

- [ ] **Step 4: Implement the components**

`Input` and `Textarea` are plain elements with a shared `cva` base:
`"w-full rounded-md border border-border bg-surface px-3 text-foreground placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"`, sizes `sm: h-8 text-sm`, `md: h-10 text-base`, `lg: h-12 text-lg`, and an `invalid` boolean variant adding `border-danger focus-visible:ring-danger`.

`Label` wraps `@radix-ui/react-label`. `Select` wraps `@radix-ui/react-select`, `Checkbox` wraps `@radix-ui/react-checkbox`, `Switch` wraps `@radix-ui/react-switch` — all three already dependencies of the current web app, so the Radix versions are known good.

`Field` takes `label`, `htmlFor`, `help`, `error` and `children`, generates ids with `useId` when not supplied, wires `aria-describedby` and `aria-invalid` onto the child via `cloneElement`, and renders the error in place of the help text.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun -F @smog/ui-web test`
Expected: PASS.

- [ ] **Step 6: Export and commit**

```bash
git add packages/ui-web
git commit -m "feat(ui-web): add form primitives and accessible Field wrapper"
```

---

### Task 6: Layout, feedback and overlay components

**Files:**
- Create: `packages/ui-web/src/components/{Card,Badge,Skeleton,EmptyState,Avatar,Tabs,Table,Pagination,Toast,Dialog,Sheet,DropdownMenu,Tooltip}.tsx` and a `.test.tsx` beside each
- Modify: `packages/ui-web/src/index.ts`

**Interfaces:**
- Consumes: `cn` from Task 3.
- Produces: the thirteen components above.

- [ ] **Step 1: Write the failing overlay focus tests**

Review Focus item 4. Focus *return* is the half that gets forgotten, and it is what makes a dialog usable by keyboard.

For `Dialog`, `Sheet` and `DropdownMenu`, write a test that renders the component with a trigger button, opens it, asserts the content is present, presses Escape, asserts the content is gone, and asserts `document.activeElement` is the trigger again.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTrigger } from "./Dialog";

describe("Dialog", () => {
  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger>Openen</DialogTrigger>
        <DialogContent>Inhoud</DialogContent>
      </Dialog>
    );

    const trigger = screen.getByRole("button", { name: "Openen" });
    await user.click(trigger);
    expect(screen.getByText("Inhoud")).toBeDefined();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Inhoud")).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
```

- [ ] **Step 2: Write the remaining component tests**

For each of the other ten, assert: it renders, `className` overrides a default utility, it spreads props, and its one behavioral contract — `Badge` reflects its `variant`; `Skeleton` sets `aria-hidden`; `EmptyState` renders title, description and an optional action; `Tabs` switches panels on click and on arrow keys; `Table` renders a caption for screen readers; `Pagination` disables previous on page 1 and next on the last page; `Toast` announces via `role="status"`; `Tooltip` shows on focus, not only on hover; `Avatar` falls back to initials when the image fails.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun -F @smog/ui-web test`
Expected: FAIL for each — unresolved imports.

- [ ] **Step 4: Implement the components**

`Card`, `Badge`, `Skeleton`, `EmptyState`, `Pagination` and `Table` are our own markup. `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Tabs` and `Avatar` wrap the corresponding Radix primitives — Radix already handles focus return, so the test in Step 1 is verifying the wiring, not reimplementing it. `Toast` wraps `sonner`, already a dependency of the current web app.

`Sheet` is `@radix-ui/react-dialog` with side-anchored positioning and a `side` variant of `top | right | bottom | left`; it exists because the mobile-width navigation and filter panels need it and a centered dialog is wrong for both.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun -F @smog/ui-web test`
Expected: PASS.

- [ ] **Step 6: Export and commit**

```bash
git add packages/ui-web
git commit -m "feat(ui-web): add layout, feedback and overlay components"
```

---

### Task 7: Domain components

**Files:**
- Create: `packages/ui-web/src/domain/{GestureCard,GestureGrid,SearchBar,CategoryFilter,VideoPlayer,StatusBadge}.tsx` and a `.test.tsx` beside each
- Modify: `packages/ui-web/src/index.ts`

**Interfaces:**
- Consumes: the primitives from Tasks 4 through 6.
- Produces: the six domain components. All take already-loaded data as props; none fetch, none read a router.

- [ ] **Step 1: Write the failing GestureCard tests**

Review Focus item 5. The seed fixtures include a deliberately long gesture name for exactly this.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GestureCard } from "./GestureCard";

const gesture = {
  id: "1",
  name: "Hallo",
  categories: [{ id: "c1", name: "Begroetingen" }],
  playbackId: "pb-1",
};

describe("GestureCard", () => {
  it("renders the gesture name", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.getByText("Hallo")).toBeDefined();
  });

  it("renders its category names", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.getByText("Begroetingen")).toBeDefined();
  });

  it("truncates a long name instead of overflowing", () => {
    const long = { ...gesture, name: "Een heel erg lang gebaar voor iets ingewikkelds" };
    render(<GestureCard gesture={long} />);
    expect(screen.getByText(long.name).className).toContain("truncate");
  });

  it("calls onFavorite with the gesture id", async () => {
    const onFavorite = vi.fn();
    render(<GestureCard gesture={gesture} onFavorite={onFavorite} />);
    screen.getByRole("button", { name: /favoriet/i }).click();
    expect(onFavorite).toHaveBeenCalledWith("1");
  });

  it("reflects the favorited state for screen readers", () => {
    render(<GestureCard gesture={gesture} isFavorite onFavorite={() => {}} />);
    expect(
      screen.getByRole("button", { name: /favoriet/i }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("omits the favorite button when no handler is given", () => {
    render(<GestureCard gesture={gesture} />);
    expect(screen.queryByRole("button", { name: /favoriet/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Write the remaining domain tests**

`GestureGrid`: renders one card per gesture, renders an `EmptyState` for an empty array, renders skeletons when `loading`.
`SearchBar`: debounces `onSearch` by 300ms, clears on the clear button, submits on Enter without waiting for the debounce.
`CategoryFilter`: renders a toggle per category, calls `onChange` with the full next selection, shows a count when any are selected.
`VideoPlayer`: renders a Mux player for a `playbackId`, renders a skeleton until ready, renders an error state for a missing id.
`StatusBadge`: maps each of the seven `SPONSORSHIP_STATUSES` values from `@smog/config` to a distinct label and variant, and does not throw on an unknown status.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun -F @smog/ui-web test domain`
Expected: FAIL — unresolved imports.

- [ ] **Step 4: Implement the components**

`VideoPlayer` wraps `@mux/mux-player-react`, already a dependency of the current web app. `StatusBadge` imports `SPONSORSHIP_STATUSES` from `@smog/config` rather than redeclaring the seven strings — one list, published by Stage 1 Task 6. Add `@smog/config` to `packages/ui-web`'s dependencies as `"workspace:*"`. Do not reach for the generated Payload types here: they give a type union, not the runtime array the badge needs to map.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun -F @smog/ui-web test domain`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-web
git commit -m "feat(ui-web): add domain components"
```

---

### Task 8: Kitchen-sink route

**Files:**
- Create: `apps/site/src/app/(frontend)/kitchen-sink/page.tsx`
- Create: `apps/site/src/app/(frontend)/kitchen-sink/sections/*.tsx`
- Modify: `apps/site/src/app/(frontend)/layout.tsx`
- Modify: `apps/site/package.json`

**Interfaces:**
- Consumes: every export of `@smog/ui-web`.
- Produces: `/kitchen-sink`, rendering every component in every state in both themes.

This is how the library gets reviewed. A component nobody has looked at rendered next to its siblings is a component with an inconsistency nobody has noticed.

- [ ] **Step 1: Wire the theme into the app**

Add `@smog/ui-web` as a dependency of `apps/site`, import `theme.css` in the frontend layout, and add a theme toggle that sets `.dark` on `<html>`.

- [ ] **Step 2: Build the page**

One section per component group — form, feedback, overlay, domain — each rendering every variant, every size, and the disabled, loading, error and empty states. Use the Stage 1 seed fixtures for the domain components so the content is real.

- [ ] **Step 3: Verify both themes by eye**

Run `bun -F site dev`, open `http://localhost:3003/kitchen-sink`, and check every section in light and dark. This is the one step in this stage that is not automated, and it is the one that catches the spacing that is one step off.

- [ ] **Step 4: Verify the whole suite**

Run: `bun check && bun check-types && bun test`
Expected: all clean across the workspace.

- [ ] **Step 5: Exclude the route from production**

The kitchen sink is a development tool. Guard the page so it returns a 404 when `NODE_ENV === "production"`, rather than shipping an unlinked page that search engines find anyway.

- [ ] **Step 6: Commit**

```bash
git add apps/site
git commit -m "feat(site): add kitchen-sink route for design system review"
```

---

## Stage 2 exit criteria

- [ ] `@smog/styles` exports one token object; web CSS variables are generated from it, not hand-written.
- [ ] Every semantic foreground/background pair passes WCAG AA in both light and dark, verified by test.
- [ ] `cn()` lets a caller's `className` beat a variant class, verified by test.
- [ ] Every component forwards its ref, spreads props and accepts `className`.
- [ ] Dialog, Sheet and DropdownMenu close on Escape and return focus to their trigger, verified by test.
- [ ] GestureCard renders a long name without overflowing, verified by test.
- [ ] `/kitchen-sink` renders every component in every state, reviewed in both themes.
- [ ] The kitchen sink 404s in production.
- [ ] `bun check`, `bun check-types` and `bun test` pass across the workspace.
