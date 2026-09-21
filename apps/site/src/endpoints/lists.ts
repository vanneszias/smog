import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { resolveRelationshipId } from "@/collections/Lists";
import {
  accountListPath,
  accountListsPath,
  localeFromForm,
  seeOther,
  signInPath,
} from "@/lib/authFlow";
import { isGestureId } from "@/lib/favoritesQuery";
import { field, guardOrigin, readForm } from "@/lib/formPost";
import type { Locale } from "@/lib/locale";
import { fetchOwnedList, MAX_LIST_ITEMS } from "@/lib/ownedLists";
import type { List, User } from "@/payload-types";

/**
 * The owner's six writes on their own lists: create, rename, delete, add a
 * gesture, remove a gesture, share and un-share.
 *
 * ## Why these are endpoints and not `app/**​/route.ts`
 *
 * The same measurement as `endpoints/auth.ts`, `endpoints/account.ts` and
 * `endpoints/favorites.ts`: a Next route handler that imports Payload becomes
 * its own bundle entry and re-bundles the Payload/D1/drizzle graph into it,
 * measured at **+519 KiB gzipped** against a budget with a few hundred KiB
 * left. `app/(payload)/api/[...slug]/route.ts` already carries that graph, so
 * a handler hung off it costs only the handler, and the public paths are
 * rewrites in `next.config.ts`, which bundle nothing. A CI check fails the
 * build on a route handler that imports Payload, so this is enforced rather
 * than remembered.
 *
 * ## Why forms, and why every answer is a redirect
 *
 * The owner pages have no client JavaScript, exactly like `/account`. Every
 * button here is a `<form method="post">` and every answer is a 303 back to a
 * page with a code in the query string, so the whole surface works with
 * scripting off, survives a reload and is reachable by keyboard.
 *
 * ## Access
 *
 * **The Stage 3 access rules do the authorisation and are not reimplemented
 * here.** Every read and every write below runs `overrideAccess: false` with
 * the session's user, so `listReadAccess`, `listUpdateAccess` and
 * `listDeleteAccess` decide, as they already do for the REST API. What this
 * file adds on top is the owner filter in `lib/ownedLists.ts` — see its
 * comment for the two cases that filter exists for, an administrator and a
 * share token, neither of which the access rules narrow for this surface.
 *
 * ## There is no timing floor here, and that is deliberate
 *
 * `endpoints/auth.ts` and `endpoints/account.ts` pad every refusal to
 * `AUTH_FLOOR_MS` because Payload answers their branches at wildly different
 * speeds — an unknown address in ~10 ms, a wrong password in ~77 ms — which
 * is a single-request classifier for "is this address registered".
 *
 * Nothing on this surface has that shape. The one pair worth hiding is "no
 * list has that id" against "that list is somebody else's", and those two are
 * not two branches: `fetchOwnedList` answers both with one query whose
 * `where` names the owner, so they are the same code path taking the same
 * work and returning the same bytes. A floor added here would hide nothing
 * that the shared resolve does not already make identical, and would cost
 * half a second on every mistyped list name. `lists.int.test.ts` asserts the
 * two answers are byte-identical, which is the property a floor would have
 * been standing in for.
 */

/** The collection every handler here writes. */
const LISTS = "lists";

/** The only collection these endpoints authenticate against. */
const USERS = "users";

/**
 * How long a list's name and description may be.
 *
 * Payload puts no bound on a `text` or `textarea` column and D1 will happily
 * store a megabyte of either. These are the bounds the page states and the
 * inputs carry a `maxLength` for; the check is here because a `maxLength`
 * attribute is a hint to a browser and nothing else.
 */
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;

/** The signed-in account, or `null`. */
function signedInUser(req: PayloadRequest): null | User {
  /*
   * Narrowed on the slug rather than on truthiness, for the reason
   * `endpoints/account.ts` and `lib/session.ts` both give: `req.user` is
   * whichever auth collection the token named, and a second one added later
   * must not start writing `users`-owned rows. Unprovable today — this app
   * has one auth collection — and kept for the day it is not.
   */
  return req.user?.collection === USERS ? (req.user as User) : null;
}

/** Where a signed-out caller is sent, whatever they were trying to do. */
function signedOut(locale: Locale): Response {
  return seeOther(signInPath(locale));
}

/**
 * The list the form names, if the caller owns it.
 *
 * `depth: 0`, because every caller either writes `items` straight back — and
 * a populated gesture would have to be reduced to its id again first — or
 * needs nothing but the list's own columns.
 */
function ownedList(
  req: PayloadRequest,
  form: FormData,
  locale: Locale,
  user: User
): Promise<List | null> {
  return fetchOwnedList({
    depth: 0,
    id: field(form, "id"),
    locale,
    payload: req.payload,
    user,
  });
}

/**
 * The gesture ids on a list, in order, as numbers.
 *
 * Nothing is filtered out. A row that cannot be reduced to an id becomes
 * `NaN`, which Payload's relationship validation refuses loudly on the way
 * back in — where dropping it quietly would take a gesture off somebody's
 * list as a side effect of adding a different one.
 *
 * `resolveRelationshipId` rather than a local `typeof` test: `Lists.ts`
 * exports it precisely so that every place which has to answer "which gesture
 * is this row" answers it the same way as the dedupe hook does.
 */
function listGestureIds(list: List): number[] {
  return (list.items ?? []).map((item) =>
    Number(resolveRelationshipId(item.gesture))
  );
}

/** `items` as Payload wants it written: ids only, order preserved. */
function toItems(ids: readonly number[]): { gesture: number }[] {
  /*
   * `addedBy` is deliberately not resent. The array field's `beforeChange`
   * hook in `Lists.ts` carries it forward for any row that omits it — an
   * explicit `null` would be honoured as a deliberate clear, so sending the
   * key at all is how provenance gets wiped by a rename.
   */
  return ids.map((gesture) => ({ gesture }));
}

/** Whether the typed confirmation matches the list's name. */
function confirmsName(typed: string, name: string): boolean {
  return typed.trim().toLowerCase() === name.trim().toLowerCase();
}

/**
 * The name and description a create or rename carries, or the code that
 * refuses them.
 */
function readText(
  form: FormData
):
  | { description: null | string; name: string }
  | { error: "description" | "name" } {
  const name = field(form, "name").trim();

  if (name === "" || name.length > MAX_NAME_LENGTH) {
    return { error: "name" };
  }

  const description = field(form, "description").trim();

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: "description" };
  }

  return { description: description === "" ? null : description, name };
}

const createList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const text = readText(form);

  if ("error" in text) {
    return seeOther(accountListsPath(locale, { error: text.error }));
  }

  const list = await req.payload.create({
    collection: LISTS,
    data: {
      description: text.description,
      name: text.name,
      /*
       * **The owner is the session, and the form cannot say otherwise.**
       * `lists.access.create` is `isAuthenticated`, which asks only that
       * somebody is signed in — it has no opinion about whose name goes on
       * the row. So an `owner` field in the posted body would be believed,
       * and a list planted in a stranger's account is a list they cannot
       * tell from their own. `lists.int.test.ts` posts one.
       *
       * `Number`, not the id as it arrives: `isValidID` requires
       * `typeof value === 'number'` for a numeric key, so a string id fails
       * validation rather than being coerced.
       */
      owner: Number(user.id),
      /*
       * A new list is private, and the form cannot say otherwise either.
       * Creating a list already shared would hand out a live capability URL
       * for content the owner has not put in it yet, from a page whose only
       * input was a name.
       */
      visibility: "private",
    },
    depth: 0,
    overrideAccess: false,
    user,
  });

  return seeOther(accountListPath(locale, list.id, { notice: "created" }));
};

const renameList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const list = await ownedList(req, form, locale, user);

  if (list === null) {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  const text = readText(form);

  if ("error" in text) {
    return seeOther(accountListPath(locale, list.id, { error: text.error }));
  }

  await req.payload.update({
    collection: LISTS,
    data: { description: text.description, name: text.name },
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return seeOther(accountListPath(locale, list.id, { notice: "renamed" }));
};

const deleteList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const list = await ownedList(req, form, locale, user);

  if (list === null) {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  /*
   * **Typing the name, for the same reason `/account/delete` asks for the
   * address.** These pages have no JavaScript, so there is no `confirm()` to
   * put in front of a destructive button — and a modal would be the worse
   * control anyway: it vanishes on a reload, is clicked through by reflex,
   * and is nothing at all to a keyboard user who has already pressed Enter.
   * A text input that has to match is a server-side check, so a page with the
   * input deleted is refused just the same.
   *
   * Case- and space-insensitive: nobody should lose a delete over a capital
   * letter, and the name is on the screen in front of them either way.
   */
  if (!confirmsName(field(form, "confirmName"), list.name)) {
    return seeOther(accountListPath(locale, list.id, { error: "confirm" }));
  }

  await req.payload.delete({
    collection: LISTS,
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return seeOther(accountListsPath(locale, { notice: "deleted" }));
};

const addGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const list = await ownedList(req, form, locale, user);

  if (list === null) {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  const gestureId = field(form, "gestureId");

  /*
   * **There is deliberately no `isGestureId` screen here**, though the
   * obvious symmetry with `removeGesture` below says there should be, and the
   * first draft of this handler had one. A mutation sweep found it
   * unprovable, and measuring `findByID` against this project's own database
   * says why: it refuses `"1abc"`, `"007"` and `"abc"` with `null` on its
   * own, and the one nearly-numeric id it does resolve — `"1.0"` — is read
   * identically by the `Number` below, so it round-trips. Every input the
   * screen would have rejected already gets the same answer from the lookup.
   *
   * `favoritesQuery.ts`'s reasoning is sound and does not reach here: it is
   * about `parseFloat` inside `sanitizeQueryValue`, which is the path a
   * `where` clause takes. A `findByID` on the primary key is a different
   * path. `removeGesture` keeps its screen because there the id is not looked
   * up at all — it goes straight into `Number` and a filter, where `NaN`
   * silently matches nothing, and the mutation that deletes it fails a test.
   *
   * An unprovable guard reads like a lock and is not one; the same call was
   * made about the empty-token early return in `endpoints/account.ts`.
   * `lists.int.test.ts` pins `findByID`'s strictness by name, so a Payload
   * upgrade that loosened it would fail here rather than start accepting
   * `12abc` as gesture 12.
   */

  /*
   * **The gesture is resolved against real rows, as this visitor.**
   *
   * Payload's relationship validation is `isValidID`, which for a numeric key
   * is a `typeof value === 'number'` test and nothing more
   * (`payload/dist/utilities/isValidID.js`) — no query, no existence check.
   * The spec draws from that ("A relationship field accepts an id for a row
   * that does not exist") the conclusion that an unresolved id lands in the
   * database as a dangling reference. **On this table it does not, and that
   * was measured rather than assumed:** `lists_items.gesture_id` carries a
   * real foreign key, so `{ gesture: 999000001 }` fails at D1 with
   * `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY`, wrapped in
   * drizzle's `Failed query: insert into "lists_items" …`. So does
   * `users.favorites`, through `users_rels`, which is the very case that
   * finding was written from.
   *
   * That makes this lookup worth *more* than the spec's reasoning, not less,
   * and for two reasons it can show:
   *
   * - without it, an id for a gesture that does not exist is an unhandled
   *   `DrizzleQueryError` — a 500 with a JSON body in a browser window, on a
   *   page whose every other refusal is a sentence. The foreign key protects
   *   the data; it does nothing for the person.
   * - `overrideAccess: false` runs `publicReadActive`, so a gesture an editor
   *   has deactivated cannot be put on a list by somebody who is not allowed
   *   to see it. No constraint in the schema expresses that, and nothing else
   *   on this path would check it.
   */
  const gesture = await req.payload.findByID({
    collection: "gestures",
    depth: 0,
    disableErrors: true,
    id: gestureId,
    overrideAccess: false,
    user,
  });

  if (gesture === null) {
    return seeOther(accountListPath(locale, list.id, { error: "gesture" }));
  }

  const current = listGestureIds(list);

  /*
   * **Already there is a success, not an error, and it writes nothing.**
   * There are no transactions on any write path here, so every multi-step
   * write has to be safe to re-run — and this one is re-run constantly, by
   * the back button, by a double-tap and by a reload of the redirect target.
   * `Lists.ts`'s array hook dedupes as well, and neither half is provable
   * alone: this branch skips the write, so the hook never sees a duplicate
   * from here, and the hook cleans the array, so this branch's absence would
   * not change what is stored. Removing both is what `lists.int.test.ts`
   * catches. The same belt-and-braces shape, kept for the same reason, as the
   * `Set` in `endpoints/favorites.ts`.
   */
  if (current.includes(Number(gestureId))) {
    return seeOther(accountListPath(locale, list.id, { notice: "added" }));
  }

  if (current.length >= MAX_LIST_ITEMS) {
    return seeOther(accountListPath(locale, list.id, { error: "full" }));
  }

  await req.payload.update({
    collection: LISTS,
    data: {
      items: [
        ...toItems(current),
        // The one row that names an `addedBy`: it is new, so there is nothing
        // for the carry-forward pass to carry.
        { addedBy: Number(user.id), gesture: Number(gestureId) },
      ],
    },
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return seeOther(accountListPath(locale, list.id, { notice: "added" }));
};

const removeGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const list = await ownedList(req, form, locale, user);

  if (list === null) {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  const gestureId = field(form, "gestureId");

  if (!isGestureId(gestureId)) {
    return seeOther(accountListPath(locale, list.id, { error: "gesture" }));
  }

  /*
   * **The gesture is not resolved here, and that is the point.** Adding one
   * has to check that it exists and that this visitor may see it; taking one
   * off must work for exactly the rows those checks would now refuse — a
   * gesture an editor deactivated after it was added is unpopulated on the
   * page and is the row its owner most wants gone. Working from the stored
   * ids rather than from resolvable documents is what makes that possible.
   */
  const current = listGestureIds(list);
  const next = current.filter((id) => id !== Number(gestureId));

  // Already absent: the same answer, and no write. Re-running is the normal
  // case for the same reasons as the add above.
  if (next.length !== current.length) {
    await req.payload.update({
      collection: LISTS,
      data: { items: toItems(next) },
      depth: 0,
      id: list.id,
      overrideAccess: false,
      user,
    });
  }

  return seeOther(accountListPath(locale, list.id, { notice: "removed" }));
};

const setVisibility: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const user = signedInUser(req);

  if (user === null) {
    return signedOut(locale);
  }

  const list = await ownedList(req, form, locale, user);

  if (list === null) {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  const visibility = field(form, "visibility");

  /*
   * Narrowed against the two values the column has rather than passed
   * through. `visibility` is a `select` and Payload would refuse a third
   * value with a `ValidationError`, which in a browser is a JSON error body
   * where a page should be.
   */
  if (visibility !== "private" && visibility !== "shared") {
    return seeOther(accountListPath(locale, list.id, { error: "visibility" }));
  }

  /*
   * **Un-sharing is one write, and the irreversible half of it happens
   * inside that write.** `mintAndRotateShareTokens` in `Lists.ts` rotates
   * both tokens in `beforeChange` when a list becomes private, so the
   * outstanding link dies in the same statement that flips the column —
   * there is no window in which the list reads private while the old link
   * still resolves, and nothing to roll back if the write fails, which
   * matters because nothing here can roll anything back.
   */
  await req.payload.update({
    collection: LISTS,
    data: { visibility },
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return seeOther(
    accountListPath(locale, list.id, {
      notice: visibility === "shared" ? "shared" : "unshared",
    })
  );
};

export const listsEndpoints: Endpoint[] = [
  { handler: createList, method: "post", path: "/account/lists/create" },
  { handler: renameList, method: "post", path: "/account/lists/rename" },
  { handler: deleteList, method: "post", path: "/account/lists/delete" },
  { handler: addGesture, method: "post", path: "/account/lists/add" },
  { handler: removeGesture, method: "post", path: "/account/lists/remove" },
  { handler: setVisibility, method: "post", path: "/account/lists/share" },
];
