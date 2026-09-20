import { afterEach, describe, expect, it, vi } from "vitest";
import type { Gesture, User } from "@/payload-types";
import {
  ACCOUNT_FAVORITES_PATH,
  accountFavoriteIds,
  isAccountFavorite,
  readFavoriteWrite,
  writeAccountFavorite,
} from "./accountFavorites";

const user = (favorites: User["favorites"]): User =>
  ({ email: "someone@example.test", favorites }) as User;

const respondWith = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("accountFavoriteIds", () => {
  it("reads the bare ids a depth-0 read returns", () => {
    expect(accountFavoriteIds(user([9, 4]))).toEqual(["9", "4"]);
  });

  it("reads the documents a populated read returns", () => {
    /*
     * Both shapes are normal and which one arrives is decided by the
     * caller's `depth`, not by anything this function can see —
     * `payload.auth` uses the collection's `auth.depth` and the endpoint
     * asks for 0. A version that handled one shape would work everywhere it
     * was tested and return `["[object Object]"]` on the other.
     */
    expect(
      accountFavoriteIds(user([{ id: 9 } as Gesture, { id: 4 } as Gesture]))
    ).toEqual(["9", "4"]);
  });

  it("keeps the stored order", () => {
    // The favorites grid renders in it, so it is part of the contract rather
    // than an accident.
    expect(accountFavoriteIds(user([4, 9]))).toEqual(["4", "9"]);
  });

  it("answers nothing for a visitor who is not signed in", () => {
    expect(accountFavoriteIds(null)).toEqual([]);
  });

  it("answers nothing for an account that has never favourited", () => {
    // Payload omits an empty `hasMany` rather than storing `[]`.
    expect(accountFavoriteIds(user(null))).toEqual([]);
    expect(accountFavoriteIds(user(undefined))).toEqual([]);
  });

  it("drops an id that could not address a row", () => {
    /*
     * These ids go on to build `where[id][in]`, and Payload maps that onto
     * `parseFloat` for a number column — a non-numeric entry is not
     * rejected, it becomes `NaN` and is bound into the statement. The same
     * rule as the guest list, for the same reason.
     */
    expect(
      accountFavoriteIds(user(["abc", "0", "007", "9"] as unknown as number[]))
    ).toEqual(["9"]);
  });

  it("collapses a duplicate the database still holds", () => {
    // `Users.ts`'s `beforeChange` hook enforces one-per-gesture on write,
    // and a row written before that hook existed is still in the database.
    // Two cards with the same React key is a rendering bug.
    expect(accountFavoriteIds(user([9, 9, 4]))).toEqual(["9", "4"]);
  });
});

describe("isAccountFavorite", () => {
  it("finds a gesture the account holds", () => {
    expect(isAccountFavorite(user([9, 4]), "9")).toBe(true);
  });

  it("does not match on a prefix of the id", () => {
    // `String(9).includes("9")` is true for 91 as well; the check has to be
    // per-entry.
    expect(isAccountFavorite(user([91]), "9")).toBe(false);
  });

  it("answers false for a visitor who is not signed in", () => {
    expect(isAccountFavorite(null, "9")).toBe(false);
  });
});

describe("readFavoriteWrite", () => {
  it("takes the stored state from the body", () => {
    expect(readFavoriteWrite({ favorite: true })).toEqual({
      favorite: true,
      status: "ok",
    });
    expect(readFavoriteWrite({ favorite: false })).toEqual({
      favorite: false,
      status: "ok",
    });
  });

  it("refuses a body that lost the field", () => {
    /*
     * The important one. `undefined` is falsy, so a caller that read the
     * field straight off a 200 whose body was a proxy error page would
     * quietly un-fill the heart and report success.
     */
    expect(readFavoriteWrite({})).toEqual({ status: "failed" });
    expect(readFavoriteWrite({ favorite: "true" })).toEqual({
      status: "failed",
    });
    expect(readFavoriteWrite(null)).toEqual({ status: "failed" });
    expect(readFavoriteWrite("favorite")).toEqual({ status: "failed" });
  });
});

describe("writeAccountFavorite", () => {
  it("posts the wanted state to the rewritten path", async () => {
    const fetchMock = respondWith({ favorite: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      writeAccountFavorite({ favorite: true, gestureId: "9" })
    ).resolves.toEqual({ favorite: true, status: "ok" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe(ACCOUNT_FAVORITES_PATH);
    expect(url).toBe("/account/favorites");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      favorite: true,
      gestureId: "9",
    });
  });

  it("asks for no cached copy of a personal answer", async () => {
    const fetchMock = respondWith({ favorite: true });
    vi.stubGlobal("fetch", fetchMock);

    await writeAccountFavorite({ favorite: true, gestureId: "9" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(init.cache).toBe("no-store");
  });

  it("reports an expired session separately from a failure", async () => {
    // The two want different words on the screen: one is fixed by signing
    // in again, the other by trying again.
    vi.stubGlobal("fetch", respondWith({ error: "signed-out" }, 401));

    await expect(
      writeAccountFavorite({ favorite: true, gestureId: "9" })
    ).resolves.toEqual({ status: "signed-out" });
  });

  it("reports every other refusal as a plain failure", async () => {
    for (const status of [400, 403, 404, 500]) {
      vi.stubGlobal("fetch", respondWith({}, status));

      await expect(
        writeAccountFavorite({ favorite: true, gestureId: "9" })
      ).resolves.toEqual({ status: "failed" });
    }
  });

  it("does not throw when the request never lands", async () => {
    // An event handler that rejects is an unhandled rejection, and the heart
    // would be left mid-press with nothing on screen.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      writeAccountFavorite({ favorite: true, gestureId: "9" })
    ).resolves.toEqual({ status: "failed" });
    expect(logged).toHaveBeenCalled();
  });

  it("does not throw when a 200 carries something that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.reject(new SyntaxError("not json")),
        ok: true,
        status: 200,
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      writeAccountFavorite({ favorite: true, gestureId: "9" })
    ).resolves.toEqual({ status: "failed" });
  });
});
