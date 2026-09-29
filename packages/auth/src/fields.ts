/**
 * Client-safe auth definitions shared by the server config and the web and
 * Expo clients. This module must never import `./server`, `./env`,
 * `./session` or anything that references Workers types
 * (`test/client-entries.test.ts` and `tsconfig.client.json` guard that).
 */
import { LOCALES } from "@smog/config/constants";
import { z } from "zod";

export type Role = "user" | "admin";

/**
 * Our columns on Better Auth's `user` (spec §5.1): `locale` is set by the
 * client (validated `nl|en|fr`), `legacyId` only by the migration.
 */
export const USER_ADDITIONAL_FIELDS = {
  legacyId: { input: false, required: false, type: "string" },
  locale: {
    input: true,
    required: false,
    type: "string",
    validator: { input: z.enum(LOCALES).nullish() },
  },
} as const;
