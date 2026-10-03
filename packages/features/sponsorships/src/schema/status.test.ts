import { describe, expect, test } from "bun:test";
import { SPONSORSHIP_STATUSES } from "@smog/db/enums";
import { resources } from "@smog/i18n";
import {
  INVALID_STATE_REASONS,
  SPONSORSHIP_STATUS_LABEL_KEYS,
  SPONSORSHIP_STATUS_TONES,
} from "./index";

function lookup(locale: keyof typeof resources, key: string): unknown {
  let node: unknown = resources[locale].translation;
  for (const part of key.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return node;
}

describe("status presentation (ruling 15)", () => {
  test("every status has a label in every locale and a tone", () => {
    for (const status of SPONSORSHIP_STATUSES) {
      const key = SPONSORSHIP_STATUS_LABEL_KEYS[status];
      for (const locale of ["nl", "en", "fr"] as const) {
        expect(typeof lookup(locale, key)).toBe("string");
      }
      expect(SPONSORSHIP_STATUS_TONES[status]).toBeDefined();
    }
  });

  test("the tones follow the ruling", () => {
    expect(SPONSORSHIP_STATUS_TONES).toEqual({
      awaiting_payment: "primary",
      cancelled: "neutral",
      changes_requested: "accent",
      expired: "neutral",
      expiring: "warning",
      in_review: "warning",
      live: "success",
      rejected: "danger",
      render_failed: "danger",
      rendering: "neutral",
    });
  });

  test("every INVALID_STATE reason has its copy", () => {
    for (const reason of INVALID_STATE_REASONS) {
      for (const locale of ["nl", "en", "fr"] as const) {
        expect(typeof lookup(locale, `sponsorship.errors.${reason}`)).toBe(
          "string"
        );
      }
    }
  });
});
