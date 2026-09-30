import { describe, expect, test } from "bun:test";
import { analyticsEventSchema, relayBodySchema } from "./schema";

const GESTURE_ID = "3f0c9a52-8d7e-4b1a-9c3e-0d9a1b2c3d4e";

describe("analyticsEventSchema", () => {
  test("accepts every event of the taxonomy", () => {
    const events = [
      {
        name: "gesture_viewed",
        properties: { gesture_id: GESTURE_ID, source: "search_results" },
      },
      {
        name: "gesture_collection_changed",
        properties: {
          action: "added",
          collection: "favorites",
          gesture_id: GESTURE_ID,
          source: "gesture_detail",
        },
      },
      {
        name: "search_performed",
        properties: {
          category_count: 2,
          has_results: true,
          query_length: 5,
          result_count: 12,
          source: "filter_change",
        },
      },
      { name: "video_playback_completed", properties: { gesture_id: "abc" } },
      { name: "screen_view", properties: { path: "/lists/$token" } },
      { name: "sign_in_completed", properties: { method: "passkey" } },
      { name: "guest_data_imported", properties: { favorites: 3, lists: 1 } },
      {
        name: "sponsorship_checkout_started",
        properties: { gesture_count: 4, has_logo: false },
      },
    ];
    for (const event of events) {
      expect(analyticsEventSchema.safeParse(event).success).toBe(true);
    }
  });

  test("rejects unknown events", () => {
    const result = analyticsEventSchema.safeParse({
      name: "page_scrolled",
      properties: {},
    });
    expect(result.success).toBe(false);
  });

  test("rejects free text: extra properties and non-enum values", () => {
    const extra = analyticsEventSchema.safeParse({
      name: "search_performed",
      properties: {
        category_count: 0,
        has_results: false,
        query: "hallo",
        query_length: 5,
        result_count: 0,
        source: "submit",
      },
    });
    expect(extra.success).toBe(false);
    const freeSource = analyticsEventSchema.safeParse({
      name: "gesture_viewed",
      properties: { gesture_id: GESTURE_ID, source: "my own words" },
    });
    expect(freeSource.success).toBe(false);
  });

  test("an id is an id, not a sentence or an email", () => {
    for (const gesture_id of ["hello world", "a@b.be", "", "x".repeat(65)]) {
      const result = analyticsEventSchema.safeParse({
        name: "video_playback_completed",
        properties: { gesture_id },
      });
      expect(result.success).toBe(false);
    }
  });

  test("a screen path has no query string, fragment or spaces", () => {
    for (const path of ["/search?q=hallo", "/a#b", "/a b", "lists", ""]) {
      const result = analyticsEventSchema.safeParse({
        name: "screen_view",
        properties: { path },
      });
      expect(result.success).toBe(false);
    }
  });

  test("counts are non-negative integers", () => {
    const result = analyticsEventSchema.safeParse({
      name: "guest_data_imported",
      properties: { favorites: -1, lists: 1.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe("relayBodySchema", () => {
  test("accepts a track with the platform and an optional profile id", () => {
    const result = relayBodySchema.safeParse({
      payload: {
        name: "gesture_viewed",
        profileId: "u5Hx2e0Qm3kLx9TzA1bC7dEfGhIjKlMn",
        properties: {
          gesture_id: GESTURE_ID,
          platform: "web",
          source: "direct",
        },
      },
      type: "track",
    });
    expect(result.success).toBe(true);
  });

  test("a track needs the platform", () => {
    const result = relayBodySchema.safeParse({
      payload: {
        name: "gesture_viewed",
        properties: { gesture_id: GESTURE_ID, source: "direct" },
      },
      type: "track",
    });
    expect(result.success).toBe(false);
  });

  test("identify carries the user id only: no email or name", () => {
    const ok = relayBodySchema.safeParse({
      payload: {
        profileId: "user-1",
        properties: { auth_mode: "authenticated", platform: "web" },
      },
      type: "identify",
    });
    expect(ok.success).toBe(true);
    const withEmail = relayBodySchema.safeParse({
      payload: {
        email: "a@smog.test",
        profileId: "user-1",
        properties: { auth_mode: "authenticated", platform: "web" },
      },
      type: "identify",
    });
    expect(withEmail.success).toBe(false);
  });

  test("rejects other OpenPanel types (increment, alias, replay)", () => {
    const result = relayBodySchema.safeParse({
      payload: { profileId: "user-1", property: "x" },
      type: "increment",
    });
    expect(result.success).toBe(false);
  });
});
