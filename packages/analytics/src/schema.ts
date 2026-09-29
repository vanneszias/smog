import { z } from "zod";

/**
 * The analytics taxonomy (spec §12), the one source for the apps, the
 * relay and the tests. The old events and properties are kept (analysis 05
 * §5); `sign_in_completed`, `guest_data_imported` and
 * `sponsorship_checkout_started` are new.
 *
 * No free text ever: every property is an enum, a boolean, a count, an id
 * or a route path, and every object is strict, so an extra key (a search
 * query, an email, a name) fails validation on the client and the relay.
 */

export const PLATFORMS = ["web", "native"] as const;
export type AnalyticsPlatform = (typeof PLATFORMS)[number];

export const GESTURE_VIEW_SOURCES = [
  "direct",
  "favorites",
  "related_gestures",
  "search_results",
] as const;
export const COLLECTION_ACTIONS = ["added", "removed"] as const;
export const COLLECTIONS = ["favorites", "list"] as const;
export const COLLECTION_SOURCES = [
  "gesture_detail",
  "gesture_list",
  "search_results",
] as const;
export const SEARCH_SOURCES = [
  "filter_change",
  "recent_search",
  "submit",
] as const;
/** The sign-in methods of `@smog/auth` (`AuthMethod`). */
export const SIGN_IN_METHODS = [
  "password",
  "emailCode",
  "magicLink",
  "google",
  "apple",
  "passkey",
] as const;

export type GestureViewSource = (typeof GESTURE_VIEW_SOURCES)[number];
export type CollectionSource = (typeof COLLECTION_SOURCES)[number];
export type SearchSource = (typeof SEARCH_SOURCES)[number];
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
/**
 * A route template or path: no query string, fragment or spaces. The apps
 * send the route template (`/lists/$token`), never the filled-in path.
 */
const PATH = /^\/[A-Za-z0-9\-_.~+/$[\]]*$/;

const id = z.string().regex(ID);
const count = z.number().int().nonnegative();

/** The properties of every event, keyed by its name. */
const EVENT_PROPERTIES = {
  gesture_collection_changed: {
    action: z.enum(COLLECTION_ACTIONS),
    collection: z.enum(COLLECTIONS),
    gesture_id: id,
    source: z.enum(COLLECTION_SOURCES),
  },
  gesture_viewed: {
    gesture_id: id,
    source: z.enum(GESTURE_VIEW_SOURCES),
  },
  guest_data_imported: { favorites: count, lists: count },
  screen_view: { path: z.string().max(200).regex(PATH) },
  search_performed: {
    category_count: count,
    has_results: z.boolean(),
    query_length: count,
    result_count: count,
    source: z.enum(SEARCH_SOURCES),
  },
  sign_in_completed: { method: z.enum(SIGN_IN_METHODS) },
  sponsorship_checkout_started: { gesture_count: count, has_logo: z.boolean() },
  video_playback_completed: { gesture_id: id },
} satisfies Record<string, z.ZodRawShape>;

type EventName = keyof typeof EVENT_PROPERTIES;

function eventSchema<
  N extends EventName,
  P extends z.ZodRawShape,
  T extends z.ZodRawShape,
>(name: N, extraProperties: P, extraTop: T) {
  return z.strictObject({
    name: z.literal(name),
    properties: z.strictObject({
      ...EVENT_PROPERTIES[name],
      ...extraProperties,
    }),
    ...extraTop,
  });
}

/** Every event, with extra properties and top-level keys on each. */
function eventsSchema<P extends z.ZodRawShape, T extends z.ZodRawShape>(
  properties: P,
  top: T
) {
  return z.discriminatedUnion("name", [
    eventSchema("gesture_collection_changed", properties, top),
    eventSchema("gesture_viewed", properties, top),
    eventSchema("guest_data_imported", properties, top),
    eventSchema("screen_view", properties, top),
    eventSchema("search_performed", properties, top),
    eventSchema("sign_in_completed", properties, top),
    eventSchema("sponsorship_checkout_started", properties, top),
    eventSchema("video_playback_completed", properties, top),
  ]);
}

/** An event as the apps send it (`analytics.track(event)`). */
export const analyticsEventSchema = eventsSchema({}, {});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsEventName = AnalyticsEvent["name"];
/** The properties of one event, by name. */
export type AnalyticsEventProperties<N extends AnalyticsEventName> = Extract<
  AnalyticsEvent,
  { name: N }
>["properties"];

const platform = z.enum(PLATFORMS);
/** A signed-in user id (never an email or a name, spec §12). */
const profileId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

/** An event with the `platform` the client adds. */
export const trackedEventSchema = eventsSchema({ platform }, {});
export type TrackedEvent = z.infer<typeof trackedEventSchema>;

/**
 * The body of `POST /api/analytics`: an OpenPanel `/track` payload, limited
 * to `track` (the taxonomy) and `identify` (the user id and two enums).
 */
export const relayBodySchema = z.discriminatedUnion("type", [
  z.strictObject({
    payload: eventsSchema({ platform }, { profileId: profileId.optional() }),
    type: z.literal("track"),
  }),
  z.strictObject({
    payload: z.strictObject({
      profileId,
      properties: z.strictObject({
        auth_mode: z.literal("authenticated"),
        platform,
      }),
    }),
    type: z.literal("identify"),
  }),
]);
export type RelayBody = z.infer<typeof relayBodySchema>;
