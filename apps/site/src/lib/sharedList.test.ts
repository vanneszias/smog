import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSharedList } from "./sharedList";

/**
 * The half of `fetchSharedList` that is observable without a database: what
 * it does *before* deciding to ask one.
 *
 * `shareTokens.int.test.ts` covers everything the query answers. What it
 * cannot see is the case where no query happens at all — an empty `where`
 * and a denied access filter both produce zero rows, so "asked and got
 * nothing" and "never asked" are indistinguishable from the result. This
 * file tells them apart by mocking the client and asserting the database was
 * never opened.
 *
 * Worth a test rather than a comment because a blank segment is reachable:
 * `/nl/lists/%20` and `/nl/lists/+` both route, and the guard is what keeps
 * a whitespace token from reaching `{ viewShareToken: { equals: " " } }`.
 */

const find = vi.fn();

vi.mock("./payloadClient", () => ({
  getPayloadClient: vi.fn(async () => ({ find })),
}));

describe("fetchSharedList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    find.mockResolvedValue({ docs: [] });
  });

  it("does not open the database for a blank token", async () => {
    expect(await fetchSharedList({ locale: "nl", token: "" })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("does not open the database for a whitespace-only token", async () => {
    expect(await fetchSharedList({ locale: "nl", token: "  \t " })).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  /*
   * The next two are one guard each, deliberately split. They are belt and
   * braces — for an anonymous read the access filter *is* the token match, so
   * dropping either one alone changes no answer and only a structural
   * assertion can see it. Asserting both in one test means a sweep cannot
   * tell which brace it broke, which is how a removed guard gets waved
   * through as "some other test caught it". See task-7-report.md, M22/M23.
   */
  it("reads through the access layer rather than around it", async () => {
    await fetchSharedList({ locale: "nl", token: "abc123" });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      collection: "lists",
      overrideAccess: false,
    });
  });

  it("pins the query to the token rather than relying on the access filter alone", async () => {
    await fetchSharedList({ locale: "nl", token: "abc123" });

    expect(find.mock.calls[0]?.[0]).toMatchObject({
      where: { viewShareToken: { equals: "abc123" } },
    });
  });

  it("passes the token to the access layer the only way a Local API call can", async () => {
    // `req.searchParams` is what `shareToken()` reads, and a Local API call
    // only has one if the caller supplies it —
    // `payload/dist/utilities/createLocalReq.js` fills in a fake URL's empty
    // `searchParams` when the caller does not.
    await fetchSharedList({ locale: "nl", token: "abc123" });

    const req = find.mock.calls[0]?.[0]?.req as
      | { searchParams: URLSearchParams }
      | undefined;
    expect(req?.searchParams.get("shareToken")).toBe("abc123");
  });

  it("asks in the reader's own locale", async () => {
    await fetchSharedList({ locale: "fr", token: "abc123" });

    expect(find.mock.calls[0]?.[0]).toMatchObject({ locale: "fr" });
  });

  it("answers null when the token names no list", async () => {
    expect(await fetchSharedList({ locale: "nl", token: "abc123" })).toBeNull();
  });
});
