import { afterEach, describe, expect, it, vi } from "vitest";
import { GUEST_FAVORITES_KEY } from "./guestStore";
import { syncGuestFavorites } from "./mergeGuestState";

/**
 * The browser's half of the guest-to-account merge.
 *
 * The server half is in `mergeGuestState.int.test.ts`, against a real
 * database, because that is the only place its idempotence means anything.
 * What is here is the ordering rule the no-transactions finding demands —
 * **the irreversible step goes last** — and it is tested by watching *when*
 * the local array disappears rather than only whether it does. An
 * implementation that clears first and then writes passes every end-state
 * assertion on the happy path and loses the reader's favorites the first
 * time the network drops.
 *
 * `fetch` is stubbed rather than the module boundary mocked, so the URL, the
 * method and the body are part of what is under test. A mock of a wrapper
 * would let all three drift.
 */
const ok = (favorites: string[]) =>
  vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ favorites }),
    ok: true,
    status: 200,
  });

const stored = (): null | string => localStorage.getItem(GUEST_FAVORITES_KEY);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("syncGuestFavorites", () => {
  it("clears the local array only after the write succeeds", async () => {
    /*
     * The ordering rule, and the reason it is a rule: there are no
     * transactions on any write path in this app, so `localStorage.clear`
     * and the account write cannot both be undone together. The clear is
     * the one that cannot be retried, so it goes last.
     *
     * The assertion is on what the store held **at the moment the request
     * was made**, not only on the end state. Checking the end state alone
     * cannot tell the two orderings apart on a successful write.
     */
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7","9"]');

    const atRequest: (null | string)[] = [];
    const fetchMock = vi.fn().mockImplementation(() => {
      atRequest.push(stored());

      return Promise.resolve({
        json: () => Promise.resolve({ favorites: ["7", "9"] }),
        ok: true,
        status: 200,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await syncGuestFavorites();

    expect(atRequest).toEqual(['["7","9"]']);
    expect(stored()).toBeNull();
    expect(result).toEqual({ favorites: ["7", "9"], status: "merged" });
  });

  it("keeps the local array when the write is refused", async () => {
    /*
     * The other half of the same rule. A 401 is the commonest shape of it —
     * the session expired between the page render and the effect — and the
     * list has to survive it, because the next signed-in page is what
     * retries the merge.
     *
     * **The refused response carries a perfectly readable body**, and that
     * is deliberate. An earlier version answered `{}` here, which meant the
     * status check could be deleted and the test still passed: the body
     * narrowing refused it a line later. It proved the wrong guard. A proxy
     * serving a stale copy, or an error page that happens to parse, is all
     * it takes for the two to come apart — and then a signed-out reader's
     * favorites are cleared against a write that never happened.
     */
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ favorites: [] }),
        ok: false,
        status: 401,
      })
    );

    await expect(syncGuestFavorites()).resolves.toEqual({ status: "failed" });
    expect(stored()).toBe('["7"]');
  });

  it("keeps the local array when the request never lands", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(syncGuestFavorites()).resolves.toEqual({ status: "failed" });
    expect(stored()).toBe('["7"]');
  });

  it("keeps the local array when the answer cannot be read", async () => {
    // A 200 whose body is not the shape we asked for is not an
    // acknowledgement. Treating it as one throws the favorites away on a
    // proxy's error page.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ merged: true }),
        ok: true,
        status: 200,
      })
    );

    await expect(syncGuestFavorites()).resolves.toEqual({ status: "failed" });
    expect(stored()).toBe('["7"]');
  });

  it("asks nothing of the server when there is nothing to merge", async () => {
    // Every signed-in page mounts this. A reader who never favourited
    // anything as a guest must not pay a round trip for it on every one.
    const fetchMock = ok([]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncGuestFavorites()).resolves.toEqual({
      status: "nothing-to-merge",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the stored ids to the merge endpoint", async () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7","9"]');

    const fetchMock = ok(["7", "9"]);
    vi.stubGlobal("fetch", fetchMock);

    await syncGuestFavorites();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("/account/merge-favorites");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ ids: ["7", "9"] });
  });

  it("reports the account's list, not the one it sent", async () => {
    // The caller repaints a heart from this, so it has to be the account's
    // state after the merge — which includes favorites made on another
    // machine and excludes guest ids that resolved to nothing.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["7"]');
    vi.stubGlobal("fetch", ok(["3", "7"]));

    await expect(syncGuestFavorites()).resolves.toEqual({
      favorites: ["3", "7"],
      status: "merged",
    });
  });

  it("does nothing at all when the store is denied", async () => {
    // Private browsing. `readGuestFavorites` answers `[]` rather than
    // throwing, so this is indistinguishable from having no favorites — and
    // an effect that threw here would blank the page below it.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const fetchMock = ok([]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncGuestFavorites()).resolves.toEqual({
      status: "nothing-to-merge",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
