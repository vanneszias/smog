# Stage 1: Content Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Convex table exists as a Payload collection with localization, access control and search working, so an admin can manage the full content model through the generated admin panel.

**Architecture:** Collections are defined one per file under `apps/site/src/collections/`. Access control lives in pure, separately tested functions under `apps/site/src/access/` rather than inline in collection configs, because inline predicates are the single hardest thing to review in a Payload codebase. Two Convex tables disappear into field types.

**Tech Stack:** Payload 3.89.0, `@payloadcms/db-d1-sqlite`, `@payloadcms/plugin-search`, `@payloadcms/richtext-lexical`, Vitest.

**Spec:** [`../specs/2026-09-19-payload-migration-design.md`](../specs/2026-09-19-payload-migration-design.md)

**Prerequisite:** Stage 0 complete, including `docs/superpowers/specs/2026-09-19-stage-0-findings.md`. If Gate 3 concluded bun is unworkable, substitute `pnpm` for `bun` in every command below.

## Global Constraints

Inherits all Stage 0 global constraints. Additionally:

- Locales are exactly `en`, `nl`, `fr`, with **`nl` as default** and fallback enabled. Existing content is Dutch.
- Localized fields are exactly: `gestures.name`, `gestures.info`, `gestures.concepts`, `categories.name`. Nothing else. Adding localization to a field later is a migration; adding it speculatively is admin-panel clutter and a translation debt.
- **Never combine `required: true` with `localized: true`.** Payload validates required
  localized fields per-locale, so an editor working in `fr` cannot save the document at all —
  not even to toggle an unrelated non-localized field — until they type a French value. With
  `en` and `fr` starting empty, that makes the admin unusable in two of three locales.

  The policy is: **the default locale is the source of truth; translations are optional.**
  Enforce it with a validator that only demands a value when `req.locale` is the default,
  instead of dropping the requirement entirely:

  ```ts
  validate: (value: unknown, { req }: { req: { locale?: string } }) => {
    if (req.locale && req.locale !== "nl") {
      return true;
    }
    return typeof value === "string" && value.trim() !== ""
      ? true
      : "A Dutch value is required.";
  },
  ```

  Check the real `validate` signature against the installed Payload rather than copying this
  sketch verbatim. Test both branches: empty in `nl` fails, empty in `fr` passes.
- Collection slugs are kebab-case and plural: `gestures`, `categories`, `users`, `lists`, `sponsorships`, `media`, `admin-logs`, `user-consents`.
- Every schema change is followed by `bunx payload migrate:create <name>` and the migration is committed with the code that needs it.
- Access control functions never appear inline in a collection config. They are imported from `apps/site/src/access/`.
- Sponsorship `status` values are exactly the seven that exist today: `pending_payment`, `pending_approval`, `pending_resubmission`, `active`, `expired`, `rejected`, `cancelled`. Do not invent, rename or drop one; the Mollie flow and existing production rows depend on these strings.

## Review Focus

Five failure modes the spec implies that no task's happy-path test would catch:

1. **A non-admin reading inactive gestures.** `isActive` gates public visibility, and an access function that returns `true` instead of a `Where` clause leaks unpublished content. Task 3 tests the anonymous case returns a filter, not a boolean.
2. **A share token of `undefined` matching every list.** Lists with no `viewShareToken` must not be readable by a request that supplies no token — a naive equality query matches null to null. Task 5 tests this explicitly.
3. **Locale fallback returning an empty string rather than Dutch.** A gesture with no French translation must serve Dutch, not blank. Task 2 tests a read in an untranslated locale.
4. **Array reordering losing items.** `lists.items` replaces a position integer; a reorder that drops or duplicates a gesture is silent data loss. Task 5 tests a reorder round-trip preserves the exact set.
5. **Search index drifting from its source.** The search collection is synced by hooks, so a gesture renamed or deactivated must update or leave the index. Task 7 tests that deactivating a gesture removes it from search results.

---

### Task 1: Locale configuration and the `categories` collection

**Files:**
- Create: `apps/site/src/collections/Categories.ts`
- Create: `apps/site/src/collections/Categories.test.ts`
- Modify: `apps/site/src/payload.config.ts`

**Interfaces:**
- Consumes: the Payload config from Stage 0.
- Produces: the `categories` collection with a localized `name: string` and `isActive: boolean`; locale codes `en` | `nl` | `fr` available to every later collection.

- [ ] **Step 1: Write the failing test**

Create `apps/site/src/collections/Categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Categories } from "./Categories";

describe("Categories collection", () => {
  it("uses the categories slug", () => {
    expect(Categories.slug).toBe("categories");
  });

  it("localizes the name field", () => {
    const name = Categories.fields.find(
      (field) => "name" in field && field.name === "name"
    );
    expect(name).toBeDefined();
    expect(name).toHaveProperty("localized", true);
  });

  it("does not mark the localized name required", () => {
    const name = Categories.fields.find(
      (field) => "name" in field && field.name === "name"
    );
    expect(name).not.toHaveProperty("required", true);
  });

  it("defaults isActive to true so new categories are visible", () => {
    const isActive = Categories.fields.find(
      (field) => "name" in field && field.name === "isActive"
    );
    expect(isActive).toHaveProperty("defaultValue", true);
  });

  it("uses name as the admin title", () => {
    expect(Categories.admin?.useAsTitle).toBe("name");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test Categories`
Expected: FAIL — `Failed to resolve import "./Categories"`.

- [ ] **Step 3: Implement the collection**

Create `apps/site/src/collections/Categories.ts`:

```ts
import type { CollectionConfig, TextFieldSingleValidation } from "payload";
import { defaultLocaleRequired } from "@/fields/defaultLocaleRequired";

/**
 * The Dutch (`nl`) value is the source of truth; translations are optional.
 * See `defaultLocaleRequired` for why this isn't a field-level `required: true`.
 */
export const validateName: TextFieldSingleValidation =
  defaultLocaleRequired<string>("A Dutch name is required.");

export const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "isActive", "updatedAt"],
  },
  fields: [
    {
      name: "name",
      type: "text",
      localized: true,
      validate: validateName,
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
    },
  ],
};
```

`name` is deliberately **not** `required`. See the global constraint on localized
fields: a field-level `required` on a localized field locks editors out of every
non-default locale. `defaultLocaleRequired` lives in
`apps/site/src/fields/defaultLocaleRequired.ts` and is shared by every localized
field in this stage — Task 2 extracts it there when `gestures` needs it too.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test Categories`
Expected: PASS, 4 tests.

- [ ] **Step 5: Enable localization and register the collection**

In `apps/site/src/payload.config.ts`, add to `buildConfig`:

```ts
localization: {
  locales: [
    { label: "Nederlands", code: "nl" },
    { label: "English", code: "en" },
    { label: "Français", code: "fr" },
  ],
  defaultLocale: "nl",
  fallback: true,
},
```

and add `Categories` to the `collections` array.

`fallback: true` is what makes an untranslated French page serve Dutch instead of empty strings. Review Focus item 3 depends on it.

- [ ] **Step 6: Generate the migration and types**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_categories
bun run generate:types:payload
```

- [ ] **Step 7: Verify in the admin panel**

Run `bun -F site dev`, open `http://localhost:3003/admin`, create a category with a Dutch name, switch the locale selector to French, and confirm the field is empty for editing but the Dutch value is what a read returns.

- [ ] **Step 8: Commit**

```bash
git add apps/site
git commit -m "feat(site): add localized categories collection"
```

---

### Task 2: The `gestures` collection

**Files:**
- Create: `apps/site/src/collections/Gestures.ts`
- Create: `apps/site/src/collections/Gestures.test.ts`
- Create: `apps/site/src/collections/Gestures.int.test.ts`
- Modify: `apps/site/src/payload.config.ts`

**Interfaces:**
- Consumes: `categories` from Task 1.
- Produces: the `gestures` collection with localized `name: string`, `info: string`, `concepts: string[]`; `categories: Category[]` relationship; `playbackId: string`; `isActive: boolean`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/site/src/collections/Gestures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Gestures } from "./Gestures";

const field = (name: string) =>
  Gestures.fields.find((f) => "name" in f && f.name === name);

describe("Gestures collection", () => {
  it("uses the gestures slug", () => {
    expect(Gestures.slug).toBe("gestures");
  });

  it("localizes name, info and concepts", () => {
    for (const name of ["name", "info", "concepts"]) {
      expect(field(name)).toHaveProperty("localized", true);
    }
  });

  it("relates to many categories", () => {
    expect(field("categories")).toMatchObject({
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
    });
  });

  it("requires a Mux playback id", () => {
    // playbackId is NOT localized, so plain `required` is safe here.
    expect(field("playbackId")).toMatchObject({
      type: "text",
      required: true,
    });
  });

  it("does not mark any localized field required", () => {
    for (const name of ["name", "info", "concepts"]) {
      expect(field(name)).not.toHaveProperty("required", true);
    }
  });

  it("indexes isActive, because every public query filters on it", () => {
    expect(field("isActive")).toHaveProperty("index", true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test Gestures`
Expected: FAIL — `Failed to resolve import "./Gestures"`.

- [ ] **Step 3: Implement the collection**

Task 1 introduced the default-locale validator for `categories.name`. Extract it into
`apps/site/src/fields/defaultLocaleRequired.ts` as a shared helper before using it here —
three more localized fields are about to need it, and a copied validator is a policy that
drifts.

Create `apps/site/src/collections/Gestures.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Gestures: CollectionConfig = {
  slug: "gestures",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "categories", "isActive", "updatedAt"],
  },
  fields: [
    {
      name: "name",
      type: "text",
      localized: true,
      index: true,
      // Not `required` — see the global constraint on localized fields. Use the
      // default-locale validator so a French editor can still save the document.
      validate: defaultLocaleRequired("A Dutch name is required."),
    },
    {
      name: "categories",
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
      required: true,
    },
    {
      name: "playbackId",
      type: "text",
      required: true,
      admin: {
        description: "Mux playback ID for the gesture video.",
      },
    },
    {
      name: "concepts",
      type: "text",
      hasMany: true,
      localized: true,
      admin: {
        description: "Alternative words and synonyms used for search.",
      },
    },
    {
      name: "info",
      type: "textarea",
      localized: true,
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      index: true,
    },
  ],
};
```

`lastUpdated` from the Convex schema is deliberately absent. Payload maintains `updatedAt` itself, and a hand-maintained duplicate is a field that drifts.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test Gestures`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing integration test for locale fallback**

Review Focus item 3. This needs a real Payload instance, not a config assertion.

Create `apps/site/src/collections/Gestures.int.test.ts`:

```ts
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("Gestures locale fallback", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let categoryId: string | number;

  beforeAll(async () => {
    payload = await getPayload({ config });
    const category = await payload.create({
      collection: "categories",
      locale: "nl",
      data: { name: "Begroetingen", isActive: true },
    });
    categoryId = category.id;
  });

  it("serves the Dutch value when the French translation is missing", async () => {
    const created = await payload.create({
      collection: "gestures",
      locale: "nl",
      data: {
        name: "Hallo",
        categories: [categoryId],
        playbackId: "test-playback-id",
        isActive: true,
      },
    });

    const inFrench = await payload.findByID({
      collection: "gestures",
      id: created.id,
      locale: "fr",
      fallbackLocale: "nl",
    });

    expect(inFrench.name).toBe("Hallo");
  });
});
```

- [ ] **Step 6: Run the integration test to verify it fails**

Run: `bun -F site test Gestures.int`
Expected: FAIL — the `gestures` collection is not registered in the config yet.

- [ ] **Step 7: Register the collection**

Add `Gestures` to the `collections` array in `apps/site/src/payload.config.ts`.

- [ ] **Step 8: Run the integration test to verify it passes**

Run: `bun -F site test Gestures.int`
Expected: PASS.

- [ ] **Step 9: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_gestures
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): add localized gestures collection"
```

---

### Task 3: Access control functions

**Files:**
- Create: `apps/site/src/access/index.ts`
- Create: `apps/site/src/access/index.test.ts`
- Modify: `apps/site/src/collections/Gestures.ts`
- Modify: `apps/site/src/collections/Categories.ts`
- Modify: `apps/site/src/collections/Users.ts`

**Interfaces:**
- Consumes: collections from Tasks 1 and 2.
- Produces: `isAdmin`, `isAdminOrSelf`, `publicReadActive`, `isAuthenticated` — all typed `Access` from `payload`.

- [ ] **Step 1: Write the failing test**

Review Focus item 1 is the third case here: an anonymous read must return a `Where` filter, never `true`.

Create `apps/site/src/access/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAdmin, isAdminOrSelf, isAuthenticated, publicReadActive } from ".";

const req = (user: unknown) => ({ req: { user } }) as never;

describe("isAdmin", () => {
  it("allows admins", () => {
    expect(isAdmin(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("denies regular users", () => {
    expect(isAdmin(req({ id: 1, role: "user" }))).toBe(false);
  });

  it("denies anonymous requests", () => {
    expect(isAdmin(req(null))).toBe(false);
  });
});

describe("publicReadActive", () => {
  it("gives admins unrestricted access", () => {
    expect(publicReadActive(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("restricts anonymous reads to active documents with a filter, not a boolean", () => {
    const result = publicReadActive(req(null));
    expect(result).not.toBe(true);
    expect(result).toEqual({ isActive: { equals: true } });
  });

  it("restricts signed-in non-admins the same way", () => {
    expect(publicReadActive(req({ id: 1, role: "user" }))).toEqual({
      isActive: { equals: true },
    });
  });
});

describe("isAdminOrSelf", () => {
  it("allows admins to reach every document", () => {
    expect(isAdminOrSelf(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("restricts a user to their own document", () => {
    expect(isAdminOrSelf(req({ id: 7, role: "user" }))).toEqual({
      id: { equals: 7 },
    });
  });

  it("denies anonymous requests outright", () => {
    expect(isAdminOrSelf(req(null))).toBe(false);
  });
});

describe("isAuthenticated", () => {
  it("allows any signed-in user", () => {
    expect(isAuthenticated(req({ id: 1, role: "user" }))).toBe(true);
  });

  it("denies anonymous requests", () => {
    expect(isAuthenticated(req(null))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test access`
Expected: FAIL — `Failed to resolve import "."`.

- [ ] **Step 3: Implement the access functions**

Create `apps/site/src/access/index.ts`:

```ts
import type { Access } from "payload";

export const isAdmin: Access = ({ req: { user } }) => user?.role === "admin";

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user);

export const publicReadActive: Access = ({ req: { user } }) => {
  if (user?.role === "admin") {
    return true;
  }

  return { isActive: { equals: true } };
};

export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return { id: { equals: user.id } };
};
```

Returning a `Where` object rather than `true` is the whole point. Payload merges it into the query, so an inactive gesture is not merely hidden from the UI — it is absent from the result set of the REST API, GraphQL and the local API alike.

**`is_active` is nullable in the generated schema, so `equals: true` and
`not_equals: false` are not the same filter.** They differ for NULL rows, and Stage 9
imports Convex data that can produce them. Choose deliberately:

- `equals: true` — NULL rows are **hidden** from the public. Safe default: content is
  invisible until something explicitly marks it active.
- `not_equals: false` — NULL rows are **published**. An import that forgets the column
  silently exposes everything.

This plan uses `equals: true` for exactly that reason. Add a test asserting a row with
a NULL `isActive` is not returned to an anonymous caller, so the choice is pinned rather
than implied.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test access`
Expected: PASS, 11 tests.

- [ ] **Step 5: Apply access control to the collections**

In `Gestures.ts` and `Categories.ts`, add above `fields`:

```ts
access: {
  read: publicReadActive,
  create: isAdmin,
  update: isAdmin,
  delete: isAdmin,
},
```

with `import { isAdmin, publicReadActive } from "../access";`.

In `Users.ts`:

```ts
access: {
  read: isAdminOrSelf,
  create: () => true,
  update: isAdminOrSelf,
  delete: isAdmin,
},
```

`create: () => true` is intentional — public registration. Stage 4 revisits it when social login lands.

- [ ] **Step 6: Add the `role` field to Users**

In `apps/site/src/collections/Users.ts`, add to `fields`:

```ts
{
  name: "role",
  type: "select",
  required: true,
  defaultValue: "user",
  options: [
    { label: "User", value: "user" },
    { label: "Admin", value: "admin" },
  ],
  access: {
    update: ({ req: { user } }) => user?.role === "admin",
  },
  index: true,
},
```

The field-level `access.update` matters more than it looks: without it, any user can PATCH their own document and set `role: "admin"`, because `isAdminOrSelf` already granted them update on the document.

- [ ] **Step 7: Verify the whole suite and types**

Run: `bun -F site test && bun -F site check-types && bun check`
Expected: all clean.

- [ ] **Step 8: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_user_roles
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): add access control functions and user roles"
```

---

### Task 4: Favorites as a relationship field

**Files:**
- Modify: `apps/site/src/collections/Users.ts`
- Create: `apps/site/src/collections/Users.int.test.ts`

**Interfaces:**
- Consumes: `gestures` from Task 2, access control from Task 3.
- Produces: `users.favorites` as `hasMany` relationship to `gestures`.

This task deletes the `user_favorites` table from the design. There is no join collection and no mutation enforcing one-row-per-pair; the relationship field is structurally incapable of the duplicate.

- [ ] **Step 1: Write the failing integration test**

Create `apps/site/src/collections/Users.int.test.ts`:

```ts
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("User favorites", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: string | number;
  let userId: string | number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Test", isActive: true },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        name: "Favoriet",
        categories: [category.id],
        playbackId: "pb-fav",
        isActive: true,
      },
    });
    gestureId = gesture.id;

    const user = await payload.create({
      collection: "users",
      data: {
        email: `fav-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });
    userId = user.id;
  });

  it("stores a favorite", async () => {
    const updated = await payload.update({
      collection: "users",
      id: userId,
      data: { favorites: [gestureId] },
    });

    expect(updated.favorites).toHaveLength(1);
  });

  it("cannot hold the same gesture twice", async () => {
    const updated = await payload.update({
      collection: "users",
      id: userId,
      data: { favorites: [gestureId, gestureId] },
    });

    const ids = (updated.favorites ?? []).map((f) =>
      typeof f === "object" ? f.id : f
    );

    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test Users.int`
Expected: FAIL — `favorites` is not a field on `users`.

- [ ] **Step 3: Add the field**

In `apps/site/src/collections/Users.ts`, add to `fields`:

```ts
{
  name: "favorites",
  type: "relationship",
  relationTo: "gestures",
  hasMany: true,
  admin: {
    description: "Gestures this user has favorited.",
  },
},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test Users.int`
Expected: PASS, 2 tests.

If the deduplication test fails, do not add a hook to dedupe. Report it — Payload's relationship storage is expected to hold the constraint, and a hook papering over it means the field type is wrong for this use.

- [ ] **Step 5: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_user_favorites
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): replace user_favorites join table with a relationship field"
```

---

### Task 5: The `lists` collection with ordered items

**Files:**
- Create: `apps/site/src/collections/Lists.ts`
- Create: `apps/site/src/collections/Lists.test.ts`
- Create: `apps/site/src/collections/Lists.int.test.ts`
- Create: `apps/site/src/access/lists.ts`
- Create: `apps/site/src/access/lists.test.ts`
- Modify: `apps/site/src/payload.config.ts`

**Interfaces:**
- Consumes: `gestures`, `users`, access helpers.
- Produces: the `lists` collection; `listReadAccess` and `listUpdateAccess` from `apps/site/src/access/lists.ts`.

- [ ] **Step 1: Write the failing access test**

Review Focus item 2. A missing token must not match a list that has no token.

Create `apps/site/src/access/lists.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listReadAccess } from "./lists";

const req = (user: unknown, token?: string) =>
  ({
    req: {
      user,
      searchParams: new URLSearchParams(token ? { shareToken: token } : {}),
    },
  }) as never;

describe("listReadAccess", () => {
  it("gives admins everything", () => {
    expect(listReadAccess(req({ id: 1, role: "admin" }))).toBe(true);
  });

  it("gives an owner their own lists", () => {
    expect(listReadAccess(req({ id: 5, role: "user" }))).toEqual({
      owner: { equals: 5 },
    });
  });

  it("matches a supplied share token", () => {
    expect(listReadAccess(req(null, "abc123"))).toEqual({
      viewShareToken: { equals: "abc123" },
    });
  });

  it("denies an anonymous request with no token instead of matching tokenless lists", () => {
    expect(listReadAccess(req(null))).toBe(false);
  });

  it("denies an empty-string token", () => {
    expect(listReadAccess(req(null, ""))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test access/lists`
Expected: FAIL — `Failed to resolve import "./lists"`.

- [ ] **Step 3: Implement list access**

Create `apps/site/src/access/lists.ts`:

```ts
import type { Access } from "payload";

function shareToken(req: { searchParams?: URLSearchParams }): string | null {
  const token = req.searchParams?.get("shareToken");
  return token && token.trim() !== "" ? token : null;
}

export const listReadAccess: Access = ({ req }) => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (req.user) {
    return { owner: { equals: req.user.id } };
  }

  const token = shareToken(req);

  if (!token) {
    return false;
  }

  return { viewShareToken: { equals: token } };
};

export const listUpdateAccess: Access = ({ req }) => {
  if (req.user?.role === "admin") {
    return true;
  }

  if (req.user) {
    return { owner: { equals: req.user.id } };
  }

  const token = shareToken(req);

  if (!token) {
    return false;
  }

  return {
    and: [
      { editShareToken: { equals: token } },
      { allowSharedEditing: { equals: true } },
    ],
  };
};
```

Returning `false` for a tokenless anonymous request is the fix for Review Focus item 2. Returning `{ viewShareToken: { equals: null } }` would have matched every private list in the database.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test access/lists`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing reorder test**

Review Focus item 4.

Create `apps/site/src/collections/Lists.int.test.ts`:

```ts
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("List item ordering", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureIds: (string | number)[];
  let listId: string | number;

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Ordering", isActive: true },
    });

    gestureIds = [];
    for (const name of ["Een", "Twee", "Drie"]) {
      const gesture = await payload.create({
        collection: "gestures",
        data: {
          name,
          categories: [category.id],
          playbackId: `pb-${name}`,
          isActive: true,
        },
      });
      gestureIds.push(gesture.id);
    }

    const owner = await payload.create({
      collection: "users",
      data: {
        email: `list-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "user",
      },
    });

    const list = await payload.create({
      collection: "lists",
      data: {
        name: "Mijn lijst",
        owner: owner.id,
        visibility: "private",
        allowSharedEditing: false,
        isDefaultFavorites: false,
        items: gestureIds.map((gesture) => ({ gesture })),
      },
    });
    listId = list.id;
  });

  it("preserves insertion order", async () => {
    const list = await payload.findByID({ collection: "lists", id: listId });
    const ids = list.items.map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );
    expect(ids).toEqual(gestureIds);
  });

  it("preserves the exact set across a reorder", async () => {
    const reversed = [...gestureIds].reverse();

    const updated = await payload.update({
      collection: "lists",
      id: listId,
      data: { items: reversed.map((gesture) => ({ gesture })) },
    });

    const ids = updated.items.map((item) =>
      typeof item.gesture === "object" ? item.gesture.id : item.gesture
    );

    expect(ids).toEqual(reversed);
    expect(ids).toHaveLength(gestureIds.length);
    expect(new Set(ids)).toEqual(new Set(gestureIds));
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `bun -F site test Lists.int`
Expected: FAIL — the `lists` collection does not exist.

- [ ] **Step 7: Implement the collection**

Create `apps/site/src/collections/Lists.ts`:

```ts
import type { CollectionConfig } from "payload";
import { isAdmin, isAuthenticated } from "../access";
import { listReadAccess, listUpdateAccess } from "../access/lists";

export const Lists: CollectionConfig = {
  slug: "lists",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "owner", "visibility", "updatedAt"],
  },
  access: {
    read: listReadAccess,
    create: isAuthenticated,
    update: listUpdateAccess,
    delete: listUpdateAccess,
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "textarea" },
    {
      name: "owner",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "private",
      options: [
        { label: "Private", value: "private" },
        { label: "Shared", value: "shared" },
      ],
    },
    { name: "viewShareToken", type: "text", index: true, unique: true },
    { name: "editShareToken", type: "text", index: true, unique: true },
    { name: "allowSharedEditing", type: "checkbox", defaultValue: false },
    { name: "isDefaultFavorites", type: "checkbox", defaultValue: false },
    {
      name: "items",
      type: "array",
      labels: { singular: "Gesture", plural: "Gestures" },
      fields: [
        {
          name: "gesture",
          type: "relationship",
          relationTo: "gestures",
          required: true,
        },
        {
          name: "addedBy",
          type: "relationship",
          relationTo: "users",
        },
      ],
    },
  ],
};
```

The `position` integer from `gesture_list_items` is gone. Array order is the order, the admin panel supplies drag handles, and there is no reindexing code to get wrong.

- [ ] **Step 8: Register and run the test to verify it passes**

Add `Lists` to `collections` in `payload.config.ts`, then:

Run: `bun -F site test Lists.int`
Expected: PASS, 2 tests.

- [ ] **Step 9: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_lists
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): add lists collection with ordered array items"
```

---

### Task 6: The `sponsorships` and audit collections

**Files:**
- Create: `packages/config/src/sponsorships.ts`
- Create: `apps/site/src/collections/Sponsorships.ts`
- Create: `apps/site/src/collections/Sponsorships.test.ts`
- Create: `apps/site/src/collections/AdminLogs.ts`
- Create: `apps/site/src/collections/UserConsents.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/package.json`
- Modify: `apps/site/src/payload.config.ts`

**Interfaces:**
- Consumes: `gestures`, `users`, `media`, access helpers.
- Produces: `SPONSORSHIP_STATUSES` (a readonly seven-element tuple) and `type SponsorshipStatus` from `@smog/config`; the `sponsorships`, `admin-logs` and `user-consents` collections. Status hooks and the Mollie flow are Stage 5; this task defines the shape only.

`SPONSORSHIP_STATUSES` lives in `@smog/config`, not in the collection file, because `packages/ui-web` needs the same runtime values for `StatusBadge` in Stage 2 and is forbidden from importing `apps/`. The generated Payload types give a type union, not an array, so they cannot serve this.

- [ ] **Step 1: Write the failing test**

Create `apps/site/src/collections/Sponsorships.test.ts`:

```ts
import { SPONSORSHIP_STATUSES } from "@smog/config";
import { describe, expect, it } from "vitest";
import { Sponsorships } from "./Sponsorships";

describe("Sponsorships collection", () => {
  it("keeps the exact seven statuses the payment flow depends on", () => {
    expect(SPONSORSHIP_STATUSES).toEqual([
      "pending_payment",
      "pending_approval",
      "pending_resubmission",
      "active",
      "expired",
      "rejected",
      "cancelled",
    ]);
  });

  it("exposes every status as a select option", () => {
    const status = Sponsorships.fields.find(
      (f) => "name" in f && f.name === "status"
    ) as { options: { value: string }[] };

    expect(status.options.map((o) => o.value)).toEqual([
      ...SPONSORSHIP_STATUSES,
    ]);
  });

  it("indexes the Mollie payment id, because the webhook looks up by it", () => {
    const field = Sponsorships.fields.find(
      (f) => "name" in f && f.name === "molliePaymentId"
    );
    expect(field).toHaveProperty("index", true);
  });

  it("indexes endDate, because the expiry job scans by it", () => {
    const field = Sponsorships.fields.find(
      (f) => "name" in f && f.name === "endDate"
    );
    expect(field).toHaveProperty("index", true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test Sponsorships`
Expected: FAIL — `Failed to resolve import "./Sponsorships"`.

- [ ] **Step 3: Publish the status list from `@smog/config`**

Create `packages/config/src/sponsorships.ts`:

```ts
/**
 * @fileoverview Sponsorship lifecycle statuses.
 *
 * These exact strings exist in production rows and in the Mollie payment
 * flow. Do not rename, reorder or drop one.
 *
 * Lives here rather than in the Payload collection because `@smog/ui-web`
 * needs the runtime values for StatusBadge and cannot import from `apps/`.
 */
export const SPONSORSHIP_STATUSES = [
  "pending_payment",
  "pending_approval",
  "pending_resubmission",
  "active",
  "expired",
  "rejected",
  "cancelled",
] as const;

export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];
```

Add `export * from "./sponsorships";` to `packages/config/src/index.ts`, and
`"./sponsorships": "./src/sponsorships.ts"` to the `exports` map in
`packages/config/package.json`.

Add `@smog/config` to `apps/site`'s dependencies as `"workspace:*"`.

- [ ] **Step 4: Implement the collection**

Create `apps/site/src/collections/Sponsorships.ts`:

```ts
import { SPONSORSHIP_STATUSES } from "@smog/config";
import type { CollectionConfig } from "payload";
import { isAdmin } from "../access";

export const Sponsorships: CollectionConfig = {
  slug: "sponsorships",
  admin: {
    useAsTitle: "sponsorName",
    defaultColumns: ["sponsorName", "gesture", "status", "endDate"],
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: "gesture",
      type: "relationship",
      relationTo: "gestures",
      required: true,
      index: true,
    },
    { name: "sponsorName", type: "text", required: true },
    { name: "sponsorEmail", type: "email", required: true },
    { name: "contactFullName", type: "text", required: true },
    { name: "contactCompany", type: "text" },
    { name: "overlayText", type: "text", required: true },
    { name: "overlayImage", type: "upload", relationTo: "media" },
    { name: "hasLogo", type: "checkbox", defaultValue: false },
    { name: "originalVideoPlaybackId", type: "text", required: true },
    { name: "previewVideoPlaybackId", type: "text" },
    { name: "sponsoredVideoPlaybackId", type: "text" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending_payment",
      index: true,
      options: SPONSORSHIP_STATUSES.map((value) => ({ label: value, value })),
    },
    { name: "startDate", type: "date", required: true },
    { name: "endDate", type: "date", required: true, index: true },
    { name: "durationYears", type: "number", required: true, defaultValue: 1 },
    { name: "molliePaymentId", type: "text", index: true },
    { name: "paymentAmount", type: "number", required: true },
    { name: "rejectionReason", type: "textarea" },
    { name: "reviewedBy", type: "relationship", relationTo: "users" },
    { name: "reviewedAt", type: "date" },
    { name: "reEditToken", type: "text", index: true },
    { name: "reEditTokenExpiresAt", type: "date" },
    { name: "invoiceRequested", type: "checkbox", defaultValue: false },
    { name: "invoiceName", type: "text" },
    { name: "invoiceVatNumber", type: "text" },
    { name: "invoiceEmail", type: "email" },
    { name: "renewalReminderSentAt", type: "date" },
  ],
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun -F site test Sponsorships`
Expected: PASS, 4 tests.

- [ ] **Step 6: Implement the audit collections**

Create `apps/site/src/collections/AdminLogs.ts`:

```ts
import type { CollectionConfig } from "payload";
import { isAdmin } from "../access";

export const AdminLogs: CollectionConfig = {
  slug: "admin-logs",
  admin: {
    useAsTitle: "action",
    defaultColumns: ["action", "targetType", "user", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: "user", type: "relationship", relationTo: "users", index: true },
    { name: "action", type: "text", required: true, index: true },
    { name: "targetType", type: "text", required: true },
    { name: "targetId", type: "text", required: true },
    { name: "metadata", type: "json" },
  ],
};
```

Create `apps/site/src/collections/UserConsents.ts`:

```ts
import type { CollectionConfig } from "payload";
import { isAdmin } from "../access";

export const UserConsents: CollectionConfig = {
  slug: "user-consents",
  admin: {
    useAsTitle: "consentVersion",
    defaultColumns: ["user", "analyticsConsent", "consentVersion", "createdAt"],
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      index: true,
    },
    { name: "analyticsConsent", type: "checkbox", required: true },
    { name: "marketingConsent", type: "checkbox" },
    { name: "consentVersion", type: "text", required: true },
    { name: "ipAddress", type: "text" },
    { name: "userAgent", type: "text" },
  ],
};
```

Both deny `create`, `update` and `delete` through the API entirely. They are written by collection hooks using the local API with `overrideAccess: true`, which is the only way a legally meaningful audit trail stays trustworthy. The `createdAt` Payload maintains replaces the hand-written timestamp in both.

- [ ] **Step 7: Register all three and verify**

Add `Sponsorships`, `AdminLogs` and `UserConsents` to `collections`, then:

Run: `bun -F site test && bun -F site check-types && bun check`
Expected: all clean.

- [ ] **Step 8: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_sponsorships_and_audit
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): add sponsorships, admin logs and user consents collections"
```

---

### Task 7: Search

**Files:**
- Modify: `apps/site/src/payload.config.ts`
- Create: `apps/site/src/search/beforeSync.ts`
- Create: `apps/site/src/search/beforeSync.test.ts`
- Create: `apps/site/src/search/search.int.test.ts`

**Interfaces:**
- Consumes: `gestures` from Task 2.
- Produces: a `search` collection synced from `gestures`; `beforeSyncGesture` from `apps/site/src/search/beforeSync.ts`.

- [ ] **Step 1: Install the plugin**

```bash
bun add -F site @payloadcms/plugin-search@3.89.0
```

- [ ] **Step 2: Write the failing test for the sync transform**

Create `apps/site/src/search/beforeSync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { beforeSyncGesture } from "./beforeSync";

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: "Hallo",
  concepts: ["hoi", "dag"],
  isActive: true,
  ...overrides,
});

describe("beforeSyncGesture", () => {
  it("copies the gesture name into the search title", () => {
    const result = beforeSyncGesture({ originalDoc: doc(), searchDoc: {} });
    expect(result.title).toBe("Hallo");
  });

  it("flattens concepts into a searchable string", () => {
    const result = beforeSyncGesture({ originalDoc: doc(), searchDoc: {} });
    expect(result.concepts).toBe("hoi dag");
  });

  it("handles a gesture with no concepts", () => {
    const result = beforeSyncGesture({
      originalDoc: doc({ concepts: undefined }),
      searchDoc: {},
    });
    expect(result.concepts).toBe("");
  });

  it("marks inactive gestures so they can be filtered out", () => {
    const result = beforeSyncGesture({
      originalDoc: doc({ isActive: false }),
      searchDoc: {},
    });
    expect(result.isActive).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun -F site test beforeSync`
Expected: FAIL — `Failed to resolve import "./beforeSync"`.

- [ ] **Step 4: Implement the transform**

Create `apps/site/src/search/beforeSync.ts`:

```ts
type GestureDoc = {
  name?: string;
  concepts?: string[];
  isActive?: boolean;
};

export function beforeSyncGesture({
  originalDoc,
  searchDoc,
}: {
  originalDoc: GestureDoc;
  searchDoc: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...searchDoc,
    title: originalDoc.name ?? "",
    concepts: (originalDoc.concepts ?? []).join(" "),
    isActive: originalDoc.isActive ?? false,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun -F site test beforeSync`
Expected: PASS, 4 tests.

- [ ] **Step 6: Configure the plugin**

In `apps/site/src/payload.config.ts`:

```ts
import { searchPlugin } from "@payloadcms/plugin-search";
import { beforeSyncGesture } from "./search/beforeSync";

// inside buildConfig:
plugins: [
  searchPlugin({
    collections: ["gestures"],
    defaultPriorities: { gestures: 10 },
    beforeSync: beforeSyncGesture,
    searchOverrides: {
      fields: ({ defaultFields }) => [
        ...defaultFields,
        { name: "concepts", type: "text", index: true },
        { name: "isActive", type: "checkbox", index: true },
      ],
    },
  }),
],
```

- [ ] **Step 7: Write the failing integration test for index drift**

Review Focus item 5.

Create `apps/site/src/search/search.int.test.ts`:

```ts
import { getPayload } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

describe("Search index sync", () => {
  let payload: Awaited<ReturnType<typeof getPayload>>;
  let gestureId: string | number;

  const searchFor = async (title: string) => {
    const results = await payload.find({
      collection: "search",
      where: { title: { equals: title } },
    });
    return results.docs;
  };

  beforeAll(async () => {
    payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { name: "Zoeken", isActive: true },
    });

    const gesture = await payload.create({
      collection: "gestures",
      data: {
        name: "Zoekterm",
        categories: [category.id],
        playbackId: "pb-search",
        concepts: ["vinden"],
        isActive: true,
      },
    });
    gestureId = gesture.id;
  });

  it("indexes a new gesture", async () => {
    expect(await searchFor("Zoekterm")).toHaveLength(1);
  });

  it("follows a rename", async () => {
    await payload.update({
      collection: "gestures",
      id: gestureId,
      data: { name: "Hernoemd" },
    });

    expect(await searchFor("Zoekterm")).toHaveLength(0);
    expect(await searchFor("Hernoemd")).toHaveLength(1);
  });

  it("marks a deactivated gesture inactive in the index", async () => {
    await payload.update({
      collection: "gestures",
      id: gestureId,
      data: { isActive: false },
    });

    const [doc] = await searchFor("Hernoemd");
    expect(doc?.isActive).toBe(false);
  });
});
```

- [ ] **Step 8: Run the integration test**

Run: `bun -F site test search.int`
Expected: PASS, 3 tests.

If the rename test fails, the plugin's sync hooks are not firing on update — check that `gestures` is listed in `collections` on the plugin, not just registered in the config.

- [ ] **Step 9: Migrate and commit**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bunx payload migrate:create add_search
bun run generate:types:payload
cd ../..
git add apps/site
git commit -m "feat(site): add search plugin synced from gestures"
```

---

### Task 8: Seed script

**Files:**
- Create: `apps/site/src/seed/index.ts`
- Create: `apps/site/src/seed/fixtures.ts`
- Create: `apps/site/src/seed/fixtures.test.ts`
- Modify: `apps/site/package.json`

**Interfaces:**
- Consumes: every collection from Tasks 1 through 7.
- Produces: `bun -F site seed`, which fills an empty database with representative content.

This is not the Stage 9 production migration. It exists so Stages 2 through 5 have something to render against without anyone hand-typing gestures into the admin panel.

- [ ] **Step 1: Write the failing test for the fixtures**

Create `apps/site/src/seed/fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { categoryFixtures, gestureFixtures } from "./fixtures";

describe("seed fixtures", () => {
  it("provides at least three categories", () => {
    expect(categoryFixtures.length).toBeGreaterThanOrEqual(3);
  });

  it("provides at least twenty gestures, enough to exercise pagination", () => {
    expect(gestureFixtures.length).toBeGreaterThanOrEqual(20);
  });

  it("gives every gesture a category that exists", () => {
    const names = new Set(categoryFixtures.map((c) => c.name));
    for (const gesture of gestureFixtures) {
      for (const category of gesture.categories) {
        expect(names).toContain(category);
      }
    }
  });

  it("gives every gesture a playback id", () => {
    for (const gesture of gestureFixtures) {
      expect(gesture.playbackId).toBeTruthy();
    }
  });

  it("includes at least one inactive gesture, so access control is exercised", () => {
    expect(gestureFixtures.some((g) => g.isActive === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun -F site test fixtures`
Expected: FAIL — `Failed to resolve import "./fixtures"`.

- [ ] **Step 3: Write the fixtures**

Create `apps/site/src/seed/fixtures.ts` exporting `categoryFixtures` and `gestureFixtures`. Use real Dutch sign-language vocabulary for the names — placeholder strings like "Gesture 1" make the Stage 3 design work useless, because layouts that only ever hold uniform text hide every wrapping bug.

Categories: `Begroetingen`, `Familie`, `Eten en drinken`, `Getallen`, `Kleuren`.
Gestures: at least twenty across those categories, each with `concepts` synonyms, one with `isActive: false`, and one with a deliberately long name to stress card layouts.

Reuse a single real Mux playback ID from the existing production data for every fixture so videos actually play locally.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun -F site test fixtures`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the seed runner**

Create `apps/site/src/seed/index.ts` that gets a Payload instance, refuses to run when `NODE_ENV === "production"`, creates the categories, maps their names to IDs, creates the gestures against those IDs in the `nl` locale, and creates one admin user and one regular user from environment variables.

- [ ] **Step 6: Add the script**

```json
"seed": "NODE_OPTIONS=--no-deprecation bun run src/seed/index.ts"
```

- [ ] **Step 7: Run it and verify in the admin panel**

```bash
cd apps/site
export CLOUDFLARE_ENV=staging
bun run seed
```

Open `http://localhost:3003/admin`, confirm the gestures list shows the seeded entries, search returns the inactive one for an admin, and the public REST endpoint `GET /api/gestures` does not.

- [ ] **Step 8: Commit**

```bash
git add apps/site
git commit -m "feat(site): add seed fixtures and runner"
```

---

## Stage 1 exit criteria

- [ ] All seven collections plus `search` exist and appear in the admin panel.
- [ ] `GET /api/gestures` as an anonymous caller returns only active gestures.
- [ ] A gesture created in `nl` reads back in `fr` with the Dutch value.
- [ ] A list's items survive a reorder with the same set and the new order.
- [ ] An anonymous request with no share token reads zero lists.
- [ ] A non-admin cannot set `role: "admin"` on their own user document.
- [ ] Renaming a gesture updates the search index; deactivating it marks the index entry inactive.
- [ ] `bun check`, `bun -F site check-types` and `bun -F site test` pass.
- [ ] Migrations are committed alongside the code that needs them.
