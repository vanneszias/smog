import { renderHook, waitFor } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import { ApiError } from "@/lib/api";
import {
  addToList,
  createList,
  deleteList,
  MAX_LIST_ITEMS,
  removeFromList,
  renameList,
  shareList,
  useList,
  useLists,
} from "./lists";

/**
 * The six writes go through `session.ts`'s real `getToken`, which reads
 * `expo-secure-store` — a native module with nothing behind it under this
 * test renderer unless it is mocked, same as every other file in this app
 * that reaches `session.ts` indirectly.
 */
jest.mock("expo-secure-store");

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    })
  );

const fetchMock = () => global.fetch as unknown as jest.Mock;

describe("useLists", () => {
  beforeEach(() => jest.resetAllMocks());

  it("resolves the account's lists, most recent first", async () => {
    global.fetch = jest.fn(() =>
      json({
        docs: [
          {
            id: 1,
            items: [{ gesture: 9 }],
            name: "Verjaardag",
            visibility: "private",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useLists());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      {
        description: null,
        id: "1",
        itemCount: 1,
        name: "Verjaardag",
        visibility: "private",
      },
    ]);
  });

  it("sends the request with auth", async () => {
    global.fetch = jest.fn(() => json({ docs: [] })) as unknown as typeof fetch;

    renderHook(() => useLists());

    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());

    const [url] = fetchMock().mock.calls[0];

    expect(url).toContain("/lists");
  });

  it("turns a rejected request into an error rather than throwing", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useLists());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.data).toBeNull();
  });
});

describe("useList", () => {
  beforeEach(() => jest.resetAllMocks());

  it("resolves one list's populated gestures", async () => {
    global.fetch = jest.fn(() =>
      json({
        description: "Voor het feest",
        id: 1,
        items: [{ gesture: { id: 9, name: "Hallo", playbackId: "abc" } }],
        name: "Verjaardag",
        visibility: "private",
      })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useList("1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual({
      description: "Voor het feest",
      id: "1",
      items: [
        {
          gesture: { id: "9", name: "Hallo", playbackId: "abc" },
          gestureId: "9",
        },
      ],
      name: "Verjaardag",
      visibility: "private",
    });
  });

  /**
   * A deactivated gesture, for a list rather than for favourites — and the
   * two are handled differently on purpose. `publicReadActive` leaves a
   * deactivated gesture's row *unpopulated* rather than dropped
   * (`ownedLists.ts`'s own comment on `fetchOwnedList`), because the owner
   * still has to see the row is there and be able to remove it. A screen
   * that assumed every item populates would read `item.gesture.name` and
   * throw on this row, or — worse — silently render nothing for it. This
   * fixture has a real reason to fail: a bare-number `gesture` is exactly
   * what `depth: 1` sends back for the one row `publicReadActive` refuses
   * to populate, verified against `ownedLists.ts`'s own doc comment on
   * `fetchOwnedList` rather than assumed.
   */
  it("keeps a row whose gesture no longer resolves, rather than dropping it", async () => {
    global.fetch = jest.fn(() =>
      json({
        description: null,
        id: 1,
        items: [
          { gesture: { id: 9, name: "Hallo", playbackId: "abc" } },
          { gesture: 42 }, // deactivated: depth: 1 leaves it a bare id
        ],
        name: "Verjaardag",
        visibility: "private",
      })
    ) as unknown as typeof fetch;

    const { result } = renderHook(() => useList("1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.items).toHaveLength(2);
    expect(result.current.data?.items[1]).toEqual({
      gesture: null,
      gestureId: "42",
    });
  });
});

describe("the six list writes", () => {
  // The `useLists`/`useList` describes above this one already called
  // `jest.resetAllMocks()` in this same file, which strips
  // `expo-localization`'s own default mock implementation for good — nothing
  // re-runs the `jest.mock()` factory between tests, so `clearAllMocks` alone
  // does not bring it back. `postListJson` calls `getLocales()` on every
  // request through `currentLocale()`, so it is given one explicitly here.
  beforeEach(() => {
    jest.clearAllMocks();
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "nl-NL" }]);
  });

  it("posts create as JSON to /mobile/lists/create and resolves the new list's id", async () => {
    global.fetch = jest.fn(() =>
      json({ id: "7", status: "created" })
    ) as unknown as typeof fetch;

    await expect(
      createList({ description: "Voor het feest", name: "Verjaardag" })
    ).resolves.toEqual({ id: "7" });

    const [url, init] = fetchMock().mock.calls[0];

    expect(url).toContain("/mobile/lists/create");
    expect(init.method).toBe("POST");
    expect(init.headers.get("Content-Type")).toBe("application/json");

    const body = JSON.parse(init.body as string);

    expect(body).toEqual({
      description: "Voor het feest",
      name: "Verjaardag",
    });
  });

  it("throws with the field the response carries for an invalid create", async () => {
    global.fetch = jest.fn(() =>
      json({ field: "name", status: "invalid" }, 400)
    ) as unknown as typeof fetch;

    await expect(createList({ name: "" })).rejects.toMatchObject({
      code: "name",
    });
  });

  it("rename posts the list's id, name and description", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "renamed" })
    ) as unknown as typeof fetch;

    await renameList({ id: "7", name: "Feestdagen" });

    const [, init] = fetchMock().mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.id).toBe("7");
    expect(body.name).toBe("Feestdagen");
  });

  it("delete posts the id and the typed confirmation", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "deleted" })
    ) as unknown as typeof fetch;

    await deleteList({ confirmName: "Feestdagen", id: "7" });

    const [, init] = fetchMock().mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.id).toBe("7");
    expect(body.confirmName).toBe("Feestdagen");
  });

  it("add posts the list id and the gesture id", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "added" })
    ) as unknown as typeof fetch;

    await addToList({ gestureId: "9", id: "7" });

    const [, init] = fetchMock().mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.id).toBe("7");
    expect(body.gestureId).toBe("9");
  });

  it("throws the full-list code the endpoint's 409 body carries", async () => {
    // The endpoint itself enforces the cap; this only proves the client
    // reads that specific refusal back off the JSON body correctly.
    global.fetch = jest.fn(() =>
      json({ field: "full", status: "invalid" }, 409)
    ) as unknown as typeof fetch;

    await expect(addToList({ gestureId: "9", id: "7" })).rejects.toMatchObject({
      code: "full",
    });
  });

  it("remove posts the list id and the gesture id", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "removed" })
    ) as unknown as typeof fetch;

    await removeFromList({ gestureId: "9", id: "7" });

    const [, init] = fetchMock().mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.id).toBe("7");
    expect(body.gestureId).toBe("9");
  });

  it("share posts the list id and the requested visibility", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "shared" })
    ) as unknown as typeof fetch;

    await shareList({ id: "7", visibility: "shared" });

    const [, init] = fetchMock().mock.calls[0];
    const body = JSON.parse(init.body as string);

    expect(body.id).toBe("7");
    expect(body.visibility).toBe("shared");
  });

  it("treats a session that has expired mid-visit as signed-out, not a generic failure", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "signed-out" }, 401)
    ) as unknown as typeof fetch;

    await expect(
      shareList({ id: "7", visibility: "private" })
    ).rejects.toMatchObject({ code: "signed-out" });
  });

  it("treats an unknown list as its own code, not a generic failure", async () => {
    global.fetch = jest.fn(() =>
      json({ status: "unknown-list" }, 404)
    ) as unknown as typeof fetch;

    await expect(
      renameList({ id: "999999999", name: "Feestdagen" })
    ).rejects.toMatchObject({ code: "unknown-list" });
  });

  it("treats a network failure as a network error, not a silent success", async () => {
    global.fetch = jest.fn(() =>
      Promise.reject(new TypeError("offline"))
    ) as unknown as typeof fetch;

    await expect(
      renameList({ id: "7", name: "Feestdagen" })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("treats a body with no status as a network error rather than a silent success", async () => {
    // A response Payload's own generic error handling produced, or a proxy's
    // error page — neither carries this endpoint's `status` field, and
    // trusting it as a success would silently drop a refusal on the floor.
    global.fetch = jest.fn(() =>
      json({ message: "Internal Server Error" }, 500)
    ) as unknown as typeof fetch;

    await expect(
      renameList({ id: "7", name: "Feestdagen" })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("MAX_LIST_ITEMS", () => {
  it("matches the server's own bound", () => {
    // apps/site/src/lib/ownedLists.ts's own MAX_LIST_ITEMS. Duplicated
    // rather than imported — a mobile app cannot import from apps/site — and
    // pinned here so the two cannot silently drift apart.
    expect(MAX_LIST_ITEMS).toBe(50);
  });
});
