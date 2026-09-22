import type { Endpoint, PayloadHandler, PayloadRequest } from "payload";
import { headersWithCors } from "payload";
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
import { resolveLocale } from "@/lib/locale";
import { fetchOwnedList, MAX_LIST_ITEMS } from "@/lib/ownedLists";
import type { List, User } from "@/payload-types";
import { readBody } from "./auth";

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
 * ## Two renderers over one decision, per write — added for Stage 8 Task 11
 *
 * The owner pages have no client JavaScript, so every button here was
 * originally a `<form method="post">` answered with a 303 whose `Location`
 * carries the outcome as a page path plus a `notice=`/`error=` code. That
 * shape is unreadable from a native client: `fetch`'s `redirect: "manual"`
 * does nothing on React Native (`Libraries/Network/fetch.js` is a bare
 * re-export of `whatwg-fetch`, whose only use of the word "redirect" is the
 * static `Response.redirect()` helper — nothing reads `init.redirect`, and
 * the underlying `XMLHttpRequest` has already followed the 303 by the time
 * `onload` fires), and the request it gets followed into is a
 * cookie-authenticated Next.js page this app has no session for.
 *
 * The fix is the one `endpoints/auth.ts` already used for exactly this
 * problem (`decideSignUp`, `mobileSignUp`): **the decision and the
 * rendering are two different things, and only the rendering differs by
 * caller.** Each write below is now a `decide*` function — same guards, same
 * order, same Payload calls, moved out of the handler *unchanged* — that
 * returns a plain outcome value, plus two renderers: the original form
 * handler, which turns that outcome into a 303, and a new JSON handler under
 * `/api/mobile/lists/*`, which turns the identical outcome into a body. A
 * decision that existed twice would be a decision that could drift; this
 * way there is exactly one, per write, and `lists.int.test.ts` — entirely
 * unedited by this change — is what proves the form path still behaves
 * exactly as it did.
 *
 * `/api/mobile/lists/*` is a flat sibling of `/api/account/lists/*`, not a
 * nested variant of it, for the reason the next section gives about
 * `/account/lists/*` itself: overlapping endpoint patterns leave Payload's
 * matcher (`handleEndpoints`, first match wins) to choose between them, and
 * `mobileSignUp`'s own comment records the same call for `/mobile/sign-up`
 * against `/auth/sign-up`.
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
 * The list an id names, if the caller owns it.
 *
 * `depth: 0`, because every caller either writes `items` straight back — and
 * a populated gesture would have to be reduced to its id again first — or
 * needs nothing but the list's own columns.
 */
function ownedListById(
  req: PayloadRequest,
  id: string,
  locale: Locale,
  user: User
): Promise<List | null> {
  return fetchOwnedList({ depth: 0, id, locale, payload: req.payload, user });
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
 *
 * Takes the two fields already read off whichever body the caller has — a
 * form field or a JSON property — rather than a `FormData` itself, so this
 * one function serves both `decideCreateList` and `decideRenameList`
 * regardless of which transport is asking.
 */
function readText(input: {
  description: string;
  name: string;
}):
  | { description: null | string; name: string }
  | { error: "description" | "name" } {
  const name = input.name.trim();

  if (name === "" || name.length > MAX_NAME_LENGTH) {
    return { error: "name" };
  }

  const description = input.description.trim();

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: "description" };
  }

  return { description: description === "" ? null : description, name };
}

/* -------------------------------------------------------------------- *
 * The six decisions. Each is the previous single-surface handler's own
 * body, unchanged in guard, order and Payload call — only the trailing
 * `seeOther(...)` is gone, replaced with a plain value the two renderers
 * below turn into a redirect or a JSON body.
 * -------------------------------------------------------------------- */

type CreateListOutcome =
  | { list: List; status: "created" }
  | { field: "description" | "name"; status: "invalid" }
  | { status: "signed-out" };

async function decideCreateList(
  req: PayloadRequest,
  input: { description: string; name: string }
): Promise<CreateListOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const text = readText(input);

  if ("error" in text) {
    return { field: text.error, status: "invalid" };
  }

  const list = await req.payload.create({
    collection: LISTS,
    data: {
      description: text.description,
      name: text.name,
      /*
       * **The owner is the session, and the caller cannot say otherwise.**
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
       * A new list is private, and the caller cannot say otherwise either.
       * Creating a list already shared would hand out a live capability URL
       * for content the owner has not put in it yet, from a request whose
       * only input was a name.
       */
      visibility: "private",
    },
    depth: 0,
    overrideAccess: false,
    user,
  });

  return { list, status: "created" };
}

type RenameListOutcome =
  | { field: "description" | "name"; list: List; status: "invalid" }
  | { list: List; status: "renamed" }
  | { status: "signed-out" }
  | { status: "unknown-list" };

async function decideRenameList(
  req: PayloadRequest,
  locale: Locale,
  input: { description: string; id: string; name: string }
): Promise<RenameListOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const list = await ownedListById(req, input.id, locale, user);

  if (list === null) {
    return { status: "unknown-list" };
  }

  const text = readText(input);

  if ("error" in text) {
    return { field: text.error, list, status: "invalid" };
  }

  await req.payload.update({
    collection: LISTS,
    data: { description: text.description, name: text.name },
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return { list, status: "renamed" };
}

type DeleteListOutcome =
  | { field: "confirm"; list: List; status: "invalid" }
  | { status: "deleted" }
  | { status: "signed-out" }
  | { status: "unknown-list" };

async function decideDeleteList(
  req: PayloadRequest,
  locale: Locale,
  input: { confirmName: string; id: string }
): Promise<DeleteListOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const list = await ownedListById(req, input.id, locale, user);

  if (list === null) {
    return { status: "unknown-list" };
  }

  /*
   * **Typing the name, for the same reason `/account/delete` asks for the
   * address.** These pages have no JavaScript, so there is no `confirm()` to
   * put in front of a destructive button — and a modal would be the worse
   * control anyway: it vanishes on a reload, is clicked through by reflex,
   * and is nothing at all to a keyboard user who has already pressed Enter.
   * A text input that has to match is a server-side check, so a page with the
   * input deleted is refused just the same. The mobile client shows the same
   * confirmation before ever sending this request; this is the check that
   * still runs regardless of what the client did or didn't ask for.
   *
   * Case- and space-insensitive: nobody should lose a delete over a capital
   * letter, and the name is on the screen in front of them either way.
   */
  if (!confirmsName(input.confirmName, list.name)) {
    return { field: "confirm", list, status: "invalid" };
  }

  await req.payload.delete({
    collection: LISTS,
    depth: 0,
    id: list.id,
    overrideAccess: false,
    user,
  });

  return { status: "deleted" };
}

type AddGestureOutcome =
  | { field: "full" | "gesture"; list: List; status: "invalid" }
  | { list: List; status: "added" }
  | { status: "signed-out" }
  | { status: "unknown-list" };

async function decideAddGesture(
  req: PayloadRequest,
  locale: Locale,
  input: { gestureId: string; id: string }
): Promise<AddGestureOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const list = await ownedListById(req, input.id, locale, user);

  if (list === null) {
    return { status: "unknown-list" };
  }

  const { gestureId } = input;

  /*
   * **There is deliberately no `isGestureId` screen here**, though the
   * obvious symmetry with `decideRemoveGesture` below says there should be,
   * and the first draft of this handler had one. A mutation sweep found it
   * unprovable, and measuring `findByID` against this project's own database
   * says why: it refuses `"1abc"`, `"007"` and `"abc"` with `null` on its
   * own, and the one nearly-numeric id it does resolve — `"1.0"` — is read
   * identically by the `Number` below, so it round-trips. Every input the
   * screen would have rejected already gets the same answer from the lookup.
   *
   * `favoritesQuery.ts`'s reasoning is sound and does not reach here: it is
   * about `parseFloat` inside `sanitizeQueryValue`, which is the path a
   * `where` clause takes. A `findByID` on the primary key is a different
   * path. `decideRemoveGesture` keeps its screen because there the id is not
   * looked up at all — it goes straight into `Number` and a filter, where
   * `NaN` silently matches nothing, and the mutation that deletes it fails a
   * test.
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
    return { field: "gesture", list, status: "invalid" };
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
    return { list, status: "added" };
  }

  if (current.length >= MAX_LIST_ITEMS) {
    return { field: "full", list, status: "invalid" };
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

  return { list, status: "added" };
}

type RemoveGestureOutcome =
  | { field: "gesture"; list: List; status: "invalid" }
  | { list: List; status: "removed" }
  | { status: "signed-out" }
  | { status: "unknown-list" };

async function decideRemoveGesture(
  req: PayloadRequest,
  locale: Locale,
  input: { gestureId: string; id: string }
): Promise<RemoveGestureOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const list = await ownedListById(req, input.id, locale, user);

  if (list === null) {
    return { status: "unknown-list" };
  }

  const { gestureId } = input;

  if (!isGestureId(gestureId)) {
    return { field: "gesture", list, status: "invalid" };
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

  return { list, status: "removed" };
}

type SetVisibilityOutcome =
  | { field: "visibility"; list: List; status: "invalid" }
  | { list: List; status: "set"; visibility: "private" | "shared" }
  | { status: "signed-out" }
  | { status: "unknown-list" };

async function decideSetVisibility(
  req: PayloadRequest,
  locale: Locale,
  input: { id: string; visibility: string }
): Promise<SetVisibilityOutcome> {
  const user = signedInUser(req);

  if (user === null) {
    return { status: "signed-out" };
  }

  const list = await ownedListById(req, input.id, locale, user);

  if (list === null) {
    return { status: "unknown-list" };
  }

  const { visibility } = input;

  /*
   * Narrowed against the two values the column has rather than passed
   * through. `visibility` is a `select` and Payload would refuse a third
   * value with a `ValidationError`, which in a browser is a JSON error body
   * where a page should be.
   */
  if (visibility !== "private" && visibility !== "shared") {
    return { field: "visibility", list, status: "invalid" };
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

  return { list, status: "set", visibility };
}

/* -------------------------------------------------------------------- *
 * Renderer 1: the owner pages' forms. Unchanged behaviour — same guard,
 * same order, same redirects — proven by `lists.int.test.ts`, unedited.
 * -------------------------------------------------------------------- */

const createList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideCreateList(req, {
    description: field(form, "description"),
    name: field(form, "name"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "invalid") {
    return seeOther(accountListsPath(locale, { error: outcome.field }));
  }

  return seeOther(
    accountListPath(locale, outcome.list.id, { notice: "created" })
  );
};

const renameList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideRenameList(req, locale, {
    description: field(form, "description"),
    id: field(form, "id"),
    name: field(form, "name"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "unknown-list") {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  if (outcome.status === "invalid") {
    return seeOther(
      accountListPath(locale, outcome.list.id, { error: outcome.field })
    );
  }

  return seeOther(
    accountListPath(locale, outcome.list.id, { notice: "renamed" })
  );
};

const deleteList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideDeleteList(req, locale, {
    confirmName: field(form, "confirmName"),
    id: field(form, "id"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "unknown-list") {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  if (outcome.status === "invalid") {
    return seeOther(
      accountListPath(locale, outcome.list.id, { error: outcome.field })
    );
  }

  return seeOther(accountListsPath(locale, { notice: "deleted" }));
};

const addGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideAddGesture(req, locale, {
    gestureId: field(form, "gestureId"),
    id: field(form, "id"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "unknown-list") {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  if (outcome.status === "invalid") {
    return seeOther(
      accountListPath(locale, outcome.list.id, { error: outcome.field })
    );
  }

  return seeOther(
    accountListPath(locale, outcome.list.id, { notice: "added" })
  );
};

const removeGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideRemoveGesture(req, locale, {
    gestureId: field(form, "gestureId"),
    id: field(form, "id"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "unknown-list") {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  if (outcome.status === "invalid") {
    return seeOther(
      accountListPath(locale, outcome.list.id, { error: outcome.field })
    );
  }

  return seeOther(
    accountListPath(locale, outcome.list.id, { notice: "removed" })
  );
};

const setVisibility: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const form = await readForm(req);
  const locale = localeFromForm(form.get("locale"));
  const outcome = await decideSetVisibility(req, locale, {
    id: field(form, "id"),
    visibility: field(form, "visibility"),
  });

  if (outcome.status === "signed-out") {
    return signedOut(locale);
  }

  if (outcome.status === "unknown-list") {
    return seeOther(accountListsPath(locale, { error: "unknown" }));
  }

  if (outcome.status === "invalid") {
    return seeOther(
      accountListPath(locale, outcome.list.id, { error: outcome.field })
    );
  }

  return seeOther(
    accountListPath(locale, outcome.list.id, {
      notice: outcome.visibility === "shared" ? "shared" : "unshared",
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

/* -------------------------------------------------------------------- *
 * Renderer 2: the native app's JSON surface, under `/api/mobile/lists/*`.
 * Every outcome above rendered as a body instead of a redirect; no logic
 * lives here beyond that translation.
 * -------------------------------------------------------------------- */

/** `no-store`, CORS-permissive JSON, matching `mobileSignUp`'s own answers. */
function jsonResponse(
  status: number,
  body: unknown,
  req: PayloadRequest
): Response {
  return Response.json(body, {
    headers: headersWithCors({
      headers: new Headers({ "Cache-Control": "no-store" }),
      req,
    }),
    status,
  });
}

/** The locale a JSON caller named in `?locale=`, or the default. */
function localeFromRequest(req: PayloadRequest): Locale {
  return resolveLocale(req.searchParams?.get("locale") ?? undefined);
}

/** A body field as a string, whatever the JSON actually carried. */
function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];

  return typeof value === "string" ? value : "";
}

const mobileCreateList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideCreateList(req, {
    description: stringField(body, "description"),
    name: stringField(body, "name"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(
    200,
    { id: String(outcome.list.id), status: "created" },
    req
  );
};

const mobileRenameList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideRenameList(req, localeFromRequest(req), {
    description: stringField(body, "description"),
    id: stringField(body, "id"),
    name: stringField(body, "name"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "unknown-list") {
    return jsonResponse(404, { status: "unknown-list" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(200, { status: "renamed" }, req);
};

const mobileDeleteList: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideDeleteList(req, localeFromRequest(req), {
    confirmName: stringField(body, "confirmName"),
    id: stringField(body, "id"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "unknown-list") {
    return jsonResponse(404, { status: "unknown-list" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(200, { status: "deleted" }, req);
};

const mobileAddGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideAddGesture(req, localeFromRequest(req), {
    gestureId: stringField(body, "gestureId"),
    id: stringField(body, "id"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "unknown-list") {
    return jsonResponse(404, { status: "unknown-list" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(
      outcome.field === "full" ? 409 : 400,
      { field: outcome.field, status: "invalid" },
      req
    );
  }

  return jsonResponse(200, { status: "added" }, req);
};

const mobileRemoveGesture: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideRemoveGesture(req, localeFromRequest(req), {
    gestureId: stringField(body, "gestureId"),
    id: stringField(body, "id"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "unknown-list") {
    return jsonResponse(404, { status: "unknown-list" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(200, { status: "removed" }, req);
};

const mobileSetVisibility: PayloadHandler = async (req) => {
  const crossSiteResponse = guardOrigin(req);

  if (crossSiteResponse) {
    return crossSiteResponse;
  }

  const body = await readBody(req);
  const outcome = await decideSetVisibility(req, localeFromRequest(req), {
    id: stringField(body, "id"),
    visibility: stringField(body, "visibility"),
  });

  if (outcome.status === "signed-out") {
    return jsonResponse(401, { status: "signed-out" }, req);
  }

  if (outcome.status === "unknown-list") {
    return jsonResponse(404, { status: "unknown-list" }, req);
  }

  if (outcome.status === "invalid") {
    return jsonResponse(400, { field: outcome.field, status: "invalid" }, req);
  }

  return jsonResponse(
    200,
    { status: outcome.visibility === "shared" ? "shared" : "unshared" },
    req
  );
};

/**
 * The native app's six writes, at flat `/api/mobile/lists/*` paths — see the
 * module comment above for why they exist and why they are flat siblings
 * rather than nested under `/mobile/lists/:id`.
 */
export const mobileListsEndpoints: Endpoint[] = [
  { handler: mobileCreateList, method: "post", path: "/mobile/lists/create" },
  { handler: mobileRenameList, method: "post", path: "/mobile/lists/rename" },
  { handler: mobileDeleteList, method: "post", path: "/mobile/lists/delete" },
  { handler: mobileAddGesture, method: "post", path: "/mobile/lists/add" },
  {
    handler: mobileRemoveGesture,
    method: "post",
    path: "/mobile/lists/remove",
  },
  { handler: mobileSetVisibility, method: "post", path: "/mobile/lists/share" },
];
